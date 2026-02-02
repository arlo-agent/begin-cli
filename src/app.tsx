import React from 'react';
import { Box, Text } from 'ink';
import { CardanoBalance } from './commands/cardano/balance.js';
import { CardanoSend } from './commands/cardano/send.js';
import { StakePools } from './commands/stake/pools.js';
import { StakeDelegate } from './commands/stake/delegate.js';
import { StakeStatus } from './commands/stake/status.js';
import { StakeWithdraw } from './commands/stake/withdraw.js';
import { Sign } from './commands/sign.js';
import { Submit } from './commands/submit.js';
import { WalletAddress } from './commands/wallet/address.js';
import type { NetworkType } from './lib/address.js';

interface AppProps {
  command?: string;
  subcommand?: string;
  args: string[];
  flags: {
    network: string;
    wallet?: string;
    password?: string;
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
          <Text color="gray">Usage: begin sign {'<tx-file>'} [--wallet {'<name>'}] [--password {'<pass>'}]</Text>
        </Box>
      );
    }
    return (
      <Sign
        txFile={txFile}
        walletName={flags.wallet}
        password={flags.password}
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
          walletName={flags.wallet}
          password={flags.password}
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
  // Route to wallet commands
  if (command === 'wallet') {
    if (subcommand === 'address') {
      return (
        <WalletAddress
          network={flags.network as NetworkType}
          walletName={flags.wallet}
          password={flags.password}
          full={flags.full}
          json={flags.json}
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

  // Unknown command
  return (
    <Box flexDirection="column">
      <Text color="red">Unknown command: {command}</Text>
      <Text color="gray">Run `begin --help` for usage information</Text>
    </Box>
  );
}
