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
    receive <address>            Display address with optional QR code for receiving ADA
    wallet address               Show wallet's receiving address
    cardano balance <address>    Check ADA balance for an address
    cardano send <to> <amount>   Send ADA to an address

  Options
    --network, -n   Network to use (mainnet, preprod, preview) [default: mainnet]
    --wallet, -w    Wallet name
    --qr            Display QR code for address
    --json          Output as JSON
    --help          Show this help message
    --version       Show version

  Examples
    $ begin receive addr1qy... --qr
    $ begin receive --wallet mywallet --qr
    $ begin wallet address --wallet mywallet --qr
    $ begin cardano balance addr1qy...
    $ begin cardano send addr1qy... 10
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
      qr: {
        type: 'boolean',
        default: false,
      },
      json: {
        type: 'boolean',
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
