import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { generateQRCode, isValidCardanoAddress, truncateAddress } from '../lib/qr.js';

interface ReceiveProps {
  /** Either a wallet name or a raw address */
  target: string;
  /** Show QR code in terminal */
  showQR: boolean;
  /** Output as JSON */
  json: boolean;
  /** Network for wallet lookups */
  network: string;
}

interface WalletConfig {
  name: string;
  address: string;
  network: string;
}

/**
 * Mock function to get wallet address by name
 * In a real implementation, this would read from wallet storage
 */
async function getWalletAddress(walletName: string, _network: string): Promise<string | null> {
  // TODO: Implement actual wallet lookup from storage
  // For now, we'll check if it looks like an address and return it,
  // otherwise return null to indicate wallet not found
  if (isValidCardanoAddress(walletName)) {
    return walletName;
  }
  
  // Simulate wallet lookup - in production this would read from ~/.begin/wallets/
  const mockWallets: Record<string, WalletConfig> = {
    // Add mock wallets for testing
  };
  
  const wallet = mockWallets[walletName];
  return wallet?.address || null;
}

export function Receive({ target, showQR, json, network }: ReceiveProps) {
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWallet, setIsWallet] = useState(false);

  useEffect(() => {
    const resolveAddress = async () => {
      try {
        // Check if target is already an address
        if (isValidCardanoAddress(target)) {
          setAddress(target);
          setIsWallet(false);
        } else {
          // Try to look up as wallet name
          const walletAddress = await getWalletAddress(target, network);
          if (walletAddress) {
            setAddress(walletAddress);
            setIsWallet(true);
          } else {
            throw new Error(`Wallet "${target}" not found. Provide a valid wallet name or Cardano address.`);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
        return;
      }

      setLoading(false);
    };

    resolveAddress();
  }, [target, network]);

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
