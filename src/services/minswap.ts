/**
 * Minswap Aggregator API client for Cardano DEX operations
 * 
 * Documentation: https://docs.minswap.org/developer/aggregator-api
 * 
 * Supports:
 * - Price estimation and routing
 * - Transaction building
 * - Transaction submission
 */

// API endpoints by network
const MINSWAP_API_URLS: Record<string, string> = {
  mainnet: 'https://agg-api.minswap.org/aggregator',
};

/**
 * Token information from search
 */
export interface MinswapToken {
  tokenId: string;
  ticker: string;
  name: string;
  decimals: number;
  verified: boolean;
  logoUrl?: string;
  priceByAda?: number | null;
  projectName?: string | null;
}

export type Protocol =
  | 'MinswapV2'
  | 'Minswap'
  | 'MinswapStable'
  | 'MuesliSwap'
  | 'Splash'
  | 'SundaeSwapV3'
  | 'SundaeSwap'
  | 'VyFinance'
  | 'CswapV1'
  | 'WingRidersV2'
  | 'WingRiders'
  | 'WingRidersStableV2'
  | 'Spectrum'
  | 'SplashStable';

/**
 * Route leg information
 */
export interface SwapPathHop {
  poolId: string;
  protocol: Protocol;
  lpToken: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  lpFee: string;
  dexFee: string;
  deposits: string;
  priceImpact: number;
}

export interface EstimateRequest {
  amount: string;
  tokenIn: string;
  tokenOut: string;
  slippage: number;
  includeProtocols?: Protocol[];
  excludeProtocols?: Protocol[];
  allowMultiHops?: boolean;
  partner?: string;
  amountInDecimal?: boolean;
}

/**
 * Estimate response from /estimate endpoint
 */
export interface SwapEstimate {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  totalLpFee: string;
  totalDexFee: string;
  deposits: string;
  avgPriceImpact: number;
  aggregatorFee: string;
  aggregatorFeePercent: number;
  paths: SwapPathHop[][];
  amountInDecimal: boolean;
}

/**
 * Build transaction response
 */
export interface BuildTxResponse {
  cbor: string;
  estimatedFee?: string;
}

/**
 * Submit transaction response
 */
export interface SubmitTxResponse {
  txId: string;
}

/**
 * Pending order information
 */
export interface PendingOrder {
  ownerAddress: string;
  protocol: Protocol;
  tokenIn: MinswapToken;
  tokenOut: MinswapToken;
  amountIn: string;
  minAmountOut: string;
  createdAt: number;
  txIn: string;
  dexFee: string;
  deposit: string;
}

/**
 * API error response
 */
export interface MinswapApiError {
  error: string;
  message: string;
  statusCode: number;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a status code is retryable (429 or 5xx)
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Add jitter (±25%)
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(cappedDelay + jitter);
}

/**
 * Minswap Aggregator API client
 */
export class MinswapClient {
  private baseUrl: string;
  private network: string;
  private partner?: string;
  private retryConfig: RetryConfig;

