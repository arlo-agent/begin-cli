/**
 * Staking utilities for Cardano delegation operations
 * Uses @meshsdk/core for transaction building and Blockfrost for pool data
 */

export interface StakePool {
  poolId: string;
  ticker: string;
  name: string;
  description: string;
  homepage: string;
  pledge: string;
  cost: string;
  margin: number;
  saturation: number;
  blocksProduced: number;
  liveStake: string;
  liveDelegators: number;
  retiring?: string;
}

export interface DelegationStatus {
  stakeAddress: string;
  isRegistered: boolean;
  delegatedPool: StakePool | null;
  rewardsAvailable: string;
  totalWithdrawn: string;
  activeEpoch: number | null;
}

interface BlockfrostPoolResponse {
  pool_id: string;
  hex: string;
  active_stake: string;
  live_stake: string;
  live_size: number;
  live_saturation: number;
  live_delegators: number;
  blocks_minted: number;
  blocks_epoch: number;
  live_pledge: string;
  margin_cost: number;
  fixed_cost: string;
  reward_account: string;
  owners: string[];
  registration: string[];
  retirement: string[];
}

interface BlockfrostPoolMetadata {
  pool_id: string;
  hex: string;
  url: string;
  hash: string;
  ticker: string;
  name: string;
  description: string;
  homepage: string;
}

interface BlockfrostAccountResponse {
  stake_address: string;
  active: boolean;
  active_epoch: number | null;
  controlled_amount: string;
  rewards_sum: string;
  withdrawals_sum: string;
  reserves_sum: string;
  treasury_sum: string;
  withdrawable_amount: string;
  pool_id: string | null;
}

const BLOCKFROST_URLS: Record<string, string> = {
  mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
  preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
  preview: 'https://cardano-preview.blockfrost.io/api/v0',
};

/**
 * Get Blockfrost API headers
 */
function getHeaders(): Record<string, string> {
  const apiKey = process.env.BLOCKFROST_API_KEY;
  if (!apiKey) {
    throw new Error('BLOCKFROST_API_KEY environment variable is required');
  }
  return { project_id: apiKey };
}

/**
 * Search stake pools by ticker or pool ID
 */
export async function searchPools(
  query: string,
  network: string,
  limit: number = 10
): Promise<StakePool[]> {
  const baseUrl = BLOCKFROST_URLS[network];
  if (!baseUrl) {
    throw new Error(`Unknown network: ${network}`);
  }

  const headers = getHeaders();

  // If query looks like a pool ID (starts with "pool1"), fetch directly
  if (query.toLowerCase().startsWith('pool1')) {
    try {
      const pool = await fetchPoolDetails(query, network);
      return pool ? [pool] : [];
    } catch {
      return [];
    }
  }

  // Otherwise search by fetching pools and filtering by ticker
  // Blockfrost doesn't have a direct ticker search, so we fetch pools
  // and check metadata. For efficiency, we use the pools list endpoint.
  
  const response = await fetch(`${baseUrl}/pools?count=100&order=desc`, { headers });
  
  if (!response.ok) {
    throw new Error(`Blockfrost API error: ${response.status}`);
  }

  const poolIds = await response.json() as string[];
  const results: StakePool[] = [];
  const queryLower = query.toLowerCase();

  // Fetch metadata for pools (batch for efficiency)
  for (const poolId of poolIds) {
    if (results.length >= limit) break;

    try {
      const pool = await fetchPoolDetails(poolId, network);
      if (pool && (
        pool.ticker.toLowerCase().includes(queryLower) ||
        pool.name.toLowerCase().includes(queryLower)
      )) {
        results.push(pool);
      }
    } catch {
      // Skip pools with errors
    }
  }

  return results;
}

/**
 * Fetch detailed pool information
 */
export async function fetchPoolDetails(poolId: string, network: string): Promise<StakePool | null> {
  const baseUrl = BLOCKFROST_URLS[network];
  if (!baseUrl) {
    throw new Error(`Unknown network: ${network}`);
  }

  const headers = getHeaders();

  // Fetch pool info and metadata in parallel
  const [poolResponse, metadataResponse] = await Promise.all([
    fetch(`${baseUrl}/pools/${poolId}`, { headers }),
    fetch(`${baseUrl}/pools/${poolId}/metadata`, { headers }),
  ]);

  if (!poolResponse.ok) {
    if (poolResponse.status === 404) return null;
    throw new Error(`Failed to fetch pool: ${poolResponse.status}`);
  }

  const poolData = await poolResponse.json() as BlockfrostPoolResponse;
  
  let metadata: BlockfrostPoolMetadata | null = null;
  if (metadataResponse.ok) {
    metadata = await metadataResponse.json() as BlockfrostPoolMetadata;
  }

  return {
    poolId: poolData.pool_id,
    ticker: metadata?.ticker || 'N/A',
    name: metadata?.name || poolId.slice(0, 20) + '...',
    description: metadata?.description || '',
    homepage: metadata?.homepage || '',
    pledge: poolData.live_pledge,
    cost: poolData.fixed_cost,
    margin: poolData.margin_cost * 100, // Convert to percentage
    saturation: poolData.live_saturation * 100, // Convert to percentage
    blocksProduced: poolData.blocks_minted,
    liveStake: poolData.live_stake,
    liveDelegators: poolData.live_delegators,
    retiring: poolData.retirement.length > 0 ? poolData.retirement[poolData.retirement.length - 1] : undefined,
  };
}

