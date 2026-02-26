/**
 * Jupiter Swap API client for Solana token swaps
 *
 * Uses Jupiter Swap API v1:
 * - /swap/v1/quote - Get swap quotes
 * - /swap/v1/swap - Build swap transaction
 *
 * Supports dynamic slippage and various route options.
 */

import {
  Connection,
  Keypair,
  VersionedTransaction,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";
import { derivePath } from "ed25519-hd-key";
import * as bip39 from "bip39";
import { getMnemonic } from "../lib/wallet.js";
import type { SolanaNetwork } from "../lib/chains/types.js";

const JUPITER_SWAP_API = "https://api.jup.ag/swap/v1";
const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";

const RPC_URLS: Record<SolanaNetwork, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

/**
 * Jupiter quote response
 */
export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  priceImpactPct: string;
  routePlan: RoutePlanStep[];
  contextSlot?: number;
  timeTaken?: number;
}

interface RoutePlanStep {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

/**
 * Jupiter swap transaction response
 */
interface JupiterSwapResponse {
  swapTransaction: string; // Base64 encoded versioned transaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
  prioritizationType?: {
    computeBudget?: {
      microLamports: number;
      estimatedMicroLamports: number;
    };
  };
  dynamicSlippageReport?: {
    slippageBps: number;
    otherAmount: number;
    simulatedIncurredSlippageBps: number;
    amplificationRatio: string;
  };
}

/**
 * Quote request parameters
 */
export interface GetQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string; // Amount in smallest units (lamports for SOL)
  slippageBps?: number; // Slippage in basis points (e.g., 50 = 0.5%)
  swapMode?: "ExactIn" | "ExactOut";
  onlyDirectRoutes?: boolean;
  asLegacyTransaction?: boolean;
  maxAccounts?: number;
}

/**
 * Execute swap parameters
 */
export interface ExecuteSwapParams {
  quote: JupiterQuote;
  userPublicKey: string;
  walletName: string;
  password: string;
  network?: SolanaNetwork;
  dynamicSlippage?: boolean;
  wrapAndUnwrapSol?: boolean;
  prioritizationFeeLamports?: number | "auto";
}

/**
 * Swap execution result
 */
export interface SwapResult {
  txHash: string;
  inputAmount: string;
  outputAmount: string;
  priceImpact: string;
  fee?: string;
}

/**
 * Get a swap quote from Jupiter
 */
