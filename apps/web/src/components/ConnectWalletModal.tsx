'use client';

import { useState } from 'react';
import { useConnect } from 'wagmi';
import { Icons } from './ui/icons';

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected: (address: string) => void;
}

function WalletRow({ wallet, connecting, onConnect }: {
  wallet: { id: string; name: string; desc: string; icon: React.ReactNode };
  connecting: boolean;
  onConnect: (id: string) => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onConnect(wallet.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: hov ? '#D9E4DD' : '#FBF7F0',
        border: `1.5px solid ${hov ? '#B8CFC8' : '#CDC9C3'}`,
        borderRadius: 16, padding: '14px 18px', cursor: 'pointer',
        transition: 'all 0.15s', width: '100%', textAlign: 'left',
      }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {wallet.icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: '#555555' }}>{wallet.name}</div>
        <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E' }}>{wallet.desc}</div>
      </div>
      {connecting ? (
        <div style={{
          width: 18, height: 18, borderRadius: '50%',
          border: '2px solid #CDC9C3', borderTopColor: '#555555',
          animation: 'spin 0.8s linear infinite',
        }} />
      ) : (
        <span style={{ color: '#A8A49E' }}><Icons.ChevronRight /></span>
      )}
    </button>
  );
}

export function ConnectWalletModal({ open, onClose, onConnected }: Props) {
  const { connect, connectors, isPending, error } = useConnect();
  const [connecting, setConnecting] = useState<string | null>(null);

  if (!open) return null;

  const walletDefs = [
    { id: 'metaMask', name: 'MetaMask', desc: 'Browser extension', icon: <Icons.Metamask /> },
    { id: 'walletConnect', name: 'WalletConnect', desc: 'Mobile & desktop', icon: <Icons.WalletConnect /> },
    { id: 'coinbaseWalletSDK', name: 'Coinbase Wallet', desc: 'Self-custody wallet', icon: <Icons.Coinbase /> },
  ];

  const handleConnect = (id: string) => {
    setConnecting(id);
    const connector = connectors.find(c => c.id === id || c.name.toLowerCase().includes(id.toLowerCase().replace('sdk', '')));
    if (connector) {
      connect({ connector }, {
        onSuccess: (data) => {
          setConnecting(null);
          onConnected(data.accounts[0] ?? '0x3f4B...e91C');
        },
        onError: () => setConnecting(null),
      });
    } else {
      // Simulate for dev/demo when connector not found
      setTimeout(() => {
        setConnecting(null);
        onConnected('0x3f4B...e91C');
      }, 1200);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(85,85,85,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#FBF7F0', borderRadius: 24,
        border: '1.5px solid #CDC9C3',
        padding: 32, width: '100%', maxWidth: 400,
        boxShadow: '0 24px 60px rgba(0,0,0,0.12)',
        animation: 'modalIn 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, color: '#555555' }}>Connect your wallet</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8A49E', padding: 4 }}>
            <Icons.X />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {walletDefs.map(w => (
            <WalletRow key={w.id} wallet={w} connecting={connecting === w.id || (isPending && connecting === w.id)} onConnect={handleConnect} />
          ))}
        </div>

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#f8d7da', borderRadius: 12, padding: '10px 14px',
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#842029', marginBottom: 12,
          }}>
            <Icons.AlertTriangle />{error.message}
          </div>
        )}

        <div style={{ borderTop: '1px solid #CDC9C3', paddingTop: 16, textAlign: 'center' }}>
          <a href="#" style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, color: '#A8A49E', textDecoration: 'none' }}>
            What is a wallet?
          </a>
        </div>
      </div>
    </div>
  );
}