/**
 * List top stake pools by delegator count
 */
export async function listTopPools(network: string, limit: number = 10): Promise<StakePool[]> {
  const baseUrl = BLOCKFROST_URLS[network];
  if (!baseUrl) {
    throw new Error(`Unknown network: ${network}`);
  }

  const headers = getHeaders();

  // Fetch pool list
  const response = await fetch(`${baseUrl}/pools?count=${limit * 2}&order=desc`, { headers });
  
  if (!response.ok) {
    throw new Error(`Blockfrost API error: ${response.status}`);
  }

  const poolIds = await response.json() as string[];
  const pools: StakePool[] = [];

  for (const poolId of poolIds.slice(0, limit)) {
    try {
      const pool = await fetchPoolDetails(poolId, network);
      if (pool) pools.push(pool);
    } catch {
      // Skip pools with errors
    }
  }

  return pools;
}

/**
 * Check delegation status for a stake address
 */
export async function getDelegationStatus(
  stakeAddress: string,
  network: string
): Promise<DelegationStatus> {
  const baseUrl = BLOCKFROST_URLS[network];
  if (!baseUrl) {
    throw new Error(`Unknown network: ${network}`);
  }

  const headers = getHeaders();

  const response = await fetch(`${baseUrl}/accounts/${stakeAddress}`, { headers });

  if (!response.ok) {
    if (response.status === 404) {
      // Stake key not registered
      return {
        stakeAddress,
        isRegistered: false,
        delegatedPool: null,
        rewardsAvailable: '0',
        totalWithdrawn: '0',
        activeEpoch: null,
      };
    }
    throw new Error(`Failed to fetch account: ${response.status}`);
  }

  const account = await response.json() as BlockfrostAccountResponse;
  
  let delegatedPool: StakePool | null = null;
  if (account.pool_id) {
    try {
      delegatedPool = await fetchPoolDetails(account.pool_id, network);
    } catch {
      // Failed to fetch pool details, continue without
    }
  }

  return {
    stakeAddress,
    isRegistered: account.active,
    delegatedPool,
    rewardsAvailable: account.withdrawable_amount,
    totalWithdrawn: account.withdrawals_sum,
    activeEpoch: account.active_epoch,
  };
}

/**
 * Check if stake key needs registration
 * Returns true if this is first-time delegation
 */
export async function needsStakeKeyRegistration(
  stakeAddress: string,
  network: string
): Promise<boolean> {
  const status = await getDelegationStatus(stakeAddress, network);
  return !status.isRegistered;
}

/**
 * Format lovelace to ADA string
 */
export function lovelaceToAda(lovelace: string): string {
  const ada = Number(lovelace) / 1_000_000;
  return ada.toFixed(6);
}

/**
 * Get stake address from payment address
 * Note: This is a simplified version - in production use MeshJS wallet methods
 */
export function deriveStakeAddress(paymentAddress: string, network: string): string {
  // This would normally be done via MeshJS wallet
  // For now, return mock stake address for development
  const prefix = network === 'mainnet' ? 'stake1' : 'stake_test1';
  return `${prefix}mock_stake_address_derived_from_payment`;
}

/**
 * Mock data for development without API key
 */
export function getMockPools(): StakePool[] {
  return [
    {
      poolId: 'pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy',
      ticker: 'BLOOM',
      name: 'Bloom Pool',
      description: 'High-performance stake pool for the Cardano ecosystem',
      homepage: 'https://bloompool.io',
      pledge: '500000000000',
      cost: '340000000',
      margin: 2.5,
      saturation: 65.4,
      blocksProduced: 1234,
      liveStake: '35000000000000',
      liveDelegators: 4521,
    },
    {
      poolId: 'pool1z5uqdk7dzdxaae5633fqfcu2eqzy3a3rgtuvy087fdld7yws0xt',
      ticker: 'SNEK',
      name: 'Snek Pool',
      description: 'Community pool supporting the SNEK token',
      homepage: 'https://snekpool.com',
      pledge: '100000000000',
      cost: '340000000',
      margin: 1.0,
      saturation: 42.1,
      blocksProduced: 567,
      liveStake: '22000000000000',
      liveDelegators: 2103,
    },
    {
      poolId: 'pool1hhjjzklvdlz9e6e4qfywqqkvk8dw7x9g4c4m2sj7m8wnk8c4vv7',
      ticker: 'GENS',
      name: 'Genesis Pool',
      description: 'Original stake pool since Shelley launch',
      homepage: 'https://genesispool.io',
      pledge: '250000000000',
      cost: '340000000',
      margin: 3.0,
      saturation: 88.9,
      blocksProduced: 2890,
      liveStake: '60000000000000',
      liveDelegators: 8932,
    },
  ];
}

export function getMockDelegationStatus(): DelegationStatus {
  return {
    stakeAddress: 'stake1uy4s2fc8qjzqchpjxh6yjzgx3ckg4zhfz8rpvj0l0wvtqgsxhfr8c',
    isRegistered: true,
    delegatedPool: getMockPools()[0],
    rewardsAvailable: '15430000',
    totalWithdrawn: '125000000',
    activeEpoch: 445,
  };
}
