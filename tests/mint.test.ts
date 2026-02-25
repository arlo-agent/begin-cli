import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  readImageFile,
  validateCardanoAddress,
  validateAddressNetwork,
  validateMetadataLengths,
  formatMetadata,
  estimateMintCost,
  formatFileSize,
  truncate,
  getSupportedImageFormats,
} from '../src/lib/mint.js';
import { NmkrClient, isNmkrConfigured } from '../src/services/nmkr.js';

// ============================================================================
// Address Validation Tests
// ============================================================================

describe('validateCardanoAddress', () => {
  it('should validate mainnet addresses', () => {
    const result = validateCardanoAddress(
      'addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv'
    );
    expect(result.valid).toBe(true);
    expect(result.network).toBe('mainnet');
  });

  it('should validate testnet addresses', () => {
    const result = validateCardanoAddress(
      'addr_test1qr8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq8yn4fv'
    );
    expect(result.valid).toBe(true);
    expect(result.network).toBe('testnet');
  });

  it('should reject stake addresses for receiving NFTs', () => {
    const result = validateCardanoAddress('stake1uyq7hpthekjvgjjfwfn3ycwj5mqp8j5twz7kqvfnkhqnqlqh5g7lg');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Stake addresses cannot receive NFTs');
  });

  it('should reject invalid addresses', () => {
    const result = validateCardanoAddress('invalid_address');
    expect(result.valid).toBe(false);
  });

  it('should reject empty addresses', () => {
    const result = validateCardanoAddress('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Address is required');
  });
});

