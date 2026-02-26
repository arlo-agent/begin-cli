import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { exec } from 'child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isValidCardanoAddress } from '../lib/qr.js';
import { walletExists, WALLETS_DIR, getDefaultWallet, listWallets } from '../lib/keystore.js';

// Onramper configuration (from b58-extension)
const ONRAMPER_API_KEY = 'pk_prod_01HETEQF46GSK6BS5JWKDF31BT';
const ONRAMPER_BASE_URL = 'https://buy.onramper.com';

// Token mapping for Onramper
const TOKEN_MAP: Record<string, string> = {
  ADA: 'ada_cardano',
  BTC: 'btc',
  SOL: 'sol',
};

interface BuyProps {
  amount: number;
  currency: string;
  token: string;
  json: boolean;
  walletName?: string;
}

async function getSavedPaymentAddress(walletName: string): Promise<string | null> {
  try {
    const filePath = join(WALLETS_DIR, `${walletName}.json`);
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown as { addresses?: { payment?: unknown } };
    const payment = parsed?.addresses?.payment;
    return typeof payment === 'string' && payment.trim().length > 0 ? payment.trim() : null;
  } catch {
    return null;
  }
}

async function getWalletAddress(walletName?: string): Promise<string | null> {
  // Try specific wallet first
  if (walletName && walletExists(walletName)) {
    return getSavedPaymentAddress(walletName);
  }

  // Try default wallet
  const defaultWallet = getDefaultWallet();
  if (defaultWallet && walletExists(defaultWallet)) {
    return getSavedPaymentAddress(defaultWallet);
  }

  // Try single wallet
  const wallets = listWallets();
  if (wallets.length === 1) {
    return getSavedPaymentAddress(wallets[0]);
  }

  return null;
}

function openUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${cmd} "${url}"`, (err) => {
      if (err) {
        // Silently fail - we'll show the URL anyway
      }
      resolve();
    });
  });
}

function buildOnramperUrl(opts: {
  amount: number;
  currency: string;
  token: string;
  walletAddress?: string | null;
}): string {
  const { amount, currency, token, walletAddress } = opts;

  const onramperToken = TOKEN_MAP[token.toUpperCase()] || token.toLowerCase();

  const params = new URLSearchParams({
    apiKey: ONRAMPER_API_KEY,
    mode: 'buy',
    onlyCryptos: onramperToken,
    defaultFiat: currency.toLowerCase(),
    defaultAmount: amount.toString(),
  });

  // Pre-fill wallet address if available
  if (walletAddress && isValidCardanoAddress(walletAddress)) {
    params.set('wallets', `ada_cardano:${walletAddress}`);
  }

  return `${ONRAMPER_BASE_URL}?${params.toString()}`;
}

export function Buy({ amount, currency, token, json, walletName }: BuyProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [browserOpened, setBrowserOpened] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      // Try to get wallet address for pre-filling
      const address = await getWalletAddress(walletName);
      setWalletAddress(address);

      const generatedUrl = buildOnramperUrl({
        amount,
        currency,
        token,
        walletAddress: address,
      });
      setUrl(generatedUrl);
      setLoading(false);

      // Try to open browser (non-JSON mode only)
      if (!json) {
        await openUrl(generatedUrl);
        setBrowserOpened(true);
      }
    };

    init();
  }, [amount, currency, token, json, walletName]);

  if (loading) {
    if (json) return null;
    return (
      <Box>
        <Text>Generating checkout URL...</Text>
      </Box>
    );
  }

  if (!url) {
    if (json) {
      console.log(JSON.stringify({ error: 'Failed to generate URL' }, null, 2));
      return null;
    }
    return <Text color="red">Error: Failed to generate URL</Text>;
  }

  // JSON output mode (for agents)
  if (json) {
    console.log(JSON.stringify({ url }, null, 2));
    return null;
  }

  // Terminal display mode
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Buy Crypto with Fiat</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="gray">Amount: </Text>
          <Text bold>{amount} {currency.toUpperCase()}</Text>
        </Box>
        <Box>
          <Text color="gray">Token: </Text>
          <Text bold>{token.toUpperCase()}</Text>
        </Box>
        {walletAddress && (
          <Box>
            <Text color="gray">Wallet: </Text>
            <Text>{walletAddress.slice(0, 20)}...{walletAddress.slice(-8)}</Text>
          </Box>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">Checkout URL:</Text>
        <Text color="green" wrap="wrap">{url}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray" italic>
          {browserOpened
            ? 'Browser opened. Complete your purchase in the Onramper checkout.'
            : 'Could not open browser. Visit the URL above to complete your purchase.'}
        </Text>
      </Box>
    </Box>
  );
}
