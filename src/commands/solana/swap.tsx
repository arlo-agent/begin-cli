/**
 * Solana Swap command - swap tokens via Jupiter
 *
 * Usage: begin solana swap --from SOL --to USDC --amount 1.5 [--slippage 50]
 */

import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import {
  getQuote,
  executeSwap,
  resolveTokenMint,
  getTokenDecimals,
  parseAmountToSmallestUnit,
  formatAmountFromSmallestUnit,
  formatRoutePlan,
  getSolanaExplorerUrl,
  SOLANA_TOKENS,
  type JupiterQuote,
} from "../../services/jupiter-swap.js";
import { getMnemonic, loadWalletFile, getChainAddress } from "../../lib/wallet.js";
import { getPasswordFromEnv, PASSWORD_ENV_VAR } from "../../lib/keystore.js";
import { outputSuccess, exitWithError, truncateAddress } from "../../lib/output.js";
import { ExitCode, errors, getErrorMessage } from "../../lib/errors.js";
import { logAction } from "../../lib/audit.js";
import { createSolanaAdapter } from "../../lib/chains/solana.js";
import type { SolanaNetwork } from "../../lib/chains/types.js";

interface SolanaSwapProps {
  from: string;
  to: string;
  amount: string;
  slippage: number; // Slippage in percentage (e.g., 0.5 for 0.5%)
  network: SolanaNetwork;
  walletName?: string;
  password?: string;
  jsonOutput?: boolean;
  yes?: boolean;
}

type SwapState =
  | "checking"
  | "password"
  | "loading"
  | "quoting"
  | "confirm"
  | "executing"
  | "success"
  | "cancelled"
  | "error";

interface SwapInfo {
  fromMint: string;
  toMint: string;
  fromSymbol: string;
  toSymbol: string;
  fromDecimals: number;
  toDecimals: number;
  inputAmount: string;
  quote: JupiterQuote;
  walletAddress: string;
  solBalance: string;
}

