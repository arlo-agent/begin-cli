---
name: begin-cli
version: 1.0.0
description: Cardano CLI wallet for AI agents. Send ADA, manage wallets, stake.
homepage: https://github.com/arlo-agent/begin-cli
---

# begin-cli Skill

A Cardano CLI wallet designed for AI agents. Manage wallets, send ADA and native tokens, stake, and check balances—all from the command line with JSON output for easy parsing.

## When to Use This Skill

- Create or manage Cardano wallets
- Send ADA or native tokens
- Check balances and transaction history
- Stake ADA to pools
- Generate receiving addresses with QR codes
- Query UTXOs and blockchain state

## Installation

```bash
npm install -g @beginwallet/cli
```

Verify installation:
```bash
begin --version
```

## Environment Setup

### Required: Blockfrost API Key

begin-cli uses Blockfrost for blockchain access. Get a free API key at https://blockfrost.io

```bash
# For mainnet
export BLOCKFROST_API_KEY="mainnetXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# For testnet (preprod)
export BLOCKFROST_API_KEY="preprodXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

### Agent Mode: Mnemonic via Environment

For non-interactive automation, set the wallet mnemonic:

```bash
export BEGIN_CLI_MNEMONIC="word1 word2 word3 ... word24"
```

⚠️ **Security Warning:** Never log or expose mnemonics. Use environment variables only.

## Quick Commands

### Wallet Management

```bash
# Create a new wallet (interactive - generates mnemonic)
begin wallet create

# Create wallet non-interactively (agent mode)
begin wallet create --json

# List all wallets
begin wallet list --json

# Show wallet details
begin wallet show --json

# Delete a wallet
begin wallet delete <wallet-name>
```

### Check Balance

```bash
# Check balance of current wallet
begin balance --json

# Output example:
# {
#   "lovelace": "5000000",
#   "ada": "5.0",
#   "tokens": [
#     {"policyId": "abc...", "assetName": "MyToken", "quantity": "100"}
#   ]
# }
```

### Receiving Address

```bash
# Get receiving address
begin address --json

# Generate QR code for address
begin address --qr

# Get address as plain text
begin address
```

### Send ADA

```bash
# Send ADA (interactive confirmation)
begin send --to addr1qy... --ada 10

# Send ADA non-interactively (requires BEGIN_CLI_MNEMONIC)
begin send --to addr1qy... --ada 10 --yes --json

# Send lovelace (1 ADA = 1,000,000 lovelace)
begin send --to addr1qy... --lovelace 5000000 --yes --json

# Send with metadata
begin send --to addr1qy... --ada 5 --message "Payment for services" --yes --json
```

### Send Native Tokens

```bash
# Send native token
begin send --to addr1qy... --token <policy_id>.<asset_name> --amount 100 --yes --json

# Send token with ADA (for min UTxO)
begin send --to addr1qy... --token <policy_id>.MyToken --amount 50 --ada 2 --yes --json
```

### Transaction History

```bash
# Get recent transactions
begin history --json

# Get last N transactions
begin history --limit 10 --json
```

### UTxO Management

```bash
# List UTxOs
begin utxos --json

# Get specific UTxO details
begin utxo <txhash>#<index> --json
```

### Staking

```bash
# Check current delegation status
begin stake status --json

# Delegate to a pool
begin stake delegate --pool pool1... --yes --json

# Withdraw rewards
begin stake withdraw --yes --json

# Check available rewards
begin stake rewards --json
```

## Agent Mode (Non-Interactive)

For fully automated operations, combine environment variables with flags:

```bash
export BEGIN_CLI_MNEMONIC="your 24 word mnemonic phrase here"
export BLOCKFROST_API_KEY="your-api-key"

# Now commands run without prompts
begin send --to addr1qy... --ada 10 --yes --json
```

### Required Flags for Automation

| Flag | Purpose |
|------|---------|
| `--yes` or `-y` | Skip confirmation prompts |
| `--json` | Output structured JSON for parsing |

## JSON Output

Always use `--json` for programmatic parsing:

```bash
# Get balance as JSON
result=$(begin balance --json)
ada_balance=$(echo "$result" | jq -r '.ada')

# Check if transaction succeeded
result=$(begin send --to addr1... --ada 5 --yes --json)
tx_hash=$(echo "$result" | jq -r '.txHash')
if [ -n "$tx_hash" ]; then
  echo "Transaction submitted: $tx_hash"
fi
```

### JSON Response Structures

**Balance Response:**
```json
{
  "lovelace": "5000000",
  "ada": "5.0",
  "tokens": [],
  "address": "addr1qy..."
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
  "error": "Insufficient funds",
  "code": "INSUFFICIENT_BALANCE"
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (network, blockchain, internal) |
| 2 | User error (invalid input, missing params) |

```bash
begin send --to addr1... --ada 10 --yes --json
if [ $? -eq 0 ]; then
  echo "Transaction successful"
elif [ $? -eq 2 ]; then
  echo "Invalid parameters"
else
  echo "Transaction failed"
fi
```

## Network Selection

```bash
# Use mainnet (default)
begin --network mainnet balance --json

# Use preprod testnet
begin --network preprod balance --json

# Use preview testnet
begin --network preview balance --json
```

Or set via environment:
```bash
export BEGIN_CLI_NETWORK="preprod"
```

## Security Best Practices

1. **Never log mnemonics** - Use environment variables
2. **Use read-only operations first** - Verify addresses before sending
3. **Test on testnet** - Use preprod before mainnet
4. **Validate amounts** - Double-check before `--yes`
5. **Secure API keys** - Don't commit to repos

```bash
# Load secrets from secure storage
export BEGIN_CLI_MNEMONIC=$(cat /path/to/secure/mnemonic)
export BLOCKFROST_API_KEY=$(cat /path/to/secure/api-key)
```

## Common Workflows

### Receive Payment
```bash
# Get address for receiving
address=$(begin address --json | jq -r '.address')
echo "Send ADA to: $address"

# Monitor for incoming transaction
begin history --limit 1 --json
```

### Check Before Sending
```bash
# Verify balance covers amount + fees
balance=$(begin balance --json | jq -r '.ada')
if (( $(echo "$balance > 11" | bc -l) )); then
  begin send --to addr1... --ada 10 --yes --json
fi
```

### Batch Operations
```bash
# Send to multiple recipients (one by one)
recipients=("addr1..." "addr1..." "addr1...")
for addr in "${recipients[@]}"; do
  begin send --to "$addr" --ada 5 --yes --json
  sleep 2  # Wait between transactions
done
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No wallet found" | Run `begin wallet create` or set `BEGIN_CLI_MNEMONIC` |
| "Insufficient funds" | Check balance with `begin balance --json` |
| "Invalid address" | Verify address format (addr1... for mainnet) |
| "API key invalid" | Check `BLOCKFROST_API_KEY` matches network |
| "Network timeout" | Retry or check Blockfrost status |

## See Also

- [Cardano Documentation](https://docs.cardano.org/)
- [Blockfrost API](https://blockfrost.io/)
- [begin-cli GitHub](https://github.com/arlo-agent/begin-cli)
