'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const NO_NAV_ROUTES = ['/app', '/app/setup'];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [pqcActive, setPqcActive] = useState(false);

  useEffect(() => {
    setWalletAddress(sessionStorage.getItem('spike_wallet'));
    setPqcActive(!!sessionStorage.getItem('spike_pqc_active'));
  }, [pathname]);

  const showNav = !NO_NAV_ROUTES.includes(pathname ?? '');

  if (!showNav) return <>{children}</>;

  const isDashboard = pathname === '/app/dashboard';
  const isSettings = pathname === '/app/settings';

  return (
    <>
      {!isDashboard && !isSettings && (
        <nav style={{
          position: 'sticky', top: 0, zIndex: 100,
          height: 64, background: '#FBF7F0',
          borderBottom: '1px solid #CDC9C3',
          display: 'flex', alignItems: 'center',
          padding: '0 24px', gap: 12,
        }}>
          <button onClick={() => router.push(walletAddress ? '/app/dashboard' : '/app')} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#555555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FBF7F0' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', color: '#555555', lineHeight: 1 }}>Spike</div>
              <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8AADA4', marginTop: 1 }}>Quantum DeFi Agent</div>
            </div>
          </button>
          <div style={{ flex: 1 }} />
          {walletAddress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {pqcActive && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#D9E4DD', border: '1px solid #B8CFC8', borderRadius: 99, padding: '4px 10px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5e8880' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#5e8880' }} />
                  PQC Active
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#D9E4DD', border: '1px solid #B8CFC8', borderRadius: 99, padding: '6px 12px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: '#555555' }}>
                <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace" }}>{walletAddress}</span>
              </div>
            </div>
          )}
        </nav>
      )}
      {children}
    </>
  );
}
