'use client';

export const Icons = {
  Sun: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
    </svg>
  ),
  Shield: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L3 7v5c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7L12 2z"/>
    </svg>
  ),
  ShieldLg: () => (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L3 7v5c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7L12 2z"/>
    </svg>
  ),
  Lock: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  Activity: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  Analytics: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-4"/>
    </svg>
  ),
  Settings: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  Check: ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  X: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Copy: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  ExternalLink: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  ),
  AlertTriangle: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  Pause: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
    </svg>
  ),
  Play: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  Download: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  RotateCw: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  Plus: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  Eye: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  EyeOff: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ),
  Info: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8AADA4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'help', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  ),
  Metamask: () => (
    <svg width="28" height="28" viewBox="0 0 35 33" fill="none">
      <path d="M32.9 1L19.4 10.7l2.5-5.9L32.9 1z" fill="#E17726" stroke="#E17726" strokeWidth=".25"/>
      <path d="M2.1 1l13.4 9.8-2.4-5.9L2.1 1z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
      <path d="M28.2 23.5l-3.6 5.5 7.7 2.1 2.2-7.5-6.3-.1z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
      <path d="M1.5 23.6l2.2 7.5 7.7-2.1-3.6-5.5-6.3.1z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
      <path d="M11 14.5l-2.1 3.2 7.5.3-.2-8.1L11 14.5z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
      <path d="M24 14.5l-5.3-4.7-.2 8.1 7.5-.3L24 14.5z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
      <path d="M11.4 29l4.5-2.2-3.9-3-.6 5.2z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
      <path d="M19.1 26.8l4.5 2.2-.6-5.2-3.9 3z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
    </svg>
  ),
  WalletConnect: () => (
    <svg width="28" height="28" viewBox="0 0 300 185" fill="none">
      <path d="M61.4 36.3c48.8-47.8 127.9-47.8 176.7 0l5.9 5.7a6 6 0 0 1 0 8.6L225.3 69a3.2 3.2 0 0 1-4.4 0l-8-7.9c-34-33.3-89.2-33.3-123.2 0l-8.6 8.4a3.2 3.2 0 0 1-4.4 0L57.8 50.7a6 6 0 0 1 0-8.6l3.6-5.8zM284.7 77.3l18.4 18a6 6 0 0 1 0 8.5L218 189.8a6.3 6.3 0 0 1-8.9 0l-60.7-59.5a1.6 1.6 0 0 0-2.2 0l-60.7 59.5a6.3 6.3 0 0 1-8.9 0L1.9 103.8a6 6 0 0 1 0-8.5l18.4-18a6.3 6.3 0 0 1 8.9 0l60.7 59.5c.6.6 1.6.6 2.2 0l60.7-59.5a6.3 6.3 0 0 1 8.9 0l60.7 59.5c.6.6 1.6.6 2.2 0l60.7-59.5a6.3 6.3 0 0 1 9 0z" fill="#3396FF"/>
    </svg>
  ),
  Coinbase: () => (
    <svg width="28" height="28" viewBox="0 0 1000 1000" fill="none">
      <rect width="1000" height="1000" rx="200" fill="#1652F0"/>
      <path d="M500 150C306.7 150 150 306.7 150 500s156.7 350 350 350 350-156.7 350-350S693.3 150 500 150zm-87.5 437.5h175c19.1 0 34.7-15.6 34.7-34.7v-105.6c0-19.1-15.6-34.7-34.7-34.7h-175c-19.1 0-34.7 15.6-34.7 34.7v105.6c0 19.1 15.6 34.7 34.7 34.7z" fill="white"/>
    </svg>
  ),
};
