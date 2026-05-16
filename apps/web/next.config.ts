import type { NextConfig } from 'next';

const config: NextConfig = {
  images: { unoptimized: true },
  transpilePackages: ['@spike/pqc', '@spike/0g-client'],
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      child_process: false,   // 0g-compute-ts-sdk uses spawn/readline; never called in browser
      readline: false,
      // Optional peer deps from WalletConnect / MetaMask SDK — not needed in browser
      'pino-pretty': false,
      '@react-native-async-storage/async-storage': false,
    };
    // Stub out MetaMask SDK analytics to silence telemetry network errors in browser
    config.resolve.alias = {
      ...config.resolve.alias,
      '@metamask/sdk-analytics': require('path').resolve('./src/lib/stubs/metamask-sdk-analytics.js'),
    };
    return config;
  },
};

export default config;
