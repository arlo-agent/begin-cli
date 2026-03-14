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

      <Box marginTop={1}>
        <Text color="gray">Balance: </Text>
        <Text bold color="green">
          {balance.native.uiAmount.toFixed(6)} {networkConfig.symbol}
        </Text>
      </Box>

      {balance.tokens.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray" bold>
            ERC-20 Tokens ({balance.tokens.length}):
          </Text>
          {balance.tokens.slice(0, 10).map((token, i) => (
            <Box key={i} flexDirection="column" paddingLeft={2} marginTop={i === 0 ? 0 : 1}>
              <Box>
                <Text color="yellow">{token.symbol || truncateAddress(token.mint)}</Text>
                <Text color="gray">: </Text>
                <Text bold>{token.uiAmount.toFixed(token.decimals > 6 ? 6 : token.decimals)}</Text>
              </Box>
              <Box paddingLeft={2}>
                <Text color="gray" dimColor>
                  Contract: {token.mint.slice(0, 16)}...
                </Text>
              </Box>
            </Box>
          ))}
          {balance.tokens.length > 10 && (
            <Box paddingLeft={2} marginTop={1}>
              <Text color="gray">...and {balance.tokens.length - 10} more tokens</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
