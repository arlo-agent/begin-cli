/**
 * Core wallet operations logic
 *
 * Pure functions for wallet creation, restoration, and address derivation.
 */

import {
  createWallet as libCreateWallet,
  restoreWallet as libRestoreWallet,
  validateMnemonic,
  type WalletConfig,
} from '../lib/wallet.js';
import {
  loadWallet,
  checkWalletAvailability,
  getWalletAddress,
  type WalletOptions,
  type TransactionConfig,
} from '../lib/transaction.js';
import {
  listWallets as libListWallets,
  getDefaultWallet,
  hasEnvMnemonic,
} from '../lib/keystore.js';

export interface WalletCreateResult {
  name: string;
  mnemonic: string[];
  address: string;
  stakeAddress?: string;
}

export interface WalletRestoreResult {
  name: string;
  address: string;
  stakeAddress?: string;
}

export interface WalletAddressResult {
  walletName?: string;
  source: 'env' | 'wallet';
  address: string;
  stakeAddress?: string;
  network: string;
}

export interface WalletListResult {
  wallets: string[];
  defaultWallet?: string;
  hasEnvMnemonic: boolean;
}

/**
 * Create a new HD wallet
 */
export async function createWallet(
  name: string,
  password: string,
  network: string = 'mainnet'
): Promise<WalletCreateResult> {
  // Check if wallet already exists
  const wallets = libListWallets();
  if (wallets.includes(name)) {
    throw new Error(`Wallet "${name}" already exists`);
  }

  // Create wallet config
  const walletConfig: WalletConfig = {
    name,
    networkId: network === 'mainnet' ? 1 : 0,
  };

  // Create the wallet (generates mnemonic, encrypts, saves)
  const result = await libCreateWallet(walletConfig, password);

  return {
    name,
    mnemonic: result.mnemonic,
    address: result.walletInfo.paymentAddress,
    stakeAddress: result.walletInfo.stakeAddress,
  };
}

/**
 * Restore a wallet from mnemonic
 */
export async function restoreWallet(
  name: string,
  mnemonic: string,
  password: string,
  network: string = 'mainnet'
): Promise<WalletRestoreResult> {
  // Parse mnemonic
  const mnemonicWords = mnemonic.trim().split(/\s+/);

  // Validate mnemonic
  if (!validateMnemonic(mnemonicWords)) {
    throw new Error('Invalid mnemonic phrase');
  }

  // Check if wallet already exists
  const wallets = libListWallets();
  if (wallets.includes(name)) {
    throw new Error(`Wallet "${name}" already exists`);
  }

  // Create wallet config
  const walletConfig: WalletConfig = {
    name,
    networkId: network === 'mainnet' ? 1 : 0,
  };

  // Restore the wallet
  const walletInfo = await libRestoreWallet(walletConfig, mnemonicWords, password);

  return {
    name,
    address: walletInfo.paymentAddress,
    stakeAddress: walletInfo.stakeAddress,
  };
}

/**
 * Get wallet address(es)
 */
export async function getWalletAddresses(
  walletName: string | undefined,
  password: string | undefined,
  network: string = 'mainnet'
): Promise<WalletAddressResult> {
  const availability = checkWalletAvailability(walletName);

  if (!availability.available) {
    throw new Error(availability.error || 'No wallet available');
  }

  // For env-based wallet, password is not needed
  // For file-based wallet, password is required
  if (availability.needsPassword && !password) {
    throw new Error('Password is required for wallet decryption');
  }

  const config: TransactionConfig = { network };
  const options: WalletOptions = {
    walletName: availability.walletName,
    password,
  };

  const wallet = await loadWallet(options, config);
  const address = await getWalletAddress(wallet);

  let stakeAddress: string | undefined;
  try {
    const rewardAddresses = await wallet.getRewardAddresses();
    stakeAddress = rewardAddresses[0];
  } catch {
    // Stake address derivation might fail
  }

  return {
    walletName: availability.walletName,
    source: availability.source!,
    address,
    stakeAddress,
    network,
  };
}

/**
 * List available wallets
 */
export function getWalletList(): WalletListResult {
  const defaultWallet = getDefaultWallet();
  return {
    wallets: libListWallets(),
    defaultWallet: defaultWallet || undefined,
    hasEnvMnemonic: hasEnvMnemonic(),
  };
}

/**
 * Get receive address (alias for getWalletAddresses)
 */
export async function getReceiveAddress(
  walletName: string | undefined,
  password: string | undefined,
  network: string = 'mainnet'
): Promise<string> {
  const result = await getWalletAddresses(walletName, password, network);
  return result.address;
}
