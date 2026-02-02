import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
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
import type { MeshWallet } from '@meshsdk/core';

interface StakeWithdrawProps {
  network: string;
  json: boolean;
  yes?: boolean;
  walletName?: string;
  password?: string;
}

type WithdrawState =
  | 'checking'
  | 'password'
  | 'loading-wallet'
  | 'loading'
  | 'no_rewards'
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

export function StakeWithdraw({
  network,
  json,
  yes,
  walletName,
  password: initialPassword,
}: StakeWithdrawProps) {
  const { exit } = useApp();
  const [state, setState] = useState<WithdrawState>('checking');
  const [status, setStatus] = useState<DelegationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [password, setPassword] = useState(initialPassword || '');
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [stakeAddress, setStakeAddress] = useState<string | null>(null);
  const [wallet, setWallet] = useState<MeshWallet | null>(null);

  const config: TransactionConfig = { network };

  // Check wallet availability on mount
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
      setWallet(loadedWallet);

      // Get stake/reward address from wallet
      const rewardAddresses = await loadedWallet.getRewardAddresses();
      if (!rewardAddresses || rewardAddresses.length === 0) {
        throw new Error('Could not derive stake address from wallet');
      }
      const derivedStakeAddress = rewardAddresses[0];
      setStakeAddress(derivedStakeAddress);

      // Continue with status loading
      await loadStatus(derivedStakeAddress);
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

  const loadStatus = async (effectiveStakeAddress: string) => {
    try {
      setState('loading');
      const apiKey = process.env.BLOCKFROST_API_KEY;

      if (!apiKey) {
        // Use mock data
        console.error('\n⚠ No BLOCKFROST_API_KEY set - using mock data\n');
        const mockStatus = getMockDelegationStatus();
        // Override with the actual stake address
        setStatus({ ...mockStatus, stakeAddress: effectiveStakeAddress });

        if (Number(mockStatus.rewardsAvailable) === 0) {
          setState('no_rewards');
        } else if (yes) {
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

  useInput((input, key) => {
    if (state !== 'confirm') return;

    if (input === 'y' || input === 'Y') {
      // Start withdrawal process
      setState('building');
      simulateWithdrawal();
    } else if (input === 'n' || input === 'N' || key.escape) {
      setState('cancelled');
      setTimeout(() => exit(), 500);
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

    setTimeout(() => exit(), 2000);
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
    if (state === 'no_rewards') {
      console.log(
        JSON.stringify(
          {
            status: 'no_rewards',
            stakeAddress,
            rewardsAvailable: '0',
            message: 'No rewards available to withdraw',
          },
          null,
          2
        )
      );
      setTimeout(() => exit(), 100);
      return null;
    }
    if (state === 'success') {
      console.log(
        JSON.stringify(
          {
            status: 'success',
            txHash,
            stakeAddress,
            withdrawnAmount: status?.rewardsAvailable,
            withdrawnAda: status ? lovelaceToAda(status.rewardsAvailable) : '0',
            network,
          },
          null,
          2
        )
      );
      setTimeout(() => exit(), 100);
      return null;
    }
    // For non-interactive JSON mode, output status
    console.log(
      JSON.stringify(
        {
          status: 'confirm_required',
          stakeAddress,
          rewardsAvailable: status?.rewardsAvailable,
          rewardsAda: status ? lovelaceToAda(status.rewardsAvailable) : '0',
          message: 'Run without --json to confirm withdrawal interactively, or use --yes to skip confirmation',
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
        <Text bold color="cyan">
          Withdraw Staking Rewards
        </Text>
        <Box marginTop={1}>
          <Text color="yellow">No rewards available to withdraw</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            Rewards accumulate over time while delegated. Check back after a few epochs.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Use `begin stake status` to check your delegation status.</Text>
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
            <Text bold color="green">
              {status ? lovelaceToAda(status.rewardsAvailable) : '0'} ADA
            </Text>
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
        <Text bold color="cyan">
          Withdraw Staking Rewards
        </Text>
        <Text color="gray"> ({network})</Text>
        {walletInfo?.source === 'wallet' && (
          <Text color="gray"> [{walletInfo.walletName}]</Text>
        )}
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        <Box>
          <Text color="gray">Stake Address: </Text>
          <Text>{stakeAddress?.slice(0, 40)}...</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">Available Rewards: </Text>
          <Text bold color="green">
            {status ? lovelaceToAda(status.rewardsAvailable) : '0'} ADA
          </Text>
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
          Note: Withdrawing rewards does not affect your delegation. You will continue to earn
          rewards.
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
