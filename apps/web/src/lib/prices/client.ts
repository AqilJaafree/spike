const COINGECKO_IDS: Record<string, string> = {
  ETH:  'ethereum',
  BTC:  'bitcoin',
  SOL:  'solana',
  USDC: 'usd-coin',
  ARB:  'arbitrum',
  OP:   'optimism',
  LINK: 'chainlink',
  AAVE: 'aave',
  MATIC:'matic-network',
  AVAX: 'avalanche-2',
};

export async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  const ids = symbols.map(s => COINGECKO_IDS[s]).filter(Boolean).join(',');
  if (!ids) return {};
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = await res.json() as Record<string, { usd: number }>;
  const out: Record<string, number> = {};
  for (const sym of symbols) {
    const price = data[COINGECKO_IDS[sym]]?.usd;
    if (price != null) out[sym] = price;
  }
  return out;
}

export function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (price >= 1)    return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}
