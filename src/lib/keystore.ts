/**
 * Key storage abstraction for begin-cli
 *
 * Supports three modes:
 * 1. OS Keychain storage (preferred, no password required)
 * 2. Encrypted file storage (~/.begin-cli/wallets/) with password
 * 3. Environment variable (BEGIN_CLI_MNEMONIC) for CI/agent use
 *
 * Config file: ~/.begin-cli/config.json stores default wallet selection
 */

import { createDecipheriv, scryptSync, randomBytes, createCipheriv } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
// Dynamic import for keytar - graceful fallback when native module unavailable
/** Keytar API (setPassword, getPassword, deletePassword) - CJS module may export as default under ESM */
type KeytarAPI = {
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  getPassword: (service: string, account: string) => Promise<string | null>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};
let _keytar: KeytarAPI | null = null;
let _keytarLoadAttempted = false;

const DEBUG_KEYCHAIN_ENV =
  typeof process !== "undefined" && process.env?.DEBUG?.includes("begin-cli:keychain");

async function getKeytar(): Promise<KeytarAPI | null> {
  if (_keytarLoadAttempted) return _keytar;
  _keytarLoadAttempted = true;
  try {
    const mod = await import("keytar");
    // ESM interop: CJS module.exports appears as .default
    const api = mod?.default && typeof (mod.default as KeytarAPI).setPassword === "function"
      ? (mod.default as KeytarAPI)
      : (mod as unknown as KeytarAPI);
    if (typeof api?.setPassword !== "function") {
      if (DEBUG_KEYCHAIN_ENV) {
        console.error("[begin-cli:keychain] keytar module has no setPassword");
      }
      _keytar = null;
      return null;
    }
    _keytar = api;
    return api;
  } catch (err) {
    if (DEBUG_KEYCHAIN_ENV && err instanceof Error) {
      console.error("[begin-cli:keychain] keytar import failed:", err.message);
    }
    _keytar = null;
    return null;
  }
}

// Environment variable name for mnemonic
export const MNEMONIC_ENV_VAR = "BEGIN_CLI_MNEMONIC";

// Environment variable name for wallet password
export const PASSWORD_ENV_VAR = "BEGIN_CLI_WALLET_PASSWORD";

// Base directory for begin-cli config
export const CONFIG_DIR = join(homedir(), ".begin-cli");
export const WALLETS_DIR = join(CONFIG_DIR, "wallets");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

// Keychain settings
export const KEYCHAIN_SERVICE = "begin-cli";

// Encryption settings
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

// Newer wallet format with keychain support (version 2)
export interface WalletFileV2 {
  version: 2;
  name: string;
  networkId: 0 | 1;
  encrypted: {
    iv: string; // hex
    authTag: string; // hex
    ciphertext: string; // hex
  };
  // v2 wallets use keychain for the encryption key (no salt, key derivation via scrypt)
  createdAt: string;
  addresses?: {
    payment?: string;
    stake?: string;
  };
}

// Older wallet format (written by src/lib/wallet.ts)
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

export type WalletFile = WalletFileV1 | WalletFileV2;

export interface Config {
  defaultWallet?: string;
  defaultNetwork?: string;
}

export interface KeystoreSource {
  type: "env" | "file" | "keychain";
  walletName?: string;
}

// Cache for keychain availability check
let keychainAvailableCache: boolean | null = null;

function logKeychainUnavailable(reason: string, err?: unknown): void {
  if (!DEBUG_KEYCHAIN_ENV) return;
  const msg = err !== undefined && err instanceof Error ? `${reason}: ${err.message}` : reason;
  console.error(`[begin-cli:keychain] ${msg}`);
}

/**
 * Check if OS keychain is available
 * Tests by writing and deleting a test value
 */
