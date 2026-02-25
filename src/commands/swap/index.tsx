import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import {
  createMinswapClient,
  MockMinswapClient,
  type SwapEstimate,
  type MinswapClient,
  type EstimateRequest,
} from '../../services/minswap.js';
import {
  resolveTokenId,
  formatSwapQuote,
  validateSlippage,
  isHighPriceImpact,
  isCriticalPriceImpact,
  formatRoute,
  extractWitnessSet,
  type ResolvedToken,
  type FormattedQuote,
} from '../../lib/swap.js';
import {
  loadWallet,
  getWalletAddress,
  checkWalletAvailability,
  type TransactionConfig,
} from '../../lib/transaction.js';
import type { MeshWallet } from '@meshsdk/core';

interface SwapProps {
  from: string;
  to: string;
  amount: string;
  slippage: number;
  multiHop: boolean;
  yes: boolean;
  network: string;
  walletName?: string;
  password?: string;
  json: boolean;
}

type SwapState =
  | 'checking'
  | 'password'
  | 'loading-wallet'
  | 'resolving'
  | 'quoting'
  | 'confirm'
  | 'building'
  | 'signing'
  | 'submitting'
  | 'success'
  | 'cancelled'
  | 'error';

interface WalletInfo {
  source: 'env' | 'wallet';
  walletName?: string;
  needsPassword: boolean;
}

