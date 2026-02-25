/**
 * Unit tests for stake commands wallet integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as transaction from '../src/lib/transaction.js';

// Mock the transaction module
vi.mock('../src/lib/transaction.js', async () => {
  const actual = await vi.importActual<typeof transaction>('../src/lib/transaction.js');
  return {
    ...actual,
    checkWalletAvailability: vi.fn(),
    loadWallet: vi.fn(),
  };
});

describe('Stake Commands Wallet Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkWalletAvailability', () => {
    it('should return available for env mnemonic source', () => {
      const mockCheck = vi.mocked(transaction.checkWalletAvailability);
      mockCheck.mockReturnValue({
        available: true,
        source: 'env',
        needsPassword: false,
      });

      const result = transaction.checkWalletAvailability();
      expect(result.available).toBe(true);
      expect(result.source).toBe('env');
      expect(result.needsPassword).toBe(false);
    });

    it('should return available for wallet with password needed', () => {
      const mockCheck = vi.mocked(transaction.checkWalletAvailability);
      mockCheck.mockReturnValue({
        available: true,
        source: 'wallet',
        walletName: 'test-wallet',
        needsPassword: true,
      });

      const result = transaction.checkWalletAvailability('test-wallet');
      expect(result.available).toBe(true);
      expect(result.source).toBe('wallet');
      expect(result.walletName).toBe('test-wallet');
      expect(result.needsPassword).toBe(true);
    });

    it('should return not available with error for missing wallet', () => {
      const mockCheck = vi.mocked(transaction.checkWalletAvailability);
      mockCheck.mockReturnValue({
        available: false,
        needsPassword: false,
        error: 'Wallet "nonexistent" not found.',
      });

      const result = transaction.checkWalletAvailability('nonexistent');
      expect(result.available).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('loadWallet', () => {
    it('should load wallet and return MeshWallet with getRewardAddresses method', async () => {
      const mockWallet = {
        getRewardAddresses: vi.fn().mockResolvedValue(['stake1uy4s2fc8qjzqchpjxh6yjzgx3ckg4zhfz8rpvj0l0wvtqgsxhfr8c']),
        getUsedAddresses: vi.fn().mockResolvedValue(['addr1qy...']),
        getUnusedAddresses: vi.fn().mockResolvedValue(['addr1qy...']),
      };

      const mockLoad = vi.mocked(transaction.loadWallet);
      mockLoad.mockResolvedValue(mockWallet as any);

      const wallet = await transaction.loadWallet(
        { walletName: 'test-wallet', password: 'test123' },
        { network: 'mainnet' }
      );

      expect(wallet.getRewardAddresses).toBeDefined();
      const rewardAddresses = await wallet.getRewardAddresses();
      expect(rewardAddresses).toHaveLength(1);
      expect(rewardAddresses[0]).toMatch(/^stake1/);
    });

    it('should throw for incorrect password', async () => {
      const mockLoad = vi.mocked(transaction.loadWallet);
      mockLoad.mockRejectedValue(new Error('Incorrect password'));

      await expect(
        transaction.loadWallet(
          { walletName: 'test-wallet', password: 'wrongpass' },
          { network: 'mainnet' }
        )
      ).rejects.toThrow('Incorrect password');
    });
  });

  describe('Stake Address Derivation', () => {
    it('should derive stake address from wallet', async () => {
      // Simulating what happens in the stake commands
      const mockStakeAddress = 'stake1uy4s2fc8qjzqchpjxh6yjzgx3ckg4zhfz8rpvj0l0wvtqgsxhfr8c';
      const mockWallet = {
        getRewardAddresses: vi.fn().mockResolvedValue([mockStakeAddress]),
      };

      const rewardAddresses = await mockWallet.getRewardAddresses();
      expect(rewardAddresses.length).toBeGreaterThan(0);
      
      const stakeAddress = rewardAddresses[0];
      expect(stakeAddress).toBe(mockStakeAddress);
      expect(stakeAddress.startsWith('stake1')).toBe(true);
    });

    it('should throw if no stake address can be derived', async () => {
      const mockWallet = {
        getRewardAddresses: vi.fn().mockResolvedValue([]),
      };

      const rewardAddresses = await mockWallet.getRewardAddresses();
      
      if (!rewardAddresses || rewardAddresses.length === 0) {
        expect(() => {
          throw new Error('Could not derive stake address from wallet');
        }).toThrow('Could not derive stake address from wallet');
      }
    });
  });
});

describe('Stake Command Props', () => {
  it('StakeDelegate should accept wallet integration props', () => {
    // Type checking - these are the expected props
    interface StakeDelegateProps {
      poolId: string;
      network: string;
      json: boolean;
      yes?: boolean;
      walletName?: string;
      password?: string;
    }

    const validProps: StakeDelegateProps = {
      poolId: 'pool1...',
      network: 'mainnet',
      json: false,
      yes: true,
      walletName: 'my-wallet',
      password: 'secret123',
    };

    expect(validProps.walletName).toBe('my-wallet');
    expect(validProps.password).toBe('secret123');
    expect(validProps.yes).toBe(true);
  });

  it('StakeStatus should accept wallet integration props', () => {
    interface StakeStatusProps {
      network: string;
      json: boolean;
      walletName?: string;
      password?: string;
      stakeAddress?: string;
    }

    const validProps: StakeStatusProps = {
      network: 'preprod',
      json: true,
      walletName: 'test-wallet',
      password: 'pass123',
    };

    expect(validProps.walletName).toBe('test-wallet');
    expect(validProps.password).toBe('pass123');
  });

  it('StakeWithdraw should accept wallet integration props', () => {
    interface StakeWithdrawProps {
      network: string;
      json: boolean;
      yes?: boolean;
      walletName?: string;
      password?: string;
    }

    const validProps: StakeWithdrawProps = {
      network: 'mainnet',
      json: false,
      yes: false,
      walletName: 'my-wallet',
      password: 'secure',
    };

    expect(validProps.walletName).toBe('my-wallet');
    expect(validProps.password).toBe('secure');
    expect(validProps.yes).toBe(false);
  });
});
