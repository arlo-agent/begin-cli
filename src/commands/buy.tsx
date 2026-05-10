import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { exec } from 'child_process';
import {
  walletExists,
  WALLETS_DIR,
  getDefaultWallet,
  listWallets,
  getMnemonicAsync,
  getPasswordFromEnv,
} from '../lib/keystore.js';
import { getMultiChainAddressesFromMnemonic } from '../lib/wallet.js';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Onramper widget URL (same host for buy/sell). */
const ONRAMPER_BASE_URL = 'https://buy.onramper.com';

const ONRAMPER_API_KEY = process.env.ONRAMPER_API_KEY;
const ONRAMP_SECRET = process.env.ONRAMP_SECRET;

/**
 * Optional extra widget query params for Begin branding (same idea as begin-mobile `theme`).
 * Example: `hideTopBar=true` or `hideTopBar=true&foo=bar` (no leading `&`).
 */
const ONRAMPER_THEME = process.env.ONRAMPER_THEME;

/**
 * Onramper IDs for native tokens on each EVM chain Begin supports (same 0x address for all).
 * Matches `EVMNetwork` in `lib/chains/types.ts` (ethereum, base, polygon, arbitrum, optimism, bnb, avalanche).
 * Verify IDs in Onramper “Crypto currencies” if a symbol stops working.
 */
const EVM_NATIVE_ONRAMPER_IDS = [
  'eth',
  'eth_base',
  'usdc_base',
  'usdc_polygon',
  'usdc_arbitrum',
  'usdc_optimism',
  'usdc_bnb',
  'usdc_avalanche',
  'eth_polygon',
  'eth_arbitrum',
  'eth_optimism',
  'eth_bnb',
  'eth_avalanche',
] as const;

/**
 * When no wallet addresses are available, show a typical Begin multi-chain set:
 * Cardano, Bitcoin, Solana (+ USDC on Solana), and EVM chain natives.
 */
const BEGIN_FALLBACK_ONLY_CRYPTOS = [
  'ada_cardano',
  'btc',
  'sol',
  'usdc_solana',
  ...EVM_NATIVE_ONRAMPER_IDS,
] as const;

/** Map CLI token symbols to Onramper IDs. SOL also enables USDC on Solana (begin-mobile parity). */
const TOKEN_MAP: Record<string, string[]> = {
  ADA: ['ada_cardano'],
  BTC: ['btc'],
  SOL: ['sol', 'usdc_solana'],
  USDC: ['usdc_solana'],
  ETH: ['eth'],
  /** Base native ETH + USDC on Base (same 0x recipient). */
  BASE: ['eth_base', 'usdc_base'],
  /** USDC on Base only. */
  USDC_BASE: ['usdc_base'],
  MATIC: ['eth_polygon'],
  ARB: ['eth_arbitrum'],
  OP: ['eth_optimism'],
  BNB: ['eth_bnb'],
  AVAX: ['eth_avalanche'],
  /** All supported EVM native Onramper IDs (same wallet address). */
  EVM: [...EVM_NATIVE_ONRAMPER_IDS],
  ALL: [], // resolved from wallet or fallback
};

const ONRAMPER_TOKEN_WALLET_MAP: Record<string, 'cardano' | 'bitcoin' | 'solana' | 'evm'> = {
  ada_cardano: 'cardano',
  btc: 'bitcoin',
  sol: 'solana',
  usdc_solana: 'solana',
  eth: 'evm',
  eth_base: 'evm',
  usdc_base: 'evm',
  eth_polygon: 'evm',
  eth_arbitrum: 'evm',
  eth_optimism: 'evm',
  eth_bnb: 'evm',
  eth_avalanche: 'evm',
  usdc_polygon: 'evm',
  usdc_arbitrum: 'evm',
  usdc_optimism: 'evm',
  usdc_bnb: 'evm',
  usdc_avalanche: 'evm',
};

function isEvmOnramperId(id: string): boolean {
  return ONRAMPER_TOKEN_WALLET_MAP[id] === 'evm';
}

