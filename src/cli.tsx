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

    stake pools [search]         List/search stake pools
    stake delegate <pool-id>     Delegate stake to a pool
    stake status                 Check delegation status and rewards
    stake withdraw               Withdraw staking rewards

  Options
    --network, -n   Network to use (mainnet, preprod, preview) [default: mainnet]
    --json          Output as JSON (for scripting)
    --help          Show this help message
    --version       Show version

  Examples
    $ begin cardano balance addr1qy...
    $ begin cardano send addr1qy... 10
    $ begin cardano balance addr1qy... --network preprod

    $ begin stake pools SNEK
    $ begin stake delegate pool1z5uqdk7dzdxaae5633fqfcu2eqzy3a3rgtuvy087fdld7yws0xt
    $ begin stake status --json
    $ begin stake withdraw
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
