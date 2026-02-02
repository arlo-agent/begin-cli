/**
 * Configuration file management for begin-cli
 * Config location: ~/.begin-cli/config.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { errors } from './errors.js';

export type Network = 'mainnet' | 'preprod' | 'preview';
export type Provider = 'blockfrost' | 'koios' | 'ogmios';

export interface Config {
  /** Default wallet name to use */
  defaultWallet: string;
  /** Default network (mainnet, preprod, preview) */
  network: Network;
  /** Blockchain data provider */
  provider: Provider;
  /** Blockfrost API keys by network */
  blockfrost?: {
    mainnet?: string;
    preprod?: string;
    preview?: string;
  };
  /** Koios API configuration */
  koios?: {
    baseUrl?: string;
  };
}

const DEFAULT_CONFIG: Config = {
  defaultWallet: 'main',
  network: 'preprod',
  provider: 'blockfrost',
};

const CONFIG_DIR = join(homedir(), '.begin-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load configuration from file
 * Returns default config if file doesn't exist
 */
export function loadConfig(): Config {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG };
    }

    const content = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content) as Partial<Config>;

    // Merge with defaults to ensure all fields exist
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw errors.configError('Invalid config file: malformed JSON');
    }
    throw errors.configError(`Failed to read config: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Save configuration to file
 */
export function saveConfig(config: Config): void {
  try {
    ensureConfigDir();
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', {
      mode: 0o600, // Read/write for owner only
    });
  } catch (err) {
    throw errors.configError(`Failed to save config: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Update specific config fields
 */
export function updateConfig(updates: Partial<Config>): Config {
  const current = loadConfig();
  const updated = { ...current, ...updates };
  saveConfig(updated);
  return updated;
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
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

/**
 * Reset config to defaults
 */
export function resetConfig(): void {
  saveConfig({ ...DEFAULT_CONFIG });
}

/**
 * Get the config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the config file path
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Check if config file exists
 */
export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

/**
 * Validate network value
 */
export function isValidNetwork(network: string): network is Network {
  return ['mainnet', 'preprod', 'preview'].includes(network);
}

/**
 * Validate provider value
 */
export function isValidProvider(provider: string): provider is Provider {
  return ['blockfrost', 'koios', 'ogmios'].includes(provider);
}

/**
 * Get Blockfrost API key for a network
 */
export function getBlockfrostKey(network: Network): string | undefined {
  const config = loadConfig();
  return config.blockfrost?.[network];
}

/**
 * Set Blockfrost API key for a network
 */
export function setBlockfrostKey(network: Network, apiKey: string): void {
  const config = loadConfig();
  if (!config.blockfrost) {
    config.blockfrost = {};
  }
  config.blockfrost[network] = apiKey;
  saveConfig(config);
}
