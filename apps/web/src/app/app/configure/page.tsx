'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Btn, Card, Toggle } from '@/components/ui/primitives';
import { Icons } from '@/components/ui/icons';
import type { AgentConfig } from '@spike/0g-client';
import { optimizePortfolio } from '@/lib/quantum/client';

const RISKS = [
  { id: 'conservative', label: 'Conservative', desc: 'Lower volatility, priority on capital preservation', icon: '🛡' },
  { id: 'balanced', label: 'Balanced', desc: 'Moderate risk-adjusted returns, diversified across assets', icon: '⚖' },
  { id: 'aggressive', label: 'Aggressive', desc: 'High yield targets, accepts larger drawdowns', icon: '⚡' },
] as const;

const ALL_ASSETS = [
  { sym: 'ETH', name: 'Ethereum', price: '$2,841.20' },
  { sym: 'BTC', name: 'Bitcoin', price: '$62,305.00' },
  { sym: 'SOL', name: 'Solana', price: '$142.88' },
  { sym: 'USDC', name: 'USD Coin', price: '$1.00' },
  { sym: 'ARB', name: 'Arbitrum', price: '$0.88' },
  { sym: 'OP', name: 'Optimism', price: '$1.92' },
  { sym: 'LINK', name: 'Chainlink', price: '$13.40' },
  { sym: 'AAVE', name: 'Aave', price: '$84.20' },
];

const FREQS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'on-drift', label: 'On Drift' },
] as const;

function RiskCard({ r, selected, onSelect }: { r: typeof RISKS[number]; selected: boolean; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        background: selected ? '#D9E4DD' : hov ? '#f5f0e8' : '#FBF7F0',
        border: `${selected ? 2 : 1.5}px solid ${selected ? '#555555' : hov ? '#B8CFC8' : '#CDC9C3'}`,
        borderRadius: 16, padding: '18px 20px', cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.15s', width: '100%',
      }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: selected ? '#555555' : '#D9E4DD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, transition: 'background 0.2s' }}>{r.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 16, color: '#555555', marginBottom: 2 }}>{r.label}</div>
        <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#A8A49E' }}>{r.desc}</div>
      </div>
      {selected && <div style={{ color: '#555555', flexShrink: 0 }}><Icons.Check /></div>}
    </button>
  );
}

function AssetRow({ a, selected, onToggle, last }: { a: typeof ALL_ASSETS[number]; selected: boolean; onToggle: (sym: string) => void; last: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={() => onToggle(a.sym)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 18px', cursor: 'pointer', width: '100%',
        background: hov ? '#EDF3F0' : selected ? '#f7faf9' : '#FBF7F0',
        border: 'none', borderBottom: last ? 'none' : '1px solid #CDC9C3',
        textAlign: 'left', transition: 'background 0.15s',
      }}>
      <div style={{
        width: 22, height: 22, borderRadius: 6,
        border: `2px solid ${selected ? '#555555' : '#CDC9C3'}`,
        background: selected ? '#555555' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'all 0.15s', color: '#FBF7F0',
      }}>
        {selected && <Icons.Check size={12} />}
      </div>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#D9E4DD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 900, fontSize: 11, color: '#5e8880', flexShrink: 0 }}>{a.sym.slice(0, 2)}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: '#555555' }}>{a.sym}</div>
        <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E' }}>{a.name}</div>
      </div>
      <div style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 13, color: '#A8A49E' }}>{a.price}</div>
    </button>
  );
}

