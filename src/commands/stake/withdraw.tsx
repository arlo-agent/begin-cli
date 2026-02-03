import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  getDelegationStatus,
  getMockDelegationStatus,
  lovelaceToAda,
  type DelegationStatus,
} from '../../lib/staking.js';

interface StakeWithdrawProps {
  network: string;
  json: boolean;
  yes?: boolean; // Skip confirmation prompt
  stakeAddress?: string; // Optional - in real impl would derive from wallet
}

type WithdrawState = 'loading' | 'no_rewards' | 'confirm' | 'building' | 'signing' | 'submitting' | 'success' | 'error' | 'cancelled';

export function StakeWithdraw({ network, json, yes, stakeAddress }: StakeWithdrawProps) {
  const [state, setState] = useState<WithdrawState>('loading');
  const [status, setStatus] = useState<DelegationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Default stake address for demo (in real impl, derive from wallet)
  const effectiveStakeAddress = stakeAddress || 'stake1uy4s2fc8qjzqchpjxh6yjzgx3ckg4zhfz8rpvj0l0wvtqgsxhfr8c';

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const apiKey = process.env.BLOCKFROST_API_KEY;

        if (!apiKey) {
          // Use mock data
          console.error('\n⚠ No BLOCKFROST_API_KEY set - using mock data\n');
          const mockStatus = getMockDelegationStatus();
          setStatus(mockStatus);
          
          if (Number(mockStatus.rewardsAvailable) === 0) {
            setState('no_rewards');
          } else if (yes) {
            // If --yes flag, skip confirmation
            setState('building');
            simulateWithdrawal();
          } else {
            setState('confirm');
          }
          return;
        }

        const delegationStatus = await getDelegationStatus(effectiveStakeAddress, network);
        setStatus(delegationStatus);

        if (!delegationStatus.isRegistered) {
          setError('Stake key is not registered. You need to delegate first to earn rewards.');
          setState('error');
          return;
        }

        if (Number(delegationStatus.rewardsAvailable) === 0) {
          setState('no_rewards');
          return;
        }

        // If --yes flag, skip confirmation
        if (yes) {
          setState('building');
          simulateWithdrawal();
        } else {
          setState('confirm');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load delegation status');
        setState('error');
      }
    };

    loadStatus();
  }, [effectiveStakeAddress, network, yes]);

  useInput((input, key) => {
    if (state !== 'confirm') return;

    if (input === 'y' || input === 'Y') {
      // Start withdrawal process
      setState('building');
      simulateWithdrawal();
    } else if (input === 'n' || input === 'N' || key.escape) {
      setState('cancelled');
      setTimeout(() => process.exit(0), 500);
    }
  });

  const simulateWithdrawal = async () => {
    // Simulate MeshJS transaction building
    // In real implementation:
    // 1. const tx = new Transaction({ initiator: wallet });
    // 2. tx.withdrawRewards(stakeAddress, rewardsAvailable);
    // 3. const unsignedTx = await tx.build();
    // 4. const signedTx = await wallet.signTx(unsignedTx);
    // 5. const txHash = await wallet.submitTx(signedTx);

    await new Promise((resolve) => setTimeout(resolve, 1000));
    setState('signing');

    await new Promise((resolve) => setTimeout(resolve, 1500));
    setState('submitting');

    await new Promise((resolve) => setTimeout(resolve, 2000));
    setTxHash('mock_withdraw_tx_' + Date.now().toString(36));
    setState('success');

    setTimeout(() => process.exit(0), 2000);
  };

  // JSON output
  if (json) {
    if (state === 'loading') {
      return <Text>{JSON.stringify({ status: 'loading' })}</Text>;
    }
    if (state === 'error') {
      console.log(JSON.stringify({ error }, null, 2));
      process.exit(1);
      return null;
    }
    if (state === 'no_rewards') {
      console.log(
        JSON.stringify(
          {
            status: 'no_rewards',
            stakeAddress: effectiveStakeAddress,
            rewardsAvailable: '0',
            message: 'No rewards available to withdraw',
          },
          null,
          2
        )
      );
      process.exit(0);
      return null;
    }
    if (state === 'success') {
      console.log(
        JSON.stringify(
          {
            status: 'success',
            txHash,
            stakeAddress: effectiveStakeAddress,
            withdrawnAmount: status?.rewardsAvailable,
            withdrawnAda: status ? lovelaceToAda(status.rewardsAvailable) : '0',
            network,
          },
          null,
          2
        )
      );
      process.exit(0);
      return null;
    }
    // For non-interactive JSON mode, output status
    console.log(
      JSON.stringify(
        {
          status: 'confirm_required',
          stakeAddress: effectiveStakeAddress,
          rewardsAvailable: status?.rewardsAvailable,
          rewardsAda: status ? lovelaceToAda(status.rewardsAvailable) : '0',
          message: 'Run without --json to confirm withdrawal interactively',
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
        <Text color="cyan">⏳ Checking available rewards...</Text>
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

  if (state === 'no_rewards') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Withdraw Staking Rewards</Text>
        <Box marginTop={1}>
          <Text color="yellow">No rewards available to withdraw</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            Rewards accumulate over time while delegated. Check back after a few epochs.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            Use `begin stake status` to check your delegation status.
          </Text>
        </Box>
      </Box>
    );
  }

  if (state === 'cancelled') {
    return (
      <Box>
        <Text color="yellow">Withdrawal cancelled</Text>
      </Box>
    );
  }

  if (state === 'building') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔨 Building withdrawal transaction...</Text>
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
        <Text color="green">✓ Rewards withdrawn successfully!</Text>
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color="gray">TX Hash: </Text>
            <Text>{txHash}</Text>
          </Box>
          <Box>
            <Text color="gray">Amount: </Text>
            <Text bold color="green">{status ? lovelaceToAda(status.rewardsAvailable) : '0'} ADA</Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            Rewards have been sent to your wallet address. Your delegation continues unchanged.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="yellow">⚠ This is a MOCK transaction - no actual withdrawal occurred</Text>
        </Box>
      </Box>
    );
  }

  // Confirm state
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Withdraw Staking Rewards</Text>
        <Text color="gray"> ({network})</Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        <Box>
          <Text color="gray">Stake Address: </Text>
          <Text>{effectiveStakeAddress.slice(0, 40)}...</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">Available Rewards: </Text>
          <Text bold color="green">{status ? lovelaceToAda(status.rewardsAvailable) : '0'} ADA</Text>
        </Box>

        {status?.delegatedPool && (
          <Box marginTop={1}>
            <Text color="gray">Currently delegated to: </Text>
            <Text color="green">[{status.delegatedPool.ticker}]</Text>
            <Text> {status.delegatedPool.name}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Estimated fee: </Text>
        <Text color="yellow">~0.17 ADA</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">
          Note: Withdrawing rewards does not affect your delegation. You will continue to earn rewards.
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="yellow">⚠ This is a MOCK transaction - no real ADA will be withdrawn</Text>
      </Box>

      <Box marginTop={1}>
        <Text>Confirm withdrawal? </Text>
        <Text color="green">[Y]es</Text>
        <Text> / </Text>
        <Text color="red">[N]o</Text>
      </Box>
    </Box>
  );
}
