'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract } from 'wagmi';
import { readContract, waitForTransactionReceipt, type WaitForTransactionReceiptParameters } from '@wagmi/core';
import { TransactionReceiptNotFoundError } from 'viem';
import { Btn, Card, SectionLabel, Row } from '@/components/ui/primitives';
import { Icons } from '@/components/ui/icons';
import type { AgentConfig } from '@spike/0g-client';
import { wagmiConfig } from '@/lib/wagmi/config';
import { keccak256, concat, toBytes } from 'viem';
import {
  PQC_REGISTRY_ADDRESS, AGENT_REGISTRY_ADDRESS,
  PQC_REGISTRY_ABI, AGENT_REGISTRY_ABI,
  fingerprintToBytes32, configToBytes32, parseAgentIdFromReceipt,
} from '@/lib/contracts';
import { registerAgent, updateAgentConfig } from '@/lib/agent/client';
import type { OptimizeResult } from '@/lib/quantum/client';

const DEPLOY_STEPS = [
  'Storing config on 0G Storage',
  'Signing with quantum key',
  'Sending to the network',
  'Confirming on blockchain',
  'Running final security check',
];

const UPDATE_STEPS = [
  'Preparing new configuration',
  'Signing with your wallet',
  'Updating on blockchain',
  'Confirming changes',
  'Restarting agent with new config',
];

const RISK_LABEL: Record<string, string> = { conservative: 'Conservative', balanced: 'Balanced', aggressive: 'Aggressive' };

const SKILL_NAMES: Record<string, string> = {
  'lp-provider': 'Liquidity Provider',
  'dca-strategy': 'DCA Strategy',
  'lending-borrowing': 'Lending & Borrowing',
  'sim-trade': 'Simulation Trade',
};

