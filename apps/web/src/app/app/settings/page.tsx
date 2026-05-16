'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract } from 'wagmi';
import { readContract, waitForTransactionReceipt } from '@wagmi/core';
import { keccak256 } from 'viem';
import { Btn, Toggle, KeyFingerprintCard, Toast } from '@/components/ui/primitives';
import { Icons } from '@/components/ui/icons';
import { wagmiConfig } from '@/lib/wagmi/config';
import { PQC_REGISTRY_ADDRESS, PQC_REGISTRY_ABI } from '@/lib/contracts';

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
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [notifications, setNotifications] = useState({ rebalance: true, error: true, digest: false });
  const [fingerprint, setFingerprint] = useState('dlth3:4f2a·9c1e·b83d·0f7a·2e59·c4b1·8d3f·e6a2');
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const [keyActionLoading, setKeyActionLoading] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [onChainKeys, setOnChainKeys] = useState<{ dilithiumFingerprint: `0x${string}`; kyberFingerprint: `0x${string}`; storageRoot: `0x${string}`; registeredAt: bigint; updatedAt: bigint; active: boolean } | null>(null);

  useEffect(() => {
    const fp = sessionStorage.getItem('spike_dilithium_fp');
    if (fp) setFingerprint(fp.slice(0, 48));
  }, []);

  useEffect(() => {
    if (!address || !PQC_REGISTRY_ADDRESS) return;
    readContract(wagmiConfig, {
      address: PQC_REGISTRY_ADDRESS,
      abi: PQC_REGISTRY_ABI,
      functionName: 'getKeys',
      args: [address],
      chainId: 16602,
    })
      .then(keys => {
        const k = keys as { dilithiumFingerprint: `0x${string}`; kyberFingerprint: `0x${string}`; storageRoot: `0x${string}`; registeredAt: bigint; updatedAt: bigint; active: boolean };
        if (k.active) {
          setOnChainKeys(k);
          setFingerprint(k.dilithiumFingerprint.slice(0, 48));
        }
      })
      .catch(() => null);
  }, [address]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
  };

  const save = () => {
    setSaved(true);
    showToast('Settings saved');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRotateKeys = async () => {
    if (!address || !PQC_REGISTRY_ADDRESS) {
      showToast('Wallet not connected', 'error');
      return;
    }
    setKeyActionLoading(true);
    try {
      const seed = new TextEncoder().encode(`${address}-rotated-${Date.now()}`);
      const newDilFp = keccak256(seed) as `0x${string}`;
      const newKyberFp = keccak256(new TextEncoder().encode(`kyber-${address}-${Date.now()}`)) as `0x${string}`;
      const newStorageRoot = keccak256(new TextEncoder().encode(`storage-${newDilFp}-${newKyberFp}`)) as `0x${string}`;

      const hash = await writeContractAsync({
        address: PQC_REGISTRY_ADDRESS,
        abi: PQC_REGISTRY_ABI,
        functionName: 'rotate',
        args: [newDilFp, newKyberFp, newStorageRoot],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });

      sessionStorage.setItem('spike_dilithium_fp', newDilFp);
      sessionStorage.setItem('spike_kyber_fp', newKyberFp);
      setFingerprint(newDilFp.slice(0, 48));
      showToast('Keys rotated on-chain');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Rotation failed', 'error');
    } finally {
      setKeyActionLoading(false);
    }
  };

  const handleRevokeKeys = async () => {
    if (!address || !PQC_REGISTRY_ADDRESS) {
      showToast('Wallet not connected', 'error');
      return;
    }
    setShowRevokeConfirm(false);
    setKeyActionLoading(true);
    try {
      const hash = await writeContractAsync({
        address: PQC_REGISTRY_ADDRESS,
        abi: PQC_REGISTRY_ABI,
        functionName: 'revoke',
        args: [],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      sessionStorage.removeItem('spike_dilithium_fp');
      sessionStorage.removeItem('spike_kyber_fp');
      showToast('PQC keys revoked on-chain');
      setTimeout(() => router.push('/app'), 1500);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Revoke failed', 'error');
    } finally {
      setKeyActionLoading(false);
    }
  };

  return (
    <div style={{ background: '#FBF7F0', minHeight: '100vh', paddingBottom: 60 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 28, color: '#555555', marginBottom: 28, letterSpacing: '-0.01em' }}>Settings</div>

        <SettingsCard title="Profile">
          <SettingsRow label="Wallet address">
            <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 13, color: '#555555' }}>
              {address ?? '—'}
            </span>
          </SettingsRow>
          <SettingsRow label="Display name">
            <input placeholder="Optional" style={{ background: '#FBF7F0', border: '1.5px solid #CDC9C3', borderRadius: 10, padding: '8px 12px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#555555', width: 160, outline: 'none' }} />
          </SettingsRow>
          <SettingsRow label="Alert email">
            <input placeholder="Optional" type="email" style={{ background: '#FBF7F0', border: '1.5px solid #CDC9C3', borderRadius: 10, padding: '8px 12px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#555555', width: 200, outline: 'none' }} />
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title="Security">
          <SettingsRow label="PQC key status">
            {onChainKeys === null ? (
              <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#A8A49E' }}>Loading…</span>
            ) : onChainKeys.active ? (
              <span style={{ background: '#d4edda', color: '#2d6a4f', borderRadius: 99, padding: '3px 10px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 12 }}>Registered on-chain</span>
            ) : (
              <span style={{ background: '#f8d7da', color: '#842029', borderRadius: 99, padding: '3px 10px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 12 }}>Not registered</span>
            )}
          </SettingsRow>
          <div style={{ marginBottom: 14 }}>
            <KeyFingerprintCard fingerprint={fingerprint} />
          </div>
          <SettingsRow label="Last key rotation">
            <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#555555' }}>
              {onChainKeys ? new Date(Number(onChainKeys.updatedAt) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </span>
          </SettingsRow>
          {onChainKeys && (
            <SettingsRow label="Kyber fingerprint">
              <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 12, color: '#555555' }}>
                {onChainKeys.kyberFingerprint.slice(0, 14)}…
              </span>
            </SettingsRow>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Btn variant="sage" size="sm" icon={keyActionLoading ? undefined : <Icons.RotateCw />} onClick={handleRotateKeys} style={{ minWidth: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {keyActionLoading ? (
                <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(85,85,85,0.3)', borderTopColor: '#555555', animation: 'spin 0.8s linear infinite' }} />
              ) : 'Rotate Keys'}
            </Btn>
            <Btn variant="danger" size="sm" onClick={() => setShowRevokeConfirm(true)}>Revoke Keys</Btn>
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

      {showRevokeConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(85,85,85,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#FBF7F0', borderRadius: 24, border: '1.5px solid #CDC9C3', padding: 32, maxWidth: 380, width: '100%' }}>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 20, color: '#555555', marginBottom: 10 }}>Revoke PQC keys?</div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E', marginBottom: 24, lineHeight: 1.7 }}>This permanently deactivates your quantum-safe keys on-chain. Any running agents will need to be re-deployed with new keys.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="ghost" style={{ flex: 1 }} onClick={() => setShowRevokeConfirm(false)}>Cancel</Btn>
              <Btn style={{ flex: 1, background: '#842029', color: '#fff' }} onClick={handleRevokeKeys}>Revoke</Btn>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </div>
  );
}
