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
  mainnet: 'https://aggregator.minswap.org/api/v1',
  preprod: 'https://preprod-aggregator.minswap.org/api/v1',
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
}

/**
 * Route leg information
 */
export interface RouteLeg {
  dex: string;
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
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
  priceImpact: number;
  lpFee: string;
  dexFee: string;
  aggregatorFee: string;
  route: RouteLeg[];
  effectivePrice: string;
  inversePrice: string;
}

/**
 * Build transaction response
 */
export interface BuildTxResponse {
  cbor: string;
  estimatedFee: string;
}

/**
 * Submit transaction response
 */
export interface SubmitTxResponse {
  txHash: string;
}

/**
 * Pending order information
 */
export interface PendingOrder {
  orderId: string;
  txHash: string;
  dex: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  status: string;
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
 * Minswap Aggregator API client
 */
export class MinswapClient {
  private baseUrl: string;
  private network: string;
  private partner?: string;

  constructor(network: string, partner?: string) {
    const url = MINSWAP_API_URLS[network];
    if (!url) {
      throw new Error(`Unsupported network: ${network}. Use mainnet or preprod.`);
    }
    this.baseUrl = url;
    this.network = network;
    this.partner = partner;
  }

  /**
   * Make API request with error handling
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
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
  }

  /**
   * Get current ADA price in a currency
   */
  async getAdaPrice(currency: string = 'usd'): Promise<{ price: number; change24h: number }> {
    const params = new URLSearchParams({ currency });
    return this.request(`/ada-price?${params}`);
  }

  /**
   * Get wallet balances
   */
  async getWalletBalances(
    address: string,
    amountInDecimal: boolean = true
  ): Promise<{
    address: string;
    lovelace: string;
    tokens: Array<{ tokenId: string; amount: string }>;
  }> {
    const params = new URLSearchParams({
      address,
      amount_in_decimal: String(amountInDecimal),
    });
    return this.request(`/wallet?${params}`);
  }

  /**
   * Search for tokens
   */
  async searchTokens(
    query: string,
    onlyVerified: boolean = true,
    assets?: string[]
  ): Promise<{
    tokens: MinswapToken[];
    searchAfter?: string[];
  }> {
    return this.request('/tokens', {
      method: 'POST',
      body: JSON.stringify({
        query,
        only_verified: onlyVerified,
        assets,
      }),
    });
  }

