/**
 * XOSwap Cross-Chain Bridge Service
 *
 * Integrates with the Exodus Exchange API v3 for cross-chain swaps
 * between BTC, SOL, ADA, ETH, and other supported assets.
 */

const XOSWAP_API_BASE = "https://exchange.exodus.io/v3";

const APP_HEADERS = {
  "App-Name": "begin-wallet",
  "App-Version": "1",
  "Content-Type": "application/json",
};

// Supported chains for bridging
export type BridgeChain = "BTC" | "SOL" | "ADA" | "ETH" | "MATIC" | "AVAX" | "BNB" | "ARB" | "OP";

export interface XOSwapRate {
  provider: string;
  amount: {
    value: number;
    unit: string;
  };
  min: {
    value: number;
    unit: string;
  };
  max: {
    value: number;
    unit: string;
  };
  minerFee: {
    value: number;
    unit: string;
  };
}

export interface BestRateResult {
  bestRate: XOSwapRate;
  min: number;
  max: number;
  outputAmount: number;
}

export interface XOSwapOrder {
  orderId: string;
  status: "pending" | "awaiting_deposit" | "processing" | "completed" | "failed" | "refunded";
  pairId: string;
  fromAmount: number;
  fromAddress: string;
  toAmount: number;
  toAddress: string;
  depositAddress: string;
  transactionId?: string;
  outputTransactionId?: string;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
}

export interface CreateOrderParams {
  pairId: string;
  fromAddress: string;
  toAddress: string;
  fromAmount: number;
  toAmount: number;
  slippage: number;
}

/**
 * Get the best exchange rate for a pair
 */
export async function getRate(
  pair: string,
  amount: number
): Promise<BestRateResult | null> {
  const url = `${XOSWAP_API_BASE}/pairs/${pair}/rates`;

  const response = await fetch(url, {
    method: "GET",
    headers: APP_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get rates: ${response.status} ${error}`);
  }

  const rates = (await response.json()) as XOSwapRate[];

  if (!rates || rates.length === 0) {
    return null;
  }

  // Find the best rate for the given amount
  const bestRate = rates.reduce((best, rate) => {
    // Check if the amount is within the rate's limits
    if (amount >= rate.min.value && amount <= rate.max.value) {
      // Calculate the output amount
      const outputAmount = amount * rate.amount.value - rate.minerFee.value;
      const bestRateAmount = amount * best.amount.value - best.minerFee.value;

      // Select the better rate
      return outputAmount > bestRateAmount ? rate : best;
    }
    return best;
  });

  // Calculate global min/max across all providers
  const { min, max } = rates.reduce(
    (acc, rate) => {
      if (rate.min.value < acc.min) {
        acc.min = rate.min.value;
      }
      if (rate.max.value > acc.max) {
        acc.max = rate.max.value;
      }
      return acc;
    },
    { min: Infinity, max: -Infinity }
  );

  // Calculate output amount with the best rate
  const outputAmount = amount * bestRate.amount.value - bestRate.minerFee.value;

  return {
    bestRate,
    min,
    max,
    outputAmount,
  };
}

/**
 * Create a new bridge order
 */
export async function createOrder(params: CreateOrderParams): Promise<XOSwapOrder> {
  const url = `${XOSWAP_API_BASE}/orders`;

  const payload = {
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    toAmount: params.toAmount,
    toAddress: params.toAddress,
    pairId: params.pairId,
    slippage: params.slippage,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: APP_HEADERS,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create order: ${response.status} ${error}`);
  }

  return (await response.json()) as XOSwapOrder;
}

/**
 * Update an order with the transaction ID after sending funds
 */