  constructor(network: string, partner?: string, retryConfig?: Partial<RetryConfig>) {
    const url = MINSWAP_API_URLS[network];
    if (!url) {
      throw new Error(`Unsupported network: ${network}. Use mainnet.`);
    }
    this.baseUrl = url;
    this.network = network;
    this.partner = partner;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Make API request with error handling and retry logic
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        if (!response.ok) {
          // Check if this is a retryable error
          if (isRetryableStatus(response.status) && attempt < this.retryConfig.maxRetries) {
            const delay = calculateBackoffDelay(
              attempt,
              this.retryConfig.baseDelayMs,
              this.retryConfig.maxDelayMs
            );
            console.warn(
              `Minswap API returned ${response.status}, retrying in ${delay}ms ` +
              `(attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`
            );
            await sleep(delay);
            continue;
          }

          let errorMessage = `Minswap API error: ${response.status}`;
          try {
            const errorData = await response.json() as MinswapApiError;
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            // Use default error message
          }
          throw new Error(errorMessage);
        }

        return response.json() as Promise<T>;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        
        // Only retry on network errors or retryable status codes
        // If it's not a network error (i.e., we got a response), don't retry
        if (err instanceof TypeError && err.message.includes('fetch')) {
          // Network error - retry
          if (attempt < this.retryConfig.maxRetries) {
            const delay = calculateBackoffDelay(
              attempt,
              this.retryConfig.baseDelayMs,
              this.retryConfig.maxDelayMs
            );
            console.warn(
              `Network error, retrying in ${delay}ms ` +
              `(attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`
            );
            await sleep(delay);
            continue;
          }
        }
        throw lastError;
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  private mapAsset(asset: {
    token_id: string;
    logo?: string | null;
    ticker?: string | null;
    is_verified?: boolean | null;
    price_by_ada?: number | null;
    project_name?: string | null;
    decimals?: number | null;
  }): MinswapToken {
    return {
      tokenId: asset.token_id,
      ticker: asset.ticker ?? asset.token_id.slice(0, 8).toUpperCase() + '...',
      name: asset.project_name ?? asset.ticker ?? 'Unknown Token',
      decimals: asset.decimals ?? 0,
      verified: asset.is_verified ?? false,
      logoUrl: asset.logo ?? undefined,
      priceByAda: asset.price_by_ada ?? null,
      projectName: asset.project_name ?? null,
    };
  }

  /**
   * Get current ADA price in a currency
   */
  async getAdaPrice(currency: string = 'usd'): Promise<{ price: number; change24h: number }> {
    const params = new URLSearchParams({ currency });
    const response = await this.request<{
      currency: string;
      value: { price: number; change_24h: number } | null;
    }>(`/ada-price?${params}`);

    return {
      price: response.value?.price ?? 0,
      change24h: response.value?.change_24h ?? 0,
    };
  }

  /**
   * Get wallet balances
   */
  async getWalletBalances(
    address: string,
    amountInDecimal: boolean = true
  ): Promise<{
    wallet: string;
    ada: string;
    minimumLovelace: string;
    balance: Array<{ asset: MinswapToken; amount: string }>;
    amountInDecimal: boolean;
  }> {
    const params = new URLSearchParams({
      address,
      amount_in_decimal: String(amountInDecimal),
    });
    const response = await this.request<{
      wallet: string;
      ada: string;
      minimum_lovelace: string;
      balance: Array<{ asset: Parameters<MinswapClient['mapAsset']>[0]; amount: string }>;
      amount_in_decimal: boolean;
    }>(`/wallet?${params}`);

    return {
      wallet: response.wallet,
      ada: response.ada,
      minimumLovelace: response.minimum_lovelace,
      balance: response.balance.map((entry) => ({
        asset: this.mapAsset(entry.asset),
        amount: entry.amount,
      })),
      amountInDecimal: response.amount_in_decimal,
    };
  }

  /**
   * Search for tokens
   */
  async searchTokens(
    query: string,
    onlyVerified: boolean = true,
    assets?: string[],
    searchAfter?: string[]
  ): Promise<{
    tokens: MinswapToken[];
    searchAfter?: string[];
  }> {
    const response = await this.request<{
      tokens: Array<Parameters<MinswapClient['mapAsset']>[0]>;
      search_after?: string[];
    }>('/tokens', {
      method: 'POST',
      body: JSON.stringify({
        query,
        only_verified: onlyVerified,
        assets,
        search_after: searchAfter,
      }),
    });

    return {
      tokens: response.tokens.map((token) => this.mapAsset(token)),
      searchAfter: response.search_after,
    };
  }

  /**
   * Get swap estimate/quote
   */
  async estimate(params: EstimateRequest): Promise<SwapEstimate> {
    const body: Record<string, unknown> = {
      token_in: params.tokenIn,
      token_out: params.tokenOut,
      amount: params.amount,
      slippage: params.slippage,
      allow_multi_hops: params.allowMultiHops ?? true,
      amount_in_decimal: params.amountInDecimal ?? true,
    };

    if (params.includeProtocols) {
      body.include_protocols = params.includeProtocols;
    }

    if (params.excludeProtocols) {
      body.exclude_protocols = params.excludeProtocols;
    }

    if (params.partner || this.partner) {
      body.partner = params.partner ?? this.partner;
    }

    const response = await this.request<{
      token_in: string;
      token_out: string;
      amount_in: string;
      amount_out: string;
      min_amount_out: string;
      total_lp_fee: string;
      total_dex_fee: string;
      deposits: string;
      avg_price_impact: number;
      paths: Array<
        Array<{
          pool_id: string;
          protocol: Protocol;
          lp_token: string;
          token_in: string;
          token_out: string;
          amount_in: string;
          amount_out: string;
          min_amount_out: string;
          lp_fee: string;
          dex_fee: string;
          deposits: string;
          price_impact: number;
        }>
      >;
      aggregator_fee: string;
      aggregator_fee_percent: number;
      amount_in_decimal: boolean;
    }>('/estimate', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      tokenIn: response.token_in,
      tokenOut: response.token_out,
      amountIn: response.amount_in,
      amountOut: response.amount_out,
      minAmountOut: response.min_amount_out,
      totalLpFee: response.total_lp_fee,
      totalDexFee: response.total_dex_fee,
      deposits: response.deposits,
      avgPriceImpact: response.avg_price_impact,
      aggregatorFee: response.aggregator_fee,
      aggregatorFeePercent: response.aggregator_fee_percent,
      paths: response.paths.map((path) =>
        path.map((hop) => ({
          poolId: hop.pool_id,
          protocol: hop.protocol,
          lpToken: hop.lp_token,
          tokenIn: hop.token_in,
          tokenOut: hop.token_out,
          amountIn: hop.amount_in,
          amountOut: hop.amount_out,
          minAmountOut: hop.min_amount_out,
          lpFee: hop.lp_fee,
          dexFee: hop.dex_fee,
          deposits: hop.deposits,
          priceImpact: hop.price_impact,
        }))
      ),
      amountInDecimal: response.amount_in_decimal,
    };
  }

  /**
   * Build unsigned swap transaction
   */
  async buildTx(params: {
    sender: string;
    minAmountOut: string;
    estimate: EstimateRequest;
    inputsToChoose?: string[];
    amountInDecimal?: boolean;
  }): Promise<BuildTxResponse> {
    const estimateBody: Record<string, unknown> = {
      amount: params.estimate.amount,
      token_in: params.estimate.tokenIn,
      token_out: params.estimate.tokenOut,
      slippage: params.estimate.slippage,
    };

    if (params.estimate.includeProtocols) {
      estimateBody.include_protocols = params.estimate.includeProtocols;
    }

    if (params.estimate.excludeProtocols) {
      estimateBody.exclude_protocols = params.estimate.excludeProtocols;
    }

    if (typeof params.estimate.allowMultiHops === 'boolean') {
      estimateBody.allow_multi_hops = params.estimate.allowMultiHops;
    }

    if (params.estimate.partner) {
      estimateBody.partner = params.estimate.partner;
    }

    const body: Record<string, unknown> = {
      sender: params.sender,
      min_amount_out: params.minAmountOut,
      estimate: estimateBody,
    };

    if (params.inputsToChoose) {
      body.inputs_to_choose = params.inputsToChoose;
    }

    if (typeof params.amountInDecimal === 'boolean') {
      body.amount_in_decimal = params.amountInDecimal;
    }

    const response = await this.request<{
      cbor: string;
    }>('/build-tx', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      cbor: response.cbor,
    };
  }

  /**
   * Submit signed transaction
   */
  async submitTx(params: {
    cbor: string;
    witnessSet: string;
  }): Promise<SubmitTxResponse> {
    const response = await this.request<{
      tx_id: string;
    }>('/finalize-and-submit-tx', {
      method: 'POST',
      body: JSON.stringify({
        cbor: params.cbor,
        witness_set: params.witnessSet,
      }),
    });

    return {
      txId: response.tx_id,
    };
  }

  /**
   * Get pending orders for a wallet
   */
  async getPendingOrders(
    ownerAddress: string,
    amountInDecimal: boolean = true
  ): Promise<PendingOrder[]> {
    const params = new URLSearchParams({
      owner_address: ownerAddress,
      amount_in_decimal: String(amountInDecimal),
    });

    const response = await this.request<{
      orders: Array<{
        owner_address: string;
        protocol: Protocol;
        token_in: Parameters<MinswapClient['mapAsset']>[0];
        token_out: Parameters<MinswapClient['mapAsset']>[0];
        amount_in: string;
        min_amount_out: string;
        created_at: number;
        tx_in: string;
        dex_fee: string;
        deposit: string;
      }>;
      amount_in_decimal: boolean;
    }>(`/pending-orders?${params}`);

    return response.orders.map((order) => ({
      ownerAddress: order.owner_address,
      protocol: order.protocol,
      tokenIn: this.mapAsset(order.token_in),
      tokenOut: this.mapAsset(order.token_out),
      amountIn: order.amount_in,
      minAmountOut: order.min_amount_out,
      createdAt: order.created_at,
      txIn: order.tx_in,
      dexFee: order.dex_fee,
      deposit: order.deposit,
    }));
  }

  /**
   * Build cancel order transaction
   */
  async buildCancelTx(params: {
    sender: string;
    orders: Array<{ txIn: string; protocol: Protocol }>;
  }): Promise<BuildTxResponse> {
    const response = await this.request<{
      cbor: string;
    }>('/cancel-tx', {
      method: 'POST',
      body: JSON.stringify({
        sender: params.sender,
        orders: params.orders.map((order) => ({
          tx_in: order.txIn,
          protocol: order.protocol,
        })),
      }),
    });

    return {
      cbor: response.cbor,
    };
  }


  /**
   * Get network this client is configured for
   */
  getNetwork(): string {
    return this.network;
  }
}

/**
 * Create a Minswap client for the specified network
 */
export function createMinswapClient(network: string, partner?: string): MinswapClient {
  return new MinswapClient(network, partner);
}

/**
 * Mock Minswap client for development/testing without API access
 */
export class MockMinswapClient extends MinswapClient {
  constructor(network: string = 'mainnet') {
    super(network);
  }