interface BuyProps {
  amount: number;
  currency: string;
  /** Omit or `ALL` → full supported asset list; explicit symbols narrow `onlyCryptos`. */
  token?: string;
  json: boolean;
  walletName?: string;
}

type ChainWalletAddresses = Partial<Record<'cardano' | 'bitcoin' | 'solana' | 'evm', string>>;

function generateSignature(secretKey: string, data: string): string {
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(data);
  return hmac.digest('hex');
}

function arrangeStringAlphabetically(inputString: string): string {
  const inputObject: { [key: string]: { [key: string]: string } } = {};
  inputString.split('&').forEach((pair) => {
    const [key, value = ''] = pair.split('=');
    const nestedPairs = value.split(',');
    inputObject[key] = {};
    nestedPairs.forEach((nestedPair) => {
      const [nestedKey, nestedValue = ''] = nestedPair.split(':');
      if (nestedKey) {
        inputObject[key][nestedKey] = nestedValue;
      }
    });
  });

  for (const key in inputObject) {
    inputObject[key] = Object.fromEntries(Object.entries(inputObject[key]).sort());
  }

  const sortedKeys = Object.keys(inputObject).sort();
  const sortedObject: { [key: string]: { [key: string]: string } } = {};
  sortedKeys.forEach((key) => {
    sortedObject[key] = inputObject[key];
  });

  let resultString = '';
  for (const key in sortedObject) {
    resultString += `${key}=`;
    resultString += Object.entries(sortedObject[key])
      .map(([nestedKey, nestedValue]) => `${nestedKey}:${nestedValue}`)
      .join(',');
    resultString += '&';
  }
  return resultString.slice(0, -1);
}

function applyThemeToParams(params: URLSearchParams, theme: string | undefined): void {
  if (!theme?.trim()) return;
  for (const segment of theme.split('&')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      params.set(trimmed, '');
    } else {
      const k = trimmed.slice(0, eq);
      const v = trimmed.slice(eq + 1);
      if (k) params.set(k, v);
    }
  }
}

/** True when `begin buy` uses the full supported asset list (omit `--token` or `--token ALL`). */
function isBuyAllTokenMode(token: string | undefined): boolean {
  const trimmed = (token ?? '').trim();
  if (!trimmed) return true;
  return trimmed.split(',').length === 1 && trimmed.toUpperCase() === 'ALL';
}

function resolveOnlyCryptos(token: string | undefined): string[] {
  const trimmed = (token ?? '').trim();
  const requested = trimmed
    ? trimmed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  // No --token or explicit ALL: show every asset Begin supports (not wallet-filtered).
  // Wallet addresses still prefill `wallets=` only where we have keys.
  const isAll =
    requested.length === 0 ||
    (requested.length === 1 && requested[0].toUpperCase() === 'ALL');

  if (isAll) {
    return [...BEGIN_FALLBACK_ONLY_CRYPTOS];
  }

  const out: string[] = [];
  for (const raw of requested) {
    const upper = raw.toUpperCase();
    const mapped = TOKEN_MAP[upper];
    if (mapped && mapped.length > 0) {
      out.push(...mapped);
    } else {
      out.push(raw.toLowerCase());
    }
  }
  return [...new Set(out)];
}

async function getSavedWalletAddresses(walletName: string): Promise<ChainWalletAddresses> {
  try {
    const filePath = join(WALLETS_DIR, `${walletName}.json`);
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as {
      version?: number;
      addresses?: { payment?: unknown };
      chains?: {
        cardano?: { addresses?: { payment?: unknown } };
        bitcoin?: { address?: unknown };
        solana?: { address?: unknown };
        evm?: { address?: unknown };
      };
    };

    const fromV3: ChainWalletAddresses = {
      cardano:
        typeof parsed?.chains?.cardano?.addresses?.payment === 'string'
          ? parsed.chains.cardano.addresses.payment.trim()
          : undefined,
      bitcoin:
        typeof parsed?.chains?.bitcoin?.address === 'string'
          ? parsed.chains.bitcoin.address.trim()
          : undefined,
      solana:
        typeof parsed?.chains?.solana?.address === 'string'
          ? parsed.chains.solana.address.trim()
          : undefined,
      evm:
        typeof parsed?.chains?.evm?.address === 'string'
          ? parsed.chains.evm.address.trim()
          : undefined,
    };

    const legacyCardano =
      typeof parsed?.addresses?.payment === 'string' ? parsed.addresses.payment.trim() : undefined;

    return {
      cardano: fromV3.cardano || legacyCardano,
      bitcoin: fromV3.bitcoin,
      solana: fromV3.solana,
      evm: fromV3.evm,
    };
  } catch {
    return {};
  }
}