export default function ConfigurePage() {
  const router = useRouter();
  const [wizStep, setWizStep] = useState(0);
  const [risk, setRisk] = useState<string | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<string[]>(['ETH', 'BTC']);
  const [apy, setApy] = useState(12);
  const [rebalFreq, setRebalFreq] = useState<'daily' | 'weekly' | 'on-drift'>('weekly');
  const [qrng, setQrng] = useState(true);
  const [maxDrawdown, setMaxDrawdown] = useState(15);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [optimizing, setOptimizing] = useState(false);

  const toggleAsset = (sym: string) => {
    setSelectedAssets(prev =>
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym].slice(0, 10)
    );
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (wizStep === 0 && !risk) e.risk = 'Please select a risk profile.';
    if (wizStep === 1 && selectedAssets.length < 2) e.assets = 'Select at least 2 assets.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = async () => {
    if (!validate()) return;
    if (wizStep < 2) { setWizStep(s => s + 1); return; }

    const config: Partial<AgentConfig> = {
      riskLevel: risk as AgentConfig['riskLevel'],
      assets: selectedAssets,
      targetApy: apy,
      maxDrawdown,
      rebalanceFrequency: rebalFreq,
      qrngSeedingEnabled: qrng,
      driftThreshold: 5,
    };
    sessionStorage.setItem('spike_agent_config', JSON.stringify(config));

    setOptimizing(true);
    try {
      const riskTolerance = risk === 'conservative' ? 0.3 : risk === 'aggressive' ? 0.7 : 0.5;
      const result = await optimizePortfolio(selectedAssets, riskTolerance);
      sessionStorage.setItem('spike_optimization_result', JSON.stringify(result));
    } catch {
      // Non-critical — proceed without quantum result
      sessionStorage.removeItem('spike_optimization_result');
    }
    setOptimizing(false);
    router.push('/app/review');
  };

  const wizStepLabels = ['Risk Profile', 'Assets', 'Strategy'];

  return (
    <div style={{ background: '#FBF7F0', minHeight: '100vh' }}>
      {/* Sticky wizard header */}
      <div style={{ position: 'sticky', top: 64, zIndex: 50, background: '#FBF7F0', borderBottom: '1px solid #CDC9C3', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 18, color: '#555555' }}>Configure your agent</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {wizStepLabels.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: i > 0 ? 0 : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: i <= wizStep ? '#555555' : '#CDC9C3', color: i <= wizStep ? '#FBF7F0' : '#A8A49E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 12, transition: 'all 0.2s' }}>
                  {i < wizStep ? <Icons.Check size={12} /> : i + 1}
                </div>
                <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: i <= wizStep ? '#555555' : '#A8A49E' }}>{s}</span>
              </div>
              {i < 2 && <div style={{ width: 24, height: 1, background: i < wizStep ? '#555555' : '#CDC9C3', marginLeft: 8 }} />}
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px 120px' }}>
        {/* Step A: Risk */}
        {wizStep === 0 && (
          <div style={{ animation: 'slideIn 0.25s ease' }}>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 24, color: '#555555', marginBottom: 8 }}>Choose your risk profile</div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E', marginBottom: 28 }}>Your agent will calibrate its optimisation strategy around this target.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {RISKS.map(r => <RiskCard key={r.id} r={r} selected={risk === r.id} onSelect={() => { setRisk(r.id); setErrors({}); }} />)}
            </div>
            {errors.risk && <div style={{ marginTop: 12, color: '#842029', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13 }}>{errors.risk}</div>}
          </div>
        )}

        {/* Step B: Assets */}
        {wizStep === 1 && (
          <div style={{ animation: 'slideIn 0.25s ease' }}>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 24, color: '#555555', marginBottom: 8 }}>Select assets</div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E', marginBottom: 28 }}>Choose 2–10 tokens. Spike will optimise allocation weights using quantum circuits.</div>
            <div style={{ border: '1.5px solid #CDC9C3', borderRadius: 20, overflow: 'hidden' }}>
              {ALL_ASSETS.map((a, i) => <AssetRow key={a.sym} a={a} selected={selectedAssets.includes(a.sym)} onToggle={toggleAsset} last={i === ALL_ASSETS.length - 1} />)}
            </div>
            {errors.assets && <div style={{ marginTop: 12, color: '#842029', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13 }}>{errors.assets}</div>}
          </div>
        )}

        {/* Step C: Strategy */}
        {wizStep === 2 && (
          <div style={{ animation: 'slideIn 0.25s ease' }}>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 24, color: '#555555', marginBottom: 8 }}>Strategy options</div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E', marginBottom: 28 }}>Tune your agent&apos;s behaviour. Defaults work well for most users.</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Card>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: '#555555', marginBottom: 4 }}>Target APY</div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#A8A49E', marginBottom: 16 }}>Your agent will pursue strategies aiming for this annual yield.</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E' }}>Conservative 5%</span>
                  <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, color: '#555555' }}>{apy}%</span>
                  <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E' }}>Aggressive 30%</span>
                </div>
                <input type="range" min={5} max={30} value={apy} onChange={e => setApy(+e.target.value)} style={{ width: '100%', accentColor: '#555555' }} />
              </Card>

              <Card>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: '#555555', marginBottom: 12 }}>Rebalancing frequency</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {FREQS.map(f => (
                    <button key={f.id} onClick={() => setRebalFreq(f.id)} style={{ flex: 1, padding: '10px 0', background: rebalFreq === f.id ? '#555555' : '#FBF7F0', color: rebalFreq === f.id ? '#FBF7F0' : '#555555', border: `1.5px solid ${rebalFreq === f.id ? '#555555' : '#CDC9C3'}`, borderRadius: 12, cursor: 'pointer', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, transition: 'all 0.15s' }}>{f.label}</button>
                  ))}
                </div>
              </Card>

              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: '#555555', marginBottom: 2 }}>QRNG Seeding</div>
                    <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#A8A49E' }}>Use quantum random numbers for strategy entropy</div>
                  </div>
                  <Toggle on={qrng} onToggle={() => setQrng(v => !v)} />
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: '#555555', marginBottom: 8 }}>Max Drawdown Limit</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="number" value={maxDrawdown} onChange={e => setMaxDrawdown(+e.target.value)} min={5} max={50}
                      style={{ width: 72, padding: '8px 12px', borderRadius: 10, border: '1.5px solid #CDC9C3', background: '#FBF7F0', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 18, color: '#555555', textAlign: 'center' }} />
                    <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E' }}>% maximum portfolio drawdown before agent pauses</span>
                  </div>
                </div>
              </Card>

              <div style={{ border: '1.5px solid #CDC9C3', borderRadius: 20, overflow: 'hidden' }}>
                <button onClick={() => setShowAdvanced(v => !v)} style={{ width: '100%', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FBF7F0', border: 'none', cursor: 'pointer', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: '#555555' }}>
                  Advanced quantum settings
                  <span style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', color: '#A8A49E' }}><Icons.ChevronDown /></span>
                </button>
                {showAdvanced && (
                  <div style={{ padding: '0 20px 20px', borderTop: '1px solid #CDC9C3', background: '#FBF7F0' }}>
                    <div style={{ paddingTop: 16, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#A8A49E', lineHeight: 1.7 }}>
                      <strong style={{ color: '#555555' }}>QAOA Circuit Depth:</strong> 3 (default). Higher depth = better optimisation, slower computation.<br/>
                      <strong style={{ color: '#555555' }}>Simulator Fallback:</strong> Enabled — if quantum hardware is unavailable, Spike falls back to classical simulation.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#FBF7F0', borderTop: '1px solid #CDC9C3', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 50 }}>
        {wizStep === 1 ? (
          <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: '#A8A49E' }}>{selectedAssets.length} of 10 selected</div>
        ) : <div />}
        <div style={{ display: 'flex', gap: 10 }}>
          {wizStep > 0 && <Btn variant="ghost" onClick={() => setWizStep(s => s - 1)}>← Back</Btn>}
          <Btn onClick={next} style={{ minWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {optimizing ? (
              <>
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FBF7F0', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                Optimizing…
              </>
            ) : wizStep === 2 ? 'Preview Strategy →' : 'Next →'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
