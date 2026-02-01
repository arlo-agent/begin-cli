import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { generateQRCode, truncateAddress } from '../../lib/qr.js';

interface WalletAddressProps {
  wallet: string;
  showQR: boolean;
  json: boolean;
  network: string;
}

interface WalletConfig {
  name: string;
  address: string;
  network: string;
}

/**
 * Mock function to get wallet info
 * In a real implementation, this would read from wallet storage
 */
async function getWallet(walletName: string, _network: string): Promise<WalletConfig | null> {
  // TODO: Implement actual wallet lookup from storage
  // This would typically read from ~/.begin/wallets/{walletName}.json
  
  // For demonstration, return null (wallet not found)
  // In production, this would parse wallet files
  return null;
}

export function WalletAddress({ wallet, showQR, json, network }: WalletAddressProps) {
  const [loading, setLoading] = useState(true);
  const [walletConfig, setWalletConfig] = useState<WalletConfig | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWallet = async () => {
      try {
        const config = await getWallet(wallet, network);
        if (!config) {
          throw new Error(`Wallet "${wallet}" not found. Create it first with: begin wallet create ${wallet}`);
        }
        setWalletConfig(config);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadWallet();
  }, [wallet, network]);

  // Generate QR code once we have the wallet
  useEffect(() => {
    const genQR = async () => {
      if (walletConfig?.address && showQR && !json) {
        try {
          const qr = await generateQRCode(walletConfig.address);
          setQrCode(qr);
        } catch {
          setQrCode(null);
        }
      }
    };

    genQR();
  }, [walletConfig, showQR, json]);

  if (loading) {
    if (json) return null;
    return (
      <Box>
        <Text>⏳ Loading wallet...</Text>
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

  if (!walletConfig) {
    if (json) {
      console.log(JSON.stringify({ error: 'Wallet not found' }, null, 2));
      return null;
    }
    return <Text color="red">Wallet not found</Text>;
  }

  // JSON output mode
  if (json) {
    const output = {
      wallet: walletConfig.name,
      address: walletConfig.address,
      network: walletConfig.network,
    };
    console.log(JSON.stringify(output, null, 2));
    return null;
  }

  // Terminal display mode
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Wallet Address</Text>
        <Text color="gray"> ({network})</Text>
      </Box>

      <Box>
        <Text color="gray">Wallet: </Text>
        <Text bold>{walletConfig.name}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Address:</Text>
      </Box>
      <Box>
        <Text color="green">{walletConfig.address}</Text>
      </Box>

      {showQR && qrCode && (
        <Box flexDirection="column" marginTop={1}>
          <Text>{qrCode}</Text>
        </Box>
      )}

      {!showQR && (
        <Box marginTop={1}>
          <Text color="gray" italic>Use --qr flag to display QR code</Text>
        </Box>
      )}
    </Box>
  );
}
