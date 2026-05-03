import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import OpenAI from 'openai';
import type { ethers } from 'ethers';
import type { MarketRegime } from '../types.js';

const CHAIN_ID = parseInt(process.env.ZG_CHAIN_ID ?? '16602');
const INFERENCE_PROVIDER = process.env.ZG_INFERENCE_PROVIDER ?? '';

export async function createBroker(signer: ethers.Signer) {
  return createZGComputeNetworkBroker(signer as any, CHAIN_ID);
}

export async function setupLedger(signer: ethers.Signer, fundAmountEth = '3'): Promise<void> {
  const broker = await createBroker(signer);
  const { ethers } = await import('ethers');
  await broker.ledger.addLedger(ethers.parseEther(fundAmountEth));
  await broker.inference.acknowledgeProviderSigner(INFERENCE_PROVIDER);
  await broker.ledger.transferFund(INFERENCE_PROVIDER, 'inference', ethers.parseEther('1'));
}

export async function inferMarketRegime(
  signer: ethers.Signer,
  priceHistory: Array<{ asset: string; prices: number[] }>
): Promise<MarketRegime> {
  const broker = await createBroker(signer);
  const { endpoint, model } = await broker.inference.getServiceMetadata(INFERENCE_PROVIDER);

  const messages = [
    {
      role: 'system' as const,
      content: 'Classify the current market regime as one of: bull, bear, sideways, volatile. Respond with exactly one word.',
    },
    {
      role: 'user' as const,
      content: `Price history (last 30 days per asset): ${JSON.stringify(priceHistory)}`,
    },
  ];

  const headers = await broker.inference.getRequestHeaders(INFERENCE_PROVIDER, messages);
  const openai = new OpenAI({ baseURL: endpoint, apiKey: '' });

  const response = await openai.chat.completions.create(
    { model, messages },
    { headers } as any
  );

  const content = response.choices[0].message.content?.trim().toLowerCase() ?? 'sideways';
  await broker.inference.processResponse(INFERENCE_PROVIDER, response.id, content);

  const valid: MarketRegime[] = ['bull', 'bear', 'sideways', 'volatile'];
  return valid.includes(content as MarketRegime) ? (content as MarketRegime) : 'sideways';
}
