import React from 'react';
import { Box, Text } from 'ink';
import { CardanoBalance } from './commands/cardano/balance.js';
import { CardanoUtxos } from './commands/cardano/utxos.js';
import { CardanoHistory } from './commands/cardano/history.js';
import { CardanoSend } from './commands/cardano/send.js';
import { StakePools } from './commands/stake/pools.js';
import { StakeDelegate } from './commands/stake/delegate.js';
import { StakeStatus } from './commands/stake/status.js';
import { StakeWithdraw } from './commands/stake/withdraw.js';
import { Sign } from './commands/sign.js';
import { Submit } from './commands/submit.js';
import { WalletAddress } from './commands/wallet/address.js';
import { WalletCreate } from './commands/wallet/create.js';
import { WalletRestore } from './commands/wallet/restore.js';
import { isValidNetwork, type Network } from './lib/config.js';
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
    full: boolean;
    wait: boolean;
    limit: number;
    page: number;
    asset?: string[];
  };
  showHelp: () => void;
}

function invalidUsage(message: string, usage: string) {
  return (
    <Box flexDirection="column">
      <Text color="red">Error: {message}</Text>
      <Text color="gray">Usage: {usage}</Text>
    </Box>
  );
}

export function App({ command, subcommand, args, flags, showHelp }: AppProps) {
  // No command provided
  if (!command) {
    showHelp();
    return null;
  }

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

  // ---- Top-level commands ----
  if (command === 'sign') {
    const txFile = subcommand;
    if (!txFile) return invalidUsage('Transaction file is required', "begin sign <tx-file> [options]");
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

  if (command === 'submit') {
    const txFile = subcommand;
    if (!txFile) return invalidUsage('Signed transaction file is required', "begin submit <signed-tx-file> [options]");
    return <Submit txFile={txFile} network={flags.network} wait={flags.wait} jsonOutput={flags.json} />;
  }

  // ---- Back-compat: allow legacy non-namespaced cardano commands ----
  if (command === 'balance' || command === 'utxos' || command === 'history' || command === 'send') {
    return (
      <App
        command="cardano"
        subcommand={command}
        args={[subcommand, ...args].filter((v): v is string => typeof v === 'string' && v.length > 0)}
        flags={flags}
        showHelp={showHelp}
      />
    );
  }

  // ---- Namespaced commands ----
  if (command === 'cardano') {
    if (subcommand === 'balance') {
      const address = args[0];
      if (!address) return invalidUsage('Address is required', 'begin cardano balance <address>');
      return <CardanoBalance address={address} network={network} json={flags.json} />;
    }

    if (subcommand === 'utxos') {
      const address = args[0];
      if (!address) return invalidUsage('Address is required', 'begin cardano utxos <address>');
      return <CardanoUtxos address={address} network={network} json={flags.json} />;
    }

    if (subcommand === 'history') {
      const address = args[0];
      if (!address) return invalidUsage('Address is required', 'begin cardano history <address>');
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
      if (!to || !amountStr) return invalidUsage('Recipient address and amount are required', 'begin cardano send <to> <amount> [options]');
      const amount = Number(amountStr);
      if (!Number.isFinite(amount) || amount <= 0) return invalidUsage('Amount must be a positive number', 'begin cardano send <to> <amount> [options]');
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
        <Text color="gray">Available commands: balance, utxos, history, send</Text>
      </Box>
    );
  }

  if (command === 'stake') {
    if (subcommand === 'pools') {
      const search = args[0];
      return <StakePools search={search} network={flags.network} json={flags.json} limit={flags.limit} />;
    }

    if (subcommand === 'delegate') {
      const poolId = args[0];
      if (!poolId) return invalidUsage('Pool ID is required', 'begin stake delegate <pool-id>');
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

    if (subcommand === 'create') {
      const name = args[0];
      if (!name) return invalidUsage('Wallet name is required', 'begin wallet create <name>');
      return <WalletCreate name={name} network={flags.network} />;
    }

    if (subcommand === 'restore') {
      const name = args[0];
      if (!name) return invalidUsage('Wallet name is required', 'begin wallet restore <name>');
      return <WalletRestore name={name} network={flags.network} />;
    }

    return (
      <Box flexDirection="column">
        <Text color="red">Unknown wallet command: {subcommand || '(none)'}</Text>
        <Text color="gray">Available commands: address, create, restore</Text>
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
