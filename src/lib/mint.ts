/**
 * Mint utilities for NFT minting operations
 *
 * Provides helpers for:
 * - Image file validation and reading
 * - CIP-25 compliant metadata formatting
 * - Mint cost estimation
 * - Cardano address validation
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface ImageFileInfo {
  path: string;
  buffer: Buffer;
  size: number;
  mimeType: string;
  extension: string;
}

export interface CIP25Metadata {
  name: string;
  image: string; // IPFS URI
  mediaType?: string;
  description?: string;
  files?: Array<{
    name: string;
    mediaType: string;
    src: string;
  }>;
  [key: string]: unknown;
}

export interface MintCostEstimate {
  /** Total cost in ADA */
  totalAda: number;
  /** Min UTxO requirement */
  minUtxoAda: number;
  /** Estimated transaction fee */
  feeAda: number;
  /** NMKR minting fee (if applicable) */
  nmkrFeeAda: number;
  /** Human-readable breakdown */
  breakdown: string;
}

// ============================================================================
// Image utilities
// ============================================================================

const SUPPORTED_IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const MAX_IMAGE_SIZE_MB = 10; // NMKR limit
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

/**
 * Read and validate an image file for NFT minting
 */
export async function readImageFile(filePath: string): Promise<ImageFileInfo> {
  const resolvedPath = path.resolve(filePath);

  // Check file exists
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Image file not found: ${filePath}`);
  }

  // Check extension
  const ext = path.extname(resolvedPath).toLowerCase();
  const mimeType = SUPPORTED_IMAGE_TYPES[ext];

  if (!mimeType) {
    const supported = Object.keys(SUPPORTED_IMAGE_TYPES).join(', ');
    throw new Error(
      `Unsupported image format: ${ext}. Supported formats: ${supported}`
    );
  }

  // Read file
  const buffer = await fs.promises.readFile(resolvedPath);
  const size = buffer.length;

  // Check size
  if (size > MAX_IMAGE_SIZE_BYTES) {
    const sizeMb = (size / (1024 * 1024)).toFixed(2);
    throw new Error(
      `Image file too large: ${sizeMb}MB. Maximum size is ${MAX_IMAGE_SIZE_MB}MB`
    );
  }

  // Validate magic bytes for common formats
  validateImageMagicBytes(buffer, ext);

  return {
    path: resolvedPath,
    buffer,
    size,
    mimeType,
    extension: ext,
  };
}

/**
 * Validate image magic bytes match the extension
 */
function validateImageMagicBytes(buffer: Buffer, extension: string): void {
  if (buffer.length < 8) {
    throw new Error('Image file is too small to be valid');
  }

  const magicBytes: Record<string, number[][]> = {
    '.png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    '.jpg': [[0xff, 0xd8, 0xff]],
    '.jpeg': [[0xff, 0xd8, 0xff]],
    '.gif': [
      [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
      [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
    ],
    '.webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header
  };

  const expectedMagic = magicBytes[extension];
  if (!expectedMagic) {
    // Skip validation for formats without magic bytes (SVG)
    return;
  }

  const matches = expectedMagic.some((magic) =>
    magic.every((byte, i) => buffer[i] === byte)
  );

  if (!matches) {
    throw new Error(
      `File content doesn't match ${extension} format. The file may be corrupted or misnamed.`
    );
  }
}

/**
 * Get supported image formats
 */
export function getSupportedImageFormats(): string[] {
  return Object.keys(SUPPORTED_IMAGE_TYPES);
}

// ============================================================================
// Metadata utilities
// ============================================================================

/**
 * Format metadata in CIP-25 compliant structure
 *
 * CIP-25: https://cips.cardano.org/cips/cip25/
 */
export function formatMetadata(params: {
  name: string;
  displayName?: string;
  description?: string;
  ipfsHash: string;
  mimeType?: string;
  attributes?: Record<string, string | number | boolean>;
  additionalMetadata?: Record<string, unknown>;
}): CIP25Metadata {
  const metadata: CIP25Metadata = {
    name: params.displayName || params.name,
    image: `ipfs://${params.ipfsHash}`,
  };

  // Add media type
  if (params.mimeType) {
    metadata.mediaType = params.mimeType;
  }

  // Add description
  if (params.description) {
    metadata.description = params.description;
  }

  // Add attributes as top-level fields (CIP-25 standard)
  if (params.attributes) {
    for (const [key, value] of Object.entries(params.attributes)) {
      // Avoid overwriting reserved fields
      if (!['name', 'image', 'mediaType', 'description', 'files'].includes(key)) {
        metadata[key] = value;
      }
    }
  }

  // Add any additional metadata
  if (params.additionalMetadata) {
    for (const [key, value] of Object.entries(params.additionalMetadata)) {
      if (!['name', 'image', 'mediaType', 'description', 'files'].includes(key)) {
        metadata[key] = value;
      }
    }
  }

  return metadata;
}