export async function isKeychainAvailable(): Promise<boolean> {
  if (keychainAvailableCache !== null) {
    return keychainAvailableCache;
  }

  try {
    const keytar = await getKeytar();
    if (!keytar) {
      keychainAvailableCache = false;
      logKeychainUnavailable(
        "Keychain unavailable: keytar failed to load (native module not built or not found). With pnpm, run: pnpm install and ensure onlyBuiltDependencies includes keytar."
      );
      return false;
    }
    const testAccount = "begin-cli-availability-test";
    await keytar.setPassword(KEYCHAIN_SERVICE, testAccount, "test");
    await keytar.deletePassword(KEYCHAIN_SERVICE, testAccount);
    keychainAvailableCache = true;
    return true;
  } catch (err) {
    keychainAvailableCache = false;
    logKeychainUnavailable(
      "Keychain unavailable: keychain access failed (e.g. locked or permission denied)",
      err
    );
    return false;
  }
}

/**
 * Reset keychain availability cache (for testing)
 */
export function resetKeychainCache(): void {
  keychainAvailableCache = null;
  _keytarLoadAttempted = false;
  _keytar = null;
}

/**
 * Get encryption key from OS keychain
 *
 * @param walletName - Wallet name (used as account in keychain)
 * @returns Hex-encoded AES-256 encryption key or null if not found
 */
export async function getKeychainKey(walletName: string): Promise<string | null> {
  try {
    const keytar = await getKeytar();
    if (!keytar) return null;
    const key = await keytar.getPassword(KEYCHAIN_SERVICE, walletName);
    return key;
  } catch {
    return null;
  }
}

/**
 * Store encryption key in OS keychain
 *
 * @param walletName - Wallet name (used as account in keychain)
 * @param key - Hex-encoded AES-256 encryption key
 */
export async function setKeychainKey(walletName: string, key: string): Promise<void> {
  const keytar = await getKeytar();
  if (!keytar) throw new Error("OS keychain is not available");
  await keytar.setPassword(KEYCHAIN_SERVICE, walletName, key);
}

/**
 * Delete encryption key from OS keychain
 *
 * @param walletName - Wallet name
 */
export async function deleteKeychainKey(walletName: string): Promise<boolean> {
  const keytar = await getKeytar();
  if (!keytar) return false;
  return keytar.deletePassword(KEYCHAIN_SERVICE, walletName);
}

/**
 * Check if a wallet has a key stored in the keychain
 *
 * @param walletName - Wallet name
 * @returns True if key exists in keychain
 */
export async function hasKeychainKey(walletName: string): Promise<boolean> {
  const key = await getKeychainKey(walletName);
  return key !== null;
}

/**
 * Generate a new random AES-256 encryption key
 *
 * @returns Hex-encoded 32-byte key
 */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString("hex");
}

/**
 * Encrypt data with AES-256-GCM using a raw key
 *
 * @param plaintext - Data to encrypt
 * @param keyHex - Hex-encoded AES-256 key
 * @returns Encrypted data components
 */
export function encryptWithKey(
  plaintext: string,
  keyHex: string
): { iv: string; authTag: string; ciphertext: string } {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
}

/**
 * Decrypt data with AES-256-GCM using a raw key
 *
 * @param encrypted - Encrypted data components
 * @param keyHex - Hex-encoded AES-256 key
 * @returns Decrypted plaintext
 */
export function decryptWithKey(
  encrypted: { iv: string; authTag: string; ciphertext: string },
  keyHex: string
): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(encrypted.iv, "hex");
  const authTag = Buffer.from(encrypted.authTag, "hex");
  const ciphertext = Buffer.from(encrypted.ciphertext, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
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
  return typeof v === "object" && v !== null;
}

function isWalletFileV1(v: unknown): v is WalletFileV1 {
  if (!isRecord(v)) return false;
  if (v.version !== 1) return false;
  if (typeof v.name !== "string") return false;
  if (v.networkId !== 0 && v.networkId !== 1) return false;
  if (!isRecord(v.encrypted)) return false;

  const e = v.encrypted as Record<string, unknown>;
  return (
    typeof e.salt === "string" &&
    typeof e.iv === "string" &&
    typeof e.authTag === "string" &&
    typeof e.ciphertext === "string" &&
    typeof v.createdAt === "string"
  );
}

