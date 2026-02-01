import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { fetchBalance, type BalanceResult } from '../../services/blockfrost.js';
import { outputSuccess, outputError, formatAda, formatAddress } from '../../lib/output.js';
import { NetworkError, ErrorCode } from '../../lib/errors.js';

interface CardanoBalanceProps {
  address: string;
  network: string;
  json?: boolean;
}

export function CardanoBalance({ address, network, json = false }: CardanoBalanceProps) {
  const { exit } = useApp();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<BalanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkBalance = async () => {
      try {
        const balance = await fetchBalance(address, network);
        
        if (json) {
          outputSuccess({
            address,
            network,
            lovelace: balance.lovelace.toString(),
            ada: Number(balance.lovelace) / 1_000_000,
            tokens: balance.tokens.map(t => ({
              unit: t.unit,
              name: t.name,
              quantity: t.quantity,
            })),
          }, { json: true });
        }
        
        setResult(balance);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        
        if (json) {
          outputError(new NetworkError(message, ErrorCode.PROVIDER_ERROR), { json: true });
        }
        
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    checkBalance();
  }, [address, network, json]);

  // JSON mode exits early via outputSuccess/outputError
  if (json) {
    return loading ? null : null;
  }

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

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Cardano Balance</Text>
        <Text color="gray"> ({network})</Text>
      </Box>
      
      <Box>
        <Text color="gray">Address: </Text>
        <Text>{formatAddress(address)}</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text color="gray">Balance: </Text>
        <Text bold color="green">{formatAda(result.lovelace)}</Text>
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
