/**
 * Wallet Core Module
 * Handles wallet creation, restoration, encryption, and key management
 *
 * Supports multiple chains: Cardano, Solana, Bitcoin, EVM
 *
 * Wallet file versions:
 * - v3 (multi-chain): Stores addresses for all chains from single mnemonic
 * - v2 (keychain): Uses OS keychain for encryption key storage (no password required)
 * - v1 (password): Uses password-derived key (backward compatible)
 */

import { MeshWallet } from "@meshsdk/core";
import * as bip39 from "bip39";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { homedir } from "os";
import {
  isKeychainAvailable,
  setKeychainKey,
  deleteKeychainKey,
  generateEncryptionKey,
  encryptWithKey,
  type WalletFileV2,
} from "./keystore.js";
import type { MultiChainAddresses, ChainId } from "./chains/types.js";
import { createSolanaAdapter } from "./chains/solana.js";
import { createBitcoinAdapter } from "./chains/bitcoin.js";

// Encryption constants
const SCRYPT_N = 2 ** 14; // CPU/memory cost parameter
const SCRYPT_R = 8; // Block size parameter
const SCRYPT_P = 1; // Parallelization parameter
const KEY_LENGTH = 32; // AES-256 key length
const SALT_LENGTH = 32;
const IV_LENGTH = 12; // GCM recommended IV length

export interface WalletConfig {
  name: string;
  networkId: 0 | 1; // 0 = testnet, 1 = mainnet
}

// v1 wallet format (password-based)
export interface EncryptedWalletFile {
  version: 1;
  name: string;
  networkId: 0 | 1;
  encrypted: {
    salt: string; // hex
    iv: string; // hex
    authTag: string; // hex
    ciphertext: string; // hex
  };
  createdAt: string;
  addresses: {
    payment: string;
    stake?: string;
  };
}

// v2 wallet format (keychain-based)
export interface EncryptedWalletFileV2 {
  version: 2;
  name: string;
  networkId: 0 | 1;
  encrypted: {
    iv: string; // hex
    authTag: string; // hex
    ciphertext: string; // hex
  };
  createdAt: string;
  addresses: {
    payment: string;
    stake?: string;
  };
}

// v3 wallet format (multi-chain)
export interface EncryptedWalletFileV3 {
  version: 3;
  name: string;
  encrypted: {
    salt?: string; // hex (only for password-based)
    iv: string; // hex
    authTag: string; // hex
    ciphertext: string; // hex (encrypted mnemonic)
  };
  createdAt: string;
  chains: MultiChainAddresses;
}

export type WalletFile = EncryptedWalletFile | EncryptedWalletFileV2 | EncryptedWalletFileV3;

export interface WalletInfo {
  name: string;
  networkId: 0 | 1;
  paymentAddress: string;
  stakeAddress?: string;
  createdAt: string;
  usesKeychain?: boolean;
}

export interface MultiChainWalletInfo {
  name: string;
  createdAt: string;
  usesKeychain: boolean;
  chains: MultiChainAddresses;
}

export interface CreateWalletResult {
  mnemonic: string[];
  walletInfo: WalletInfo;
  usesKeychain: boolean;
}

export interface CreateMultiChainWalletResult {
  mnemonic: string[];
  walletInfo: MultiChainWalletInfo;
  usesKeychain: boolean;
}

/**
 * Get the wallets directory path
 */
export function getWalletsDir(): string {
  return path.join(homedir(), ".begin-cli", "wallets");
}

/**
 * Get the path for a specific wallet file
 */
export function getWalletPath(name: string): string {
  return path.join(getWalletsDir(), `${name}.json`);
}

/**
 * Ensure the wallets directory exists
 */
