---
name: begin-wallet
description: Create and manage Cardano wallets, check balances, send ADA and native tokens.
tags: [wallet, cardano, send, balance]
---

# Wallet Management

Create, restore, and manage Cardano wallets. Check balances, send ADA and native tokens, view transaction history.

## Commands

### Create a New Wallet

```bash
begin wallet create <name>
```

Interactive command that generates a new 24-word mnemonic. The wallet is stored in the local keystore.

### Restore a Wallet

```bash
begin wallet restore <name>
```

Interactive command to restore a wallet from an existing mnemonic.

### Show Wallet Addresses

```bash
begin wallet address
begin wallet address --wallet <name>
begin wallet address --wallet <name> --full
```

Display derived addresses for a wallet. Use `--full` to show complete addresses without truncation.

### Check Balance

```bash
begin cardano balance <address>
begin cardano balance <address> --json
```

Check ADA and native token balance for any address.

### List UTXOs

```bash
begin cardano utxos <address>
begin cardano utxos <address> --json
```

List all UTXOs (unspent transaction outputs) for an address.

### Transaction History

```bash
begin cardano history <address>
begin cardano history <address> --limit 20 --page 2 --json
```

Show transaction history. Defaults to 10 transactions per page.

### Send ADA

```bash
# Interactive (prompts for confirmation)
begin cardano send <to-address> <amount>

# With wallet name and password
begin cardano send <to-address> <amount> --wallet <name> --password <pass>

# Non-interactive with JSON output
begin cardano send <to-address> <amount> --yes --json
```

Send ADA to an address. Amount is in ADA (not lovelace).

### Send Native Tokens

```bash
begin cardano send <to-address> <amount> --asset <policyId.assetName:quantity>

# Multiple assets
begin cardano send <to-address> 2 --asset abc123.HOSKY:1000 --asset def456.MIN:500
```

Send native tokens. Always include some ADA for minimum UTxO requirements.

### Receive Address with QR

```bash
begin receive <address>
begin receive --wallet <name>
begin receive --wallet <name> --qr
```

Display a receive address, optionally with a QR code for easy scanning.

## JSON Mode

Use `--json` flag for structured output suitable for parsing:

```bash
begin cardano balance addr1... --json
begin cardano send addr1... 10 --yes --json
begin cardano history addr1... --json
```

**Balance Response:**
```json
{
  "lovelace": "5000000",
  "ada": "5.0",
  "tokens": [
    {"policyId": "abc...", "assetName": "HOSKY", "quantity": "1000"}
  ],
  "address": "addr1..."
}
```

**Send Response:**
```json
{
  "success": true,
  "txHash": "abc123...",
  "fee": "180000",
  "amount": "10000000"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Insufficient funds"
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BEGIN_CLI_MNEMONIC` | 24-word mnemonic for agent use (bypasses keystore) |
| `BEGIN_CLI_WALLET_PASSWORD` | Wallet password for automation |
| `BLOCKFROST_API_KEY` | API key for blockchain access (all networks) |
| `BLOCKFROST_API_KEY_MAINNET` | API key for mainnet (overrides generic) |
| `BLOCKFROST_API_KEY_PREPROD` | API key for preprod testnet |
| `BLOCKFROST_API_KEY_PREVIEW` | API key for preview testnet |

Get a free Blockfrost API key at: https://blockfrost.io

## Common Options

| Flag | Description |
|------|-------------|
| `--network, -n` | Network: mainnet, preprod, preview (default: mainnet) |
| `--wallet, -w` | Wallet name from keystore |
| `--password` | Wallet password |
| `--json, -j` | Output as JSON |
| `--yes, -y` | Skip confirmation prompts |
| `--limit, -l` | Items per page for history (default: 10) |
| `--page` | Page number for history pagination |

## Workflow

### Agent Setup (Non-Interactive)

```bash
# Set environment variables
export BLOCKFROST_API_KEY="mainnetXXXXXXXXXXXXXXXXX"
export BEGIN_CLI_MNEMONIC="word1 word2 word3 ... word24"

# Now commands work without prompts
begin cardano balance addr1... --json
begin cardano send addr1recipient... 10 --yes --json
```

### Check Balance Before Sending

```bash
# Get balance
balance=$(begin cardano balance addr1... --json | jq -r '.ada')

# Check if sufficient
if (( $(echo "$balance > 11" | bc -l) )); then
  begin cardano send addr1recipient... 10 --yes --json
fi
```

### Monitor Incoming Transactions

```bash
# Get latest transaction
begin cardano history addr1... --limit 1 --json
```

## Examples

```bash
# Create a new wallet
begin wallet create my-wallet

# Check balance
begin cardano balance addr1qy...

# Send 10 ADA
begin cardano send addr1recipient... 10 --wallet my-wallet --yes --json

# Send tokens with ADA
begin cardano send addr1recipient... 2 --asset abc123.HOSKY:1000 --yes

# Get receive address with QR
begin receive --wallet my-wallet --qr

# View recent history
begin cardano history addr1... --limit 5 --json
```

## Related Skills

- [begin-staking](../begin-staking/SKILL.md) - Stake ADA to pools
- [begin-swap](../begin-swap/SKILL.md) - Swap tokens via Minswap
- [begin-offline](../begin-offline/SKILL.md) - Air-gapped signing workflow
