import React, { useState, useEffect } from "react";
import { Box, Text, useApp } from "ink";
import TextInput from "ink-text-input";
import {
  listOrders,
  formatOrderStatus,
  getStatusColor,
  parsePairId,
  isSupportedAsset,
  type XOSwapOrder,
  type BridgeChain,
} from "../../services/xoswap.js";
import { getErrorMessage } from "../../lib/errors.js";
import { checkWalletAvailability } from "../../lib/transaction.js";
import { getChainAddress } from "../../lib/wallet.js";

interface BridgeOrdersProps {
  address?: string;
  asset: string;
  walletName?: string;
  password?: string;
  json: boolean;
}

type OrdersState = "checking" | "password" | "loading" | "success" | "error";

interface WalletInfo {
  source: "env" | "wallet" | "keychain";
  walletName?: string;
  needsPassword: boolean;
}

export function BridgeOrders({
  address,
  asset,
  walletName,
  password: initialPassword,
  json,
}: BridgeOrdersProps) {
  const { exit } = useApp();
  const [state, setState] = useState<OrdersState>("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState(initialPassword || "");
  const [orders, setOrders] = useState<XOSwapOrder[]>([]);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(address ?? null);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);

  const assetUpper = asset.toUpperCase();

  useEffect(() => {
    const init = async () => {
      try {
        // Validate asset
        if (!isSupportedAsset(assetUpper)) {
          throw new Error(`Unsupported asset: ${assetUpper}. Supported: BTC, SOL, ADA, ETH, MATIC, AVAX, BNB, ARB, OP`);
        }

        // If address provided, use it directly
        if (address) {
          setResolvedAddress(address);
          setState("loading");
          return;
        }

        // Otherwise, get address from wallet
        const availability = checkWalletAvailability(walletName);
        if (!availability.available) {
          throw new Error(availability.error || "No wallet available");
        }

        setWalletInfo({
          source: availability.source!,
          walletName: availability.walletName,
          needsPassword: availability.needsPassword,
        });

        if (!availability.needsPassword || initialPassword) {
          await resolveAddress(availability.walletName);
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

  useEffect(() => {
    if (state !== "loading" || !resolvedAddress) return;

    const loadOrders = async () => {
      try {
        const orderList = await listOrders(resolvedAddress, assetUpper);
        setOrders(orderList);
        setState("success");

        if (json) {
          console.log(
            JSON.stringify(
              {
                status: "success",
                address: resolvedAddress,
                asset: assetUpper,
                orders: orderList.map((order) => ({
                  orderId: order.orderId,
                  status: order.status,
                  pairId: order.pairId,
                  fromAmount: order.fromAmount,
                  toAmount: order.toAmount,
                  createdAt: order.createdAt,
                })),
              },
              null,
              2
            )
          );
          exit();
        }
      } catch (err) {
        setError(getErrorMessage(err, "Failed to load orders"));
        setState("error");
        setTimeout(() => exit(), 2000);
      }
    };

    loadOrders();
  }, [state, resolvedAddress, assetUpper, json, exit]);

  const resolveAddress = async (wName?: string) => {
    try {
      const resolvedWalletName = wName || walletName;
      if (!resolvedWalletName) {
        throw new Error("No wallet specified");
      }

      // Get chain for asset
      let chain: "bitcoin" | "solana" | "cardano" | "evm";
      switch (assetUpper as BridgeChain) {
        case "BTC":
          chain = "bitcoin";
          break;
        case "SOL":
          chain = "solana";
          break;
        case "ADA":
          chain = "cardano";
          break;
        default:
          chain = "evm";
      }

      const addr = await getChainAddress(resolvedWalletName, chain);
      if (!addr) {
        throw new Error(`Wallet does not have a ${chain} address`);
      }

      setResolvedAddress(addr);
      setState("loading");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to resolve address"));
      setState("error");
      setTimeout(() => exit(), 2000);
    }
  };

  const handlePasswordSubmit = async () => {
    if (password.trim()) {
      await resolveAddress(walletInfo?.walletName);
    }
  };

  // JSON output for errors
  if (json && state === "error") {
    console.log(JSON.stringify({ error, address: resolvedAddress, asset: assetUpper }, null, 2));
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

  // Render loading state
  if (state === "loading") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Fetching bridge orders...</Text>
        {resolvedAddress && (
          <Text color="gray">
            {resolvedAddress.slice(0, 12)}...{resolvedAddress.slice(-8)}
          </Text>
        )}
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

  // Render success state
  if (orders.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">No bridge orders found</Text>
        <Text color="gray">
          Address: {resolvedAddress?.slice(0, 12)}...{resolvedAddress?.slice(-8)}
        </Text>
        <Text color="gray">Asset: {assetUpper}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Bridge Orders
        </Text>
        <Text color="gray"> ({assetUpper})</Text>
      </Box>

      {orders.map((order, index) => {
        const { from, to } = parsePairId(order.pairId);
        const statusColor = getStatusColor(order.status);

        return (
          <Box
            key={order.orderId}
            flexDirection="column"
            borderStyle="round"
            borderColor="gray"
            padding={1}
            marginBottom={1}
          >
            <Box>
              <Text color="gray">Order {index + 1}: </Text>
              <Text>{order.orderId.slice(0, 16)}...</Text>
            </Box>
            <Box>
              <Text color="gray">Status: </Text>
              <Text bold color={statusColor}>
                {formatOrderStatus(order.status)}
              </Text>
            </Box>
            <Box>
              <Text color="gray">Bridge: </Text>
              <Text>
                {order.fromAmount} {from} → {order.toAmount} {to}
              </Text>
            </Box>
            <Box>
              <Text color="gray">Created: </Text>
              <Text>{new Date(order.createdAt).toLocaleString()}</Text>
            </Box>
          </Box>
        );
      })}

      <Box>
        <Text color="gray">
          View details: begin bridge status --order {"<orderId>"}
        </Text>
      </Box>
    </Box>
  );
}
