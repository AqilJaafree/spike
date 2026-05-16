'use client';

import { usePathname } from 'next/navigation';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { zgTestnet } from '@/lib/wagmi/config';
import { AppNavBar } from '@/components/AppNavBar';

function WrongNetworkBanner() {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === zgTestnet.id) return null;

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 200,
      background: '#f59e0b', color: '#1c1917',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      padding: '10px 24px', fontSize: 13,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 600,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      Wrong network — Spike requires 0G Testnet (Chain ID 16602)
      <button
        onClick={() => switchChain({ chainId: zgTestnet.id })}
        disabled={isPending}
        style={{
          background: '#1c1917', color: '#f59e0b', border: 'none', borderRadius: 8,
          padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: isPending ? 'wait' : 'pointer',
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        }}
      >
        {isPending ? 'Switching…' : 'Switch Network'}
      </button>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = pathname !== '/app';

  return (
    <>
      <WrongNetworkBanner />
      {showNav && <AppNavBar />}
      {children}
    </>
  );
}
