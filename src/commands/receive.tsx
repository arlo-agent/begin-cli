import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateQRCode, isValidCardanoAddress, truncateAddress } from '../lib/qr.js';
import { deriveAddresses, type NetworkType } from '../lib/address.js';
import { getMnemonic, walletExists, WALLETS_DIR, MNEMONIC_ENV_VAR, PASSWORD_ENV_VAR, getPasswordFromEnv } from '../lib/keystore.js';

interface ReceiveProps {
  /** Either a wallet name or a raw address */
  target: string;
  /** Show QR code in terminal */
  showQR: boolean;
  /** Output as JSON */
  json: boolean;
  /** Network for wallet lookups */
  network: string;
  /** Password for decrypting file-based wallets (if needed) */
  password?: string;
}

type ResolvedTarget =
  | { isWallet: false; address: string }
  | { isWallet: true; walletName: string; address: string; source: 'wallet_file' | 'keystore' };

async function getSavedPaymentAddress(walletName: string): Promise<string | null> {
  // Some wallet formats store a cleartext receive address in the file (e.g. addresses.payment).
  // If present, we can show it without decrypting mnemonic.
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

async function resolveTargetToAddress(opts: {
  target: string;
  network: NetworkType;
  password?: string;
}): Promise<ResolvedTarget> {
  const { target, network, password } = opts;

  // Raw address passed
  if (isValidCardanoAddress(target)) {
    return { isWallet: false, address: target };
  }

  // Wallet name passed — must exist on disk
  if (!walletExists(target)) {
    throw new Error(`Wallet "${target}" not found. Provide a valid wallet name or Cardano address.`);
  }

  // Fast path: cleartext payment address exists in wallet file
  const saved = await getSavedPaymentAddress(target);
  if (saved && isValidCardanoAddress(saved)) {
    return { isWallet: true, walletName: target, address: saved, source: 'wallet_file' };
  }

  // Password priority: --password flag > BEGIN_CLI_WALLET_PASSWORD env var
  const effectivePassword = password || getPasswordFromEnv() || undefined;

  // Fallback: decrypt mnemonic from keystore and derive address (requires password)
  if (!effectivePassword) {
    throw new Error(
      `Password required to decrypt wallet "${target}". ` +
        `Use --password, set ${PASSWORD_ENV_VAR}, or set ${MNEMONIC_ENV_VAR} to bypass file wallets.`
    );
  }

  const mnemonic = getMnemonic(effectivePassword, target);
  const derived = await deriveAddresses(mnemonic, network);
  return { isWallet: true, walletName: target, address: derived.baseAddress, source: 'keystore' };
}

export function Receive({ target, showQR, json, network, password }: ReceiveProps) {
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWallet, setIsWallet] = useState(false);
  const [walletSource, setWalletSource] = useState<'wallet_file' | 'keystore' | null>(null);

  useEffect(() => {
    const resolveAddress = async () => {
      try {
        const resolved = await resolveTargetToAddress({
          target,
          network: network as NetworkType,
          password,
        });

        setAddress(resolved.address);
        setIsWallet(resolved.isWallet);
        setWalletSource(resolved.isWallet ? resolved.source : null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
        return;
      }

      setLoading(false);
    };

    resolveAddress();
  }, [target, network, password]);

  // Generate QR code once we have the address
  useEffect(() => {
    const genQR = async () => {
      if (address && showQR && !json) {
        try {
          const qr = await generateQRCode(address);
          setQrCode(qr);
        } catch {
          // QR generation failed, but we can still show the address
          setQrCode(null);
        }
      }
    };

    genQR();
  }, [address, showQR, json]);

  if (loading) {
    if (json) {
      return null; // Don't output anything while loading for JSON mode
    }
    return (
      <Box>
        <Text>⏳ Resolving address...</Text>
      </Box>
    );
  }

  if (error) {
    if (json) {
      console.log(JSON.stringify({ error }, null, 2));
      return null;
    }
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (!address) {
    if (json) {
      console.log(JSON.stringify({ error: 'No address found' }, null, 2));
      return null;
    }
    return <Text color="red">No address found</Text>;
  }

  // JSON output mode
  if (json) {
    const output: Record<string, string> = {
      address,
    };
    if (isWallet) {
      output.wallet = target;
    }
    output.network = network;
    console.log(JSON.stringify(output, null, 2));
    return null;
  }

  // Terminal display mode
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Receive ADA</Text>
        <Text color="gray"> ({network})</Text>
      </Box>

      {isWallet && (
        <Box>
          <Text color="gray">Wallet: </Text>
          <Text bold>{target}</Text>
          {walletSource && (
            <Text color="gray">
              {walletSource === 'wallet_file' ? ' (from wallet file)' : ' (derived from mnemonic)'}
            </Text>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">Payment Address:</Text>
      </Box>
      <Box>
        <Text color="green">{address}</Text>
      </Box>

      {showQR && qrCode && (
        <Box flexDirection="column" marginTop={1}>
          <Text>{qrCode}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray" italic>
          {showQR ? 'Scan QR code or copy address above to receive ADA' : 'Use --qr flag to display QR code'}
        </Text>
      </Box>
    </Box>
  );
}
