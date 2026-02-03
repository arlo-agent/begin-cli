/**
 * Provider abstraction for Cardano blockchain queries
 * Uses @meshsdk/core with BlockfrostProvider
 */

import { BlockfrostProvider } from '@meshsdk/core';
import type { Network } from './config.js';
import { getBlockfrostKey } from './config.js';
import { errors } from './errors.js';

const NETWORK_IDS: Record<Network, number> = {
  mainnet: 1,
  preprod: 0,
  preview: 0,
};

/**
 * Get Blockfrost API key from environment or config
 * Priority: ENV network-specific > ENV generic > config
 */
function getApiKey(network: Network): string | undefined {
  // Check environment variables first (support both documented forms)
  if (network === 'mainnet') {
    // Prefer explicit mainnet var if set
    const mainnetKey = process.env.BLOCKFROST_API_KEY_MAINNET;
    if (mainnetKey) return mainnetKey;
    // Fallback to generic
    const genericKey = process.env.BLOCKFROST_API_KEY;
    if (genericKey) return genericKey;
  } else {
    const envSuffix = `_${network.toUpperCase()}`; // _PREPROD / _PREVIEW
    const networkSpecificKey = process.env[`BLOCKFROST_API_KEY${envSuffix}`];
    if (networkSpecificKey) return networkSpecificKey;

    const genericKey = process.env.BLOCKFROST_API_KEY;
    if (genericKey) return genericKey;
  }

  // Fall back to config
  return getBlockfrostKey(network);
}

/**
 * Create a BlockfrostProvider for the specified network
 */
export function createProvider(network: Network): BlockfrostProvider {
  const apiKey = getApiKey(network);

  if (!apiKey) {
    throw errors.providerError(
      `No Blockfrost API key found for ${network}.\n` +
        `Set BLOCKFROST_API_KEY environment variable or configure via 'begin config set blockfrost.<network> <key>'.\n` +
        `Get a free API key at: https://blockfrost.io`
    );
  }

  return new BlockfrostProvider(apiKey);
}

/**
 * Get network ID for a network name
 */
export function getNetworkId(network: Network): number {
  return NETWORK_IDS[network];
}

/**
 * Check if API key is available for network
 */
export function hasApiKey(network: Network): boolean {
  return !!getApiKey(network);
}

// Re-export types from @meshsdk/core that are commonly used
export { BlockfrostProvider } from '@meshsdk/core';
export type { UTxO, Asset } from '@meshsdk/core';
