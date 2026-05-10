/**
 * UTXO listing command - shows all UTXOs for an address
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { hasApiKey } from "../../lib/provider.js";
import { outputSuccess, outputError } from "../../lib/output.js";
import { ExitCode } from "../../lib/errors.js";
import type { Network } from "../../lib/config.js";
import { getUtxos, type UtxosResult } from "../../core/balance.js";

interface CardanoUtxosProps {
  address: string;
  network: Network;
  json: boolean;
}

export function CardanoUtxos({ address, network, json }: CardanoUtxosProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<UtxosResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadUtxos = async () => {
      try {
        if (!hasApiKey(network)) {
          if (!json) console.error("\n⚠ No BLOCKFROST_API_KEY set - returning mock data\n");
        }
        setResult(await getUtxos(address, network));
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };
    loadUtxos();
  }, [address, network, json]);

  const utxos = result?.utxos ?? [];
  const totalAda = result?.totalAda ?? "0";

  useEffect(() => {
    if (json && !loading) {
      if (error) {
        outputError(error);
        process.exit(ExitCode.ERROR);
      } else if (result) {
        outputSuccess({
          address: result.address,
          network: result.network,
          utxoCount: result.utxoCount,
          totalLovelace: result.totalLovelace,
          totalAda: result.totalAda,
          utxos: result.utxos,
          ...(result.mock && { mock: true }),
        });
        process.exit(ExitCode.SUCCESS);
      }
    }
  }, [json, loading, error, result]);

  if (json) return null;
  if (loading)
    return (
      <Box>
        <Text>⏳ Fetching UTXOs...</Text>
      </Box>
    );
  if (error)
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  if (!result) return <Text color="red">No result</Text>;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          UTXOs
        </Text>
        <Text color="gray"> ({network})</Text>
        {result.mock && <Text color="yellow"> [MOCK]</Text>}
      </Box>
      <Box>
        <Text color="gray">Address: </Text>
        <Text>
          {address.slice(0, 20)}...{address.slice(-10)}
        </Text>
      </Box>
      <Box marginTop={1} marginBottom={1}>
        <Text color="gray">Total: </Text>
        <Text bold color="green">
          {totalAda} ADA
        </Text>
        <Text color="gray"> across </Text>
        <Text bold>{utxos.length}</Text>
        <Text color="gray"> UTXOs</Text>
      </Box>
      {utxos.length === 0 ? (
        <Box>
          <Text color="gray">No UTXOs found for this address</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {utxos.map((utxo, i) => (
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
                  UTXO #{i + 1}
                </Text>
              </Box>
              <Box>
                <Text color="gray">TxHash: </Text>
                <Text>{utxo.txHash.slice(0, 32)}...</Text>
                <Text color="gray">#{utxo.outputIndex}</Text>
              </Box>
              <Box>
                <Text color="gray">Value: </Text>
                <Text color="green">{utxo.ada} ADA</Text>
              </Box>
              {utxo.tokens.length > 0 && (
                <Box flexDirection="column">
                  <Text color="gray">Tokens:</Text>
                  {utxo.tokens.slice(0, 3).map((token, j) => (
                    <Box key={j} paddingLeft={2}>
                      <Text color="yellow">{token.displayLabel}</Text>
                      <Text color="gray">: </Text>
                      <Text>{token.quantityFormatted}</Text>
                    </Box>
                  ))}
                  {utxo.tokens.length > 3 && (
                    <Box paddingLeft={2}>
                      <Text color="gray">...+{utxo.tokens.length - 3} more</Text>
                    </Box>
                  )}
                </Box>
              )}
              {utxo.datumHash && (
                <Box>
                  <Text color="magenta">Has Datum</Text>
                </Box>
              )}
              {utxo.scriptRef && (
                <Box>
                  <Text color="magenta">Has Script Reference</Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
