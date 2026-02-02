/**
 * Swap utilities for token exchange operations
 * 
 * Provides helpers for:
 * - Token ID resolution (ADA, tickers, policyId.assetName)
 * - Amount formatting for display
 * - Witness set extraction for transaction submission
 */

import { MinswapClient, type SwapEstimate, type MinswapToken } from '../services/minswap.js';

/**
 * Well-known token mappings (ticker -> tokenId)
 */
export const KNOWN_TOKENS: Record<string, string> = {
  // Native ADA
  ADA: 'lovelace',
  LOVELACE: 'lovelace',
  
  // Major tokens (mainnet)
  MIN: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e',
  IUSD: 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069555344',
  DJED: '8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61446a65644d6963726f555344',
  SHEN: '8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd615368656e4d6963726f555344',
  WMT: '1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e776f726c646d6f62696c65746f6b656e',
  HOSKY: 'a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59',
  SNEK: 'b0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235534e454b',
};

/**
 * Token decimals for formatting (ticker -> decimals)
 */
export const TOKEN_DECIMALS: Record<string, number> = {
  ADA: 6,
  LOVELACE: 6,
  MIN: 6,
  IUSD: 6,
  DJED: 6,
  SHEN: 6,
  WMT: 6,
  HOSKY: 0,
  SNEK: 0,
};

/**
 * Resolved token information
 */
export interface ResolvedToken {
  tokenId: string;
  ticker: string;
  name: string;
  decimals: number;
  verified: boolean;
}

/**
 * Resolve a token identifier to its full token ID
 * 
 * Accepts:
 * - "ADA" or "lovelace" for native ADA
 * - Known tickers like "MIN", "HOSKY"
 * - Full token ID (policyId + assetNameHex)
 * - Format "policyId.assetName" (will convert assetName to hex)
 * 
 * @param input - Token identifier in any supported format
 * @param client - Optional Minswap client for searching unknown tokens
 * @returns Resolved token information
 */
export async function resolveTokenId(
  input: string,
  client?: MinswapClient
): Promise<ResolvedToken> {
  const inputUpper = input.toUpperCase();
  
  // Check well-known tokens first
  if (KNOWN_TOKENS[inputUpper]) {
    const tokenId = KNOWN_TOKENS[inputUpper];
    const decimals = TOKEN_DECIMALS[inputUpper] ?? 6;
    return {
      tokenId,
      ticker: inputUpper === 'LOVELACE' ? 'ADA' : inputUpper,
      name: inputUpper === 'LOVELACE' ? 'Cardano' : inputUpper,
      decimals,
      verified: true,
    };
  }
  
  // Check if it's already a valid token ID (56+ hex chars = policy + asset)
  if (/^[a-fA-F0-9]{56,}$/.test(input)) {
    // Try to get info from Minswap if client provided
    if (client) {
      try {
        const result = await client.searchTokens('', true, [input]);
        if (result.tokens.length > 0) {
          const token = result.tokens[0];
          return {
            tokenId: token.tokenId,
            ticker: token.ticker,
            name: token.name,
            decimals: token.decimals,
            verified: token.verified,
          };
        }
      } catch {
        // Continue with basic info
      }
    }
    
    return {
      tokenId: input.toLowerCase(),
      ticker: input.slice(0, 8).toUpperCase() + '...',
      name: 'Unknown Token',
      decimals: 0,
      verified: false,
    };
  }
  
  // Check format "policyId.assetName"
  if (input.includes('.')) {
    const [policyId, assetName] = input.split('.', 2);
    
    if (policyId.length !== 56 || !/^[a-fA-F0-9]+$/.test(policyId)) {
      throw new Error(`Invalid policy ID: ${policyId}. Must be 56 hex characters.`);
    }
    
    const assetNameHex = Buffer.from(assetName, 'utf-8').toString('hex');
    const tokenId = policyId.toLowerCase() + assetNameHex;
    
    return {
      tokenId,
      ticker: assetName.toUpperCase(),
      name: assetName,
      decimals: 0,
      verified: false,
    };
  }
  
  // Try searching via Minswap API if client provided
  if (client) {
    try {
      const result = await client.searchTokens(input, true);
      if (result.tokens.length > 0) {
        // Find exact match first
        const exactMatch = result.tokens.find(
          (t) => t.ticker.toUpperCase() === inputUpper
        );
        const token = exactMatch || result.tokens[0];
        
        return {
          tokenId: token.tokenId,
          ticker: token.ticker,
          name: token.name,
          decimals: token.decimals,
          verified: token.verified,
        };
      }
    } catch {
      // API search failed
    }
  }
  
  throw new Error(
    `Unknown token: ${input}. Use a known ticker (ADA, MIN, etc.), ` +
    `full token ID, or format "policyId.assetName".`
  );
}

