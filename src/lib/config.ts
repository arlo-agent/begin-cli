import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BeginError, ErrorCode } from './errors.js';

export interface Config {
  defaultWallet: string;
  network: 'mainnet' | 'preprod' | 'preview';
  provider: 'blockfrost' | 'koios' | 'ogmios';
}

const DEFAULT_CONFIG: Config = {
  defaultWallet: 'main',
  network: 'preprod',
  provider: 'blockfrost',
};

const CONFIG_DIR = join(homedir(), '.begin-cli');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load config from ~/.begin-cli/config.json
 * Returns default config if file doesn't exist
 */
export function loadConfig(): Config {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG };
    }
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    throw new BeginError(
      `Failed to read config: ${err instanceof Error ? err.message : 'Unknown error'}`,
      ErrorCode.CONFIG_READ
    );
  }
}

/**
 * Save config to ~/.begin-cli/config.json
 */
export function saveConfig(config: Partial<Config>): void {
  try {
    ensureConfigDir();
    const current = loadConfig();
    const merged = { ...current, ...config };
    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + '\n');
  } catch (err) {
    throw new BeginError(
      `Failed to write config: ${err instanceof Error ? err.message : 'Unknown error'}`,
      ErrorCode.CONFIG_WRITE
    );
  }
}

/**
 * Get a specific config value
 */
export function getConfigValue<K extends keyof Config>(key: K): Config[K] {
  const config = loadConfig();
  return config[key];
}

/**
 * Set a specific config value
 */
export function setConfigValue<K extends keyof Config>(key: K, value: Config[K]): void {
  saveConfig({ [key]: value });
}

/**
 * Get config directory path
 */
export function getConfigDir(): string {
  ensureConfigDir();
  return CONFIG_DIR;
}

/**
 * Get wallets directory path
 */
export function getWalletsDir(): string {
  const dir = join(CONFIG_DIR, 'wallets');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Validate network value
 */
export function isValidNetwork(network: string): network is Config['network'] {
  return ['mainnet', 'preprod', 'preview'].includes(network);
}
