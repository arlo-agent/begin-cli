/**
 * Transaction history command - shows recent transactions for an address
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { hasApiKey } from '../../lib/provider.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { ExitCode, errors } from '../../lib/errors.js';
import type { Network } from '../../lib/config.js';
import { getBlockfrostKey } from '../../lib/config.js';

interface TransactionInfo {
  txHash: string;
  blockHeight: number;
  blockTime: number;
  fees: string;
  feesAda: string;
  inputCount: number;
  outputCount: number;
  totalOutput: string;
  totalOutputAda: string;
}

interface HistoryResult {
  transactions: TransactionInfo[];
  hasMore: boolean;
  page: number;
  count: number;
}

interface CardanoHistoryProps {
  address: string;
  network: Network;
  json: boolean;
  limit: number;
  page: number;
}

const BLOCKFROST_URLS: Record<Network, string> = {
  mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
  preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
  preview: 'https://cardano-preview.blockfrost.io/api/v0',
};

interface BlockfrostTxResponse { tx_hash: string; tx_index: number; block_height: number; block_time: number; }
interface BlockfrostTxDetails { hash: string; block_height: number; block_time: number; fees: string; output_amount: { unit: string; quantity: string }[]; utxo_count: number; }

function getApiKey(network: Network): string | undefined {
  const envSuffix = network === 'mainnet' ? '' : `_${network.toUpperCase()}`;
  const networkSpecificKey = process.env[`BLOCKFROST_API_KEY${envSuffix}`];
  if (networkSpecificKey) return networkSpecificKey;
  const genericKey = process.env.BLOCKFROST_API_KEY;
  if (genericKey) return genericKey;
  return getBlockfrostKey(network);
}

async function fetchHistory(address: string, network: Network, limit: number = 10, page: number = 1): Promise<HistoryResult> {
  const apiKey = getApiKey(network);
  const baseUrl = BLOCKFROST_URLS[network];
  if (!apiKey) throw errors.providerError('BLOCKFROST_API_KEY is required');

  const txListResponse = await fetch(`${baseUrl}/addresses/${address}/transactions?count=${limit}&page=${page}&order=desc`, { headers: { project_id: apiKey } });
  if (!txListResponse.ok) {
    if (txListResponse.status === 404) return { transactions: [], hasMore: false, page, count: 0 };
    throw errors.networkError(`Blockfrost API error: ${txListResponse.status} ${txListResponse.statusText}`);
  }
  const txList = (await txListResponse.json()) as BlockfrostTxResponse[];

  const transactions: TransactionInfo[] = await Promise.all(txList.map(async (tx) => {
    const txResponse = await fetch(`${baseUrl}/txs/${tx.tx_hash}`, { headers: { project_id: apiKey } });
    if (!txResponse.ok) return { txHash: tx.tx_hash, blockHeight: tx.block_height, blockTime: tx.block_time, fees: '0', feesAda: '0.000000', inputCount: 0, outputCount: 0, totalOutput: '0', totalOutputAda: '0.000000' };
    const txDetails = (await txResponse.json()) as BlockfrostTxDetails;
    const lovelaceOutput = txDetails.output_amount.find((a) => a.unit === 'lovelace');
    const totalOutput = lovelaceOutput?.quantity || '0';
    const totalOutputAda = (Number(totalOutput) / 1_000_000).toFixed(6);
    const feesAda = (Number(txDetails.fees) / 1_000_000).toFixed(6);
    const utxoResponse = await fetch(`${baseUrl}/txs/${tx.tx_hash}/utxos`, { headers: { project_id: apiKey } });
    let inputCount = 0, outputCount = 0;
    if (utxoResponse.ok) { const utxos = (await utxoResponse.json()) as { inputs: unknown[]; outputs: unknown[] }; inputCount = utxos.inputs?.length || 0; outputCount = utxos.outputs?.length || 0; }
    return { txHash: tx.tx_hash, blockHeight: txDetails.block_height, blockTime: txDetails.block_time, fees: txDetails.fees, feesAda, inputCount, outputCount, totalOutput, totalOutputAda };
  }));
  return { transactions, hasMore: txList.length === limit, page, count: transactions.length };
}

function getMockHistory(): HistoryResult {
  const now = Math.floor(Date.now() / 1000);
  return {
    transactions: [
      { txHash: 'abc123def456789abc123def456789abc123def456789abc123def456789abcd', blockHeight: 9876543, blockTime: now - 3600, fees: '180000', feesAda: '0.180000', inputCount: 2, outputCount: 2, totalOutput: '50000000', totalOutputAda: '50.000000' },
      { txHash: 'def456789abc123def456789abc123def456789abc123def456789abc123defa', blockHeight: 9876500, blockTime: now - 7200, fees: '170000', feesAda: '0.170000', inputCount: 1, outputCount: 3, totalOutput: '125000000', totalOutputAda: '125.000000' },
      { txHash: '789abc123def456789abc123def456789abc123def456789abc123def456789a', blockHeight: 9876400, blockTime: now - 86400, fees: '200000', feesAda: '0.200000', inputCount: 3, outputCount: 2, totalOutput: '10000000', totalOutputAda: '10.000000' },
    ],
    hasMore: true, page: 1, count: 3,
  };
}

function formatTime(timestamp: number): string { return new Date(timestamp * 1000).toLocaleString(); }
function formatRelativeTime(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatTime(timestamp);
}

export function CardanoHistory({ address, network, json, limit, page }: CardanoHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [useMock, setUseMock] = useState(false);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        if (!hasApiKey(network)) {
          if (!json) console.error('\n⚠ No BLOCKFROST_API_KEY set - returning mock data\n');
          setResult(getMockHistory());
          setUseMock(true);
        } else {
          setResult(await fetchHistory(address, network, limit, page));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, [address, network, json, limit, page]);

  useEffect(() => {
    if (json && !loading) {
      if (error) { outputError(error); process.exit(ExitCode.ERROR); }
      else if (result) { outputSuccess({ address, network, page: result.page, count: result.count, hasMore: result.hasMore, transactions: result.transactions, ...(useMock && { mock: true }) }); process.exit(ExitCode.SUCCESS); }
    }
  }, [json, loading, error, result, address, network, useMock]);

  if (json) return null;
  if (loading) return <Box><Text>⏳ Fetching transaction history...</Text></Box>;
  if (error) return <Box flexDirection="column"><Text color="red">Error: {error.message}</Text></Box>;
  if (!result) return <Text color="red">No result</Text>;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}><Text bold color="cyan">Transaction History</Text><Text color="gray"> ({network})</Text>{useMock && <Text color="yellow"> [MOCK]</Text>}</Box>
      <Box><Text color="gray">Address: </Text><Text>{address.slice(0, 20)}...{address.slice(-10)}</Text></Box>
      <Box marginTop={1} marginBottom={1}><Text color="gray">Page </Text><Text bold>{result.page}</Text><Text color="gray"> • Showing </Text><Text bold>{result.count}</Text><Text color="gray"> transactions</Text>{result.hasMore && <Text color="gray"> • More available →</Text>}</Box>
      {result.transactions.length === 0 ? <Box><Text color="gray">No transactions found for this address</Text></Box> : (
        <Box flexDirection="column">
          {result.transactions.map((tx, i) => (
            <Box key={i} flexDirection="column" marginBottom={1} borderStyle="single" borderColor="gray" paddingX={1}>
              <Box><Text bold color="white">Tx #{i + 1}</Text><Text color="gray"> • </Text><Text color="gray">{formatRelativeTime(tx.blockTime)}</Text></Box>
              <Box><Text color="gray">Hash: </Text><Text>{tx.txHash.slice(0, 32)}...</Text></Box>
              <Box><Text color="gray">Block: </Text><Text>{tx.blockHeight.toLocaleString()}</Text><Text color="gray"> • {formatTime(tx.blockTime)}</Text></Box>
              <Box><Text color="gray">Inputs: </Text><Text>{tx.inputCount}</Text><Text color="gray"> → Outputs: </Text><Text>{tx.outputCount}</Text></Box>
              <Box><Text color="gray">Total Output: </Text><Text color="green">{tx.totalOutputAda} ADA</Text></Box>
              <Box><Text color="gray">Fees: </Text><Text color="red">{tx.feesAda} ADA</Text></Box>
            </Box>
          ))}
        </Box>
      )}
      {result.hasMore && <Box marginTop={1}><Text color="gray">Use --page {result.page + 1} to see more transactions</Text></Box>}
    </Box>
  );
}
