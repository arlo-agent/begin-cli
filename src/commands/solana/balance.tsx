/**
 * Solana Balance command - shows SOL and SPL token balances
 */

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { createSolanaAdapter, type SolanaNetwork } from "../../lib/chains/index.js";
import type { ChainBalance } from "../../lib/chains/types.js";
import { outputSuccess, outputError, truncateAddress } from "../../lib/output.js";
import { ExitCode, getErrorMessage } from "../../lib/errors.js";

interface SolanaBalanceProps {
  address: string;
  network: SolanaNetwork;
  json: boolean;
}

export function SolanaBalance({ address, network, json }: SolanaBalanceProps) {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<ChainBalance | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadBalance = async () => {
      try {
        const adapter = createSolanaAdapter(network);

        if (!adapter.validateAddress(address)) {
          throw new Error("Invalid Solana address");
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
          lamports: balance.native.amount,
          sol: balance.native.uiAmount.toFixed(9),
          tokenCount: balance.tokens.length,
          tokens: balance.tokens.map((t) => ({
            mint: t.mint,
            symbol: t.symbol,
            amount: t.amount,
            decimals: t.decimals,
            uiAmount: t.uiAmount,
          })),
        });
        process.exit(ExitCode.SUCCESS);
      }
    }
  }, [json, loading, error, balance, address, network]);

  if (json) return null;

  if (loading) {
    return (
      <Box>
        <Text>Fetching Solana balance...</Text>
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
          Solana Balance
        </Text>
        <Text color="gray"> ({network})</Text>
      </Box>

      <Box>
        <Text color="gray">Address: </Text>
        <Text>{truncateAddress(address)}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Balance: </Text>
        <Text bold color="green">
          {balance.native.uiAmount.toFixed(9)} SOL
        </Text>
        <Text color="gray"> ({balance.native.amount} lamports)</Text>
      </Box>

      {balance.tokens.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray" bold>
            SPL Tokens ({balance.tokens.length}):
          </Text>
          {balance.tokens.slice(0, 10).map((token, i) => (
            <Box key={i} flexDirection="column" paddingLeft={2} marginTop={i === 0 ? 0 : 1}>
              <Box>
                <Text color="yellow">{token.symbol || truncateAddress(token.mint)}</Text>
                <Text color="gray">: </Text>
                <Text bold>{token.uiAmount.toFixed(token.decimals)}</Text>
              </Box>
              <Box paddingLeft={2}>
                <Text color="gray" dimColor>
                  Mint: {token.mint.slice(0, 16)}...
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
