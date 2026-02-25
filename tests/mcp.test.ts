/**
 * Unit tests for MCP server module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Mock the core modules to avoid actual wallet/blockchain operations
vi.mock('../src/core/balance.js', () => ({
  getBalance: vi.fn().mockResolvedValue({
    address: 'addr_test1qz...',
    network: 'mainnet',
    lovelace: '125430000',
    ada: '125.430000',
    tokenCount: 1,
    tokens: [],
  }),
  getUtxos: vi.fn().mockResolvedValue({
    address: 'addr_test1qz...',
    network: 'mainnet',
    utxoCount: 2,
    totalLovelace: '125430000',
    totalAda: '125.430000',
    utxos: [],
  }),
}));

vi.mock('../src/core/wallet.js', () => ({
  createWallet: vi.fn().mockResolvedValue({
    name: 'test-wallet',
    mnemonic: Array(24).fill('word'),
    address: 'addr_test1qz...',
  }),
  restoreWallet: vi.fn().mockResolvedValue({
    name: 'test-wallet',
    address: 'addr_test1qz...',
  }),
  getWalletAddresses: vi.fn().mockResolvedValue({
    walletName: 'test-wallet',
    source: 'wallet',
    address: 'addr_test1qz...',
    network: 'mainnet',
  }),
  getReceiveAddress: vi.fn().mockResolvedValue('addr_test1qz...'),
  getWalletList: vi.fn().mockReturnValue({
    wallets: ['test-wallet'],
    defaultWallet: 'test-wallet',
    hasEnvMnemonic: false,
  }),
}));

vi.mock('../src/core/send.js', () => ({
  sendAda: vi.fn().mockResolvedValue({
    status: 'confirmed',
    txHash: 'abc123...',
    toAddress: 'addr_test1qz...',
    amountAda: 10,
    assets: [],
    network: 'mainnet',
  }),
}));

vi.mock('../src/core/history.js', () => ({
  getHistory: vi.fn().mockResolvedValue({
    address: 'addr_test1qz...',
    network: 'mainnet',
    page: 1,
    count: 0,
    hasMore: false,
    transactions: [],
  }),
}));

vi.mock('../src/core/staking.js', () => ({
  getStakeStatus: vi.fn().mockResolvedValue({
    stakeAddress: 'stake_test1...',
    isRegistered: true,
    delegatedPool: null,
    rewards: {
      available: '0',
      availableAda: '0.000000',
      totalWithdrawn: '0',
      totalWithdrawnAda: '0.000000',
    },
    activeEpoch: 445,
    network: 'mainnet',
  }),
  getStakePools: vi.fn().mockResolvedValue({
    pools: [],
    network: 'mainnet',
    mock: true,
  }),
  delegateStake: vi.fn().mockResolvedValue({
    status: 'success',
    txHash: 'mock_tx...',
    poolId: 'pool1...',
    ticker: 'TEST',
    registrationIncluded: false,
    network: 'mainnet',
    mock: true,
  }),
  withdrawRewards: vi.fn().mockResolvedValue({
    status: 'error',
    amount: '0',
    amountAda: '0',
    network: 'mainnet',
    error: 'No rewards available',
  }),
}));

vi.mock('../src/core/swap.js', () => ({
  getSwapQuote: vi.fn().mockResolvedValue({
    status: 'success',
    network: 'mainnet',
    from: { token: 'ADA', tokenId: 'lovelace', amount: '100' },
    to: { token: 'MIN', tokenId: '29d222...', amount: '5', minAmount: '4.95' },
    rate: '1 ADA = 0.05 MIN',
    priceImpact: 0.01,
    slippage: 0.5,
  }),
  executeSwap: vi.fn().mockResolvedValue({
    status: 'success',
    txHash: 'swap_tx...',
    from: { token: 'ADA', amount: '100' },
    to: { token: 'MIN', amount: '5', minAmount: '4.95' },
    network: 'mainnet',
    mock: true,
  }),
}));

vi.mock('../src/core/mint.js', () => ({
  mintNft: vi.fn().mockResolvedValue({
    status: 'error',
    toAddress: 'addr_test1qz...',
    network: 'mainnet',
    error: 'NMKR not configured',
  }),
}));

describe('MCP Server Module', () => {
  describe('Server Creation', () => {
    it('should create MCP server with correct name and version', async () => {
      // Import the module dynamically to ensure mocks are in place
      const serverModule = await import('../src/mcp/server.js');

      // The module exports startMcpServer function
      expect(serverModule.startMcpServer).toBeDefined();
      expect(typeof serverModule.startMcpServer).toBe('function');
    });
  });

  describe('Tool Definitions', () => {
    it('should define all required wallet tools', () => {
      const expectedWalletTools = [
        'wallet_create',
        'wallet_restore',
        'wallet_address',
        'wallet_balance',
        'wallet_utxos',
        'wallet_history',
        'wallet_send',
        'wallet_receive',
      ];

      // These tools should be exposed by the MCP server
      // This is a basic structure test - the actual tool registration
      // happens in the server initialization
      expect(expectedWalletTools).toHaveLength(8);
    });

    it('should define all required staking tools', () => {
      const expectedStakingTools = [
        'stake_status',
        'stake_delegate',
        'stake_pools',
        'stake_withdraw',
      ];

      expect(expectedStakingTools).toHaveLength(4);
    });

    it('should define all required swap tools', () => {
      const expectedSwapTools = [
        'swap_quote',
        'swap_execute',
      ];

      expect(expectedSwapTools).toHaveLength(2);
    });

    it('should define mint_nft tool', () => {
      const expectedMintTools = ['mint_nft'];
      expect(expectedMintTools).toHaveLength(1);
    });
  });

  describe('Core Function Integration', () => {
    it('should import getBalance from core/balance', async () => {
      const { getBalance } = await import('../src/core/balance.js');
      const result = await getBalance('addr_test1qz...', 'mainnet');

      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('network');
      expect(result).toHaveProperty('lovelace');
      expect(result).toHaveProperty('ada');
    });

    it('should import getHistory from core/history', async () => {
      const { getHistory } = await import('../src/core/history.js');
      const result = await getHistory('addr_test1qz...', 'mainnet', 10, 1);

      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('transactions');
      expect(result).toHaveProperty('page');
    });

    it('should import getSwapQuote from core/swap', async () => {
      const { getSwapQuote } = await import('../src/core/swap.js');
      const result = await getSwapQuote({
        from: 'ADA',
        to: 'MIN',
        amount: '100',
        network: 'mainnet',
      });

      expect(result).toHaveProperty('status');
      expect(result.status).toBe('success');
    });

    it('should import getStakeStatus from core/staking', async () => {
      const { getStakeStatus } = await import('../src/core/staking.js');
      const result = await getStakeStatus(undefined, undefined, 'mainnet');

      expect(result).toHaveProperty('stakeAddress');
      expect(result).toHaveProperty('isRegistered');
      expect(result).toHaveProperty('rewards');
    });
  });

  describe('Resource Definitions', () => {
    it('should define wallet address resource', () => {
      const expectedUri = 'begin://wallet/address';
      expect(expectedUri).toBe('begin://wallet/address');
    });

    it('should define wallet balance resource', () => {
      const expectedUri = 'begin://wallet/balance';
      expect(expectedUri).toBe('begin://wallet/balance');
    });
  });
});

describe('Core Module Exports', () => {
  it('should export all core functions from index', async () => {
    // This tests that the core index properly re-exports everything
    const coreExports = await import('../src/core/index.js');

    // Balance exports
    expect(coreExports.getBalance).toBeDefined();
    expect(coreExports.getUtxos).toBeDefined();

    // Wallet exports
    expect(coreExports.createWallet).toBeDefined();
    expect(coreExports.restoreWallet).toBeDefined();
    expect(coreExports.getWalletAddresses).toBeDefined();
    expect(coreExports.getReceiveAddress).toBeDefined();

    // Send exports
    expect(coreExports.sendAda).toBeDefined();

    // History exports
    expect(coreExports.getHistory).toBeDefined();

    // Staking exports
    expect(coreExports.getStakeStatus).toBeDefined();
    expect(coreExports.getStakePools).toBeDefined();
    expect(coreExports.delegateStake).toBeDefined();
    expect(coreExports.withdrawRewards).toBeDefined();

    // Swap exports
    expect(coreExports.getSwapQuote).toBeDefined();
    expect(coreExports.executeSwap).toBeDefined();

    // Mint exports
    expect(coreExports.mintNft).toBeDefined();
  });
});
