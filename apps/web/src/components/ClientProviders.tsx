'use client';

import dynamic from 'next/dynamic';

// ssr: false stops WalletConnect/MetaMask SDK from accessing browser-only APIs
// (indexedDB) during Next.js static export's server-side page collection.
// Must live in a 'use client' component — Next.js 15 forbids ssr:false in Server Components.
const Web3Provider = dynamic(
  () => import('@/lib/wagmi/provider').then((m) => ({ default: m.Web3Provider })),
  { ssr: false }
);

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <Web3Provider>{children}</Web3Provider>;
}
