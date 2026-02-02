import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import {
  createMinswapClient,
  MockMinswapClient,
  type SwapEstimate,
} from '../../services/minswap.js';
import {
  resolveTokenId,
  formatSwapQuote,
  validateSlippage,
  isHighPriceImpact,
  isCriticalPriceImpact,
  formatRoute,
  type ResolvedToken,
  type FormattedQuote,
} from '../../lib/swap.js';

interface SwapQuoteProps {
  from: string;
  to: string;
  amount: string;
  slippage: number;
  multiHop: boolean;
  network: string;
  json: boolean;
}

type QuoteState = 'resolving' | 'loading' | 'success' | 'error';

export function SwapQuote({
  from,
  to,
  amount,
  slippage,
  multiHop,
  network,
  json,
}: SwapQuoteProps) {
  const [state, setState] = useState<QuoteState>('resolving');
  const [error, setError] = useState<string | null>(null);
  const [fromToken, setFromToken] = useState<ResolvedToken | null>(null);
  const [toToken, setToToken] = useState<ResolvedToken | null>(null);
  const [estimate, setEstimate] = useState<SwapEstimate | null>(null);
  const [quote, setQuote] = useState<FormattedQuote | null>(null);

  useEffect(() => {
    const fetchQuote = async () => {
      try {
        // Validate slippage
        validateSlippage(slippage);

        // Create client (use mock if no real API access)
        const useMock = process.env.MINSWAP_MOCK === 'true' || !process.env.BLOCKFROST_API_KEY;
        const client = useMock
          ? new MockMinswapClient(network)
          : createMinswapClient(network);

        // Resolve token IDs
        setState('resolving');
        const [resolvedFrom, resolvedTo] = await Promise.all([
          resolveTokenId(from, client),
          resolveTokenId(to, client),
        ]);

        if (resolvedFrom.tokenId === resolvedTo.tokenId) {
          throw new Error('Cannot swap a token for itself');
        }

        setFromToken(resolvedFrom);
        setToToken(resolvedTo);

        // Get estimate
        setState('loading');
        const swapEstimate = await client.estimate({
          tokenIn: resolvedFrom.tokenId,
          tokenOut: resolvedTo.tokenId,
          amount: amount,
          slippage: slippage,
          allowMultiHops: multiHop,
          amountInDecimal: true,
        });

        setEstimate(swapEstimate);

        // Format quote
        const formatted = formatSwapQuote(swapEstimate, resolvedFrom, resolvedTo);
        setQuote(formatted);

        setState('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get quote');
        setState('error');
      }
    };

    fetchQuote();
  }, [from, to, amount, slippage, multiHop, network]);

  // JSON output
  if (json) {
    if (state === 'resolving' || state === 'loading') {
      return <Text>{JSON.stringify({ status: state })}</Text>;
    }

    if (state === 'error') {
      console.log(JSON.stringify({ error, from, to, amount }, null, 2));
      process.exit(1);
      return null;
    }

    if (state === 'success' && estimate && quote) {
      console.log(
        JSON.stringify(
          {
            status: 'success',
            network,
            from: {
              token: fromToken?.ticker,
              tokenId: fromToken?.tokenId,
              amount: estimate.amountIn,
            },
            to: {
              token: toToken?.ticker,
              tokenId: toToken?.tokenId,
              amount: estimate.amountOut,
              minAmount: estimate.minAmountOut,
            },
            rate: estimate.effectivePrice,
            inverseRate: estimate.inversePrice,
            priceImpact: estimate.priceImpact,
            slippage,
            fees: {
              lp: estimate.lpFee,
              dex: estimate.dexFee,
              aggregator: estimate.aggregatorFee,
            },
            route: estimate.route,
            multiHop: estimate.route.length > 1,
          },
          null,
          2
        )
      );
      process.exit(0);
      return null;
    }

    return null;
  }

  // Human-readable output
  if (state === 'resolving') {
    return (
      <Box padding={1}>
        <Text color="cyan">⏳ Resolving tokens...</Text>
      </Box>
    );
  }

  if (state === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Fetching swap quote...</Text>
        <Text color="gray">
          {fromToken?.ticker} → {toToken?.ticker}
        </Text>
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

  if (!quote || !estimate || !fromToken || !toToken) {
    return null;
  }

  const highImpact = isHighPriceImpact(estimate.priceImpact);
  const criticalImpact = isCriticalPriceImpact(estimate.priceImpact);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Swap Quote
        </Text>
        <Text color="gray"> ({network})</Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        padding={1}
      >
        {/* Amount info */}
        <Box>
          <Text color="gray">You pay:    </Text>
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
          <Text color={criticalImpact ? 'red' : highImpact ? 'yellow' : 'green'}>
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
          <Text>{formatRoute(estimate.route, fromToken, toToken)}</Text>
        </Box>
        {estimate.route.length > 1 && (
          <Text color="gray"> ({estimate.route.length} hops)</Text>
        )}

        {/* Fees */}
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color="gray">Fees: </Text>
            <Text>{quote.totalFees}</Text>
          </Box>
          <Box paddingLeft={2}>
            <Text color="gray">
              LP: {quote.feeBreakdown.lpFee} | DEX: {quote.feeBreakdown.dexFee} |
              Aggregator: {quote.feeBreakdown.aggregatorFee}
            </Text>
          </Box>
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
            ⚠ Using mock data - set up Minswap API for real quotes
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">
          To execute this swap, run: begin swap --from {from} --to {to} --amount{' '}
          {amount}
        </Text>
      </Box>
    </Box>
  );
}