/**
 * Validate metadata field lengths for Cardano constraints
 * Token names: max 32 bytes
 * Metadata strings: recommended max 64 bytes per line
 */
export function validateMetadataLengths(params: {
  name: string;
  displayName?: string;
  description?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Token name (on-chain identifier)
  const tokenNameBytes = Buffer.byteLength(params.name, 'utf8');
  if (tokenNameBytes > 32) {
    errors.push(
      `Token name too long: ${tokenNameBytes} bytes (max 32). Use --name for short identifier.`
    );
  }

  // Check for invalid characters in token name
  if (!/^[a-zA-Z0-9_]+$/.test(params.name)) {
    errors.push(
      'Token name should only contain letters, numbers, and underscores'
    );
  }

  // Display name
  if (params.displayName) {
    const displayNameBytes = Buffer.byteLength(params.displayName, 'utf8');
    if (displayNameBytes > 64) {
      errors.push(
        `Display name quite long: ${displayNameBytes} bytes. Consider keeping under 64.`
      );
    }
  }

  // Description - warn if very long
  if (params.description) {
    const descBytes = Buffer.byteLength(params.description, 'utf8');
    if (descBytes > 512) {
      errors.push(
        `Description is ${descBytes} bytes. Very long descriptions may not display properly.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Cost estimation
// ============================================================================

/**
 * Estimate minting cost
 *
 * Components:
 * - Min UTxO: ~1.5-2 ADA (depends on metadata size)
 * - Transaction fee: ~0.2-0.3 ADA
 * - NMKR fee: Depends on plan, typically 0 for free tier (pay per project)
 */
export function estimateMintCost(): MintCostEstimate {
  const minUtxoAda = 2.0; // Conservative estimate
  const feeAda = 0.3; // Typical transaction fee
  const nmkrFeeAda = 0.0; // NMKR charges per project, not per mint

  const totalAda = minUtxoAda + feeAda + nmkrFeeAda;

  return {
    totalAda,
    minUtxoAda,
    feeAda,
    nmkrFeeAda,
    breakdown: [
      `Min UTxO: ~${minUtxoAda} ADA`,
      `TX fee:   ~${feeAda} ADA`,
      nmkrFeeAda > 0 ? `NMKR fee: ${nmkrFeeAda} ADA` : null,
      `─────────────────`,
      `Total:    ~${totalAda.toFixed(1)} ADA`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

// ============================================================================
// Address validation
// ============================================================================

/**
 * Validate a Cardano address (basic validation)
 */
export function validateCardanoAddress(address: string): {
  valid: boolean;
  network?: 'mainnet' | 'testnet';
  type?: 'base' | 'enterprise' | 'stake';
  error?: string;
} {
  if (!address) {
    return { valid: false, error: 'Address is required' };
  }

  // Check prefix
  const isMainnet = address.startsWith('addr1');
  const isTestnet = address.startsWith('addr_test1');
  const isStake = address.startsWith('stake1') || address.startsWith('stake_test1');

  if (!isMainnet && !isTestnet && !isStake) {
    return {
      valid: false,
      error: 'Invalid address format. Must start with addr1 (mainnet), addr_test1 (testnet), or stake1/stake_test1',
    };
  }

  if (isStake) {
    return {
      valid: false,
      error: 'Stake addresses cannot receive NFTs. Please provide a payment address (addr1... or addr_test1...)',
    };
  }

  // Basic length check (Cardano addresses are typically 58-108 characters)
  if (address.length < 50 || address.length > 120) {
    return {
      valid: false,
      error: `Invalid address length: ${address.length} characters`,
    };
  }

  // Check for valid bech32 characters
  const bech32Chars = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;
  const dataPart = isMainnet
    ? address.slice(5) // after "addr1"
    : address.slice(10); // after "addr_test1"

  if (!bech32Chars.test(dataPart)) {
    return {
      valid: false,
      error: 'Address contains invalid characters',
    };
  }

  // Determine address type from length
  // Base addresses are longer (include stake credential)
  // Enterprise addresses are shorter
  const type = address.length > 90 ? 'base' : 'enterprise';

  return {
    valid: true,
    network: isMainnet ? 'mainnet' : 'testnet',
    type,
  };
}

/**
 * Check if address network matches expected network
 */
export function validateAddressNetwork(
  address: string,
  expectedNetwork: 'mainnet' | 'preprod' | 'preview'
): { valid: boolean; error?: string } {
  const validation = validateCardanoAddress(address);

  if (!validation.valid) {
    return { valid: false, error: validation.error };
  }

  const addressNetwork = validation.network;
  const expectedIsMainnet = expectedNetwork === 'mainnet';
  const addressIsMainnet = addressNetwork === 'mainnet';

  if (expectedIsMainnet !== addressIsMainnet) {
    return {
      valid: false,
      error: `Address network mismatch: address is for ${addressNetwork}, but CLI is configured for ${expectedNetwork}`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Display helpers
// ============================================================================

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
