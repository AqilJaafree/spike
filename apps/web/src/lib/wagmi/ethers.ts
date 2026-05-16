import { BrowserProvider, JsonRpcSigner } from 'ethers';
import type { WalletClient } from 'viem';

// Bridges a viem WalletClient (wagmi) to an ethers v6 JsonRpcSigner.
// Needed because @0gfoundation/0g-storage-ts-sdk expects an ethers Signer.
export async function walletClientToSigner(walletClient: WalletClient): Promise<JsonRpcSigner> {
  const provider = new BrowserProvider(walletClient.transport as any, walletClient.chain?.id);
  return provider.getSigner(walletClient.account?.address);
}
