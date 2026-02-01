#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App } from './app.js';
import { setOutputContext } from './lib/output.js';

const cli = meow(
  `
  Usage
    $ begin <command> [options]

  Commands
    balance <address>    Check ADA balance for an address
    utxos <address>      List UTXOs for an address
    history <address>    Show transaction history for an address
    send <to> <amount>   Send ADA to an address

  Options
    --network, -n   Network to use (mainnet, preprod, preview) [default: mainnet]
    --json          Output as JSON (machine-readable)
    --limit         Number of items to show (history) [default: 10]
    --page          Page number for pagination (history) [default: 1]
    --help          Show this help message
    --version       Show version

  Examples
    $ begin balance addr1qy...
    $ begin utxos addr1qy... --json
    $ begin history addr1qy... --limit 20 --page 2
    $ begin balance addr1qy... --network preprod
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
        default: false,
      },
      limit: {
        type: 'number',
        default: 10,
      },
      page: {
        type: 'number',
        default: 1,
      },
    },
  }
);

// Set output context for JSON mode
setOutputContext({ json: cli.flags.json });

const [command, ...args] = cli.input;

render(
  <App
    command={command}
    args={args}
    flags={cli.flags}
    showHelp={cli.showHelp}
  />
);
