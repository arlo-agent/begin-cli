/**
 * Key storage abstraction for begin-cli
 * 
 * Supports two modes:
 * 1. Encrypted file storage (~/.begin-cli/wallets/)
 * 2. Environment variable (BEGIN_CLI_MNEMONIC) for CI/agent use
 * 
 * Config file: ~/.begin-cli/config.json stores default wallet selection
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Environment variable name for mnemonic
export const MNEMONIC_ENV_VAR = 'BEGIN_CLI_MNEMONIC';

// Base directory for begin-cli config
export const CONFIG_DIR = join(homedir(), '.begin-cli');
export const WALLETS_DIR = join(CONFIG_DIR, 'wallets');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Encryption settings
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export interface WalletFile {
  name: string;
  encryptedMnemonic: string;
  salt: string;
  iv: string;
  authTag: string;
  createdAt: string;
  network?: string;
}

export interface Config {
  defaultWallet?: string;
  defaultNetwork?: string;
}

export interface KeystoreSource {
  type: 'env' | 'file';
  walletName?: string;
}

/**
 * Ensure config directories exist
 */
export function ensureConfigDirs(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { mode: 0o700 });
  }
  if (!existsSync(WALLETS_DIR)) {
    mkdirSync(WALLETS_DIR, { mode: 0o700 });
  }
}

/**
 * Get mnemonic from environment variable
 * 
 * @returns Mnemonic string or null if not set
 */
export function getMnemonicFromEnv(): string | null {
  const mnemonic = process.env[MNEMONIC_ENV_VAR];
  return mnemonic?.trim() || null;
}

/**
 * Check if environment variable is set
 */
export function hasEnvMnemonic(): boolean {
  return !!process.env[MNEMONIC_ENV_VAR];
}

/**
 * Encrypt a mnemonic with a password
 * 
 * @param mnemonic - The mnemonic to encrypt
 * @param password - User password for encryption
 * @returns Encrypted data with salt, iv, and authTag
 */
