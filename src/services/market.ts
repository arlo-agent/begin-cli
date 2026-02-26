/**
 * Unified market data service combining Minswap, CoinGecko, and Binance
 */

import { createCoinGeckoClient, isCoinGeckoTicker } from './coingecko.js';

const MINSWAP_MAINNET_API = 'https://api-mainnet-prod.minswap.org';
const BINANCE_DATA_API = 'https://data-api.binance.vision/api/v3';

interface MinswapApiError extends Error {
  status?: number;
}

function minswapFetch<T>(url: string, options?: RequestInit): Promise<T> {
  return fetch(url, options).then(async (response) => {
    if (!response.ok) {
      const msg =
        response.status === 429
          ? 'Minswap rate limit exceeded. Please try again later.'
          : `Minswap API error: ${response.status}`;
      const err = new Error(msg) as MinswapApiError;
      err.status = response.status;
      throw err;
    }
    return response.json() as Promise<T>;
  });
}

/**
 * Token metrics from Minswap
 */
export interface TokenMetrics {
  tokenId: string;
  ticker: string;
  name: string;
  verified: boolean;
  priceUsd: number;
  priceAda: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  logoUrl?: string;
}

/**
 * Unified price data (works for both CoinGecko and Minswap tokens)
 */
export interface PriceData {
  ticker: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  currency: string;
  source: 'coingecko' | 'minswap';
}

/**
 * Binance kline (candlestick) data
 */
export interface KlineData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

/**
 * Minswap list asset (GET /v1/assets) - asset shape in list and inside metrics
 */
interface MinswapListAsset {
  currency_symbol: string;
  token_name: string;
  is_verified: boolean;
  /** Some assets return symbol at top level when ticker is empty */
  symbol?: string;
  metadata?: {
    name?: string;
    ticker?: string;
    symbol?: string;
    decimals?: number;
    logo?: string;
    url?: string;
    description?: string;
  };
}

/**
 * Minswap list assets response (GET /v1/assets)
 */
interface MinswapListAssetsResponse {
  search_after?: unknown;
  assets: MinswapListAsset[];
}

/**
 * Single item from POST /v1/assets/metrics or GET /v1/assets/:id/metrics
 */
interface MinswapAssetMetricsItem {
  asset: MinswapListAsset;
  price: number;
  price_change_1h?: number;
  price_change_24h: number;
  price_change_7d?: number;
  volume_1h?: number;
  volume_24h: number;
  volume_7d?: number;
  liquidity: number;
  market_cap: number;
  total_supply?: number;
  circulating_supply?: number;
}

/**
 * POST /v1/assets/metrics response
 */
interface MinswapMetricsResponse {
  search_after?: unknown;
  asset_metrics: MinswapAssetMetricsItem[];
}

/**
 * Search for Cardano native tokens on Minswap
 */
export async function searchTokens(
  term: string,
  limit: number = 20,
  onlyVerified: boolean = true,
  currency: string = 'usd'
): Promise<TokenMetrics[]> {
  const params = new URLSearchParams({
    term,
    limit: String(limit),
    only_verified: String(onlyVerified),
  });

  const raw = await minswapFetch<MinswapListAssetsResponse>(
    `${MINSWAP_MAINNET_API}/v1/assets?${params}`
  );
  const assets = Array.isArray(raw?.assets) ? raw.assets : [];

  // For search results, we need to fetch metrics separately to get price/volume
  // Asset ID format: policy_id.token_name (Cardano standard)
  if (assets.length === 0) return [];

  const tokenIds = assets.map((a) => `${a.currency_symbol}.${a.token_name}`);
  return getTokenMetrics(tokenIds, currency);
}

/**
 * Get trending/top tokens by volume
 */
export async function getTrendingTokens(
  limit: number = 20,
  currency: string = 'usd'
): Promise<TokenMetrics[]> {
  const data = await minswapFetch<MinswapMetricsResponse>(
    `${MINSWAP_MAINNET_API}/v1/assets/metrics`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: '',
        limit,
        only_verified: true,
        sort_direction: 'desc',
        sort_field: 'volume_24h',
        currency,
      }),
    }
  );
  const items = Array.isArray(data?.asset_metrics) ? data.asset_metrics : [];
  return items.map((item) => mapAssetMetricsItem(item, currency));
}

/**
 * Get metrics for specific token IDs
 */
export async function getTokenMetrics(
  tokenIds: string[],
  currency: string = 'usd'
): Promise<TokenMetrics[]> {
  // Minswap metrics endpoint accepts a POST with term to filter
  // We'll fetch top tokens and filter, or make individual calls
  const results: TokenMetrics[] = [];

  for (const tokenId of tokenIds) {
    try {
      const metrics = await getSingleTokenMetrics(tokenId, currency);
      if (metrics) results.push(metrics);
    } catch {
      // Skip tokens that fail
    }
  }

  return results;
}

/**
 * Get metrics for a single token by ID
 */