  async estimate(params: EstimateRequest): Promise<SwapEstimate> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const amountNum = parseFloat(params.amount);
    const mockRate = params.tokenIn === 'lovelace' ? 0.05 : 20; // ADA->MIN or MIN->ADA
    const amountOut = (amountNum * mockRate).toFixed(6);
    const minAmountOut = (amountNum * mockRate * (1 - params.slippage / 100)).toFixed(6);

    return {
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amount,
      amountOut,
      minAmountOut,
      totalLpFee: '0.3',
      totalDexFee: '0.1',
      deposits: '0',
      avgPriceImpact: 0.15,
      aggregatorFee: '0.05',
      aggregatorFeePercent: 0.5,
      paths: [
        [
          {
            poolId: 'mock_pool_ada_min_v2',
            protocol: 'MinswapV2',
            lpToken: 'mock_lp_token',
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amountIn: params.amount,
            amountOut,
            minAmountOut,
            lpFee: '0.3',
            dexFee: '0.1',
            deposits: '0',
            priceImpact: 0.15,
          },
        ],
      ],
      amountInDecimal: params.amountInDecimal ?? true,
    };
  }

  async buildTx(params: {
    sender: string;
    minAmountOut: string;
    estimate: EstimateRequest;
  }): Promise<BuildTxResponse> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    return {
      cbor: 'mock_unsigned_tx_cbor_' + Date.now().toString(16),
    };
  }

  async submitTx(): Promise<SubmitTxResponse> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      txId: 'mock_tx_id_' + Date.now().toString(36),
    };
  }

  async searchTokens(
    query: string,
    onlyVerified: boolean = true,
    assets?: string[],
    searchAfter?: string[]
  ): Promise<{ tokens: MinswapToken[]; searchAfter?: string[] }> {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const allTokens: MinswapToken[] = [
      {
        tokenId: 'lovelace',
        ticker: 'ADA',
        name: 'Cardano',
        decimals: 6,
        verified: true,
      },
      {
        tokenId: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e',
        ticker: 'MIN',
        name: 'Minswap',
        decimals: 6,
        verified: true,
      },
      {
        tokenId: 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069555344',
        ticker: 'iUSD',
        name: 'Indigo USD',
        decimals: 6,
        verified: true,
      },
      {
        tokenId: 'a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59',
        ticker: 'HOSKY',
        name: 'Hosky Token',
        decimals: 0,
        verified: true,
      },
      {
        tokenId: 'b0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235534e454b',
        ticker: 'SNEK',
        name: 'Snek',
        decimals: 0,
        verified: true,
      },
    ];

    const queryLower = query.toLowerCase();
    let filtered = allTokens.filter(
      (t) =>
        t.ticker.toLowerCase().includes(queryLower) ||
        t.name.toLowerCase().includes(queryLower) ||
        t.tokenId.toLowerCase().includes(queryLower)
    );

    if (onlyVerified) {
      filtered = filtered.filter((t) => t.verified);
    }

    if (assets && assets.length > 0) {
      const assetSet = new Set(assets.map((asset) => asset.toLowerCase()));
      filtered = filtered.filter((token) => assetSet.has(token.tokenId.toLowerCase()));
    }

    return { tokens: filtered, searchAfter };
  }

  async getPendingOrders(
    ownerAddress: string,
    amountInDecimal: boolean = true
  ): Promise<PendingOrder[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const adaToken: MinswapToken = {
      tokenId: 'lovelace',
      ticker: 'ADA',
      name: 'Cardano',
      decimals: 6,
      verified: true,
    };

    const minToken: MinswapToken = {
      tokenId: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e',
      ticker: 'MIN',
      name: 'Minswap',
      decimals: 6,
      verified: true,
    };

    return [
      {
        ownerAddress,
        protocol: 'MinswapV2',
        tokenIn: adaToken,
        tokenOut: minToken,
        amountIn: amountInDecimal ? '100' : '100000000',
        minAmountOut: amountInDecimal ? '4.95' : '4950000',
        createdAt: Date.now(),
        txIn: 'mock_tx_in_0',
        dexFee: amountInDecimal ? '0.1' : '100000',
        deposit: amountInDecimal ? '2' : '2000000',
      },
    ];
  }

  async buildCancelTx(params: {
    sender: string;
    orders: Array<{ txIn: string; protocol: Protocol }>;
  }): Promise<BuildTxResponse> {
    await new Promise((resolve) => setTimeout(resolve, 200));

    return {
      cbor: 'mock_cancel_tx_cbor_' + Date.now().toString(16),
    };
  }
}
