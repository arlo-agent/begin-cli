/**
 * 'begin wallet address' command
 *
 * Shows derived addresses from the wallet for all supported chains:
 * - Cardano: Payment, Enterprise, Stake addresses
 * - Solana, Bitcoin, EVM: chain addresses
 */

import React, { useState, useEffect } from "react";
import { Box, Text, Newline } from "ink";
import {
  deriveAddresses,
  shortenAddress,
  type NetworkType,
  type DerivedAddresses,
} from "../../lib/address.js";
import { generateQRCode } from "../../lib/qr.js";
import {
  getMnemonicAsync,
  hasEnvMnemonic,
  getPreferredSource,
  getPasswordFromEnv,
  MNEMONIC_ENV_VAR,
  PASSWORD_ENV_VAR,
} from "../../lib/keystore.js";
import { getErrorMessage } from "../../lib/errors.js";
import { getMultiChainAddressesFromMnemonic } from "../../lib/wallet.js";
import type { MultiChainAddresses } from "../../lib/chains/types.js";

interface WalletAddressProps {
  network: NetworkType;
  walletName?: string;
  password?: string;
  full?: boolean;
  qr?: boolean;
  json?: boolean;
}

type LoadingState = "loading" | "need_password" | "success" | "error";

export function WalletAddress({
  network,
  walletName,
  password,
  full = true,
  qr = false,
  json = false,
}: WalletAddressProps) {
  const [state, setState] = useState<LoadingState>("loading");
  const [addresses, setAddresses] = useState<DerivedAddresses | null>(null);
  const [allChains, setAllChains] = useState<MultiChainAddresses | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
  const [qrCode, setQrCode] = useState<string | null>(null);

  const networkId = network === "mainnet" ? 1 : 0;

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
          setState("error");
          return;
        }

        // Password priority: --password flag > BEGIN_CLI_WALLET_PASSWORD env var > interactive prompt
        const effectivePassword = password || getPasswordFromEnv() || undefined;

        // Get mnemonic (async: keychain wallets need no password; file-only wallets throw if no password)
        let mnemonic: string;
        try {
          mnemonic = await getMnemonicAsync(effectivePassword, walletName ?? undefined);
        } catch (loadErr) {
          const msg = loadErr instanceof Error ? loadErr.message : String(loadErr);
          if (!effectivePassword && (msg.includes("Password required") || msg.includes("password"))) {
            setState("need_password");
            return;
          }
          throw loadErr;
        }

        // Set source for display
        if (hasEnvMnemonic()) {
          setSource(`environment (${MNEMONIC_ENV_VAR})`);
        } else if (walletName) {
          setSource(`wallet: ${walletName}`);
        } else if (preferredSource?.walletName) {
          setSource(`wallet: ${preferredSource.walletName}`);
        }

        // Derive Cardano addresses
        const derived = await deriveAddresses(mnemonic, network);
        setAddresses(derived);

        // Derive addresses for all chains (Solana, Bitcoin, EVM, Cardano)
        const chains = await getMultiChainAddressesFromMnemonic(mnemonic.split(/\s+/), networkId);
        setAllChains(chains);
        setState("success");
      } catch (err) {
        setError(getErrorMessage(err, "Unknown error"));
        setState("error");
      }
    };

    deriveAddrs();
  }, [network, walletName, password, networkId]);

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
  if (state === "loading") {
    return (
      <Box>
        <Text>⏳ Deriving addresses...</Text>
      </Box>
    );
  }

  // Need password
  if (state === "need_password") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">🔐 Password required to decrypt wallet</Text>
        <Newline />
        <Text color="gray">
          Use --password flag, set {PASSWORD_ENV_VAR}, or set {MNEMONIC_ENV_VAR}
        </Text>
        <Newline />
        <Text color="gray">Example: begin wallet address --password your-password</Text>
      </Box>
    );
  }

  // Error state
  if (state === "error") {
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
    const output: Record<string, unknown> = {
      network: addresses.network,
      cardano: {
        paymentAddress: addresses.baseAddress,
        enterpriseAddress: addresses.enterpriseAddress,
        stakeAddress: addresses.stakeAddress,
      },
    };
    if (allChains) {
      if (allChains.solana) output.solana = { address: allChains.solana.address };
      if (allChains.bitcoin) output.bitcoin = { address: allChains.bitcoin.address };
      if (allChains.evm) output.evm = { address: allChains.evm.address };
    }
    return <Text>{JSON.stringify(output, null, 2)}</Text>;
  }

  // Regular output
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Wallet Addresses
        </Text>
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

      {/* Other chains */}
      {allChains && (
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          <Text bold color="cyan">
            Other Chains
          </Text>
          {allChains.solana && (
            <Box flexDirection="column" marginTop={1} paddingLeft={2}>
              <Text color="blue">◎ Solana</Text>
              <Box paddingLeft={2}>
                {full ? (
                  <Text>{allChains.solana.address}</Text>
                ) : (
                  <Text>{shortenAddress(allChains.solana.address, 16, 8)}</Text>
                )}
              </Box>
            </Box>
          )}
          {allChains.bitcoin && (
            <Box flexDirection="column" marginTop={1} paddingLeft={2}>
              <Text color="orange">₿ Bitcoin</Text>
              <Box paddingLeft={2}>
                {full ? (
                  <Text>{allChains.bitcoin.address}</Text>
                ) : (
                  <Text>{shortenAddress(allChains.bitcoin.address, 12, 8)}</Text>
                )}
              </Box>
            </Box>
          )}
          {allChains.evm && (
            <Box flexDirection="column" marginTop={1} paddingLeft={2}>
              <Box>
                <Text color="gray">⟠ EVM</Text>
                <Text color="gray"> (Ethereum, Base, Polygon, etc.)</Text>
              </Box>
              <Box paddingLeft={2}>
                {full ? (
                  <Text>{allChains.evm.address}</Text>
                ) : (
                  <Text>{shortenAddress(allChains.evm.address, 14, 8)}</Text>
                )}
              </Box>
            </Box>
          )}
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
  addressType: "payment" | "enterprise" | "stake";
  walletName?: string;
  password?: string;
}

export function SingleAddress({ network, addressType, walletName, password }: SingleAddressProps) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const derive = async () => {
      try {
        const mnemonic = await getMnemonicAsync(password, walletName);
        const addresses = await deriveAddresses(mnemonic, network);

        switch (addressType) {
          case "payment":
            setAddress(addresses.baseAddress);
            break;
          case "enterprise":
            setAddress(addresses.enterpriseAddress);
            break;
          case "stake":
            setAddress(addresses.stakeAddress);
            break;
        }
      } catch (err) {
        setError(getErrorMessage(err, "Unknown error"));
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
