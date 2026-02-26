/**
 * Core staking operations logic
 *
 * Pure functions for staking status, delegation, pool search, and withdrawals.
 */

import {
  getDelegationStatus as libGetDelegationStatus,
  searchPools as libSearchPools,
  listTopPools,
  fetchPoolDetails,
  getMockDelegationStatus,
  getMockPools,
  lovelaceToAda,
  type StakePool,
  type DelegationStatus,
} from "../lib/staking.js";
import {
  loadWallet,
  checkWalletAvailability,
  type TransactionConfig,
  type WalletOptions,
} from "../lib/transaction.js";
import { getPasswordFromEnv } from "../lib/keystore.js";
import { hasApiKey } from "../lib/provider.js";

export { StakePool, DelegationStatus };

export interface StakeStatusResult {
  stakeAddress: string;
  isRegistered: boolean;
  delegatedPool: StakePool | null;
  rewards: {
    available: string;
    availableAda: string;
    totalWithdrawn: string;
    totalWithdrawnAda: string;
  };
  activeEpoch: number | null;
  network: string;
  mock?: boolean;
}

export interface StakePoolsResult {
  pools: StakePool[];
  network: string;
  query?: string;
  mock?: boolean;
}

export interface DelegateResult {
  status: "success" | "error";
  txHash?: string;
  poolId?: string;
  ticker?: string;
  stakeAddress?: string;
  registrationIncluded: boolean;
  network: string;
  error?: string;
  mock?: boolean;
}

export interface WithdrawResult {
  status: "success" | "error";
  txHash?: string;
  amount: string;
  amountAda: string;
  stakeAddress?: string;
  network: string;
  error?: string;
  mock?: boolean;
}

/**
 * Get stake delegation status for a wallet
 */
export async function getStakeStatus(
  wallet: string | undefined,
  password: string | undefined,
  network: string = "mainnet"
): Promise<StakeStatusResult> {
  const availability = checkWalletAvailability(wallet);

  if (!availability.available) {
    throw new Error(availability.error || "No wallet available");
  }

  const effectivePassword = password || getPasswordFromEnv() || undefined;
  if (availability.needsPassword && !effectivePassword) {
    throw new Error("Password is required for wallet decryption");
  }

  const config: TransactionConfig = { network };
  const options: WalletOptions = {
    walletName: availability.walletName,
    password: effectivePassword,
  };

  const meshWallet = await loadWallet(options, config);

  // Get stake address
  const rewardAddresses = await meshWallet.getRewardAddresses();
  if (!rewardAddresses || rewardAddresses.length === 0) {
    throw new Error("Could not derive stake address from wallet");
  }
  const stakeAddress = rewardAddresses[0];

  // Check if we have API key
  if (!hasApiKey(network as "mainnet" | "preprod" | "preview")) {
    const mockStatus = getMockDelegationStatus();
    return {
      stakeAddress,
      isRegistered: mockStatus.isRegistered,
      delegatedPool: mockStatus.delegatedPool,
      rewards: {
        available: mockStatus.rewardsAvailable,
        availableAda: lovelaceToAda(mockStatus.rewardsAvailable),
        totalWithdrawn: mockStatus.totalWithdrawn,
        totalWithdrawnAda: lovelaceToAda(mockStatus.totalWithdrawn),
      },
      activeEpoch: mockStatus.activeEpoch,
      network,
      mock: true,
    };
  }

  const status = await libGetDelegationStatus(stakeAddress, network);

  return {
    stakeAddress: status.stakeAddress,
    isRegistered: status.isRegistered,
    delegatedPool: status.delegatedPool,
    rewards: {
      available: status.rewardsAvailable,
      availableAda: lovelaceToAda(status.rewardsAvailable),
      totalWithdrawn: status.totalWithdrawn,
      totalWithdrawnAda: lovelaceToAda(status.totalWithdrawn),
    },
    activeEpoch: status.activeEpoch,
    network,
  };
}

/**
 * Search or list stake pools
 */
export async function getStakePools(
  search: string | undefined,
  network: string = "mainnet",
  limit: number = 10
): Promise<StakePoolsResult> {
  // Check if we have API key
  if (!hasApiKey(network as "mainnet" | "preprod" | "preview")) {
    const mockPools = getMockPools();
    const filtered = search
      ? mockPools.filter(
          (p) =>
            p.ticker.toLowerCase().includes(search.toLowerCase()) ||
            p.name.toLowerCase().includes(search.toLowerCase())
        )
      : mockPools;

    return {
      pools: filtered.slice(0, limit),
      network,
      query: search,
      mock: true,
    };
  }

  let pools: StakePool[];
  if (search) {
    pools = await libSearchPools(search, network, limit);
  } else {
    pools = await listTopPools(network, limit);
  }

  return {
    pools,
    network,
    query: search,
  };
}

/**
 * Delegate stake to a pool
 *
 * Note: This is currently a mock implementation as the actual delegation
 * requires complex transaction building with MeshJS.
 */
