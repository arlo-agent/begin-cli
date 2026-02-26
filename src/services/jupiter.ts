/**
 * Jupiter API client for Solana token discovery and pricing
 */

import type { TokenMetrics } from "./market.js";

const JUPITER_API = "https://api.jup.ag";

/**
 * Binance symbol map for known Solana tokens (mint address → ticker)
 */
export const BINANCE_SYMBOL_MAP: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "JUP",
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: "PYTH",
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "BONK",
  Ekv6AednR4s5XnKGcc8gYkHsUia7mYUiTz72S9U1jmGe: "WIF",
  mSoLz3r7P3F5Hk2Z1uP1D3SUw3j1X9Grz4BfGz5a6dM: "MSOL",
  So11111111111111111111111111111111111111112: "SOL",
};

/**
 * Tokens available on Binance for price data
 */
export const BINANCE_SYMBOL_ALLOWLIST = [
  "SOL", "JUP", "BONK", "PYTH", "RAY", "WIF", "RNDR", "HNT", "JTO", "MSOL", "USDC", "USDT",
];

/**
 * Jupiter token shape from the verified token list
 */
interface JupiterToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
  daily_volume?: number;
}

/**
 * Jupiter price API response
 */
interface JupiterPriceResponse {
  data: Record<string, {
    id: string;
    type: string;
    price: string;
  }>;
  timeTaken: number;
}

// In-memory cache for the verified token list
let cachedTokenList: JupiterToken[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch the Jupiter verified token list (cached)
 */
async function fetchVerifiedTokenList(): Promise<JupiterToken[]> {
  const now = Date.now();
  if (cachedTokenList && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedTokenList;
  }

  const response = await fetch(`${JUPITER_API}/tokens/v1`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Jupiter API error: ${response.status}`);
  }

  const data = (await response.json()) as JupiterToken[];
  cachedTokenList = Array.isArray(data) ? data : [];
  cacheTimestamp = now;
  return cachedTokenList;
}

/**
 * Search Solana tokens by name or symbol
 */
export async function searchSolanaTokens(
  term: string,
  limit: number = 20
): Promise<TokenMetrics[]> {
  const tokens = await fetchVerifiedTokenList();
  const termLower = term.toLowerCase();

  const matches = tokens
    .filter(
      (t) =>
        t.symbol.toLowerCase().includes(termLower) ||
        t.name.toLowerCase().includes(termLower)
    )
    .slice(0, limit);

  if (matches.length === 0) return [];

  // Fetch prices for matched tokens
  const mintAddresses = matches.map((t) => t.address);
  const prices = await getJupiterPrices(mintAddresses);

  return matches.map((t) => mapJupiterToken(t, prices));
}

/**
 * Get trending Solana tokens (by daily volume from Jupiter)
 */
export async function getTrendingSolanaTokens(
  limit: number = 20
): Promise<TokenMetrics[]> {
  const tokens = await fetchVerifiedTokenList();

  // Sort by daily_volume descending (if available), otherwise just return top tokens
  const sorted = [...tokens]
    .filter((t) => t.daily_volume && t.daily_volume > 0)
    .sort((a, b) => (b.daily_volume ?? 0) - (a.daily_volume ?? 0))
    .slice(0, limit);

  if (sorted.length === 0) {
    // Fallback: return well-known tokens
    const wellKnown = Object.keys(BINANCE_SYMBOL_MAP);
    const fallback = tokens
      .filter((t) => wellKnown.includes(t.address))
      .slice(0, limit);
    const mintAddresses = fallback.map((t) => t.address);
    const prices = await getJupiterPrices(mintAddresses);
    return fallback.map((t) => mapJupiterToken(t, prices));
  }

  const mintAddresses = sorted.map((t) => t.address);
  const prices = await getJupiterPrices(mintAddresses);
  return sorted.map((t) => mapJupiterToken(t, prices));
}

/**
 * Get prices from Jupiter Price API for multiple mint addresses
 */
export async function getJupiterPrices(
  mintAddresses: string[]
): Promise<Record<string, number>> {
  if (mintAddresses.length === 0) return {};

  const ids = mintAddresses.join(",");
  const response = await fetch(`${JUPITER_API}/price/v2?ids=${ids}`);

  if (!response.ok) {
    // Don't throw - return empty prices
    return {};
  }

  const data = (await response.json()) as JupiterPriceResponse;
  const prices: Record<string, number> = {};

  for (const [address, info] of Object.entries(data.data ?? {})) {
    if (info?.price) {
      prices[address] = parseFloat(info.price);
    }
  }

  return prices;
}

/**
 * Get Jupiter price for a single mint address
 */
export async function getJupiterPrice(
  mintAddress: string
): Promise<number | null> {
  const prices = await getJupiterPrices([mintAddress]);
  return prices[mintAddress] ?? null;
}

/**
 * Find a Solana token by ticker symbol
 */
export async function findSolanaTokenByTicker(
  ticker: string
): Promise<JupiterToken | null> {
  const tokens = await fetchVerifiedTokenList();
  const tickerUpper = ticker.toUpperCase();

  // Exact symbol match first
  const exact = tokens.find((t) => t.symbol.toUpperCase() === tickerUpper);
  if (exact) return exact;

  return null;
}

/**
 * Check if a ticker is a known Solana token on Binance
 */
export function isBinanceSolanaToken(ticker: string): boolean {
  return BINANCE_SYMBOL_ALLOWLIST.includes(ticker.toUpperCase());
}

/**
 * Get the mint address for a known Binance symbol
 */
export function getMintAddressForSymbol(symbol: string): string | null {
  const symbolUpper = symbol.toUpperCase();
  for (const [address, sym] of Object.entries(BINANCE_SYMBOL_MAP)) {
    if (sym === symbolUpper) return address;
  }
  return null;
}

/**
 * Map a Jupiter token to TokenMetrics format
 */
function mapJupiterToken(
  token: JupiterToken,
  prices: Record<string, number>
): TokenMetrics {
  const price = prices[token.address] ?? 0;
  return {
    tokenId: token.address,
    ticker: token.symbol,
    name: token.name,
    verified: true,
    priceUsd: price,
    priceAda: 0,
    change24h: 0,
    volume24h: token.daily_volume ?? 0,
    liquidity: 0,
    marketCap: 0,
    logoUrl: token.logoURI,
  };
}
