/**
 * Core swap operations logic
 *
 * Pure functions for token swaps via Minswap aggregator.
 */

import { createMinswapClient, MockMinswapClient, type SwapEstimate } from "../services/minswap.js";
import {
  resolveTokenId,
  formatSwapQuote,
  validateSlippage,
  extractWitnessSet,
  type ResolvedToken,
  type FormattedQuote,
} from "../lib/swap.js";
import {
  loadWallet,
  checkWalletAvailability,
  getWalletAddress,
  type TransactionConfig,
  type WalletOptions,
} from "../lib/transaction.js";
import { getPasswordFromEnv } from "../lib/keystore.js";

export interface SwapQuoteParams {
  from: string;
  to: string;
  amount: string;
  slippage?: number;
  multiHop?: boolean;
  network?: string;
}

export interface SwapQuoteResult {
  status: "success" | "error";
  network: string;
  from?: {
    token: string;
    tokenId: string;
    amount: string;
  };
  to?: {
    token: string;
    tokenId: string;
    amount: string;
    minAmount: string;
  };
  rate?: string;
  inverseRate?: string;
  priceImpact?: number;
  slippage: number;
  fees?: {
    lp: string;
    dex: string;
    aggregator: string;
  };
  paths?: SwapEstimate["paths"];
  multiHop?: boolean;
  formatted?: FormattedQuote;
  error?: string;
  mock?: boolean;
}

export interface SwapExecuteParams {
  from: string;
  to: string;
  amount: string;
  slippage?: number;
  multiHop?: boolean;
  wallet?: string;
  password?: string;
  network?: string;
}

export interface SwapExecuteResult {
  status: "success" | "error";
  txHash?: string;
  from?: {
    token: string;
    amount: string;
  };
  to?: {
    token: string;
    amount: string;
    minAmount: string;
  };
  network: string;
  error?: string;
  mock?: boolean;
}

/**
 * Get a swap quote without executing
 */
export async function getSwapQuote(params: SwapQuoteParams): Promise<SwapQuoteResult> {
  const { from, to, amount, slippage = 0.5, multiHop = true, network = "mainnet" } = params;

  try {
    // Validate slippage
    validateSlippage(slippage);

    // Create client (use mock if env flag set)
    const useMock = process.env.MINSWAP_MOCK === "true";
    const client = useMock ? new MockMinswapClient(network) : createMinswapClient(network);

    // Resolve token IDs
    const [resolvedFrom, resolvedTo] = await Promise.all([
      resolveTokenId(from, client),
      resolveTokenId(to, client),
    ]);

    if (resolvedFrom.tokenId === resolvedTo.tokenId) {
      return {
        status: "error",
        network,
        slippage,
        error: "Cannot swap a token for itself",
      };
    }

    // Get estimate
    const estimate = await client.estimate({
      tokenIn: resolvedFrom.tokenId,
      tokenOut: resolvedTo.tokenId,
      amount,
      slippage,
      allowMultiHops: multiHop,
      amountInDecimal: true,
    });

    // Format quote
    const formatted = formatSwapQuote(estimate, resolvedFrom, resolvedTo);

    return {
      status: "success",
      network,
      from: {
        token: resolvedFrom.ticker,
        tokenId: resolvedFrom.tokenId,
        amount: estimate.amountIn,
      },
      to: {
        token: resolvedTo.ticker,
        tokenId: resolvedTo.tokenId,
        amount: estimate.amountOut,
        minAmount: estimate.minAmountOut,
      },
      rate: formatted.rate,
      inverseRate: formatted.inverseRate,
      priceImpact: estimate.avgPriceImpact,
      slippage,
      fees: {
        lp: estimate.totalLpFee,
        dex: estimate.totalDexFee,
        aggregator: estimate.aggregatorFee,
      },
      paths: estimate.paths,
      multiHop: (estimate.paths[0] ?? []).length > 1,
      formatted,
      mock: useMock,
    };
  } catch (err) {
    return {
      status: "error",
      network,
      slippage: slippage,
      error: err instanceof Error ? err.message : "Failed to get quote",
    };
  }
}

/**
 * Execute a token swap
 */
export async function executeSwap(params: SwapExecuteParams): Promise<SwapExecuteResult> {
  const {
    from,
    to,
    amount,
    slippage = 0.5,
    multiHop = true,
    wallet: walletName,
    password: initialPassword,
    network = "mainnet",
  } = params;

  // Check wallet availability
  const availability = checkWalletAvailability(walletName);
  if (!availability.available) {
    return {
      status: "error",
      network,
      error: availability.error || "No wallet available",
    };
  }

  const effectivePassword = initialPassword || getPasswordFromEnv() || undefined;
  if (availability.needsPassword && !effectivePassword) {
    return {
      status: "error",
      network,
      error: "Password is required for wallet decryption",
    };
  }

  try {
    // Validate slippage
    validateSlippage(slippage);

    // Load wallet
    const config: TransactionConfig = { network };
    const options: WalletOptions = {
      walletName: availability.walletName,
      password: effectivePassword,
    };
    const meshWallet = await loadWallet(options, config);
    const senderAddress = await getWalletAddress(meshWallet);

    // Create client
    const useMock = process.env.MINSWAP_MOCK === "true";
    const client = useMock ? new MockMinswapClient(network) : createMinswapClient(network);

    // Resolve tokens
    const [resolvedFrom, resolvedTo] = await Promise.all([
      resolveTokenId(from, client),
      resolveTokenId(to, client),
    ]);

    if (resolvedFrom.tokenId === resolvedTo.tokenId) {
      return {
        status: "error",
        network,
        error: "Cannot swap a token for itself",
      };
    }

    // Get estimate
    const estimate = await client.estimate({
      tokenIn: resolvedFrom.tokenId,
      tokenOut: resolvedTo.tokenId,
      amount,
      slippage,
      allowMultiHops: multiHop,
      amountInDecimal: true,
    });

    // Build transaction
    const buildResult = await client.buildTx({
      sender: senderAddress,
      minAmountOut: estimate.minAmountOut,
      estimate: {
        tokenIn: resolvedFrom.tokenId,
        tokenOut: resolvedTo.tokenId,
        amount,
        slippage,
        allowMultiHops: multiHop,
        amountInDecimal: true,
      },
      amountInDecimal: true,
    });

    // Sign transaction
    const signedTx = await meshWallet.signTx(buildResult.cbor);

    // Extract witness set and submit
    const witnessSet = await extractWitnessSet(signedTx);
    const submitResult = await client.submitTx({
      cbor: buildResult.cbor,
      witnessSet,
    });

    return {
      status: "success",
      txHash: submitResult.txId,
      from: {
        token: resolvedFrom.ticker,
        amount: estimate.amountIn,
      },
      to: {
        token: resolvedTo.ticker,
        amount: estimate.amountOut,
        minAmount: estimate.minAmountOut,
      },
      network,
      mock: useMock,
    };
  } catch (err) {
    return {
      status: "error",
      network,
      error: err instanceof Error ? err.message : "Swap execution failed",
    };
  }
}