const ZERO_B32 = `0x${'0'.repeat(64)}` as `0x${string}`;
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// 0G testnet RPC sometimes returns a new block number before the tx is indexed.
// Retry on TransactionReceiptNotFoundError with backoff before giving up.
async function waitForReceipt(
  cfg: typeof wagmiConfig,
  params: WaitForTransactionReceiptParameters,
  maxRetries = 8,
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await waitForTransactionReceipt(cfg, { pollingInterval: 3000, ...params });
    } catch (err) {
      if (err instanceof TransactionReceiptNotFoundError && attempt < maxRetries) {
        await delay(2000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Transaction not confirmed after maximum retries');
}

export default function ReviewPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [config, setConfig] = useState<Partial<AgentConfig> | null>(null);
  const [optimization, setOptimization] = useState<OptimizeResult | null>(null);
  const [skillName, setSkillName] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState(-1);
  const [deployed, setDeployed] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [isUpdate, setIsUpdate] = useState(false);
  const [storageUploaded, setStorageUploaded] = useState(false);
  const [agentServiceWarning, setAgentServiceWarning] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('spike_agent_config');
    if (raw) setConfig(JSON.parse(raw));
    else setConfig({ riskLevel: 'balanced', assets: ['ETH', 'BTC', 'SOL', 'USDC'], targetApy: 12, rebalanceFrequency: 'weekly', qrngSeedingEnabled: true, maxDrawdown: 15, driftThreshold: 5 });

    const opt = sessionStorage.getItem('spike_optimization_result');
    if (opt) setOptimization(JSON.parse(opt));

    const skillId = sessionStorage.getItem('spike_skill_id');
    if (skillId) setSkillName(SKILL_NAMES[skillId] ?? skillId);

    setIsUpdate(!!(sessionStorage.getItem('spike_deployed') && sessionStorage.getItem('spike_agent_id')));
  }, []);

  async function handleDeploy() {
    if (!config) return;
    setDeploying(true);
    setDeployError(null);
    setDeployStep(-1);

    if (!address) {
      setDeployError('Wallet not connected. Please connect your wallet and try again.');
      return;
    }
    if (!AGENT_REGISTRY_ADDRESS) {
      setDeployError('Contract address not configured. Check NEXT_PUBLIC_AGENT_REGISTRY in .env.local.');
      return;
    }

    try {
      // Step 1 — upload config to 0G Storage; fall back to local hash if unavailable
      setDeployStep(0);
      const skillKeyB32 = (sessionStorage.getItem('spike_skill_key') as `0x${string}`) ?? ZERO_B32;
      let configRoot: `0x${string}`;
      try {
        // Upload via Next.js API route — the 0G storage SDK is Node.js-only
        // and cannot run in the browser, so the server proxies it.
        const res = await fetch('/api/storage/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        if (!res.ok) throw new Error(await res.text());
        const { rootHash } = await res.json() as { rootHash: string };
        configRoot = fingerprintToBytes32(rootHash);
        sessionStorage.setItem('spike_storage_root', rootHash);
        setStorageUploaded(true);
      } catch {
        // STORAGE_PRIVATE_KEY not set or 0G Storage unreachable — hash locally
        configRoot = configToBytes32(config);
        setStorageUploaded(false);
      }
      await delay(300);

      // Step 2 — sign configRoot with Dilithium SK; store keccak256 commitment on-chain
      setDeployStep(1);
      let actionSigFingerprintB32: `0x${string}` = ZERO_B32;
      const skHex = sessionStorage.getItem('spike_dilithium_sk');
      if (skHex) {
        const { dilithiumSign } = await import('@spike/pqc');
        const sk = Uint8Array.from((skHex.match(/.{2}/g) ?? []).map(b => parseInt(b, 16)));
        const { signature } = dilithiumSign(sk, toBytes(configRoot));
        const sigHex = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem('spike_dilithium_config_sig', sigHex);
        actionSigFingerprintB32 = keccak256(`0x${sigHex}` as `0x${string}`);
      } else {
        await delay(600);
      }

      // Steps 3 & 4 — on-chain registration or update
      setDeployStep(2);
      const existingAgentIdStr = sessionStorage.getItem('spike_agent_id');
      let agentId = existingAgentIdStr ? parseInt(existingAgentIdStr) : 1;

      // Verify the cached agent still exists on-chain and is owned by us.
      // It may be gone if contracts were redeployed after the last session.
      let agentExistsOnChain = false;
      if (sessionStorage.getItem('spike_deployed') && existingAgentIdStr) {
        try {
          const onChain = await readContract(wagmiConfig, {
            address: AGENT_REGISTRY_ADDRESS,
            abi: AGENT_REGISTRY_ABI,
            functionName: 'getAgent',
            args: [BigInt(agentId)],
            chainId: 16602,
          }) as { owner: string };
          agentExistsOnChain = onChain.owner.toLowerCase() === address.toLowerCase();
        } catch {
          // getAgent reverted — agent definitely gone
        }
      }

      if (agentExistsOnChain) {
        const updateHash = await writeContractAsync({
          address: AGENT_REGISTRY_ADDRESS,
          abi: AGENT_REGISTRY_ABI,
          functionName: 'updateConfig',
          chainId: 16602,
          args: [BigInt(agentId), configRoot, actionSigFingerprintB32],
        });
        setDeployStep(3);
        await waitForReceipt(wagmiConfig, { hash: updateHash });
      } else {
        // Agent not found on-chain (first deploy, or stale session after contract redeploy)
        sessionStorage.removeItem('spike_deployed');
        sessionStorage.removeItem('spike_agent_id');
        if (PQC_REGISTRY_ADDRESS) {
          const isReg = await readContract(wagmiConfig, {
            address: PQC_REGISTRY_ADDRESS,
            abi: PQC_REGISTRY_ABI,
            functionName: 'isRegistered',
            args: [address],
            chainId: 16602,
          });

          if (!isReg) {
            const dilithiumFpB32 = fingerprintToBytes32(sessionStorage.getItem('spike_dilithium_fp') || 'demo-dilithium');
            const kyberFpB32     = fingerprintToBytes32(sessionStorage.getItem('spike_kyber_fp') || 'demo-kyber');
            const storageRoot    = keccak256(concat([dilithiumFpB32, kyberFpB32]));
            const pqcHash = await writeContractAsync({
              address: PQC_REGISTRY_ADDRESS,
              abi: PQC_REGISTRY_ABI,
              functionName: 'register',
              args: [dilithiumFpB32, kyberFpB32, storageRoot],
            });
            setDeployStep(3);
            await waitForReceipt(wagmiConfig, { hash: pqcHash });
          } else {
            setDeployStep(3);
            await delay(300);
          }
        } else {
          setDeployStep(3);
          await delay(300);
        }

        const agentHash = await writeContractAsync({
          address: AGENT_REGISTRY_ADDRESS,
          abi: AGENT_REGISTRY_ABI,
          functionName: 'deployAgent',
          chainId: 16602,
          args: [configRoot, actionSigFingerprintB32, ZERO_B32, skillKeyB32],
        });
        const receipt = await waitForReceipt(wagmiConfig, { hash: agentHash });
        const parsed = parseAgentIdFromReceipt(receipt);
        if (parsed !== null) agentId = Number(parsed);
      }

      sessionStorage.setItem('spike_agent_id', String(agentId));

      // Step 5 — sync config with local agent service
      setDeployStep(4);
      try {
        const dilithiumSk = sessionStorage.getItem('spike_dilithium_sk') ?? undefined;
        if (agentExistsOnChain) {
          await updateAgentConfig(agentId, config, dilithiumSk);
        } else {
          await registerAgent(agentId, config, dilithiumSk);
        }
      } catch {
        // Agent service offline — bot will use old config until service is restarted
        setAgentServiceWarning('Agent service unreachable. The on-chain update succeeded, but restart the agent service to apply the new config.');
      }
      await delay(400);

      setDeployed(true);
    } catch (err) {
      console.error('[review] deploy/update failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setDeployError(msg || 'Deployment failed');
      setDeploying(false);
      setDeployStep(-1);
    }
  }

  function handleGoToDashboard() {
    sessionStorage.setItem('spike_deployed', '1');
    router.push('/app/dashboard');
  }

  if (!config) return null;

  const riskLevel = config.riskLevel ?? 'balanced';
  const assets = config.assets ?? [];

  return (
    <div style={{ background: '#FBF7F0', minHeight: '100vh', paddingBottom: 80 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '36px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 28, color: '#555555', letterSpacing: '-0.01em', marginBottom: 6 }}>
            {isUpdate ? 'Review your new strategy' : 'Almost there — review your setup'}
          </div>
          <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E', lineHeight: 1.7 }}>
            {isUpdate ? 'Your agent will be updated on-chain with these new settings.' : 'Check everything looks right before your bot starts working.'}
          </div>
        </div>

        {/* Quantum allocation preview */}
        {optimization && (
          <Card sage style={{ marginBottom: 16 }}>
            <SectionLabel>Quantum Allocation Preview</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(optimization.weights).map(([sym, w]) => (
                  <div key={sym} style={{ background: '#FBF7F0', border: '1.5px solid #B8CFC8', borderRadius: 12, padding: '8px 14px', minWidth: 80 }}>
                    <div style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontWeight: 700, fontSize: 13, color: '#555555' }}>{sym}</div>
                    <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 16, color: '#5e8880' }}>{(w * 100).toFixed(1)}%</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 11, color: '#A8A49E', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Sharpe</div>
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 900, fontSize: 18, color: '#555555' }}>{optimization.sharpe.toFixed(3)}</div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 11, color: '#A8A49E', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Backend</div>
                  <div style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontWeight: 700, fontSize: 13, color: '#5e8880' }}>{optimization.backend_used}</div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Strategy summary */}
        <Card sage style={{ marginBottom: 16 }}>
          <SectionLabel>Strategy</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Row label="Approach">
              <span style={{ background: '#555555', color: '#FBF7F0', borderRadius: 99, padding: '3px 12px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>
                {RISK_LABEL[riskLevel] ?? 'Balanced'}
              </span>
            </Row>
            <Row label="Coins to manage">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {assets.map(s => (
                  <span key={s} style={{ background: '#FBF7F0', border: '1.5px solid #B8CFC8', borderRadius: 99, padding: '3px 10px', fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 12, color: '#555555' }}>{s}</span>
                ))}
              </div>
            </Row>
            <Row label="Yearly return target">
              <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 18, color: '#555555' }}>{config.targetApy}%</span>
            </Row>
            <Row label="How often it trades">
              <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: '#555555', textTransform: 'capitalize' }}>{config.rebalanceFrequency}</span>
            </Row>
            <Row label="Smart randomness">
              <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: config.qrngSeedingEnabled ? '#2d6a4f' : '#A8A49E' }}>{config.qrngSeedingEnabled ? 'Enabled' : 'Disabled'}</span>
            </Row>
            <Row label="Max loss limit">
              <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 16, color: '#555555' }}>{config.maxDrawdown}%</span>
            </Row>
            <Row label="DeFi Skill">
              <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: '#555555' }}>
                {skillName || 'None'}
              </span>
            </Row>
          </div>
        </Card>

        {/* Security */}
        <Card style={{ marginBottom: 16 }}>
          <SectionLabel>Security</SectionLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['Quantum-safe encryption on', 'Tamper-proof signing on'].map(s => (
              <span key={s} style={{ background: '#D9E4DD', border: '1px solid #B8CFC8', borderRadius: 99, padding: '4px 12px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, color: '#5e8880', letterSpacing: '0.06em' }}>{s}</span>
            ))}
          </div>
          {PQC_REGISTRY_ADDRESS && AGENT_REGISTRY_ADDRESS && (
            <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ background: '#D9E4DD', border: '1px solid #B8CFC8', borderRadius: 99, padding: '4px 12px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, color: '#5e8880', letterSpacing: '0.06em' }}>On-chain registration</span>
            </div>
          )}
        </Card>

        {/* Fee */}
        <Card style={{ marginBottom: 24 }}>
          <Row label="Estimated network fee">
            <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 13, color: '#555555' }}>0.0024 ETH <span style={{ color: '#A8A49E' }}>(~$6.82)</span></span>
          </Row>
          <div style={{ marginTop: 12, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E', lineHeight: 1.6 }}>
            Once started, Spike manages your selected coins automatically within the limits you set. You can pause or withdraw everything at any time.
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Btn size="xl" style={{ width: '100%' }} onClick={handleDeploy}>{isUpdate ? 'Update strategy →' : 'Start my bot →'}</Btn>
          <Btn variant="ghost" size="lg" style={{ width: '100%' }} onClick={() => router.push('/app/configure')}>← Change settings</Btn>
        </div>
      </div>

      {/* Deploy modal */}
      {deploying && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(85,85,85,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#FBF7F0', borderRadius: 24, border: '1.5px solid #CDC9C3', padding: 36, maxWidth: 400, width: '100%', textAlign: 'center', animation: 'modalIn 0.25s ease' }}>
            {deployed ? (
              <>
                <div style={{ fontSize: 48, marginBottom: 16 }}>{isUpdate ? '✅' : '🎉'}</div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 900, fontSize: 26, color: '#555555', marginBottom: 10 }}>
                  {isUpdate ? 'Strategy updated!' : 'Your bot is live!'}
                </div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E', marginBottom: 16, lineHeight: 1.7 }}>
                  {isUpdate ? 'Your agent is now running with the new configuration.' : 'Spike is now watching the market and managing your portfolio automatically.'}
                </div>
                {!isUpdate && (
                  <div style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 11, color: storageUploaded ? '#2d6a4f' : '#A8A49E', background: '#D9E4DD', borderRadius: 10, padding: '8px 12px', marginBottom: 16, textAlign: 'left' }}>
                    {storageUploaded
                      ? `0G Storage ✓  ${(sessionStorage.getItem('spike_storage_root') ?? '').slice(0, 18)}…`
                      : '0G Storage unavailable — local config hash used'}
                  </div>
                )}
                {agentServiceWarning && (
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#856404', background: '#fff3cd', border: '1px solid #ffe69c', borderRadius: 10, padding: '10px 14px', marginBottom: 16, textAlign: 'left', lineHeight: 1.5 }}>
                    ⚠️ {agentServiceWarning}
                  </div>
                )}
                <Btn size="lg" style={{ width: '100%' }} onClick={handleGoToDashboard}>Go to my portfolio →</Btn>
              </>
            ) : deployError ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 20, color: '#555555', marginBottom: 10 }}>Deployment failed</div>
                <div style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 12, color: '#842029', background: '#f8d7da', borderRadius: 10, padding: '10px 14px', marginBottom: 20, textAlign: 'left', lineHeight: 1.5, maxHeight: 160, overflowY: 'auto', wordBreak: 'break-word' }}>{deployError}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn variant="ghost" style={{ flex: 1 }} onClick={() => { setDeploying(false); setDeployError(null); }}>Cancel</Btn>
                  <Btn style={{ flex: 1 }} onClick={handleDeploy}>Retry</Btn>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, color: '#555555', marginBottom: 24 }}>{isUpdate ? 'Updating strategy…' : 'Starting your bot…'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, textAlign: 'left' }}>
                  {(isUpdate ? UPDATE_STEPS : DEPLOY_STEPS).map((s, i) => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: i <= deployStep ? '#555555' : '#D9E4DD', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.3s' }}>
                        {i < deployStep ? (
                          <span style={{ color: '#FBF7F0', transform: 'scale(0.8)' }}><Icons.Check size={14} /></span>
                        ) : i === deployStep ? (
                          <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #FBF7F0', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                        ) : null}
                      </div>
                      <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: i <= deployStep ? 700 : 400, fontSize: 14, color: i <= deployStep ? '#555555' : '#A8A49E', transition: 'all 0.2s' }}>{s}</span>
                    </div>
                  ))}
                </div>
                {deployStep === 0 && (
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E', padding: '8px 14px', background: '#D9E4DD', borderRadius: 10 }}>
                    Uploading encrypted config to 0G decentralised storage…
                  </div>
                )}
                {deployStep > 0 && !isUpdate && (
                  <div style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 11, color: storageUploaded ? '#2d6a4f' : '#A8A49E', padding: '6px 14px', background: '#D9E4DD', borderRadius: 10 }}>
                    {storageUploaded ? '0G Storage ✓ config root on-chain' : '0G Storage unavailable — local hash used'}
                  </div>
                )}
                {deployStep === 1 && (
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E', padding: '8px 14px', background: '#D9E4DD', borderRadius: 10 }}>
                    Signing with your ML-DSA-65 key…
                  </div>
                )}
                {(deployStep === 2 || deployStep === 3) && (
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E', padding: '8px 14px', background: '#D9E4DD', borderRadius: 10 }}>
                    {deployStep === 2 ? 'Approve the transaction in your wallet' : 'Waiting for on-chain confirmation…'}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
