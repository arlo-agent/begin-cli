import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { fetchBalance, type BalanceResult } from '../../services/blockfrost.js';

interface CardanoBalanceProps {
  address: string;
  network: string;
}

export function CardanoBalance({ address, network }: CardanoBalanceProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<BalanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkBalance = async () => {
      try {
        const balance = await fetchBalance(address, network);
        setResult(balance);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    checkBalance();
  }, [address, network]);

  if (loading) {
    return (
      <Box>
        <Text>⏳ Fetching balance...</Text>
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

  if (!result) {
    return <Text color="red">No result</Text>;
  }

  const adaBalance = (Number(result.lovelace) / 1_000_000).toFixed(6);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Cardano Balance</Text>
        <Text color="gray"> ({network})</Text>
      </Box>
      
      <Box>
        <Text color="gray">Address: </Text>
        <Text>{address.slice(0, 20)}...{address.slice(-10)}</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text color="gray">Balance: </Text>
        <Text bold color="green">{adaBalance} ADA</Text>
      </Box>

      {result.tokens.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">Native Tokens:</Text>
          {result.tokens.slice(0, 5).map((token, i) => (
            <Box key={i} paddingLeft={2}>
              <Text>• {token.name || token.unit.slice(0, 20)}: </Text>
              <Text color="yellow">{token.quantity}</Text>
            </Box>
          ))}
          {result.tokens.length > 5 && (
            <Box paddingLeft={2}>
              <Text color="gray">...and {result.tokens.length - 5} more tokens</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
