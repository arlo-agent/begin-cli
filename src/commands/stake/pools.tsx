import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import {
  searchPools,
  listTopPools,
  getMockPools,
  lovelaceToAda,
  type StakePool,
} from '../../lib/staking.js';

interface StakePoolsProps {
  search?: string;
  network: string;
  json: boolean;
  limit?: number;
}

export function StakePools({ search, network, json, limit = 10 }: StakePoolsProps) {
  const [loading, setLoading] = useState(true);
  const [pools, setPools] = useState<StakePool[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPools = async () => {
      try {
        const apiKey = process.env.BLOCKFROST_API_KEY;
        
        if (!apiKey) {
          // Use mock data for development
          console.error('\n⚠ No BLOCKFROST_API_KEY set - using mock data\n');
          const mockPools = getMockPools();
          const filtered = search
            ? mockPools.filter(
                (p) =>
                  p.ticker.toLowerCase().includes(search.toLowerCase()) ||
                  p.name.toLowerCase().includes(search.toLowerCase()) ||
                  p.poolId.includes(search)
              )
            : mockPools;
          setPools(filtered);
          setLoading(false);
          return;
        }

        let result: StakePool[];
        if (search) {
          result = await searchPools(search, network, limit);
        } else {
          result = await listTopPools(network, limit);
        }
        setPools(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchPools();
  }, [search, network, limit]);

  // JSON output mode
  if (json) {
    if (loading) {
      return <Text>{JSON.stringify({ status: 'loading' })}</Text>;
    }
    if (error) {
      console.log(JSON.stringify({ error }, null, 2));
      process.exit(1);
      return null;
    }
    console.log(JSON.stringify({ pools, network, search: search || null }, null, 2));
    process.exit(0);
    return null;
  }

  // Human-readable output
  if (loading) {
    return (
      <Box>
        <Text color="cyan">⏳ Fetching stake pools...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (pools.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">No stake pools found</Text>
        {search && <Text color="gray">Try a different search term</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Stake Pools</Text>
        <Text color="gray"> ({network})</Text>
        {search && <Text color="gray"> - Search: "{search}"</Text>}
      </Box>

      <Box flexDirection="column">
        {pools.map((pool, i) => (
          <Box key={pool.poolId} flexDirection="column" marginBottom={1}>
            <Box>
              <Text bold color="green">[{pool.ticker}]</Text>
              <Text> {pool.name}</Text>
              {pool.retiring && <Text color="red"> ⚠ RETIRING</Text>}
            </Box>
            <Box paddingLeft={2} flexDirection="column">
              <Box>
                <Text color="gray">Pool ID: </Text>
                <Text>{pool.poolId.slice(0, 40)}...</Text>
              </Box>
              <Box>
                <Text color="gray">Margin: </Text>
                <Text color="yellow">{pool.margin.toFixed(2)}%</Text>
                <Text color="gray">  |  Cost: </Text>
                <Text color="yellow">{lovelaceToAda(pool.cost)} ADA</Text>
                <Text color="gray">  |  Saturation: </Text>
                <Text color={pool.saturation > 90 ? 'red' : pool.saturation > 70 ? 'yellow' : 'green'}>
                  {pool.saturation.toFixed(1)}%
                </Text>
              </Box>
              <Box>
                <Text color="gray">Delegators: </Text>
                <Text>{pool.liveDelegators.toLocaleString()}</Text>
                <Text color="gray">  |  Blocks: </Text>
                <Text>{pool.blocksProduced.toLocaleString()}</Text>
                <Text color="gray">  |  Stake: </Text>
                <Text>{(Number(pool.liveStake) / 1_000_000_000_000).toFixed(2)}M ADA</Text>
              </Box>
            </Box>
            {i < pools.length - 1 && (
              <Box marginTop={1}>
                <Text color="gray">{'─'.repeat(60)}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="gray">
          Tip: Use `begin stake delegate {'<pool-id>'}` to delegate to a pool
        </Text>
      </Box>
    </Box>
  );
}
