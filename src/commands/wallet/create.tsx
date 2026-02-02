/**
 * Wallet Create Command
 * Interactive command to create a new wallet with mnemonic generation
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { createWallet, walletExists, type WalletInfo } from '../../lib/wallet.js';

interface WalletCreateProps {
  name: string;
  network: string;
}

type Step = 'checking' | 'password' | 'confirm-password' | 'creating' | 'show-mnemonic' | 'verify' | 'complete' | 'error';

export function WalletCreate({ name, network }: WalletCreateProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifyIndices, setVerifyIndices] = useState<number[]>([]);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyStep, setVerifyStep] = useState(0);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const networkId = network === 'mainnet' ? 1 : 0;

  // Check if wallet exists
  useEffect(() => {
    const checkWallet = async () => {
      try {
        const exists = await walletExists(name);
        if (exists) {
          setError(`Wallet "${name}" already exists`);
          setStep('error');
        } else {
          setStep('password');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setStep('error');
      }
    };

    if (step === 'checking') {
      checkWallet();
    }
  }, [step, name]);

  // Handle keyboard input
  useInput((input, key) => {
    if (step === 'password') {
      if (key.return) {
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          return;
        }
        setError(null);
        setStep('confirm-password');
      } else if (key.backspace || key.delete) {
        setPassword((p) => p.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setPassword((p) => p + input);
      }
    } else if (step === 'confirm-password') {
      if (key.return) {
        if (confirmPassword !== password) {
          setError('Passwords do not match');
          setConfirmPassword('');
          return;
        }
        setError(null);
        setStep('creating');
      } else if (key.backspace || key.delete) {
        setConfirmPassword((p) => p.slice(0, -1));
      } else if (key.escape) {
        setPassword('');
        setConfirmPassword('');
        setStep('password');
      } else if (input && !key.ctrl && !key.meta) {
        setConfirmPassword((p) => p + input);
      }
    } else if (step === 'show-mnemonic') {
      if (key.return) {
        // Select 3 random words to verify
        const indices: number[] = [];
        while (indices.length < 3) {
          const idx = Math.floor(Math.random() * 24);
          if (!indices.includes(idx)) {
            indices.push(idx);
          }
        }
        indices.sort((a, b) => a - b);
        setVerifyIndices(indices);
        setStep('verify');
      }
    } else if (step === 'verify') {
      if (key.return) {
        const expectedWord = mnemonic[verifyIndices[verifyStep]];
        if (verifyInput.toLowerCase().trim() === expectedWord.toLowerCase()) {
          if (verifyStep < 2) {
            setVerifyStep((v) => v + 1);
            setVerifyInput('');
            setError(null);
          } else {
            setStep('complete');
          }
        } else {
          setError(`Incorrect word. Please try again.`);
          setVerifyInput('');
        }
      } else if (key.backspace || key.delete) {
        setVerifyInput((v) => v.slice(0, -1));
      } else if (key.escape) {
        setStep('show-mnemonic');
        setVerifyStep(0);
        setVerifyInput('');
        setError(null);
      } else if (input && !key.ctrl && !key.meta) {
        setVerifyInput((v) => v + input);
      }
    } else if (step === 'complete' || step === 'error') {
      if (key.return || key.escape) {
        exit();
      }
    }
  });

  // Create wallet
  useEffect(() => {
    const doCreate = async () => {
      try {
        const result = await createWallet(
          { name, networkId: networkId as 0 | 1 },
          password
        );
        setMnemonic(result.mnemonic);
        setWalletInfo(result.walletInfo);
        setStep('show-mnemonic');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create wallet');
        setStep('error');
      }
    };

    if (step === 'creating') {
      doCreate();
    }
  }, [step, name, networkId, password]);

  // Render based on step
  if (step === 'checking') {
    return (
      <Box>
        <Text>⏳ Checking wallet...</Text>
      </Box>
    );
  }

  if (step === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">❌ Error: {error}</Text>
        <Text color="gray">Press Enter to exit</Text>
      </Box>
    );
  }

  if (step === 'password') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Create New Wallet</Text>
          <Text color="gray"> ({network})</Text>
        </Box>
        <Text color="gray">Wallet name: </Text>
        <Text bold>{name}</Text>
        <Box marginTop={1}>
          <Text>Enter password (min 8 chars): </Text>
          <Text>{passwordVisible ? password : '•'.repeat(password.length)}</Text>
          <Text color="gray">▌</Text>
        </Box>
        {error && <Text color="red">{error}</Text>}
        <Box marginTop={1}>
          <Text color="gray">Press Enter to continue</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'confirm-password') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Create New Wallet</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Confirm password: </Text>
          <Text>{'•'.repeat(confirmPassword.length)}</Text>
          <Text color="gray">▌</Text>
        </Box>
        {error && <Text color="red">{error}</Text>}
        <Box marginTop={1}>
          <Text color="gray">Press Enter to continue, Esc to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'creating') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>⏳ Creating wallet...</Text>
        <Text color="gray">Generating keys and encrypting...</Text>
      </Box>
    );
  }

  if (step === 'show-mnemonic') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="green">✓ Wallet Created</Text>
        </Box>
        
        <Box marginBottom={1} flexDirection="column">
          <Text bold color="yellow">⚠️  IMPORTANT: Write down these 24 words!</Text>
          <Text color="gray">This is your recovery phrase. Store it safely offline.</Text>
          <Text color="gray">Anyone with these words can access your funds.</Text>
        </Box>

        <Box flexDirection="column" marginY={1} paddingX={2}>
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <Box key={row}>
              {[0, 1, 2, 3].map((col) => {
                const idx = row * 4 + col;
                return (
                  <Box key={idx} width={20}>
                    <Text color="gray">{String(idx + 1).padStart(2, ' ')}. </Text>
                    <Text bold>{mnemonic[idx]}</Text>
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>

        <Box marginTop={1}>
          <Text color="cyan">Press Enter when you have written down all words</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'verify') {
    const wordNum = verifyIndices[verifyStep] + 1;
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Verify Recovery Phrase</Text>
          <Text color="gray"> ({verifyStep + 1}/3)</Text>
        </Box>
        
        <Box marginTop={1}>
          <Text>Enter word #{wordNum}: </Text>
          <Text>{verifyInput}</Text>
          <Text color="gray">▌</Text>
        </Box>
        
        {error && <Text color="red">{error}</Text>}
        
        <Box marginTop={1}>
          <Text color="gray">Press Enter to verify, Esc to see words again</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'complete' && walletInfo) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="green">✓ Wallet Ready!</Text>
        </Box>

        <Box flexDirection="column">
          <Box>
            <Text color="gray">Name: </Text>
            <Text bold>{walletInfo.name}</Text>
          </Box>
          <Box>
            <Text color="gray">Network: </Text>
            <Text>{walletInfo.networkId === 1 ? 'mainnet' : 'testnet'}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">Payment Address:</Text>
          </Box>
          <Box paddingLeft={2}>
            <Text>{walletInfo.paymentAddress}</Text>
          </Box>
          {walletInfo.stakeAddress && (
            <>
              <Box marginTop={1}>
                <Text color="gray">Stake Address:</Text>
              </Box>
              <Box paddingLeft={2}>
                <Text>{walletInfo.stakeAddress}</Text>
              </Box>
            </>
          )}
        </Box>

        <Box marginTop={1}>
          <Text color="gray">Press Enter to exit</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
