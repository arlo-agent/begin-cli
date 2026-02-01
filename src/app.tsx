import React from 'react';
import { Box, Text } from 'ink';
import { CardanoBalance } from './commands/cardano/balance.js';
import { CardanoSend } from './commands/cardano/send.js';
import { Receive } from './commands/receive.js';
import { WalletAddress } from './commands/wallet/address.js';

interface AppProps {
  command?: string;
  subcommand?: string;
  args: string[];
  flags: {
    network: string;
    wallet?: string;
    qr?: boolean;
    json?: boolean;
  };
  showHelp: () => void;
}

export function App({ command, subcommand, args, flags, showHelp }: AppProps) {
  // No command provided
  if (!command) {
    showHelp();
    return null;
  }

  // Route to receive command
  if (command === 'receive') {
    // For receive, the address can be passed as positional arg (subcommand position) or via --wallet flag
    const target = flags.wallet || subcommand;
    if (!target) {
      return (
        <Box flexDirection="column">
          <Text color="red">Error: Wallet name or address is required</Text>
          <Text color="gray">Usage: begin receive {'<address>'} [--qr]</Text>
          <Text color="gray">       begin receive --wallet {'<name>'} [--qr]</Text>
        </Box>
      );
    }
    return (
      <Receive
        target={target}
        showQR={flags.qr ?? false}
        json={flags.json ?? false}
        network={flags.network}
      />
    );
  }

  // Route to wallet commands
  if (command === 'wallet') {
    if (subcommand === 'address') {
      const walletName = flags.wallet || args[0];
      if (!walletName) {
        return (
          <Box flexDirection="column">
            <Text color="red">Error: Wallet name is required</Text>
            <Text color="gray">Usage: begin wallet address --wallet {'<name>'} [--qr]</Text>
          </Box>
        );
      }
      return (
        <WalletAddress
          wallet={walletName}
          showQR={flags.qr ?? false}
          json={flags.json ?? false}
          network={flags.network}
        />
      );
    }

    return (
      <Box flexDirection="column">
        <Text color="red">Unknown wallet command: {subcommand || '(none)'}</Text>
        <Text color="gray">Available commands: address</Text>
      </Box>
    );
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

  // Unknown command
  return (
    <Box flexDirection="column">
      <Text color="red">Unknown command: {command}</Text>
      <Text color="gray">Run `begin --help` for usage information</Text>
    </Box>
  );
}