export async function updateOrder(orderId: string, txId: string): Promise<XOSwapOrder> {
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const url = `${XOSWAP_API_BASE}/orders/${orderId}`;

  const payload = {
    transactionId: txId,
  };

  const response = await fetch(url, {
    method: "PATCH",
    headers: APP_HEADERS,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update order: ${response.status} ${error}`);
  }

  return (await response.json()) as XOSwapOrder;
}

/**
 * Get the status of an order
 */
export async function getOrder(orderId: string): Promise<XOSwapOrder> {
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const url = `${XOSWAP_API_BASE}/orders/${orderId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: APP_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get order: ${response.status} ${error}`);
  }

  return (await response.json()) as XOSwapOrder;
}

/**
 * List orders for an address and asset
 */
export async function listOrders(address: string, asset: string): Promise<XOSwapOrder[]> {
  if (!address || !asset) {
    throw new Error("Address and asset are required");
  }

  // Fetch both fromAddress and toAddress orders
  const [fromOrders, toOrders] = await Promise.all([
    fetchOrders(`fromAddress=${address}&fromAsset=${asset}`),
    fetchOrders(`toAddress=${address}&toAsset=${asset}`),
  ]);

  // Combine and dedupe by orderId
  const orderMap = new Map<string, XOSwapOrder>();
  for (const order of [...fromOrders, ...toOrders]) {
    orderMap.set(order.orderId, order);
  }

  return Array.from(orderMap.values());
}

async function fetchOrders(query: string): Promise<XOSwapOrder[]> {
  const url = `${XOSWAP_API_BASE}/orders?${query}`;

  const response = await fetch(url, {
    method: "GET",
    headers: APP_HEADERS,
  });

  if (!response.ok) {
    // Return empty array on error instead of throwing
    return [];
  }

  return (await response.json()) as XOSwapOrder[];
}

/**
 * Build a pair ID from two chain symbols
 * Format: FROM_TO (e.g., BTC_SOL, ADA_ETH)
 */
export function buildPairId(from: BridgeChain, to: BridgeChain): string {
  return `${from}_${to}`;
}

/**
 * Parse a pair ID into from/to chains
 */
export function parsePairId(pairId: string): { from: BridgeChain; to: BridgeChain } {
  const [from, to] = pairId.split("_") as [BridgeChain, BridgeChain];
  return { from, to };
}

/**
 * Get the native chain identifier for a bridge asset
 */
export function getChainForAsset(asset: BridgeChain): "bitcoin" | "solana" | "cardano" | "evm" {
  switch (asset) {
    case "BTC":
      return "bitcoin";
    case "SOL":
      return "solana";
    case "ADA":
      return "cardano";
    case "ETH":
    case "MATIC":
    case "AVAX":
    case "BNB":
    case "ARB":
    case "OP":
      return "evm";
    default:
      throw new Error(`Unknown asset: ${asset}`);
  }
}

/**
 * Check if an asset is supported for bridging
 */
export function isSupportedAsset(asset: string): asset is BridgeChain {
  return ["BTC", "SOL", "ADA", "ETH", "MATIC", "AVAX", "BNB", "ARB", "OP"].includes(asset);
}

/**
 * Get display name for an asset
 */
export function getAssetDisplayName(asset: BridgeChain): string {
  const names: Record<BridgeChain, string> = {
    BTC: "Bitcoin",
    SOL: "Solana",
    ADA: "Cardano",
    ETH: "Ethereum",
    MATIC: "Polygon",
    AVAX: "Avalanche",
    BNB: "BNB Chain",
    ARB: "Arbitrum",
    OP: "Optimism",
  };
  return names[asset] || asset;
}

/**
 * Format order status for display
 */
export function formatOrderStatus(status: XOSwapOrder["status"]): string {
  const statusMap: Record<XOSwapOrder["status"], string> = {
    pending: "Pending",
    awaiting_deposit: "Awaiting Deposit",
    processing: "Processing",
    completed: "Completed",
    failed: "Failed",
    refunded: "Refunded",
  };
  return statusMap[status] || status;
}

/**
 * Get status color for display
 */
export function getStatusColor(
  status: XOSwapOrder["status"]
): "yellow" | "cyan" | "green" | "red" | "gray" {
  switch (status) {
    case "pending":
    case "awaiting_deposit":
      return "yellow";
    case "processing":
      return "cyan";
    case "completed":
      return "green";
    case "failed":
    case "refunded":
      return "red";
    default:
      return "gray";
  }
}
