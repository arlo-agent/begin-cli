#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App } from './app.js';

const cli = meow(
  `
  Usage
    $ begin <command> [options]

  Commands
    cardano balance <address>       Check ADA balance for an address
    cardano send <to> <amount>      Send ADA to an address
    cardano utxos <address>      List all UTXOs for an address
    cardano history <address>    Show transaction history
    sign <tx-file>                  Sign an unsigned transaction
    submit <signed-tx-file>         Submit a signed transaction

    wallet address               Show wallet addresses (payment, enterprise, stake)

    stake pools [search]         List/search stake pools
    stake delegate <pool-id>     Delegate stake to a pool
    stake status                 Check delegation status and rewards
    stake withdraw               Withdraw staking rewards

  Options
    --network, -n     Network to use (mainnet, preprod, preview) [default: mainnet]
    --wallet, -w      Wallet name from keystore (uses default if not specified)
    --password, -p    Password for wallet decryption (or set interactively)
    --dry-run, -d     Build transaction but don't submit (save unsigned tx)
    --output, -o      Output file path for unsigned/signed transaction
    --json, -j        Output result as JSON
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
    # Check balance
    $ begin cardano balance addr1qy...
    $ begin cardano balance addr1qy... --json
    $ begin cardano utxos addr1qy... --network preprod
    $ begin cardano history addr1qy... --limit 20 --page 2

    $ begin cardano balance addr1qy... --network preprod

    $ begin stake pools SNEK
    $ begin stake delegate pool1z5uqdk7dzdxaae5633fqfcu2eqzy3a3rgtuvy087fdld7yws0xt
    $ begin stake status --json
    $ begin stake withdraw
    
    # Send ADA (uses default wallet, prompts for password)
    $ begin cardano send addr1qy... 10
    $ begin cardano send addr1qy... 10 --wallet my-wallet --password mypass
    $ begin cardano send addr1qy... 10 --json

    # Send ADA with native tokens
    $ begin cardano send addr1qy... 2 --asset abc123...def.HOSKY:1000

    # Offline signing workflow
    $ begin cardano send addr1qy... 10 --dry-run --output tx.unsigned
    $ begin sign tx.unsigned --wallet my-wallet
    $ begin submit tx.signed

    # Sign transaction (with specific wallet)
    $ begin sign tx.unsigned --wallet my-wallet --password mypass

    # Submit transaction
    $ begin submit tx.signed --network preprod
    $ begin submit tx.signed --no-wait --json

    # CI/Agent use (via environment variable)
    $ BEGIN_CLI_MNEMONIC="word1 word2 ..." begin cardano send addr1... 10
`,
  {
    importMeta: import.meta,
    flags: {
      network: {
        type: 'string',
        shortFlag: 'n',
        default: 'mainnet',
      },
      wallet: {
        type: 'string',
        shortFlag: 'w',
      },
      password: {
        type: 'string',
        shortFlag: 'p',
      },
      dryRun: {
        type: 'boolean',
        shortFlag: 'd',
        default: false,
      },
      output: {
        type: 'string',
        shortFlag: 'o',
      },
      json: {
        type: 'boolean',
        shortFlag: 'j',
        default: false,
      },
      limit: {
        type: 'number',
        shortFlag: 'l',
        default: 10,
      },
      page: {
        type: 'number',
        shortFlag: 'p',
        default: 1,
      wait: {
        type: 'boolean',
        default: true,
      },
      asset: {
        type: 'string',
        shortFlag: 'a',
        isMultiple: true,
      },
    },
  }
);

const [command, subcommand, ...args] = cli.input;

// Type assertion for flags
const flags = cli.flags as {
  network: string;
  json: boolean;
  limit: number;
  page: number;
};

render(
  <App
    command={command}
    subcommand={subcommand}
    args={args}
    flags={flags}
    showHelp={cli.showHelp}
  />
);
