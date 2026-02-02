import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import {
  loadWallet,
  buildSendAdaTx,
  buildMultiAssetTx,
  signTransaction,
  submitTransaction,
  waitForConfirmation,
  adaToLovelace,
  saveTxToFile,
  parseAssets,
  getWalletAddress,
  checkWalletAvailability,
  type TransactionConfig,
} from '../../lib/transaction.js';
import { outputSuccess, exitWithError } from '../../lib/output.js';
import { ExitCode, errors } from '../../lib/errors.js';

interface CardanoSendProps {
  to: string;
  amount: number;
  network: string;
  walletName?: string;
  password?: string;
  assets?: string[];
  dryRun?: boolean;
  outputFile?: string;
  jsonOutput?: boolean;
}

type SendState =
  | 'checking'
  | 'password'
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
  unsignedTxPath?: string;
  signedTx?: string;
  txHash?: string;
}

interface WalletInfo {
  source: 'env' | 'wallet';
  walletName?: string;
  needsPassword: boolean;
}

export function CardanoSend({
  to,
  amount,
  network,
  walletName,
  password: initialPassword,
  assets = [],
  dryRun = false,
  outputFile,
  jsonOutput = false,
}: CardanoSendProps) {
  const { exit } = useApp();
  const [state, setState] = useState<SendState>('checking');
  const [txInfo, setTxInfo] = useState<TxInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState(initialPassword || '');
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);

  const config: TransactionConfig = { network };

  const initWallet = async (pwd?: string, wName?: string) => {
    try {
      setState('loading');

      const wallet = await loadWallet({ walletName: wName, password: pwd }, config);
      const fromAddress = await getWalletAddress(wallet);

      setTxInfo({
        fromAddress,
        toAddress: to,
        amountAda: amount,
        assets,
        estimatedFee: '~0.17', // rough estimate before building
      });

      setState('confirm');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load wallet';
      setError(message.includes('Incorrect password') ? 'Incorrect password. Please try again.' : message);
      setState('error');
      if (jsonOutput) exitWithError(err);
      setTimeout(() => exit(), 2000);
    }
  };

  // Check wallet availability on mount
  useEffect(() => {
    const availability = checkWalletAvailability(walletName);

    if (!availability.available) {
      const msg = availability.error || 'No wallet available';
      setError(msg);
      setState('error');
      if (jsonOutput) exitWithError(errors.walletError(msg));
      setTimeout(() => exit(), 2000);
      return;
    }

    setWalletInfo({
      source: availability.source!,
      walletName: availability.walletName,
      needsPassword: availability.needsPassword,
    });

    if (!availability.needsPassword || initialPassword) {
      initWallet(initialPassword, availability.walletName);
      return;
    }

    if (jsonOutput) {
      setError('Password required (pass --password or use BEGIN_CLI_MNEMONIC)');
      setState('error');
      exitWithError(errors.missingArgument('password'));
      return;
    }

    setState('password');
  }, []);

  const handlePasswordSubmit = () => {
    if (password.trim()) {
      initWallet(password, walletInfo?.walletName);
    }
  };

  const handleSend = async () => {
    try {
      setState('building');

      const wallet = await loadWallet(
        { walletName: walletInfo?.walletName, password: password || initialPassword },
        config
      );

      // Build transaction
      const result =
        assets.length > 0
          ? await buildMultiAssetTx(wallet, to, amount, parseAssets(assets))
          : await buildSendAdaTx(wallet, to, amount);

      setTxInfo((prev) => (prev ? { ...prev, unsignedTx: result.unsignedTx } : null));

      // Dry-run: save unsigned tx and exit
      if (dryRun) {
        const outPath = outputFile || `tx-${Date.now()}.unsigned`;
        saveTxToFile(result.unsignedTx, outPath);
        setTxInfo((prev) => (prev ? { ...prev, unsignedTxPath: outPath } : null));

        if (jsonOutput) {
          outputSuccess({ status: 'built', unsignedTx: outPath, network });
          process.exit(ExitCode.SUCCESS);
        }

        setState('success');
        setTimeout(() => exit(), 1000);
        return;
      }

      // Sign
      setState('signing');
      const signResult = await signTransaction(wallet, result.unsignedTx);
      setTxInfo((prev) => (prev ? { ...prev, signedTx: signResult.signedTx, txHash: signResult.txHash } : null));

      // Submit
      setState('submitting');
      const submitResult = await submitTransaction(config, signResult.signedTx);
      setTxInfo((prev) => (prev ? { ...prev, txHash: submitResult.txHash } : null));

      // Confirm
      setState('confirming');
      const confirmResult = await waitForConfirmation(config, submitResult.txHash, 60, 5000);

      if (!confirmResult.confirmed) {
        const msg = 'Transaction submitted but confirmation timed out. Check tx hash manually.';
        setError(msg);
        setState('error');
        if (jsonOutput) exitWithError(errors.networkError(msg));
        setTimeout(() => exit(), 2000);
        return;
      }

      if (jsonOutput) {
        outputSuccess({ status: 'confirmed', txHash: confirmResult.txHash, network });
        process.exit(ExitCode.SUCCESS);
      }

      setState('success');
      setTimeout(() => exit(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setState('error');
      if (jsonOutput) exitWithError(err);
      setTimeout(() => exit(), 2000);
    }
  };

  // Auto-proceed in JSON mode once ready (no interactive confirmation)
  useEffect(() => {
    if (jsonOutput && state === 'confirm') {
      handleSend();
    }
  }, [jsonOutput, state]);

  // Handle keyboard input for confirmation
  useInput((input, key) => {
    if (jsonOutput) return;
    if (state !== 'confirm') return;

    if (input === 'y' || input === 'Y') {
      handleSend();
    } else if (input === 'n' || input === 'N' || key.escape) {
      setState('cancelled');
      setTimeout(() => exit(), 500);
    }
  });

  if (state === 'checking') {
    return (
      <Box padding={1}>
        <Text color="cyan">⏳ Checking wallet availability...</Text>
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
          <TextInput value={password} onChange={setPassword} onSubmit={handlePasswordSubmit} mask="*" />
        </Box>
      </Box>
    );
  }

  if (state === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Loading wallet...</Text>
        {walletInfo?.source === 'wallet' && <Text color="gray">Decrypting {walletInfo.walletName}...</Text>}
        {walletInfo?.source === 'env' && <Text color="gray">Using environment variable</Text>}
      </Box>
    );
  }

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

  if (state === 'cancelled') {
    return (
      <Box padding={1}>
        <Text color="yellow">Transaction cancelled</Text>
      </Box>
    );
  }

  if (state === 'building') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔨 Building transaction...</Text>
        <Text color="gray">Selecting UTxOs and calculating fees</Text>
      </Box>
    );
  }

  if (state === 'signing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔐 Signing transaction...</Text>
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

  if (state === 'success') {
    if (dryRun) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="green">✓ Transaction built successfully (dry run)</Text>
          <Box marginTop={1}>
            <Text color="gray">Unsigned TX saved to: </Text>
            <Text>{txInfo?.unsignedTxPath || outputFile || '(unknown)'}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">Sign with: begin sign {'<tx-file>'} --wallet {'<wallet-name>'}</Text>
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

  // Confirm prompt
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Send ADA</Text>
        <Text color="gray"> ({network})</Text>
        {dryRun && <Text color="yellow"> [DRY RUN]</Text>}
        {walletInfo?.source === 'wallet' && <Text color="gray"> [{walletInfo.walletName}]</Text>}
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        <Box>
          <Text color="gray">From:   </Text>
          <Text>
            {txInfo?.fromAddress.slice(0, 30)}...{txInfo?.fromAddress.slice(-10)}
          </Text>
        </Box>
        <Box>
          <Text color="gray">To:     </Text>
          <Text>
            {to.slice(0, 30)}...{to.slice(-10)}
          </Text>
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
