import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? '';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun',
      viaIR: true,
    },
  },
  networks: {
    testnet: {
      url: 'https://evmrpc-testnet.0g.ai',
      chainId: 16602,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    mainnet: {
      url: 'https://evmrpc.0g.ai',
      chainId: 16661,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      testnet: process.env.ETHERSCAN_API_KEY ?? 'no-api-key',
      mainnet: process.env.ETHERSCAN_API_KEY ?? 'no-api-key',
    },
    customChains: [
      {
        network: 'testnet',
        chainId: 16602,
        urls: {
          apiURL: 'https://chainscan-galileo.0g.ai/open/api',
          browserURL: 'https://chainscan-galileo.0g.ai',
        },
      },
      {
        network: 'mainnet',
        chainId: 16661,
        urls: {
          apiURL: 'https://chainscan.0g.ai/open/api',
          browserURL: 'https://chainscan.0g.ai',
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
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
