#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import meow from "meow";
import { App, type AppFlags } from "./app.js";
import { loadConfig, isValidNetwork } from "./lib/config.js";
import { setOutputContext, exitWithError } from "./lib/output.js";
import { errors } from "./lib/errors.js";

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
    wallet create <name> [--show-seed]  Create a new wallet (silent by default)
    wallet restore <name>            Restore a wallet from mnemonic (interactive)

    stake pools [search]             List/search stake pools (mock)
    stake delegate <pool-id>         Delegate stake to a pool (mock) (supports --yes)
    stake status                     Check delegation status and rewards (mock)
    stake withdraw                   Withdraw staking rewards (mock) (supports --yes)

    mint --image <path> --name <name> --to <addr>
                                     Mint an NFT via NMKR and send to address

    sign <tx-file>                   Sign an unsigned transaction file
    submit <signed-tx-file>          Submit a signed transaction file

    swap [options]               Swap tokens via Minswap aggregator
    swap quote [options]         Get a swap quote without executing
    swap orders [options]        List pending swap orders
    swap cancel --id <tx-in>     Cancel pending swap order(s)

    mcp                              Start MCP server for AI agent integration

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
    --image, -i       Image file path for NFT minting (mint only)
    --name            NFT token name (mint only, no spaces)
    --display-name    NFT display name (mint only, defaults to --name)
    --description     NFT description (mint only)
    --to, -t          Receiver address for minted NFT (mint only)
    -y, --yes         Skip confirmation prompts
    --show-seed       Show recovery phrase and addresses (wallet create only)
    --help            Show this help message
    --version         Show version

  Swap Options
    --from            Token to swap from (ADA, MIN, policyId.assetName, etc.)
    --to              Token to swap to
    --amount          Amount of input token to swap
    --slippage, -s    Slippage tolerance in % [default: 0.5]
    --multi-hop       Allow multi-hop routing [default: true]
    --yes, -y         Skip confirmation prompt
    --id, -i          Pending order tx_in (repeatable for cancel)
    --address         Wallet address for swap orders (read-only)
    --protocol        Protocol override for cancel if not in pending list

  Environment
    BEGIN_CLI_MNEMONIC           Mnemonic for CI/agent use (bypasses keystore)
    BEGIN_CLI_WALLET_PASSWORD    Wallet password for automation (--password overrides)

  Environment Variables
    BLOCKFROST_API_KEY           API key for all networks
    BLOCKFROST_API_KEY_MAINNET   API key for mainnet (overrides generic)
    BLOCKFROST_API_KEY_PREPROD   API key for preprod (overrides generic)
    BLOCKFROST_API_KEY_PREVIEW   API key for preview (overrides generic)
    NMKR_API_KEY                 NMKR API key for NFT minting
    NMKR_PROJECT_UID             NMKR Project UID for NFT minting

  Get a free Blockfrost API key at: https://blockfrost.io
  Get an NMKR API key at: https://www.nmkr.io

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
    $ begin wallet create my-wallet --show-seed
    $ begin wallet restore my-wallet
    $ begin wallet address --full
    $ begin wallet export [name] --password <pass>

    # Send ADA (uses default wallet, prompts for password)
    $ begin cardano send addr1qy... 10
    $ begin cardano send addr1qy... 10 --wallet my-wallet --password mypass
    $ begin cardano send addr1qy... 2 --asset abc123...def.HOSKY:1000

    # Swap tokens
    $ begin swap quote --from ADA --to MIN --amount 100
    $ begin swap --from ADA --to MIN --amount 100 --slippage 0.5
    $ begin swap --from ADA --to MIN --amount 100 --yes --json
    $ begin swap orders
    $ begin swap orders --address addr1qy...
    $ begin swap cancel --id <tx_in> --yes

    # Offline signing workflow
    $ begin cardano send addr1qy... 10 --dry-run --output tx.unsigned
    $ begin sign tx.unsigned --wallet my-wallet --password mypass
    $ begin submit tx.signed --network preprod --no-wait --json
    $ BEGIN_CLI_MNEMONIC="word1 word2 ..." begin cardano send addr1... 10

    # Mint NFT via NMKR
    $ begin mint --image ./avatar.png --name "MyNFT" --to addr1qy...
    $ begin mint --image ./art.png --name "Art001" --description "My art" --yes
`,
  {
    importMeta: import.meta,
    flags: {
      network: { type: "string", shortFlag: "n" },
      wallet: { type: "string", shortFlag: "w" },
      password: { type: "string", shortFlag: "p" },
      qr: { type: "boolean", default: false },
      dryRun: { type: "boolean", shortFlag: "d", default: false },
      output: { type: "string", shortFlag: "o" },
      json: { type: "boolean", shortFlag: "j", default: false },
      full: { type: "boolean", default: true },
      limit: { type: "number", shortFlag: "l", default: 10 },
      page: { type: "number", default: 1 },
      wait: { type: "boolean", default: true },
      asset: { type: "string", shortFlag: "a", isMultiple: true },
      yes: { type: "boolean", shortFlag: "y", default: false },
      image: { type: "string" },
      name: { type: "string" },
      displayName: { type: "string" },
      description: { type: "string" },
      // Swap-specific flags (to is also used by mint)
      to: { type: "string", shortFlag: "t" },
      from: { type: "string" },
      amount: { type: "string" },
      slippage: { type: "number", shortFlag: "s", default: 0.5 },
      multiHop: { type: "boolean", default: true },
      id: { type: "string", isMultiple: true },
      address: { type: "string" },
      protocol: { type: "string" },
      showSeed: { type: "boolean", default: false },
    },
  }
);

const [command, subcommand, ...args] = cli.input;

// Handle MCP command before Ink rendering
if (command === "mcp") {
  const startMcpServer = async () => {
    const { startMcpServer } = await import("./mcp/server.js");
    await startMcpServer();
  };
  startMcpServer().catch((err) => {
    console.error("MCP server error:", err);
    process.exit(1);
  });
} else {
  // Continue with normal CLI flow

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
    image?: string;
    name?: string;
    displayName?: string;
    description?: string;
    // Swap-specific flags (to is also used by mint)
    to?: string;
    from?: string;
    amount?: string;
    slippage: number;
    multiHop: boolean;
    id?: string[];
    address?: string;
    protocol?: string;
    showSeed: boolean;
  };

  const network = rawFlags.network ?? config.network ?? "mainnet";
  if (!isValidNetwork(network)) {
    exitWithError(
      errors.invalidArgument("network", `must be one of mainnet, preprod, preview (got ${network})`)
    );
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
    image: rawFlags.image,
    name: rawFlags.name,
    displayName: rawFlags.displayName,
    description: rawFlags.description,
    to: rawFlags.to,
    from: rawFlags.from,
    amount: rawFlags.amount,
    slippage: rawFlags.slippage,
    multiHop: rawFlags.multiHop,
    id: rawFlags.id,
    address: rawFlags.address,
    protocol: rawFlags.protocol,
    showSeed: rawFlags.showSeed,
  };

  setOutputContext({ json: flags.json });

  if (flags.json && !command) {
    exitWithError(errors.missingArgument("command"));
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
} // End of else block for non-MCP commands
