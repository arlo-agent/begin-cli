/**
 * Balance command - shows ADA and native token balances
 * Uses @meshsdk/core with BlockfrostProvider
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { createProvider, hasApiKey, type Asset } from '../../lib/provider.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { ExitCode } from '../../lib/errors.js';
import type { Network } from '../../lib/config.js';

interface TokenInfo {
  policyId: string;
  assetName: string;
  assetNameHex: string;
  quantity: string;
  unit: string;
}

interface BalanceInfo {
  lovelace: string;
  ada: string;
  tokens: TokenInfo[];
}

interface CardanoBalanceProps {
  address: string;
  network: Network;
  json: boolean;
}

function parseAssetUnit(unit: string): { policyId: string; assetName: string; assetNameHex: string } {
  const policyId = unit.slice(0, 56);
  const assetNameHex = unit.slice(56);
  let assetName = '';
  if (assetNameHex) {
    try {
      assetName = Buffer.from(assetNameHex, 'hex').toString('utf8');
    } catch {
      assetName = assetNameHex;
    }
  }
  return { policyId, assetName, assetNameHex };
}

async function fetchBalance(address: string, network: Network): Promise<BalanceInfo> {
  const provider = createProvider(network);
  const utxos = await provider.fetchAddressUTxOs(address);

  // Aggregate all amounts across UTXOs
  let totalLovelace = BigInt(0);
  const tokenMap = new Map<string, bigint>();

  for (const utxo of utxos) {
    for (const asset of utxo.output.amount) {
      if (asset.unit === 'lovelace') {
        totalLovelace += BigInt(asset.quantity);
      } else {
        const current = tokenMap.get(asset.unit) || BigInt(0);
        tokenMap.set(asset.unit, current + BigInt(asset.quantity));
      }
    }
  }

  const tokens: TokenInfo[] = [];
  for (const [unit, quantity] of tokenMap) {
    const { policyId, assetName, assetNameHex } = parseAssetUnit(unit);
    tokens.push({
      policyId,
      assetName,
      assetNameHex,
      quantity: quantity.toString(),
      unit,
    });
  }

  // Sort tokens by policy ID then asset name
  tokens.sort((a, b) => {
    if (a.policyId !== b.policyId) return a.policyId.localeCompare(b.policyId);
    return a.assetName.localeCompare(b.assetName);
  });

  return {
    lovelace: totalLovelace.toString(),
    ada: (Number(totalLovelace) / 1_000_000).toFixed(6),
    tokens,
  };
}

function getMockBalance(): BalanceInfo {
  return {
    lovelace: '125430000',
    ada: '125.430000',
    tokens: [
      {
        policyId: 'a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235',
        assetName: 'HOSKY',
        assetNameHex: '484f534b59',
        quantity: '1000000',
        unit: 'a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59',
      },
      {
        policyId: 'b0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235',
        assetName: 'SNEK',
        assetNameHex: '534e454b',
        quantity: '500',
        unit: 'b0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235534e454b',
      },
    ],
  };
}

export function CardanoBalance({ address, network, json }: CardanoBalanceProps) {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [useMock, setUseMock] = useState(false);

  useEffect(() => {
    const loadBalance = async () => {
      try {
        if (!hasApiKey(network)) {
          if (!json) console.error('\n⚠ No BLOCKFROST_API_KEY set - returning mock data\n');
          setBalance(getMockBalance());
          setUseMock(true);
        } else {
          setBalance(await fetchBalance(address, network));
        }
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
          address,
          network,
          lovelace: balance.lovelace,
          ada: balance.ada,
          tokenCount: balance.tokens.length,
          tokens: balance.tokens,
          ...(useMock && { mock: true }),
        });
        process.exit(ExitCode.SUCCESS);
      }
    }
  }, [json, loading, error, balance, address, network, useMock]);

  if (json) return null;
  if (loading) return <Box><Text>⏳ Fetching balance...</Text></Box>;
  if (error) return <Box flexDirection="column"><Text color="red">Error: {error.message}</Text></Box>;
  if (!balance) return <Text color="red">No result</Text>;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Cardano Balance</Text>
        <Text color="gray"> ({network})</Text>
        {useMock && <Text color="yellow"> [MOCK]</Text>}
      </Box>

      <Box>
        <Text color="gray">Address: </Text>
        <Text>{address.slice(0, 20)}...{address.slice(-10)}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Balance: </Text>
        <Text bold color="green">{balance.ada} ADA</Text>
        <Text color="gray"> ({balance.lovelace} lovelace)</Text>
      </Box>

      {balance.tokens.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray" bold>Native Tokens ({balance.tokens.length}):</Text>
          {balance.tokens.slice(0, 10).map((token, i) => (
            <Box key={i} flexDirection="column" paddingLeft={2} marginTop={i === 0 ? 0 : 1}>
              <Box>
                <Text color="yellow">{token.assetName || '(unnamed)'}</Text>
                <Text color="gray">: </Text>
                <Text bold>{token.quantity}</Text>
              </Box>
              <Box paddingLeft={2}>
                <Text color="gray" dimColor>Policy: {token.policyId.slice(0, 16)}...</Text>
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
