#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App } from './app.js';
import { loadConfig, isValidNetwork } from './lib/config.js';
import { outputError } from './lib/output.js';
import { UserError, ErrorCode } from './lib/errors.js';

const cli = meow(
  `
  Usage
    $ begin <command> [options]

  Commands
    wallet create <name>         Create a new wallet
    wallet list                  List all wallets
    wallet balance [name]        Check wallet balance
    
    cardano balance <address>    Check ADA balance for an address
    cardano send <to> <amount>   Send ADA to an address

  Options
    --network, -n   Network to use (mainnet, preprod, preview)
    --json, -j      Output as JSON
    --help          Show this help message
    --version       Show version

  Examples
    $ begin cardano balance addr1qy...
    $ begin cardano balance addr1qy... --json
    $ begin cardano send addr1qy... 10 --network preprod
`,
  {
    importMeta: import.meta,
    flags: {
      network: {
        type: 'string',
        shortFlag: 'n',
      },
      json: {
        type: 'boolean',
        shortFlag: 'j',
        default: false,
      },
    },
  }
);

// Load config for defaults
const config = loadConfig();
const ctx = { json: cli.flags.json };

// Resolve network: flag > config > default
const network = cli.flags.network || config.network;

// Validate network
if (!isValidNetwork(network)) {
  outputError(
    new UserError(`Invalid network: ${network}. Use mainnet, preprod, or preview.`, ErrorCode.INVALID_NETWORK),
    ctx
  );
}

const [command, subcommand, ...args] = cli.input;

// Pre-render validation for JSON mode (avoid React warnings)
if (ctx.json) {
  if (!command) {
    outputError(new UserError('No command provided', ErrorCode.MISSING_ARGUMENT), ctx);
  }
  
  if (command === 'cardano') {
    if (subcommand === 'balance' && !args[0]) {
      outputError(new UserError('Address is required', ErrorCode.MISSING_ARGUMENT), ctx);
    }
    if (subcommand === 'send') {
      if (!args[0] || !args[1]) {
        outputError(new UserError('Recipient address and amount are required', ErrorCode.MISSING_ARGUMENT), ctx);
      }
      const amount = parseFloat(args[1]);
      if (isNaN(amount) || amount <= 0) {
        outputError(new UserError('Amount must be a positive number', ErrorCode.INVALID_AMOUNT), ctx);
      }
    }
    if (!subcommand || !['balance', 'send'].includes(subcommand)) {
      outputError(new UserError(`Unknown cardano command: ${subcommand || '(none)'}`, ErrorCode.UNKNOWN_COMMAND), ctx);
    }
  } else {
    outputError(new UserError(`Unknown command: ${command}`, ErrorCode.UNKNOWN_COMMAND), ctx);
  }
}

const { waitUntilExit } = render(
  <App
    command={command}
    subcommand={subcommand}
    args={args}
    flags={{
      network,
      json: cli.flags.json,
    }}
    showHelp={cli.showHelp}
  />
);

// Handle exit
waitUntilExit().then(() => {
  process.exit(0);
}).catch(() => {
  process.exit(1);
});
