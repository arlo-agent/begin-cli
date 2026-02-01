import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { outputSuccess, outputError } from '../../lib/output.js';
import { UserError, ErrorCode } from '../../lib/errors.js';

interface CardanoSendProps {
  to: string;
  amount: number;
  network: string;
  json?: boolean;
}

type SendState = 'confirm' | 'sending' | 'success' | 'cancelled';

export function CardanoSend({ to, amount, network, json = false }: CardanoSendProps) {
  const { exit } = useApp();
  const [state, setState] = useState<SendState>(json ? 'sending' : 'confirm');

  // In JSON mode, auto-proceed (skip interactive confirmation)
  useEffect(() => {
    if (json && state === 'sending') {
      // Simulate sending (mock for now)
      setTimeout(() => {
        const mockTxHash = `mock_tx_${Date.now().toString(16)}`;
        outputSuccess({
          txHash: mockTxHash,
          to,
          amount,
          network,
          status: 'submitted',
          note: 'This is a mock transaction',
        }, { json: true });
      }, 100);
    }
  }, [json, state, to, amount, network]);

  useInput((input, key) => {
    if (json) return; // Skip input handling in JSON mode
    if (state !== 'confirm') return;

    if (input === 'y' || input === 'Y') {
      setState('sending');
      // Simulate sending (mock for now)
      setTimeout(() => {
        setState('success');
        // Exit after showing success
        setTimeout(() => exit(), 1500);
      }, 2000);
    } else if (input === 'n' || input === 'N' || key.escape) {
      setState('cancelled');
      setTimeout(() => exit(), 500);
    }
  });

  // JSON mode returns nothing (exits via outputSuccess)
  if (json) {
    return null;
  }

  if (state === 'cancelled') {
    return (
      <Box>
        <Text color="yellow">Transaction cancelled</Text>
      </Box>
    );
  }

  if (state === 'sending') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Sending transaction...</Text>
        <Text color="gray">(This is a mock - no actual transaction is being sent)</Text>
      </Box>
    );
  }

  if (state === 'success') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">✓ Transaction submitted successfully!</Text>
        <Box marginTop={1}>
          <Text color="gray">TX Hash: </Text>
          <Text>mock_tx_hash_abc123def456...</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Note: This is a mock transaction. Real sending will be implemented with wallet integration.</Text>
        </Box>
      </Box>
    );
  }

  // Confirm state
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Send ADA</Text>
        <Text color="gray"> ({network})</Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        <Box>
          <Text color="gray">To:     </Text>
          <Text>{to.slice(0, 30)}...{to.slice(-10)}</Text>
        </Box>
        <Box>
          <Text color="gray">Amount: </Text>
          <Text bold color="green">{amount} ADA</Text>
        </Box>
        <Box>
          <Text color="gray">Fee:    </Text>
          <Text color="yellow">~0.17 ADA</Text>
          <Text color="gray"> (estimated)</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="yellow">⚠ This is a MOCK transaction - no real ADA will be sent</Text>
      </Box>

      <Box marginTop={1}>
        <Text>Confirm send? </Text>
        <Text color="green">[Y]es</Text>
        <Text> / </Text>
        <Text color="red">[N]o</Text>
      </Box>
    </Box>
  );
}