export function SolanaSwap({
  from,
  to,
  amount,
  slippage,
  network,
  walletName,
  password: initialPassword,
  jsonOutput = false,
  yes = false,
}: SolanaSwapProps) {
  const { exit } = useApp();
  const [state, setState] = useState<SwapState>("checking");
  const [swapInfo, setSwapInfo] = useState<SwapInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState(initialPassword || "");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);

  const slippageBps = Math.round(slippage * 100); // Convert percentage to basis points

  // Validate and check wallet on mount
  useEffect(() => {
    checkWallet();
  }, []);

  const checkWallet = async () => {
    try {
      if (!walletName) {
        throw new Error("Wallet name is required. Use --wallet <name>");
      }

      const walletFile = await loadWalletFile(walletName);

      // Check if wallet has Solana address
      const solanaAddress = await getChainAddress(walletName, "solana");
      if (!solanaAddress) {
        throw new Error(
          `Wallet "${walletName}" does not have a Solana address. Create a new wallet or add Solana support.`
        );
      }

      // Check if password is needed
      if (walletFile.version === 1 || (walletFile.version === 3 && walletFile.encrypted.salt)) {
        const effectivePassword = initialPassword || getPasswordFromEnv();
        if (!effectivePassword) {
          if (jsonOutput) {
            setError(`Password required (pass --password or set ${PASSWORD_ENV_VAR})`);
            setState("error");
            exitWithError(errors.missingArgument("password"));
            return;
          }
          setNeedsPassword(true);
          setState("password");
          return;
        }
        await initSwap(effectivePassword);
      } else {
        // Keychain-based, no password needed
        await initSwap("");
      }
    } catch (err) {
      const message = getErrorMessage(err, "Failed to check wallet");
      setError(message);
      setState("error");
      if (jsonOutput) exitWithError(err);
      setTimeout(() => exit(), 2000);
    }
  };

  const initSwap = async (pwd: string) => {
    try {
      setState("loading");

      // Resolve token mints
      const fromMint = resolveTokenMint(from);
      const toMint = resolveTokenMint(to);

      // Validate tokens are different
      if (fromMint === toMint) {
        throw new Error("Cannot swap a token for itself");
      }

      // Get token info
      const fromSymbol = from.toUpperCase();
      const toSymbol = to.toUpperCase();
      const fromDecimals = getTokenDecimals(from);
      const toDecimals = getTokenDecimals(to);

      // Get wallet address and balance
      const solanaAddress = await getChainAddress(walletName!, "solana");
      if (!solanaAddress) {
        throw new Error("Solana address not found in wallet");
      }

      const adapter = createSolanaAdapter(network);
      const balance = await adapter.getBalance(solanaAddress);
      const solBalance = balance.native.uiAmount.toFixed(4);

      // Parse amount to smallest unit
      const inputAmountSmallest = parseAmountToSmallestUnit(amount, fromDecimals);

      // Get quote
      setState("quoting");

      const quote = await getQuote({
        inputMint: fromMint,
        outputMint: toMint,
        amount: inputAmountSmallest,
        slippageBps,
      });

      setSwapInfo({
        fromMint,
        toMint,
        fromSymbol,
        toSymbol,
        fromDecimals,
        toDecimals,
        inputAmount: amount,
        quote,
        walletAddress: solanaAddress,
        solBalance,
      });

      setState("confirm");
    } catch (err) {
      const message = getErrorMessage(err, "Failed to get swap quote");
      setError(message);
      setState("error");
      if (jsonOutput) exitWithError(err);
      setTimeout(() => exit(), 2000);
    }
  };

  const handlePasswordSubmit = () => {
    if (password.trim()) {
      initSwap(password);
    }
  };

  const handleSwap = async () => {
    try {
      if (!swapInfo) {
        throw new Error("Swap info not available");
      }

      setState("executing");

      const effectivePassword = password || initialPassword || getPasswordFromEnv() || "";

      const result = await executeSwap({
        quote: swapInfo.quote,
        userPublicKey: swapInfo.walletAddress,
        walletName: walletName!,
        password: effectivePassword,
        network,
        dynamicSlippage: true,
      });

      setTxHash(result.txHash);

      // Audit log
      logAction(
        "solana_swap",
        {
          from: swapInfo.fromSymbol,
          to: swapInfo.toSymbol,
          inputAmount: swapInfo.inputAmount,
          outputAmount: formatAmountFromSmallestUnit(result.outputAmount, swapInfo.toDecimals),
          txHash: result.txHash,
          priceImpact: result.priceImpact,
        },
        "success"
      );

      if (jsonOutput) {
        outputSuccess({
          status: "confirmed",
          txHash: result.txHash,
          from: {
            token: swapInfo.fromSymbol,
            mint: swapInfo.fromMint,
            amount: swapInfo.inputAmount,
          },
          to: {
            token: swapInfo.toSymbol,
            mint: swapInfo.toMint,
            amount: formatAmountFromSmallestUnit(result.outputAmount, swapInfo.toDecimals),
            minAmount: formatAmountFromSmallestUnit(
              swapInfo.quote.otherAmountThreshold,
              swapInfo.toDecimals
            ),
          },
          priceImpact: result.priceImpact,
          fee: result.fee,
          network,
          explorerUrl: getSolanaExplorerUrl(result.txHash, network),
        });
        process.exit(ExitCode.SUCCESS);
      }

      setState("success");
      setTimeout(() => exit(), 2000);
    } catch (err) {
      const message = getErrorMessage(err, "Swap failed");
      setError(message);
      setState("error");
      logAction(
        "solana_swap",
        {
          from: swapInfo?.fromSymbol,
          to: swapInfo?.toSymbol,
          amount: swapInfo?.inputAmount,
          error: message,
        },
        "error"
      );
      if (jsonOutput) exitWithError(err);
      setTimeout(() => exit(), 2000);
    }
  };

  // Auto-proceed with --yes flag or JSON mode
  useEffect(() => {
    if ((jsonOutput || yes) && state === "confirm") {
      handleSwap();
    }
  }, [jsonOutput, yes, state]);

  // Handle keyboard input for confirmation
  useInput((input, key) => {
    if (jsonOutput) return;
    if (state !== "confirm") return;

    if (input === "y" || input === "Y") {
      handleSwap();
    } else if (input === "n" || input === "N" || key.escape) {
      setState("cancelled");
      setTimeout(() => exit(), 500);
    }
  });

  // Render states
  if (state === "checking") {
    return (
      <Box padding={1}>
        <Text color="cyan">Checking wallet...</Text>
      </Box>
    );
  }

  if (state === "password") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan">Enter password for wallet </Text>
          <Text bold color="yellow">
            {walletName}
          </Text>
        </Box>
        <Box>
          <Text color="gray">Password: </Text>
          <TextInput
            value={password}
            onChange={setPassword}
            onSubmit={handlePasswordSubmit}
            mask="*"
          />
        </Box>
      </Box>
    );
  }

  if (state === "loading") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Loading wallet and resolving tokens...</Text>
      </Box>
    );
  }

  if (state === "quoting") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Fetching swap quote from Jupiter...</Text>
        <Text color="gray">
          {from.toUpperCase()} → {to.toUpperCase()}
        </Text>
      </Box>
    );
  }

  if (state === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (state === "cancelled") {
    return (
      <Box padding={1}>
        <Text color="yellow">Swap cancelled</Text>
      </Box>
    );
  }

  if (state === "executing") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Executing swap...</Text>
        <Text color="gray">Signing and submitting transaction...</Text>
      </Box>
    );
  }

  if (state === "success" && swapInfo) {
    const outputAmount = formatAmountFromSmallestUnit(
      swapInfo.quote.outAmount,
      swapInfo.toDecimals
    );

    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">Swap confirmed!</Text>
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color="gray">TX Hash: </Text>
            <Text>{txHash}</Text>
          </Box>
          <Box>
            <Text color="gray">Swapped: </Text>
            <Text>
              {swapInfo.inputAmount} {swapInfo.fromSymbol} → {outputAmount} {swapInfo.toSymbol}
            </Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">View on: </Text>
          <Text color="blue">{getSolanaExplorerUrl(txHash!, network)}</Text>
        </Box>
      </Box>
    );
  }

  // Confirm prompt
  if (!swapInfo) return null;

  const outputAmount = formatAmountFromSmallestUnit(
    swapInfo.quote.outAmount,
    swapInfo.toDecimals
  );
  const minOutputAmount = formatAmountFromSmallestUnit(
    swapInfo.quote.otherAmountThreshold,
    swapInfo.toDecimals
  );
  const priceImpact = parseFloat(swapInfo.quote.priceImpactPct);
  const isHighImpact = priceImpact > 1;
  const isCriticalImpact = priceImpact > 5;

  // Calculate rate
  const inAmountNum = parseFloat(swapInfo.inputAmount);
  const outAmountNum = parseFloat(outputAmount);
  const rate = inAmountNum > 0 ? (outAmountNum / inAmountNum).toFixed(6) : "0";

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Solana Swap
        </Text>
        <Text color="gray"> ({network})</Text>
        <Text color="gray"> [{walletName}]</Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        <Box>
          <Text color="gray">From wallet: </Text>
          <Text>{truncateAddress(swapInfo.walletAddress)}</Text>
        </Box>
        <Box>
          <Text color="gray">SOL Balance: </Text>
          <Text color="green">{swapInfo.solBalance} SOL</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">You pay: </Text>
          <Text bold color="white">
            {swapInfo.inputAmount} {swapInfo.fromSymbol}
          </Text>
        </Box>
        <Box>
          <Text color="gray">You receive: </Text>
          <Text bold color="green">
            {outputAmount} {swapInfo.toSymbol}
          </Text>
        </Box>
        <Box>
          <Text color="gray">Min received: </Text>
          <Text color="yellow">
            {minOutputAmount} {swapInfo.toSymbol}
          </Text>
          <Text color="gray"> (after {slippage}% slippage)</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">Rate: </Text>
          <Text>
            1 {swapInfo.fromSymbol} = {rate} {swapInfo.toSymbol}
          </Text>
        </Box>

        <Box>
          <Text color="gray">Price impact: </Text>
          <Text color={isCriticalImpact ? "red" : isHighImpact ? "yellow" : "green"}>
            {priceImpact.toFixed(2)}%
          </Text>
          {isCriticalImpact && <Text color="red"> HIGH</Text>}
          {isHighImpact && !isCriticalImpact && <Text color="yellow"> Moderate</Text>}
        </Box>

        <Box marginTop={1}>
          <Text color="gray">Route: </Text>
          <Text>{formatRoutePlan(swapInfo.quote)}</Text>
        </Box>
      </Box>

      {isCriticalImpact && (
        <Box marginTop={1}>
          <Text color="red">Warning: High price impact! Consider splitting into smaller swaps.</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text>Confirm swap? </Text>
        <Text color="green">[Y]es</Text>
        <Text> / </Text>
        <Text color="red">[N]o</Text>
      </Box>
    </Box>
  );
}
