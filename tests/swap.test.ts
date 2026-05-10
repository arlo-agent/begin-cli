/**
 * Unit tests for swap utilities
 */

import type { UTxO } from '@meshsdk/core';
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
  pickPureAdaCollateralCborHex,
  isPureAdaUtxo,
  MIN_LOVELACE_FOR_COLLATERAL_HINT,
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
    expect(formatTokenAmount('1000000', 6, undefined, false)).toBe('1');
    expect(formatTokenAmount('1500000', 6, undefined, false)).toBe('1.5');
    expect(formatTokenAmount('1234567', 6, undefined, false)).toBe('1.234567');
  });

  it('should format with ticker suffix', () => {
    expect(formatTokenAmount('1000000', 6, 'ADA', false)).toBe('1 ADA');
    expect(formatTokenAmount('1500000', 6, 'MIN', false)).toBe('1.5 MIN');
  });

  it('should format tokens with 0 decimals', () => {
    expect(formatTokenAmount('1000', 0, undefined, false)).toBe('1,000');
    expect(formatTokenAmount('1000', 0, 'HOSKY', false)).toBe('1,000 HOSKY');
  });

  it('should remove trailing zeros', () => {
    expect(formatTokenAmount('1000000', 6, undefined, false)).toBe('1');
    expect(formatTokenAmount('1100000', 6, undefined, false)).toBe('1.1');
  });

  it('should format decimal-string amounts', () => {
    expect(formatTokenAmount('1', 6)).toBe('1');
    expect(formatTokenAmount('1.500000', 6)).toBe('1.5');
    expect(formatTokenAmount('1.234567', 6, 'ADA')).toBe('1.234567 ADA');
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
    const paths = [
      [
        {
          protocol: 'MinswapV2',
          poolId: 'pool1',
          lpToken: 'lp1',
          tokenIn: 'lovelace',
          tokenOut: toToken.tokenId,
          amountIn: '100',
          amountOut: '5',
          minAmountOut: '4.95',
          lpFee: '0.3',
          dexFee: '0.1',
          deposits: '0',
          priceImpact: 0.01,
        },
      ],
    ];

    const result = formatRoute(paths, fromToken, toToken);
    expect(result).toBe('ADA → MIN via Minswap V2');
  });

  it('should format empty route', () => {
    const result = formatRoute([], fromToken, toToken);
    expect(result).toBe('ADA → MIN (Direct)');
  });

  it('should format multi-hop route', () => {
    const paths = [
      [
        {
          protocol: 'MinswapV2',
          poolId: 'pool1',
          lpToken: 'lp1',
          tokenIn: 'lovelace',
          tokenOut: 'intermediate',
          amountIn: '100',
          amountOut: '50',
          minAmountOut: '49',
          lpFee: '0.3',
          dexFee: '0.1',
          deposits: '0',
          priceImpact: 0.01,
        },
        {
          protocol: 'SundaeSwap',
          poolId: 'pool2',
          lpToken: 'lp2',
          tokenIn: 'intermediate',
          tokenOut: toToken.tokenId,
          amountIn: '50',
          amountOut: '5',
          minAmountOut: '4.95',
          lpFee: '0.1',
          dexFee: '0.05',
          deposits: '0',
          priceImpact: 0.02,
        },
      ],
    ];

    const result = formatRoute(paths, fromToken, toToken);
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
    totalLpFee: '0.3',
    totalDexFee: '0.1',
    deposits: '0',
    avgPriceImpact: 0.01,
    aggregatorFee: '0.05',
    aggregatorFeePercent: 0.5,
    paths: [
      [
        {
          protocol: 'MinswapV2',
          poolId: 'pool1',
          lpToken: 'lp1',
          tokenIn: 'lovelace',
          tokenOut: toToken.tokenId,
          amountIn: '100',
          amountOut: '5',
          minAmountOut: '4.95',
          lpFee: '0.3',
          dexFee: '0.1',
          deposits: '0',
          priceImpact: 0.01,
        },
      ],
    ],
    amountInDecimal: true,
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

function makeUtxo(
  txHash: string,
  outputIndex: number,
  amounts: Array<{ unit: string; quantity: string }>
): UTxO {
  return {
    input: { txHash, outputIndex },
    output: { address: 'addr1qxmock', amount: amounts },
  };
}

describe('pickPureAdaCollateralCborHex', () => {
  const h64 = (c: string) => c.repeat(64);

  it('returns CBOR hex for smallest pure-ADA UTXO meeting minimum (aligned with getUtxosHex order)', () => {
    const utxos: UTxO[] = [
      makeUtxo(h64('a'), 0, [
        { unit: 'lovelace', quantity: '10000000' },
        { unit: 'c48c' + '00', quantity: '1' },
      ]),
      makeUtxo(h64('b'), 1, [{ unit: 'lovelace', quantity: '8000000' }]),
      makeUtxo(h64('c'), 2, [{ unit: 'lovelace', quantity: '6000000' }]),
    ];
    const hexes = ['cbor0', 'cbor1', 'cbor2'];
    expect(pickPureAdaCollateralCborHex(utxos, hexes)).toEqual(['cbor2']);
  });

  it('returns empty when utxo / hex length mismatch', () => {
    expect(pickPureAdaCollateralCborHex([makeUtxo('x'.repeat(64), 0, [{ unit: 'lovelace', quantity: '6000000' }])], [])).toEqual(
      []
    );
  });

  it('returns empty when no pure-ADA UTXO meets minimum', () => {
    const utxos: UTxO[] = [
      makeUtxo(h64('a'), 0, [{ unit: 'lovelace', quantity: '4999999' }]),
      makeUtxo(h64('b'), 1, [
        { unit: 'lovelace', quantity: '10000000' },
        { unit: 'c48c' + '00', quantity: '1' },
      ]),
    ];
    expect(pickPureAdaCollateralCborHex(utxos, ['a', 'b'])).toEqual([]);
  });

  it('isPureAdaUtxo is true only for lovelace-only outputs', () => {
    expect(
      isPureAdaUtxo(makeUtxo('x', 0, [{ unit: 'lovelace', quantity: '5000000' }]))
    ).toBe(true);
    expect(
      isPureAdaUtxo(
        makeUtxo('x', 0, [
          { unit: 'lovelace', quantity: '5000000' },
          { unit: 'ab', quantity: '1' },
        ])
      )
    ).toBe(false);
    expect(MIN_LOVELACE_FOR_COLLATERAL_HINT).toBe(5_000_000n);
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
      amountInDecimal: true,
    });

    expect(estimate.tokenIn).toBe('lovelace');
    expect(estimate.amountIn).toBe('100');
    expect(parseFloat(estimate.amountOut)).toBeGreaterThan(0);
    expect(estimate.paths.length).toBeGreaterThan(0);
  });

  it('should search for tokens', async () => {
    const result = await client.searchTokens('MIN');

    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.tokens.some((t) => t.ticker === 'MIN')).toBe(true);
  });

  it('should return build tx response', async () => {
    const buildResult = await client.buildTx({
      sender: 'addr1test...',
      minAmountOut: '4.95',
      estimate: {
        tokenIn: 'lovelace',
        tokenOut: 'someasset',
        amount: '100',
        slippage: 0.5,
        amountInDecimal: true,
      },
    });

    expect(buildResult.cbor).toBeDefined();
  });

  it('should return submit tx response', async () => {
    const result = await client.submitTx({
      cbor: 'test_cbor',
      witnessSet: 'test_witness',
    });

    expect(result.txId).toBeDefined();
    expect(result.txId.startsWith('mock_tx_id_')).toBe(true);
  });

  it('should return pending orders', async () => {
    const orders = await client.getPendingOrders('addr1test...');

    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0].txIn).toBeDefined();
    expect(orders[0].protocol).toBeDefined();
  });

  it('should return cancel tx response', async () => {
    const result = await client.buildCancelTx({
      sender: 'addr1test...',
      orders: [{ txIn: 'mock_tx_in_0', protocol: 'MinswapV2' }],
    });

    expect(result.cbor).toBeDefined();
  });
});