export function encryptMnemonic(
  mnemonic: string,
  password: string
): { encrypted: string; salt: string; iv: string; authTag: string } {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  
  // Derive key from password using scrypt
  const key = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(mnemonic, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt an encrypted mnemonic with a password
 * 
 * @param encrypted - Encrypted mnemonic hex string
 * @param password - User password
 * @param salt - Salt hex string
 * @param iv - IV hex string
 * @param authTag - Auth tag hex string
 * @returns Decrypted mnemonic
 */
export function decryptMnemonic(
  encrypted: string,
  password: string,
  salt: string,
  iv: string,
  authTag: string
): string {
  const key = scryptSync(password, Buffer.from(salt, 'hex'), KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Save a wallet to encrypted file storage
 * 
 * @param name - Wallet name (alphanumeric, dashes, underscores)
 * @param mnemonic - Mnemonic to encrypt and save
 * @param password - Password for encryption
 * @param network - Optional default network for this wallet
 */
export function saveWallet(
  name: string,
  mnemonic: string,
  password: string,
  network?: string
): void {
  // Validate name
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('Wallet name must be alphanumeric (dashes and underscores allowed)');
  }
  
  ensureConfigDirs();
  
  const { encrypted, salt, iv, authTag } = encryptMnemonic(mnemonic, password);
  
  const walletFile: WalletFile = {
    name,
    encryptedMnemonic: encrypted,
    salt,
    iv,
    authTag,
    createdAt: new Date().toISOString(),
    network,
  };
  
  const filePath = join(WALLETS_DIR, `${name}.json`);
  writeFileSync(filePath, JSON.stringify(walletFile, null, 2), { mode: 0o600 });
}

/**
 * Load and decrypt a wallet from file storage
 * 
 * @param name - Wallet name
 * @param password - Password for decryption
 * @returns Decrypted mnemonic
 */
export function loadWallet(name: string, password: string): string {
  const filePath = join(WALLETS_DIR, `${name}.json`);
  
  if (!existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }
  
  const data = JSON.parse(readFileSync(filePath, 'utf8')) as WalletFile;
  
  try {
    return decryptMnemonic(
      data.encryptedMnemonic,
      password,
      data.salt,
      data.iv,
      data.authTag
    );
  } catch (error) {
    throw new Error('Incorrect password or corrupted wallet file');
  }
}

/**
 * List all saved wallets
 * 
 * @returns Array of wallet names
 */
export function listWallets(): string[] {
  ensureConfigDirs();
  
  try {
    const files = readdirSync(WALLETS_DIR);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

/**
 * Delete a wallet from file storage
 * 
 * @param name - Wallet name to delete
 */
export function deleteWallet(name: string): void {
  const filePath = join(WALLETS_DIR, `${name}.json`);
  
  if (!existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }
  
  unlinkSync(filePath);
}

/**
 * Check if a wallet exists
 * 
 * @param name - Wallet name
 * @returns True if wallet exists
 */
export function walletExists(name: string): boolean {
  const filePath = join(WALLETS_DIR, `${name}.json`);
  return existsSync(filePath);
}

/**
 * Get wallet metadata without decrypting
 * 
 * @param name - Wallet name
 * @returns Wallet metadata (without encrypted data)
 */
export function getWalletInfo(name: string): { name: string; createdAt: string; network?: string } {
  const filePath = join(WALLETS_DIR, `${name}.json`);
  
  if (!existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }
  
  const data = JSON.parse(readFileSync(filePath, 'utf8')) as WalletFile;
  
  return {
    name: data.name,
    createdAt: data.createdAt,
    network: data.network,
  };
}

/**
 * Load config file
 * 
 * @returns Config object
 */
export function loadConfig(): Config {
  ensureConfigDirs();
  
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Config;
  } catch {
    return {};
  }
}

/**
 * Save config file
 * 
 * @param config - Config object to save
 */
export function saveConfig(config: Config): void {
  ensureConfigDirs();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Set the default wallet
 * 
 * @param name - Wallet name to set as default
 */
export function setDefaultWallet(name: string): void {
  if (!walletExists(name)) {
    throw new Error(`Wallet "${name}" not found`);
  }
  
  const config = loadConfig();
  config.defaultWallet = name;
  saveConfig(config);
}

/**
 * Get the default wallet name
 * 
 * @returns Default wallet name or null
 */
export function getDefaultWallet(): string | null {
  const config = loadConfig();
  return config.defaultWallet || null;
}

/**
 * Determine the best source for mnemonic
 * Priority: 1. Environment variable, 2. Default wallet from config
 * 
 * @returns Source information or null if no source available
 */
export function getPreferredSource(): KeystoreSource | null {
  // Environment variable takes priority (for CI/agent use)
  if (hasEnvMnemonic()) {
    return { type: 'env' };
  }
  
  // Fall back to default wallet
  const defaultWallet = getDefaultWallet();
  if (defaultWallet && walletExists(defaultWallet)) {
    return { type: 'file', walletName: defaultWallet };
  }
  
  // Check if any wallets exist
  const wallets = listWallets();
  if (wallets.length === 1) {
    return { type: 'file', walletName: wallets[0] };
  }
  
  return null;
}

/**
 * Get mnemonic from the preferred source
 * 
 * @param password - Password for file-based wallets (required if source is file)
 * @param walletName - Optional specific wallet name to use
 * @returns Mnemonic string
 */
export function getMnemonic(password?: string, walletName?: string): string {
  // If specific wallet requested
  if (walletName) {
    if (!password) {
      throw new Error('Password required for wallet decryption');
    }
    return loadWallet(walletName, password);
  }
  
  // Check environment variable first
  const envMnemonic = getMnemonicFromEnv();
  if (envMnemonic) {
    return envMnemonic;
  }
  
  // Use default wallet
  const defaultWallet = getDefaultWallet();
  if (defaultWallet) {
    if (!password) {
      throw new Error('Password required for wallet decryption');
    }
    return loadWallet(defaultWallet, password);
  }
  
  // Check for single wallet
  const wallets = listWallets();
  if (wallets.length === 1) {
    if (!password) {
      throw new Error('Password required for wallet decryption');
    }
    return loadWallet(wallets[0], password);
  }
  
  throw new Error(
    'No wallet available. Set BEGIN_CLI_MNEMONIC environment variable or create a wallet.'
  );
}
