/**
 * Bitcoin Balance command - shows BTC balance
 */

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { createBitcoinAdapter, type BitcoinNetwork } from "../../lib/chains/index.js";
import type { ChainBalance } from "../../lib/chains/types.js";
import { outputSuccess, outputError, truncateAddress } from "../../lib/output.js";
import { ExitCode, getErrorMessage } from "../../lib/errors.js";

interface BitcoinBalanceProps {
  address: string;
  network: BitcoinNetwork;
  json: boolean;
}

export function BitcoinBalance({ address, network, json }: BitcoinBalanceProps) {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<ChainBalance | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadBalance = async () => {
      try {
        const adapter = createBitcoinAdapter(network);

        if (!adapter.validateAddress(address)) {
          throw new Error("Invalid Bitcoin address");
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
          satoshis: balance.native.amount,
          btc: balance.native.uiAmount.toFixed(8),
        });
        process.exit(ExitCode.SUCCESS);
      }
    }
  }, [json, loading, error, balance, address, network]);

  if (json) return null;

  if (loading) {
    return (
      <Box>
        <Text>Fetching Bitcoin balance...</Text>
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
          Bitcoin Balance
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
          {balance.native.uiAmount.toFixed(8)} BTC
        </Text>
        <Text color="gray"> ({balance.native.amount} satoshis)</Text>
      </Box>
    </Box>
  );
}
