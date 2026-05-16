import OpenAI from 'openai';
import type { Signer } from 'ethers';
import type { MarketRegime } from '../types.js';

const INFERENCE_PROVIDER = process.env.ZG_INFERENCE_PROVIDER ?? '';

// Lazy import — only resolved when ZG_INFERENCE_PROVIDER is actually set.
// The static ESM re-export chain in @0glabs/0g-serving-broker triggers a
// Node.js linker error under tsx; deferring to dynamic import avoids it.
async function loadBroker() {
  const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
  return createZGComputeNetworkBroker;
}

export async function createBroker(signer: Signer) {
  const createZGComputeNetworkBroker = await loadBroker();
  return createZGComputeNetworkBroker(signer as any);
}

export async function setupLedger(signer: Signer, fundAmount = 3): Promise<void> {
  const broker = await createBroker(signer);
  await broker.ledger.addLedger(fundAmount);
  await broker.inference.acknowledgeProviderSigner(INFERENCE_PROVIDER);
  const { parseEther } = await import('ethers');
  await broker.ledger.transferFund(INFERENCE_PROVIDER, 'inference', parseEther('1'));
}

export async function inferMarketRegime(
  signer: Signer,
  priceHistory: Array<{ asset: string; prices: number[] }>
): Promise<MarketRegime> {
  if (!INFERENCE_PROVIDER) return heuristicRegime(priceHistory);

  try {
    const broker = await createBroker(signer);
    const { endpoint, model } = await broker.inference.getServiceMetadata(INFERENCE_PROVIDER);
    const content = `Price history: ${JSON.stringify(priceHistory)}. Classify as bull, bear, sideways, or volatile. One word only.`;
    const headers = await broker.inference.getRequestHeaders(INFERENCE_PROVIDER, content);
    const openai = new OpenAI({ baseURL: endpoint, apiKey: '' });

    const response = await openai.chat.completions.create(
      { model, messages: [{ role: 'user', content }] },
      { headers } as any
    );

    const reply = response.choices[0].message.content?.trim().toLowerCase() ?? 'sideways';
    await broker.inference.processResponse(INFERENCE_PROVIDER, response.id, reply);
    const valid: MarketRegime[] = ['bull', 'bear', 'sideways', 'volatile'];
    return valid.includes(reply as MarketRegime) ? (reply as MarketRegime) : 'sideways';
  } catch {
    return heuristicRegime(priceHistory);
  }
}

// Local fallback when 0G Compute provider is not configured
function heuristicRegime(priceHistory: Array<{ asset: string; prices: number[] }>): MarketRegime {
  if (!priceHistory.length) return 'sideways';
  const changes = priceHistory.map(({ prices }) =>
    prices.length < 2 ? 0 : (prices[prices.length - 1] - prices[0]) / prices[0]
  );
  const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
  const vol = Math.sqrt(changes.reduce((a, b) => a + (b - avg) ** 2, 0) / changes.length);
  if (vol > 0.1) return 'volatile';
  if (avg > 0.05) return 'bull';
  if (avg < -0.05) return 'bear';
  return 'sideways';
}
