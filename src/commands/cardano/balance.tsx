/**
 * Balance command - shows ADA and native token balances
 * Uses @meshsdk/core with BlockfrostProvider (via core/balance)
 */

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { hasApiKey } from "../../lib/provider.js";
import { outputSuccess, outputError, truncateAddress } from "../../lib/output.js";
import { ExitCode } from "../../lib/errors.js";
import type { Network } from "../../lib/config.js";
import { getBalance, type BalanceResult } from "../../core/balance.js";

interface CardanoBalanceProps {
  address: string;
  network: Network;
  json: boolean;
}

export function CardanoBalance({ address, network, json }: CardanoBalanceProps) {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<BalanceResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadBalance = async () => {
      try {
        if (!hasApiKey(network)) {
          if (!json) console.error("\n⚠ No BLOCKFROST_API_KEY set - returning mock data\n");
        }
        setBalance(await getBalance(address, network));
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };
    loadBalance();
  }, [address, network, json]);

  // Handle JSON output
  useEffect(() => {
    if (json && !loading) {
      if (error) {
        outputError(error);
        process.exit(ExitCode.ERROR);
      } else if (balance) {
        outputSuccess({
          address: balance.address,
          network: balance.network,
          lovelace: balance.lovelace,
          ada: balance.ada,
          tokenCount: balance.tokenCount,
          tokens: balance.tokens,
          ...(balance.mock && { mock: true }),
        });
        process.exit(ExitCode.SUCCESS);
      }
    }
  }, [json, loading, error, balance]);

  if (json) return null;
  if (loading)
    return (
      <Box>
        <Text>⏳ Fetching balance...</Text>
      </Box>
    );
  if (error)
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  if (!balance) return <Text color="red">No result</Text>;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Cardano Balance
        </Text>
        <Text color="gray"> ({network})</Text>
        {balance.mock && <Text color="yellow"> [MOCK]</Text>}
      </Box>

      <Box>
        <Text color="gray">Address: </Text>
        <Text>{truncateAddress(address)}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color="gray">ADA: </Text>
          <Text bold color="green">
            {balance.ada}
          </Text>
          <Text color="gray"> ({balance.lovelace} lovelace)</Text>
        </Box>

        {balance.tokens.slice(0, 10).map((token) => (
          <Box key={token.unit} marginTop={1}>
            <Text color="gray">{token.displayLabel}: </Text>
            <Text bold>{token.quantityFormatted}</Text>
          </Box>
        ))}
        {balance.tokens.length > 10 && (
          <Box marginTop={1}>
            <Text color="gray">...and {balance.tokens.length - 10} more tokens</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
