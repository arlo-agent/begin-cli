import React from "react";
import { Box, Text } from "ink";
import { CardanoBalance } from "./commands/cardano/balance.js";
import { CardanoUtxos } from "./commands/cardano/utxos.js";
import { CardanoHistory } from "./commands/cardano/history.js";
import { CardanoSend } from "./commands/cardano/send.js";
import { Receive } from "./commands/receive.js";
import { StakePools } from "./commands/stake/pools.js";
import { StakeDelegate } from "./commands/stake/delegate.js";
import { StakeStatus } from "./commands/stake/status.js";
import { StakeWithdraw } from "./commands/stake/withdraw.js";
import { Sign } from "./commands/sign.js";
import { Submit } from "./commands/submit.js";
import { WalletAddress } from "./commands/wallet/address.js";
import { Swap, SwapCancel, SwapOrders } from "./commands/swap/index.js";
import { SwapQuote } from "./commands/swap/quote.js";
import { WalletCreate } from "./commands/wallet/create.js";
import { WalletRestore } from "./commands/wallet/restore.js";
import { WalletExport } from "./commands/wallet/export.js";
import { WalletList } from "./commands/wallet/list.js";
import { PolicyShow } from "./commands/policy/show.js";
import { PolicySet } from "./commands/policy/set.js";
import { MintCommand } from "./commands/mint/index.js";
import { TokenSearch } from "./commands/token/search.js";
import { TokenPrice } from "./commands/token/price.js";
import { Buy } from "./commands/buy.js";
import { isValidNetwork, type Network } from "./lib/config.js";
import type { NetworkType } from "./lib/address.js";

export interface AppFlags {
  network: string;
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
  // Mint command flags
  image?: string;
  name?: string;
  displayName?: string;
  description?: string;
  // Swap-specific flags (to is shared with mint)
  to?: string;
  // Buy-specific flags
  currency: string;
  token: string;
  // Swap-specific flags
  from?: string;
  amount?: string;
  slippage: number;
  multiHop: boolean;
  address?: string;
  id?: string[];
  protocol?: string;
  showSeed: boolean;
  yes: boolean;
  // Token discovery flags
  trending: boolean;
}

interface AppProps {
  command?: string;
  subcommand?: string;
  args: string[];
  flags: AppFlags;
  showHelp: () => void;
}

function invalidUsage(message: string, usage: string) {
  return (
    <Box flexDirection="column">
      <Text color="red">Error: {message}</Text>
      <Text color="gray">Usage: {usage}</Text>
    </Box>
  );
}