/**
 * Format token amount for display
 * 
 * @param amount - Amount in smallest units (lovelace for ADA)
 * @param decimals - Number of decimal places
 * @param ticker - Token ticker for suffix
 * @returns Formatted amount string
 */
export function formatTokenAmount(
  amount: string,
  decimals: number,
  ticker?: string
): string {
  const num = parseFloat(amount);
  
  if (decimals === 0) {
    const formatted = Math.floor(num).toLocaleString();
    return ticker ? `${formatted} ${ticker}` : formatted;
  }
  
  const divisor = Math.pow(10, decimals);
  const formatted = (num / divisor).toFixed(decimals);
  
  // Remove trailing zeros after decimal point
  const trimmed = formatted.replace(/\.?0+$/, '');
  
  return ticker ? `${trimmed} ${ticker}` : trimmed;
}

/**
 * Parse amount string to smallest unit
 * 
 * @param amount - Human-readable amount (e.g., "100" for 100 ADA)
 * @param decimals - Token decimals
 * @returns Amount in smallest unit as string
 */
export function parseTokenAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount);
  if (isNaN(num) || num < 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  
  const multiplier = Math.pow(10, decimals);
  const smallest = Math.floor(num * multiplier);
  
  return smallest.toString();
}

/**
 * Format swap quote for display
 */
export interface FormattedQuote {
  fromAmount: string;
  fromToken: string;
  toAmount: string;
  toToken: string;
  minReceived: string;
  rate: string;
  inverseRate: string;
  priceImpact: string;
  totalFees: string;
  feeBreakdown: {
    lpFee: string;
    dexFee: string;
    aggregatorFee: string;
  };
  route: string;
  hops: number;
}

/**
 * Format a swap estimate for human-readable display
 */
export function formatSwapQuote(
  estimate: SwapEstimate,
  fromToken: ResolvedToken,
  toToken: ResolvedToken
): FormattedQuote {
  const fromAmount = formatTokenAmount(estimate.amountIn, fromToken.decimals, fromToken.ticker);
  const toAmount = formatTokenAmount(estimate.amountOut, toToken.decimals, toToken.ticker);
  const minReceived = formatTokenAmount(estimate.minAmountOut, toToken.decimals, toToken.ticker);
  
  // Format rate
  const rate = `1 ${fromToken.ticker} = ${estimate.effectivePrice} ${toToken.ticker}`;
  const inverseRate = `1 ${toToken.ticker} = ${estimate.inversePrice} ${fromToken.ticker}`;
  
  // Price impact
  const priceImpact = `${(estimate.priceImpact * 100).toFixed(2)}%`;
  
  // Fees
  const totalFees = (
    parseFloat(estimate.lpFee) +
    parseFloat(estimate.dexFee) +
    parseFloat(estimate.aggregatorFee)
  ).toFixed(6);
  
  // Route description
  const routeParts = estimate.route.map((leg) => leg.dex);
  const route = routeParts.join(' → ') || 'Direct';
  
  return {
    fromAmount,
    fromToken: fromToken.ticker,
    toAmount,
    toToken: toToken.ticker,
    minReceived,
    rate,
    inverseRate,
    priceImpact,
    totalFees: `${totalFees} ADA`,
    feeBreakdown: {
      lpFee: `${estimate.lpFee} ADA`,
      dexFee: `${estimate.dexFee} ADA`,
      aggregatorFee: `${estimate.aggregatorFee} ADA`,
    },
    route,
    hops: estimate.route.length,
  };
}

