import React from 'react';
import { Box, Text } from 'ink';
import { CardanoBalance } from './commands/cardano/balance.js';
import { CardanoSend } from './commands/cardano/send.js';
import { StakePools } from './commands/stake/pools.js';
import { StakeDelegate } from './commands/stake/delegate.js';
import { StakeStatus } from './commands/stake/status.js';
import { StakeWithdraw } from './commands/stake/withdraw.js';

interface AppProps {
  command?: string;
  subcommand?: string;
  args: string[];
  flags: {
    network: string;
    json: boolean;
  };
  showHelp: () => void;
}

export function App({ command, subcommand, args, flags, showHelp }: AppProps) {
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
      return <CardanoBalance address={address} network={flags.network} />;
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
      return <CardanoSend to={to} amount={amount} network={flags.network} />;
    }

    return (
      <Box flexDirection="column">
        <Text color="red">Unknown cardano command: {subcommand || '(none)'}</Text>
        <Text color="gray">Available commands: balance, send</Text>
      </Box>
    );
  }

  // Route to stake commands
  if (command === 'stake') {
    if (subcommand === 'pools') {
      const search = args[0]; // Optional search term
      return <StakePools search={search} network={flags.network} json={flags.json} />;
    }

    if (subcommand === 'delegate') {
      const poolId = args[0];
      if (!poolId) {
        return (
          <Box flexDirection="column">
            <Text color="red">Error: Pool ID is required</Text>
            <Text color="gray">Usage: begin stake delegate {'<pool-id>'}</Text>
            <Text color="gray">Use `begin stake pools` to find pools</Text>
          </Box>
        );
      }
      return <StakeDelegate poolId={poolId} network={flags.network} json={flags.json} />;
    }

    if (subcommand === 'status') {
      return <StakeStatus network={flags.network} json={flags.json} />;
    }

    if (subcommand === 'withdraw') {
      return <StakeWithdraw network={flags.network} json={flags.json} />;
    }

    return (
      <Box flexDirection="column">
        <Text color="red">Unknown stake command: {subcommand || '(none)'}</Text>
        <Text color="gray">Available commands: pools, delegate, status, withdraw</Text>
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
