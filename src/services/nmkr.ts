/**
 * NMKR API client for NFT minting on Cardano
 *
 * NMKR Studio API v2: https://studio-api.nmkr.io/swagger/index.html
 * Authentication: Bearer token in Authorization header
 *
 * Environment variables:
 *   NMKR_API_KEY - Your NMKR API key
 *   NMKR_PROJECT_UID - Your NMKR project UID
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface NmkrConfig {
  apiKey: string;
  projectUid: string;
  baseUrl?: string;
}

export interface UploadNftParams {
  /** Token name (used as NFT identifier, no spaces) */
  name: string;
  /** Display name shown in wallets/marketplaces */
  displayName?: string;
  /** NFT description */
  description?: string;
  /** Image file path or Buffer */
  image: Buffer | string;
  /** Additional CIP-25 metadata */
  metadata?: Record<string, unknown>;
  /** Preview image (optional) */
  previewImage?: Buffer | string;
  /** Subfiles for more complex NFTs */
  subfiles?: Array<{
    name: string;
    data: Buffer | string;
    mimeType?: string;
  }>;
}

export interface UploadNftResult {
  nftUid: string;
  ipfsHash: string;
  ipfsGatewayUrl: string;
  state: string;
}

export interface MintAndSendParams {
  nftUid: string;
  receiverAddress: string;
  tokenCount?: number;
}

export interface MintAndSendResult {
  txHash: string;
  state: string;
  nftUid: string;
}

export interface NftDetails {
  id: number;
  uid: string;
  name: string;
  displayName: string;
  description: string;
  ipfsLink: string;
  gatewayLink: string;
  state: 'free' | 'reserved' | 'sold' | 'error';
  minted: boolean;
  policyId: string;
  assetId: string;
  assetName: string;
  fingerprint: string;
  mintedAt?: string;
  metadata: Record<string, unknown>;
}

export interface NftListItem {
  id: number;
  uid: string;
  name: string;
  displayName: string;
  state: 'free' | 'reserved' | 'sold' | 'error';
  ipfsLink: string;
}

export interface NftListResult {
  nfts: NftListItem[];
  totalCount: number;
  page: number;
  count: number;
}

interface NmkrApiError {
  error?: string;
  message?: string;
  errorCode?: number;
}

// ============================================================================
// NMKR Client
// ============================================================================

const DEFAULT_BASE_URL = 'https://studio-api.nmkr.io/v2';

export class NmkrClient {
  private apiKey: string;
  private projectUid: string;
  private baseUrl: string;

