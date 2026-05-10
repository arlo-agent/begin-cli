/**
 * EVM Balance command - shows ETH/native token and ERC-20 balances
 */

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { createEVMAdapter, getEVMNetworkConfig, type EVMNetwork } from "../../lib/chains/index.js";
import type { ChainBalance } from "../../lib/chains/types.js";
import { outputSuccess, outputError, truncateAddress } from "../../lib/output.js";
import { ExitCode, getErrorMessage } from "../../lib/errors.js";

interface EVMBalanceProps {
  address: string;
  network: EVMNetwork;
  json: boolean;
}

export function EVMBalance({ address, network, json }: EVMBalanceProps) {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<ChainBalance | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const networkConfig = getEVMNetworkConfig(network);

  useEffect(() => {
    const loadBalance = async () => {
      try {
        const adapter = createEVMAdapter(network);

        if (!adapter.validateAddress(address)) {
          throw new Error("Invalid EVM address");
        }

        const result = await adapter.getBalance(address);
        setBalance(result);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(getErrorMessage(err)));
      } finally {
        setLoading(false);
      }
    };
    loadBalance();
  }, [address, network]);

  // Handle JSON output
  useEffect(() => {
    if (json && !loading) {
      if (error) {
        outputError(error);
        process.exit(ExitCode.ERROR);
      } else if (balance) {
        outputSuccess({
          address,
          network,
          chainId: networkConfig.chainId,
          wei: balance.native.amount,
          [networkConfig.symbol.toLowerCase()]: balance.native.uiAmount.toFixed(18),
          symbol: networkConfig.symbol,
          tokenCount: balance.tokens.length,
          tokens: balance.tokens.map((t) => ({
            contract: t.mint,
            symbol: t.symbol,
            amount: t.amount,
            decimals: t.decimals,
            uiAmount: t.uiAmount,
          })),
        });
        process.exit(ExitCode.SUCCESS);
      }
    }
  }, [json, loading, error, balance, address, network, networkConfig]);

  if (json) return null;

  if (loading) {
    return (
      <Box>
        <Text>Fetching {networkConfig.name} balance...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  if (!balance) {
    return <Text color="red">No result</Text>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {networkConfig.name} Balance
        </Text>
        <Text color="gray"> (Chain ID: {networkConfig.chainId})</Text>
      </Box>

      <Box>
        <Text color="gray">Address: </Text>
        <Text>{truncateAddress(address)}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color="gray">{networkConfig.symbol}: </Text>
          <Text bold color="green">{balance.native.uiAmount.toFixed(6)}</Text>
        </Box>

        {balance.tokens.slice(0, 10).map((token) => {
          const label = token.symbol?.trim() || truncateAddress(token.mint);
          const dp = token.decimals > 8 ? 8 : token.decimals;
          return (
            <Box key={token.mint} marginTop={1}>
              <Text color="gray">{label}: </Text>
              <Text bold>{token.uiAmount.toFixed(dp)}</Text>
            </Box>
          );
        })}
        {balance.tokens.length > 10 && (
          <Box marginTop={1}>
            <Text color="gray">...and {balance.tokens.length - 10} more tokens</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