export function App({ command, subcommand, args, flags, showHelp }: AppProps) {
  // No command provided (non-JSON mode only - JSON handled in cli.tsx)
  if (!command) {
    showHelp();
    return null;
  }

  // Validate network
  if (!isValidNetwork(flags.network)) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: Invalid network '{flags.network}'</Text>
        <Text color="gray">Valid networks: mainnet, preprod, preview</Text>
      </Box>
    );
  }
  const network = flags.network as Network;

  // ---- Top-level commands ----
  if (command === "receive") {
    // Accept either a raw address (positional) or a wallet name via --wallet
    const target = subcommand ?? args[0] ?? flags.wallet;
    if (!target) {
      return invalidUsage(
        "Wallet name or address is required",
        "begin receive <address> [--qr] | begin receive --wallet <name> [--qr]"
      );
    }
    return (
      <Receive
        target={target}
        showQR={flags.qr}
        json={flags.json}
        network={flags.network}
        password={flags.password}
      />
    );
  }

  // ---- Top-level commands ----
  if (command === "sign") {
    const txFile = subcommand;
    if (!txFile)
      return invalidUsage("Transaction file is required", "begin sign <tx-file> [options]");
    return (
      <Sign
        txFile={txFile}
        walletName={flags.wallet}
        password={flags.password}
        network={flags.network}
        outputFile={flags.output}
        jsonOutput={flags.json}
      />
    );
  }

  if (command === "submit") {
    const txFile = subcommand;
    if (!txFile)
      return invalidUsage(
        "Signed transaction file is required",
        "begin submit <signed-tx-file> [options]"
      );
    return (
      <Submit txFile={txFile} network={flags.network} wait={flags.wait} jsonOutput={flags.json} />
    );
  }

  // ---- Back-compat: allow legacy non-namespaced cardano commands ----
  if (command === "balance" || command === "utxos" || command === "history" || command === "send") {
    return (
      <App
        command="cardano"
        subcommand={command}
        args={[subcommand, ...args].filter(
          (v): v is string => typeof v === "string" && v.length > 0
        )}
        flags={flags}
        showHelp={showHelp}
      />
    );
  }

  // ---- Namespaced commands ----
  if (command === "cardano") {
    if (subcommand === "balance") {
      const address = args[0];
      if (!address) return invalidUsage("Address is required", "begin cardano balance <address>");
      return <CardanoBalance address={address} network={network} json={flags.json} />;
    }

    if (subcommand === "utxos") {
      const address = args[0];
      if (!address) return invalidUsage("Address is required", "begin cardano utxos <address>");
      return <CardanoUtxos address={address} network={network} json={flags.json} />;
    }

    if (subcommand === "history") {
      const address = args[0];
      if (!address) return invalidUsage("Address is required", "begin cardano history <address>");
      return (
        <CardanoHistory
          address={address}
          network={network}
          json={flags.json}
          limit={flags.limit}
          page={flags.page}
        />
      );
    }

    if (subcommand === "send") {
      const [to, amountStr] = args;
      if (!to || !amountStr)
        return invalidUsage(
          "Recipient address and amount are required",
          "begin cardano send <to> <amount> [options]"
        );
      const amount = Number(amountStr);
      if (!Number.isFinite(amount) || amount <= 0)
        return invalidUsage(
          "Amount must be a positive number",
          "begin cardano send <to> <amount> [options]"
        );
      return (
        <CardanoSend
          to={to}
          amount={amount}
          network={network}
          walletName={flags.wallet}
          password={flags.password}
          assets={flags.asset}
          dryRun={flags.dryRun}
          outputFile={flags.output}
          jsonOutput={flags.json}
          yes={flags.yes}
        />
      );
    }

    return (
      <Box flexDirection="column">
        <Text color="red">Unknown cardano command: {subcommand || "(none)"}</Text>
        <Text color="gray">Available commands: balance, utxos, history, send</Text>
      </Box>
    );
  }

  if (command === "stake") {
    if (subcommand === "pools") {
      const search = args[0];
      return (
        <StakePools search={search} network={flags.network} json={flags.json} limit={flags.limit} />
      );
    }

    if (subcommand === "delegate") {
      const poolId = args[0];
      if (!poolId) return invalidUsage("Pool ID is required", "begin stake delegate <pool-id>");
      return (
        <StakeDelegate
          poolId={poolId}
          network={flags.network}
          json={flags.json}
          yes={flags.yes}
          walletName={flags.wallet}
          password={flags.password}
        />
      );
    }

    if (subcommand === "status") {
      return (
        <StakeStatus
          network={flags.network}
          json={flags.json}
          walletName={flags.wallet}
          password={flags.password}
        />
      );
    }

    if (subcommand === "withdraw") {
      return (
        <StakeWithdraw
          network={flags.network}
          json={flags.json}
          yes={flags.yes}
          walletName={flags.wallet}
          password={flags.password}
        />
      );
    }

    return (
      <Box flexDirection="column">
        <Text color="red">Unknown stake command: {subcommand || "(none)"}</Text>
        <Text color="gray">Available commands: pools, delegate, status, withdraw</Text>
      </Box>
    );
  }

  if (command === "wallet") {
    if (subcommand === "address") {
      const name = args[0] ?? flags.wallet;
      return (
        <WalletAddress
          network={flags.network as NetworkType}
          walletName={name}
          password={flags.password}
          full={flags.full}
          qr={flags.qr}
          json={flags.json}
        />
      );
    }

    if (subcommand === "create") {
      const name = args[0];
      if (!name) return invalidUsage("Wallet name is required", "begin wallet create <name>");
      return <WalletCreate name={name} network={flags.network} showSeed={flags.showSeed} />;
    }

    if (subcommand === "restore") {
      const name = args[0];
      if (!name) return invalidUsage("Wallet name is required", "begin wallet restore <name>");
      return <WalletRestore name={name} network={flags.network} />;
    }

    if (subcommand === "export") {
      const name = args[0] ?? flags.wallet;
      return <WalletExport walletName={name} password={flags.password} json={flags.json} />;
    }

    if (subcommand === "list") {
      return <WalletList json={flags.json} />;
    }

    return (
      <Box flexDirection="column">
        <Text color="red">Unknown wallet command: {subcommand || "(none)"}</Text>
        <Text color="gray">Available commands: address, create, restore, export, list</Text>
      </Box>
    );
  }

  // ---- Mint command ----
  if (command === "mint") {
    // Validate required flags
    if (!flags.image) {
      return invalidUsage(
        "Image path is required",
        "begin mint --image <path> --name <name> --to <addr>"
      );
    }
    if (!flags.name) {
      return invalidUsage(
        "NFT name is required",
        "begin mint --image <path> --name <name> --to <addr>"
      );
    }
    if (!flags.to) {
      return invalidUsage(
        "Receiver address is required",
        "begin mint --image <path> --name <name> --to <addr>"
      );
    }

    return (
      <MintCommand
        imagePath={flags.image}
        name={flags.name}
        displayName={flags.displayName}
        description={flags.description}
        toAddress={flags.to}
        network={flags.network}
        yes={flags.yes}
        jsonOutput={flags.json}
      />
    );
  }

  // ---- Buy command ----
  if (command === 'buy') {
    const amount = flags.amount ? Number(flags.amount) : 50;
    if (!Number.isFinite(amount) || amount <= 0) {
      return invalidUsage('Amount must be a positive number', 'begin buy --amount <number> --currency <fiat> --token <crypto>');
    }
    return (
      <Buy
        amount={amount}
        currency={flags.currency}
        token={flags.token}
        json={flags.json}
        walletName={flags.wallet}
      />
    );
  }

  // Route to swap commands
  if (command === "swap") {
    // Swap quote subcommand: begin swap quote --from ADA --to MIN --amount 100
    if (subcommand === "quote") {
      if (!flags.from || !flags.to || !flags.amount) {
        return (
          <Box flexDirection="column">
            <Text color="red">Error: --from, --to, and --amount are required</Text>
            <Text color="gray">
              Usage: begin swap quote --from {"<token>"} --to {"<token>"} --amount {"<amount>"}
            </Text>
            <Text color="gray">Options:</Text>
            <Text color="gray"> --slippage, -s Slippage tolerance % (default: 0.5)</Text>
            <Text color="gray"> --multi-hop Allow multi-hop routing (default: true)</Text>
            <Text color="gray"> --json, -j Output as JSON</Text>
          </Box>
        );
      }
      return (
        <SwapQuote
          from={flags.from}
          to={flags.to}
          amount={flags.amount}
          slippage={flags.slippage}
          multiHop={flags.multiHop}
          network={flags.network}
          json={flags.json}
        />
      );
    }

    if (subcommand === "orders") {
      return (
        <SwapOrders
          network={flags.network}
          walletName={flags.wallet}
          password={flags.password}
          address={flags.address}
          json={flags.json}
        />
      );
    }

    if (subcommand === "cancel") {
      if (!flags.id || flags.id.length === 0) {
        return (
          <Box flexDirection="column">
            <Text color="red">Error: --id is required</Text>
            <Text color="gray">Usage: begin swap cancel --id {"<tx-in>"}</Text>
            <Text color="gray">Options:</Text>
            <Text color="gray"> --id, -i Pending order tx_in (can repeat)</Text>
            <Text color="gray"> --protocol Protocol if not found in pending orders</Text>
            <Text color="gray"> --yes, -y Skip confirmation prompt</Text>
            <Text color="gray"> --json, -j Output as JSON</Text>
          </Box>
        );
      }
      return (
        <SwapCancel
          network={flags.network}
          walletName={flags.wallet}
          password={flags.password}
          ids={flags.id}
          protocol={flags.protocol}
          yes={flags.yes}
          json={flags.json}
        />
      );
    }

    // Main swap command: begin swap --from ADA --to MIN --amount 100
    if (!flags.from || !flags.to || !flags.amount) {
      return (
        <Box flexDirection="column">
          <Text color="red">Error: --from, --to, and --amount are required</Text>
          <Text color="gray">
            Usage: begin swap --from {"<token>"} --to {"<token>"} --amount {"<amount>"}
          </Text>
          <Text color="gray">Options:</Text>
          <Text color="gray"> --slippage, -s Slippage tolerance % (default: 0.5)</Text>
          <Text color="gray"> --multi-hop Allow multi-hop routing (default: true)</Text>
          <Text color="gray"> --yes, -y Skip confirmation prompt</Text>
          <Text color="gray"> --json, -j Output as JSON</Text>
          <Text color="gray">Subcommands:</Text>
          <Text color="gray"> quote Get a swap quote without executing</Text>
        </Box>
      );
    }

    return (
      <Swap
        from={flags.from}
        to={flags.to}
        amount={flags.amount}
        slippage={flags.slippage}
        multiHop={flags.multiHop}
        yes={flags.yes}
        network={flags.network}
        walletName={flags.wallet}
        password={flags.password}
        json={flags.json}
      />
    );
  }

  // ---- Token commands ----
  if (command === 'token') {
    if (subcommand === 'search') {
      const query = args[0];
      // If no query and not --trending, show trending by default
      return (
        <TokenSearch
          query={query}
          trending={flags.trending || !query}
          currency={flags.currency}
          json={flags.json}
          limit={flags.limit}
        />
      );
    }

    if (subcommand === 'price') {
      const symbol = args[0];
      if (!symbol) {
        return invalidUsage('Token symbol is required', 'begin token price <symbol>');
      }
      return (
        <TokenPrice
          symbol={symbol}
          currency={flags.currency}
          json={flags.json}
        />
      );
    }

    return (
      <Box flexDirection="column">
        <Text color="red">Unknown token command: {subcommand || '(none)'}</Text>
        <Text color="gray">Available commands: search, price</Text>
      </Box>
    );
  }

  // Unknown command
  return (
    <Box flexDirection="column">
      <Text color="red">Unknown command: {command}</Text>
      <Text color="gray">Run `begin --help` for usage information</Text>
    </Box>
  );
}