function isWalletFileV2(v: unknown): v is WalletFileV2 {
  if (!isRecord(v)) return false;
  if (v.version !== 2) return false;
  if (typeof v.name !== "string") return false;
  if (v.networkId !== 0 && v.networkId !== 1) return false;
  if (!isRecord(v.encrypted)) return false;

  const e = v.encrypted as Record<string, unknown>;
  return (
    typeof e.iv === "string" &&
    typeof e.authTag === "string" &&
    typeof e.ciphertext === "string" &&
    typeof v.createdAt === "string"
  );
}

function decryptMnemonicV1(encrypted: WalletFileV1["encrypted"], password: string): string {
  const key = scryptSync(password, Buffer.from(encrypted.salt, "hex"), KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(encrypted.iv, "hex"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "hex")),
    decipher.final(),
  ]).toString("utf8");

  // v1 stores mnemonic as a JSON string array
  try {
    const parsed = JSON.parse(decrypted) as unknown;
    if (Array.isArray(parsed) && parsed.every((w) => typeof w === "string")) {
      return (parsed as string[]).join(" ");
    }
  } catch {
    // fall through: may already be a plain string mnemonic
  }

  return decrypted;
}

/**
 * Load and decrypt a wallet from file storage using password (v1 format)
 *
 * @param name - Wallet name
 * @param password - Password for decryption
 * @returns Decrypted mnemonic
 */
export function loadWalletWithPassword(name: string, password: string): string {
  const filePath = join(WALLETS_DIR, `${name}.json`);

  if (!existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));

    // v1 format (versioned, encrypted.ciphertext with salt)
    if (isWalletFileV1(parsed)) {
      return decryptMnemonicV1(parsed.encrypted, password);
    }

    // v2 format requires keychain, not password
    if (isWalletFileV2(parsed)) {
      throw new Error("This wallet uses OS keychain. Password decryption not supported.");
    }

    throw new Error(
      "Unsupported wallet file format. " +
        "This CLI only supports version: 1 or 2 wallets. " +
        "If this wallet was created by an older build, restore it again with `begin wallet restore <name>`."
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("keychain")) {
      throw error;
    }
    // Hide details to avoid leaking format/crypto specifics; keep UX consistent.
    throw new Error("Incorrect password or corrupted wallet file");
  }
}

/**
 * Load and decrypt a wallet from file storage using keychain (v2 format)
 *
 * @param name - Wallet name
 * @returns Decrypted mnemonic
 */
export async function loadWalletWithKeychain(name: string): Promise<string> {
  const filePath = join(WALLETS_DIR, `${name}.json`);

  if (!existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }

  const keyHex = await getKeychainKey(name);
  if (!keyHex) {
    throw new Error(`No keychain key found for wallet "${name}". Use password instead.`);
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));

    if (isWalletFileV2(parsed)) {
      const decrypted = decryptWithKey(parsed.encrypted, keyHex);
      // v2 stores mnemonic as JSON array
      try {
        const mnemonicArray = JSON.parse(decrypted) as unknown;
        if (Array.isArray(mnemonicArray) && mnemonicArray.every((w) => typeof w === "string")) {
          return (mnemonicArray as string[]).join(" ");
        }
      } catch {
        // fall through if already plain string
      }
      return decrypted;
    }

    // v1 wallets that have been migrated to keychain
    if (isWalletFileV1(parsed)) {
      // For v1 wallets with keychain key, we need password to decrypt
      // The keychain key is stored for v2 format only
      throw new Error("This v1 wallet requires password. Run migration or use --password.");
    }

    throw new Error("Unsupported wallet file format");
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("keychain") || error.message.includes("password"))
    ) {
      throw error;
    }
    throw new Error("Failed to decrypt wallet with keychain key");
  }
}

