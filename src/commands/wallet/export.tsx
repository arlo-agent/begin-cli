/**
 * 'begin wallet export' command
 *
 * Decrypts the wallet and displays the 24-word mnemonic phrase.
 * Use with care: anyone with the mnemonic has full control of the wallet.
 */

import React, { useState, useEffect } from "react";
import { Box, Text, Newline } from "ink";
import {
  getMnemonicAsync,
  getPasswordFromEnv,
  listWallets,
  getDefaultWallet,
  walletExists,
  hasEnvMnemonic,
  PASSWORD_ENV_VAR,
} from "../../lib/keystore.js";

interface WalletExportProps {
  walletName?: string;
  password?: string;
  json?: boolean;
}

type LoadingState = "loading" | "need_password" | "need_wallet" | "success" | "error";

function resolveWalletName(walletName?: string): string | null {
  if (walletName && walletExists(walletName)) {
    return walletName;
  }
  const defaultWallet = getDefaultWallet();
  if (defaultWallet && walletExists(defaultWallet)) {
    return defaultWallet;
  }
  const wallets = listWallets();
  if (wallets.length === 1) {
    return wallets[0];
  }
  return null;
}

export function WalletExport({
  walletName: walletNameProp,
  password,
  json = false,
}: WalletExportProps) {
  const [state, setState] = useState<LoadingState>("loading");
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        if (hasEnvMnemonic()) {
          setError(
            "Export is for file-based wallets. Unset BEGIN_CLI_MNEMONIC to export a wallet from ~/.begin-cli/wallets/"
          );
          setState("error");
          return;
        }

        const name = resolveWalletName(walletNameProp);
        if (!name) {
          const wallets = listWallets();
          if (wallets.length === 0) {
            setError(
              "No wallets found in ~/.begin-cli/wallets/. Create or restore a wallet first."
            );
          } else {
            setError(
              `Multiple wallets found. Specify one: begin wallet export --wallet <name>\n` +
                `  Wallets: ${wallets.join(", ")}`
            );
          }
          setState("need_wallet");
          return;
        }

        const effectivePassword = password || getPasswordFromEnv() || undefined;

        let phrase: string;
        try {
          phrase = await getMnemonicAsync(effectivePassword, name);
        } catch (e) {
          if (
            e instanceof Error &&
            (e.message.includes("Password required") ||
              e.message.includes("password") ||
              e.message.includes("decrypt"))
          ) {
            setState("need_password");
            return;
          }
          throw e;
        }
        setMnemonic(phrase);
        setResolvedName(name);
        setState("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setState("error");
      }
    };

    run();
  }, [walletNameProp, password]);

  if (state === "loading") {
    return (
      <Box>
        <Text>⏳ Decrypting wallet...</Text>
      </Box>
    );
  }

  if (state === "need_password") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">🔐 Password required to decrypt this wallet</Text>
        <Newline />
        <Text color="gray">
          Use --password or set {PASSWORD_ENV_VAR}. Example: begin wallet export --wallet
          &lt;name&gt; --password your-password
        </Text>
      </Box>
    );
  }

  if (state === "need_wallet") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  if (state === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (state !== "success" || !mnemonic) {
    return null;
  }

  const words = mnemonic.trim().split(/\s+/);

  if (json) {
    return (
      <Text>
        {JSON.stringify(
          { wallet: resolvedName ?? undefined, mnemonic: mnemonic.trim(), wordCount: words.length },
          null,
          2
        )}
      </Text>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="red">
          ⚠️ Keep this phrase secret. Anyone with these words can control your wallet.
        </Text>
      </Box>
      {resolvedName && (
        <Box marginBottom={1}>
          <Text color="gray">Wallet: </Text>
          <Text color="cyan">{resolvedName}</Text>
        </Box>
      )}
      <Box marginBottom={1}>
        <Text color="green">Mnemonic (24 words):</Text>
      </Box>
      <Box flexDirection="column" paddingLeft={2}>
        {Array.from({ length: Math.ceil(words.length / 4) }).map((_, row) => (
          <Box key={row}>
            {words.slice(row * 4, row * 4 + 4).map((word, i) => (
              <Text key={row * 4 + i}>
                {word}
                {row * 4 + i < words.length - 1 ? "   " : ""}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
      <Newline />
      <Text color="gray" dimColor>
        One-line: {mnemonic.trim()}
      </Text>
    </Box>
  );
}