export function Swap({
  from,
  to,
  amount,
  slippage,
  multiHop,
  yes,
  network,
  walletName,
  password: initialPassword,
  json,
}: SwapProps) {
  const { exit } = useApp();
  const [state, setState] = useState<SwapState>('checking');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState(initialPassword || '');
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);

  // Swap data
  const [fromToken, setFromToken] = useState<ResolvedToken | null>(null);
  const [toToken, setToToken] = useState<ResolvedToken | null>(null);
  const [estimate, setEstimate] = useState<SwapEstimate | null>(null);
  const [estimateRequest, setEstimateRequest] = useState<EstimateRequest | null>(null);
  const [quote, setQuote] = useState<FormattedQuote | null>(null);
  const [senderAddress, setSenderAddress] = useState<string | null>(null);
  const [unsignedTx, setUnsignedTx] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [estimatedFee, setEstimatedFee] = useState<string | null>(null);

  // Wallet and client refs
  const [wallet, setWallet] = useState<MeshWallet | null>(null);
  const [client, setClient] = useState<MinswapClient | null>(null);

  const config: TransactionConfig = { network };

  // Check wallet availability on mount
  useEffect(() => {
    const availability = checkWalletAvailability(walletName);

    if (!availability.available) {
      setError(availability.error || 'No wallet available');
      setState('error');
      setTimeout(() => exit(), 2000);
      return;
    }

    setWalletInfo({
      source: availability.source!,
      walletName: availability.walletName,
      needsPassword: availability.needsPassword,
    });

    // Create Minswap client
    const useMock = process.env.MINSWAP_MOCK === 'true';
    const minswapClient = useMock
      ? new MockMinswapClient(network)
      : createMinswapClient(network);
    setClient(minswapClient);

    // If using env var or password already provided, proceed to loading
    if (!availability.needsPassword || initialPassword) {
      initWallet(initialPassword, availability.walletName, minswapClient);
    } else {
      setState('password');
    }
  }, []);

  // Handle password submission
  const handlePasswordSubmit = () => {
    if (password.trim() && client) {
      initWallet(password, walletInfo?.walletName, client);
    }
  };

  // Initialize wallet and start swap flow
  const initWallet = async (
    pwd?: string,
    wName?: string,
    minswapClient?: MinswapClient
  ) => {
    try {
      setState('loading-wallet');

      const loadedWallet = await loadWallet(
        { walletName: wName, password: pwd },
        config
      );
      setWallet(loadedWallet);

      const address = await getWalletAddress(loadedWallet);
      setSenderAddress(address);

      // Continue with token resolution
      await resolveTokens(minswapClient || client!);
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

  // Resolve tokens and get quote
  const resolveTokens = async (minswapClient: MinswapClient) => {
    try {
      validateSlippage(slippage);

      setState('resolving');

      const [resolvedFrom, resolvedTo] = await Promise.all([
        resolveTokenId(from, minswapClient),
        resolveTokenId(to, minswapClient),
      ]);

      if (resolvedFrom.tokenId === resolvedTo.tokenId) {
        throw new Error('Cannot swap a token for itself');
      }

      setFromToken(resolvedFrom);
      setToToken(resolvedTo);

      // Get quote
      setState('quoting');

      const request: EstimateRequest = {
        tokenIn: resolvedFrom.tokenId,
        tokenOut: resolvedTo.tokenId,
        amount,
        slippage,
        allowMultiHops: multiHop,
        amountInDecimal: true,
      };

      setEstimateRequest(request);

      const swapEstimate = await minswapClient.estimate(request);

      setEstimate(swapEstimate);

      const formatted = formatSwapQuote(swapEstimate, resolvedFrom, resolvedTo);
      setQuote(formatted);

      // If --yes flag, skip confirmation
      if (yes) {
        await executeSwap(minswapClient, swapEstimate, request);
      } else {
        setState('confirm');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get quote');
      setState('error');
      setTimeout(() => exit(), 2000);
    }
  };

  // Handle keyboard input for confirmation
  useInput((input, key) => {
    if (state !== 'confirm') return;

    if (input === 'y' || input === 'Y') {
      if (client && estimate) {
        executeSwap(client, estimate);
      }
    } else if (input === 'n' || input === 'N' || key.escape) {
      setState('cancelled');
      setTimeout(() => exit(), 500);
    }
  });

  // Execute the swap
  const executeSwap = async (
    minswapClient: MinswapClient,
    swapEstimate: SwapEstimate,
    requestOverride?: EstimateRequest
  ) => {
    try {
      if (!wallet || !senderAddress) {
        throw new Error('Wallet not loaded');
      }
      const request = requestOverride ?? estimateRequest;
      if (!request) {
        throw new Error('Missing estimate request');
      }

      // Build transaction
      setState('building');

      const buildResult = await minswapClient.buildTx({
        sender: senderAddress,
        minAmountOut: swapEstimate.minAmountOut,
        estimate: request,
        amountInDecimal: true,
      });

      setUnsignedTx(buildResult.cbor);
      setEstimatedFee(buildResult.estimatedFee ?? null);

      // Sign transaction
      setState('signing');

      const signedTx = await wallet.signTx(buildResult.cbor);
      const witnessSet = await extractWitnessSet(signedTx);

      // Submit transaction
      setState('submitting');

      const submitResult = await minswapClient.submitTx({
        cbor: buildResult.cbor,
        witnessSet: witnessSet,
      });

      setTxId(submitResult.txId);
      setState('success');

      if (json) {
        console.log(
          JSON.stringify(
            {
              status: 'success',
              txId: submitResult.txId,
              network,
              from: {
                token: fromToken?.ticker,
                amount: swapEstimate.amountIn,
              },
              to: {
                token: toToken?.ticker,
                amount: swapEstimate.amountOut,
                minAmount: swapEstimate.minAmountOut,
              },
              fee: buildResult.estimatedFee,
            },
            null,
            2
          )
        );
      }

      setTimeout(() => exit(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap failed');
      setState('error');
      setTimeout(() => exit(), 2000);
    }
  };

  // JSON output for non-success states
  if (json && state === 'error') {
    console.log(JSON.stringify({ error, from, to, amount }, null, 2));
    exit();
    return null;
  }

  if (json && state === 'cancelled') {
    console.log(JSON.stringify({ status: 'cancelled' }));
    exit();
    return null;
  }

  // Render checking state
  if (state === 'checking') {
    return (
      <Box padding={1}>
        <Text color="cyan">⏳ Checking wallet availability...</Text>
      </Box>
    );
  }

  // Render password prompt
  if (state === 'password') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan">🔐 Enter password for wallet </Text>
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
  if (state === 'loading-wallet') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Loading wallet...</Text>
        {walletInfo?.source === 'wallet' && (
          <Text color="gray">Decrypting {walletInfo.walletName}...</Text>
        )}
      </Box>
    );
  }

  // Render resolving tokens state
  if (state === 'resolving') {
    return (
      <Box padding={1}>
        <Text color="cyan">⏳ Resolving tokens...</Text>
      </Box>
    );
  }

  // Render quoting state
  if (state === 'quoting') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Fetching swap quote...</Text>
        <Text color="gray">
          {fromToken?.ticker || from} → {toToken?.ticker || to}
        </Text>
      </Box>
    );
  }

  // Render error state
  if (state === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ Error: {error}</Text>
      </Box>
    );
  }

  // Render cancelled state
  if (state === 'cancelled') {
    return (
      <Box padding={1}>
        <Text color="yellow">Swap cancelled</Text>
      </Box>
    );
  }

  // Render building state
  if (state === 'building') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔨 Building swap transaction...</Text>
        <Text color="gray">Preparing UTxOs and order...</Text>
      </Box>
    );
  }

  // Render signing state
  if (state === 'signing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔐 Signing transaction...</Text>
      </Box>
    );
  }

  // Render submitting state
  if (state === 'submitting') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">📤 Submitting swap order...</Text>
      </Box>
    );
  }

  // Render success state
  if (state === 'success') {
    if (json) {
      // JSON already printed in executeSwap
      return null;
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">✓ Swap order submitted!</Text>

        <Box marginTop={1} flexDirection="column">
          <Box>
          <Text color="gray">TX ID: </Text>
          <Text>{txId}</Text>
          </Box>
          <Box>
            <Text color="gray">Swap: </Text>
            <Text>
              {quote?.fromAmount} → {quote?.toAmount}
            </Text>
          </Box>
          {estimatedFee && (
            <Box>
              <Text color="gray">Fee: </Text>
              <Text>{estimatedFee} ADA</Text>
            </Box>
          )}
        </Box>

        <Box marginTop={1}>
          <Text color="gray">View on: </Text>
          <Text color="blue">
            https://{network === 'mainnet' ? '' : network + '.'}cardanoscan.io/transaction/{txId}
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">
            Note: Swap may take a few minutes to execute through the DEX.
          </Text>
        </Box>

        {process.env.MINSWAP_MOCK === 'true' && (
          <Box marginTop={1}>
            <Text color="yellow">
              ⚠ This is a MOCK transaction - no real swap occurred
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  // Render confirm state
  if (!quote || !estimate || !fromToken || !toToken) {
    return null;
  }

  const highImpact = isHighPriceImpact(estimate.avgPriceImpact);
  const criticalImpact = isCriticalPriceImpact(estimate.avgPriceImpact);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Swap
        </Text>
        <Text color="gray"> ({network})</Text>
        {walletInfo?.source === 'wallet' && (
          <Text color="gray"> [{walletInfo.walletName}]</Text>
        )}
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        padding={1}
      >
        {/* Sender address */}
        <Box>
          <Text color="gray">From wallet: </Text>
          <Text>
            {senderAddress?.slice(0, 20)}...{senderAddress?.slice(-10)}
          </Text>
        </Box>

        {/* Amount info */}
        <Box marginTop={1}>
          <Text color="gray">You pay:     </Text>
          <Text bold color="white">
            {quote.fromAmount}
          </Text>
        </Box>
        <Box>
          <Text color="gray">You receive: </Text>
          <Text bold color="green">
            {quote.toAmount}
          </Text>
        </Box>
        <Box>
          <Text color="gray">Min received: </Text>
          <Text color="yellow">{quote.minReceived}</Text>
          <Text color="gray"> (after {slippage}% slippage)</Text>
        </Box>

        {/* Rate */}
        <Box marginTop={1}>
          <Text color="gray">Rate: </Text>
          <Text>{quote.rate}</Text>
        </Box>

        {/* Price impact */}
        <Box>
          <Text color="gray">Price impact: </Text>
          <Text
            color={criticalImpact ? 'red' : highImpact ? 'yellow' : 'green'}
          >
            {quote.priceImpact}
          </Text>
          {criticalImpact && <Text color="red"> ⚠ HIGH</Text>}
          {highImpact && !criticalImpact && (
            <Text color="yellow"> ⚠ Moderate</Text>
          )}
        </Box>

        {/* Route */}
        <Box marginTop={1}>
          <Text color="gray">Route: </Text>
          <Text>{formatRoute(estimate.paths, fromToken, toToken)}</Text>
        </Box>

        {/* Fees */}
        <Box marginTop={1}>
          <Text color="gray">Total fees: </Text>
          <Text>{quote.totalFees}</Text>
        </Box>
      </Box>

      {criticalImpact && (
        <Box marginTop={1}>
          <Text color="red">
            ⚠ Warning: High price impact! Consider splitting into smaller swaps.
          </Text>
        </Box>
      )}

      {process.env.MINSWAP_MOCK === 'true' && (
        <Box marginTop={1}>
          <Text color="yellow">
            ⚠ Using mock data - no real swap will occur
          </Text>
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

export { SwapCancel } from './cancel.js';
export { SwapOrders } from './orders.js';