/**
 * Load wallet - tries keychain first, then password fallback
 *
 * @param name - Wallet name
 * @param password - Optional password for v1 wallets or fallback
 * @returns Decrypted mnemonic
 */
export async function loadWallet(name: string, password?: string): Promise<string> {
  const filePath = join(WALLETS_DIR, `${name}.json`);

  if (!existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }

  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));

  // v2 format - use keychain
  if (isWalletFileV2(parsed)) {
    return loadWalletWithKeychain(name);
  }

  // v1 format - try keychain first (if migrated), then password
  if (isWalletFileV1(parsed)) {
    // Check if keychain key exists (wallet was migrated)
    const keychainAvailable = await isKeychainAvailable();
    if (keychainAvailable) {
      const keyHex = await getKeychainKey(name);
      if (keyHex) {
        // Wallet was migrated - decrypt using keychain-stored key derived from password
        // For v1 migrated wallets, we store the derived key in keychain
        try {
          // v1 migration stores the scrypt-derived key in keychain
          const key = Buffer.from(keyHex, "hex");
          const decipher = createDecipheriv(
            ALGORITHM,
            key,
            Buffer.from(parsed.encrypted.iv, "hex")
          );
          decipher.setAuthTag(Buffer.from(parsed.encrypted.authTag, "hex"));

          const decrypted = Buffer.concat([
            decipher.update(Buffer.from(parsed.encrypted.ciphertext, "hex")),
            decipher.final(),
          ]).toString("utf8");

          // v1 stores mnemonic as JSON array
          try {
            const mnemonicArray = JSON.parse(decrypted) as unknown;
            if (Array.isArray(mnemonicArray) && mnemonicArray.every((w) => typeof w === "string")) {
              return (mnemonicArray as string[]).join(" ");
            }
          } catch {
            // fall through if already plain string
          }
          return decrypted;
        } catch {
          // Keychain key invalid, fall through to password
        }
      }
    }

    // No keychain or keychain failed - require password
    if (!password) {
      throw new Error("Password required for wallet decryption");
    }
    return loadWalletWithPassword(name, password);
  }

  throw new Error("Unsupported wallet file format");
}

/**
 * Migrate a v1 wallet to use keychain
 * Stores the password-derived key in keychain so future decryptions don't need password
 *
 * @param name - Wallet name
 * @param password - Current password
 * @returns True if migration succeeded
 */
