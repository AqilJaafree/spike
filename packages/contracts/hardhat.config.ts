import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? '';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    'zg-testnet': {
      url: 'https://evmrpc-testnet.0g.ai',
      chainId: 16602,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    'zg-mainnet': {
      url: 'https://evmrpc.0g.ai',
      chainId: 16661,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
  paths: {
    sources: './contracts',
    tests: './test',
    artifacts: './artifacts',
  },
};

export default config;
