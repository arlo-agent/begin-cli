/**
 * Core transaction history logic
 *
 * Pure functions for fetching transaction history.
 */

import { hasApiKey } from '../lib/provider.js';
import { getBlockfrostKey, type Network } from '../lib/config.js';
import { errors } from '../lib/errors.js';

export interface TransactionInfo {
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

export interface HistoryResult {
  address: string;
  network: Network;
  page: number;
  count: number;
  hasMore: boolean;
  transactions: TransactionInfo[];
  mock?: boolean;
}

interface BlockfrostTxResponse {
  tx_hash: string;
  tx_index: number;
  block_height: number;
  block_time: number;
}

interface BlockfrostTxDetails {
  hash: string;
  block_height: number;
  block_time: number;
  fees: string;
  output_amount: { unit: string; quantity: string }[];
  utxo_count: number;
}

const BLOCKFROST_URLS: Record<Network, string> = {
  mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
  preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
  preview: 'https://cardano-preview.blockfrost.io/api/v0',
};

function getApiKey(network: Network): string | undefined {
  const envSuffix = network === 'mainnet' ? '' : `_${network.toUpperCase()}`;
  const networkSpecificKey = process.env[`BLOCKFROST_API_KEY${envSuffix}`];
  if (networkSpecificKey) return networkSpecificKey;
  const genericKey = process.env.BLOCKFROST_API_KEY;
  if (genericKey) return genericKey;
  return getBlockfrostKey(network);
}

function getMockHistory(address: string, network: Network): HistoryResult {
  const now = Math.floor(Date.now() / 1000);
  return {
    address,
    network,
    page: 1,
    count: 3,
    hasMore: true,
    transactions: [
      {
        txHash: 'abc123def456789abc123def456789abc123def456789abc123def456789abcd',
        blockHeight: 9876543,
        blockTime: now - 3600,
        fees: '180000',
        feesAda: '0.180000',
        inputCount: 2,
        outputCount: 2,
        totalOutput: '50000000',
        totalOutputAda: '50.000000',
      },
      {
        txHash: 'def456789abc123def456789abc123def456789abc123def456789abc123defa',
        blockHeight: 9876500,
        blockTime: now - 7200,
        fees: '170000',
        feesAda: '0.170000',
        inputCount: 1,
        outputCount: 3,
        totalOutput: '125000000',
        totalOutputAda: '125.000000',
      },
      {
        txHash: '789abc123def456789abc123def456789abc123def456789abc123def456789a',
        blockHeight: 9876400,
        blockTime: now - 86400,
        fees: '200000',
        feesAda: '0.200000',
        inputCount: 3,
        outputCount: 2,
        totalOutput: '10000000',
        totalOutputAda: '10.000000',
      },
    ],
    mock: true,
  };
}

/**
 * Fetch transaction history for a Cardano address
 */
export async function getHistory(
  address: string,
  network: Network,
  limit: number = 10,
  page: number = 1
): Promise<HistoryResult> {
  if (!hasApiKey(network)) {
    return getMockHistory(address, network);
  }

  const apiKey = getApiKey(network);
  const baseUrl = BLOCKFROST_URLS[network];
  if (!apiKey) {
    throw errors.providerError('BLOCKFROST_API_KEY is required');
  }

  const txListResponse = await fetch(
    `${baseUrl}/addresses/${address}/transactions?count=${limit}&page=${page}&order=desc`,
    { headers: { project_id: apiKey } }
  );

  if (!txListResponse.ok) {
    if (txListResponse.status === 404) {
      return {
        address,
        network,
        page,
        count: 0,
        hasMore: false,
        transactions: [],
      };
    }
    throw errors.networkError(
      `Blockfrost API error: ${txListResponse.status} ${txListResponse.statusText}`
    );
  }

  const txList = (await txListResponse.json()) as BlockfrostTxResponse[];

  const transactions: TransactionInfo[] = await Promise.all(
    txList.map(async (tx) => {
      const txResponse = await fetch(`${baseUrl}/txs/${tx.tx_hash}`, {
        headers: { project_id: apiKey },
      });

      if (!txResponse.ok) {
        return {
          txHash: tx.tx_hash,
          blockHeight: tx.block_height,
          blockTime: tx.block_time,
          fees: '0',
          feesAda: '0.000000',
          inputCount: 0,
          outputCount: 0,
          totalOutput: '0',
          totalOutputAda: '0.000000',
        };
      }

      const txDetails = (await txResponse.json()) as BlockfrostTxDetails;
      const lovelaceOutput = txDetails.output_amount.find((a) => a.unit === 'lovelace');
      const totalOutput = lovelaceOutput?.quantity || '0';
      const totalOutputAda = (Number(totalOutput) / 1_000_000).toFixed(6);
      const feesAda = (Number(txDetails.fees) / 1_000_000).toFixed(6);

      const utxoResponse = await fetch(`${baseUrl}/txs/${tx.tx_hash}/utxos`, {
        headers: { project_id: apiKey },
      });

      let inputCount = 0;
      let outputCount = 0;
      if (utxoResponse.ok) {
        const utxos = (await utxoResponse.json()) as { inputs: unknown[]; outputs: unknown[] };
        inputCount = utxos.inputs?.length || 0;
        outputCount = utxos.outputs?.length || 0;
      }

      return {
        txHash: tx.tx_hash,
        blockHeight: txDetails.block_height,
        blockTime: txDetails.block_time,
        fees: txDetails.fees,
        feesAda,
        inputCount,
        outputCount,
        totalOutput,
        totalOutputAda,
      };
    })
  );

  return {
    address,
    network,
    page,
    count: transactions.length,
    hasMore: txList.length === limit,
    transactions,
  };
}
