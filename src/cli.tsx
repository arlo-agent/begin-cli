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
    cardano balance <address>    Check ADA balance for an address
    cardano send <to> <amount>   Send ADA to an address

    wallet address               Show wallet addresses (payment, enterprise, stake)

  Options
    --network, -n    Network to use (mainnet, preprod, preview) [default: mainnet]
    --password, -p   Password to decrypt wallet file
    --wallet, -w     Wallet name to use (defaults to default wallet)
    --full, -f       Show full addresses (no truncation)
    --json, -j       Output as JSON
    --help           Show this help message
    --version        Show version

  Environment Variables
    BEGIN_CLI_MNEMONIC   Mnemonic phrase for CI/agent use (takes priority over file)

  Examples
    $ begin cardano balance addr1qy...
    $ begin cardano send addr1qy... 10
    $ begin cardano balance addr1qy... --network preprod

    $ begin wallet address
    $ begin wallet address --network preprod --full
    $ begin wallet address --password mypassword
    $ BEGIN_CLI_MNEMONIC="word1 word2 ..." begin wallet address
`,
  {
    importMeta: import.meta,
    flags: {
      network: {
        type: 'string',
        shortFlag: 'n',
        default: 'mainnet',
      },
      password: {
        type: 'string',
        shortFlag: 'p',
      },
      wallet: {
        type: 'string',
        shortFlag: 'w',
      },
      full: {
        type: 'boolean',
        shortFlag: 'f',
        default: false,
      },
      json: {
        type: 'boolean',
        shortFlag: 'j',
        default: false,
      },
    },
  }
);

const [command, subcommand, ...args] = cli.input;

render(
  <App
    command={command}
    subcommand={subcommand}
    args={args}
    flags={cli.flags}
    showHelp={cli.showHelp}
  />
);