export async function getSingleTokenMetrics(
  tokenId: string,
  currency: string = 'usd'
): Promise<TokenMetrics | null> {
  try {
    const data = await minswapFetch<MinswapAssetMetricsItem>(
      `${MINSWAP_MAINNET_API}/v1/assets/${encodeURIComponent(tokenId)}/metrics?currency=${currency}`
    );
    return mapAssetMetricsItem(data, currency);
  } catch (err) {
    if (err instanceof Error && (err as MinswapApiError).status === 404) return null;
    throw err;
  }
}

/**
 * Search tokens by ticker and get the best match
 */
export async function findTokenByTicker(
  ticker: string,
  currency: string = 'usd'
): Promise<TokenMetrics | null> {
  const results = await searchTokens(ticker, 10, true, currency);

  // Find exact ticker match (case-insensitive)
  const tickerUpper = ticker.toUpperCase();
  const exactMatch = results.find((t) => t.ticker.toUpperCase() === tickerUpper);
  if (exactMatch) return exactMatch;

  // Return first result if no exact match
  return results[0] ?? null;
}

/**
 * Get unified price data for any supported token
 * - For ADA/BTC/SOL: uses CoinGecko
 * - For Cardano native tokens: uses Minswap
 */
export async function getPrice(
  ticker: string,
  currency: string = 'usd'
): Promise<PriceData | null> {
  const tickerUpper = ticker.toUpperCase();

  // Check if it's a base currency (CoinGecko)
  if (isCoinGeckoTicker(tickerUpper)) {
    const client = createCoinGeckoClient();
    const price = await client.getPrice(tickerUpper, currency);
    if (!price) return null;

    return {
      ticker: price.ticker,
      name: price.name,
      price: price.price,
      change24h: price.change24h,
      volume24h: price.volume24h,
      marketCap: price.marketCap,
      currency: price.currency,
      source: 'coingecko',
    };
  }

  // Otherwise, try Minswap for Cardano native tokens
  const token = await findTokenByTicker(tickerUpper, currency);
  if (!token) return null;

  return {
    ticker: token.ticker,
    name: token.name,
    price: token.priceUsd,
    change24h: token.change24h,
    volume24h: token.volume24h,
    marketCap: token.marketCap,
    currency,
    source: 'minswap',
  };
}

/**
 * Get Binance klines (candlestick) data for charting
 */
export async function getBinanceKlines(
  symbol: string,
  interval: string = '1d',
  limit: number = 30
): Promise<KlineData[]> {
  const params = new URLSearchParams({
    symbol,
    interval,
    limit: String(limit),
  });

  const response = await fetch(`${BINANCE_DATA_API}/klines?${params}`);

  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`);
  }

  const data = (await response.json()) as Array<[
    number, // Open time
    string, // Open
    string, // High
    string, // Low
    string, // Close
    string, // Volume
    number, // Close time
    string, // Quote asset volume
    number, // Number of trades
    string, // Taker buy base asset volume
    string, // Taker buy quote asset volume
    string  // Ignore
  ]>;

  return data.map((kline) => ({
    openTime: kline[0],
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5]),
    closeTime: kline[6],
  }));
}

/**
 * Get Binance symbol for a ticker pair
 */
export function getBinanceSymbol(ticker: string): string | null {
  const symbolMap: Record<string, string> = {
    ADA: 'ADAUSDT',
    BTC: 'BTCUSDT',
    SOL: 'SOLUSDT',
  };
  return symbolMap[ticker.toUpperCase()] ?? null;
}

/**
 * Map Minswap asset metrics item (list or single) to TokenMetrics
 */
function mapAssetMetricsItem(
  item: MinswapAssetMetricsItem,
  currency: string
): TokenMetrics {
  const { asset, price, price_change_24h, volume_24h, liquidity, market_cap } = item;
  const tokenId = `${asset.currency_symbol}.${asset.token_name}`;
  const meta = asset.metadata ?? {};
  const tickerRaw =
    meta.ticker?.trim() ||
    meta.symbol?.trim() ||
    asset.symbol?.trim() ||
    '';
  return {
    tokenId,
    ticker: tickerRaw,
    name: meta.name ?? '',
    verified: asset.is_verified,
    priceUsd: currency.toLowerCase() === 'usd' ? price : 0,
    priceAda: currency.toLowerCase() === 'ada' ? price : 0,
    change24h: price_change_24h ?? 0,
    volume24h: volume_24h ?? 0,
    liquidity: liquidity ?? 0,
    marketCap: market_cap ?? 0,
    logoUrl: meta.logo,
  };
}

/**
 * Format price for display
 */
export function formatPrice(price: number, decimals?: number): string {
  if (price === 0) return '$0.00';

  // Determine appropriate decimal places based on magnitude
  let dp = decimals;
  if (dp === undefined) {
    if (price >= 1000) dp = 2;
    else if (price >= 1) dp = 2;
    else if (price >= 0.01) dp = 4;
    else if (price >= 0.0001) dp = 6;
    else dp = 10;
  }

  return `$${price.toFixed(dp)}`;
}

/**
 * Format percentage change for display
 */
export function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

/**
 * Format large numbers with K/M/B suffixes
 */
export function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
