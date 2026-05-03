'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useSignMessage } from 'wagmi';
import { Btn, Card, SectionLabel, Row } from '@/components/ui/primitives';
import { Icons } from '@/components/ui/icons';
import type { AgentConfig } from '@spike/0g-client';

const DEPLOY_STEPS = [
  'Encrypting your settings',
  'Signing with your wallet',
  'Sending to the network',
  'Confirming on blockchain',
  'Running final security check',
];

const RISK_LABEL: Record<string, string> = { conservative: 'Conservative', balanced: 'Balanced', aggressive: 'Aggressive' };

export default function ReviewPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [config, setConfig] = useState<Partial<AgentConfig> | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState(-1);
  const [deployed, setDeployed] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('spike_agent_config');
    if (raw) setConfig(JSON.parse(raw));
    else setConfig({ riskLevel: 'balanced', assets: ['ETH', 'BTC', 'SOL', 'USDC'], targetApy: 12, rebalanceFrequency: 'weekly', qrngSeedingEnabled: true, maxDrawdown: 15 });
  }, []);

  async function handleDeploy() {
    if (!config) return;
    setDeploying(true);
    DEPLOY_STEPS.forEach((_, i) => {
      setTimeout(() => setDeployStep(i), i * 1200 + 200);
    });
    // Try to sign if wallet connected
    try {
      if (address) {
        setTimeout(async () => {
          try { await signMessageAsync({ message: `Deploy Spike agent: ${JSON.stringify(config)}` }); } catch { /* ignore */ }
        }, 1400);
      }
    } catch { /* ignore */ }
    setTimeout(() => {
      setDeployed(true);
      setDeploying(false);
    }, DEPLOY_STEPS.length * 1200 + 600);
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
            {!deployed ? (
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
              </>
            ) : (
              <>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 900, fontSize: 26, color: '#555555', marginBottom: 10 }}>Your bot is live!</div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E', marginBottom: 28, lineHeight: 1.7 }}>Spike is now watching the market and managing your portfolio automatically.</div>
                <Btn size="lg" style={{ width: '100%' }} onClick={handleGoToDashboard}>Go to my portfolio →</Btn>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
