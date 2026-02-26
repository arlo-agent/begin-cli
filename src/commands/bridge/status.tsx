import React, { useState, useEffect } from "react";
import { Box, Text, useApp } from "ink";
import {
  getOrder,
  formatOrderStatus,
  getStatusColor,
  parsePairId,
  getAssetDisplayName,
  type XOSwapOrder,
} from "../../services/xoswap.js";
import { getErrorMessage } from "../../lib/errors.js";

interface BridgeStatusProps {
  orderId: string;
  json: boolean;
}

type StatusState = "loading" | "success" | "error";

export function BridgeStatus({ orderId, json }: BridgeStatusProps) {
  const { exit } = useApp();
  const [state, setState] = useState<StatusState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<XOSwapOrder | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        if (!orderId) {
          throw new Error("Order ID is required");
        }

        const orderData = await getOrder(orderId);
        setOrder(orderData);
        setState("success");
      } catch (err) {
        setError(getErrorMessage(err, "Failed to get order status"));
        setState("error");
      }
    };

    fetchStatus();
  }, [orderId]);

  // JSON output
  if (json) {
    if (state === "loading") {
      return <Text>{JSON.stringify({ status: "loading" })}</Text>;
    }

    if (state === "error") {
      console.log(JSON.stringify({ error, orderId }, null, 2));
      exit();
      return null;
    }

    if (state === "success" && order) {
      const { from, to } = parsePairId(order.pairId);
      console.log(
        JSON.stringify(
          {
            orderId: order.orderId,
            status: order.status,
            pairId: order.pairId,
            from: {
              asset: from,
              amount: order.fromAmount,
              address: order.fromAddress,
            },
            to: {
              asset: to,
              amount: order.toAmount,
              address: order.toAddress,
            },
            depositAddress: order.depositAddress,
            transactionId: order.transactionId,
            outputTransactionId: order.outputTransactionId,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            expiresAt: order.expiresAt,
          },
          null,
          2
        )
      );
      exit();
      return null;
    }

    return null;
  }

  // Human-readable output
  if (state === "loading") {
    return (
      <Box padding={1}>
        <Text color="cyan">Fetching order status...</Text>
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

  if (!order) {
    return null;
  }

  const { from, to } = parsePairId(order.pairId);
  const fromChain = getAssetDisplayName(from);
  const toChain = getAssetDisplayName(to);
  const statusColor = getStatusColor(order.status);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Bridge Order Status
        </Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        {/* Order ID and Status */}
        <Box>
          <Text color="gray">Order ID: </Text>
          <Text>{order.orderId}</Text>
        </Box>
        <Box>
          <Text color="gray">Status: </Text>
          <Text bold color={statusColor}>
            {formatOrderStatus(order.status)}
          </Text>
        </Box>

        {/* Route */}
        <Box marginTop={1}>
          <Text color="gray">Route: </Text>
          <Text>
            {fromChain} ({from}) → {toChain} ({to})
          </Text>
        </Box>

        {/* Amounts */}
        <Box marginTop={1}>
          <Text color="gray">Sent: </Text>
          <Text>
            {order.fromAmount} {from}
          </Text>
        </Box>
        <Box>
          <Text color="gray">Expected: </Text>
          <Text>
            {order.toAmount} {to}
          </Text>
        </Box>

        {/* Addresses */}
        <Box marginTop={1}>
          <Text color="gray">From address: </Text>
          <Text>
            {order.fromAddress.slice(0, 12)}...{order.fromAddress.slice(-8)}
          </Text>
        </Box>
        <Box>
          <Text color="gray">To address: </Text>
          <Text>
            {order.toAddress.slice(0, 12)}...{order.toAddress.slice(-8)}
          </Text>
        </Box>

        {/* Deposit address */}
        {order.depositAddress && (
          <Box marginTop={1}>
            <Text color="gray">Deposit address: </Text>
            <Text>
              {order.depositAddress.slice(0, 12)}...{order.depositAddress.slice(-8)}
            </Text>
          </Box>
        )}

        {/* Transaction IDs */}
        {order.transactionId && (
          <Box marginTop={1}>
            <Text color="gray">Input TX: </Text>
            <Text>{order.transactionId}</Text>
          </Box>
        )}
        {order.outputTransactionId && (
          <Box>
            <Text color="gray">Output TX: </Text>
            <Text color="green">{order.outputTransactionId}</Text>
          </Box>
        )}

        {/* Timestamps */}
        <Box marginTop={1}>
          <Text color="gray">Created: </Text>
          <Text>{new Date(order.createdAt).toLocaleString()}</Text>
        </Box>
        {order.updatedAt && (
          <Box>
            <Text color="gray">Updated: </Text>
            <Text>{new Date(order.updatedAt).toLocaleString()}</Text>
          </Box>
        )}
        {order.expiresAt && (
          <Box>
            <Text color="gray">Expires: </Text>
            <Text>{new Date(order.expiresAt).toLocaleString()}</Text>
          </Box>
        )}
      </Box>

      {/* Status-specific messages */}
      {order.status === "awaiting_deposit" && (
        <Box marginTop={1}>
          <Text color="yellow">
            Waiting for deposit. Send {order.fromAmount} {from} to the deposit address.
          </Text>
        </Box>
      )}

      {order.status === "processing" && (
        <Box marginTop={1}>
          <Text color="cyan">
            Bridge is processing. This typically takes 10-30 minutes.
          </Text>
        </Box>
      )}

      {order.status === "completed" && (
        <Box marginTop={1}>
          <Text color="green">
            Bridge completed! Funds have been sent to your {toChain} address.
          </Text>
        </Box>
      )}

      {order.status === "failed" && (
        <Box marginTop={1}>
          <Text color="red">
            Bridge failed. Contact support if funds were sent.
          </Text>
        </Box>
      )}

      {order.status === "refunded" && (
        <Box marginTop={1}>
          <Text color="yellow">
            Order was refunded. Check your {fromChain} address for returned funds.
          </Text>
        </Box>
      )}
    </Box>
  );
}
