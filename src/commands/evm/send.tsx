/**
 * EVM Send command - send native tokens or ERC-20 tokens
 */

import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { createEVMAdapter, getEVMNetworkConfig, type EVMNetwork } from "../../lib/chains/index.js";
import { getMnemonic, loadWalletFile, getChainAddress } from "../../lib/wallet.js";
import { getPasswordFromEnv, PASSWORD_ENV_VAR } from "../../lib/keystore.js";
import { outputSuccess, exitWithError, truncateAddress } from "../../lib/output.js";
import { ExitCode, errors, getErrorMessage } from "../../lib/errors.js";
import { validateTransaction, recordSpending } from "../../lib/policy.js";
import { logAction } from "../../lib/audit.js";

interface EVMSendProps {
  to: string;
  amount: number;
  network: EVMNetwork;
  walletName?: string;
  password?: string;
  token?: string; // Optional ERC-20 token contract address
  jsonOutput?: boolean;
  yes?: boolean;
}

type SendState =
  | "checking"
  | "password"
  | "loading"
  | "confirm"
  | "building"
  | "submitting"
  | "success"
  | "cancelled"
  | "error";

interface TxInfo {
  fromAddress: string;
  toAddress: string;
  amount: number;
  estimatedFee: string;
  availableBalance?: string;
  token?: string;
}