export async function getQuote(params: GetQuoteParams): Promise<JupiterQuote> {
  const {
    inputMint,
    outputMint,
    amount,
    slippageBps = 50, // Default 0.5%
    swapMode = "ExactIn",
    onlyDirectRoutes = false,
    asLegacyTransaction = false,
    maxAccounts,
  } = params;

  const searchParams = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps: slippageBps.toString(),
    swapMode,
    onlyDirectRoutes: onlyDirectRoutes.toString(),
    asLegacyTransaction: asLegacyTransaction.toString(),
  });

  if (maxAccounts !== undefined) {
    searchParams.set("maxAccounts", maxAccounts.toString());
  }

  const url = `${JUPITER_SWAP_API}/quote?${searchParams.toString()}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter quote API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data as JupiterQuote;
}

/**
 * Build swap transaction from Jupiter
 */
async function buildSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string,
  options: {
    dynamicSlippage?: boolean;
    wrapAndUnwrapSol?: boolean;
    prioritizationFeeLamports?: number | "auto";
  } = {}
): Promise<JupiterSwapResponse> {
  const {
    dynamicSlippage = true,
    wrapAndUnwrapSol = true,
    prioritizationFeeLamports = "auto",
  } = options;

  const body: Record<string, unknown> = {
    quoteResponse: quote,
    userPublicKey,
    wrapAndUnwrapSol,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports,
  };

  if (dynamicSlippage) {
    body.dynamicSlippage = { maxBps: 300 }; // Max 3% dynamic slippage
  }

  const response = await fetch(`${JUPITER_SWAP_API}/swap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter swap API error: ${response.status} - ${errorText}`);
  }

  return (await response.json()) as JupiterSwapResponse;
}

/**
 * Derive Solana keypair from mnemonic
 */
function deriveKeypair(mnemonic: string[], accountIndex: number = 0): Keypair {
  const mnemonicStr = mnemonic.join(" ");
  const seed = bip39.mnemonicToSeedSync(mnemonicStr);

  const path =
    accountIndex === 0 ? SOLANA_DERIVATION_PATH : `m/44'/501'/${accountIndex}'/0'`;

  const { key } = derivePath(path, seed.toString("hex"));
  return Keypair.fromSeed(key);
}

/**
 * Execute a swap using Jupiter
 */
export async function executeSwap(params: ExecuteSwapParams): Promise<SwapResult> {
  const {
    quote,
    userPublicKey,
    walletName,
    password,
    network = "mainnet-beta",
    dynamicSlippage = true,
    wrapAndUnwrapSol = true,
    prioritizationFeeLamports = "auto",
  } = params;

  // Build the swap transaction
  const swapResponse = await buildSwapTransaction(quote, userPublicKey, {
    dynamicSlippage,
    wrapAndUnwrapSol,
    prioritizationFeeLamports,
  });

  // Get mnemonic and derive keypair
  const mnemonic = await getMnemonic(walletName, password);
  const keypair = deriveKeypair(mnemonic);

  // Deserialize and sign the transaction
  const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, "base64");
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

  transaction.sign([keypair]);

  // Create connection and submit
  const rpcUrl = process.env.BEGIN_SOLANA_RPC || RPC_URLS[network];
  const connection = new Connection(rpcUrl, "confirmed");

  const rawTransaction = transaction.serialize();
  const txHash = await sendAndConfirmRawTransaction(connection, Buffer.from(rawTransaction), {
    commitment: "confirmed",
  });

  // Calculate fee from priority fee if available
  let fee: string | undefined;
  if (swapResponse.prioritizationFeeLamports) {
    const feeLamports = swapResponse.prioritizationFeeLamports;
    fee = (feeLamports / 1e9).toFixed(9);
  }

  return {
    txHash,
    inputAmount: quote.inAmount,
    outputAmount: quote.outAmount,
    priceImpact: quote.priceImpactPct,
    fee,
  };
}

/**
 * Format route plan for display
 */
export function formatRoutePlan(quote: JupiterQuote): string {
  if (!quote.routePlan || quote.routePlan.length === 0) {
    return "Direct";
  }

  const labels = quote.routePlan.map((step) => step.swapInfo.label);
  const uniqueLabels = [...new Set(labels)];

  if (uniqueLabels.length === 1) {
    return uniqueLabels[0];
  }

  return uniqueLabels.join(" → ");
}

/**
 * Get the Solana explorer URL for a transaction
 */
export function getSolanaExplorerUrl(txHash: string, network: SolanaNetwork): string {
  const baseUrl = "https://explorer.solana.com/tx";
  const clusterParam = network !== "mainnet-beta" ? `?cluster=${network}` : "";
  return `${baseUrl}/${txHash}${clusterParam}`;
}

/**
 * Well-known Solana token addresses
 */
export const SOLANA_TOKENS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112", // Wrapped SOL
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  PYTH: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF: "Ekv6AednR4s5XnKGcc8gYkHsUia7mYUiTz72S9U1jmGe",
  MSOL: "mSoLz3r7P3F5Hk2Z1uP1D3SUw3j1X9Grz4BfGz5a6dM",
  RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
};

/**
 * Token decimals for well-known tokens
 */
export const SOLANA_TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
  JUP: 6,
  PYTH: 6,
  BONK: 5,
  WIF: 6,
  MSOL: 9,
  RAY: 6,
};

/**
 * Resolve a token symbol or address to its mint address
 */
export function resolveTokenMint(tokenInput: string): string {
  const upperInput = tokenInput.toUpperCase();

  // Check if it's a known token symbol
  if (SOLANA_TOKENS[upperInput]) {
    return SOLANA_TOKENS[upperInput];
  }

  // Assume it's already a mint address
  return tokenInput;
}

/**
 * Get token decimals (returns 9 as default for unknown tokens)
 */
export function getTokenDecimals(tokenInput: string): number {
  const upperInput = tokenInput.toUpperCase();
  return SOLANA_TOKEN_DECIMALS[upperInput] ?? 9;
}

/**
 * Parse amount to smallest units based on decimals
 */
export function parseAmountToSmallestUnit(amount: string, decimals: number): string {
  const [intPart, decPart = ""] = amount.split(".");
  const paddedDecPart = decPart.padEnd(decimals, "0").slice(0, decimals);
  const fullStr = intPart + paddedDecPart;
  // Remove leading zeros but keep at least one digit
  return fullStr.replace(/^0+/, "") || "0";
}

/**
 * Format amount from smallest units to human readable
 */
export function formatAmountFromSmallestUnit(amount: string, decimals: number): string {
  if (decimals === 0) return amount;

  const padded = amount.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, -decimals) || "0";
  const decPart = padded.slice(-decimals);

  // Remove trailing zeros
  const trimmedDecPart = decPart.replace(/0+$/, "");

  if (trimmedDecPart === "") {
    return intPart;
  }

  return `${intPart}.${trimmedDecPart}`;
}