async function getWalletAddresses(walletName?: string): Promise<ChainWalletAddresses> {
  if (walletName && walletExists(walletName)) {
    return getSavedWalletAddresses(walletName);
  }

  const defaultWallet = getDefaultWallet();
  if (defaultWallet && walletExists(defaultWallet)) {
    return getSavedWalletAddresses(defaultWallet);
  }

  const wallets = listWallets();
  if (wallets.length === 1) {
    return getSavedWalletAddresses(wallets[0]);
  }

  return {};
}

async function getWalletNetworkIdForDerivation(walletName?: string): Promise<0 | 1> {
  let name: string | undefined;
  if (walletName && walletExists(walletName)) name = walletName;
  else {
    const d = getDefaultWallet();
    if (d && walletExists(d)) name = d;
    else {
      const w = listWallets();
      if (w.length === 1) name = w[0];
    }
  }
  if (!name) return 1;
  try {
    const raw = await readFile(join(WALLETS_DIR, `${name}.json`), 'utf8');
    const parsed = JSON.parse(raw) as {
      version?: number;
      networkId?: number;
      chains?: { cardano?: { networkId?: number } };
    };
    const nid =
      parsed.version === 3
        ? parsed.chains?.cardano?.networkId
        : typeof parsed.networkId === 'number'
          ? parsed.networkId
          : 1;
    return nid === 0 ? 0 : 1;
  } catch {
    return 1;
  }
}

/**
 * begin-mobile parity: in ALL mode, fill Cardano / Bitcoin / Solana / EVM addresses from the mnemonic
 * when the wallet JSON is v1/v2 or v3 without every chain — so `wallets=` covers every `onlyCryptos` entry.
 */
