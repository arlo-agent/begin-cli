/**
 * Unit tests for swap utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveTokenId,
  formatTokenAmount,
  parseTokenAmount,
  formatSwapQuote,
  validateSlippage,
  calculateMinAmountOut,
  isHighPriceImpact,
  isCriticalPriceImpact,
  getDexDisplayName,
  formatRoute,
  KNOWN_TOKENS,
  TOKEN_DECIMALS,
  type ResolvedToken,
} from '../src/lib/swap.js';
import { MockMinswapClient, type SwapEstimate } from '../src/services/minswap.js';

describe('Token Resolution', () => {
  it('should resolve ADA to lovelace', async () => {
    const result = await resolveTokenId('ADA');
    expect(result.tokenId).toBe('lovelace');
    expect(result.ticker).toBe('ADA');
    expect(result.decimals).toBe(6);
  });

  it('should resolve LOVELACE to lovelace', async () => {
    const result = await resolveTokenId('lovelace');
    expect(result.tokenId).toBe('lovelace');
    expect(result.ticker).toBe('ADA');
  });

  it('should resolve MIN ticker', async () => {
    const result = await resolveTokenId('MIN');
    expect(result.tokenId).toBe(KNOWN_TOKENS['MIN']);
    expect(result.ticker).toBe('MIN');
    expect(result.decimals).toBe(6);
  });

  it('should resolve case-insensitively', async () => {
    const resultLower = await resolveTokenId('ada');
    const resultUpper = await resolveTokenId('ADA');
    const resultMixed = await resolveTokenId('Ada');

    expect(resultLower.tokenId).toBe('lovelace');
    expect(resultUpper.tokenId).toBe('lovelace');
    expect(resultMixed.tokenId).toBe('lovelace');
  });

  it('should resolve full token ID', async () => {
    const tokenId = '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e';
    const result = await resolveTokenId(tokenId);
    expect(result.tokenId).toBe(tokenId.toLowerCase());
  });

  it('should resolve policyId.assetName format', async () => {
    const policyId = '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6';
    const assetName = 'MIN';
    const result = await resolveTokenId(`${policyId}.${assetName}`);

    expect(result.tokenId).toContain(policyId.toLowerCase());
    expect(result.ticker).toBe('MIN');
  });

  it('should throw for invalid policy ID', async () => {
    await expect(resolveTokenId('invalid.TOKEN')).rejects.toThrow('Invalid policy ID');
  });

  it('should throw for unknown token without client', async () => {
    await expect(resolveTokenId('UNKNOWNTOKEN')).rejects.toThrow('Unknown token');
  });

  it('should search via client for unknown tokens', async () => {
    const client = new MockMinswapClient('mainnet');
    const result = await resolveTokenId('HOSKY', client);

    expect(result.ticker).toBe('HOSKY');
    expect(result.verified).toBe(true);
  });
});

describe('Token Amount Formatting', () => {
  it('should format ADA amounts with 6 decimals', () => {
    expect(formatTokenAmount('1000000', 6)).toBe('1');
    expect(formatTokenAmount('1500000', 6)).toBe('1.5');
    expect(formatTokenAmount('1234567', 6)).toBe('1.234567');
  });

  it('should format with ticker suffix', () => {
    expect(formatTokenAmount('1000000', 6, 'ADA')).toBe('1 ADA');
    expect(formatTokenAmount('1500000', 6, 'MIN')).toBe('1.5 MIN');
  });

  it('should format tokens with 0 decimals', () => {
    expect(formatTokenAmount('1000', 0)).toBe('1,000');
    expect(formatTokenAmount('1000', 0, 'HOSKY')).toBe('1,000 HOSKY');
  });

  it('should remove trailing zeros', () => {
    expect(formatTokenAmount('1000000', 6)).toBe('1');
    expect(formatTokenAmount('1100000', 6)).toBe('1.1');
  });
});

describe('Token Amount Parsing', () => {
  it('should parse decimal amounts to smallest unit', () => {
    expect(parseTokenAmount('1', 6)).toBe('1000000');
    expect(parseTokenAmount('1.5', 6)).toBe('1500000');
    expect(parseTokenAmount('0.000001', 6)).toBe('1');
  });

  it('should parse whole numbers for 0 decimal tokens', () => {
    expect(parseTokenAmount('100', 0)).toBe('100');
    expect(parseTokenAmount('1000', 0)).toBe('1000');
  });

  it('should throw for invalid amounts', () => {
    expect(() => parseTokenAmount('abc', 6)).toThrow('Invalid amount');
    expect(() => parseTokenAmount('-1', 6)).toThrow('Invalid amount');
  });
});

describe('Slippage Validation', () => {
  it('should accept valid slippage values', () => {
    expect(validateSlippage(0.1)).toBe(0.1);
    expect(validateSlippage(0.5)).toBe(0.5);
    expect(validateSlippage(1)).toBe(1);
    expect(validateSlippage(5)).toBe(5);
  });

  it('should reject slippage below minimum', () => {
    expect(() => validateSlippage(0.001)).toThrow('at least 0.01%');
    expect(() => validateSlippage(0)).toThrow('at least 0.01%');
  });

  it('should reject slippage above maximum', () => {
    expect(() => validateSlippage(51)).toThrow('cannot exceed 50%');
    expect(() => validateSlippage(100)).toThrow('cannot exceed 50%');
  });
});

describe('Min Amount Out Calculation', () => {
  it('should calculate minimum with slippage', () => {
    expect(calculateMinAmountOut('100', 1)).toBe('99');
    expect(calculateMinAmountOut('100', 0.5)).toBe('99.5');
    expect(calculateMinAmountOut('1000', 5)).toBe('950');
  });
});

describe('Price Impact Detection', () => {
  it('should detect high price impact', () => {
    expect(isHighPriceImpact(0.04)).toBe(false);
    expect(isHighPriceImpact(0.05)).toBe(false);
    expect(isHighPriceImpact(0.06)).toBe(true);
    expect(isHighPriceImpact(0.10)).toBe(true);
  });

  it('should detect critical price impact', () => {
    expect(isCriticalPriceImpact(0.10)).toBe(false);
    expect(isCriticalPriceImpact(0.15)).toBe(false);
    expect(isCriticalPriceImpact(0.16)).toBe(true);
    expect(isCriticalPriceImpact(0.50)).toBe(true);
  });
});

describe('DEX Name Formatting', () => {
  it('should format known DEX names', () => {
    expect(getDexDisplayName('minswap')).toBe('Minswap');
    expect(getDexDisplayName('minswap_v2')).toBe('Minswap V2');
    expect(getDexDisplayName('sundaeswap')).toBe('SundaeSwap');
    expect(getDexDisplayName('wingriders')).toBe('WingRiders');
  });

  it('should return original for unknown DEX', () => {
    expect(getDexDisplayName('unknown_dex')).toBe('unknown_dex');
  });
});

describe('Route Formatting', () => {
  const fromToken: ResolvedToken = {
    tokenId: 'lovelace',
    ticker: 'ADA',
    name: 'Cardano',
    decimals: 6,
    verified: true,
  };

  const toToken: ResolvedToken = {
    tokenId: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e',
    ticker: 'MIN',
    name: 'Minswap',
    decimals: 6,
    verified: true,
  };

  it('should format direct route', () => {
    const route = [
      {
        dex: 'minswap',
        poolId: 'pool1',
        tokenIn: 'lovelace',
        tokenOut: toToken.tokenId,
        amountIn: '100',
        amountOut: '5',
      },
    ];

    const result = formatRoute(route, fromToken, toToken);
    expect(result).toBe('ADA → MIN via Minswap');
  });

  it('should format empty route', () => {
    const result = formatRoute([], fromToken, toToken);
    expect(result).toBe('ADA → MIN (Direct)');
  });

  it('should format multi-hop route', () => {
    const route = [
      {
        dex: 'minswap',
        poolId: 'pool1',
        tokenIn: 'lovelace',
        tokenOut: 'intermediate',
        amountIn: '100',
        amountOut: '50',
      },
      {
        dex: 'sundaeswap',
        poolId: 'pool2',
        tokenIn: 'intermediate',
        tokenOut: toToken.tokenId,
        amountIn: '50',
        amountOut: '5',
      },
    ];

    const result = formatRoute(route, fromToken, toToken);
    expect(result).toContain('Minswap');
    expect(result).toContain('SundaeSwap');
  });
});

describe('Swap Quote Formatting', () => {
  const fromToken: ResolvedToken = {
    tokenId: 'lovelace',
    ticker: 'ADA',
    name: 'Cardano',
    decimals: 6,
    verified: true,
  };

  const toToken: ResolvedToken = {
    tokenId: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e',
    ticker: 'MIN',
    name: 'Minswap',
    decimals: 6,
    verified: true,
  };

  const mockEstimate: SwapEstimate = {
    tokenIn: 'lovelace',
    tokenOut: toToken.tokenId,
    amountIn: '100',
    amountOut: '5',
    minAmountOut: '4.95',
    priceImpact: 0.01,
    lpFee: '0.3',
    dexFee: '0.1',
    aggregatorFee: '0.05',
    route: [
      {
        dex: 'minswap',
        poolId: 'pool1',
        tokenIn: 'lovelace',
        tokenOut: toToken.tokenId,
        amountIn: '100',
        amountOut: '5',
      },
    ],
    effectivePrice: '0.05',
    inversePrice: '20',
  };

  it('should format quote correctly', () => {
    const quote = formatSwapQuote(mockEstimate, fromToken, toToken);

    expect(quote.fromToken).toBe('ADA');
    expect(quote.toToken).toBe('MIN');
    expect(quote.priceImpact).toBe('1.00%');
    expect(quote.hops).toBe(1);
    expect(quote.totalFees).toBe('0.450000 ADA');
  });

  it('should include fee breakdown', () => {
    const quote = formatSwapQuote(mockEstimate, fromToken, toToken);

    expect(quote.feeBreakdown.lpFee).toBe('0.3 ADA');
    expect(quote.feeBreakdown.dexFee).toBe('0.1 ADA');
    expect(quote.feeBreakdown.aggregatorFee).toBe('0.05 ADA');
  });

  it('should format rate correctly', () => {
    const quote = formatSwapQuote(mockEstimate, fromToken, toToken);

    expect(quote.rate).toBe('1 ADA = 0.05 MIN');
    expect(quote.inverseRate).toBe('1 MIN = 20 ADA');
  });
});

describe('MockMinswapClient', () => {
  let client: MockMinswapClient;

  beforeEach(() => {
    client = new MockMinswapClient('mainnet');
  });

  it('should return estimate for ADA to MIN swap', async () => {
    const estimate = await client.estimate({
      tokenIn: 'lovelace',
      tokenOut: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e',
      amount: '100',
      slippage: 0.5,
    });

    expect(estimate.tokenIn).toBe('lovelace');
    expect(estimate.amountIn).toBe('100');
    expect(parseFloat(estimate.amountOut)).toBeGreaterThan(0);
    expect(estimate.route.length).toBeGreaterThan(0);
  });

  it('should search for tokens', async () => {
    const result = await client.searchTokens('MIN');

    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.tokens.some((t) => t.ticker === 'MIN')).toBe(true);
  });

  it('should return build tx response', async () => {
    const estimate = await client.estimate({
      tokenIn: 'lovelace',
      tokenOut: 'someasset',
      amount: '100',
      slippage: 0.5,
    });

    const buildResult = await client.buildTx({
      sender: 'addr1test...',
      estimate,
    });

    expect(buildResult.cbor).toBeDefined();
    expect(buildResult.estimatedFee).toBeDefined();
  });

  it('should return submit tx response', async () => {
    const result = await client.submitTx({
      cbor: 'test_cbor',
      witnessSet: 'test_witness',
    });

    expect(result.txHash).toBeDefined();
    expect(result.txHash.startsWith('mock_tx_hash_')).toBe(true);
  });
});
