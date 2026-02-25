/**
 * CoinGecko API client for cryptocurrency price data
 *
 * Free tier: ~30 requests/minute (no API key needed for basic endpoints)
 */

const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';

/**
 * Supported base currencies on CoinGecko
 */
export type CoinGeckoId = 'cardano' | 'bitcoin' | 'solana';

/**
 * Map of ticker symbols to CoinGecko IDs
 */
const TICKER_TO_ID: Record<string, CoinGeckoId> = {
  ADA: 'cardano',
  BTC: 'bitcoin',
  SOL: 'solana',
};

/**
 * Price data for a single coin
 */
export interface CoinGeckoPrice {
  id: CoinGeckoId;
  ticker: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  currency: string;
}

/**
 * API response type for simple/price endpoint
 */
interface SimplePriceResponse {
  [id: string]: {
    usd?: number;
    eur?: number;
    usd_24h_change?: number;
    eur_24h_change?: number;
    usd_market_cap?: number;
    eur_market_cap?: number;
    usd_24h_vol?: number;
    eur_24h_vol?: number;
  };
}

/**
 * Check if a ticker is supported by CoinGecko (base currencies)
 */
export function isCoinGeckoTicker(ticker: string): boolean {
  return ticker.toUpperCase() in TICKER_TO_ID;
}

/**
 * Get CoinGecko ID from ticker symbol
 */
export function getCoinGeckoId(ticker: string): CoinGeckoId | null {
  return TICKER_TO_ID[ticker.toUpperCase()] ?? null;
}

/**
 * Coin name mapping
 */
const COIN_NAMES: Record<CoinGeckoId, string> = {
  cardano: 'Cardano',
  bitcoin: 'Bitcoin',
  solana: 'Solana',
};

/**
 * CoinGecko API client
 */
export class CoinGeckoClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = COINGECKO_API_URL;
  }

  /**
   * Fetch price data for multiple coins
   */
  async getPrices(
    ids: CoinGeckoId[],
    currency: string = 'usd'
  ): Promise<Map<CoinGeckoId, CoinGeckoPrice>> {
    const currencyLower = currency.toLowerCase();
    const params = new URLSearchParams({
      ids: ids.join(','),
      vs_currencies: currencyLower,
      include_24hr_change: 'true',
      include_market_cap: 'true',
      include_24hr_vol: 'true',
    });

    const response = await fetch(`${this.baseUrl}/simple/price?${params}`);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('CoinGecko rate limit exceeded. Please try again later.');
      }
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = (await response.json()) as SimplePriceResponse;
    const result = new Map<CoinGeckoId, CoinGeckoPrice>();

    for (const id of ids) {
      const coinData = data[id];
      if (!coinData) continue;

      const price = coinData[`${currencyLower}` as keyof typeof coinData] as number | undefined;
      const change24h = coinData[`${currencyLower}_24h_change` as keyof typeof coinData] as number | undefined;
      const marketCap = coinData[`${currencyLower}_market_cap` as keyof typeof coinData] as number | undefined;
      const volume24h = coinData[`${currencyLower}_24h_vol` as keyof typeof coinData] as number | undefined;

      // Get ticker from ID
      const ticker = Object.entries(TICKER_TO_ID).find(([_, v]) => v === id)?.[0] ?? id.toUpperCase();

      result.set(id, {
        id,
        ticker,
        name: COIN_NAMES[id],
        price: price ?? 0,
        change24h: change24h ?? 0,
        marketCap: marketCap ?? 0,
        volume24h: volume24h ?? 0,
        currency: currencyLower,
      });
    }

    return result;
  }

  /**
   * Fetch price data for a single coin by ticker
   */
  async getPrice(ticker: string, currency: string = 'usd'): Promise<CoinGeckoPrice | null> {
    const id = getCoinGeckoId(ticker);
    if (!id) return null;

    const prices = await this.getPrices([id], currency);
    return prices.get(id) ?? null;
  }

  /**
   * Fetch prices for all supported base currencies
   */
  async getAllBasePrices(currency: string = 'usd'): Promise<CoinGeckoPrice[]> {
    const ids: CoinGeckoId[] = ['cardano', 'bitcoin', 'solana'];
    const prices = await this.getPrices(ids, currency);
    return Array.from(prices.values());
  }
}

/**
 * Create a CoinGecko client instance
 */
export function createCoinGeckoClient(): CoinGeckoClient {
  return new CoinGeckoClient();
}
