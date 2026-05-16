'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Icons } from './ui/icons';

export function AppNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { address } = useAccount();
  const [pqcActive, setPqcActive] = useState(false);

  useEffect(() => {
    setPqcActive(!!sessionStorage.getItem('spike_pqc_active'));
  }, [pathname]);

  const truncated = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;
  const isDashboard = pathname === '/app/dashboard';
  const isSettings = pathname === '/app/settings';

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      height: 64, background: '#FBF7F0',
      borderBottom: '1px solid #CDC9C3',
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 12,
    }}>
      <button
        onClick={() => router.push('/app/dashboard')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#555555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FBF7F0' }}>
          <Icons.Sun />
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', color: '#555555', lineHeight: 1 }}>Spike</div>
          <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8AADA4', marginTop: 1 }}>Quantum DeFi Agent</div>
        </div>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 8 }}>
        <button
          onClick={() => router.push('/app/dashboard')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '6px 12px', borderRadius: 8,
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            fontWeight: isDashboard ? 700 : 600, fontSize: 13,
            color: isDashboard ? '#555555' : '#A8A49E',
            borderBottom: `2px solid ${isDashboard ? '#555555' : 'transparent'}`,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { if (!isDashboard) (e.currentTarget as HTMLButtonElement).style.color = '#555555'; }}
          onMouseLeave={e => { if (!isDashboard) (e.currentTarget as HTMLButtonElement).style.color = '#A8A49E'; }}
        >
          Dashboard
        </button>
        <button
          onClick={() => router.push('/app/settings')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '6px 12px', borderRadius: 8,
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            fontWeight: isSettings ? 700 : 600, fontSize: 13,
            color: isSettings ? '#555555' : '#A8A49E',
            borderBottom: `2px solid ${isSettings ? '#555555' : 'transparent'}`,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { if (!isSettings) (e.currentTarget as HTMLButtonElement).style.color = '#555555'; }}
          onMouseLeave={e => { if (!isSettings) (e.currentTarget as HTMLButtonElement).style.color = '#A8A49E'; }}
        >
          Settings
        </button>
      </div>

      <div style={{ flex: 1 }} />

      {truncated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {pqcActive && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#D9E4DD', border: '1px solid #B8CFC8',
              borderRadius: 99, padding: '4px 10px',
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              fontWeight: 700, fontSize: 10, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#5e8880',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#5e8880' }} />
              PQC Active
            </div>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#D9E4DD', border: '1px solid #B8CFC8',
            borderRadius: 99, padding: '6px 12px',
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            fontWeight: 700, fontSize: 12, color: '#555555',
          }}>
            <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace" }}>{truncated}</span>
          </div>
        </div>
      )}
    </nav>
  );
}
