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
  const [qrCodes, setQrCodes] = useState<{
    cardano?: string;
    bitcoin?: string;
    solana?: string;
    evm?: string;
  }>({});

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
      if (!qr || json) {
        setQrCodes({});
        return;
      }
      const entries: Array<{ key: "cardano" | "bitcoin" | "solana" | "evm"; address: string }> = [];
      if (addresses?.baseAddress) entries.push({ key: "cardano", address: addresses.baseAddress });
      if (allChains?.bitcoin?.address) entries.push({ key: "bitcoin", address: allChains.bitcoin.address });
      if (allChains?.solana?.address) entries.push({ key: "solana", address: allChains.solana.address });
      if (allChains?.evm?.address) entries.push({ key: "evm", address: allChains.evm.address });
      if (entries.length === 0) {
        setQrCodes({});
        return;
      }
      try {
        const results = await Promise.all(
          entries.map(async ({ key, address }) => {
            try {
              const qrStr = await generateQRCode(address);
              return { key, qr: qrStr } as const;
            } catch {
              return { key, qr: undefined } as const;
            }
          })
        );
        const next: typeof qrCodes = {};
        for (const { key, qr: qrStr } of results) {
          if (qrStr) next[key] = qrStr;
        }
        setQrCodes(next);
      } catch {
        setQrCodes({});
      }
    };

    genQR();
  }, [addresses, allChains, qr, json]);

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

  // JSON output (order: cardano, bitcoin, solana, evm)
  if (json) {
    const output: Record<string, unknown> = {
      network: addresses.network,
      cardano: {
        paymentAddress: addresses.baseAddress,
        enterpriseAddress: addresses.enterpriseAddress,
        stakeAddress: addresses.stakeAddress,
      },
    };
    if (allChains?.bitcoin) output.bitcoin = { address: allChains.bitcoin.address };
    if (allChains?.solana) output.solana = { address: allChains.solana.address };
    if (allChains?.evm) output.evm = { address: allChains.evm.address };
    return <Text>{JSON.stringify(output, null, 2)}</Text>;
  }

  // Regular output: per chain (Cardano, Bitcoin, Solana, EVM)
  const addr = (raw: string, prefix = 20, suffix = 12) =>
    full ? raw : shortenAddress(raw, prefix, suffix);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Wallet Addresses
        </Text>
        <Text color="gray"> ({network})</Text>
      </Box>

      {source && (
        <Box marginBottom={1}>
          <Text color="gray">Source: </Text>
          <Text color="blue">{source}</Text>
        </Box>
      )}

      {/* Cardano */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="green">Cardano</Text>
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          <Box>
            <Text color="gray">Payment (base): </Text>
            <Text>{addr(addresses.baseAddress)}</Text>
          </Box>
          {qr && qrCodes.cardano && (
            <Box marginTop={1}>
              <Text>{qrCodes.cardano}</Text>
            </Box>
          )}
          {addresses.enterpriseAddress && (
            <Box marginTop={1}>
              <Text color="gray">Enterprise: </Text>
              <Text>{addr(addresses.enterpriseAddress)}</Text>
            </Box>
          )}
          {addresses.stakeAddress && (
            <Box marginTop={1}>
              <Text color="gray">Stake: </Text>
              <Text>{addr(addresses.stakeAddress, 16, 10)}</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Bitcoin */}
      {allChains?.bitcoin && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="orange">Bitcoin</Text>
          <Box paddingLeft={2} marginTop={1}>
            <Text>{addr(allChains.bitcoin.address, 12, 8)}</Text>
            {qr && qrCodes.bitcoin && (
              <Box marginTop={1}>
                <Text>{qrCodes.bitcoin}</Text>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Solana */}
      {allChains?.solana && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="blue">Solana</Text>
          <Box paddingLeft={2} marginTop={1}>
            <Text>{addr(allChains.solana.address, 16, 8)}</Text>
            {qr && qrCodes.solana && (
              <Box marginTop={1}>
                <Text>{qrCodes.solana}</Text>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* EVM */}
      {allChains?.evm && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color="gray">EVM</Text>
            <Text color="gray"> (Ethereum, Base, Polygon, etc.)</Text>
          </Box>
          <Box paddingLeft={2} marginTop={1}>
            <Text>{addr(allChains.evm.address, 14, 8)}</Text>
            {qr && qrCodes.evm && (
              <Box marginTop={1}>
                <Text>{qrCodes.evm}</Text>
              </Box>
            )}
          </Box>
        </Box>
      )}

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
