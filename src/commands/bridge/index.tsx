import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import {
  getRate,
  createOrder,
  updateOrder,
  buildPairId,
  isSupportedAsset,
  getAssetDisplayName,
  getChainForAsset,
  formatOrderStatus,
  getStatusColor,
  type BridgeChain,
  type BestRateResult,
  type XOSwapOrder,
} from "../../services/xoswap.js";
import { getErrorMessage } from "../../lib/errors.js";
import {
  checkWalletAvailability,
  loadWallet,
  type TransactionConfig,
} from "../../lib/transaction.js";
import { getMnemonic, getChainAddress, loadWalletFile } from "../../lib/wallet.js";
import { createSolanaAdapter } from "../../lib/chains/solana.js";
import { createBitcoinAdapter } from "../../lib/chains/bitcoin.js";
import { createEVMAdapter } from "../../lib/chains/evm.js";
import type { SolanaNetwork, BitcoinNetwork, EVMNetwork } from "../../lib/chains/types.js";

interface BridgeProps {
  from: string;
  to: string;
  amount: string;
  slippage: number;
  yes: boolean;
  network: string;
  walletName?: string;
  password?: string;
  json: boolean;
}

type BridgeState =
  | "checking"
  | "password"
  | "loading-wallet"
  | "quoting"
  | "confirm"
  | "creating-order"
  | "building-tx"
  | "signing"
  | "submitting"
  | "updating-order"
  | "success"
  | "cancelled"
  | "error";

interface WalletInfo {
  source: "env" | "wallet" | "keychain";
  walletName?: string;
  needsPassword: boolean;
}