  /**
   * Get swap estimate/quote
   */
  async estimate(params: {
    tokenIn: string;
    tokenOut: string;
    amount: string;
    slippage: number;
    allowMultiHops?: boolean;
    amountInDecimal?: boolean;
  }): Promise<SwapEstimate> {
    const body: Record<string, unknown> = {
      token_in: params.tokenIn,
      token_out: params.tokenOut,
      amount: params.amount,
      slippage: params.slippage,
      allow_multi_hops: params.allowMultiHops ?? true,
      amount_in_decimal: params.amountInDecimal ?? true,
    };

    if (this.partner) {
      body.partner = this.partner;
    }

    const response = await this.request<{
      token_in: string;
      token_out: string;
      amount_in: string;
      amount_out: string;
      min_amount_out: string;
      price_impact: number;
      lp_fee: string;
      dex_fee: string;
      aggregator_fee: string;
      route: Array<{
        dex: string;
        pool_id: string;
        token_in: string;
        token_out: string;
        amount_in: string;
        amount_out: string;
      }>;
      effective_price: string;
      inverse_price: string;
    }>('/estimate', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    // Transform snake_case to camelCase
    return {
      tokenIn: response.token_in,
      tokenOut: response.token_out,
      amountIn: response.amount_in,
      amountOut: response.amount_out,
      minAmountOut: response.min_amount_out,
      priceImpact: response.price_impact,
      lpFee: response.lp_fee,
      dexFee: response.dex_fee,
      aggregatorFee: response.aggregator_fee,
      route: response.route.map((leg) => ({
        dex: leg.dex,
        poolId: leg.pool_id,
        tokenIn: leg.token_in,
        tokenOut: leg.token_out,
        amountIn: leg.amount_in,
        amountOut: leg.amount_out,
      })),
      effectivePrice: response.effective_price,
      inversePrice: response.inverse_price,
    };
  }

  /**
   * Build unsigned swap transaction
   */
  async buildTx(params: {
    sender: string;
    estimate: SwapEstimate;
    inputsToChoose?: string[];
    amountInDecimal?: boolean;
  }): Promise<BuildTxResponse> {
    const response = await this.request<{
      cbor: string;
      estimated_fee: string;
    }>('/build-tx', {
      method: 'POST',
      body: JSON.stringify({
        sender: params.sender,
        min_amount_out: params.estimate.minAmountOut,
        // Include estimate data for the API
        token_in: params.estimate.tokenIn,
        token_out: params.estimate.tokenOut,
        amount: params.estimate.amountIn,
        slippage: 0, // Already calculated in minAmountOut
        route: params.estimate.route.map((leg) => ({
          dex: leg.dex,
          pool_id: leg.poolId,
          token_in: leg.tokenIn,
          token_out: leg.tokenOut,
          amount_in: leg.amountIn,
          amount_out: leg.amountOut,
        })),
        inputs_to_choose: params.inputsToChoose,
        amount_in_decimal: params.amountInDecimal ?? true,
      }),
    });

    return {
      cbor: response.cbor,
      estimatedFee: response.estimated_fee,
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
      tx_hash: string;
    }>('/finalize-and-submit-tx', {
      method: 'POST',
      body: JSON.stringify({
        cbor: params.cbor,
        witness_set: params.witnessSet,
      }),
    });

    return {
      txHash: response.tx_hash,
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

    const response = await this.request<Array<{
      order_id: string;
      tx_hash: string;
      dex: string;
      token_in: string;
      token_out: string;
      amount_in: string;
      min_amount_out: string;
      status: string;
    }>>(`/pending-orders?${params}`);

    return response.map((order) => ({
      orderId: order.order_id,
      txHash: order.tx_hash,
      dex: order.dex,
      tokenIn: order.token_in,
      tokenOut: order.token_out,
      amountIn: order.amount_in,
      minAmountOut: order.min_amount_out,
      status: order.status,
    }));
  }

  /**
   * Build cancel order transaction
   */
  async buildCancelTx(params: {
    sender: string;
    orderIds: string[];
  }): Promise<BuildTxResponse> {
    const response = await this.request<{
      cbor: string;
      estimated_fee: string;
    }>('/cancel-tx', {
      method: 'POST',
      body: JSON.stringify({
        sender: params.sender,
        order_ids: params.orderIds,
      }),
    });

    return {
      cbor: response.cbor,
      estimatedFee: response.estimated_fee,
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

  async estimate(params: {
    tokenIn: string;
    tokenOut: string;
    amount: string;
    slippage: number;
    allowMultiHops?: boolean;
  }): Promise<SwapEstimate> {
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
      priceImpact: 0.15,
      lpFee: '0.3',
      dexFee: '0.1',
      aggregatorFee: '0.05',
      route: [
        {
          dex: 'Minswap',
          poolId: 'mock_pool_ada_min_v2',
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amountIn: params.amount,
          amountOut,
        },
      ],
      effectivePrice: mockRate.toString(),
      inversePrice: (1 / mockRate).toString(),
    };
  }

  async buildTx(params: {
    sender: string;
    estimate: SwapEstimate;
  }): Promise<BuildTxResponse> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    return {
      cbor: 'mock_unsigned_tx_cbor_' + Date.now().toString(16),
      estimatedFee: '0.2',
    };
  }

  async submitTx(): Promise<SubmitTxResponse> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      txHash: 'mock_tx_hash_' + Date.now().toString(36),
    };
  }

  async searchTokens(
    query: string,
    onlyVerified: boolean = true
  ): Promise<{ tokens: MinswapToken[] }> {
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

    return { tokens: filtered };
  }
}
