'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Btn, Toggle, KeyFingerprintCard, Toast } from '@/components/ui/primitives';
import { Icons } from '@/components/ui/icons';

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1.5px solid #CDC9C3', borderRadius: 20, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #CDC9C3', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 15, color: '#555555', background: '#FBF7F0' }}>{title}</div>
      <div style={{ padding: '16px 20px', background: '#FBF7F0', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  );
}

function SettingsRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ fontFamily: typeof label === 'string' ? "var(--font-dm-sans), 'DM Sans', sans-serif" : undefined, fontWeight: 600, fontSize: 13, color: '#555555' }}>{label}</div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState({ rebalance: true, error: true, digest: false });
  const [walletAddress, setWalletAddress] = useState('0x3f4B...e91C');
  const [fingerprint, setFingerprint] = useState('dlth3:4f2a·9c1e·b83d·0f7a·2e59·c4b1·8d3f·e6a2');
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '' });

  useEffect(() => {
    const w = sessionStorage.getItem('spike_wallet');
    if (w) setWalletAddress(w);
    const fp = sessionStorage.getItem('spike_dilithium_fp');
    if (fp) setFingerprint(fp.slice(0, 48));
  }, []);

  const showToast = (message: string) => {
    setToast({ visible: true, message });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
  };

  const save = () => {
    setSaved(true);
    showToast('Settings saved');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRotateKeys = () => {
    showToast('Keys rotating…');
    setTimeout(() => router.push('/app'), 600);
  };

  return (
    <div style={{ background: '#FBF7F0', minHeight: '100vh', paddingBottom: 60 }}>
      {/* NavBar */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, height: 64, background: '#FBF7F0', borderBottom: '1px solid #CDC9C3', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12 }}>
        <button onClick={() => router.push('/app/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#555555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FBF7F0' }}><Icons.Sun /></div>
          <div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', color: '#555555', lineHeight: 1 }}>Spike</div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8AADA4', marginTop: 1 }}>Quantum DeFi Agent</div>
          </div>
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#D9E4DD', border: '1px solid #B8CFC8', borderRadius: 99, padding: '4px 10px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5e8880' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#5e8880' }} />PQC Active
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#D9E4DD', border: '1px solid #B8CFC8', borderRadius: 99, padding: '6px 12px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: '#555555', cursor: 'default' }}>
          <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace" }}>{walletAddress}</span>
        </button>
      </nav>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 28, color: '#555555', marginBottom: 28, letterSpacing: '-0.01em' }}>Settings</div>

        <SettingsCard title="Profile">
          <SettingsRow label="Wallet address">
            <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 13, color: '#555555' }}>{walletAddress}</span>
          </SettingsRow>
          <SettingsRow label="Display name">
            <input placeholder="Optional" style={{ background: '#FBF7F0', border: '1.5px solid #CDC9C3', borderRadius: 10, padding: '8px 12px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#555555', width: 160, outline: 'none' }} />
          </SettingsRow>
          <SettingsRow label="Alert email">
            <input placeholder="Optional" type="email" style={{ background: '#FBF7F0', border: '1.5px solid #CDC9C3', borderRadius: 10, padding: '8px 12px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#555555', width: 200, outline: 'none' }} />
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title="Security">
          <div style={{ marginBottom: 14 }}>
            <KeyFingerprintCard fingerprint={fingerprint} />
          </div>
          <SettingsRow label="Last key rotation">
            <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#555555' }}>3 May 2026</span>
          </SettingsRow>
          <div style={{ marginTop: 14 }}>
            <Btn variant="sage" size="sm" icon={<Icons.RotateCw />} onClick={handleRotateKeys}>Rotate Keys</Btn>
          </div>
        </SettingsCard>

        <SettingsCard title="Notifications">
          {[
            { id: 'rebalance' as const, label: 'On rebalance', desc: 'Notified each time the agent rebalances' },
            { id: 'error' as const, label: 'On error', desc: 'Immediate alert if agent encounters an issue' },
            { id: 'digest' as const, label: 'Daily digest', desc: 'Summary of agent activity each morning' },
          ].map(n => (
            <SettingsRow key={n.id} label={
              <div>
                <div style={{ fontWeight: 700, color: '#555555', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14 }}>{n.label}</div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E' }}>{n.desc}</div>
              </div>
            }>
              <Toggle on={notifications[n.id]} onToggle={() => setNotifications(v => ({ ...v, [n.id]: !v[n.id] }))} />
            </SettingsRow>
          ))}
        </SettingsCard>

        <SettingsCard title="Data & Privacy">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Btn variant="ghost" size="sm" icon={<Icons.Download />}>Export all data</Btn>
            <Btn variant="danger" size="sm">Delete account</Btn>
          </div>
        </SettingsCard>

        <div style={{ marginTop: 24 }}>
          <Btn size="lg" onClick={save} style={{ minWidth: 200 }}>
            {saved ? '✓ Saved' : 'Save changes'}
          </Btn>
        </div>
      </div>

      <Toast message={toast.message} type="success" visible={toast.visible} />
    </div>
  );
}
