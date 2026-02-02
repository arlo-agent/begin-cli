/**
 * Key storage abstraction for begin-cli
 * 
 * Supports two modes:
 * 1. Encrypted file storage (~/.begin-cli/wallets/)
 * 2. Environment variable (BEGIN_CLI_MNEMONIC) for CI/agent use
 * 
 * Config file: ~/.begin-cli/config.json stores default wallet selection
 */

import { createDecipheriv, scryptSync } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Environment variable name for mnemonic
export const MNEMONIC_ENV_VAR = 'BEGIN_CLI_MNEMONIC';

// Environment variable name for wallet password
export const PASSWORD_ENV_VAR = 'BEGIN_CLI_WALLET_PASSWORD';

// Base directory for begin-cli config
export const CONFIG_DIR = join(homedir(), '.begin-cli');
export const WALLETS_DIR = join(CONFIG_DIR, 'wallets');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Encryption settings
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

// Newer wallet format (written by src/lib/wallet.ts)
export interface WalletFileV1 {
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
  addresses?: {
    payment?: string;
    stake?: string;
  };
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
 * Get password from environment variable
 * 
 * @returns Password string or null if not set
 */
export function getPasswordFromEnv(): string | null {
  const password = process.env[PASSWORD_ENV_VAR];
  return password || null;
}

/**
 * Check if password environment variable is set
 */
export function hasEnvPassword(): boolean {
  return !!process.env[PASSWORD_ENV_VAR];
}

/**
 * Minimal runtime type helpers for wallet file parsing.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isWalletFileV1(v: unknown): v is WalletFileV1 {
  if (!isRecord(v)) return false;
  if (v.version !== 1) return false;
  if (typeof v.name !== 'string') return false;
  if (v.networkId !== 0 && v.networkId !== 1) return false;
  if (!isRecord(v.encrypted)) return false;

  const e = v.encrypted as Record<string, unknown>;
  return (
    typeof e.salt === 'string' &&
    typeof e.iv === 'string' &&
    typeof e.authTag === 'string' &&
    typeof e.ciphertext === 'string' &&
    typeof v.createdAt === 'string'
  );
}

function decryptMnemonicV1(encrypted: WalletFileV1['encrypted'], password: string): string {
  const key = scryptSync(password, Buffer.from(encrypted.salt, 'hex'), KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(encrypted.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8');

  // v1 stores mnemonic as a JSON string array
  try {
    const parsed = JSON.parse(decrypted) as unknown;
    if (Array.isArray(parsed) && parsed.every((w) => typeof w === 'string')) {
      return (parsed as string[]).join(' ');
    }
  } catch {
    // fall through: may already be a plain string mnemonic
  }

  return decrypted;
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
  
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));

    // v1 format (versioned, encrypted.ciphertext)
    if (isWalletFileV1(parsed)) {
      return decryptMnemonicV1(parsed.encrypted, password);
    }

    throw new Error(
      'Unsupported wallet file format. ' +
        'This CLI only supports version: 1 wallets. ' +
        'If this wallet was created by an older build, restore it again with `begin wallet restore <name>`.'
    );
  } catch (error) {
    // Hide details to avoid leaking format/crypto specifics; keep UX consistent.
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
  
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));

  if (isWalletFileV1(parsed)) {
    return {
      name: parsed.name,
      createdAt: parsed.createdAt,
      network: parsed.networkId === 1 ? 'mainnet' : 'testnet',
    };
  }

  throw new Error('Unsupported wallet file format (expected version: 1)');
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
