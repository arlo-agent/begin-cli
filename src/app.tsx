import React from 'react';
import { Box, Text } from 'ink';
import { CardanoBalance } from './commands/cardano/balance.js';
import { CardanoSend } from './commands/cardano/send.js';
import { Sign } from './commands/sign.js';
import { Submit } from './commands/submit.js';

interface AppProps {
  command?: string;
  subcommand?: string;
  args: string[];
  flags: {
    network: string;
    wallet?: string;
    dryRun: boolean;
    output?: string;
    json: boolean;
    wait: boolean;
    asset?: string[];
  };
  showHelp: () => void;
}

export function App({ command, subcommand, args, flags, showHelp }: AppProps) {
  // No command provided
  if (!command) {
    showHelp();
    return null;
  }

  // Sign command: begin sign <tx-file>
  if (command === 'sign') {
    const txFile = subcommand; // subcommand is actually the first arg here
    if (!txFile) {
      return (
        <Box flexDirection="column">
          <Text color="red">Error: Transaction file is required</Text>
          <Text color="gray">Usage: begin sign {'<tx-file>'} [--wallet {'<path>'}]</Text>
        </Box>
      );
    }
    return (
      <Sign
        txFile={txFile}
        walletPath={flags.wallet}
        network={flags.network}
        outputFile={flags.output}
        jsonOutput={flags.json}
      />
    );
  }

  // Submit command: begin submit <signed-tx-file>
  if (command === 'submit') {
    const txFile = subcommand;
    if (!txFile) {
      return (
        <Box flexDirection="column">
          <Text color="red">Error: Signed transaction file is required</Text>
          <Text color="gray">Usage: begin submit {'<signed-tx-file>'} [--network {'<network>'}]</Text>
        </Box>
      );
    }
    return (
      <Submit
        txFile={txFile}
        network={flags.network}
        wait={flags.wait}
        jsonOutput={flags.json}
      />
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
            <Text color="gray">Usage: begin cardano send {'<to>'} {'<amount>'} [options]</Text>
            <Text color="gray">Options:</Text>
            <Text color="gray">  --dry-run, -d    Build but don't submit</Text>
            <Text color="gray">  --asset, -a      Add native token (policyId.name:amount)</Text>
            <Text color="gray">  --json, -j       Output as JSON</Text>
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
      return (
        <CardanoSend
          to={to}
          amount={amount}
          network={flags.network}
          walletPath={flags.wallet}
          assets={flags.asset}
          dryRun={flags.dryRun}
          outputFile={flags.output}
          jsonOutput={flags.json}
        />
      );
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
