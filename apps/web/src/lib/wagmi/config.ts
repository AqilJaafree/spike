'use client';

import { createConfig, http, type Config } from 'wagmi';
import { defineChain } from 'viem';
import { metaMask, walletConnect, coinbaseWallet } from 'wagmi/connectors';

export const zgTestnet = defineChain({
  id: 16602,
  name: '0G Testnet',
  nativeCurrency: { name: '0G', symbol: 'OG', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc-testnet.0g.ai'] } },
  blockExplorers: { default: { name: '0G Explorer', url: 'https://chainscan-galileo.0g.ai' } },
});

export const zgMainnet = defineChain({
  id: 16661,
  name: '0G Mainnet',
  nativeCurrency: { name: '0G', symbol: 'OG', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc.0g.ai'] } },
  blockExplorers: { default: { name: '0G Explorer', url: 'https://chainscan.0g.ai' } },
});

const isBrowser = typeof window !== 'undefined';

export const wagmiConfig: Config = createConfig({
  ssr: true,
  chains: [zgTestnet, zgMainnet],
  connectors: isBrowser ? [
    metaMask(),
    walletConnect({ projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? '' }),
    coinbaseWallet({ appName: 'Spike' }),
  ] : [],
  transports: {
    [zgTestnet.id]: http('https://evmrpc-testnet.0g.ai', { retryCount: 5, retryDelay: 1500 }),
    [zgMainnet.id]: http('https://evmrpc.0g.ai',         { retryCount: 3, retryDelay: 1000 }),
  },
});
