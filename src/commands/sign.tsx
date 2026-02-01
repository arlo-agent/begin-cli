import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import {
  loadWallet,
  signTransactionFromFile,
  saveTxToFile,
  loadTxFromFile,
  type TransactionConfig,
} from '../lib/transaction.js';

interface SignProps {
  txFile: string;
  walletPath?: string;
  network: string;
  outputFile?: string;
  jsonOutput?: boolean;
}

type SignState = 'loading' | 'signing' | 'success' | 'error';

export function Sign({
  txFile,
  walletPath,
  network,
  outputFile,
  jsonOutput = false,
}: SignProps) {
  const { exit } = useApp();
  const [state, setState] = useState<SignState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    txHash: string;
    outputPath: string;
  } | null>(null);

  const config: TransactionConfig = { network };

  useEffect(() => {
    const sign = async () => {
      try {
        // Verify tx file exists
        loadTxFromFile(txFile);
        
        setState('signing');
        
        // Load wallet and sign
        const wallet = await loadWallet(
          walletPath || '~/.begin/wallet.key',
          config
        );
        
        const signResult = await signTransactionFromFile(wallet, txFile);
        
        // Determine output file path
        const outPath = outputFile || txFile.replace(/\.unsigned$/, '') + '.signed';
        
        // Save signed transaction
        saveTxToFile(signResult.signedTx, outPath);
        
        setResult({
          txHash: signResult.txHash,
          outputPath: outPath,
        });
        
        if (jsonOutput) {
          console.log(JSON.stringify({
            status: 'signed',
            txHash: signResult.txHash,
            signedTx: outPath,
            network,
          }));
        }
        
        setState('success');
        setTimeout(() => exit(), 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Signing failed');
        setState('error');
        setTimeout(() => exit(), 1500);
      }
    };

    sign();
  }, []);

  if (state === 'loading') {
    return (
      <Box padding={1}>
        <Text color="cyan">⏳ Loading transaction file...</Text>
      </Box>
    );
  }

  if (state === 'signing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔐 Signing transaction...</Text>
        <Text color="gray">Using wallet: {walletPath || '~/.begin/wallet.key'}</Text>
      </Box>
    );
  }

  if (state === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ Error: {error}</Text>
      </Box>
    );
  }

  // Success state
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="green">✓ Transaction signed successfully!</Text>
      
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color="gray">TX Hash:    </Text>
          <Text>{result?.txHash}</Text>
        </Box>
        <Box>
          <Text color="gray">Signed TX:  </Text>
          <Text>{result?.outputPath}</Text>
        </Box>
      </Box>
      
      <Box marginTop={1}>
        <Text color="gray">
          Submit with: begin submit {result?.outputPath} --network {network}
        </Text>
      </Box>
    </Box>
  );
}
