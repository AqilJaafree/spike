'use client';

import { useState } from 'react';
import { Icons } from './ui/icons';

interface NavBarProps {
  walletAddress: string | null;
  pqcActive: boolean;
  agentDeployed: boolean;
  onSettings: () => void;
  onLogoClick: () => void;
}

export function NavBar({ walletAddress, pqcActive, agentDeployed, onSettings, onLogoClick }: NavBarProps) {
  const [copied, setCopied] = useState(false);
  const truncated = walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : null;

  const handleCopy = () => {
    navigator.clipboard.writeText(walletAddress || '').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      height: 64, background: '#FBF7F0',
      borderBottom: '1px solid #CDC9C3',
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 12,
    }}>
      <button onClick={onLogoClick} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: '#555555',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#FBF7F0',
        }}>
          <Icons.Sun />
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
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#D9E4DD', border: '1px solid #B8CFC8',
              borderRadius: 99, padding: '4px 10px',
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700,
              fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#5e8880',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#5e8880' }} />
              PQC Active
            </div>
          )}
          <button onClick={handleCopy} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#D9E4DD', border: '1px solid #B8CFC8',
            borderRadius: 99, padding: '6px 12px', cursor: 'pointer',
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700,
            fontSize: 12, color: '#555555',
          }}>
            <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace" }}>{truncated}</span>
            <Icons.Copy />
            {copied && <span style={{ color: '#5e8880' }}>✓</span>}
          </button>
        </div>
      )}

      {agentDeployed && (
        <button onClick={onSettings} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#A8A49E', padding: 6, borderRadius: 8,
          display: 'flex', alignItems: 'center',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#555555')}
        onMouseLeave={e => (e.currentTarget.style.color = '#A8A49E')}
        >
          <Icons.Settings />
        </button>
      )}
    </nav>
  );
}
