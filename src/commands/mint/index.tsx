import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import {
  NmkrClient,
  isNmkrConfigured,
  type UploadNftResult,
  type MintAndSendResult,
} from '../../services/nmkr.js';
import {
  readImageFile,
  validateCardanoAddress,
  validateAddressNetwork,
  validateMetadataLengths,
  estimateMintCost,
  formatFileSize,
  type ImageFileInfo,
} from '../../lib/mint.js';
import { outputSuccess, exitWithError, isJsonMode } from '../../lib/output.js';
import { errors, ExitCode } from '../../lib/errors.js';

// ============================================================================
// Types
// ============================================================================

interface MintCommandProps {
  /** Path to image file */
  imagePath: string;
  /** NFT token name (on-chain identifier) */
  name: string;
  /** Optional display name (shown in wallets) */
  displayName?: string;
  /** Optional description */
  description?: string;
  /** Receiver address */
  toAddress: string;
  /** Network (for address validation) */
  network: string;
  /** Skip confirmation prompt */
  yes?: boolean;
  /** JSON output mode */
  jsonOutput?: boolean;
}

type MintState =
  | 'validating'
  | 'confirm'
  | 'uploading'
  | 'minting'
  | 'polling'
  | 'success'
  | 'cancelled'
  | 'error';

interface MintInfo {
  imageFile?: ImageFileInfo;
  uploadResult?: UploadNftResult;
  mintResult?: MintAndSendResult;
  costEstimate?: ReturnType<typeof estimateMintCost>;
}

// ============================================================================
// Mint Command Component
// ============================================================================

