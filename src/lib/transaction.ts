/**
 * Transaction building utilities for Cardano using MeshJS
 * 
 * Provides functions for:
 * - Building simple ADA transactions
 * - Building multi-asset transactions
 * - Transaction signing (online and offline)
 * - Transaction submission with confirmation
 */

import {
  Transaction,
  MeshWallet,
  BlockfrostProvider,
  resolveTxHash,
  type Asset,
  type UTxO,
} from '@meshsdk/core';
import * as fs from 'fs';
import * as path from 'path';

// Network configuration
const BLOCKFROST_URLS: Record<string, string> = {
  mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
  preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
  preview: 'https://cardano-preview.blockfrost.io/api/v0',
};

export interface TransactionConfig {
  network: string;
  apiKey?: string;
}

export interface SendParams {
  to: string;
  lovelace: string;
  assets?: Asset[];
}

export interface TransactionResult {
  unsignedTx: string;
  txHash?: string;
  fee?: string;
}

export interface SignedTransactionResult {
  signedTx: string;
  txHash: string;
}

export interface SubmitResult {
  txHash: string;
  confirmed: boolean;
  confirmations?: number;
}

/**
 * Creates a BlockfrostProvider for the specified network
 */
export function createProvider(config: TransactionConfig): BlockfrostProvider {
  const apiKey = config.apiKey || process.env.BLOCKFROST_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'BLOCKFROST_API_KEY is required. Get one at https://blockfrost.io'
    );
  }

  const networkId = config.network === 'mainnet' ? 1 : 0;
  
  return new BlockfrostProvider(apiKey, networkId);
}

/**
 * Loads a wallet from mnemonic stored in a file
 * File format: 24-word mnemonic, one line or space-separated
 */
export async function loadWallet(
  walletPath: string,
  config: TransactionConfig
): Promise<MeshWallet> {
  const provider = createProvider(config);
  
  // Read mnemonic from file
  const mnemonicRaw = fs.readFileSync(walletPath, 'utf-8').trim();
  const mnemonic = mnemonicRaw.split(/\s+/);
  
  if (mnemonic.length !== 24) {
    throw new Error('Invalid mnemonic: expected 24 words');
  }

  const wallet = new MeshWallet({
    networkId: config.network === 'mainnet' ? 1 : 0,
    fetcher: provider,
    submitter: provider,
    key: {
      type: 'mnemonic',
      words: mnemonic,
    },
  });

  return wallet;
}

/**
 * Convert ADA to Lovelace
 */
export function adaToLovelace(ada: number): string {
  return Math.floor(ada * 1_000_000).toString();
}

/**
 * Convert Lovelace to ADA string for display
 */
export function lovelaceToAda(lovelace: string): string {
  return (Number(lovelace) / 1_000_000).toFixed(6);
}

/**
 * Build a simple ADA send transaction
 */
export async function buildSendAdaTx(
  wallet: MeshWallet,
  to: string,
  amountAda: number
): Promise<TransactionResult> {
  const lovelace = adaToLovelace(amountAda);
  
  const tx = new Transaction({ initiator: wallet });
  tx.sendLovelace(to, lovelace);
  
  const unsignedTx = await tx.build();
  
  return {
    unsignedTx,
  };
}

/**
 * Build a multi-asset transaction (ADA + native tokens)
 */
export async function buildMultiAssetTx(
  wallet: MeshWallet,
  to: string,
  amountAda: number,
  assets: Asset[]
): Promise<TransactionResult> {
  const lovelace = adaToLovelace(amountAda);
  
  const tx = new Transaction({ initiator: wallet });
  
  // Send ADA
  tx.sendLovelace(to, lovelace);
  
  // Send each native asset
  if (assets.length > 0) {
    tx.sendAssets(to, assets);
  }
  
  const unsignedTx = await tx.build();
  
  return {
    unsignedTx,
  };
}

/**
 * Sign a transaction with the wallet
 */
export async function signTransaction(
  wallet: MeshWallet,
  unsignedTx: string
): Promise<SignedTransactionResult> {
  const signedTx = await wallet.signTx(unsignedTx);
  
  // Calculate tx hash from the signed transaction
  const txHash = getTxHash(signedTx);
  
  return {
    signedTx,
    txHash,
  };
}

/**
 * Sign a transaction from file (offline signing)
 */
