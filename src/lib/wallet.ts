/**
 * Wallet Core Module
 * Handles wallet creation, restoration, encryption, and key management for Cardano
 *
 * Supports two storage modes:
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

export type WalletFile = EncryptedWalletFile | EncryptedWalletFileV2;

export interface WalletInfo {
  name: string;
  networkId: 0 | 1;
  paymentAddress: string;
  stakeAddress?: string;
  createdAt: string;
  usesKeychain?: boolean;
}

export interface CreateWalletResult {
  mnemonic: string[];
  walletInfo: WalletInfo;
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
 * For v2 wallets, password is ignored (uses keychain)
 * For v1 wallets, password is required
 */
export async function unlockWallet(name: string, password: string): Promise<MeshWallet> {
  const walletFile = await loadWalletFile(name);

  if (walletFile.version === 2) {
    // v2: Use keychain - import loadWalletWithKeychain from keystore
    const { loadWalletWithKeychain } = await import("./keystore.js");
    const mnemonicStr = await loadWalletWithKeychain(name);
    const mnemonic = mnemonicStr.split(/\s+/);
    return createMeshWallet(mnemonic, walletFile.networkId);
  }

  // v1: Use password
  const mnemonic = decryptMnemonic(walletFile.encrypted, password);
  return createMeshWallet(mnemonic, walletFile.networkId);
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
