/**
 * 'begin wallet list' command
 *
 * Lists all saved wallets, the default wallet (if set), and whether
 * BEGIN_CLI_MNEMONIC is in use.
 */

import React from "react";
import { Box, Text, Newline } from "ink";
import { getWalletList } from "../../core/wallet.js";

interface WalletListProps {
  json?: boolean;
}

export function WalletList({ json = false }: WalletListProps) {
  const result = getWalletList();

  if (json) {
    return <Text>{JSON.stringify(result)}</Text>;
  }

  if (result.wallets.length === 0 && !result.hasEnvMnemonic) {
    return (
      <Box flexDirection="column">
        <Text color="gray">No wallets in ~/.begin-cli/wallets/</Text>
        <Text color="gray">Create one: begin wallet create &lt;name&gt;</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {result.hasEnvMnemonic && (
        <>
          <Text color="cyan">Env mnemonic:</Text>
          <Text color="gray">  BEGIN_CLI_MNEMONIC is set (wallet from environment)</Text>
          <Newline />
        </>
      )}
      {result.wallets.length > 0 && (
        <>
          <Text color="cyan">Wallets:</Text>
          {result.wallets.map((name) => (
            <Text key={name}>
              {"  "}
              {name}
              {result.defaultWallet === name ? " (default)" : ""}
            </Text>
          ))}
        </>
      )}
    </Box>
  );
}
