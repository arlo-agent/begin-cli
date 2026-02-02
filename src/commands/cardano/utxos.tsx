/**
 * UTXO listing command - shows all UTXOs for an address
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { createProvider, hasApiKey, type UTxO, type Asset } from '../../lib/provider.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { ExitCode } from '../../lib/errors.js';
import type { Network } from '../../lib/config.js';

interface UtxoInfo {
  txHash: string;
  outputIndex: number;
  lovelace: string;
  ada: string;
  tokens: { policyId: string; assetName: string; quantity: string; unit: string }[];
  datumHash?: string;
  scriptRef?: boolean;
}

interface CardanoUtxosProps {
  address: string;
  network: Network;
  json: boolean;
}

function parseAssetUnit(unit: string): { policyId: string; assetName: string } {
  const policyId = unit.slice(0, 56);
  const assetNameHex = unit.slice(56);
  let assetName = '';
  if (assetNameHex) {
    try { assetName = Buffer.from(assetNameHex, 'hex').toString('utf8'); } catch { assetName = assetNameHex; }
  }
  return { policyId, assetName };
}

function transformUtxo(utxo: UTxO): UtxoInfo {
  const lovelace = utxo.output.amount.find((a: Asset) => a.unit === 'lovelace');
  const lovelaceStr = lovelace?.quantity || '0';
  const adaStr = (Number(lovelaceStr) / 1_000_000).toFixed(6);
  const tokens = utxo.output.amount.filter((a: Asset) => a.unit !== 'lovelace').map((a: Asset) => ({ ...parseAssetUnit(a.unit), quantity: a.quantity, unit: a.unit }));
  return { txHash: utxo.input.txHash, outputIndex: utxo.input.outputIndex, lovelace: lovelaceStr, ada: adaStr, tokens, datumHash: utxo.output.dataHash || undefined, scriptRef: !!utxo.output.scriptRef };
}

async function fetchUtxos(address: string, network: Network): Promise<UtxoInfo[]> {
  const provider = createProvider(network);
  const utxos = await provider.fetchAddressUTxOs(address);
  return utxos.map(transformUtxo);
}

function getMockUtxos(): UtxoInfo[] {
  return [
    { txHash: 'abc123def456789abc123def456789abc123def456789abc123def456789abcd', outputIndex: 0, lovelace: '50000000', ada: '50.000000', tokens: [{ policyId: 'a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235', assetName: 'HOSKY', quantity: '1000000', unit: 'a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59' }] },
    { txHash: 'def456789abc123def456789abc123def456789abc123def456789abc123defa', outputIndex: 1, lovelace: '75430000', ada: '75.430000', tokens: [] },
    { txHash: '123abc456def789abc123def456789abc123def456789abc123def456789abc1', outputIndex: 0, lovelace: '1500000', ada: '1.500000', tokens: [{ policyId: 'b0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235', assetName: 'SNEK', quantity: '500', unit: 'b0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235534e454b' }] },
  ];
}

export function CardanoUtxos({ address, network, json }: CardanoUtxosProps) {
  const [loading, setLoading] = useState(true);
  const [utxos, setUtxos] = useState<UtxoInfo[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [useMock, setUseMock] = useState(false);

  useEffect(() => {
    const loadUtxos = async () => {
      try {
        if (!hasApiKey(network)) {
          if (!json) console.error('\n⚠ No BLOCKFROST_API_KEY set - returning mock data\n');
          setUtxos(getMockUtxos());
          setUseMock(true);
        } else {
          setUtxos(await fetchUtxos(address, network));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };
    loadUtxos();
  }, [address, network, json]);

  const totalLovelace = utxos.reduce((sum, u) => sum + BigInt(u.lovelace), BigInt(0));
  const totalAda = (Number(totalLovelace) / 1_000_000).toFixed(6);

  useEffect(() => {
    if (json && !loading) {
      if (error) {
        outputError(error);
        process.exit(ExitCode.ERROR);
      } else {
        outputSuccess({ address, network, utxoCount: utxos.length, totalLovelace: totalLovelace.toString(), totalAda, utxos, ...(useMock && { mock: true }) });
        process.exit(ExitCode.SUCCESS);
      }
    }
  }, [json, loading, error, utxos, address, network, totalLovelace, totalAda, useMock]);

  if (json) return null;
  if (loading) return <Box><Text>⏳ Fetching UTXOs...</Text></Box>;
  if (error) return <Box flexDirection="column"><Text color="red">Error: {error.message}</Text></Box>;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}><Text bold color="cyan">UTXOs</Text><Text color="gray"> ({network})</Text>{useMock && <Text color="yellow"> [MOCK]</Text>}</Box>
      <Box><Text color="gray">Address: </Text><Text>{address.slice(0, 20)}...{address.slice(-10)}</Text></Box>
      <Box marginTop={1} marginBottom={1}><Text color="gray">Total: </Text><Text bold color="green">{totalAda} ADA</Text><Text color="gray"> across </Text><Text bold>{utxos.length}</Text><Text color="gray"> UTXOs</Text></Box>
      {utxos.length === 0 ? <Box><Text color="gray">No UTXOs found for this address</Text></Box> : (
        <Box flexDirection="column">
          {utxos.map((utxo, i) => (
            <Box key={i} flexDirection="column" marginBottom={1} borderStyle="single" borderColor="gray" paddingX={1}>
              <Box><Text bold color="white">UTXO #{i + 1}</Text></Box>
              <Box><Text color="gray">TxHash: </Text><Text>{utxo.txHash.slice(0, 32)}...</Text><Text color="gray">#{utxo.outputIndex}</Text></Box>
              <Box><Text color="gray">Value: </Text><Text color="green">{utxo.ada} ADA</Text></Box>
              {utxo.tokens.length > 0 && (
                <Box flexDirection="column">
                  <Text color="gray">Tokens:</Text>
                  {utxo.tokens.slice(0, 3).map((token, j) => <Box key={j} paddingLeft={2}><Text color="yellow">{token.assetName || '(unnamed)'}</Text><Text color="gray">: </Text><Text>{token.quantity}</Text></Box>)}
                  {utxo.tokens.length > 3 && <Box paddingLeft={2}><Text color="gray">...+{utxo.tokens.length - 3} more</Text></Box>}
                </Box>
              )}
              {utxo.datumHash && <Box><Text color="magenta">Has Datum</Text></Box>}
              {utxo.scriptRef && <Box><Text color="magenta">Has Script Reference</Text></Box>}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
