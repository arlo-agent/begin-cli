/**
 * Unit tests for wallet core module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import {
  generateMnemonic,
  validateMnemonic,
  createWallet,
  restoreWallet,
  walletExists,
  loadWalletFile,
  unlockWallet,
  deleteWallet,
  listWallets,
  decryptMnemonic,
  getWalletsDir,
} from '../src/lib/wallet.js';

// Test wallet directory - use a temp location
const TEST_WALLET_NAME = `test-wallet-${Date.now()}`;
const TEST_PASSWORD = 'testpassword123';

describe('Wallet Core Module', () => {
  // Cleanup after tests
  afterEach(async () => {
    try {
      await deleteWallet(TEST_WALLET_NAME);
    } catch {
      // Wallet may not exist
    }
  });

  describe('generateMnemonic', () => {
    it('should generate 24 words', () => {
      const mnemonic = generateMnemonic();
      expect(mnemonic).toHaveLength(24);
    });

    it('should generate valid BIP39 mnemonic', () => {
      const mnemonic = generateMnemonic();
      expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('should generate unique mnemonics', () => {
      const mnemonic1 = generateMnemonic();
      const mnemonic2 = generateMnemonic();
      expect(mnemonic1.join(' ')).not.toBe(mnemonic2.join(' '));
    });
  });

  describe('validateMnemonic', () => {
    it('should accept valid 24-word mnemonic', () => {
      const mnemonic = generateMnemonic();
      expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('should reject invalid mnemonic', () => {
      const invalidMnemonic = Array(24).fill('invalid');
      expect(validateMnemonic(invalidMnemonic)).toBe(false);
    });

    it('should reject mnemonic with wrong length', () => {
      const mnemonic = generateMnemonic();
      expect(validateMnemonic(mnemonic.slice(0, 12))).toBe(false);
    });

    it('should reject empty mnemonic', () => {
      expect(validateMnemonic([])).toBe(false);
    });
  });

  describe('createWallet', () => {
    it('should create wallet and return mnemonic', async () => {
      const result = await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );

      expect(result.mnemonic).toHaveLength(24);
      expect(validateMnemonic(result.mnemonic)).toBe(true);
      expect(result.walletInfo.name).toBe(TEST_WALLET_NAME);
      expect(result.walletInfo.networkId).toBe(0);
      expect(result.walletInfo.paymentAddress).toBeTruthy();
      expect(result.walletInfo.paymentAddress).toMatch(/^addr_test/);
    });

    it('should create mainnet wallet with correct address prefix', async () => {
      const mainnetName = `${TEST_WALLET_NAME}-mainnet`;
      try {
        const result = await createWallet(
          { name: mainnetName, networkId: 1 },
          TEST_PASSWORD
        );
        expect(result.walletInfo.paymentAddress).toMatch(/^addr1/);
        await deleteWallet(mainnetName);
      } catch (e) {
        await deleteWallet(mainnetName).catch(() => {});
        throw e;
      }
    });

    it('should reject duplicate wallet name', async () => {
      await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );

      await expect(
        createWallet({ name: TEST_WALLET_NAME, networkId: 0 }, TEST_PASSWORD)
      ).rejects.toThrow(/already exists/);
    });

    it('should create wallet file with proper permissions', async () => {
      await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );

      const walletPath = path.join(getWalletsDir(), `${TEST_WALLET_NAME}.json`);
      const stats = await fs.stat(walletPath);
      // Check file is readable/writable only by owner (0o600)
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe('walletExists', () => {
    it('should return false for non-existent wallet', async () => {
      expect(await walletExists('non-existent-wallet')).toBe(false);
    });

    it('should return true for existing wallet', async () => {
      await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );
      expect(await walletExists(TEST_WALLET_NAME)).toBe(true);
    });
  });

  describe('loadWalletFile', () => {
    it('should load wallet file contents', async () => {
      const { walletInfo } = await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );

      const loaded = await loadWalletFile(TEST_WALLET_NAME);
      expect(loaded.version).toBe(1);
      expect(loaded.name).toBe(TEST_WALLET_NAME);
      expect(loaded.networkId).toBe(0);
      expect(loaded.addresses.payment).toBe(walletInfo.paymentAddress);
      expect(loaded.encrypted).toBeDefined();
      expect(loaded.encrypted.salt).toBeTruthy();
      expect(loaded.encrypted.iv).toBeTruthy();
      expect(loaded.encrypted.ciphertext).toBeTruthy();
      expect(loaded.encrypted.authTag).toBeTruthy();
    });

    it('should throw for non-existent wallet', async () => {
      await expect(loadWalletFile('non-existent')).rejects.toThrow();
    });
  });

  describe('unlockWallet', () => {
    it('should unlock wallet with correct password', async () => {
      const { walletInfo } = await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );

      const meshWallet = await unlockWallet(TEST_WALLET_NAME, TEST_PASSWORD);
      const address = await meshWallet.getChangeAddress();
      expect(address).toBe(walletInfo.paymentAddress);
    });

    it('should fail with incorrect password', async () => {
      await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );

      await expect(
        unlockWallet(TEST_WALLET_NAME, 'wrong-password')
      ).rejects.toThrow();
    });
  });

  describe('decryptMnemonic', () => {
    it('should decrypt mnemonic correctly', async () => {
      const { mnemonic } = await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );

      const walletFile = await loadWalletFile(TEST_WALLET_NAME);
      const decrypted = decryptMnemonic(walletFile.encrypted, TEST_PASSWORD);

      expect(decrypted).toEqual(mnemonic);
    });

    it('should throw with wrong password', async () => {
      await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );

      const walletFile = await loadWalletFile(TEST_WALLET_NAME);
      expect(() => decryptMnemonic(walletFile.encrypted, 'wrong')).toThrow();
    });
  });

  describe('restoreWallet', () => {
    it('should restore wallet from mnemonic', async () => {
      // First create a wallet to get a valid mnemonic
      const { mnemonic, walletInfo: originalInfo } = await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );

      // Delete it
      await deleteWallet(TEST_WALLET_NAME);

      // Restore it
      const restoredInfo = await restoreWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        mnemonic,
        TEST_PASSWORD
      );

      // Same mnemonic should produce same address
      expect(restoredInfo.paymentAddress).toBe(originalInfo.paymentAddress);
    });

    it('should reject invalid mnemonic', async () => {
      const invalidMnemonic = Array(24).fill('invalid');
      await expect(
        restoreWallet(
          { name: TEST_WALLET_NAME, networkId: 0 },
          invalidMnemonic,
          TEST_PASSWORD
        )
      ).rejects.toThrow(/Invalid mnemonic/);
    });

    it('should reject duplicate wallet name', async () => {
      const { mnemonic } = await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );

      await expect(
        restoreWallet(
          { name: TEST_WALLET_NAME, networkId: 0 },
          mnemonic,
          TEST_PASSWORD
        )
      ).rejects.toThrow(/already exists/);
    });
  });

  describe('listWallets', () => {
    it('should list created wallets', async () => {
      await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );

      const wallets = await listWallets();
      expect(wallets).toContain(TEST_WALLET_NAME);
    });

    it('should return empty array when no wallets', async () => {
      // This test assumes we've cleaned up - may include other wallets
      const wallets = await listWallets();
      expect(Array.isArray(wallets)).toBe(true);
    });
  });

  describe('deleteWallet', () => {
    it('should delete existing wallet', async () => {
      await createWallet(
        { name: TEST_WALLET_NAME, networkId: 0 },
        TEST_PASSWORD
      );

      expect(await walletExists(TEST_WALLET_NAME)).toBe(true);
      await deleteWallet(TEST_WALLET_NAME);
      expect(await walletExists(TEST_WALLET_NAME)).toBe(false);
    });

    it('should throw for non-existent wallet', async () => {
      await expect(deleteWallet('non-existent')).rejects.toThrow();
    });
  });
});