async function ensureWalletsDir(): Promise<void> {
  const dir = getWalletsDir();
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Check if a wallet with the given name already exists
 */
export async function walletExists(name: string): Promise<boolean> {
  try {
    await fs.access(getWalletPath(name));
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a new BIP39 mnemonic (24 words)
 */
export function generateMnemonic(): string[] {
  const mnemonic = bip39.generateMnemonic(256); // 256 bits = 24 words
  return mnemonic.split(" ");
}

/**
 * Validate a BIP39 mnemonic
 */
export function validateMnemonic(words: string[]): boolean {
  const mnemonic = words.join(" ");
  return bip39.validateMnemonic(mnemonic);
}

/**
 * Derive encryption key from password using scrypt
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

/**
 * Encrypt mnemonic with AES-256-GCM (v1 password-based)
 */
function encryptMnemonic(
  mnemonic: string[],
  password: string
): {
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
} {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(mnemonic);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  const authTag = cipher.getAuthTag();

  return {
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
}

/**
 * Decrypt mnemonic from encrypted data (v1)
 */
export function decryptMnemonic(
  encrypted: {
    salt: string;
    iv: string;
    authTag: string;
    ciphertext: string;
  },
  password: string
): string[] {
  const salt = Buffer.from(encrypted.salt, "hex");
  const iv = Buffer.from(encrypted.iv, "hex");
  const authTag = Buffer.from(encrypted.authTag, "hex");
  const ciphertext = Buffer.from(encrypted.ciphertext, "hex");

  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return JSON.parse(decrypted.toString("utf8"));
}

/**
 * Create a MeshWallet instance from mnemonic
 */
export function createMeshWallet(mnemonic: string[], networkId: 0 | 1): MeshWallet {
  return new MeshWallet({
    networkId,
    key: {
      type: "mnemonic",
      words: mnemonic,
    },
  });
}

/**
 * Create a new wallet with keychain-based storage (v2)
 * Falls back to password-based storage if keychain unavailable
 */
export async function createWallet(
  config: WalletConfig,
  password: string
): Promise<CreateWalletResult> {
  // Check if wallet already exists
  if (await walletExists(config.name)) {
    throw new Error(`Wallet "${config.name}" already exists`);
  }

  // Generate mnemonic
  const mnemonic = generateMnemonic();

  // Create MeshWallet to get addresses
  const meshWallet = createMeshWallet(mnemonic, config.networkId);
  const paymentAddress = await meshWallet.getChangeAddress();

  let stakeAddress: string | undefined;
  try {
    const rewardAddresses = await meshWallet.getRewardAddresses();
    stakeAddress = rewardAddresses[0];
  } catch {
    // Some wallet configs may not have stake addresses
  }

  // Try keychain-based storage first
  const keychainAvailable = await isKeychainAvailable();

  if (keychainAvailable) {
    // v2: Use keychain for encryption key
    const encryptionKey = generateEncryptionKey();
    const plaintext = JSON.stringify(mnemonic);
    const encrypted = encryptWithKey(plaintext, encryptionKey);

    // Store encryption key in keychain
    await setKeychainKey(config.name, encryptionKey);

    // Create v2 wallet file (no salt - key is in keychain)
    const walletFile: WalletFileV2 = {
      version: 2,
      name: config.name,
      networkId: config.networkId,
      encrypted,
      createdAt: new Date().toISOString(),
      addresses: {
        payment: paymentAddress,
        stake: stakeAddress,
      },
    };

    // Save to file
    await ensureWalletsDir();
    await fs.writeFile(getWalletPath(config.name), JSON.stringify(walletFile, null, 2), {
      mode: 0o600,
    });

    return {
      mnemonic,
      walletInfo: {
        name: config.name,
        networkId: config.networkId,
        paymentAddress,
        stakeAddress,
        createdAt: walletFile.createdAt,
        usesKeychain: true,
      },
      usesKeychain: true,
    };
  }

  // Fallback: v1 password-based storage
  const encrypted = encryptMnemonic(mnemonic, password);

  const walletFile: EncryptedWalletFile = {
    version: 1,
    name: config.name,
    networkId: config.networkId,
    encrypted,
    createdAt: new Date().toISOString(),
    addresses: {
      payment: paymentAddress,
      stake: stakeAddress,
    },
  };

  // Save to file
  await ensureWalletsDir();
  await fs.writeFile(getWalletPath(config.name), JSON.stringify(walletFile, null, 2), {
    mode: 0o600,
  });

  return {
    mnemonic,
    walletInfo: {
      name: config.name,
      networkId: config.networkId,
      paymentAddress,
      stakeAddress,
      createdAt: walletFile.createdAt,
      usesKeychain: false,
    },
    usesKeychain: false,
  };
}

/**
 * Restore a wallet from mnemonic
 * Uses keychain-based storage (v2) if available, falls back to password-based (v1)
 */
export async function restoreWallet(
  config: WalletConfig,
  mnemonic: string[],
  password: string
): Promise<WalletInfo> {
  // Validate mnemonic
  if (!validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  // Check if wallet already exists
  if (await walletExists(config.name)) {
    throw new Error(`Wallet "${config.name}" already exists`);
  }

  // Create MeshWallet to get addresses
  const meshWallet = createMeshWallet(mnemonic, config.networkId);
  const paymentAddress = await meshWallet.getChangeAddress();

  let stakeAddress: string | undefined;
  try {
    const rewardAddresses = await meshWallet.getRewardAddresses();
    stakeAddress = rewardAddresses[0];
  } catch {
    // Some wallet configs may not have stake addresses
  }

  // Try keychain-based storage first
  const keychainAvailable = await isKeychainAvailable();

  if (keychainAvailable) {
    // v2: Use keychain for encryption key
    const encryptionKey = generateEncryptionKey();
    const plaintext = JSON.stringify(mnemonic);
    const encrypted = encryptWithKey(plaintext, encryptionKey);

    // Store encryption key in keychain
    await setKeychainKey(config.name, encryptionKey);

    // Create v2 wallet file
    const walletFile: WalletFileV2 = {
      version: 2,
      name: config.name,
      networkId: config.networkId,
      encrypted,
      createdAt: new Date().toISOString(),
      addresses: {
        payment: paymentAddress,
        stake: stakeAddress,
      },
    };

    // Save to file
    await ensureWalletsDir();
    await fs.writeFile(getWalletPath(config.name), JSON.stringify(walletFile, null, 2), {
      mode: 0o600,
    });

    return {
      name: config.name,
      networkId: config.networkId,
      paymentAddress,
      stakeAddress,
      createdAt: walletFile.createdAt,
      usesKeychain: true,
    };
  }

  // Fallback: v1 password-based storage
  const encrypted = encryptMnemonic(mnemonic, password);

  const walletFile: EncryptedWalletFile = {
    version: 1,
    name: config.name,
    networkId: config.networkId,
    encrypted,
    createdAt: new Date().toISOString(),
    addresses: {
      payment: paymentAddress,
      stake: stakeAddress,
    },
  };

  // Save to file
  await ensureWalletsDir();
  await fs.writeFile(getWalletPath(config.name), JSON.stringify(walletFile, null, 2), {
    mode: 0o600,
  });

  return {
    name: config.name,
    networkId: config.networkId,
    paymentAddress,
    stakeAddress,
    createdAt: walletFile.createdAt,
    usesKeychain: false,
  };
}

/**
 * Load a wallet file (without decrypting)
 */
export async function loadWalletFile(name: string): Promise<WalletFile> {
  const filePath = getWalletPath(name);
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as WalletFile;
}

/**
 * Unlock a wallet and return a MeshWallet instance
 * For v2/v3 wallets without salt, password is ignored (uses keychain)
 * For v1/v3 wallets with salt, password is required
 */
export async function unlockWallet(name: string, password: string): Promise<MeshWallet> {
  const walletFile = await loadWalletFile(name);

  // Get networkId (v1/v2 have it directly, v3 has it in chains.cardano)
  let networkId: 0 | 1;
  if (walletFile.version === 3) {
    networkId = walletFile.chains.cardano?.networkId ?? 1;
  } else {
    networkId = walletFile.networkId;
  }

  if (walletFile.version === 2 || (walletFile.version === 3 && !walletFile.encrypted.salt)) {
    // v2 or v3 keychain-based: Use keychain
    const { loadWalletWithKeychain } = await import("./keystore.js");
    const mnemonicStr = await loadWalletWithKeychain(name);
    const mnemonic = mnemonicStr.split(/\s+/);
    return createMeshWallet(mnemonic, networkId);
  }

  // v1 or v3 password-based: Use password
  const encrypted = walletFile.encrypted as {
    salt: string;
    iv: string;
    authTag: string;
    ciphertext: string;
  };
  const mnemonic = decryptMnemonic(encrypted, password);
  return createMeshWallet(mnemonic, networkId);
}

/**
 * List all wallet names
 */
export async function listWallets(): Promise<string[]> {
  try {
    const dir = getWalletsDir();
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

/**
 * Delete a wallet (file and keychain entry)
 */
export async function deleteWallet(name: string): Promise<void> {
  const filePath = getWalletPath(name);

  // Delete from keychain if exists
  try {
    await deleteKeychainKey(name);
  } catch {
    // Ignore keychain errors
  }

  await fs.unlink(filePath);
}

/**
 * Derive addresses for all supported chains from a mnemonic
 */
async function deriveMultiChainAddresses(
  mnemonic: string[],
  networkId: 0 | 1
): Promise<MultiChainAddresses> {
  const addresses: MultiChainAddresses = {};

  // Cardano addresses
  const meshWallet = createMeshWallet(mnemonic, networkId);
  const paymentAddress = await meshWallet.getChangeAddress();
  let stakeAddress: string | undefined;
  try {
    const rewardAddresses = await meshWallet.getRewardAddresses();
    stakeAddress = rewardAddresses[0];
  } catch {
    // Some wallet configs may not have stake addresses
  }
  addresses.cardano = {
    networkId,
    addresses: {
      payment: paymentAddress,
      stake: stakeAddress,
    },
  };

  // Solana addresses
  const solanaAdapter = createSolanaAdapter();
  const solanaWallet = await solanaAdapter.createWallet(mnemonic);
  addresses.solana = {
    address: solanaWallet.address,
    publicKey: solanaWallet.publicKey,
  };

  // Bitcoin addresses
  const bitcoinNetwork = networkId === 1 ? "mainnet" : "testnet";
  const bitcoinAdapter = createBitcoinAdapter(bitcoinNetwork);
  const bitcoinWallet = await bitcoinAdapter.createWallet(mnemonic);
  addresses.bitcoin = {
    address: bitcoinWallet.address,
    publicKey: bitcoinWallet.publicKey,
  };

  return addresses;
}

/**
 * Create a new multi-chain wallet (v3 format)
 */
export async function createMultiChainWallet(
  name: string,
  networkId: 0 | 1,
  password: string
): Promise<CreateMultiChainWalletResult> {
  // Check if wallet already exists
  if (await walletExists(name)) {
    throw new Error(`Wallet "${name}" already exists`);
  }

  // Generate mnemonic
  const mnemonic = generateMnemonic();

  // Derive addresses for all chains
  const chains = await deriveMultiChainAddresses(mnemonic, networkId);

  // Try keychain-based storage first
  const keychainAvailable = await isKeychainAvailable();

  if (keychainAvailable) {
    // v3 with keychain
    const encryptionKey = generateEncryptionKey();
    const plaintext = JSON.stringify(mnemonic);
    const encrypted = encryptWithKey(plaintext, encryptionKey);

    await setKeychainKey(name, encryptionKey);

    const walletFile: EncryptedWalletFileV3 = {
      version: 3,
      name,
      encrypted,
      createdAt: new Date().toISOString(),
      chains,
    };

    await ensureWalletsDir();
    await fs.writeFile(getWalletPath(name), JSON.stringify(walletFile, null, 2), {
      mode: 0o600,
    });

    return {
      mnemonic,
      walletInfo: {
        name,
        createdAt: walletFile.createdAt,
        usesKeychain: true,
        chains,
      },
      usesKeychain: true,
    };
  }

  // Fallback: password-based
  const encrypted = encryptMnemonic(mnemonic, password);

  const walletFile: EncryptedWalletFileV3 = {
    version: 3,
    name,
    encrypted,
    createdAt: new Date().toISOString(),
    chains,
  };

  await ensureWalletsDir();
  await fs.writeFile(getWalletPath(name), JSON.stringify(walletFile, null, 2), {
    mode: 0o600,
  });

  return {
    mnemonic,
    walletInfo: {
      name,
      createdAt: walletFile.createdAt,
      usesKeychain: false,
      chains,
    },
    usesKeychain: false,
  };
}

/**
 * Restore a multi-chain wallet from mnemonic (v3 format)
 */
export async function restoreMultiChainWallet(
  name: string,
  networkId: 0 | 1,
  mnemonic: string[],
  password: string
): Promise<MultiChainWalletInfo> {
  // Validate mnemonic
  if (!validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  // Check if wallet already exists
  if (await walletExists(name)) {
    throw new Error(`Wallet "${name}" already exists`);
  }

  // Derive addresses for all chains
  const chains = await deriveMultiChainAddresses(mnemonic, networkId);

  // Try keychain-based storage first
  const keychainAvailable = await isKeychainAvailable();

  if (keychainAvailable) {
    const encryptionKey = generateEncryptionKey();
    const plaintext = JSON.stringify(mnemonic);
    const encrypted = encryptWithKey(plaintext, encryptionKey);

    await setKeychainKey(name, encryptionKey);

    const walletFile: EncryptedWalletFileV3 = {
      version: 3,
      name,
      encrypted,
      createdAt: new Date().toISOString(),
      chains,
    };

    await ensureWalletsDir();
    await fs.writeFile(getWalletPath(name), JSON.stringify(walletFile, null, 2), {
      mode: 0o600,
    });

    return {
      name,
      createdAt: walletFile.createdAt,
      usesKeychain: true,
      chains,
    };
  }

  // Fallback: password-based
  const encrypted = encryptMnemonic(mnemonic, password);

  const walletFile: EncryptedWalletFileV3 = {
    version: 3,
    name,
    encrypted,
    createdAt: new Date().toISOString(),
    chains,
  };

  await ensureWalletsDir();
  await fs.writeFile(getWalletPath(name), JSON.stringify(walletFile, null, 2), {
    mode: 0o600,
  });

  return {
    name,
    createdAt: walletFile.createdAt,
    usesKeychain: false,
    chains,
  };
}

/**
 * Get the mnemonic from a wallet file (decrypted)
 */
export async function getMnemonic(name: string, password: string): Promise<string[]> {
  const walletFile = await loadWalletFile(name);

  if (walletFile.version === 2 || (walletFile.version === 3 && !walletFile.encrypted.salt)) {
    // Keychain-based - no password needed
    const { loadWalletWithKeychain } = await import("./keystore.js");
    const mnemonicStr = await loadWalletWithKeychain(name);
    return mnemonicStr.split(/\s+/);
  }

  // Password-based - v1 or v3 with salt
  const encrypted = walletFile.encrypted as {
    salt: string;
    iv: string;
    authTag: string;
    ciphertext: string;
  };
  return decryptMnemonic(encrypted, password);
}

/**
 * Get chain address from wallet file
 */
export async function getChainAddress(name: string, chain: ChainId): Promise<string | undefined> {
  const walletFile = await loadWalletFile(name);

  if (walletFile.version === 3) {
    const chainData = walletFile.chains[chain];
    if (!chainData) return undefined;

    if (chain === "cardano") {
      return walletFile.chains.cardano?.addresses.payment;
    }
    if (chain === "solana") {
      return walletFile.chains.solana?.address;
    }
    if (chain === "bitcoin") {
      return walletFile.chains.bitcoin?.address;
    }
    if (chain === "evm") {
      return walletFile.chains.evm?.address;
    }
  }

  // v1/v2 only have Cardano
  if (chain === "cardano" && walletFile.version !== 3) {
    return walletFile.addresses.payment;
  }

  return undefined;
}

/**
 * Check if wallet supports a specific chain
 */
export async function walletSupportsChain(name: string, chain: ChainId): Promise<boolean> {
  const walletFile = await loadWalletFile(name);

  if (walletFile.version === 3) {
    return !!walletFile.chains[chain];
  }

  // v1/v2 only support Cardano
  return chain === "cardano";
}

/**
 * Check if wallet is multi-chain (v3)
 */
export async function isMultiChainWallet(name: string): Promise<boolean> {
  const walletFile = await loadWalletFile(name);
  return walletFile.version === 3;
}

/**
 * Get all chain addresses from wallet
 */
export async function getAllChainAddresses(name: string): Promise<MultiChainAddresses> {
  const walletFile = await loadWalletFile(name);

  if (walletFile.version === 3) {
    return walletFile.chains;
  }

  // v1/v2 - convert to multi-chain format
  return {
    cardano: {
      networkId: walletFile.networkId,
      addresses: walletFile.addresses,
    },
  };
}

/**
 * Add a chain to an existing wallet (upgrade to v3 if needed)
 */
export async function addChainToWallet(
  name: string,
  chain: ChainId,
  password: string
): Promise<void> {
  const mnemonic = await getMnemonic(name, password);
  const walletFile = await loadWalletFile(name);

  // Get existing chains or convert v1/v2 to v3 format
  let chains: MultiChainAddresses;
  let networkId: 0 | 1;

  if (walletFile.version === 3) {
    chains = { ...walletFile.chains };
    networkId = walletFile.chains.cardano?.networkId ?? 1;
  } else {
    networkId = walletFile.networkId;
    chains = {
      cardano: {
        networkId,
        addresses: walletFile.addresses,
      },
    };
  }

  // Derive and add the new chain
  if (chain === "solana" && !chains.solana) {
    const solanaAdapter = createSolanaAdapter();
    const solanaWallet = await solanaAdapter.createWallet(mnemonic);
    chains.solana = {
      address: solanaWallet.address,
      publicKey: solanaWallet.publicKey,
    };
  }

  if (chain === "bitcoin" && !chains.bitcoin) {
    const bitcoinNetwork = networkId === 1 ? "mainnet" : "testnet";
    const bitcoinAdapter = createBitcoinAdapter(bitcoinNetwork);
    const bitcoinWallet = await bitcoinAdapter.createWallet(mnemonic);
    chains.bitcoin = {
      address: bitcoinWallet.address,
      publicKey: bitcoinWallet.publicKey,
    };
  }
  // EVM will be added in Phase 3

  // Create updated v3 wallet file
  const keychainAvailable = await isKeychainAvailable();

  let encrypted: EncryptedWalletFileV3["encrypted"];
  if (keychainAvailable) {
    const encryptionKey = generateEncryptionKey();
    const plaintext = JSON.stringify(mnemonic);
    encrypted = encryptWithKey(plaintext, encryptionKey);
    await setKeychainKey(name, encryptionKey);
  } else {
    encrypted = encryptMnemonic(mnemonic, password);
  }

  const newWalletFile: EncryptedWalletFileV3 = {
    version: 3,
    name,
    encrypted,
    createdAt: walletFile.createdAt,
    chains,
  };

  await fs.writeFile(getWalletPath(name), JSON.stringify(newWalletFile, null, 2), {
    mode: 0o600,
  });
}
