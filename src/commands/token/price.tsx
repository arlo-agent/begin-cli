/**
 * Token price command - get price for any supported token
 * - ADA/BTC/SOL: uses CoinGecko
 * - Cardano native tokens: uses Minswap
 */

import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import {
  getPrice,
  formatPrice,
  formatChange,
  formatCompact,
  type PriceData,
} from '../../services/market.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { ExitCode } from '../../lib/errors.js';

interface TokenPriceProps {
  symbol: string;
  currency: string;
  json: boolean;
}

export function TokenPrice({ symbol, currency, json }: TokenPriceProps) {
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState<PriceData | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const result = await getPrice(symbol, currency);
        if (!result) {
          throw new Error(`Token not found: ${symbol}`);
        }
        setPrice(result);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };
    fetchPrice();
  }, [symbol, currency]);

  // Handle JSON output
  useEffect(() => {
    if (json && !loading) {
      if (error) {
        outputError(error);
        process.exit(ExitCode.ERROR);
      } else if (price) {
        outputSuccess({
          symbol: symbol.toUpperCase(),
          ticker: price.ticker,
          name: price.name,
          price: price.price,
          change24h: price.change24h,
          volume24h: price.volume24h,
          marketCap: price.marketCap,
          currency: price.currency,
          source: price.source,
        });
        process.exit(ExitCode.SUCCESS);
      }
    }
  }, [json, loading, error, price, symbol]);

  if (json) return null;
  if (loading) return <Box><Text>Fetching price for {symbol.toUpperCase()}...</Text></Box>;
  if (error) return <Box><Text color="red">Error: {error.message}</Text></Box>;
  if (!price) return <Box><Text color="red">No price data available</Text></Box>;

  const changeColor = price.change24h >= 0 ? 'green' : 'red';

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text bold color="cyan">{price.ticker}</Text>
        <Text color="gray"> — </Text>
        <Text bold>{formatPrice(price.price)}</Text>
        <Text> </Text>
        <Text color={changeColor}>({formatChange(price.change24h)})</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Market Cap: </Text>
        <Text>{formatCompact(price.marketCap)}</Text>
        <Text color="gray"> | 24h Vol: </Text>
        <Text>{formatCompact(price.volume24h)}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {price.name} • Source: {price.source === 'coingecko' ? 'CoinGecko' : 'Minswap'}
        </Text>
      </Box>
    </Box>
  );
}
