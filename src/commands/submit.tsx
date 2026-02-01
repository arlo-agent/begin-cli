import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import {
  submitTransactionFromFile,
  waitForConfirmation,
  loadTxFromFile,
  type TransactionConfig,
} from '../lib/transaction.js';

interface SubmitProps {
  txFile: string;
  network: string;
  wait?: boolean;
  jsonOutput?: boolean;
}

type SubmitState = 
  | 'loading'
  | 'submitting'
  | 'confirming'
  | 'success'
  | 'error';

interface SubmitInfo {
  txHash: string;
  confirmed: boolean;
  confirmations?: number;
}

export function Submit({
  txFile,
  network,
  wait = true,
  jsonOutput = false,
}: SubmitProps) {
  const { exit } = useApp();
  const [state, setState] = useState<SubmitState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<SubmitInfo | null>(null);
  const [attempts, setAttempts] = useState(0);

  const config: TransactionConfig = { network };

  useEffect(() => {
    const submit = async () => {
      try {
        // Verify file exists
        loadTxFromFile(txFile);
        
        setState('submitting');
        
        // Submit transaction
        const submitResult = await submitTransactionFromFile(config, txFile);
        
        setInfo({
          txHash: submitResult.txHash,
          confirmed: false,
        });

        // If not waiting for confirmation
        if (!wait) {
          if (jsonOutput) {
            console.log(JSON.stringify({
              status: 'submitted',
              txHash: submitResult.txHash,
              network,
              confirmed: false,
            }));
          }
          setState('success');
          setTimeout(() => exit(), 1000);
          return;
        }

        // Wait for confirmation
        setState('confirming');
        
        // Custom confirmation loop for progress updates
        const maxAttempts = 60;
        const intervalMs = 5000;
        
        for (let i = 0; i < maxAttempts; i++) {
          setAttempts(i + 1);
          
          const confirmResult = await waitForConfirmation(
            config,
            submitResult.txHash,
            1, // Single attempt
            0  // No delay (we handle it)
          );
          
          if (confirmResult.confirmed) {
            setInfo({
              txHash: submitResult.txHash,
              confirmed: true,
              confirmations: confirmResult.confirmations,
            });
            
            if (jsonOutput) {
              console.log(JSON.stringify({
                status: 'confirmed',
                txHash: submitResult.txHash,
                network,
                confirmed: true,
              }));
            }
            
            setState('success');
            setTimeout(() => exit(), 1000);
            return;
          }
          
          // Wait before next attempt
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        
        // Timed out waiting for confirmation
        setInfo({
          txHash: submitResult.txHash,
          confirmed: false,
        });
        
        if (jsonOutput) {
          console.log(JSON.stringify({
            status: 'submitted',
            txHash: submitResult.txHash,
            network,
            confirmed: false,
            note: 'Confirmation timed out, check tx hash manually',
          }));
        }
        
        setState('success');
        setTimeout(() => exit(), 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Submission failed');
        setState('error');
        setTimeout(() => exit(), 1500);
      }
    };

    submit();
  }, []);

  if (state === 'loading') {
    return (
      <Box padding={1}>
        <Text color="cyan">⏳ Loading signed transaction...</Text>
      </Box>
    );
  }

  if (state === 'submitting') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">📤 Submitting transaction to {network}...</Text>
      </Box>
    );
  }

  if (state === 'confirming') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Waiting for confirmation... (attempt {attempts}/60)</Text>
        {info?.txHash && (
          <Box marginTop={1}>
            <Text color="gray">TX Hash: </Text>
            <Text>{info.txHash}</Text>
          </Box>
        )}
        <Text color="gray">This may take a few minutes (checking every 5s)</Text>
      </Box>
    );
  }

  if (state === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ Error: {error}</Text>
        {info?.txHash && (
          <Box marginTop={1}>
            <Text color="gray">TX Hash: </Text>
            <Text>{info.txHash}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Success state
  return (
    <Box flexDirection="column" padding={1}>
      {info?.confirmed ? (
        <Text color="green">✓ Transaction confirmed!</Text>
      ) : (
        <Text color="yellow">✓ Transaction submitted (confirmation pending)</Text>
      )}
      
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color="gray">TX Hash: </Text>
          <Text>{info?.txHash}</Text>
        </Box>
        <Box>
          <Text color="gray">Network: </Text>
          <Text>{network}</Text>
        </Box>
        {info?.confirmed && (
          <Box>
            <Text color="gray">Status:  </Text>
            <Text color="green">Confirmed</Text>
          </Box>
        )}
      </Box>
      
      <Box marginTop={1}>
        <Text color="gray">View on: </Text>
        <Text color="blue">
          https://{network === 'mainnet' ? '' : network + '.'}cardanoscan.io/transaction/{info?.txHash}
        </Text>
      </Box>
    </Box>
  );
}
