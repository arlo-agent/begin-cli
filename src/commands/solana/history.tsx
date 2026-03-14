/**
 * Solana Transaction History command
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { createSolanaAdapter, type SolanaNetwork } from "../../lib/chains/index.js";
import type { ChainTransaction } from "../../lib/chains/types.js";
import { outputSuccess, outputError, truncateAddress } from "../../lib/output.js";
import { ExitCode, getErrorMessage } from "../../lib/errors.js";

interface SolanaHistoryProps {
  address: string;
  network: SolanaNetwork;
  json: boolean;
  limit: number;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

function formatRelativeTime(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatTime(timestamp);
}

export function SolanaHistory({ address, network, json, limit }: SolanaHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<ChainTransaction[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const adapter = createSolanaAdapter(network);

        if (!adapter.validateAddress(address)) {
          throw new Error("Invalid Solana address");
        }

        const result = await adapter.getTransactions(address, limit);
        setTransactions(result);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(getErrorMessage(err)));
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, [address, network, limit]);

  // Handle JSON output
  useEffect(() => {
    if (json && !loading) {
      if (error) {
        outputError(error);
        process.exit(ExitCode.ERROR);
      } else {
        outputSuccess({
          address,
          network,
          count: transactions.length,
          transactions: transactions.map((tx) => ({
            hash: tx.hash,
            blockNumber: tx.blockNumber,
            blockTime: tx.blockTime,
            from: tx.from,
            to: tx.to,
            amount: tx.amount,
            fee: tx.fee,
            status: tx.status,
            type: tx.type,
          })),
        });
        process.exit(ExitCode.SUCCESS);
      }
    }
  }, [json, loading, error, transactions, address, network]);

  if (json) return null;

  if (loading) {
    return (
      <Box>
        <Text>Fetching Solana transaction history...</Text>
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

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Solana Transaction History
        </Text>
        <Text color="gray"> ({network})</Text>
      </Box>

      <Box>
        <Text color="gray">Address: </Text>
        <Text>{truncateAddress(address)}</Text>
      </Box>

      <Box marginTop={1} marginBottom={1}>
        <Text color="gray">Showing </Text>
        <Text bold>{transactions.length}</Text>
        <Text color="gray"> transactions</Text>
      </Box>

      {transactions.length === 0 ? (
        <Box>
          <Text color="gray">No transactions found for this address</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {transactions.map((tx, i) => (
            <Box
              key={i}
              flexDirection="column"
              marginBottom={1}
              borderStyle="single"
              borderColor="gray"
              paddingX={1}
            >
              <Box>
                <Text bold color="white">
                  Tx #{i + 1}
                </Text>
                <Text color="gray"> • </Text>
                <Text color="gray">
                  {tx.blockTime ? formatRelativeTime(tx.blockTime) : "Unknown time"}
                </Text>
                <Text color="gray"> • </Text>
                <Text color={tx.status === "confirmed" ? "green" : tx.status === "failed" ? "red" : "yellow"}>
                  {tx.status}
                </Text>
              </Box>

              <Box>
                <Text color="gray">Signature: </Text>
                <Text>{tx.hash.slice(0, 32)}...</Text>
              </Box>

              {tx.blockNumber && (
                <Box>
                  <Text color="gray">Slot: </Text>
                  <Text>{tx.blockNumber.toLocaleString()}</Text>
                  {tx.blockTime && <Text color="gray"> • {formatTime(tx.blockTime)}</Text>}
                </Box>
              )}

              {tx.type && tx.type !== "unknown" && (
                <Box>
                  <Text color="gray">Type: </Text>
                  <Text color={tx.type === "send" ? "red" : tx.type === "receive" ? "green" : "yellow"}>
                    {tx.type.toUpperCase()}
                  </Text>
                </Box>
              )}

              {tx.from && tx.to && (
                <Box>
                  <Text color="gray">From: </Text>
                  <Text>{truncateAddress(tx.from)}</Text>
                  <Text color="gray"> → </Text>
                  <Text>{truncateAddress(tx.to)}</Text>
                </Box>
              )}

              {tx.amount && (
                <Box>
                  <Text color="gray">Amount: </Text>
                  <Text color="green">{tx.amount} SOL</Text>
                </Box>
              )}

              {tx.fee && (
                <Box>
                  <Text color="gray">Fee: </Text>
                  <Text color="red">{tx.fee} SOL</Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
