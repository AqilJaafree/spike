import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@spike/pqc', '@spike/0g-client'],
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      // Optional peer deps from WalletConnect / MetaMask SDK — not needed in browser
      'pino-pretty': false,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
};

export default config;
