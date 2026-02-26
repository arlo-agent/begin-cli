/**
 * Chain Registry
 * Manages chain adapters and provides centralized access
 */

import type { ChainId, IChainAdapter } from "./types.js";
import { SolanaAdapter, createSolanaAdapter } from "./solana.js";

class ChainRegistry {
  private adapters: Map<ChainId, IChainAdapter> = new Map();

  register(adapter: IChainAdapter): void {
    if (!adapter || !adapter.chainId) {
      throw new Error("Invalid adapter: must have chainId");
    }
    this.adapters.set(adapter.chainId, adapter);
  }

  get(chainId: ChainId): IChainAdapter | undefined {
    return this.adapters.get(chainId);
  }

  has(chainId: ChainId): boolean {
    return this.adapters.has(chainId);
  }

  getAll(): ChainId[] {
    return Array.from(this.adapters.keys());
  }

  getSolana(): SolanaAdapter | undefined {
    return this.adapters.get("solana") as SolanaAdapter | undefined;
  }
}

// Global registry instance
const registry = new ChainRegistry();

// Register default adapters
registry.register(createSolanaAdapter("mainnet-beta"));

export { registry, ChainRegistry };

/**
 * Get a chain adapter by ID
 */
export function getChainAdapter(chainId: ChainId): IChainAdapter {
  const adapter = registry.get(chainId);
  if (!adapter) {
    throw new Error(`Chain adapter not found: ${chainId}`);
  }
  return adapter;
}

/**
 * Check if a chain is supported
 */
export function isChainSupported(chainId: string): chainId is ChainId {
  return ["cardano", "solana", "bitcoin", "evm"].includes(chainId);
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChains(): ChainId[] {
  return ["cardano", "solana", "bitcoin", "evm"];
}
