export const ZG_CONFIG = {
  testnet: {
    chainId: 16602,
    rpcUrl: 'https://evmrpc-testnet.0g.ai',
    indexerUrl: 'https://indexer-storage-turbo-testnet.0g.ai',
  },
  mainnet: {
    chainId: 16661,
    rpcUrl: 'https://evmrpc.0g.ai',
    indexerUrl: 'https://indexer-storage-turbo.0g.ai',
  },
} as const;

export const ACTIVE_NETWORK = (process.env.NEXT_PUBLIC_ZG_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
export const ZG = ZG_CONFIG[ACTIVE_NETWORK];
