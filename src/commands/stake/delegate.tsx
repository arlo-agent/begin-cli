import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  fetchPoolDetails,
  getDelegationStatus,
  lovelaceToAda,
  getMockPools,
  type StakePool,
} from '../../lib/staking.js';

interface StakeDelegateProps {
  poolId: string;
  network: string;
  json: boolean;
  stakeAddress?: string; // Optional - in real impl would derive from wallet
}

type DelegateState = 'loading' | 'confirm' | 'building' | 'signing' | 'submitting' | 'success' | 'error' | 'cancelled';

export function StakeDelegate({ poolId, network, json, stakeAddress }: StakeDelegateProps) {
  const [state, setState] = useState<DelegateState>('loading');
  const [pool, setPool] = useState<StakePool | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Default stake address for demo (in real impl, derive from wallet)
  const effectiveStakeAddress = stakeAddress || 'stake1uy4s2fc8qjzqchpjxh6yjzgx3ckg4zhfz8rpvj0l0wvtqgsxhfr8c';

  useEffect(() => {
    const loadPoolData = async () => {
      try {
        const apiKey = process.env.BLOCKFROST_API_KEY;

        if (!apiKey) {
          // Use mock data
          console.error('\n⚠ No BLOCKFROST_API_KEY set - using mock data\n');
          const mockPools = getMockPools();
          const mockPool = mockPools.find((p) => p.poolId === poolId || p.ticker.toLowerCase() === poolId.toLowerCase());
          if (mockPool) {
            setPool(mockPool);
            setNeedsRegistration(false); // Mock: assume registered
          } else {
            setError(`Pool not found: ${poolId}`);
            setState('error');
            return;
          }
          setState('confirm');
          return;
        }

        // Fetch pool details
        const poolDetails = await fetchPoolDetails(poolId, network);
        if (!poolDetails) {
          setError(`Pool not found: ${poolId}`);
          setState('error');
          return;
        }
        setPool(poolDetails);

        // Check if stake key needs registration
        const status = await getDelegationStatus(effectiveStakeAddress, network);
        setNeedsRegistration(!status.isRegistered);

        setState('confirm');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load pool data');
        setState('error');
      }
    };

    loadPoolData();
  }, [poolId, network, effectiveStakeAddress]);

  useInput((input, key) => {
    if (state !== 'confirm') return;

    if (input === 'y' || input === 'Y') {
      // Start delegation process
      setState('building');
      simulateDelegation();
    } else if (input === 'n' || input === 'N' || key.escape) {
      setState('cancelled');
      setTimeout(() => process.exit(0), 500);
    }
  });

  const simulateDelegation = async () => {
    // Simulate MeshJS transaction building
    // In real implementation:
    // 1. const tx = new Transaction({ initiator: wallet });
    // 2. if (needsRegistration) tx.registerStake(stakeAddress);
    // 3. tx.delegateStake(stakeAddress, poolId);
    // 4. const unsignedTx = await tx.build();
    // 5. const signedTx = await wallet.signTx(unsignedTx);
    // 6. const txHash = await wallet.submitTx(signedTx);

    await new Promise((resolve) => setTimeout(resolve, 1000));
    setState('signing');

    await new Promise((resolve) => setTimeout(resolve, 1500));
    setState('submitting');

    await new Promise((resolve) => setTimeout(resolve, 2000));
    setTxHash('mock_delegation_tx_' + Date.now().toString(36));
    setState('success');

    setTimeout(() => process.exit(0), 2000);
  };

  // JSON output
  if (json) {
    if (state === 'loading') {
      return <Text>{JSON.stringify({ status: 'loading' })}</Text>;
    }
    if (state === 'error') {
      console.log(JSON.stringify({ error, poolId }, null, 2));
      process.exit(1);
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
            stakeAddress: effectiveStakeAddress,
            registrationIncluded: needsRegistration,
            network,
          },
          null,
          2
        )
      );
      process.exit(0);
      return null;
    }
    // For non-interactive JSON mode, just output pool info
    console.log(
      JSON.stringify(
        {
          status: 'confirm_required',
          pool: pool,
          stakeAddress: effectiveStakeAddress,
          needsRegistration,
          message: 'Run without --json to confirm delegation interactively',
        },
        null,
        2
      )
    );
    process.exit(0);
    return null;
  }

  // Human-readable output
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
        {needsRegistration && (
          <Text color="gray">Including stake key registration certificate</Text>
        )}
      </Box>
    );
  }

  if (state === 'signing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔐 Signing transaction...</Text>
        <Text color="gray">(This is a mock - real signing requires wallet)</Text>
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

  // Confirm state
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Delegate Stake</Text>
        <Text color="gray"> ({network})</Text>
      </Box>

      {pool && (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
          <Box>
            <Text bold color="green">[{pool.ticker}]</Text>
            <Text> {pool.name}</Text>
          </Box>
          <Box>
            <Text color="gray">Pool ID: </Text>
            <Text>{pool.poolId.slice(0, 50)}...</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">Margin: </Text>
            <Text color="yellow">{pool.margin.toFixed(2)}%</Text>
            <Text color="gray">  |  Cost: </Text>
            <Text color="yellow">{lovelaceToAda(pool.cost)} ADA/epoch</Text>
          </Box>
          <Box>
            <Text color="gray">Saturation: </Text>
            <Text color={pool.saturation > 90 ? 'red' : pool.saturation > 70 ? 'yellow' : 'green'}>
              {pool.saturation.toFixed(1)}%
            </Text>
            <Text color="gray">  |  Delegators: </Text>
            <Text>{pool.liveDelegators.toLocaleString()}</Text>
          </Box>
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color="gray">From stake address: </Text>
          <Text>{effectiveStakeAddress.slice(0, 30)}...</Text>
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