export async function migrateWalletToKeychain(name: string, password: string): Promise<boolean> {
  const filePath = join(WALLETS_DIR, `${name}.json`);

  if (!existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }

  const keychainAvailable = await isKeychainAvailable();
  if (!keychainAvailable) {
    return false;
  }

  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));

  if (!isWalletFileV1(parsed)) {
    // Already v2 or unsupported
    return false;
  }

  // Verify password works
  try {
    loadWalletWithPassword(name, password);
  } catch {
    throw new Error("Incorrect password");
  }

  // Derive the encryption key using scrypt and store in keychain
  const key = scryptSync(password, Buffer.from(parsed.encrypted.salt, "hex"), KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  await setKeychainKey(name, key.toString("hex"));
  return true;
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
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

/**
 * Delete a wallet from file storage and keychain
 *
 * @param name - Wallet name to delete
 */
export async function deleteWallet(name: string): Promise<void> {
  const filePath = join(WALLETS_DIR, `${name}.json`);

  if (!existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }

  // Delete from keychain if exists
  try {
    await deleteKeychainKey(name);
  } catch {
    // Ignore keychain errors
  }

  unlinkSync(filePath);
}

/**
 * Synchronous delete wallet (for backward compatibility)
 *
 * @param name - Wallet name to delete
 */
export function deleteWalletSync(name: string): void {
  const filePath = join(WALLETS_DIR, `${name}.json`);

  if (!existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }

  unlinkSync(filePath);

  // Async keychain deletion - fire and forget
  deleteKeychainKey(name).catch(() => {
    // Ignore errors
  });
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
 * Get wallet file version
 *
 * @param name - Wallet name
 * @returns Version number (1 or 2) or null if not found
 */
export function getWalletVersion(name: string): 1 | 2 | null {
  const filePath = join(WALLETS_DIR, `${name}.json`);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (isWalletFileV2(parsed)) return 2;
    if (isWalletFileV1(parsed)) return 1;
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if wallet uses keychain (v2 format or migrated v1)
 *
 * @param name - Wallet name
 * @returns True if wallet can use keychain
 */
export async function walletUsesKeychain(name: string): Promise<boolean> {
  const version = getWalletVersion(name);
  if (version === 2) return true;

  // Check if v1 wallet has keychain key (migrated)
  if (version === 1) {
    const hasKey = await hasKeychainKey(name);
    return hasKey;
  }

  return false;
}

/**
 * Get wallet metadata without decrypting
 *
 * @param name - Wallet name
 * @returns Wallet metadata (without encrypted data)
 */
export function getWalletInfo(name: string): {
  name: string;
  createdAt: string;
  network?: string;
  version?: number;
  usesKeychain?: boolean;
} {
  const filePath = join(WALLETS_DIR, `${name}.json`);

  if (!existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }

  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));

  if (isWalletFileV2(parsed)) {
    return {
      name: parsed.name,
      createdAt: parsed.createdAt,
      network: parsed.networkId === 1 ? "mainnet" : "testnet",
      version: 2,
      usesKeychain: true,
    };
  }

  if (isWalletFileV1(parsed)) {
    return {
      name: parsed.name,
      createdAt: parsed.createdAt,
      network: parsed.networkId === 1 ? "mainnet" : "testnet",
      version: 1,
      usesKeychain: false, // Will be updated async if migrated
    };
  }

  throw new Error("Unsupported wallet file format (expected version: 1 or 2)");
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
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Config;
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
    return { type: "env" };
  }

  // Fall back to default wallet
  const defaultWallet = getDefaultWallet();
  if (defaultWallet && walletExists(defaultWallet)) {
    return { type: "file", walletName: defaultWallet };
  }

  // Check if any wallets exist
  const wallets = listWallets();
  if (wallets.length === 1) {
    return { type: "file", walletName: wallets[0] };
  }

  return null;
}

/**
 * Get mnemonic from the preferred source (async version with keychain support)
 *
 * @param password - Password for file-based wallets (optional if keychain available)
 * @param walletName - Optional specific wallet name to use
 * @returns Mnemonic string
 */
export async function getMnemonicAsync(password?: string, walletName?: string): Promise<string> {
  // If specific wallet requested
  if (walletName) {
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
    return loadWallet(defaultWallet, password);
  }

  // Check for single wallet
  const wallets = listWallets();
  if (wallets.length === 1) {
    return loadWallet(wallets[0], password);
  }

  throw new Error(
    "No wallet available. Set BEGIN_CLI_MNEMONIC environment variable or create a wallet."
  );
}

/**
 * Get mnemonic from the preferred source (sync version - password only, no keychain)
 *
 * @param password - Password for file-based wallets (required if source is file)
 * @param walletName - Optional specific wallet name to use
 * @returns Mnemonic string
 */
export function getMnemonic(password?: string, walletName?: string): string {
  // If specific wallet requested
  if (walletName) {
    if (!password) {
      throw new Error("Password required for wallet decryption");
    }
    return loadWalletWithPassword(walletName, password);
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
      throw new Error("Password required for wallet decryption");
    }
    return loadWalletWithPassword(defaultWallet, password);
  }

  // Check for single wallet
  const wallets = listWallets();
  if (wallets.length === 1) {
    if (!password) {
      throw new Error("Password required for wallet decryption");
    }
    return loadWalletWithPassword(wallets[0], password);
  }

  throw new Error(
    "No wallet available. Set BEGIN_CLI_MNEMONIC environment variable or create a wallet."
  );
}
