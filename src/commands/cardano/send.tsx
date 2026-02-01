import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import {
  loadWallet,
  buildSendAdaTx,
  buildMultiAssetTx,
  signTransaction,
  submitTransaction,
  waitForConfirmation,
  adaToLovelace,
  lovelaceToAda,
  saveTxToFile,
  parseAssets,
  getWalletAddress,
  type TransactionConfig,
} from '../../lib/transaction.js';

interface CardanoSendProps {
  to: string;
  amount: number;
  network: string;
  walletPath?: string;
  assets?: string[];
  dryRun?: boolean;
  outputFile?: string;
  jsonOutput?: boolean;
}

type SendState = 
  | 'loading'
  | 'confirm'
  | 'building'
  | 'signing'
  | 'submitting'
  | 'confirming'
  | 'success'
  | 'cancelled'
  | 'error';

interface TxInfo {
  fromAddress: string;
  toAddress: string;
  amountAda: number;
  assets: string[];
  estimatedFee: string;
  unsignedTx?: string;
  signedTx?: string;
  txHash?: string;
}

export function CardanoSend({
  to,
  amount,
  network,
  walletPath,
  assets = [],
  dryRun = false,
  outputFile,
  jsonOutput = false,
}: CardanoSendProps) {
  const { exit } = useApp();
  const [state, setState] = useState<SendState>('loading');
  const [txInfo, setTxInfo] = useState<TxInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmationAttempts, setConfirmationAttempts] = useState(0);

  const config: TransactionConfig = { network };

  // Initialize and load wallet
  useEffect(() => {
    const init = async () => {
      try {
        const wallet = await loadWallet(walletPath || '~/.begin/wallet.key', config);
        const fromAddress = await getWalletAddress(wallet);
        
        setTxInfo({
          fromAddress,
          toAddress: to,
          amountAda: amount,
          assets,
          estimatedFee: '~0.17', // Rough estimate before building
        });
        
        setState('confirm');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load wallet');
        setState('error');
      }
    };

    init();
  }, []);

  // Handle keyboard input for confirmation
  useInput((input, key) => {
    if (state !== 'confirm') return;

    if (input === 'y' || input === 'Y') {
      handleSend();
    } else if (input === 'n' || input === 'N' || key.escape) {
      setState('cancelled');
      setTimeout(() => exit(), 500);
    }
  });

  // Handle the send process
  const handleSend = async () => {
    try {
      setState('building');
      
      const wallet = await loadWallet(walletPath || '~/.begin/wallet.key', config);
      
      // Build transaction
      let result;
      if (assets.length > 0) {
        const parsedAssets = parseAssets(assets);
        result = await buildMultiAssetTx(wallet, to, amount, parsedAssets);
      } else {
        result = await buildSendAdaTx(wallet, to, amount);
      }
      
      setTxInfo((prev) => prev ? { ...prev, unsignedTx: result.unsignedTx } : null);

      // If dry run, save and exit
      if (dryRun) {
        const outPath = outputFile || `tx-${Date.now()}.unsigned`;
        saveTxToFile(result.unsignedTx, outPath);
        
        if (jsonOutput) {
          console.log(JSON.stringify({
            status: 'built',
            unsignedTx: outPath,
            network,
          }));
        }
        
        setState('success');
        setTimeout(() => exit(), 1000);
        return;
      }

      // Sign transaction
      setState('signing');
      const signResult = await signTransaction(wallet, result.unsignedTx);
      setTxInfo((prev) => prev ? { 
        ...prev, 
        signedTx: signResult.signedTx,
        txHash: signResult.txHash,
      } : null);

      // Submit transaction
      setState('submitting');
      const submitResult = await submitTransaction(config, signResult.signedTx);
      setTxInfo((prev) => prev ? { ...prev, txHash: submitResult.txHash } : null);

      // Wait for confirmation
      setState('confirming');
      
      // Poll for confirmation with progress updates
      const confirmResult = await waitForConfirmation(config, submitResult.txHash, 60, 5000);
      
      if (confirmResult.confirmed) {
        if (jsonOutput) {
          console.log(JSON.stringify({
            status: 'confirmed',
            txHash: confirmResult.txHash,
            network,
          }));
        }
        setState('success');
      } else {
        setError('Transaction submitted but confirmation timed out. Check tx hash manually.');
        setState('error');
      }
      
      setTimeout(() => exit(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setState('error');
      setTimeout(() => exit(), 2000);
    }
  };

  // Render loading state
  if (state === 'loading') {
    return (
      <Box padding={1}>
        <Text color="cyan">⏳ Loading wallet...</Text>
      </Box>
    );
  }

  // Render error state
  if (state === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ Error: {error}</Text>
        {txInfo?.txHash && (
          <Box marginTop={1}>
            <Text color="gray">TX Hash: </Text>
            <Text>{txInfo.txHash}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Render cancelled state
  if (state === 'cancelled') {
    return (
      <Box padding={1}>
        <Text color="yellow">Transaction cancelled</Text>
      </Box>
    );
  }

  // Render building state
  if (state === 'building') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔨 Building transaction...</Text>
        <Text color="gray">Selecting UTxOs and calculating fees</Text>
      </Box>
    );
  }

  // Render signing state
  if (state === 'signing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔐 Signing transaction...</Text>
      </Box>
    );
  }

  // Render submitting state
  if (state === 'submitting') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">📤 Submitting transaction to {network}...</Text>
      </Box>
    );
  }

  // Render confirming state
  if (state === 'confirming') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Waiting for confirmation...</Text>
        {txInfo?.txHash && (
          <Box marginTop={1}>
            <Text color="gray">TX Hash: </Text>
            <Text>{txInfo.txHash}</Text>
          </Box>
        )}
        <Text color="gray">This may take a few minutes</Text>
      </Box>
    );
  }

  // Render success state
  if (state === 'success') {
    if (dryRun) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="green">✓ Transaction built successfully (dry run)</Text>
          <Box marginTop={1}>
            <Text color="gray">Unsigned TX saved to: </Text>
            <Text>{outputFile || `tx-${Date.now()}.unsigned`}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">
              Sign with: begin sign {'<tx-file>'} --wallet {'<wallet-path>'}
            </Text>
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">✓ Transaction confirmed!</Text>
        <Box marginTop={1}>
          <Text color="gray">TX Hash: </Text>
          <Text>{txInfo?.txHash}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">View on: </Text>
          <Text color="blue">
            https://{network === 'mainnet' ? '' : network + '.'}cardanoscan.io/transaction/{txInfo?.txHash}
          </Text>
        </Box>
      </Box>
    );
  }

  // Render confirmation prompt
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Send ADA</Text>
        <Text color="gray"> ({network})</Text>
        {dryRun && <Text color="yellow"> [DRY RUN]</Text>}
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        <Box>
          <Text color="gray">From:   </Text>
          <Text>{txInfo?.fromAddress.slice(0, 30)}...{txInfo?.fromAddress.slice(-10)}</Text>
        </Box>
        <Box>
          <Text color="gray">To:     </Text>
          <Text>{to.slice(0, 30)}...{to.slice(-10)}</Text>
        </Box>
        <Box>
          <Text color="gray">Amount: </Text>
          <Text bold color="green">{amount} ADA</Text>
          <Text color="gray"> ({adaToLovelace(amount)} lovelace)</Text>
        </Box>
        
        {assets.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="gray">Assets:</Text>
            {assets.map((asset, i) => (
              <Box key={i} paddingLeft={2}>
                <Text color="yellow">• {asset}</Text>
              </Box>
            ))}
          </Box>
        )}
        
        <Box marginTop={1}>
          <Text color="gray">Fee:    </Text>
          <Text color="yellow">{txInfo?.estimatedFee} ADA</Text>
          <Text color="gray"> (estimated)</Text>
        </Box>
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