export function EVMSend({
  to,
  amount,
  network,
  walletName,
  password: initialPassword,
  token,
  jsonOutput = false,
  yes = false,
}: EVMSendProps) {
  const { exit } = useApp();
  const [state, setState] = useState<SendState>("checking");
  const [txInfo, setTxInfo] = useState<TxInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState(initialPassword || "");
  const [txHash, setTxHash] = useState<string | null>(null);

  const networkConfig = getEVMNetworkConfig(network);
  const asset = token ? `ERC20:${token.slice(0, 8)}...` : networkConfig.symbol;

  const adapter = createEVMAdapter(network);

  // Validate address
  useEffect(() => {
    if (!adapter.validateAddress(to)) {
      setError("Invalid EVM address");
      setState("error");
      if (jsonOutput) exitWithError(errors.invalidArgument("to", "Invalid EVM address"));
      setTimeout(() => exit(), 2000);
      return;
    }

    // Check policy
    const validation = validateTransaction(to, amount, asset);
    if (!validation.allowed) {
      setError(validation.reason || "Transaction not allowed by policy");
      setState("error");
      logAction("evm_send", { to, amount, asset, network }, "denied");
      if (jsonOutput) exitWithError(errors.walletError(validation.reason || "Policy denied"));
      setTimeout(() => exit(), 2000);
      return;
    }

    checkWallet();
  }, []);

  const checkWallet = async () => {
    try {
      if (!walletName) {
        throw new Error("Wallet name is required. Use --wallet <name>");
      }

      const walletFile = await loadWalletFile(walletName);

      // Check if wallet has EVM address
      const evmAddress = await getChainAddress(walletName, "evm");
      if (!evmAddress) {
        throw new Error(
          `Wallet "${walletName}" does not have an EVM address. Create a new wallet or add EVM support.`
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
          setState("password");
          return;
        }
        await initTransaction(effectivePassword);
      } else {
        // Keychain-based, no password needed
        await initTransaction("");
      }
    } catch (err) {
      const message = getErrorMessage(err, "Failed to check wallet");
      setError(message);
      setState("error");
      if (jsonOutput) exitWithError(err);
      setTimeout(() => exit(), 2000);
    }
  };

  const initTransaction = async (pwd: string) => {
    try {
      setState("loading");

      const mnemonic = await getMnemonic(walletName!, pwd);
      const wallet = await adapter.createWallet(mnemonic);
      const balance = await adapter.getBalance(wallet.address);
      const fee = await adapter.estimateFee({ to, amount, token });

      setTxInfo({
        fromAddress: wallet.address,
        toAddress: to,
        amount,
        estimatedFee: fee,
        availableBalance: balance.native.uiAmount.toFixed(6),
        token,
      });

      setState("confirm");
    } catch (err) {
      const message = getErrorMessage(err, "Failed to initialize transaction");
      setError(
        message.includes("Incorrect password") ? "Incorrect password. Please try again." : message
      );
      setState("error");
      if (jsonOutput) exitWithError(err);
      setTimeout(() => exit(), 2000);
    }
  };

  const handlePasswordSubmit = () => {
    if (password.trim()) {
      initTransaction(password);
    }
  };

  const handleSend = async () => {
    try {
      setState("building");

      const effectivePassword = password || initialPassword || getPasswordFromEnv() || "";
      const mnemonic = await getMnemonic(walletName!, effectivePassword);

      const { signedTx, fee } = await adapter.buildTransaction(mnemonic, {
        to,
        amount,
        token,
      });

      setState("submitting");
      const hash = await adapter.submitTransaction(signedTx);
      setTxHash(hash);

      // Record spending and audit
      recordSpending(asset, amount);
      logAction("evm_send", { to, amount, asset, network, txHash: hash, fee }, "success");

      if (jsonOutput) {
        outputSuccess({
          status: "submitted",
          txHash: hash,
          fee,
          network,
          chainId: networkConfig.chainId,
        });
        process.exit(ExitCode.SUCCESS);
      }

      setState("success");
      setTimeout(() => exit(), 1500);
    } catch (err) {
      const message = getErrorMessage(err, "Transaction failed");
      setError(message);
      setState("error");
      logAction("evm_send", { to, amount, asset, network, error: message }, "error");
      if (jsonOutput) exitWithError(err);
      setTimeout(() => exit(), 2000);
    }
  };

  // Auto-proceed with --yes flag or JSON mode
  useEffect(() => {
    if ((jsonOutput || yes) && state === "confirm") {
      handleSend();
    }
  }, [jsonOutput, yes, state]);

  // Handle keyboard input for confirmation
  useInput((input, key) => {
    if (jsonOutput) return;
    if (state !== "confirm") return;

    if (input === "y" || input === "Y") {
      handleSend();
    } else if (input === "n" || input === "N" || key.escape) {
      setState("cancelled");
      setTimeout(() => exit(), 500);
    }
  });

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
        <Text color="cyan">Loading wallet and preparing transaction...</Text>
      </Box>
    );
  }

  if (state === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        {txHash && (
          <Box marginTop={1}>
            <Text color="gray">TX Hash: </Text>
            <Text>{txHash}</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (state === "cancelled") {
    return (
      <Box padding={1}>
        <Text color="yellow">Transaction cancelled</Text>
      </Box>
    );
  }

  if (state === "building") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Building and signing transaction...</Text>
      </Box>
    );
  }

  if (state === "submitting") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Broadcasting transaction to {networkConfig.name}...</Text>
      </Box>
    );
  }

  if (state === "success") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">Transaction submitted!</Text>
        <Box marginTop={1}>
          <Text color="gray">TX Hash: </Text>
          <Text>{txHash}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">View on: </Text>
          <Text color="blue">
            {networkConfig.explorerUrl}/tx/{txHash}
          </Text>
        </Box>
      </Box>
    );
  }

  // Confirm prompt
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Send {token ? "ERC-20 Token" : networkConfig.symbol}
        </Text>
        <Text color="gray"> ({networkConfig.name})</Text>
        <Text color="gray"> [{walletName}]</Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        <Box>
          <Text color="gray">From: </Text>
          <Text>{truncateAddress(txInfo?.fromAddress || "")}</Text>
        </Box>
        <Box>
          <Text color="gray">To: </Text>
          <Text>{truncateAddress(to)}</Text>
        </Box>
        <Box>
          <Text color="gray">Amount: </Text>
          <Text bold color="green">
            {amount} {token ? "tokens" : networkConfig.symbol}
          </Text>
        </Box>

        {token && (
          <Box>
            <Text color="gray">Token Contract: </Text>
            <Text>{truncateAddress(token)}</Text>
          </Box>
        )}

        {txInfo?.availableBalance && (
          <Box>
            <Text color="gray">Available: </Text>
            <Text color="green">{txInfo.availableBalance} {networkConfig.symbol}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text color="gray">Fee: </Text>
          <Text color="yellow">~{txInfo?.estimatedFee} {networkConfig.symbol}</Text>
          <Text color="gray"> (estimated)</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">Network: </Text>
          <Text>{networkConfig.name}</Text>
          <Text color="gray"> (Chain ID: {networkConfig.chainId})</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text>Confirm send? </Text>
        <Text color="green">[Y]es</Text>
        <Text> / </Text>
        <Text color="red">[N]o</Text>
      </Box>
    </Box>
  );
}
