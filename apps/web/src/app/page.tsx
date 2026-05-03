import Link from 'next/link';

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
    fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase' as const,
    color: '#A8A49E', marginBottom: 16,
  }}>
    {children}
    <div style={{ flex: 1, height: 1, background: '#CDC9C3', opacity: 0.6 }} />
  </div>
);

export default function LandingPage() {
  const stats = [
    { label: 'Agents Running', value: '1,284' },
    { label: 'Total Value Managed', value: '$47.2M' },
    { label: 'Avg Sharpe Lift', value: '+0.38' },
  ];

  const features = [
    {
      title: 'Quantum Optimised',
      desc: "QAOA-powered portfolio rebalancing finds weights classical solvers can't reach.",
    },
    {
      title: 'PQC Secured',
      desc: 'NIST-standardised Dilithium3 signatures and Kyber-1024 encryption, end-to-end.',
    },
    {
      title: 'Fully Verifiable',
      desc: 'Every agent action is TEE-attested and logged on 0G Chain — auditable forever.',
    },
  ];

  const steps = [
    { n: '01', title: 'Connect & secure', desc: 'Link your EVM wallet. Spike auto-generates your post-quantum keypair.' },
    { n: '02', title: 'Configure your agent', desc: 'Choose risk profile, select assets, set yield targets.' },
    { n: '03', title: 'Deploy & relax', desc: 'Your quantum agent runs autonomously, rebalancing around the clock.' },
  ];

  return (
    <div style={{ background: '#FBF7F0', minHeight: '100vh' }}>
      {/* Minimal nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, height: 64, background: '#FBF7F0', borderBottom: '1px solid #CDC9C3', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#555555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FBF7F0' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', color: '#555555', lineHeight: 1 }}>Spike</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8AADA4', marginTop: 1 }}>Quantum DeFi Agent</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Link href="/app" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, background: '#555555', color: '#FBF7F0', border: 'none',
          borderRadius: 16, padding: '10px 20px', fontFamily: "'DM Sans', sans-serif",
          fontWeight: 800, fontSize: 14, textDecoration: 'none', letterSpacing: '-0.01em',
        }}>
          Launch App →
        </Link>
      </nav>

      {/* Hero */}
      <div style={{
        background: '#D9E4DD', padding: '80px 24px 72px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', gap: 24, position: 'relative', overflow: 'hidden',
      }}>
        <style>{`@keyframes pulse { 0%,100%{transform:scale(1);opacity:0.8} 50%{transform:scale(1.15);opacity:1} }`}</style>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: ([120,80,60,100,70,50] as number[])[i],
            height: ([120,80,60,100,70,50] as number[])[i],
            borderRadius: '50%',
            border: `1.5px solid rgba(255,251,240,${([0.25,0.2,0.3,0.15,0.22,0.18] as number[])[i]})`,
            background: `rgba(251,247,240,${([0.06,0.04,0.08,0.03,0.05,0.07] as number[])[i]})`,
            top: (['10%','60%','30%','70%','15%','50%'] as string[])[i],
            left: (['5%','8%','75%','80%','55%','40%'] as string[])[i],
            animation: `pulse ${([4,5,3.5,6,4.5,5.5] as number[])[i]}s ease-in-out infinite`,
            animationDelay: `${([0,1,0.5,2,1.5,0.8] as number[])[i]}s`,
          }} />
        ))}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8AADA4', marginBottom: 20 }}>
            Quantum-Safe · Quantum-Enhanced · Autonomous
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 900, fontSize: 'clamp(52px,8vw,88px)', letterSpacing: '-0.03em', color: '#555555', lineHeight: 0.95, marginBottom: 8 }}>Spike.</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 'clamp(18px,3vw,26px)', color: '#8AADA4', letterSpacing: '-0.01em', marginBottom: 24 }}>Your autonomous DeFi AI agent.</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: 16, lineHeight: 1.7, color: '#555555', maxWidth: 520, margin: '0 auto 36px' }}>
            Spike combines post-quantum cryptography with hybrid classical–quantum algorithms to give you a self-managing portfolio that&apos;s future-proof.
          </div>
          <Link href="/app" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: '#555555', color: '#FBF7F0', borderRadius: 16,
            padding: '16px 32px', fontFamily: "'DM Sans', sans-serif",
            fontWeight: 800, fontSize: 17, textDecoration: 'none', letterSpacing: '-0.01em',
          }}>
            Launch App →
          </Link>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '24px', flexWrap: 'wrap', borderBottom: '1px solid #CDC9C3' }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: '#FBF7F0', border: '1.5px solid #CDC9C3', borderRadius: 99, padding: '10px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 900, fontSize: 22, color: '#555555', letterSpacing: '-0.02em' }}>{s.value}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 11, color: '#A8A49E', letterSpacing: '0.06em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Feature cards */}
      <div style={{ padding: '56px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <SectionLabel>What Spike does</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {features.map(f => (
              <div key={f.title} style={{ background: '#FBF7F0', border: '1.5px solid #CDC9C3', borderRadius: 20, padding: 28, transition: 'all 0.2s' }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 18, color: '#555555', marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7, color: '#555555' }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{ padding: '0 24px 72px', background: '#D9E4DD' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', paddingTop: 56 }}>
          <SectionLabel>How it works</SectionLabel>
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {steps.map((s, i) => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', flex: '1 1 200px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#555555', color: '#FBF7F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>{s.n}</div>
                    {i < steps.length - 1 && <div style={{ flex: 1, height: 1, background: '#B8CFC8', opacity: 0.8 }} />}
                  </div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 17, color: '#555555', marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7, color: '#555555', paddingRight: 24 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40, textAlign: 'center' }}>
            <Link href="/app" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: '#555555', color: '#FBF7F0', borderRadius: 16,
              padding: '16px 32px', fontFamily: "'DM Sans', sans-serif",
              fontWeight: 800, fontSize: 17, textDecoration: 'none',
            }}>
              Get started →
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '28px 24px', borderTop: '1px solid #CDC9C3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 900, fontSize: 18, color: '#555555' }}>Spike.</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#A8A49E' }}>© 2026 Spike Protocol · Built on 0G Network · v0.1.0</div>
      </div>
    </div>
  );
}
