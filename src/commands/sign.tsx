import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import {
  loadWallet,
  signTransactionFromFile,
  saveTxToFile,
  loadTxFromFile,
  checkWalletAvailability,
  type TransactionConfig,
} from '../lib/transaction.js';

interface SignProps {
  txFile: string;
  walletName?: string;
  password?: string;
  network: string;
  outputFile?: string;
  jsonOutput?: boolean;
}

type SignState = 'checking' | 'password' | 'signing' | 'success' | 'error';

export function Sign({
  txFile,
  walletName,
  password: initialPassword,
  network,
  outputFile,
  jsonOutput = false,
}: SignProps) {
  const { exit } = useApp();
  const [state, setState] = useState<SignState>('checking');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState(initialPassword || '');
  const [walletInfo, setWalletInfo] = useState<{
    source: 'env' | 'wallet';
    walletName?: string;
    needsPassword: boolean;
  } | null>(null);
  const [result, setResult] = useState<{
    txHash: string;
    outputPath: string;
  } | null>(null);

  const config: TransactionConfig = { network };

  // Check wallet availability on mount
  useEffect(() => {
    try {
      // Verify tx file exists first
      loadTxFromFile(txFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transaction file');
      setState('error');
      setTimeout(() => exit(), 1500);
      return;
    }

    const availability = checkWalletAvailability(walletName);
    
    if (!availability.available) {
      setError(availability.error || 'No wallet available');
      setState('error');
      setTimeout(() => exit(), 1500);
      return;
    }

    setWalletInfo({
      source: availability.source!,
      walletName: availability.walletName,
      needsPassword: availability.needsPassword,
    });

    // If using env var or password already provided, proceed to signing
    if (!availability.needsPassword || initialPassword) {
      doSign(initialPassword);
    } else {
      setState('password');
    }
  }, []);

  // Handle password submission
  const handlePasswordSubmit = () => {
    if (password.trim()) {
      doSign(password);
    }
  };

  // Perform the signing
  const doSign = async (pwd?: string) => {
    try {
      setState('signing');
      
      // Load wallet from keystore
      const wallet = await loadWallet(
        {
          walletName: walletInfo?.walletName || walletName,
          password: pwd,
        },
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
      const message = err instanceof Error ? err.message : 'Signing failed';
      // Make password errors more user-friendly
      if (message.includes('Incorrect password')) {
        setError('Incorrect password. Please try again.');
      } else {
        setError(message);
      }
      setState('error');
      setTimeout(() => exit(), 1500);
    }
  };

  if (state === 'checking') {
    return (
      <Box padding={1}>
        <Text color="cyan">⏳ Checking wallet...</Text>
      </Box>
    );
  }

  if (state === 'password') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan">🔐 Enter password for wallet </Text>
          <Text bold color="yellow">{walletInfo?.walletName}</Text>
        </Box>
        <Box>
          <Text color="gray">Password: </Text>
          <TextInput
            value={password}
            onChange={setPassword}
            onSubmit={handlePasswordSubmit}
            mask="*"
          />
        </Box>
      </Box>
    );
  }

  if (state === 'signing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔐 Signing transaction...</Text>
        {walletInfo?.source === 'wallet' && (
          <Text color="gray">Using wallet: {walletInfo.walletName}</Text>
        )}
        {walletInfo?.source === 'env' && (
          <Text color="gray">Using environment variable</Text>
        )}
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