export function Bridge({
  from,
  to,
  amount,
  slippage,
  yes,
  network,
  walletName,
  password: initialPassword,
  json,
}: BridgeProps) {
  const { exit } = useApp();
  const [state, setState] = useState<BridgeState>("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState(initialPassword || "");
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);

  // Bridge data
  const [rateResult, setRateResult] = useState<BestRateResult | null>(null);
  const [order, setOrder] = useState<XOSwapOrder | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [fromAddress, setFromAddress] = useState<string | null>(null);
  const [toAddress, setToAddress] = useState<string | null>(null);

  const fromAsset = from.toUpperCase() as BridgeChain;
  const toAsset = to.toUpperCase() as BridgeChain;
  const amountNum = parseFloat(amount);

  const config: TransactionConfig = { network };

  // Check wallet availability on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Validate assets
        if (!isSupportedAsset(fromAsset)) {
          throw new Error(`Unsupported source asset: ${fromAsset}`);
        }
        if (!isSupportedAsset(toAsset)) {
          throw new Error(`Unsupported destination asset: ${toAsset}`);
        }
        if (fromAsset === toAsset) {
          throw new Error("Source and destination assets must be different");
        }
        if (isNaN(amountNum) || amountNum <= 0) {
          throw new Error("Amount must be a positive number");
        }

        const availability = checkWalletAvailability(walletName);

        if (!availability.available) {
          throw new Error(availability.error || "No wallet available");
        }

        setWalletInfo({
          source: availability.source!,
          walletName: availability.walletName,
          needsPassword: availability.needsPassword,
        });

        // If using env var or password already provided, proceed
        if (!availability.needsPassword || initialPassword) {
          await initBridge(initialPassword, availability.walletName);
        } else {
          setState("password");
        }
      } catch (err) {
        setError(getErrorMessage(err, "Initialization failed"));
        setState("error");
        setTimeout(() => exit(), 2000);
      }
    };

    init();
  }, []);

  // Handle password submission
  const handlePasswordSubmit = async () => {
    if (password.trim()) {
      await initBridge(password, walletInfo?.walletName);
    }
  };

  // Initialize bridge flow
  const initBridge = async (pwd?: string, wName?: string) => {
    try {
      setState("loading-wallet");

      // Get wallet addresses for both chains
      const resolvedWalletName = wName || walletName;
      if (!resolvedWalletName) {
        throw new Error("No wallet specified");
      }

      const fromChain = getChainForAsset(fromAsset);
      const toChain = getChainForAsset(toAsset);

      // Get addresses from wallet
      const fromAddr = await getChainAddress(resolvedWalletName, fromChain);
      const toAddr = await getChainAddress(resolvedWalletName, toChain);

      if (!fromAddr) {
        throw new Error(`Wallet does not have a ${fromChain} address. Run 'begin wallet address' to check available chains.`);
      }
      if (!toAddr) {
        throw new Error(`Wallet does not have a ${toChain} address. Run 'begin wallet address' to check available chains.`);
      }

      setFromAddress(fromAddr);
      setToAddress(toAddr);

      // Get quote
      setState("quoting");
      const pairId = buildPairId(fromAsset, toAsset);
      const result = await getRate(pairId, amountNum);

      if (!result) {
        throw new Error(`No rates available for ${fromAsset} -> ${toAsset}`);
      }

      if (amountNum < result.min) {
        throw new Error(`Amount ${amountNum} ${fromAsset} is below minimum ${result.min} ${fromAsset}`);
      }
      if (amountNum > result.max) {
        throw new Error(`Amount ${amountNum} ${fromAsset} is above maximum ${result.max} ${fromAsset}`);
      }

      setRateResult(result);

      // Skip confirmation if --yes flag
      if (yes) {
        await executeBridge(pwd, resolvedWalletName, fromAddr, toAddr, result);
      } else {
        setState("confirm");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to initialize bridge"));
      setState("error");
      setTimeout(() => exit(), 2000);
    }
  };

  // Handle keyboard input for confirmation
  useInput((input, key) => {
    if (state !== "confirm") return;

    if (input === "y" || input === "Y") {
      if (rateResult && fromAddress && toAddress) {
        executeBridge(password, walletInfo?.walletName, fromAddress, toAddress, rateResult);
      }
    } else if (input === "n" || input === "N" || key.escape) {
      setState("cancelled");
      setTimeout(() => exit(), 500);
    }
  });

  // Execute the bridge
  const executeBridge = async (
    pwd: string | undefined,
    wName: string | undefined,
    fromAddr: string,
    toAddr: string,
    rate: BestRateResult
  ) => {
    try {
      // Create order
      setState("creating-order");

      const pairId = buildPairId(fromAsset, toAsset);
      const bridgeOrder = await createOrder({
        pairId,
        fromAddress: fromAddr,
        toAddress: toAddr,
        fromAmount: amountNum,
        toAmount: rate.outputAmount,
        slippage,
      });

      setOrder(bridgeOrder);

      if (!bridgeOrder.depositAddress) {
        throw new Error("No deposit address in order response");
      }

      // Build and send transaction on source chain
      setState("building-tx");

      const mnemonic = await getMnemonic(wName!, pwd || "");
      const fromChain = getChainForAsset(fromAsset);

      let signedTx: string;
      let fee: string;

      if (fromChain === "solana") {
        const solanaNetwork: SolanaNetwork = network === "mainnet" ? "mainnet-beta" : "devnet";
        const adapter = createSolanaAdapter(solanaNetwork);
        const result = await adapter.buildTransaction(mnemonic, {
          to: bridgeOrder.depositAddress,
          amount: amountNum,
        });
        signedTx = result.signedTx;
        fee = result.fee;
      } else if (fromChain === "bitcoin") {
        const bitcoinNetwork: BitcoinNetwork = network === "mainnet" ? "mainnet" : "testnet";
        const adapter = createBitcoinAdapter(bitcoinNetwork);
        const result = await adapter.buildTransaction(mnemonic, {
          to: bridgeOrder.depositAddress,
          amount: amountNum,
        });
        signedTx = result.signedTx;
        fee = result.fee;
      } else if (fromChain === "evm") {
        const evmNetwork = getEVMNetworkForAsset(fromAsset);
        const adapter = createEVMAdapter(evmNetwork);
        const result = await adapter.buildTransaction(mnemonic, {
          to: bridgeOrder.depositAddress,
          amount: amountNum,
        });
        signedTx = result.signedTx;
        fee = result.fee;
      } else if (fromChain === "cardano") {
        // For Cardano, we need to use the MeshWallet approach
        const { loadWallet: loadCardanoWallet, getWalletAddress } = await import("../../lib/transaction.js");
        const wallet = await loadCardanoWallet({ walletName: wName, password: pwd }, config);
        const { buildSendAdaTx, signTransaction, submitTransaction } = await import("../../lib/transaction.js");

        const txResult = await buildSendAdaTx(wallet, bridgeOrder.depositAddress, amountNum);
        const signResult = await signTransaction(wallet, txResult.unsignedTx);

        setState("submitting");
        const submitResult = await submitTransaction(config, signResult.signedTx);

        setState("updating-order");
        const updatedOrder = await updateOrder(bridgeOrder.orderId, submitResult.txHash);
        setOrder(updatedOrder);
        setTxId(submitResult.txHash);

        setState("success");

        if (json) {
          outputJsonSuccess(updatedOrder, submitResult.txHash, "~0.2");
        }

        setTimeout(() => exit(), 3000);
        return;
      } else {
        throw new Error(`Unsupported source chain: ${fromChain}`);
      }

      // Sign transaction (already done in buildTransaction for non-Cardano chains)
      setState("signing");

      // Submit transaction
      setState("submitting");

      let txHash: string;
      if (fromChain === "solana") {
        const solanaNetwork: SolanaNetwork = network === "mainnet" ? "mainnet-beta" : "devnet";
        const adapter = createSolanaAdapter(solanaNetwork);
        txHash = await adapter.submitTransaction(signedTx);
      } else if (fromChain === "bitcoin") {
        const bitcoinNetwork: BitcoinNetwork = network === "mainnet" ? "mainnet" : "testnet";
        const adapter = createBitcoinAdapter(bitcoinNetwork);
        txHash = await adapter.submitTransaction(signedTx);
      } else if (fromChain === "evm") {
        const evmNetwork = getEVMNetworkForAsset(fromAsset);
        const adapter = createEVMAdapter(evmNetwork);
        txHash = await adapter.submitTransaction(signedTx);
      } else {
        throw new Error(`Unsupported source chain: ${fromChain}`);
      }

      setTxId(txHash);

      // Update order with transaction ID
      setState("updating-order");
      const updatedOrder = await updateOrder(bridgeOrder.orderId, txHash);
      setOrder(updatedOrder);

      setState("success");

      if (json) {
        outputJsonSuccess(updatedOrder, txHash, fee);
      }

      setTimeout(() => exit(), 3000);
    } catch (err) {
      setError(getErrorMessage(err, "Bridge failed"));
      setState("error");
      setTimeout(() => exit(), 2000);
    }
  };

  const outputJsonSuccess = (bridgeOrder: XOSwapOrder, txHash: string, fee: string) => {
    console.log(
      JSON.stringify(
        {
          status: "success",
          orderId: bridgeOrder.orderId,
          orderStatus: bridgeOrder.status,
          txId: txHash,
          from: {
            asset: fromAsset,
            amount: amountNum,
            address: fromAddress,
          },
          to: {
            asset: toAsset,
            amount: rateResult?.outputAmount,
            address: toAddress,
          },
          depositAddress: bridgeOrder.depositAddress,
          fee,
        },
        null,
        2
      )
    );
  };

  // JSON output for non-success states
  if (json && state === "error") {
    console.log(JSON.stringify({ error, from: fromAsset, to: toAsset, amount: amountNum }, null, 2));
    exit();
    return null;
  }

  if (json && state === "cancelled") {
    console.log(JSON.stringify({ status: "cancelled" }));
    exit();
    return null;
  }

  // Render checking state
  if (state === "checking") {
    return (
      <Box padding={1}>
        <Text color="cyan">Checking wallet availability...</Text>
      </Box>
    );
  }

  // Render password prompt
  if (state === "password") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan">Enter password for wallet </Text>
          <Text bold color="yellow">
            {walletInfo?.walletName}
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

  // Render loading wallet state
  if (state === "loading-wallet") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Loading wallet...</Text>
      </Box>
    );
  }

  // Render quoting state
  if (state === "quoting") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Fetching bridge quote...</Text>
        <Text color="gray">
          {fromAsset} → {toAsset}
        </Text>
      </Box>
    );
  }

  // Render error state
  if (state === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  // Render cancelled state
  if (state === "cancelled") {
    return (
      <Box padding={1}>
        <Text color="yellow">Bridge cancelled</Text>
      </Box>
    );
  }

  // Render creating order state
  if (state === "creating-order") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Creating bridge order...</Text>
      </Box>
    );
  }

  // Render building tx state
  if (state === "building-tx") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Building transaction...</Text>
        <Text color="gray">Preparing to send {amountNum} {fromAsset}</Text>
      </Box>
    );
  }

  // Render signing state
  if (state === "signing") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Signing transaction...</Text>
      </Box>
    );
  }

  // Render submitting state
  if (state === "submitting") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Submitting transaction...</Text>
      </Box>
    );
  }

  // Render updating order state
  if (state === "updating-order") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Updating bridge order...</Text>
      </Box>
    );
  }

  // Render success state
  if (state === "success") {
    if (json) {
      // JSON already printed in executeBridge
      return null;
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">Bridge order submitted!</Text>

        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color="gray">Order ID: </Text>
            <Text>{order?.orderId}</Text>
          </Box>
          <Box>
            <Text color="gray">Status: </Text>
            <Text color={getStatusColor(order?.status || "pending")}>
              {formatOrderStatus(order?.status || "pending")}
            </Text>
          </Box>
          <Box>
            <Text color="gray">TX ID: </Text>
            <Text>{txId}</Text>
          </Box>
          <Box>
            <Text color="gray">Bridge: </Text>
            <Text>
              {amountNum} {fromAsset} → ~{rateResult?.outputAmount.toFixed(8)} {toAsset}
            </Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">
            Check status: begin bridge status --order {order?.orderId}
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color="yellow">
            Note: Cross-chain bridges typically take 10-30 minutes to complete.
          </Text>
        </Box>
      </Box>
    );
  }

  // Render confirm state
  if (!rateResult) {
    return null;
  }

  const fromChain = getAssetDisplayName(fromAsset);
  const toChain = getAssetDisplayName(toAsset);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Cross-Chain Bridge
        </Text>
        {walletInfo?.walletName && (
          <Text color="gray"> [{walletInfo.walletName}]</Text>
        )}
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        {/* Addresses */}
        <Box>
          <Text color="gray">From: </Text>
          <Text>
            {fromAddress?.slice(0, 12)}...{fromAddress?.slice(-8)} ({fromChain})
          </Text>
        </Box>
        <Box>
          <Text color="gray">To: </Text>
          <Text>
            {toAddress?.slice(0, 12)}...{toAddress?.slice(-8)} ({toChain})
          </Text>
        </Box>

        {/* Amount info */}
        <Box marginTop={1}>
          <Text color="gray">You send: </Text>
          <Text bold color="white">
            {amountNum} {fromAsset}
          </Text>
        </Box>
        <Box>
          <Text color="gray">You receive: </Text>
          <Text bold color="green">
            ~{rateResult.outputAmount.toFixed(8)} {toAsset}
          </Text>
        </Box>

        {/* Rate */}
        <Box marginTop={1}>
          <Text color="gray">Rate: </Text>
          <Text>
            1 {fromAsset} = {rateResult.bestRate.amount.value.toFixed(8)} {toAsset}
          </Text>
        </Box>

        {/* Fee */}
        <Box>
          <Text color="gray">Network fee: </Text>
          <Text>
            {rateResult.bestRate.minerFee.value} {toAsset}
          </Text>
        </Box>

        {/* Provider */}
        <Box>
          <Text color="gray">Provider: </Text>
          <Text>{rateResult.bestRate.provider}</Text>
        </Box>

        {/* Slippage */}
        <Box>
          <Text color="gray">Slippage: </Text>
          <Text>{slippage}%</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="yellow">
          Cross-chain bridges typically take 10-30 minutes to complete.
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text>Confirm bridge? </Text>
        <Text color="green">[Y]es</Text>
        <Text> / </Text>
        <Text color="red">[N]o</Text>
      </Box>
    </Box>
  );
}

/**
 * Get EVM network for a bridge asset
 */
function getEVMNetworkForAsset(asset: BridgeChain): EVMNetwork {
  switch (asset) {
    case "ETH":
      return "ethereum";
    case "MATIC":
      return "polygon";
    case "AVAX":
      return "avalanche";
    case "BNB":
      return "bnb";
    case "ARB":
      return "arbitrum";
    case "OP":
      return "optimism";
    default:
      return "ethereum";
  }
}

export { BridgeQuote } from "./quote.js";
export { BridgeStatus } from "./status.js";
export { BridgeOrders } from "./orders.js";