export function MintCommand({
  imagePath,
  name,
  displayName,
  description,
  toAddress,
  network,
  yes = false,
  jsonOutput = false,
}: MintCommandProps) {
  const { exit } = useApp();
  const [state, setState] = useState<MintState>('validating');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<MintInfo>({});

  // ---- Validation phase ----
  useEffect(() => {
    const validate = async () => {
      try {
        // Check NMKR configuration
        if (!isNmkrConfigured()) {
          throw new Error(
            'NMKR not configured. Set NMKR_API_KEY and NMKR_PROJECT_UID environment variables.\n' +
              'Get your API key at: https://studio.nmkr.io'
          );
        }

        // Validate address
        const addrValidation = validateCardanoAddress(toAddress);
        if (!addrValidation.valid) {
          throw new Error(`Invalid address: ${addrValidation.error}`);
        }

        // Validate address network matches CLI network
        const networkValidation = validateAddressNetwork(
          toAddress,
          network as 'mainnet' | 'preprod' | 'preview'
        );
        if (!networkValidation.valid) {
          throw new Error(networkValidation.error);
        }

        // Validate metadata lengths
        const metaValidation = validateMetadataLengths({
          name,
          displayName,
          description,
        });
        if (!metaValidation.valid) {
          // Log warnings but don't fail (skip in JSON mode)
          if (!isJsonMode()) {
            for (const err of metaValidation.errors) {
              console.warn(`⚠ ${err}`);
            }
          }
        }

        // Read and validate image
        const imageFile = await readImageFile(imagePath);

        // Get cost estimate
        const costEstimate = estimateMintCost();

        setInfo({ imageFile, costEstimate });
        setState('confirm');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Validation failed';
        setError(message);
        setState('error');
        if (jsonOutput) {
          exitWithError(errors.invalidArgument('mint', message));
        }
        setTimeout(() => exit(), 2000);
      }
    };

    validate();
  }, []);

  // ---- Auto-confirm with --yes flag ----
  useEffect(() => {
    if ((yes || jsonOutput) && state === 'confirm') {
      handleMint();
    }
  }, [yes, jsonOutput, state]);

  // ---- Keyboard input for confirmation ----
  useInput((input, key) => {
    if (jsonOutput) return;
    if (state !== 'confirm') return;

    if (input === 'y' || input === 'Y') {
      handleMint();
    } else if (input === 'n' || input === 'N' || key.escape) {
      setState('cancelled');
      setTimeout(() => exit(), 500);
    }
  });

  // ---- Minting process ----
  const handleMint = async () => {
    try {
      const client = NmkrClient.fromEnv();

      // Upload NFT
      setState('uploading');
      const uploadResult = await client.uploadNft({
        name,
        displayName: displayName || name,
        description,
        image: info.imageFile!.buffer,
      });
      setInfo((prev) => ({ ...prev, uploadResult }));

      // Mint and send
      setState('minting');
      const mintResult = await client.mintAndSend({
        nftUid: uploadResult.nftUid,
        receiverAddress: toAddress,
        tokenCount: 1,
      });
      setInfo((prev) => ({ ...prev, mintResult }));

      // Poll for completion if needed
      if (!mintResult.txHash && mintResult.state !== 'sold') {
        setState('polling');
        const finalDetails = await pollForCompletion(client, uploadResult.nftUid);
        setInfo((prev) => ({
          ...prev,
          mintResult: {
            ...prev.mintResult!,
            txHash: finalDetails.txHash || '',
            state: finalDetails.state,
          },
        }));
      }

      // Success
      if (jsonOutput) {
        outputSuccess({
          status: 'minted',
          nftUid: uploadResult.nftUid,
          ipfsHash: uploadResult.ipfsHash,
          ipfsUrl: uploadResult.ipfsGatewayUrl,
          txHash: mintResult.txHash || info.mintResult?.txHash,
          toAddress,
          network,
        });
        process.exit(ExitCode.SUCCESS);
      }

      setState('success');
      setTimeout(() => exit(), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Minting failed';
      setError(message);
      setState('error');
      if (jsonOutput) {
        exitWithError(err);
      }
      setTimeout(() => exit(), 2000);
    }
  };

  // ---- Render states ----

  if (state === 'validating') {
    return (
      <Box padding={1}>
        <Text color="cyan">⏳ Validating inputs...</Text>
      </Box>
    );
  }

  if (state === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ Error: {error}</Text>
        {info.uploadResult && (
          <Box marginTop={1}>
            <Text color="gray">NFT UID: </Text>
            <Text>{info.uploadResult.nftUid}</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (state === 'cancelled') {
    return (
      <Box padding={1}>
        <Text color="yellow">Minting cancelled</Text>
      </Box>
    );
  }

  if (state === 'uploading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">📤 Uploading image to IPFS...</Text>
        <Text color="gray">This may take a moment</Text>
      </Box>
    );
  }

  if (state === 'minting') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔨 Minting NFT...</Text>
        {info.uploadResult && (
          <Box marginTop={1}>
            <Text color="gray">IPFS: </Text>
            <Text>{info.uploadResult.ipfsGatewayUrl}</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (state === 'polling') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Waiting for transaction...</Text>
        <Text color="gray">This may take a few minutes</Text>
      </Box>
    );
  }

  if (state === 'success') {
    const txHash = info.mintResult?.txHash;
    const explorerUrl = getExplorerUrl(network, txHash);

    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">✓ NFT minted successfully!</Text>

        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color="gray">Name: </Text>
            <Text bold>{displayName || name}</Text>
          </Box>
          <Box>
            <Text color="gray">IPFS: </Text>
            <Text color="blue">{info.uploadResult?.ipfsGatewayUrl}</Text>
          </Box>
          <Box>
            <Text color="gray">To:   </Text>
            <Text>{shortenAddr(toAddress)}</Text>
          </Box>
          {txHash && (
            <>
              <Box>
                <Text color="gray">TX:   </Text>
                <Text>{txHash}</Text>
              </Box>
              <Box marginTop={1}>
                <Text color="gray">View: </Text>
                <Text color="blue">{explorerUrl}</Text>
              </Box>
            </>
          )}
        </Box>
      </Box>
    );
  }

  // ---- Confirmation prompt ----
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Mint NFT
        </Text>
        <Text color="gray"> ({network})</Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        padding={1}
      >
        {/* NFT Info */}
        <Box>
          <Text color="gray">Name:        </Text>
          <Text bold>{displayName || name}</Text>
        </Box>
        <Box>
          <Text color="gray">Token Name:  </Text>
          <Text>{name}</Text>
        </Box>
        {description && (
          <Box>
            <Text color="gray">Description: </Text>
            <Text>{truncateText(description, 50)}</Text>
          </Box>
        )}

        {/* Image Info */}
        <Box marginTop={1}>
          <Text color="gray">Image:       </Text>
          <Text>{info.imageFile?.path.split('/').pop()}</Text>
          <Text color="gray">
            {' '}
            ({formatFileSize(info.imageFile?.size || 0)})
          </Text>
        </Box>
        <Box>
          <Text color="gray">Format:      </Text>
          <Text>{info.imageFile?.mimeType}</Text>
        </Box>

        {/* Destination */}
        <Box marginTop={1}>
          <Text color="gray">To Address:  </Text>
          <Text>{shortenAddr(toAddress)}</Text>
        </Box>

        {/* Cost Estimate */}
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">Estimated Cost:</Text>
          <Box paddingLeft={2}>
            <Text color="yellow">~{info.costEstimate?.totalAda.toFixed(1)} ADA</Text>
          </Box>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text>Proceed with mint? </Text>
        <Text color="green">[Y]es</Text>
        <Text> / </Text>
        <Text color="red">[N]o</Text>
      </Box>
    </Box>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function shortenAddr(addr: string): string {
  if (addr.length <= 40) return addr;
  return `${addr.slice(0, 20)}...${addr.slice(-15)}`;
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function getExplorerUrl(network: string, txHash?: string): string {
  if (!txHash) return '';
  const prefix = network === 'mainnet' ? '' : `${network}.`;
  return `https://${prefix}cardanoscan.io/transaction/${txHash}`;
}

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

      if (details.state === 'sold' || details.minted) {
        // Try to find tx hash from the asset info
        return {
          txHash: '', // NMKR may not return this directly
          state: details.state,
        };
      }

      if (details.state === 'error') {
        throw new Error('Minting failed on NMKR side');
      }
    } catch (err) {
      // Continue polling on transient errors
      if (i === maxAttempts - 1) throw err;
    }
  }

  throw new Error('Timed out waiting for mint confirmation');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
