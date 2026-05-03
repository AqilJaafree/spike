'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icons } from './icons';

// ── Button ─────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'ghost' | 'sage' | 'danger';
type BtnSize = 'sm' | 'md' | 'lg' | 'xl';

interface BtnProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  style?: CSSProperties;
  icon?: ReactNode;
  type?: 'button' | 'submit' | 'reset';
}

export const Btn = ({ children, onClick, variant = 'primary', size = 'md', disabled, style: extStyle, icon, type = 'button' }: BtnProps) => {
  const [hov, setHov] = useState(false);
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800,
    borderRadius: 16, transition: 'all 0.15s', opacity: disabled ? 0.5 : 1,
    letterSpacing: '-0.01em',
  };
  const sizes: Record<BtnSize, CSSProperties> = {
    sm: { padding: '8px 16px', fontSize: 13 },
    md: { padding: '12px 20px', fontSize: 14 },
    lg: { padding: '14px 28px', fontSize: 16 },
    xl: { padding: '16px 32px', fontSize: 17 },
  };
  const variants: Record<BtnVariant, CSSProperties> = {
    primary: { background: hov ? '#3a3a3a' : '#555555', color: '#FBF7F0', border: 'none' },
    ghost: { background: 'transparent', color: '#555555', border: `1.5px solid ${hov ? '#555555' : '#CDC9C3'}` },
    sage: { background: hov ? '#B8CFC8' : '#D9E4DD', color: '#555555', border: '1.5px solid #B8CFC8' },
    danger: { background: hov ? '#c0392b' : 'transparent', color: hov ? '#fff' : '#c0392b', border: '1.5px solid #c0392b' },
  };
  return (
    <button type={type} onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...base, ...sizes[size], ...variants[variant], ...extStyle }}>
      {icon && icon}
      {children}
    </button>
  );
};

// ── Card ───────────────────────────────────────────────────────────────────
interface CardProps {
  children: ReactNode;
  sage?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
}

export const Card = ({ children, sage, style: extStyle, onClick }: CardProps) => (
  <div onClick={onClick} style={{
    background: sage ? '#D9E4DD' : '#FBF7F0',
    border: `1.5px solid ${sage ? '#B8CFC8' : '#CDC9C3'}`,
    borderRadius: 20, padding: 24,
    cursor: onClick ? 'pointer' : 'default',
    ...extStyle,
  }}>
    {children}
  </div>
);

// ── StatusPill ─────────────────────────────────────────────────────────────
type Status = 'running' | 'paused' | 'error' | 'attested' | 'pending';

export const StatusPill = ({ status }: { status: Status }) => {
  const map: Record<Status, { bg: string; color: string; label: string }> = {
    running: { bg: '#d4edda', color: '#2d6a4f', label: 'Running' },
    paused: { bg: '#fff3cd', color: '#856404', label: 'Paused' },
    error: { bg: '#f8d7da', color: '#842029', label: 'Error' },
    attested: { bg: '#d4edda', color: '#2d6a4f', label: 'Attested' },
    pending: { bg: '#fff3cd', color: '#856404', label: 'Pending' },
  };
  const s = map[status] ?? map.pending;
  return (
    <span style={{
      background: s.bg, color: s.color,
      borderRadius: 99, padding: '3px 10px',
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700,
      fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>
      {s.label}
    </span>
  );
};

// ── Toast ──────────────────────────────────────────────────────────────────
interface ToastProps {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
}

export const Toast = ({ message, type, visible }: ToastProps) => (
  <div style={{
    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
    background: '#FBF7F0', borderRadius: 12,
    borderLeft: `3px solid ${type === 'success' ? '#2d6a4f' : '#842029'}`,
    padding: '14px 20px', boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 600, fontSize: 14,
    color: '#555555', maxWidth: 300,
    transform: visible ? 'translateY(0)' : 'translateY(100px)',
    opacity: visible ? 1 : 0,
    transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
    pointerEvents: 'none',
  }}>
    {message}
  </div>
);

// ── SectionLabel ──────────────────────────────────────────────────────────
export const SectionLabel = ({ children }: { children: ReactNode }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700,
    fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
    color: '#A8A49E', marginBottom: 16,
  }}>
    {children}
    <div style={{ flex: 1, height: 1, background: '#CDC9C3', opacity: 0.6 }} />
  </div>
);

