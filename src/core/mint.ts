/**
 * Core NFT minting logic
 *
 * Pure functions for NFT minting via NMKR.
 */

import { NmkrClient, isNmkrConfigured } from "../services/nmkr.js";
import {
  readImageFile,
  validateCardanoAddress,
  validateAddressNetwork,
  validateMetadataLengths,
  estimateMintCost,
} from "../lib/mint.js";
import { getErrorMessage } from "../lib/errors.js";

export interface MintNftParams {
  /** Path to image file */
  image: string;
  /** NFT token name (on-chain identifier) */
  name: string;
  /** Receiver address */
  to: string;
  /** Optional display name (shown in wallets) */
  displayName?: string;
  /** Optional description */
  description?: string;
  /** Network (for address validation) */
  network?: string;
}

export interface MintNftResult {
  status: "success" | "error";
  nftUid?: string;
  ipfsHash?: string;
  ipfsUrl?: string;
  txHash?: string;
  toAddress: string;
  network: string;
  costEstimate?: {
    totalAda: number;
    minUtxoAda: number;
    feeAda: number;
  };
  error?: string;
}

/**
 * Mint an NFT via NMKR and send to an address
 */
export async function mintNft(params: MintNftParams): Promise<MintNftResult> {
  const { image, name, to, displayName, description, network = "mainnet" } = params;

  // Check NMKR configuration
  if (!isNmkrConfigured()) {
    return {
      status: "error",
      toAddress: to,
      network,
      error:
        "NMKR not configured. Set NMKR_API_KEY and NMKR_PROJECT_UID environment variables. " +
        "Get your API key at: https://studio.nmkr.io",
    };
  }

  // Validate address
  const addrValidation = validateCardanoAddress(to);
  if (!addrValidation.valid) {
    return {
      status: "error",
      toAddress: to,
      network,
      error: `Invalid address: ${addrValidation.error}`,
    };
  }

  // Validate address network matches
  const networkValidation = validateAddressNetwork(
    to,
    network as "mainnet" | "preprod" | "preview"
  );
  if (!networkValidation.valid) {
    return {
      status: "error",
      toAddress: to,
      network,
      error: networkValidation.error,
    };
  }

  // Validate metadata lengths
  const metaValidation = validateMetadataLengths({
    name,
    displayName,
    description,
  });
  // Log warnings but don't fail
  if (!metaValidation.valid) {
    for (const err of metaValidation.errors) {
      console.warn(`Warning: ${err}`);
    }
  }

  try {
    // Read and validate image
    const imageFile = await readImageFile(image);

    // Get cost estimate
    const costEstimate = estimateMintCost();

    // Create NMKR client
    const client = NmkrClient.fromEnv();

    // Upload NFT
    const uploadResult = await client.uploadNft({
      name: name.replace(/\s+/g, ""), // No spaces in token name
      displayName: displayName || name,
      description,
      image: imageFile.buffer,
    });

    // Mint and send
    const mintResult = await client.mintAndSend({
      nftUid: uploadResult.nftUid,
      receiverAddress: to,
      tokenCount: 1,
    });

    // Poll for completion if needed
    let finalTxHash = mintResult.txHash;
    if (!finalTxHash && mintResult.state !== "sold") {
      const finalDetails = await pollForCompletion(client, uploadResult.nftUid);
      finalTxHash = finalDetails.txHash || "";
    }

    return {
      status: "success",
      nftUid: uploadResult.nftUid,
      ipfsHash: uploadResult.ipfsHash,
      ipfsUrl: uploadResult.ipfsGatewayUrl,
      txHash: finalTxHash,
      toAddress: to,
      network,
      costEstimate: {
        totalAda: costEstimate.totalAda,
        minUtxoAda: costEstimate.minUtxoAda,
        feeAda: costEstimate.feeAda,
      },
    };
  } catch (err) {
    return {
      status: "error",
      toAddress: to,
      network,
      error: getErrorMessage(err, "Minting failed"),
    };
  }
}

/**
 * Poll NMKR for mint completion
 */
async function pollForCompletion(
  client: NmkrClient,
  nftUid: string,
  maxAttempts: number = 30,
  intervalMs: number = 5000
): Promise<{ txHash?: string; state: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);

    try {
      const details = await client.getNftDetails(nftUid);

      if (details.state === "sold" || details.minted) {
        return {
          txHash: "", // NMKR may not return this directly
          state: details.state,
        };
      }

      if (details.state === "error") {
        throw new Error("Minting failed on NMKR side");
      }
    } catch (err) {
      // Continue polling on transient errors
      if (i === maxAttempts - 1) throw err;
    }
  }

  throw new Error("Timed out waiting for mint confirmation");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
