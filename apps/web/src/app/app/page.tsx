'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectWalletModal } from '@/components/ConnectWalletModal';
import { PQCKeygenOverlay } from '@/components/PQCKeygenOverlay';
import { Btn } from '@/components/ui/primitives';
import { Icons } from '@/components/ui/icons';
import type { PQCKeyBundle } from '@/lib/pqc/keygen';

type AppPhase = 'setup' | 'pqc';

const STEPS = [
  { n: 1, title: 'Connect wallet', desc: 'Link your EVM wallet — MetaMask, WalletConnect or Coinbase.' },
  { n: 2, title: 'Create security keys', desc: 'We generate strong encryption keys on your device — nothing is shared.' },
  { n: 3, title: 'Set your strategy', desc: 'Choose how aggressive, which coins, and how much return you want.' },
  { n: 4, title: 'Launch your bot', desc: 'Spike starts watching the market and managing your portfolio automatically.' },
];

export default function AppPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<AppPhase>('setup');
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  function handleConnected(address: string) {
    const displayAddr = address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
    setWalletAddress(displayAddr);
    setShowWalletModal(false);
    setTimeout(() => setPhase('pqc'), 400);
  }

  function handlePQCComplete(
    _bundle: PQCKeyBundle,
    dilithiumFp: string,
    kyberFp: string,
    encryptedData?: { encryptedBundle: ArrayBuffer; iv: Uint8Array; encapsulatedKey: Uint8Array }
  ) {
    sessionStorage.setItem('spike_dilithium_fp', dilithiumFp);
    sessionStorage.setItem('spike_kyber_fp', kyberFp);
    sessionStorage.setItem('spike_pqc_active', '1');
    // Persist the Dilithium SK as hex so review/page.tsx can sign with it
    if (_bundle.dilithium?.secretKey) {
      const skHex = Array.from(_bundle.dilithium.secretKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      sessionStorage.setItem('spike_dilithium_sk', skHex);
    }
    if (encryptedData) {
      const toB64 = (buf: ArrayBuffer | Uint8Array) => {
        const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        return btoa(String.fromCharCode(...Array.from(bytes)));
      };
      sessionStorage.setItem('spike_enc_bundle', toB64(encryptedData.encryptedBundle));
      sessionStorage.setItem('spike_enc_iv', toB64(encryptedData.iv));
      sessionStorage.setItem('spike_enc_key', toB64(encryptedData.encapsulatedKey));
    }
    router.push('/app/configure');
  }

  if (phase === 'pqc') {
    return <PQCKeygenOverlay onComplete={handlePQCComplete} />;
  }

  const connected = !!walletAddress;

  return (
    <>
      {showWalletModal && (
        <ConnectWalletModal open={showWalletModal} onClose={() => setShowWalletModal(false)} onConnected={handleConnected} />
      )}

      <div style={{ minHeight: '100vh', background: '#FBF7F0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: '#555555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FBF7F0' }}>
            <Icons.Sun />
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', color: '#555555', lineHeight: 1 }}>Spike</div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 500, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8AADA4' }}>Quantum DeFi Agent</div>
          </div>
        </div>

        {/* Card */}
        <div style={{ width: '100%', maxWidth: 480, background: '#FBF7F0', border: '1.5px solid #CDC9C3', borderRadius: 24, padding: '36px 32px', boxShadow: '0 4px 32px rgba(0,0,0,0.06)' }}>
          <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 26, color: '#555555', letterSpacing: '-0.02em', marginBottom: 6 }}>Set up your agent</div>
          <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 400, fontSize: 14, color: '#A8A49E', lineHeight: 1.7, marginBottom: 32 }}>
            Four steps to deploy your autonomous, quantum-safe DeFi agent.
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 32, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 19, top: 40, bottom: 40, width: 1, background: '#CDC9C3', zIndex: 0 }} />
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '12px 0', position: 'relative', zIndex: 1 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: (connected && i === 0) ? '#555555' : i === 0 ? '#D9E4DD' : '#FBF7F0',
                  border: `2px solid ${(connected && i === 0) ? '#555555' : i === 0 ? '#B8CFC8' : '#CDC9C3'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 14,
                  color: (connected && i === 0) ? '#FBF7F0' : i === 0 ? '#555555' : '#A8A49E',
                  transition: 'all 0.2s',
                }}>
                  {connected && i === 0 ? <Icons.Check size={16} /> : s.n}
                </div>
                <div style={{ paddingTop: 8 }}>
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: i === 0 ? '#555555' : '#A8A49E', marginBottom: 2 }}>{s.title}</div>
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#A8A49E', lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          {!connected ? (
            <Btn size="xl" onClick={() => setShowWalletModal(true)} style={{ width: '100%' }}>
              Connect Wallet →
            </Btn>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#D9E4DD', border: '1px solid #B8CFC8', borderRadius: 12,
                padding: '12px 16px', marginBottom: 4,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#5e8880' }} />
                <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 13, color: '#555555' }}>{walletAddress}</span>
                <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, color: '#5e8880', marginLeft: 'auto' }}>Connected</span>
              </div>
              <Btn size="xl" style={{ width: '100%' }} onClick={() => setPhase('pqc')}>
                Continue to Security Setup →
              </Btn>
            </div>
          )}

          <div style={{ marginTop: 20, textAlign: 'center', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E', lineHeight: 1.6 }}>
            Your private keys never leave your browser. Built on 0G Network.
          </div>
        </div>
      </div>
    </>
  );
}
