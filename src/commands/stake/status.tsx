import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import {
  getDelegationStatus,
  getMockDelegationStatus,
  lovelaceToAda,
  type DelegationStatus,
} from '../../lib/staking.js';
import {
  loadWallet,
  checkWalletAvailability,
  type TransactionConfig,
} from '../../lib/transaction.js';

interface StakeStatusProps {
  network: string;
  json: boolean;
  walletName?: string;
  password?: string;
  stakeAddress?: string; // Optional - allow checking any address directly
}

type StatusState =
  | 'checking'
  | 'password'
  | 'loading-wallet'
  | 'loading'
  | 'success'
  | 'error';

interface WalletInfo {
  source: 'env' | 'wallet';
  walletName?: string;
  needsPassword: boolean;
}

export function StakeStatus({
  network,
  json,
  walletName,
  password: initialPassword,
  stakeAddress: providedStakeAddress,
}: StakeStatusProps) {
  const { exit } = useApp();
  const [state, setState] = useState<StatusState>('checking');
  const [status, setStatus] = useState<DelegationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState(initialPassword || '');
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [stakeAddress, setStakeAddress] = useState<string | null>(providedStakeAddress || null);

  const config: TransactionConfig = { network };

  // Check wallet availability on mount
  useEffect(() => {
    // If a stake address was provided directly, skip wallet loading
    if (providedStakeAddress) {
      setStakeAddress(providedStakeAddress);
      fetchStatus(providedStakeAddress);
      return;
    }

    const availability = checkWalletAvailability(walletName);

    if (!availability.available) {
      setError(availability.error || 'No wallet available');
      setState('error');
      setTimeout(() => exit(), 2000);
      return;
    }

    setWalletInfo({
      source: availability.source!,
      walletName: availability.walletName,
      needsPassword: availability.needsPassword,
    });

    // If using env var or password already provided, proceed to loading
    if (!availability.needsPassword || initialPassword) {
      initWallet(initialPassword, availability.walletName);
    } else {
      setState('password');
    }
  }, []);

  // Handle password submission
  const handlePasswordSubmit = () => {
    if (password.trim()) {
      initWallet(password, walletInfo?.walletName);
    }
  };

  // Initialize wallet and derive stake address
  const initWallet = async (pwd?: string, wName?: string) => {
    try {
      setState('loading-wallet');

      const loadedWallet = await loadWallet(
        { walletName: wName, password: pwd },
        config
      );

      // Get stake/reward address from wallet
      const rewardAddresses = await loadedWallet.getRewardAddresses();
      if (!rewardAddresses || rewardAddresses.length === 0) {
        throw new Error('Could not derive stake address from wallet');
      }
      const derivedStakeAddress = rewardAddresses[0];
      setStakeAddress(derivedStakeAddress);

      // Continue with status fetch
      await fetchStatus(derivedStakeAddress);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load wallet';
      if (message.includes('Incorrect password')) {
        setError('Incorrect password. Please try again.');
      } else {
        setError(message);
      }
      setState('error');
      setTimeout(() => exit(), 2000);
    }
  };

  const fetchStatus = async (effectiveStakeAddress: string) => {
    try {
      setState('loading');
      const apiKey = process.env.BLOCKFROST_API_KEY;

      if (!apiKey) {
        // Use mock data
        console.error('\n⚠ No BLOCKFROST_API_KEY set - using mock data\n');
        const mockStatus = getMockDelegationStatus();
        setStatus({ ...mockStatus, stakeAddress: effectiveStakeAddress });
        setState('success');
        return;
      }

      const delegationStatus = await getDelegationStatus(effectiveStakeAddress, network);
      setStatus(delegationStatus);
      setState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch delegation status');
      setState('error');
      setTimeout(() => exit(), 2000);
    }
  };

  // JSON output
  if (json) {
    if (state === 'checking' || state === 'loading-wallet' || state === 'loading') {
      return <Text>{JSON.stringify({ status: 'loading' })}</Text>;
    }
    if (state === 'error') {
      console.log(JSON.stringify({ error }, null, 2));
      setTimeout(() => exit(), 100);
      return null;
    }
    console.log(
      JSON.stringify(
        {
          stakeAddress: status?.stakeAddress || stakeAddress,
          isRegistered: status?.isRegistered,
          delegatedPool: status?.delegatedPool
            ? {
                poolId: status.delegatedPool.poolId,
                ticker: status.delegatedPool.ticker,
                name: status.delegatedPool.name,
                margin: status.delegatedPool.margin,
              }
            : null,
          rewards: {
            available: status?.rewardsAvailable,
            availableAda: status ? lovelaceToAda(status.rewardsAvailable) : '0',
            totalWithdrawn: status?.totalWithdrawn,
            totalWithdrawnAda: status ? lovelaceToAda(status.totalWithdrawn) : '0',
          },
          activeEpoch: status?.activeEpoch,
          network,
        },
        null,
        2
      )
    );
    setTimeout(() => exit(), 100);
    return null;
  }

  // Render checking state
  if (state === 'checking') {
    return (
      <Box padding={1}>
        <Text color="cyan">⏳ Checking wallet availability...</Text>
      </Box>
    );
  }

  // Render password prompt
  if (state === 'password') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan">🔐 Enter password for wallet </Text>
          <Text bold color="yellow">
            {walletInfo?.walletName}
          </Text>
        </Box>
        <Box>
          <Text color="gray">Password: </Text>
          <TextInput
            value={password}
            onChange={setPassword}
            onSubmit={handlePasswordSubmit}
            mask="*"
          />
        </Box>
      </Box>
    );
  }

  // Render loading wallet state
  if (state === 'loading-wallet') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Loading wallet...</Text>
        {walletInfo?.source === 'wallet' && (
          <Text color="gray">Decrypting {walletInfo.walletName}...</Text>
        )}
        {walletInfo?.source === 'env' && (
          <Text color="gray">Using environment variable</Text>
        )}
      </Box>
    );
  }

  // Human-readable output
  if (state === 'loading') {
    return (
      <Box>
        <Text color="cyan">⏳ Checking delegation status...</Text>
      </Box>
    );
  }

  if (state === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (!status) {
    return <Text color="red">No status data</Text>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Delegation Status
        </Text>
        <Text color="gray"> ({network})</Text>
        {walletInfo?.source === 'wallet' && (
          <Text color="gray"> [{walletInfo.walletName}]</Text>
        )}
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        <Box>
          <Text color="gray">Stake Address: </Text>
          <Text>{status.stakeAddress.slice(0, 40)}...</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">Registration: </Text>
          {status.isRegistered ? (
            <Text color="green">✓ Registered</Text>
          ) : (
            <Text color="yellow">✗ Not Registered</Text>
          )}
        </Box>

        {status.isRegistered && (
          <>
            <Box marginTop={1}>
              <Text color="gray">Delegation: </Text>
              {status.delegatedPool ? (
                <Box flexDirection="column">
                  <Box>
                    <Text color="green">✓ Active</Text>
                    <Text color="gray"> (since epoch {status.activeEpoch})</Text>
                  </Box>
                </Box>
              ) : (
                <Text color="yellow">✗ Not delegated</Text>
              )}
            </Box>

            {status.delegatedPool && (
              <Box marginTop={1} flexDirection="column" paddingLeft={2}>
                <Box>
                  <Text color="gray">Pool: </Text>
                  <Text bold color="green">
                    [{status.delegatedPool.ticker}]
                  </Text>
                  <Text> {status.delegatedPool.name}</Text>
                </Box>
                <Box>
                  <Text color="gray">Pool ID: </Text>
                  <Text>{status.delegatedPool.poolId.slice(0, 40)}...</Text>
                </Box>
                <Box>
                  <Text color="gray">Margin: </Text>
                  <Text color="yellow">{status.delegatedPool.margin.toFixed(2)}%</Text>
                  <Text color="gray"> | Saturation: </Text>
                  <Text
                    color={
                      status.delegatedPool.saturation > 90
                        ? 'red'
                        : status.delegatedPool.saturation > 70
                          ? 'yellow'
                          : 'green'
                    }
                  >
                    {status.delegatedPool.saturation.toFixed(1)}%
                  </Text>
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" padding={1}>
        <Text bold color="cyan">
          Rewards
        </Text>
        <Box marginTop={1}>
          <Text color="gray">Available to withdraw: </Text>
          <Text bold color="green">
            {lovelaceToAda(status.rewardsAvailable)} ADA
          </Text>
        </Box>
        <Box>
          <Text color="gray">Total withdrawn: </Text>
          <Text>{lovelaceToAda(status.totalWithdrawn)} ADA</Text>
        </Box>
      </Box>

      {Number(status.rewardsAvailable) > 0 && (
        <Box marginTop={1}>
          <Text color="gray">
            Tip: Use `begin stake withdraw` to withdraw your rewards
          </Text>
        </Box>
      )}

      {!status.isRegistered && (
        <Box marginTop={1}>
          <Text color="gray">
            Tip: Use `begin stake delegate {'<pool-id>'}` to start staking
          </Text>
        </Box>
      )}

      {status.isRegistered && !status.delegatedPool && (
        <Box marginTop={1}>
          <Text color="yellow">
            ⚠ Your stake key is registered but not delegated. Use `begin stake delegate{' '}
            {'<pool-id>'}` to earn rewards.
          </Text>
        </Box>
      )}
    </Box>
  );
}
