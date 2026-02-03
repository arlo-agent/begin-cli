import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { fetchPoolDetails, getDelegationStatus, getMockPools, lovelaceToAda, type StakePool } from '../../lib/staking.js';
import { checkWalletAvailability, loadWallet, type TransactionConfig } from '../../lib/transaction.js';

interface StakeDelegateProps {
  poolId: string;
  network: string;
  json: boolean;
  yes?: boolean;
  walletName?: string;
  password?: string;
}

type DelegateState =
  | 'checking'
  | 'password'
  | 'loading-wallet'
  | 'loading'
  | 'confirm'
  | 'building'
  | 'signing'
  | 'submitting'
  | 'success'
  | 'error'
  | 'cancelled';

interface WalletInfo {
  source: 'env' | 'wallet';
  walletName?: string;
  needsPassword: boolean;
}

export function StakeDelegate({
  poolId,
  network,
  json,
  yes = false,
  walletName,
  password: initialPassword,
}: StakeDelegateProps) {
  const { exit } = useApp();
  const [state, setState] = useState<DelegateState>('checking');
  const [pool, setPool] = useState<StakePool | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [password, setPassword] = useState(initialPassword || '');
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [stakeAddress, setStakeAddress] = useState<string | null>(null);

  const config: TransactionConfig = { network };

  const simulateDelegation = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setState('signing');

    await new Promise((resolve) => setTimeout(resolve, 1500));
    setState('submitting');

    await new Promise((resolve) => setTimeout(resolve, 2000));
    setTxHash('mock_delegation_tx_' + Date.now().toString(36));
    setState('success');
    setTimeout(() => exit(), 2000);
  };

  const loadPoolData = async (effectiveStakeAddress: string) => {
    try {
      setState('loading');

      const apiKey = process.env.BLOCKFROST_API_KEY;
      if (!apiKey) {
        // Use mock data (staking lib throws if no key)
        const mockPools = getMockPools();
        const match = mockPools.find(
          (p) => p.poolId === poolId || p.ticker.toLowerCase() === poolId.toLowerCase()
        );
        if (!match) {
          setError(`Pool not found: ${poolId}`);
          setState('error');
          return;
        }
        setPool(match);
        setNeedsRegistration(false);

        if (yes) {
          setState('building');
          void simulateDelegation();
        } else {
          setState('confirm');
        }
        return;
      }

      const poolDetails = await fetchPoolDetails(poolId, network);
      if (!poolDetails) {
        setError(`Pool not found: ${poolId}`);
        setState('error');
        return;
      }
      setPool(poolDetails);

      const status = await getDelegationStatus(effectiveStakeAddress, network);
      setNeedsRegistration(!status.isRegistered);

      if (yes) {
        setState('building');
        void simulateDelegation();
      } else {
        setState('confirm');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pool data');
      setState('error');
      setTimeout(() => exit(), 2000);
    }
  };

  const initWallet = async (pwd?: string, wName?: string) => {
    try {
      setState('loading-wallet');

      const loadedWallet = await loadWallet({ walletName: wName, password: pwd }, config);
      const rewardAddresses = await loadedWallet.getRewardAddresses();
      if (!rewardAddresses || rewardAddresses.length === 0) {
        throw new Error('Could not derive stake address from wallet');
      }
      const derived = rewardAddresses[0];
      setStakeAddress(derived);

      await loadPoolData(derived);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load wallet';
      setError(message.includes('Incorrect password') ? 'Incorrect password. Please try again.' : message);
      setState('error');
      setTimeout(() => exit(), 2000);
    }
  };

  useEffect(() => {
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

    if (!availability.needsPassword || initialPassword) {
      void initWallet(initialPassword, availability.walletName);
      return;
    }

    setState('password');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePasswordSubmit = () => {
    if (password.trim()) {
      void initWallet(password, walletInfo?.walletName);
    }
  };

  useInput((input, key) => {
    if (json) return;
    if (state !== 'confirm') return;

    if (input === 'y' || input === 'Y') {
      setState('building');
      void simulateDelegation();
    } else if (input === 'n' || input === 'N' || key.escape) {
      setState('cancelled');
      setTimeout(() => exit(), 500);
    }
  });

  // JSON output
  if (json) {
    if (state === 'checking' || state === 'loading-wallet' || state === 'loading') {
      return <Text>{JSON.stringify({ status: 'loading' })}</Text>;
    }
    if (state === 'error') {
      console.log(JSON.stringify({ error, poolId }, null, 2));
      setTimeout(() => exit(), 100);
      return null;
    }
    if (state === 'success') {
      console.log(
        JSON.stringify(
          {
            status: 'success',
            txHash,
            poolId: pool?.poolId,
            ticker: pool?.ticker,
            stakeAddress,
            registrationIncluded: needsRegistration,
            network,
          },
          null,
          2
        )
      );
      setTimeout(() => exit(), 100);
      return null;
    }
    console.log(
      JSON.stringify(
        {
          status: 'confirm_required',
          pool,
          stakeAddress,
          needsRegistration,
          message: 'Run without --json to confirm delegation interactively, or use --yes to skip confirmation',
        },
        null,
        2
      )
    );
    setTimeout(() => exit(), 100);
    return null;
  }

  if (state === 'checking') {
    return (
      <Box padding={1}>
        <Text color="cyan">⏳ Checking wallet availability...</Text>
      </Box>
    );
  }

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
          <TextInput value={password} onChange={setPassword} onSubmit={handlePasswordSubmit} mask="*" />
        </Box>
      </Box>
    );
  }

  if (state === 'loading-wallet') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Loading wallet...</Text>
        {walletInfo?.source === 'wallet' && <Text color="gray">Decrypting {walletInfo.walletName}...</Text>}
        {walletInfo?.source === 'env' && <Text color="gray">Using environment variable</Text>}
      </Box>
    );
  }

  if (state === 'loading') {
    return (
      <Box>
        <Text color="cyan">⏳ Loading pool information...</Text>
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

  if (state === 'cancelled') {
    return (
      <Box>
        <Text color="yellow">Delegation cancelled</Text>
      </Box>
    );
  }

  if (state === 'building') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔨 Building delegation transaction...</Text>
        {needsRegistration && <Text color="gray">Including stake key registration certificate</Text>}
      </Box>
    );
  }

  if (state === 'signing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔐 Signing transaction...</Text>
      </Box>
    );
  }

  if (state === 'submitting') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">📤 Submitting to blockchain...</Text>
      </Box>
    );
  }

  if (state === 'success') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">✓ Delegation successful!</Text>
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color="gray">TX Hash: </Text>
            <Text>{txHash}</Text>
          </Box>
          <Box>
            <Text color="gray">Pool: </Text>
            <Text color="green">[{pool?.ticker}]</Text>
            <Text> {pool?.name}</Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            Note: Delegation becomes active in 2-3 epochs (~10-15 days). Rewards will start accumulating after that.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="yellow">⚠ This is a MOCK transaction - no actual delegation occurred</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Delegate Stake
        </Text>
        <Text color="gray"> ({network})</Text>
        {walletInfo?.source === 'wallet' && <Text color="gray"> [{walletInfo.walletName}]</Text>}
      </Box>

      {pool && (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
          <Box>
            <Text bold color="green">
              [{pool.ticker}]
            </Text>
            <Text> {pool.name}</Text>
          </Box>
          <Box>
            <Text color="gray">Pool ID: </Text>
            <Text>{pool.poolId.slice(0, 50)}...</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">Margin: </Text>
            <Text color="yellow">{pool.margin.toFixed(2)}%</Text>
            <Text color="gray"> | Cost: </Text>
            <Text color="yellow">{lovelaceToAda(pool.cost)} ADA/epoch</Text>
          </Box>
          <Box>
            <Text color="gray">Saturation: </Text>
            <Text color={pool.saturation > 90 ? 'red' : pool.saturation > 70 ? 'yellow' : 'green'}>
              {pool.saturation.toFixed(1)}%
            </Text>
            <Text color="gray"> | Delegators: </Text>
            <Text>{pool.liveDelegators.toLocaleString()}</Text>
          </Box>
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color="gray">From stake address: </Text>
          <Text>{stakeAddress?.slice(0, 30)}...</Text>
        </Box>
      </Box>

      {needsRegistration && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">⚠ First-time delegation - stake key registration required</Text>
          <Text color="gray">This will include a 2 ADA deposit (refundable when you deregister)</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">Estimated fee: </Text>
        <Text color="yellow">~{needsRegistration ? '2.17' : '0.17'} ADA</Text>
        {needsRegistration && <Text color="gray"> (includes 2 ADA registration deposit)</Text>}
      </Box>

      <Box marginTop={1}>
        <Text color="yellow">⚠ This is a MOCK transaction - no real ADA will be staked</Text>
      </Box>

      <Box marginTop={1}>
        <Text>Confirm delegation? </Text>
        <Text color="green">[Y]es</Text>
        <Text> / </Text>
        <Text color="red">[N]o</Text>
      </Box>
    </Box>
  );
}
