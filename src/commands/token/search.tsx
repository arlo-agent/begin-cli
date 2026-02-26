/**
 * Token search command - search for Cardano native tokens via Minswap
 */

import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import {
  searchTokens,
  getTrendingTokens,
  formatPrice,
  formatChange,
  formatCompact,
  type TokenMetrics,
  type ChainFilter,
} from '../../services/market.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { ExitCode } from '../../lib/errors.js';

interface TokenSearchProps {
  query?: string;
  trending: boolean;
  currency: string;
  json: boolean;
  limit: number;
  chain: ChainFilter;
}

export function TokenSearch({ query, trending, currency, json, limit, chain }: TokenSearchProps) {
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<TokenMetrics[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        let results: TokenMetrics[];
        if (trending) {
          results = await getTrendingTokens(limit, currency, chain);
        } else if (query) {
          results = await searchTokens(query, limit, true, currency, chain);
        } else {
          // Default to trending if no query
          results = await getTrendingTokens(limit, currency, chain);
        }
        setTokens(results);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };
    fetchTokens();
  }, [query, trending, currency, limit, chain]);

  // Handle JSON output
  useEffect(() => {
    if (json && !loading) {
      if (error) {
        outputError(error);
        process.exit(ExitCode.ERROR);
      } else {
        outputSuccess({
          query: query ?? null,
          trending,
          currency,
          count: tokens.length,
          tokens: tokens.map((t) => ({
            ticker: t.ticker,
            name: t.name,
            tokenId: t.tokenId,
            verified: t.verified,
            price: t.priceUsd,
            priceAda: t.priceAda,
            change24h: t.change24h,
            volume24h: t.volume24h,
            liquidity: t.liquidity,
            marketCap: t.marketCap,
          })),
        });
        process.exit(ExitCode.SUCCESS);
      }
    }
  }, [json, loading, error, tokens, query, trending, currency]);

  if (json) return null;
  if (loading) return <Box><Text>Searching tokens...</Text></Box>;
  if (error) return <Box><Text color="red">Error: {error.message}</Text></Box>;

  if (tokens.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">No tokens found{query ? ` for "${query}"` : ''}</Text>
        <Text color="gray">Try a different search term or use --trending</Text>
      </Box>
    );
  }

  const title = trending ? 'Trending Tokens (by 24h volume)' : `Search: "${query}"`;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">{title}</Text>
        <Text color="gray"> ({tokens.length} results)</Text>
      </Box>

      {tokens.map((token, i) => (
        <TokenRow key={token.tokenId} token={token} index={i} />
      ))}
    </Box>
  );
}

interface TokenRowProps {
  token: TokenMetrics;
  index: number;
}

function TokenRow({ token, index }: TokenRowProps) {
  const changeColor = token.change24h >= 0 ? 'green' : 'red';

  // Display ticker, fallback to name or short tokenId when ticker is empty
  const displayLabel = (token.ticker || token.name || token.tokenId.slice(0, 12)).trim();
  const ticker = displayLabel.padEnd(8);
  const price = formatPrice(token.priceUsd);
  const change = formatChange(token.change24h);
  const volume = formatCompact(token.volume24h);
  const liquidity = formatCompact(token.liquidity);
  const verified = token.verified ? '\u2713' : ' ';

  return (
    <Box>
      <Text color="gray">{String(index + 1).padStart(2)}. </Text>
      <Text bold color="yellow">{ticker}</Text>
      <Text> </Text>
      <Text>{price.padStart(16)}</Text>
      <Text> </Text>
      <Text color={changeColor}>{change.padStart(8)}</Text>
      <Text color="gray">   Vol: </Text>
      <Text>{volume.padStart(8)}</Text>
      <Text color="gray">   Liq: </Text>
      <Text>{liquidity.padStart(8)}</Text>
      <Text> </Text>
      <Text color="green">{verified}</Text>
    </Box>
  );
}
