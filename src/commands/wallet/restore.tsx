/**
 * Wallet Restore Command
 * Interactive command to restore a wallet from mnemonic
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { restoreWallet, walletExists, validateMnemonic, type WalletInfo } from '../../lib/wallet.js';

interface WalletRestoreProps {
  name: string;
  network: string;
}

type Step = 'checking' | 'mnemonic' | 'password' | 'confirm-password' | 'restoring' | 'complete' | 'error';

export function WalletRestore({ name, network }: WalletRestoreProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('checking');
  const [mnemonicWords, setMnemonicWords] = useState<string[]>([]);
  const [currentWord, setCurrentWord] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          setStep('mnemonic');
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
    if (step === 'mnemonic') {
      if (key.return) {
        if (currentWord.trim()) {
          const word = currentWord.trim().toLowerCase();
          const newWords = [...mnemonicWords, word];
          setMnemonicWords(newWords);
          setCurrentWord('');
          
          if (newWords.length === 24) {
            // Validate complete mnemonic
            if (validateMnemonic(newWords)) {
              setError(null);
              setStep('password');
            } else {
              setError('Invalid mnemonic phrase. Please check your words and try again.');
              setMnemonicWords([]);
            }
          }
        }
      } else if (key.backspace || key.delete) {
        if (currentWord.length > 0) {
          setCurrentWord((w) => w.slice(0, -1));
        } else if (mnemonicWords.length > 0) {
          // Remove last word
          setMnemonicWords((words) => words.slice(0, -1));
        }
      } else if (input === ' ' && currentWord.trim()) {
        // Space also adds word
        const word = currentWord.trim().toLowerCase();
        const newWords = [...mnemonicWords, word];
        setMnemonicWords(newWords);
        setCurrentWord('');
        
        if (newWords.length === 24) {
          if (validateMnemonic(newWords)) {
            setError(null);
            setStep('password');
          } else {
            setError('Invalid mnemonic phrase. Please check your words and try again.');
            setMnemonicWords([]);
          }
        }
      } else if (key.escape) {
        // Clear all
        setMnemonicWords([]);
        setCurrentWord('');
        setError(null);
      } else if (input && !key.ctrl && !key.meta && input !== ' ') {
        setCurrentWord((w) => w + input.toLowerCase());
      }
    } else if (step === 'password') {
      if (key.return) {
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          return;
        }
        setError(null);
        setStep('confirm-password');
      } else if (key.backspace || key.delete) {
        setPassword((p) => p.slice(0, -1));
      } else if (key.escape) {
        setPassword('');
        setStep('mnemonic');
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
        setStep('restoring');
      } else if (key.backspace || key.delete) {
        setConfirmPassword((p) => p.slice(0, -1));
      } else if (key.escape) {
        setConfirmPassword('');
        setStep('password');
      } else if (input && !key.ctrl && !key.meta) {
        setConfirmPassword((p) => p + input);
      }
    } else if (step === 'complete' || step === 'error') {
      if (key.return || key.escape) {
        exit();
      }
    }
  });

  // Restore wallet
  useEffect(() => {
    const doRestore = async () => {
      try {
        const info = await restoreWallet(
          { name, networkId: networkId as 0 | 1 },
          mnemonicWords,
          password
        );
        setWalletInfo(info);
        setStep('complete');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to restore wallet');
        setStep('error');
      }
    };

    if (step === 'restoring') {
      doRestore();
    }
  }, [step, name, networkId, mnemonicWords, password]);

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

  if (step === 'mnemonic') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Restore Wallet</Text>
          <Text color="gray"> ({network})</Text>
        </Box>
        
        <Text color="gray">Wallet name: </Text>
        <Text bold>{name}</Text>
        
        <Box marginTop={1} marginBottom={1}>
          <Text>Enter your 24-word recovery phrase</Text>
        </Box>
        
        <Box marginBottom={1}>
          <Text color="gray">Words entered: </Text>
          <Text bold color={mnemonicWords.length === 24 ? 'green' : 'yellow'}>
            {mnemonicWords.length}/24
          </Text>
        </Box>

        {/* Show entered words in grid */}
        {mnemonicWords.length > 0 && (
          <Box flexDirection="column" marginBottom={1} paddingX={1}>
            {Array.from({ length: Math.ceil(mnemonicWords.length / 4) }).map((_, row) => (
              <Box key={row}>
                {[0, 1, 2, 3].map((col) => {
                  const idx = row * 4 + col;
                  if (idx >= mnemonicWords.length) return null;
                  return (
                    <Box key={idx} width={18}>
                      <Text color="gray">{String(idx + 1).padStart(2, ' ')}. </Text>
                      <Text color="green">{mnemonicWords[idx]}</Text>
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        )}

        <Box>
          <Text>Word {mnemonicWords.length + 1}: </Text>
          <Text bold>{currentWord}</Text>
          <Text color="gray">▌</Text>
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}

        <Box marginTop={1} flexDirection="column">
          <Text color="gray">Press Enter or Space to add word</Text>
          <Text color="gray">Press Backspace to remove last word/char</Text>
          <Text color="gray">Press Esc to clear all</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'password') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Restore Wallet</Text>
        </Box>
        
        <Text color="green">✓ Mnemonic validated</Text>
        
        <Box marginTop={1}>
          <Text>Enter password (min 8 chars): </Text>
          <Text>{'•'.repeat(password.length)}</Text>
          <Text color="gray">▌</Text>
        </Box>
        
        {error && <Text color="red">{error}</Text>}
        
        <Box marginTop={1}>
          <Text color="gray">Press Enter to continue, Esc to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'confirm-password') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Restore Wallet</Text>
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

  if (step === 'restoring') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>⏳ Restoring wallet...</Text>
        <Text color="gray">Deriving keys and encrypting...</Text>
      </Box>
    );
  }

  if (step === 'complete' && walletInfo) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="green">✓ Wallet Restored!</Text>
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
