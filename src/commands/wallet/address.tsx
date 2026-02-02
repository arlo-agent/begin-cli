/**
 * 'begin wallet address' command
 * 
 * Shows derived addresses from the wallet:
 * - Payment address (base address for receiving/sending)
 * - Enterprise address (payment only, no staking)
 * - Stake address (for staking operations)
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';
import {
  deriveAddresses,
  shortenAddress,
  type NetworkType,
  type DerivedAddresses,
} from '../../lib/address.js';
import { generateQRCode } from '../../lib/qr.js';
import {
  getMnemonic,
  hasEnvMnemonic,
  getPreferredSource,
  MNEMONIC_ENV_VAR,
} from '../../lib/keystore.js';

interface WalletAddressProps {
  network: NetworkType;
  walletName?: string;
  password?: string;
  full?: boolean;
  qr?: boolean;
  json?: boolean;
}

type LoadingState = 'loading' | 'need_password' | 'success' | 'error';

export function WalletAddress({
  network,
  walletName,
  password,
  full = false,
  qr = false,
  json = false,
}: WalletAddressProps) {
  const [state, setState] = useState<LoadingState>('loading');
  const [addresses, setAddresses] = useState<DerivedAddresses | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>('');
  const [qrCode, setQrCode] = useState<string | null>(null);

  useEffect(() => {
    const deriveAddrs = async () => {
      try {
        // Check if we have a source
        const preferredSource = getPreferredSource();
        
        if (!preferredSource && !walletName) {
          setError(
            `No wallet available.\n` +
            `\nOptions:\n` +
            `  1. Set ${MNEMONIC_ENV_VAR} environment variable\n` +
            `  2. Create a wallet with: begin wallet create\n` +
            `  3. Import a wallet with: begin wallet import`
          );
          setState('error');
          return;
        }

        // If using file-based wallet and no password provided
        const needsPassword =
          !hasEnvMnemonic() && !password && (walletName || preferredSource?.type === 'file');

        if (needsPassword) {
          setState('need_password');
          return;
        }

        // Get mnemonic from appropriate source
        const mnemonic = getMnemonic(password, walletName);
        
        // Set source for display
        if (hasEnvMnemonic()) {
          setSource(`environment (${MNEMONIC_ENV_VAR})`);
        } else if (walletName) {
          setSource(`wallet: ${walletName}`);
        } else if (preferredSource?.walletName) {
          setSource(`wallet: ${preferredSource.walletName}`);
        }

        // Derive addresses
        const derived = await deriveAddresses(mnemonic, network);
        setAddresses(derived);
        setState('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setState('error');
      }
    };

    deriveAddrs();
  }, [network, walletName, password]);

  useEffect(() => {
    const genQR = async () => {
      if (!qr || json || !addresses?.baseAddress) {
        setQrCode(null);
        return;
      }

      try {
        const qrStr = await generateQRCode(addresses.baseAddress);
        setQrCode(qrStr);
      } catch {
        setQrCode(null);
      }
    };

    genQR();
  }, [addresses, qr, json]);

  // Loading state
  if (state === 'loading') {
    return (
      <Box>
        <Text>⏳ Deriving addresses...</Text>
      </Box>
    );
  }

  // Need password
  if (state === 'need_password') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">🔐 Password required to decrypt wallet</Text>
        <Newline />
        <Text color="gray">Use --password flag or set {MNEMONIC_ENV_VAR} environment variable</Text>
        <Newline />
        <Text color="gray">Example: begin wallet address --password your-password</Text>
      </Box>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  // No addresses (shouldn't happen)
  if (!addresses) {
    return <Text color="red">No addresses derived</Text>;
  }

  // JSON output
  if (json) {
    const output = {
      network: addresses.network,
      paymentAddress: addresses.baseAddress,
      enterpriseAddress: addresses.enterpriseAddress,
      stakeAddress: addresses.stakeAddress,
    };
    return <Text>{JSON.stringify(output, null, 2)}</Text>;
  }

  // Regular output
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Wallet Addresses</Text>
        <Text color="gray"> ({network})</Text>
      </Box>

      {/* Source info */}
      {source && (
        <Box marginBottom={1}>
          <Text color="gray">Source: </Text>
          <Text color="blue">{source}</Text>
        </Box>
      )}

      {/* Payment Address (Base) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="green">💳 Payment Address</Text>
          <Text color="gray"> (base address for receiving/sending)</Text>
        </Box>
        <Box paddingLeft={2}>
          {full ? (
            <Text>{addresses.baseAddress}</Text>
          ) : (
            <Text>{shortenAddress(addresses.baseAddress, 20, 12)}</Text>
          )}
        </Box>
        {qr && qrCode && (
          <Box marginTop={1} paddingLeft={2}>
            <Text>{qrCode}</Text>
          </Box>
        )}
      </Box>

      {/* Enterprise Address */}
      {addresses.enterpriseAddress && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="yellow">🏢 Enterprise Address</Text>
            <Text color="gray"> (payment only, no staking)</Text>
          </Box>
          <Box paddingLeft={2}>
            {full ? (
              <Text>{addresses.enterpriseAddress}</Text>
            ) : (
              <Text>{shortenAddress(addresses.enterpriseAddress, 20, 12)}</Text>
            )}
          </Box>
        </Box>
      )}

      {/* Stake Address */}
      {addresses.stakeAddress && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="magenta">🥩 Stake Address</Text>
            <Text color="gray"> (for staking operations)</Text>
          </Box>
          <Box paddingLeft={2}>
            {full ? (
              <Text>{addresses.stakeAddress}</Text>
            ) : (
              <Text>{shortenAddress(addresses.stakeAddress, 16, 10)}</Text>
            )}
          </Box>
        </Box>
      )}

      {/* Hint for full addresses */}
      {!full && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Use --full to show complete addresses
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Simple component to show a single address (useful for scripting)
 */
interface SingleAddressProps {
  network: NetworkType;
  addressType: 'payment' | 'enterprise' | 'stake';
  walletName?: string;
  password?: string;
}

export function SingleAddress({
  network,
  addressType,
  walletName,
  password,
}: SingleAddressProps) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const derive = async () => {
      try {
        const mnemonic = getMnemonic(password, walletName);
        const addresses = await deriveAddresses(mnemonic, network);
        
        switch (addressType) {
          case 'payment':
            setAddress(addresses.baseAddress);
            break;
          case 'enterprise':
            setAddress(addresses.enterpriseAddress);
            break;
          case 'stake':
            setAddress(addresses.stakeAddress);
            break;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    derive();
  }, [network, addressType, walletName, password]);

  if (error) {
    return <Text color="red">{error}</Text>;
  }

  if (!address) {
    return null;
  }

  return <Text>{address}</Text>;
}
