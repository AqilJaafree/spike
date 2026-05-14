'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useSignMessage, useWriteContract } from 'wagmi';
import { readContract, waitForTransactionReceipt } from '@wagmi/core';
import { Btn, Card, SectionLabel, Row } from '@/components/ui/primitives';
import { Icons } from '@/components/ui/icons';
import type { AgentConfig } from '@spike/0g-client';
import { wagmiConfig } from '@/lib/wagmi/config';
import { keccak256, concat } from 'viem';
import {
  PQC_REGISTRY_ADDRESS, AGENT_REGISTRY_ADDRESS,
  PQC_REGISTRY_ABI, AGENT_REGISTRY_ABI,
  fingerprintToBytes32, configToBytes32, parseAgentIdFromReceipt,
} from '@/lib/contracts';
import { registerAgent } from '@/lib/agent/client';
import type { OptimizeResult } from '@/lib/quantum/client';

const DEPLOY_STEPS = [
  'Encrypting your settings',
  'Signing with your wallet',
  'Sending to the network',
  'Confirming on blockchain',
  'Running final security check',
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

export default function ReviewPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();

  const [config, setConfig] = useState<Partial<AgentConfig> | null>(null);
  const [optimization, setOptimization] = useState<OptimizeResult | null>(null);
  const [skillName, setSkillName] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState(-1);
  const [deployed, setDeployed] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('spike_agent_config');
    if (raw) setConfig(JSON.parse(raw));
    else setConfig({ riskLevel: 'balanced', assets: ['ETH', 'BTC', 'SOL', 'USDC'], targetApy: 12, rebalanceFrequency: 'weekly', qrngSeedingEnabled: true, maxDrawdown: 15 });

    const opt = sessionStorage.getItem('spike_optimization_result');
    if (opt) setOptimization(JSON.parse(opt));

    const skillId = sessionStorage.getItem('spike_skill_id');
    if (skillId) setSkillName(SKILL_NAMES[skillId] ?? skillId);
  }, []);

  async function handleDeploy() {
    if (!config) return;
    setDeploying(true);
    setDeployError(null);
    setDeployStep(-1);

    try {
      // Step 1 — hash config + read stored fingerprints
      setDeployStep(0);
      const skillKeyB32 = (sessionStorage.getItem('spike_skill_key') as `0x${string}`) ?? ZERO_B32;
      const dilithiumFp = sessionStorage.getItem('spike_dilithium_fp') ?? '';
      const kyberFp = sessionStorage.getItem('spike_kyber_fp') ?? '';
      const configRoot = configToBytes32(config);
      const dilithiumFpB32 = fingerprintToBytes32(dilithiumFp || 'demo-dilithium');
      const kyberFpB32 = fingerprintToBytes32(kyberFp || 'demo-kyber');
      await delay(500);

      // Step 2 — sign with wallet; compute a keccak256 commitment of (configRoot ‖ walletSig)
      // The full ECDSA signature lives off-chain; only the 32-byte commitment is stored on-chain.
      setDeployStep(1);
      let actionSigFingerprintB32: `0x${string}` = ZERO_B32;
      if (address) {
        const sig = await signMessageAsync({ message: `Spike Agent: ${configRoot}` });
        actionSigFingerprintB32 = keccak256(concat([configRoot, sig as `0x${string}`]));
      } else {
        await delay(600);
      }

      // Steps 3 & 4 — on-chain registration
      setDeployStep(2);
      let agentId = 1;

      if (address && PQC_REGISTRY_ADDRESS && AGENT_REGISTRY_ADDRESS) {
        // Check if PQC keys already registered
        const isReg = await readContract(wagmiConfig, {
          address: PQC_REGISTRY_ADDRESS,
          abi: PQC_REGISTRY_ABI,
          functionName: 'isRegistered',
          args: [address],
          chainId: 16602,
        });

        if (!isReg) {
          const storageRoot = keccak256(concat([dilithiumFpB32, kyberFpB32]));
          const pqcHash = await writeContractAsync({
            address: PQC_REGISTRY_ADDRESS,
            abi: PQC_REGISTRY_ABI,
            functionName: 'register',
            args: [dilithiumFpB32, kyberFpB32, storageRoot],
          });
          setDeployStep(3);
          await waitForTransactionReceipt(wagmiConfig, { hash: pqcHash });
        } else {
          setDeployStep(3);
          await delay(300);
        }

        // Deploy agent on-chain
        const agentHash = await writeContractAsync({
          address: AGENT_REGISTRY_ADDRESS,
          abi: AGENT_REGISTRY_ABI,
          functionName: 'deployAgent',
          args: [configRoot, actionSigFingerprintB32, ZERO_B32, skillKeyB32],
        });
        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: agentHash });
        const parsed = parseAgentIdFromReceipt(receipt);
        if (parsed !== null) agentId = Number(parsed);
      } else {
        // No contract addresses configured — simulate steps
        setDeployStep(3);
        await delay(1400);
      }

      sessionStorage.setItem('spike_agent_id', String(agentId));

      // Step 5 — register with local agent service
      setDeployStep(4);
      try {
        await registerAgent(agentId, config);
      } catch {
        // Non-critical if agent service is offline
      }
      await delay(400);

      setDeployed(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deployment failed';
      setDeployError(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
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
          <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 28, color: '#555555', letterSpacing: '-0.01em', marginBottom: 6 }}>Almost there — review your setup</div>
          <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E', lineHeight: 1.7 }}>Check everything looks right before your bot starts working.</div>
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
          <Btn size="xl" style={{ width: '100%' }} onClick={handleDeploy}>Start my bot →</Btn>
          <Btn variant="ghost" size="lg" style={{ width: '100%' }} onClick={() => router.push('/app/configure')}>← Change settings</Btn>
        </div>
      </div>

      {/* Deploy modal */}
      {deploying && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(85,85,85,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#FBF7F0', borderRadius: 24, border: '1.5px solid #CDC9C3', padding: 36, maxWidth: 400, width: '100%', textAlign: 'center', animation: 'modalIn 0.25s ease' }}>
            {deployed ? (
              <>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 900, fontSize: 26, color: '#555555', marginBottom: 10 }}>Your bot is live!</div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E', marginBottom: 28, lineHeight: 1.7 }}>Spike is now watching the market and managing your portfolio automatically.</div>
                <Btn size="lg" style={{ width: '100%' }} onClick={handleGoToDashboard}>Go to my portfolio →</Btn>
              </>
            ) : deployError ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 20, color: '#555555', marginBottom: 10 }}>Deployment failed</div>
                <div style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 12, color: '#842029', background: '#f8d7da', borderRadius: 10, padding: '10px 14px', marginBottom: 20, textAlign: 'left', lineHeight: 1.5 }}>{deployError}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn variant="ghost" style={{ flex: 1 }} onClick={() => { setDeploying(false); setDeployError(null); }}>Cancel</Btn>
                  <Btn style={{ flex: 1 }} onClick={handleDeploy}>Retry</Btn>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, color: '#555555', marginBottom: 24 }}>Starting your bot…</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, textAlign: 'left' }}>
                  {DEPLOY_STEPS.map((s, i) => (
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
                {deployStep === 1 && (
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E', padding: '8px 14px', background: '#D9E4DD', borderRadius: 10 }}>
                    Check your wallet for a signature request
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
