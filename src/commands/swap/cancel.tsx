import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import {
  createMinswapClient,
  MockMinswapClient,
  type MinswapClient,
  type Protocol,
} from '../../services/minswap.js';
import {
  checkWalletAvailability,
  getWalletAddress,
  loadWallet,
  type TransactionConfig,
} from '../../lib/transaction.js';
import { extractWitnessSet } from '../../lib/swap.js';
import type { MeshWallet } from '@meshsdk/core';

interface SwapCancelProps {
  network: string;
  walletName?: string;
  password?: string;
  ids: string[];
  protocol?: string;
  yes: boolean;
  json: boolean;
}

type CancelState =
  | 'checking'
  | 'password'
  | 'loading-wallet'
  | 'loading-orders'
  | 'confirm'
  | 'building'
  | 'signing'
  | 'submitting'
  | 'success'
  | 'cancelled'
  | 'error';

const PROTOCOLS: Protocol[] = [
  'MinswapV2',
  'Minswap',
  'MinswapStable',
  'MuesliSwap',
  'Splash',
  'SundaeSwapV3',
  'SundaeSwap',
  'VyFinance',
  'CswapV1',
  'WingRidersV2',
  'WingRiders',
  'WingRidersStableV2',
  'Spectrum',
  'SplashStable',
];

export function SwapCancel({
  network,
  walletName,
  password: initialPassword,
  ids,
  protocol,
  yes,
  json,
}: SwapCancelProps) {
  const { exit } = useApp();
  const [state, setState] = useState<CancelState>('checking');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState(initialPassword || '');
  const [wallet, setWallet] = useState<MeshWallet | null>(null);
  const [senderAddress, setSenderAddress] = useState<string | null>(null);
  const [client, setClient] = useState<MinswapClient | null>(null);
  const [orders, setOrders] = useState<Array<{ txIn: string; protocol: Protocol }>>([]);
  const [txId, setTxId] = useState<string | null>(null);

  const config: TransactionConfig = { network };

  useEffect(() => {
    const useMock = process.env.MINSWAP_MOCK === 'true';
    setClient(useMock ? new MockMinswapClient(network) : createMinswapClient(network));

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
    if (state !== 'loading-orders' || !client || !senderAddress) return;

    const loadOrders = async () => {
      try {
        const pending = await client.getPendingOrders(senderAddress, true);
        const pendingMap = new Map(
          pending.map((order) => [order.txIn.toLowerCase(), order.protocol])
        );

        const overrideProtocol =
          protocol && PROTOCOLS.includes(protocol as Protocol)
            ? (protocol as Protocol)
            : undefined;

        const resolved = ids.map((id) => {
          const foundProtocol = pendingMap.get(id.toLowerCase());
          if (foundProtocol) {
            return { txIn: id, protocol: foundProtocol };
          }
          if (overrideProtocol) {
            return { txIn: id, protocol: overrideProtocol };
          }
          throw new Error(
            `Order not found in pending list: ${id}. Run 'begin swap orders' or pass --protocol.`
          );
        });

        setOrders(resolved);

        if (yes) {
          await executeCancel(resolved);
        } else {
          setState('confirm');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load pending orders');
        setState('error');
        setTimeout(() => exit(), 2000);
      }
    };

    loadOrders();
  }, [state, client, senderAddress, ids, protocol, yes]);

  const initWallet = async (pwd?: string, wName?: string) => {
    try {
      setState('loading-wallet');
      const loadedWallet = await loadWallet({ walletName: wName, password: pwd }, config);
      setWallet(loadedWallet);
      const address = await getWalletAddress(loadedWallet);
      setSenderAddress(address);
      setState('loading-orders');
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

  const executeCancel = async (ordersToCancel: Array<{ txIn: string; protocol: Protocol }>) => {
    try {
      if (!wallet || !client || !senderAddress) {
        throw new Error('Wallet not loaded');
      }

      setState('building');
      const buildResult = await client.buildCancelTx({
        sender: senderAddress,
        orders: ordersToCancel,
      });

      setState('signing');
      const signedTx = await wallet.signTx(buildResult.cbor);
      const witnessSet = await extractWitnessSet(signedTx);

      setState('submitting');
      const submitResult = await client.submitTx({
        cbor: buildResult.cbor,
        witnessSet,
      });

      setTxId(submitResult.txId);
      setState('success');

      if (json) {
        console.log(
          JSON.stringify(
            {
              status: 'success',
              txId: submitResult.txId,
              orders: ordersToCancel,
              network,
            },
            null,
            2
          )
        );
      }

      setTimeout(() => exit(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
      setState('error');
      setTimeout(() => exit(), 2000);
    }
  };

  useInput((input, key) => {
    if (state !== 'confirm') return;
    if (input === 'y' || input === 'Y') {
      executeCancel(orders);
    } else if (input === 'n' || input === 'N' || key.escape) {
      setState('cancelled');
      setTimeout(() => exit(), 500);
    }
  });

  if (json && state === 'error') {
    console.log(JSON.stringify({ error, ids }, null, 2));
    exit();
    return null;
  }

  if (json && state === 'cancelled') {
    console.log(JSON.stringify({ status: 'cancelled' }));
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

  if (state === 'loading-orders') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Resolving pending orders...</Text>
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

  if (state === 'cancelled') {
    return (
      <Box padding={1}>
        <Text color="yellow">Cancel request aborted</Text>
      </Box>
    );
  }

  if (state === 'building') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔨 Building cancel transaction...</Text>
      </Box>
    );
  }

  if (state === 'signing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔐 Signing transaction...</Text>
      </Box>
    );
  }

  if (state === 'submitting') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">📤 Submitting cancellation...</Text>
      </Box>
    );
  }

  if (state === 'success') {
    if (json) {
      return null;
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">✓ Cancel transaction submitted</Text>
        <Box marginTop={1}>
          <Text color="gray">TX ID: </Text>
          <Text>{txId}</Text>
        </Box>
      </Box>
    );
  }

  if (state !== 'confirm') {
    return null;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Cancel Swap Orders</Text>
        <Text color="gray"> ({network})</Text>
      </Box>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        padding={1}
      >
        {orders.map((order, index) => (
          <Text key={`${order.txIn}-${index}`}>
            {index + 1}. {order.txIn} ({order.protocol})
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text>Confirm cancel? </Text>
        <Text color="green">[Y]es</Text>
        <Text> / </Text>
        <Text color="red">[N]o</Text>
      </Box>
    </Box>
  );
}