export async function signTransactionFromFile(
  wallet: MeshWallet,
  txFilePath: string
): Promise<SignedTransactionResult> {
  const unsignedTx = fs.readFileSync(txFilePath, 'utf-8').trim();
  return signTransaction(wallet, unsignedTx);
}

/**
 * Submit a signed transaction to the network
 */
export async function submitTransaction(
  config: TransactionConfig,
  signedTx: string
): Promise<SubmitResult> {
  const provider = createProvider(config);
  
  const txHash = await provider.submitTx(signedTx);
  
  return {
    txHash,
    confirmed: false, // Will be updated by waitForConfirmation
  };
}

/**
 * Submit a signed transaction from file
 */
export async function submitTransactionFromFile(
  config: TransactionConfig,
  txFilePath: string
): Promise<SubmitResult> {
  const signedTx = fs.readFileSync(txFilePath, 'utf-8').trim();
  return submitTransaction(config, signedTx);
}

/**
 * Wait for transaction confirmation
 */
export async function waitForConfirmation(
  config: TransactionConfig,
  txHash: string,
  maxAttempts: number = 60,
  intervalMs: number = 5000
): Promise<SubmitResult> {
  const provider = createProvider(config);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Check if transaction is on-chain
      const txInfo = await provider.fetchTxInfo(txHash);
      
      if (txInfo) {
        return {
          txHash,
          confirmed: true,
          confirmations: 1, // Basic confirmation
        };
      }
    } catch (error) {
      // Transaction not found yet, continue waiting
    }
    
    await sleep(intervalMs);
  }
  
  return {
    txHash,
    confirmed: false,
  };
}

/**
 * Get transaction hash from CBOR
 */
function getTxHash(txCbor: string): string {
  try {
    return resolveTxHash(txCbor);
  } catch {
    return 'pending';
  }
}

/**
 * Save transaction to file
 */
export function saveTxToFile(tx: string, filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, tx);
}

/**
 * Load transaction from file
 */
export function loadTxFromFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Transaction file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8').trim();
}

/**
 * Parse asset string in format "policyId.assetName:amount"
 */
export function parseAssetString(assetStr: string): Asset {
  const [unitPart, amountStr] = assetStr.split(':');
  
  if (!unitPart || !amountStr) {
    throw new Error(
      `Invalid asset format: ${assetStr}. Expected "policyId.assetName:amount"`
    );
  }
  
  const [policyId, assetName] = unitPart.split('.');
  
  if (!policyId || policyId.length !== 56) {
    throw new Error(`Invalid policy ID: ${policyId}. Must be 56 hex characters.`);
  }
  
  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount <= 0) {
    throw new Error(`Invalid amount: ${amountStr}. Must be a positive integer.`);
  }
  
  // Encode asset name to hex if provided
  const assetNameHex = assetName 
    ? Buffer.from(assetName, 'utf-8').toString('hex')
    : '';
  
  return {
    unit: policyId + assetNameHex,
    quantity: amount.toString(),
  };
}

/**
 * Parse multiple asset strings
 */
export function parseAssets(assetStrings: string[]): Asset[] {
  return assetStrings.map(parseAssetString);
}

/**
 * Utility sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get wallet address for display
 */
export async function getWalletAddress(wallet: MeshWallet): Promise<string> {
  const addresses = await wallet.getUsedAddresses();
  if (addresses.length > 0) {
    return addresses[0];
  }
  // Get unused address if no used addresses
  const unusedAddresses = await wallet.getUnusedAddresses();
  return unusedAddresses[0] || '';
}

/**
 * Get wallet UTxOs for balance checking
 */
export async function getWalletUtxos(wallet: MeshWallet): Promise<UTxO[]> {
  return wallet.getUtxos();
}

/**
 * Calculate total balance from UTxOs
 */
export function calculateBalance(utxos: UTxO[]): {
  lovelace: string;
  assets: Map<string, string>;
} {
  let totalLovelace = BigInt(0);
  const assets = new Map<string, string>();
  
  for (const utxo of utxos) {
    for (const amount of utxo.output.amount) {
      if (amount.unit === 'lovelace') {
        totalLovelace += BigInt(amount.quantity);
      } else {
        const current = BigInt(assets.get(amount.unit) || '0');
        assets.set(amount.unit, (current + BigInt(amount.quantity)).toString());
      }
    }
  }
  
  return {
    lovelace: totalLovelace.toString(),
    assets,
  };
}
