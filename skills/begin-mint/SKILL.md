---
name: begin-mint
description: Mint NFTs on Cardano via NMKR service.
tags: [nft, mint, nmkr, cardano]
---

# NFT Minting

Mint NFTs on Cardano using the NMKR minting service. Upload images and create NFTs with metadata.

## Commands

### Mint an NFT

```bash
begin mint --image <path> --name <name> --to <address>
begin mint --image ./avatar.png --name "MyNFT" --to addr1...
begin mint --image ./art.png --name "Art001" --description "My artwork" --to addr1... --yes
begin mint --image ./nft.jpg --name "Token" --display-name "My Token" --yes --json
```

Mint an NFT from an image file and send it to a Cardano address.

## Options

| Flag | Description |
|------|-------------|
| `--image, -i` | Image file path (PNG, JPG, etc.) |
| `--name` | Token name (no spaces, used as asset name) |
| `--display-name` | Display name for the NFT (defaults to --name) |
| `--description` | NFT description text |
| `--to, -t` | Receiver address for the minted NFT |
| `--wallet, -w` | Wallet name (for payment and default receiver) |
| `--yes, -y` | Skip confirmation prompt |
| `--json, -j` | Output as JSON |
| `--network, -n` | Network: mainnet, preprod, preview |

## JSON Mode

Use `--json` flag for structured output:

```bash
begin mint --image ./art.png --name "Art001" --to addr1... --yes --json
```

**Mint Response:**
```json
{
  "success": true,
  "txHash": "abc123...",
  "policyId": "def456...",
  "assetName": "Art001",
  "ipfsHash": "Qm...",
  "receiver": "addr1..."
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Invalid image format"
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NMKR_API_KEY` | NMKR API key for minting service |
| `NMKR_PROJECT_UID` | NMKR Project UID |
| `BEGIN_CLI_MNEMONIC` | Wallet mnemonic (for payment) |
| `BEGIN_CLI_WALLET_PASSWORD` | Wallet password |
| `BLOCKFROST_API_KEY` | API key for blockchain access |

Get an NMKR API key at: https://www.nmkr.io

## Workflow

### Basic NFT Minting

```bash
# 1. Set up environment
export NMKR_API_KEY="your-nmkr-api-key"
export NMKR_PROJECT_UID="your-project-uid"
export BLOCKFROST_API_KEY="mainnet..."

# 2. Mint an NFT
begin mint --image ./artwork.png --name "Artwork001" --to addr1recipient... --yes --json
```

### Automated Minting

```bash
export NMKR_API_KEY="..."
export NMKR_PROJECT_UID="..."
export BEGIN_CLI_MNEMONIC="word1 word2 ... word24"
export BLOCKFROST_API_KEY="mainnet..."

# Mint with full metadata
begin mint \
  --image ./collection/item001.png \
  --name "Item001" \
  --display-name "Collection Item #1" \
  --description "First item in my NFT collection" \
  --to addr1collector... \
  --yes --json
```

### Batch Minting

```bash
# Mint multiple NFTs from a directory
for img in ./images/*.png; do
  name=$(basename "$img" .png)
  begin mint --image "$img" --name "$name" --to addr1... --yes --json
  sleep 2  # Wait between mints
done
```

## Examples

```bash
# Simple mint
begin mint --image ./avatar.png --name "Avatar" --to addr1...

# Mint with description
begin mint --image ./art.png --name "Art001" --description "Digital artwork" --to addr1... --yes

# Mint with display name
begin mint --image ./token.jpg --name "TOKEN001" --display-name "My Special Token" --to addr1... --yes --json

# Mint to own wallet
begin mint --image ./nft.png --name "MyNFT" --wallet my-wallet --yes
```

## Notes

- Requires NMKR account and API credentials
- Image is uploaded to IPFS automatically
- Token name cannot contain spaces (use display-name for readable names)
- Minting incurs network fees plus NMKR service fees
- NFT is sent directly to the specified address upon minting

## Related Skills

- [begin-wallet](../begin-wallet/SKILL.md) - Wallet management for receiving NFTs
