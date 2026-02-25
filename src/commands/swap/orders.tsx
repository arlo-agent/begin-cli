import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import {
  createMinswapClient,
  MockMinswapClient,
  type MinswapClient,
  type PendingOrder,
} from '../../services/minswap.js';
import {
  checkWalletAvailability,
  getWalletAddress,
  loadWallet,
  type TransactionConfig,
} from '../../lib/transaction.js';

interface SwapOrdersProps {
  network: string;
  walletName?: string;
  password?: string;
  address?: string;
  json: boolean;
}

type OrdersState = 'checking' | 'password' | 'loading-wallet' | 'loading' | 'success' | 'error';

export function SwapOrders({
  network,
  walletName,
  password: initialPassword,
  address,
  json,
}: SwapOrdersProps) {
  const { exit } = useApp();
  const [state, setState] = useState<OrdersState>('checking');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState(initialPassword || '');
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(address ?? null);
  const [client, setClient] = useState<MinswapClient | null>(null);

  const config: TransactionConfig = { network };

  useEffect(() => {
    const useMock = process.env.MINSWAP_MOCK === 'true';
    setClient(useMock ? new MockMinswapClient(network) : createMinswapClient(network));

    if (address) {
      setState('loading');
      return;
    }

    const availability = checkWalletAvailability(walletName);
    if (!availability.available) {
      setError(availability.error || 'No wallet available');
      setState('error');
      setTimeout(() => exit(), 2000);
      return;
    }

    if (!availability.needsPassword || initialPassword) {
      initWallet(initialPassword, availability.walletName);
    } else {
      setState('password');
    }
  }, []);

  useEffect(() => {
    if (state !== 'loading' || !client) return;

    const loadOrders = async () => {
      try {
        if (!resolvedAddress) {
          throw new Error('Missing address');
        }

        const pending = await client.getPendingOrders(resolvedAddress, true);
        setOrders(pending);
        setState('success');

        if (json) {
          console.log(
            JSON.stringify(
              {
                status: 'success',
                address: resolvedAddress,
                orders: pending,
              },
              null,
              2
            )
          );
          exit();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load orders');
        setState('error');
        setTimeout(() => exit(), 2000);
      }
    };

    loadOrders();
  }, [state, client, resolvedAddress, json, exit]);

  const initWallet = async (pwd?: string, wName?: string) => {
    try {
      setState('loading-wallet');
      const wallet = await loadWallet({ walletName: wName, password: pwd }, config);
      const walletAddress = await getWalletAddress(wallet);
      setResolvedAddress(walletAddress);
      setState('loading');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load wallet';
      if (message.includes('Incorrect password')) {
        setError('Incorrect password. Please try again.');
      } else {
        setError(message);
      }
      setState('error');
      setTimeout(() => exit(), 2000);
    }
  };

  const handlePasswordSubmit = () => {
    if (password.trim()) {
      initWallet(password, walletName);
    }
  };

  if (json && state === 'error') {
    console.log(JSON.stringify({ error, address }, null, 2));
    exit();
    return null;
  }

  if (state === 'checking') {
    return (
      <Box padding={1}>
        <Text color="cyan">⏳ Checking wallet availability...</Text>
      </Box>
    );
  }

  if (state === 'password') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan">🔐 Enter password for wallet </Text>
          <Text bold color="yellow">{walletName}</Text>
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

  if (state === 'loading-wallet') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Loading wallet...</Text>
      </Box>
    );
  }

  if (state === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Fetching pending orders...</Text>
        {resolvedAddress && (
          <Text color="gray">
            {resolvedAddress.slice(0, 20)}...{resolvedAddress.slice(-10)}
          </Text>
        )}
      </Box>
    );
  }

  if (state === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ Error: {error}</Text>
      </Box>
    );
  }

  if (orders.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">✓ No pending swap orders</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Pending Swap Orders</Text>
        <Text color="gray"> ({network})</Text>
      </Box>
      {orders.map((order, index) => (
        <Box
          key={`${order.txIn}-${index}`}
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          padding={1}
          marginBottom={1}
        >
          <Text color="gray">Order {index + 1}</Text>
          <Text>TX In: {order.txIn}</Text>
          <Text>Protocol: {order.protocol}</Text>
          <Text>
            Swap: {order.amountIn} {order.tokenIn.ticker} → {order.minAmountOut}{' '}
            {order.tokenOut.ticker}
          </Text>
          <Text color="gray">
            Created: {new Date(order.createdAt).toLocaleString()}
          </Text>
        </Box>
      ))}
      <Box>
        <Text color="gray">To cancel: begin swap cancel --id {'<tx_in>'}</Text>
      </Box>
    </Box>
  );
}
