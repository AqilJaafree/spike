import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@spike/pqc', '@spike/0g-client'],
  webpack: (config) => {
    // Required for liboqs-js WASM and ethers in the browser
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

export default config;