// ── Toggle ─────────────────────────────────────────────────────────────────
export const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
  <button onClick={onToggle} style={{
    width: 48, height: 28, borderRadius: 99,
    background: on ? '#555555' : '#CDC9C3',
    border: 'none', cursor: 'pointer', position: 'relative',
    transition: 'background 0.2s', flexShrink: 0,
  }}>
    <div style={{
      position: 'absolute', top: 4, left: on ? 24 : 4,
      width: 20, height: 20, borderRadius: '50%', background: '#FBF7F0',
      transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
    }} />
  </button>
);

// ── KeyFingerprintCard ────────────────────────────────────────────────────
export const KeyFingerprintCard = ({ fingerprint }: { fingerprint: string }) => {
  const [blurred, setBlurred] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(fingerprint).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      background: '#D9E4DD', border: '1.5px solid #B8CFC8',
      borderRadius: 14, padding: '14px 16px',
      maxWidth: 400, width: '100%', animation: 'fadeIn 0.4s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8AADA4' }}>Security key ID</span>
        <div style={{ position: 'relative', display: 'inline-flex' }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}>
          <Icons.Info />
          {showTooltip && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
              marginBottom: 8, background: '#555555', color: '#FBF7F0',
              borderRadius: 10, padding: '8px 12px', width: 220,
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5,
              zIndex: 100, pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            }}>
              A unique fingerprint that identifies your security keys. Keep it private — it confirms your keys are authentic and haven&apos;t been tampered with.
              <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 10, height: 10, background: '#555555', clipPath: 'polygon(0 0,100% 0,50% 100%)' }} />
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setBlurred(v => !v)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#8AADA4', display: 'flex', alignItems: 'center', gap: 4,
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 600, fontSize: 11, padding: '2px 6px',
          borderRadius: 6, transition: 'color 0.15s',
        }}>
          {blurred ? <Icons.EyeOff /> : <Icons.Eye />}
          {blurred ? 'Reveal' : 'Hide'}
        </button>
        <button onClick={handleCopy} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: copied ? '#2d6a4f' : '#8AADA4', display: 'flex', alignItems: 'center', gap: 4,
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 600, fontSize: 11, padding: '2px 6px',
          borderRadius: 6, transition: 'color 0.15s',
        }}>
          {copied ? <Icons.Check size={13} /> : <Icons.Copy size={13} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div style={{
        fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 13, color: '#555555',
        wordBreak: 'break-all', lineHeight: 1.6,
        filter: blurred ? 'blur(5px)' : 'none',
        userSelect: blurred ? 'none' : 'text',
        transition: 'filter 0.3s',
        cursor: blurred ? 'pointer' : 'text',
      }} onClick={() => blurred && setBlurred(false)}>
        {fingerprint}
      </div>
      {blurred && (
        <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 11, color: '#8AADA4', marginTop: 6 }}>
          Click to reveal your security key ID
        </div>
      )}
    </div>
  );
};

// ── Row (for review/settings) ──────────────────────────────────────────────
export const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
    <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: '#A8A49E', letterSpacing: '0.04em' }}>{label}</span>
    {children}
  </div>
);

// ── Spinner ────────────────────────────────────────────────────────────────
export const Spinner = () => (
  <div style={{
    width: 18, height: 18, borderRadius: '50%',
    border: '2px solid #CDC9C3', borderTopColor: '#555555',
    animation: 'spin 0.8s linear infinite',
  }} />
);
