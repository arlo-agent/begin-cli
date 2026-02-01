import React from 'react';
import { Box, Text } from 'ink';
import { CardanoBalance } from './commands/cardano/balance.js';
import { CardanoUtxos } from './commands/cardano/utxos.js';
import { CardanoHistory } from './commands/cardano/history.js';
import { CardanoSend } from './commands/cardano/send.js';
import type { Network } from './lib/config.js';
import { isValidNetwork } from './lib/config.js';

interface AppProps {
  command?: string;
  subcommand?: string;
  args: string[];
  flags: {
    network: string;
    json: boolean;
    limit: number;
    page: number;
  };
  showHelp: () => void;
}

export function App({ command, subcommand, args, flags, showHelp }: AppProps) {
  // Validate network
  const network: Network = isValidNetwork(flags.network) ? flags.network : 'mainnet';

  // No command provided
  if (!command) {
    showHelp();
    return null;
  }

  // Route to cardano commands
  if (command === 'cardano') {
    if (subcommand === 'balance') {
      const address = args[0];
      if (!address) {
        return (
          <Box flexDirection="column">
            <Text color="red">Error: Address is required</Text>
            <Text color="gray">Usage: begin cardano balance {'<address>'}</Text>
          </Box>
        );
      }
      return <CardanoBalance address={address} network={network} json={flags.json} />;
    }

    if (subcommand === 'utxos') {
      const address = args[0];
      if (!address) {
        return (
          <Box flexDirection="column">
            <Text color="red">Error: Address is required</Text>
            <Text color="gray">Usage: begin cardano utxos {'<address>'}</Text>
          </Box>
        );
      }
      return <CardanoUtxos address={address} network={network} json={flags.json} />;
    }

    if (subcommand === 'history') {
      const address = args[0];
      if (!address) {
        return (
          <Box flexDirection="column">
            <Text color="red">Error: Address is required</Text>
            <Text color="gray">Usage: begin cardano history {'<address>'}</Text>
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

    if (subcommand === 'send') {
      const [to, amountStr] = args;
      if (!to || !amountStr) {
        return (
          <Box flexDirection="column">
            <Text color="red">Error: Recipient address and amount are required</Text>
            <Text color="gray">Usage: begin cardano send {'<to>'} {'<amount>'}</Text>
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
      return <CardanoSend to={to} amount={amount} network={network} json={flags.json} />;
    }

    return (
      <Box flexDirection="column">
        <Text color="red">Unknown cardano command: {subcommand || '(none)'}</Text>
        <Text color="gray">Available commands: balance, utxos, history, send</Text>
      </Box>
    );
  }

  // Unknown command
  return (
    <Box flexDirection="column">
      <Text color="red">Unknown command: {command}</Text>
      <Text color="gray">Run `begin --help` for usage information</Text>
    </Box>
  );
}