export async function delegateStake(
  poolId: string,
  wallet: string | undefined,
  password: string | undefined,
  network: string = "mainnet"
): Promise<DelegateResult> {
  const availability = checkWalletAvailability(wallet);

  if (!availability.available) {
    return {
      status: "error",
      registrationIncluded: false,
      network,
      error: availability.error || "No wallet available",
    };
  }

  const effectivePassword = password || getPasswordFromEnv() || undefined;
  if (availability.needsPassword && !effectivePassword) {
    return {
      status: "error",
      registrationIncluded: false,
      network,
      error: "Password is required for wallet decryption",
    };
  }

  try {
    const config: TransactionConfig = { network };
    const options: WalletOptions = {
      walletName: availability.walletName,
      password: effectivePassword,
    };

    const meshWallet = await loadWallet(options, config);

    // Get stake address
    const rewardAddresses = await meshWallet.getRewardAddresses();
    if (!rewardAddresses || rewardAddresses.length === 0) {
      throw new Error("Could not derive stake address from wallet");
    }
    const stakeAddress = rewardAddresses[0];

    // Check if API key available for pool lookup
    let pool: StakePool | null = null;
    let needsRegistration = false;

    if (hasApiKey(network as "mainnet" | "preprod" | "preview")) {
      pool = await fetchPoolDetails(poolId, network);
      if (!pool) {
        return {
          status: "error",
          registrationIncluded: false,
          network,
          error: `Pool not found: ${poolId}`,
        };
      }

      const status = await libGetDelegationStatus(stakeAddress, network);
      needsRegistration = !status.isRegistered;
    } else {
      // Mock mode
      const mockPools = getMockPools();
      pool =
        mockPools.find(
          (p) => p.poolId === poolId || p.ticker.toLowerCase() === poolId.toLowerCase()
        ) || null;
      if (!pool) {
        return {
          status: "error",
          registrationIncluded: false,
          network,
          error: `Pool not found: ${poolId}`,
          mock: true,
        };
      }
    }

    // Mock delegation transaction
    // TODO: Implement real delegation with MeshJS Transaction
    const mockTxHash = "mock_delegation_tx_" + Date.now().toString(36);

    return {
      status: "success",
      txHash: mockTxHash,
      poolId: pool.poolId,
      ticker: pool.ticker,
      stakeAddress,
      registrationIncluded: needsRegistration,
      network,
      mock: true,
    };
  } catch (err) {
    return {
      status: "error",
      registrationIncluded: false,
      network,
      error: err instanceof Error ? err.message : "Delegation failed",
    };
  }
}

/**
 * Withdraw staking rewards
 *
 * Note: This is currently a mock implementation.
 */
export async function withdrawRewards(
  wallet: string | undefined,
  password: string | undefined,
  network: string = "mainnet"
): Promise<WithdrawResult> {
  const availability = checkWalletAvailability(wallet);

  if (!availability.available) {
    return {
      status: "error",
      amount: "0",
      amountAda: "0",
      network,
      error: availability.error || "No wallet available",
    };
  }

  const effectivePassword = password || getPasswordFromEnv() || undefined;
  if (availability.needsPassword && !effectivePassword) {
    return {
      status: "error",
      amount: "0",
      amountAda: "0",
      network,
      error: "Password is required for wallet decryption",
    };
  }

  try {
    const config: TransactionConfig = { network };
    const options: WalletOptions = {
      walletName: availability.walletName,
      password: effectivePassword,
    };

    const meshWallet = await loadWallet(options, config);

    // Get stake address
    const rewardAddresses = await meshWallet.getRewardAddresses();
    if (!rewardAddresses || rewardAddresses.length === 0) {
      throw new Error("Could not derive stake address from wallet");
    }
    const stakeAddress = rewardAddresses[0];

    // Get rewards available
    let rewardsAvailable = "0";
    if (hasApiKey(network as "mainnet" | "preprod" | "preview")) {
      const status = await libGetDelegationStatus(stakeAddress, network);
      rewardsAvailable = status.rewardsAvailable;
    } else {
      // Mock rewards
      rewardsAvailable = "15430000";
    }

    if (rewardsAvailable === "0" || BigInt(rewardsAvailable) === 0n) {
      return {
        status: "error",
        amount: "0",
        amountAda: "0",
        stakeAddress,
        network,
        error: "No rewards available to withdraw",
      };
    }

    // Mock withdrawal transaction
    // TODO: Implement real withdrawal with MeshJS Transaction
    const mockTxHash = "mock_withdraw_tx_" + Date.now().toString(36);

    return {
      status: "success",
      txHash: mockTxHash,
      amount: rewardsAvailable,
      amountAda: lovelaceToAda(rewardsAvailable),
      stakeAddress,
      network,
      mock: true,
    };
  } catch (err) {
    return {
      status: "error",
      amount: "0",
      amountAda: "0",
      network,
      error: err instanceof Error ? err.message : "Withdrawal failed",
    };
  }
}
