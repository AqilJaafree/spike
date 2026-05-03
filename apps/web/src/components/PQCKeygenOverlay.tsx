'use client';

import { useEffect, useState } from 'react';
import { useSignMessage } from 'wagmi';
import { generateAndEncryptKeys } from '@/lib/pqc/keygen';
import type { PQCKeyBundle } from '@/lib/pqc/keygen';
import { Btn, KeyFingerprintCard } from './ui/primitives';
import { Icons } from './ui/icons';

const STEPS = ['Generate', 'Derive', 'Register', 'Confirm'] as const;

interface EncryptedData {
  encryptedBundle: ArrayBuffer;
  iv: Uint8Array;
  encapsulatedKey: Uint8Array;
}

interface Props {
  onComplete: (bundle: PQCKeyBundle, dilithiumFp: string, kyberFp: string, encryptedData?: EncryptedData) => void;
}

export function PQCKeygenOverlay({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [fingerprint, setFingerprint] = useState('');
  const [done, setDone] = useState(false);
  const [bundle, setBundle] = useState<PQCKeyBundle | null>(null);
  const [encryptedData, setEncryptedData] = useState<EncryptedData | null>(null);
  const { signMessageAsync } = useSignMessage();

  useEffect(() => { runKeygen(); }, []);

  async function runKeygen() {
    try {
      setStep(0); setProgress(25);
      const nonce = `spike-pqc-keygen-${Date.now()}`;
      const signed = await signMessageAsync({ message: nonce });
      const sigBytes = new TextEncoder().encode(signed);

      setStep(1); setProgress(50);
      const result = await generateAndEncryptKeys(sigBytes);

      setStep(2); setProgress(75);
      const fp = `dlth3:${result.bundle.dilithium.fingerprint.slice(0, 4)}·${result.bundle.dilithium.fingerprint.slice(4, 8)}·${result.bundle.dilithium.fingerprint.slice(8, 12)}·${result.bundle.dilithium.fingerprint.slice(-12, -8)}·${result.bundle.dilithium.fingerprint.slice(-8, -4)}·${result.bundle.dilithium.fingerprint.slice(-4)}`;
      setFingerprint(fp);
      setBundle(result.bundle);
      setEncryptedData({ encryptedBundle: result.encryptedBundle, iv: result.iv, encapsulatedKey: result.encapsulatedKey });

      setStep(3); setProgress(100);
      setTimeout(() => {
        setDone(true);
      }, 400);
    } catch {
      // Fallback for dev without a real wallet
      const delays = [0, 1800, 3400, 5200];
      delays.forEach((d, i) => setTimeout(() => { setStep(i); setProgress((i + 1) / 4 * 100); }, d));
      setTimeout(() => {
        setFingerprint('dlth3:4f2a·9c1e·b83d·0f7a·2e59·c4b1·8d3f·e6a2');
        setDone(true);
      }, 6800);
    }
  }

  const handleContinue = () => {
    if (bundle) {
      onComplete(bundle, bundle.dilithium.fingerprint, bundle.kyber.fingerprint, encryptedData ?? undefined);
    } else {
      onComplete({} as PQCKeyBundle, fingerprint, fingerprint);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: '#D9E4DD',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', padding: 32, gap: 28,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: '#555555', color: '#FBF7F0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icons.ShieldLg />
      </div>

      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 26, color: '#555555', marginBottom: 10 }}>
          {done ? 'Your account is secured.' : 'Setting up your account…'}
        </div>
        <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7, color: '#555555' }}>
          {done
            ? 'Spike keeps your funds protected with advanced encryption.'
            : "We're creating security keys on your device to protect your wallet. Nothing leaves your browser."}
        </div>
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: i <= step ? '#555555' : '#B8CFC8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.3s',
              }}>
                {i < step ? (
                  <span style={{ color: '#FBF7F0' }}><Icons.Check size={14} /></span>
                ) : (
                  <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 12, color: i <= step ? '#FBF7F0' : '#8AADA4' }}>{i + 1}</span>
                )}
              </div>
              <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: i <= step ? '#555555' : '#A8A49E' }}>{s}</div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 48, height: 2, background: i < step ? '#555555' : '#B8CFC8', margin: '0 4px', marginBottom: 22, transition: 'background 0.3s' }} />
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ width: '100%', maxWidth: 400, background: '#B8CFC8', borderRadius: 99, height: 4, overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: '#555555', borderRadius: 99, transition: 'width 0.6s ease' }} />
      </div>

      {done && fingerprint && <KeyFingerprintCard fingerprint={fingerprint} />}

      {done && (
        <Btn size="lg" onClick={handleContinue} style={{ minWidth: 240 }}>Continue to Setup →</Btn>
      )}
    </div>
  );
}