/**
 * Extract witness set from a signed transaction
 * 
 * When a wallet signs a transaction, it produces a signed transaction CBOR.
 * The Minswap API expects the unsigned CBOR + witness set separately.
 * This function extracts the witness set portion.
 * 
 * @param signedTxCbor - Signed transaction CBOR hex string
 * @returns Witness set hex string
 */
export function extractWitnessSet(signedTxCbor: string): string {
  // The signed transaction is a CBOR array: [body, witnessSet, isValid, auxiliaryData]
  // We need to extract the witnessSet (index 1)
  // 
  // For simplicity, we use a heuristic approach:
  // The witness set typically starts after the transaction body
  // A proper implementation would use a CBOR library
  
  // Note: In production, use @emurgo/cardano-serialization-lib or similar
  // For now, we return the signed tx and let the API handle extraction
  // or implement proper CBOR parsing
  
  try {
    // Try to use MeshJS if available
    const { deserializeTx } = require('@meshsdk/core');
    const tx = deserializeTx(signedTxCbor);
    
    // Get witness set from deserialized tx
    const witnessSet = tx.witness_set();
    return witnessSet.to_hex();
  } catch {
    // Fallback: return the full signed tx
    // The API may be able to extract witnesses itself
    return signedTxCbor;
  }
}

/**
 * Validate slippage value
 * 
 * @param slippage - Slippage percentage (e.g., 0.5 for 0.5%)
 * @returns Validated slippage value
 */
export function validateSlippage(slippage: number): number {
  if (slippage < 0.01) {
    throw new Error('Slippage must be at least 0.01%');
  }
  if (slippage > 50) {
    throw new Error('Slippage cannot exceed 50%');
  }
  return slippage;
}

/**
 * Calculate minimum amount out based on slippage
 * 
 * @param amountOut - Expected output amount
 * @param slippage - Slippage percentage
 * @returns Minimum acceptable amount
 */
export function calculateMinAmountOut(amountOut: string, slippage: number): string {
  const amount = parseFloat(amountOut);
  const minAmount = amount * (1 - slippage / 100);
  return minAmount.toString();
}

/**
 * Check if price impact is high (warning threshold)
 * 
 * @param priceImpact - Price impact as decimal (e.g., 0.05 for 5%)
 * @returns True if price impact exceeds warning threshold
 */
export function isHighPriceImpact(priceImpact: number): boolean {
  return priceImpact > 0.05; // Warn if > 5%
}

/**
 * Check if price impact is critical (danger threshold)
 * 
 * @param priceImpact - Price impact as decimal
 * @returns True if price impact exceeds danger threshold
 */
export function isCriticalPriceImpact(priceImpact: number): boolean {
  return priceImpact > 0.15; // Danger if > 15%
}

/**
 * Get human-readable DEX name
 */
export function getDexDisplayName(dex: string): string {
  const names: Record<string, string> = {
    minswap: 'Minswap',
    minswap_v2: 'Minswap V2',
    sundaeswap: 'SundaeSwap',
    wingriders: 'WingRiders',
    muesliswap: 'MuesliSwap',
    vyfinance: 'VyFinance',
    spectrum: 'Spectrum',
  };
  
  return names[dex.toLowerCase()] || dex;
}

/**
 * Format route for display
 */
export function formatRoute(
  route: SwapEstimate['route'],
  fromToken: ResolvedToken,
  toToken: ResolvedToken
): string {
  if (route.length === 0) {
    return `${fromToken.ticker} → ${toToken.ticker} (Direct)`;
  }
  
  if (route.length === 1) {
    return `${fromToken.ticker} → ${toToken.ticker} via ${getDexDisplayName(route[0].dex)}`;
  }
  
  // Multi-hop
  const steps = [fromToken.ticker];
  for (const leg of route) {
    steps.push(getDexDisplayName(leg.dex));
  }
  steps.push(toToken.ticker);
  
  return steps.join(' → ');
}
