/**
 * Core transaction sending logic
 *
 * Pure functions for building, signing, and submitting transactions.
 */

import {
  loadWallet,
  checkWalletAvailability,
  buildSendAdaTx,
  buildMultiAssetTx,
  signTransaction,
  submitTransaction,
  waitForConfirmation,
  parseAssets,
  getWalletAddress,
  getWalletUtxos,
  calculateBalance,
  type TransactionConfig,
  type WalletOptions,
} from "../lib/transaction.js";
import { getPasswordFromEnv } from "../lib/keystore.js";

export interface SendParams {
  to: string;
  amount: number;
  wallet?: string;
  password?: string;
  network?: string;
  assets?: string[];
  dryRun?: boolean;
  skipConfirmation?: boolean;
}

export interface SendResult {
  status: "built" | "submitted" | "confirmed" | "error";
  txHash?: string;
  unsignedTx?: string;
  fromAddress?: string;
  toAddress: string;
  amountAda: number;
  assets: string[];
  network: string;
  error?: string;
}

function lovelaceToAdaDisplay(lovelace: string): string {
  try {
    const v = BigInt(lovelace);
    const whole = v / 1_000_000n;
    const frac = v % 1_000_000n;
    return `${whole.toString()}.${frac.toString().padStart(6, "0")}`;
  } catch {
    return "0.000000";
  }
}

/**
 * Send ADA and optionally native tokens
 */
export async function sendAda(params: SendParams): Promise<SendResult> {
  const {
    to,
    amount,
    wallet: walletName,
    password: initialPassword,
    network = "mainnet",
    assets = [],
    dryRun = false,
  } = params;

  const config: TransactionConfig = { network };

  // Check wallet availability
  const availability = checkWalletAvailability(walletName);
  if (!availability.available) {
    return {
      status: "error",
      toAddress: to,
      amountAda: amount,
      assets,
      network,
      error: availability.error || "No wallet available",
    };
  }

  // Get effective password
  const effectivePassword = initialPassword || getPasswordFromEnv() || undefined;
  if (availability.needsPassword && !effectivePassword) {
    return {
      status: "error",
      toAddress: to,
      amountAda: amount,
      assets,
      network,
      error:
        "Password is required for wallet decryption. Set BEGIN_CLI_WALLET_PASSWORD or provide --password.",
    };
  }

  try {
    // Load wallet
    const walletOptions: WalletOptions = {
      walletName: availability.walletName,
      password: effectivePassword,
    };
    const meshWallet = await loadWallet(walletOptions, config);

    // Get wallet info
    const fromAddress = await getWalletAddress(meshWallet);
    const utxos = await getWalletUtxos(meshWallet);
    const { lovelace } = calculateBalance(utxos);

    // Check if wallet has funds
    if (utxos.length === 0 || BigInt(lovelace) === 0n) {
      return {
        status: "error",
        fromAddress,
        toAddress: to,
        amountAda: amount,
        assets,
        network,
        error: `No spendable UTxOs found for this wallet on ${network}. Address: ${fromAddress}`,
      };
    }

    // Build transaction
    let result;
    try {
      result =
        assets.length > 0
          ? await buildMultiAssetTx(meshWallet, to, amount, parseAssets(assets))
          : await buildSendAdaTx(meshWallet, to, amount);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("UTxO Balance Insufficient")) {
        const availableAda = lovelaceToAdaDisplay(lovelace);
        return {
          status: "error",
          fromAddress,
          toAddress: to,
          amountAda: amount,
          assets,
          network,
          error: `Insufficient balance. Available: ${availableAda} ADA across ${utxos.length} UTxOs.`,
        };
      }
      throw e;
    }

    // Dry run: return unsigned tx
    if (dryRun) {
      return {
        status: "built",
        unsignedTx: result.unsignedTx,
        fromAddress,
        toAddress: to,
        amountAda: amount,
        assets,
        network,
      };
    }

    // Sign transaction
    const signResult = await signTransaction(meshWallet, result.unsignedTx);

    // Submit transaction
    const submitResult = await submitTransaction(config, signResult.signedTx);

    // Wait for confirmation
    const confirmResult = await waitForConfirmation(config, submitResult.txHash, 60, 5000);

    if (!confirmResult.confirmed) {
      return {
        status: "submitted",
        txHash: submitResult.txHash,
        fromAddress,
        toAddress: to,
        amountAda: amount,
        assets,
        network,
        error: "Transaction submitted but confirmation timed out. Check tx hash manually.",
      };
    }

    return {
      status: "confirmed",
      txHash: confirmResult.txHash,
      fromAddress,
      toAddress: to,
      amountAda: amount,
      assets,
      network,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transaction failed";
    return {
      status: "error",
      toAddress: to,
      amountAda: amount,
      assets,
      network,
      error: message,
    };
  }
}
