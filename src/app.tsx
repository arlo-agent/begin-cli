import React from 'react';
import { Box, Text } from 'ink';
import { CardanoBalance } from './commands/cardano/balance.js';
import { CardanoUtxos } from './commands/cardano/utxos.js';
import { CardanoHistory } from './commands/cardano/history.js';
import { CardanoSend } from './commands/cardano/send.js';
import type { Network } from './lib/config.js';

interface AppProps {
  command?: string;
  args: string[];
  flags: {
    network: string;
    json: boolean;
    limit: number;
    page: number;
  };
  showHelp: () => void;
}

function isValidNetwork(network: string): network is Network {
  return ['mainnet', 'preprod', 'preview'].includes(network);
}

export function App({ command, args, flags, showHelp }: AppProps) {
  // Validate network
  if (!isValidNetwork(flags.network)) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: Invalid network '{flags.network}'</Text>
        <Text color="gray">Valid networks: mainnet, preprod, preview</Text>
      </Box>
    );
  }

  const network = flags.network as Network;

  // No command provided
  if (!command) {
    showHelp();
    return null;
  }

  // Route commands
  if (command === 'balance') {
    const address = args[0];
    if (!address) {
      return (
        <Box flexDirection="column">
          <Text color="red">Error: Address is required</Text>
          <Text color="gray">Usage: begin balance {'<address>'}</Text>
        </Box>
      );
    }
    return <CardanoBalance address={address} network={network} json={flags.json} />;
  }

  if (command === 'utxos') {
    const address = args[0];
    if (!address) {
      return (
        <Box flexDirection="column">
          <Text color="red">Error: Address is required</Text>
          <Text color="gray">Usage: begin utxos {'<address>'}</Text>
        </Box>
      );
    }
    return <CardanoUtxos address={address} network={network} json={flags.json} />;
  }

  if (command === 'history') {
    const address = args[0];
    if (!address) {
      return (
        <Box flexDirection="column">
          <Text color="red">Error: Address is required</Text>
          <Text color="gray">Usage: begin history {'<address>'}</Text>
        </Box>
      );
    }
    return (
      <CardanoHistory
        address={address}
        network={network}
        json={flags.json}
        limit={flags.limit}
        page={flags.page}
      />
    );
  }

  if (command === 'send') {
    const [to, amountStr] = args;
    if (!to || !amountStr) {
      return (
        <Box flexDirection="column">
          <Text color="red">Error: Recipient address and amount are required</Text>
          <Text color="gray">Usage: begin send {'<to>'} {'<amount>'}</Text>
        </Box>
      );
    }
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return (
        <Box flexDirection="column">
          <Text color="red">Error: Invalid amount</Text>
          <Text color="gray">Amount must be a positive number</Text>
        </Box>
      );
    }
    return <CardanoSend to={to} amount={amount} network={flags.network} />;
  }

  // Unknown command
  return (
    <Box flexDirection="column">
      <Text color="red">Unknown command: {command}</Text>
      <Text color="gray">Run `begin --help` for usage information</Text>
    </Box>
  );
}
