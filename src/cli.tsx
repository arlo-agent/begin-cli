#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App, type AppFlags } from './app.js';
import { loadConfig, isValidNetwork } from './lib/config.js';
import { setOutputContext, exitWithError } from './lib/output.js';
import { errors } from './lib/errors.js';

const cli = meow(
  `
  Usage
    $ begin <command> [subcommand] [...args] [options]

  Commands
    receive <address>                Display address with optional QR code for receiving ADA
    receive --wallet <name>          Display wallet receive address with optional QR code

    cardano balance <address>        Check ADA balance for an address
    cardano utxos <address>          List UTXOs for an address
    cardano history <address>        Show transaction history for an address
    cardano send <to> <amount>       Send ADA (and native assets)

    wallet address                   Show derived wallet addresses
    wallet create <name>             Create a new wallet (interactive)
    wallet restore <name>            Restore a wallet from mnemonic (interactive)

    stake pools [search]             List/search stake pools (mock)
    stake delegate <pool-id>         Delegate stake to a pool (mock, supports --yes)
    stake status                     Check delegation status and rewards (mock)
    stake withdraw                   Withdraw staking rewards (mock, supports --yes)

    sign <tx-file>                   Sign an unsigned transaction file
    submit <signed-tx-file>          Submit a signed transaction file

  Options
    --network, -n     Network to use (mainnet, preprod, preview) [default: mainnet]
    --wallet, -w      Wallet name from keystore (uses default if not specified)
    --password        Password for wallet decryption (or set interactively)
    --qr              Display QR code (receive only)
    --dry-run, -d     Build transaction but don't submit (save unsigned tx)
    --output, -o      Output file path for unsigned/signed transaction
    --json, -j        Output result as JSON
    --full            Show full addresses (wallet address)
    --limit, -l       Number of items to show (history) [default: 10]
    --page            Page number for pagination (history) [default: 1]
    --no-wait         Don't wait for confirmation (submit only)
    --asset, -a       Native asset to send (format: policyId.assetName:amount)
                      Can be specified multiple times
    --help            Show this help message
    --version         Show version

  Environment
    BEGIN_CLI_MNEMONIC    Mnemonic for CI/agent use (bypasses keystore)

  Environment Variables
    BLOCKFROST_API_KEY           API key for all networks
    BLOCKFROST_API_KEY_MAINNET   API key for mainnet (overrides generic)
    BLOCKFROST_API_KEY_PREPROD   API key for preprod (overrides generic)
    BLOCKFROST_API_KEY_PREVIEW   API key for preview (overrides generic)

  Get a free Blockfrost API key at: https://blockfrost.io

  Examples
    # Receive (QR)
    $ begin receive addr1qy... --qr
    $ begin receive --wallet my-wallet --qr

    # Cardano read-only
    $ begin cardano balance addr1qy...
    $ begin cardano utxos addr1qy... --json
    $ begin cardano history addr1qy... --limit 20 --page 2

    # Create/restore wallets
    $ begin wallet create my-wallet
    $ begin wallet restore my-wallet
    $ begin wallet address --full

    # Send ADA (uses default wallet, prompts for password)
    $ begin cardano send addr1qy... 10
    $ begin cardano send addr1qy... 10 --wallet my-wallet --password mypass
    $ begin cardano send addr1qy... 2 --asset abc123...def.HOSKY:1000

    # Offline signing workflow
    $ begin cardano send addr1qy... 10 --dry-run --output tx.unsigned
    $ begin sign tx.unsigned --wallet my-wallet --password mypass
    $ begin submit tx.signed --network preprod --no-wait --json
    $ BEGIN_CLI_MNEMONIC="word1 word2 ..." begin cardano send addr1... 10
`,
  {
    importMeta: import.meta,
    flags: {
      network: { type: 'string', shortFlag: 'n' },
      wallet: { type: 'string', shortFlag: 'w' },
      password: { type: 'string' },
      qr: { type: 'boolean', default: false },
      dryRun: { type: 'boolean', shortFlag: 'd', default: false },
      output: { type: 'string', shortFlag: 'o' },
      json: { type: 'boolean', shortFlag: 'j', default: false },
      full: { type: 'boolean', default: false },
      limit: { type: 'number', shortFlag: 'l', default: 10 },
      page: { type: 'number', default: 1 },
      wait: { type: 'boolean', default: true },
      asset: { type: 'string', shortFlag: 'a', isMultiple: true },
      yes: { type: 'boolean', shortFlag: 'y', default: false },
    },
  }
);

const [command, subcommand, ...args] = cli.input;

// Load config defaults
const config = loadConfig();

// Type assertion for raw flags (meow is loosely typed)
const rawFlags = cli.flags as {
  network?: string;
  wallet?: string;
  password?: string;
  qr: boolean;
  dryRun: boolean;
  output?: string;
  json: boolean;
  full: boolean;
  wait: boolean;
  limit: number;
  page: number;
  asset?: string[];
  yes: boolean;
};

const network = rawFlags.network ?? config.network ?? 'mainnet';
if (!isValidNetwork(network)) {
  exitWithError(errors.invalidArgument('network', `must be one of mainnet, preprod, preview (got ${network})`));
}

const flags: AppFlags = {
  network,
  wallet: rawFlags.wallet ?? config.defaultWallet,
  password: rawFlags.password,
  qr: rawFlags.qr,
  dryRun: rawFlags.dryRun,
  output: rawFlags.output,
  json: rawFlags.json,
  full: rawFlags.full,
  wait: rawFlags.wait,
  limit: rawFlags.limit,
  page: rawFlags.page,
  asset: rawFlags.asset,
  yes: rawFlags.yes,
};

setOutputContext({ json: flags.json });

if (flags.json && !command) {
  exitWithError(errors.missingArgument('command'));
}

const { waitUntilExit } = render(
  <App
    command={command}
    subcommand={subcommand}
    args={args}
    flags={flags}
    showHelp={cli.showHelp}
  />
);

waitUntilExit()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
