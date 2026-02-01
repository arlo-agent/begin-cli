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
    sign <tx-file>                  Sign an unsigned transaction
    submit <signed-tx-file>         Submit a signed transaction

  Options
    --network, -n     Network to use (mainnet, preprod, preview) [default: mainnet]
    --wallet, -w      Path to wallet file [default: ~/.begin/wallet.key]
    --dry-run, -d     Build transaction but don't submit (save unsigned tx)
    --output, -o      Output file path for unsigned/signed transaction
    --json, -j        Output result as JSON
    --no-wait         Don't wait for confirmation (submit only)
    --asset, -a       Native asset to send (format: policyId.assetName:amount)
                      Can be specified multiple times
    --help            Show this help message
    --version         Show version

  Examples
    # Check balance
    $ begin cardano balance addr1qy...
    $ begin cardano balance addr1qy... --network preprod

    # Send ADA
    $ begin cardano send addr1qy... 10
    $ begin cardano send addr1qy... 10 --dry-run --output my-tx.unsigned
    $ begin cardano send addr1qy... 10 --json

    # Send ADA with native tokens
    $ begin cardano send addr1qy... 2 --asset abc123...def.HOSKY:1000

    # Offline signing workflow
    $ begin cardano send addr1qy... 10 --dry-run --output tx.unsigned
    $ begin sign tx.unsigned --output tx.signed
    $ begin submit tx.signed

    # Sign transaction
    $ begin sign tx.unsigned --wallet ~/.begin/wallet.key

    # Submit transaction
    $ begin submit tx.signed --network preprod
    $ begin submit tx.signed --no-wait --json
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

render(
  <App
    command={command}
    subcommand={subcommand}
    args={args}
    flags={cli.flags}
    showHelp={cli.showHelp}
  />
);