async function resolveChainWalletAddressesForBuy(
  walletName: string | undefined,
  isAllMode: boolean
): Promise<ChainWalletAddresses> {
  const fromFile = await getWalletAddresses(walletName);

  if (!isAllMode) return fromFile;

  try {
    const password = getPasswordFromEnv() || undefined;
    const mnemonicStr = await getMnemonicAsync(password, walletName);
    const words = mnemonicStr.split(/\s+/);
    const networkId = await getWalletNetworkIdForDerivation(walletName);
    const derived = await getMultiChainAddressesFromMnemonic(words, networkId);

    return {
      cardano:
        fromFile.cardano?.trim() || derived.cardano?.addresses.payment?.trim() || undefined,
      bitcoin: fromFile.bitcoin?.trim() || derived.bitcoin?.address?.trim() || undefined,
      solana: fromFile.solana?.trim() || derived.solana?.address?.trim() || undefined,
      evm: fromFile.evm?.trim() || derived.evm?.address?.trim() || undefined,
    };
  } catch {
    return fromFile;
  }
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

/**
 * begin-mobile–style buy URL: dynamic onlyCryptos from wallet, redirectAtCheckout=false,
 * Solana- or EVM-focused defaultCrypto/popularCryptos when those addresses exist, optional theme from env.
 */
function buildOnramperUrl(opts: {
  amount: number;
  currency: string;
  token?: string;
  walletAddresses?: ChainWalletAddresses;
}): string {
  if (!ONRAMPER_API_KEY?.trim()) {
    throw new Error(
      'Missing ONRAMPER_API_KEY. Set ONRAMPER_API_KEY in your environment or .env (Onramper widget API key).'
    );
  }

  const { amount, currency, token, walletAddresses = {} } = opts;
  const selectedCryptos = resolveOnlyCryptos(token ?? '');
  const solanaAddress = walletAddresses.solana?.trim();
  const evmAddress = walletAddresses.evm?.trim();
  const evmInSelection = selectedCryptos.filter((id) => isEvmOnramperId(id));

  const params = new URLSearchParams();
  params.set('apiKey', ONRAMPER_API_KEY.trim());
  params.set('mode', 'buy');
  params.set('onlyCryptos', selectedCryptos.join(','));
  params.set('defaultFiat', currency.toLowerCase());
  params.set('defaultAmount', amount.toString());
  params.set('redirectAtCheckout', 'false');

  // begin-mobile: when user has Solana, bias widget toward SOL + USDC on Solana
  if (solanaAddress && (selectedCryptos.includes('sol') || selectedCryptos.includes('usdc_solana'))) {
    params.set('defaultCrypto', 'sol');
    params.set('popularCryptos', 'sol,usdc_solana');
  } else if (
    evmAddress &&
    selectedCryptos.includes('eth_base') &&
    selectedCryptos.includes('usdc_base')
  ) {
    params.set('defaultCrypto', 'eth_base');
    params.set('popularCryptos', 'eth_base,usdc_base');
  } else if (evmAddress && evmInSelection.length > 0) {
    const defaultEvm = evmInSelection.includes('eth') ? 'eth' : evmInSelection[0];
    params.set('defaultCrypto', defaultEvm);
    params.set('popularCryptos', evmInSelection.join(','));
  }

  // if (selectedCryptos.length === 0) {
  //   params.set('defaultCrypto', 'usdc_solana');
  //   params.set('popularCryptos', 'btc,usdc_solana,ada_cardano,sol');
  // }

  applyThemeToParams(params, ONRAMPER_THEME);

  const wallets = selectedCryptos
    .map((cryptoId) => {
      const chain = ONRAMPER_TOKEN_WALLET_MAP[cryptoId];
      const address = chain ? walletAddresses[chain] : undefined;
      if (!address?.trim()) return null;
      return `${cryptoId.toLowerCase()}:${address.trim()}`;
    })
    .filter((entry): entry is string => !!entry);

  if (wallets.length > 0) {
    const partialURL = `wallets=${wallets.join(',')}`;
    if (!ONRAMP_SECRET?.trim()) {
      throw new Error(
        'Missing ONRAMP_SECRET. Set ONRAMP_SECRET in your environment or .env to sign Onramper wallet URLs.'
      );
    }
    const signature = generateSignature(ONRAMP_SECRET.trim(), arrangeStringAlphabetically(partialURL));
    params.set('wallets', wallets.join(','));
    params.set('signature', signature);
  }

  return `${ONRAMPER_BASE_URL}?${params.toString()}`;
}

export function Buy({ amount, currency, token, json, walletName }: BuyProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [walletAddresses, setWalletAddresses] = useState<ChainWalletAddresses>({});
  const [browserOpened, setBrowserOpened] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const isAll = isBuyAllTokenMode(token);
        const addresses = await resolveChainWalletAddressesForBuy(walletName, isAll);
        setWalletAddresses(addresses);

        const generatedUrl = buildOnramperUrl({
          amount,
          currency,
          token,
          walletAddresses: addresses,
        });
        setUrl(generatedUrl);
        setLoading(false);

        if (!json) {
          await openUrl(generatedUrl);
          setBrowserOpened(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate URL');
        setLoading(false);
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
      console.log(JSON.stringify({ error: error || 'Failed to generate URL' }, null, 2));
      return null;
    }
    return <Text color="red">Error: {error || 'Failed to generate URL'}</Text>;
  }

  if (json) {
    console.log(JSON.stringify({ url }, null, 2));
    return null;
  }

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
          <Text bold>{(token?.trim() || 'ALL').toUpperCase()}</Text>
        </Box>
        {Object.values(walletAddresses).some((v) => !!v) && (
          <Box>
            <Text color="gray">Wallets: </Text>
            <Text>
              {Object.entries(walletAddresses)
                .filter(([, value]) => !!value)
                .map(([chain]) => chain)
                .join(', ')}
            </Text>
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
