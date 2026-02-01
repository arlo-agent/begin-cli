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
    cardano balance <address>    Check ADA and native token balance
    cardano utxos <address>      List all UTXOs for an address
    cardano history <address>    Show transaction history
    cardano send <to> <amount>   Send ADA to an address

  Options
    --network, -n   Network to use (mainnet, preprod, preview) [default: mainnet]
    --json, -j      Output as JSON (machine-readable)
    --limit, -l     Number of items to show (for history) [default: 10]
    --page, -p      Page number for pagination (for history) [default: 1]
    --help          Show this help message
    --version       Show version

  Environment Variables
    BLOCKFROST_API_KEY           API key for all networks
    BLOCKFROST_API_KEY_MAINNET   API key for mainnet (overrides generic)
    BLOCKFROST_API_KEY_PREPROD   API key for preprod (overrides generic)
    BLOCKFROST_API_KEY_PREVIEW   API key for preview (overrides generic)

  Examples
    $ begin cardano balance addr1qy...
    $ begin cardano balance addr1qy... --json
    $ begin cardano utxos addr1qy... --network preprod
    $ begin cardano history addr1qy... --limit 20 --page 2
    $ begin cardano send addr1qy... 10

  Get a free Blockfrost API key at: https://blockfrost.io
`,
  {
    importMeta: import.meta,
    flags: {
      network: {
        type: 'string',
        shortFlag: 'n',
        default: 'mainnet',
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
