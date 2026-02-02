import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import {
  getDelegationStatus,
  getMockDelegationStatus,
  lovelaceToAda,
  type DelegationStatus,
} from '../../lib/staking.js';

interface StakeStatusProps {
  network: string;
  json: boolean;
  stakeAddress?: string; // Optional - in real impl would derive from wallet
}

export function StakeStatus({ network, json, stakeAddress }: StakeStatusProps) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<DelegationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default stake address for demo (in real impl, derive from wallet)
  const effectiveStakeAddress = stakeAddress || 'stake1uy4s2fc8qjzqchpjxh6yjzgx3ckg4zhfz8rpvj0l0wvtqgsxhfr8c';

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const apiKey = process.env.BLOCKFROST_API_KEY;

        if (!apiKey) {
          // Use mock data
          console.error('\n⚠ No BLOCKFROST_API_KEY set - using mock data\n');
          setStatus(getMockDelegationStatus());
          setLoading(false);
          return;
        }

        const delegationStatus = await getDelegationStatus(effectiveStakeAddress, network);
        setStatus(delegationStatus);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch delegation status');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [effectiveStakeAddress, network]);

  // JSON output
  if (json) {
    if (loading) {
      return <Text>{JSON.stringify({ status: 'loading' })}</Text>;
    }
    if (error) {
      console.log(JSON.stringify({ error }, null, 2));
      process.exit(1);
      return null;
    }
    console.log(
      JSON.stringify(
        {
          stakeAddress: status?.stakeAddress,
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
    process.exit(0);
    return null;
  }

  // Human-readable output
  if (loading) {
    return (
      <Box>
        <Text color="cyan">⏳ Checking delegation status...</Text>
      </Box>
    );
  }

  if (error) {
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
        <Text bold color="cyan">Delegation Status</Text>
        <Text color="gray"> ({network})</Text>
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
                  <Text bold color="green">[{status.delegatedPool.ticker}]</Text>
                  <Text> {status.delegatedPool.name}</Text>
                </Box>
                <Box>
                  <Text color="gray">Pool ID: </Text>
                  <Text>{status.delegatedPool.poolId.slice(0, 40)}...</Text>
                </Box>
                <Box>
                  <Text color="gray">Margin: </Text>
                  <Text color="yellow">{status.delegatedPool.margin.toFixed(2)}%</Text>
                  <Text color="gray">  |  Saturation: </Text>
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
        <Text bold color="cyan">Rewards</Text>
        <Box marginTop={1}>
          <Text color="gray">Available to withdraw: </Text>
          <Text bold color="green">{lovelaceToAda(status.rewardsAvailable)} ADA</Text>
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
            ⚠ Your stake key is registered but not delegated. Use `begin stake delegate {'<pool-id>'}` to earn rewards.
          </Text>
        </Box>
      )}
    </Box>
  );
}
