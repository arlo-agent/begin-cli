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

  Options
    --network, -n   Network to use (mainnet, preprod, preview) [default: mainnet]
    --help          Show this help message
    --version       Show version

  Examples
    $ begin cardano balance addr1qy...
    $ begin cardano send addr1qy... 10
    $ begin cardano balance addr1qy... --network preprod
`,
  {
    importMeta: import.meta,
    flags: {
      network: {
        type: 'string',
        shortFlag: 'n',
        default: 'mainnet',
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