describe('validateAddressNetwork', () => {
  it('should pass when address matches network', () => {
    const result = validateAddressNetwork(
      'addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv',
      'mainnet'
    );
    expect(result.valid).toBe(true);
  });

  it('should fail when address network mismatches', () => {
    const result = validateAddressNetwork(
      'addr_test1qr8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq8yn4fv',
      'mainnet'
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('network mismatch');
  });

  it('should treat preprod and preview as testnet', () => {
    const result = validateAddressNetwork(
      'addr_test1qr8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq8yn4fv',
      'preprod'
    );
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// Metadata Validation Tests
// ============================================================================

describe('validateMetadataLengths', () => {
  it('should pass for valid short names', () => {
    const result = validateMetadataLengths({
      name: 'MyNFT001',
      displayName: 'My Cool NFT',
      description: 'A short description',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should warn on token names over 32 bytes', () => {
    const result = validateMetadataLengths({
      name: 'ThisIsAVeryLongTokenNameThatExceedsTheLimit',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Token name too long'))).toBe(true);
  });

  it('should warn on invalid characters in token name', () => {
    const result = validateMetadataLengths({
      name: 'My NFT!',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('only contain letters, numbers, and underscores'))).toBe(true);
  });

  it('should warn on very long descriptions', () => {
    const result = validateMetadataLengths({
      name: 'ValidName',
      description: 'A'.repeat(600),
    });
    // Should still be valid but with warnings
    expect(result.errors.some((e) => e.includes('Description is'))).toBe(true);
  });
});

describe('formatMetadata', () => {
  it('should create CIP-25 compliant metadata', () => {
    const result = formatMetadata({
      name: 'MyNFT',
      displayName: 'My NFT Collection #1',
      description: 'A test NFT',
      ipfsHash: 'QmTest123456789',
      mimeType: 'image/png',
    });

    expect(result.name).toBe('My NFT Collection #1');
    expect(result.image).toBe('ipfs://QmTest123456789');
    expect(result.mediaType).toBe('image/png');
    expect(result.description).toBe('A test NFT');
  });

  it('should use name as displayName if not provided', () => {
    const result = formatMetadata({
      name: 'MyNFT',
      ipfsHash: 'QmTest123',
    });
    expect(result.name).toBe('MyNFT');
  });

  it('should add custom attributes', () => {
    const result = formatMetadata({
      name: 'MyNFT',
      ipfsHash: 'QmTest123',
      attributes: {
        rarity: 'legendary',
        power: 100,
      },
    });

    expect(result.rarity).toBe('legendary');
    expect(result.power).toBe(100);
  });

  it('should not overwrite reserved fields', () => {
    const result = formatMetadata({
      name: 'MyNFT',
      ipfsHash: 'QmTest123',
      attributes: {
        name: 'Overwritten', // Should be ignored
        image: 'bad://url', // Should be ignored
      },
    });

    expect(result.name).toBe('MyNFT');
    expect(result.image).toBe('ipfs://QmTest123');
  });
});

// ============================================================================
// Cost Estimation Tests
// ============================================================================

describe('estimateMintCost', () => {
  it('should return reasonable cost estimate', () => {
    const estimate = estimateMintCost();

    expect(estimate.totalAda).toBeGreaterThan(2);
    expect(estimate.totalAda).toBeLessThan(5);
    expect(estimate.minUtxoAda).toBeGreaterThan(0);
    expect(estimate.feeAda).toBeGreaterThan(0);
    expect(estimate.breakdown).toContain('ADA');
  });

  it('should have consistent breakdown', () => {
    const estimate = estimateMintCost();
    const expectedTotal = estimate.minUtxoAda + estimate.feeAda + estimate.nmkrFeeAda;
    expect(estimate.totalAda).toBeCloseTo(expectedTotal, 2);
  });
});

// ============================================================================
// Image Validation Tests
// ============================================================================

describe('readImageFile', () => {
  const testDir = '/tmp/begin-cli-test-images';

  beforeEach(async () => {
    // Create test directory
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.promises.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should read valid PNG file', async () => {
    // Create a minimal valid PNG file
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, // IHDR chunk length
      0x49, 0x48, 0x44, 0x52, // IHDR
      0x00, 0x00, 0x00, 0x01, // width: 1
      0x00, 0x00, 0x00, 0x01, // height: 1
      0x08, 0x02, // 8-bit RGB
      0x00, 0x00, 0x00, // compression, filter, interlace
      0x90, 0x77, 0x53, 0xde, // CRC
    ]);

    const testPath = path.join(testDir, 'test.png');
    await fs.promises.writeFile(testPath, pngHeader);

    const result = await readImageFile(testPath);

    expect(result.mimeType).toBe('image/png');
    expect(result.extension).toBe('.png');
    expect(result.size).toBeGreaterThan(0);
  });

  it('should reject non-existent files', async () => {
    await expect(readImageFile('/nonexistent/file.png')).rejects.toThrow(
      'Image file not found'
    );
  });

  it('should reject unsupported formats', async () => {
    const testPath = path.join(testDir, 'test.bmp');
    await fs.promises.writeFile(testPath, 'BM fake bitmap');

    await expect(readImageFile(testPath)).rejects.toThrow(
      'Unsupported image format'
    );
  });

  it('should reject files with wrong magic bytes', async () => {
    const testPath = path.join(testDir, 'fake.png');
    await fs.promises.writeFile(testPath, 'This is not a PNG file at all');

    await expect(readImageFile(testPath)).rejects.toThrow(
      "doesn't match"
    );
  });
});

describe('getSupportedImageFormats', () => {
  it('should include common formats', () => {
    const formats = getSupportedImageFormats();
    expect(formats).toContain('.png');
    expect(formats).toContain('.jpg');
    expect(formats).toContain('.jpeg');
    expect(formats).toContain('.gif');
    expect(formats).toContain('.webp');
  });
});

// ============================================================================
// Utility Tests
// ============================================================================

describe('formatFileSize', () => {
  it('should format bytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('should format kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('should format megabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.00 MB');
  });
});

describe('truncate', () => {
  it('should not truncate short strings', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
  });

  it('should truncate long strings', () => {
    expect(truncate('This is a long string', 10)).toBe('This is...');
  });
});

// ============================================================================
// NMKR Client Tests
// ============================================================================

describe('NmkrClient', () => {
  describe('isNmkrConfigured', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return true when both env vars are set', () => {
      process.env.NMKR_API_KEY = 'test-key';
      process.env.NMKR_PROJECT_UID = 'test-project';
      expect(isNmkrConfigured()).toBe(true);
    });

    it('should return false when API key is missing', () => {
      delete process.env.NMKR_API_KEY;
      process.env.NMKR_PROJECT_UID = 'test-project';
      expect(isNmkrConfigured()).toBe(false);
    });

    it('should return false when project UID is missing', () => {
      process.env.NMKR_API_KEY = 'test-key';
      delete process.env.NMKR_PROJECT_UID;
      expect(isNmkrConfigured()).toBe(false);
    });
  });

  describe('fromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should throw when API key is missing', () => {
      delete process.env.NMKR_API_KEY;
      process.env.NMKR_PROJECT_UID = 'test-project';
      expect(() => NmkrClient.fromEnv()).toThrow('NMKR_API_KEY');
    });

    it('should throw when project UID is missing', () => {
      process.env.NMKR_API_KEY = 'test-key';
      delete process.env.NMKR_PROJECT_UID;
      expect(() => NmkrClient.fromEnv()).toThrow('NMKR_PROJECT_UID');
    });

    it('should create client when both are set', () => {
      process.env.NMKR_API_KEY = 'test-key';
      process.env.NMKR_PROJECT_UID = 'test-project';
      const client = NmkrClient.fromEnv();
      expect(client).toBeInstanceOf(NmkrClient);
    });
  });

  describe('API methods (mocked)', () => {
    let client: NmkrClient;
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      client = new NmkrClient({
        apiKey: 'test-api-key',
        projectUid: 'test-project-uid',
      });
      fetchSpy = vi.spyOn(global, 'fetch');
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('should upload NFT with correct request', async () => {
      const mockResponse = {
        nftId: 123,
        nftUid: 'nft-uid-123',
        ipfsHashMainnft: 'QmTestHash123',
        ipfsGatewayAddress: 'https://ipfs.io/ipfs/QmTestHash123',
        state: 'free',
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await client.uploadNft({
        name: 'TestNFT',
        displayName: 'Test NFT',
        description: 'A test',
        image: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      });

      expect(result.nftUid).toBe('nft-uid-123');
      expect(result.ipfsHash).toBe('QmTestHash123');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/UploadNft/test-project-uid'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Invalid API key' }),
      } as Response);

      await expect(
        client.uploadNft({
          name: 'TestNFT',
          image: Buffer.from([]),
        })
      ).rejects.toThrow('NMKR API error');
    });

    it('should mint and send with correct endpoint', async () => {
      const mockResponse = {
        nftId: 123,
        nftUid: 'nft-uid-123',
        state: 'sold',
        txHash: 'tx-hash-abc123',
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await client.mintAndSend({
        nftUid: 'nft-uid-123',
        receiverAddress: 'addr1qytest...',
        tokenCount: 1,
      });

      expect(result.txHash).toBe('tx-hash-abc123');
      expect(result.state).toBe('sold');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/MintAndSendSpecific/test-project-uid/nft-uid-123/1/addr1qytest'),
        expect.any(Object)
      );
    });

    it('should get NFT details', async () => {
      const mockResponse = {
        id: 123,
        uid: 'nft-uid-123',
        name: 'TestNFT',
        displayname: 'Test NFT',
        description: 'A test',
        ipfsLink: 'ipfs://QmTest',
        gatewayLink: 'https://ipfs.io/ipfs/QmTest',
        state: 'sold',
        minted: true,
        policyId: 'policy123',
        assetId: 'asset123',
        assetname: 'TestNFT',
        fingerprint: 'asset1abc',
        metadata: {},
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await client.getNftDetails('nft-uid-123');

      expect(result.uid).toBe('nft-uid-123');
      expect(result.state).toBe('sold');
      expect(result.minted).toBe(true);
    });

    it('should list NFTs with pagination', async () => {
      const mockResponse = [
        { id: 1, uid: 'nft1', name: 'NFT1', displayname: 'NFT #1', state: 'free', ipfsLink: 'ipfs://1' },
        { id: 2, uid: 'nft2', name: 'NFT2', displayname: 'NFT #2', state: 'free', ipfsLink: 'ipfs://2' },
      ];

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await client.listNfts('free', 10, 1);

      expect(result.nfts).toHaveLength(2);
      expect(result.nfts[0].uid).toBe('nft1');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/GetNfts/test-project-uid/free/10/1'),
        expect.any(Object)
      );
    });
  });
});