  constructor(config: NmkrConfig) {
    this.apiKey = config.apiKey;
    this.projectUid = config.projectUid;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * Create client from environment variables
   */
  static fromEnv(): NmkrClient {
    const apiKey = process.env.NMKR_API_KEY;
    const projectUid = process.env.NMKR_PROJECT_UID;

    if (!apiKey) {
      throw new Error('NMKR_API_KEY environment variable is required');
    }
    if (!projectUid) {
      throw new Error('NMKR_PROJECT_UID environment variable is required');
    }

    return new NmkrClient({ apiKey, projectUid });
  }

  /**
   * Check if NMKR environment variables are configured
   */
  static isConfigured(): boolean {
    return !!(process.env.NMKR_API_KEY && process.env.NMKR_PROJECT_UID);
  }

  /**
   * Upload an NFT image and metadata to NMKR (creates a pending/free NFT)
   */
  async uploadNft(params: UploadNftParams): Promise<UploadNftResult> {
    const imageData = await this.resolveFileData(params.image);
    const mimeType = this.detectMimeType(
      typeof params.image === 'string' ? params.image : 'image.png'
    );

    // Build the request body for NMKR UploadNft endpoint
    const body: Record<string, unknown> = {
      tokenname: params.name.replace(/\s+/g, ''), // No spaces in token name
      displayname: params.displayName ?? params.name,
      description: params.description ?? '',
      previewImageNft: {
        mimetype: mimeType,
        fileFromBase64: imageData.toString('base64'),
      },
    };

    // Add additional metadata if provided
    if (params.metadata && Object.keys(params.metadata).length > 0) {
      body.metadataPlaceholder = Object.entries(params.metadata).map(
        ([name, value]) => ({ name, value: String(value) })
      );
    }

    const response = await this.request<{
      nftId: number;
      nftUid: string;
      ipfsHashMainnft: string;
      ipfsGatewayAddress: string;
      state: string;
    }>(`/UploadNft/${this.projectUid}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      nftUid: response.nftUid,
      ipfsHash: response.ipfsHashMainnft,
      ipfsGatewayUrl: response.ipfsGatewayAddress,
      state: response.state,
    };
  }

  /**
   * Mint an NFT and send it to a receiver address
   */
  async mintAndSend(params: MintAndSendParams): Promise<MintAndSendResult> {
    const tokenCount = params.tokenCount ?? 1;
    const endpoint = `/MintAndSendSpecific/${this.projectUid}/${params.nftUid}/${tokenCount}/${params.receiverAddress}`;

    const response = await this.request<{
      nftId: number;
      nftUid: string;
      state: string;
      txHash?: string;
      sendedTransaction?: string;
    }>(endpoint, {
      method: 'POST',
    });

    // NMKR might return txHash in different fields depending on state
    const txHash = response.txHash || response.sendedTransaction || '';

    return {
      txHash,
      state: response.state,
      nftUid: response.nftUid,
    };
  }

  /**
   * Get NFT details by UID
   */
  async getNftDetails(nftUid: string): Promise<NftDetails> {
    const response = await this.request<{
      id: number;
      uid: string;
      name: string;
      displayname: string;
      description: string;
      ipfsLink: string;
      gatewayLink: string;
      state: string;
      minted: boolean;
      policyId: string;
      assetId: string;
      assetname: string;
      fingerprint: string;
      mintedTimestamp?: string;
      metadata: Record<string, unknown>;
    }>(`/GetNftDetailsById/${nftUid}`, {
      method: 'GET',
    });

    return {
      id: response.id,
      uid: response.uid,
      name: response.name,
      displayName: response.displayname,
      description: response.description,
      ipfsLink: response.ipfsLink,
      gatewayLink: response.gatewayLink,
      state: response.state as NftDetails['state'],
      minted: response.minted,
      policyId: response.policyId,
      assetId: response.assetId,
      assetName: response.assetname,
      fingerprint: response.fingerprint,
      mintedAt: response.mintedTimestamp,
      metadata: response.metadata || {},
    };
  }

  /**
   * List NFTs in the project
   */
  async listNfts(
    state: 'free' | 'reserved' | 'sold' = 'free',
    count: number = 50,
    page: number = 1
  ): Promise<NftListResult> {
    const endpoint = `/GetNfts/${this.projectUid}/${state}/${count}/${page}`;

    const response = await this.request<
      Array<{
        id: number;
        uid: string;
        name: string;
        displayname: string;
        state: string;
        ipfsLink: string;
      }>
    >(endpoint, {
      method: 'GET',
    });

    // NMKR returns an array directly
    const nfts = (Array.isArray(response) ? response : []).map((nft) => ({
      id: nft.id,
      uid: nft.uid,
      name: nft.name,
      displayName: nft.displayname,
      state: nft.state as NftListItem['state'],
      ipfsLink: nft.ipfsLink,
    }));

    return {
      nfts,
      totalCount: nfts.length, // NMKR doesn't return total in list
      page,
      count,
    };
  }

  /**
   * Get project information
   */
  async getProjectDetails(): Promise<{
    uid: string;
    projectname: string;
    policyId: string;
    totalNfts: number;
    mintedNfts: number;
  }> {
    return this.request(`/GetProjectDetails/${this.projectUid}`, {
      method: 'GET',
    });
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `NMKR API error: ${response.status} ${response.statusText}`;

      try {
        const errorBody = (await response.json()) as NmkrApiError;
        if (errorBody.error || errorBody.message) {
          errorMessage = `NMKR API error: ${errorBody.error || errorBody.message}`;
        }
      } catch {
        // Ignore JSON parse errors for error body
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<T>;
  }

  private async resolveFileData(input: Buffer | string): Promise<Buffer> {
    if (Buffer.isBuffer(input)) {
      return input;
    }

    // It's a file path
    const resolvedPath = path.resolve(input);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    return fs.promises.readFile(resolvedPath);
  }

  private detectMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

// ============================================================================
// Convenience exports
// ============================================================================

/**
 * Create a configured NMKR client from environment variables
 */
export function createNmkrClient(): NmkrClient {
  return NmkrClient.fromEnv();
}

/**
 * Check if NMKR is configured
 */
export function isNmkrConfigured(): boolean {
  return NmkrClient.isConfigured();
}
