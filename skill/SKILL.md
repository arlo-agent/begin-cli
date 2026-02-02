# Begin CLI Skill

Cardano CLI wallet for AI agents. Send ADA, manage wallets, stake.

## Overview

Begin CLI is a headless, scriptable Cardano wallet designed for autonomous AI agents. No GUI — just clean CLI commands with JSON output and environment variable support.

## Installation

```bash
npm install -g @beginwallet/cli
```

Or use without installing:
```bash
npx @beginwallet/cli <command>
```

## Environment Variables

```bash
# Required: Blockfrost API access
export BLOCKFROST_API_KEY=your_project_id_here

# Optional: Wallet mnemonic for signing (bypasses keystore)
export BEGIN_CLI_MNEMONIC="word1 word2 word3 ... word24"

# Optional: Default network
export BEGIN_CLI_NETWORK=mainnet
```

Get a free Blockfrost API key at: https://blockfrost.io

## Commands

### Check Balance

```bash
begin cardano balance <address>
begin cardano balance <address> --json
```

### List UTXOs

```bash
begin cardano utxos <address>
begin cardano utxos <address> --json
```

### Transaction History

```bash
begin cardano history <address>
begin cardano history <address> --limit 20 --page 2 --json
```

### Send ADA

```bash
# Interactive (prompts for confirmation)
begin cardano send <to-address> <amount>

# Non-interactive (skip confirmation)
begin cardano send <to-address> <amount> --yes

# With wallet name and password
begin cardano send <to-address> <amount> --wallet my-wallet --password mypass --yes

# With native tokens
begin cardano send <to-address> <amount> --asset <policyId.assetName:quantity>

# JSON output
begin cardano send <to-address> <amount> --yes --json
```

### Receive Address

```bash
begin receive <address>
begin receive --wallet <name>
begin receive --wallet <name> --qr   # Show QR code
```

### Wallet Management

```bash
# Create new wallet (interactive)
begin wallet create <name>

# Restore from mnemonic (interactive)
begin wallet restore <name>

# Show wallet addresses
begin wallet address
begin wallet address --wallet <name> --full
```

### Offline Signing Workflow

```bash
# 1. Build unsigned transaction
begin cardano send <to-address> <amount> --dry-run --output tx.unsigned

# 2. Sign transaction
begin sign tx.unsigned --wallet <name> --password <pass>

# 3. Submit transaction
begin submit tx.signed
begin submit tx.signed --no-wait --json
```

### Staking (Coming Soon)

```bash
# List stake pools
begin stake pools
begin stake pools <search-term> --json

# Delegate to pool
begin stake delegate <pool-id> --wallet <name> --yes

# Check status
begin stake status --wallet <name>

# Withdraw rewards
begin stake withdraw --wallet <name> --yes
```

## Common Options

| Flag | Description |
|------|-------------|
| `--network, -n` | Network: mainnet, preprod, preview (default: mainnet) |
| `--wallet, -w` | Wallet name from keystore |
| `--password` | Wallet password (or prompted interactively) |
| `--json, -j` | Output as JSON (for parsing) |
| `--yes` | Skip confirmation prompts |
| `--dry-run, -d` | Build but don't submit transaction |
| `--output, -o` | Output file path for unsigned/signed tx |

## Agent Usage Patterns

### Check balance and send if sufficient

```bash
# Check balance (JSON for parsing)
begin cardano balance addr1... --json

# Send with no prompts
begin cardano send addr1recipient... 10 --yes --json
```

### Use mnemonic from environment

```bash
# Set mnemonic (bypasses keystore entirely)
export BEGIN_CLI_MNEMONIC="word1 word2 ... word24"

# Now commands use this mnemonic automatically
begin cardano send addr1... 5 --yes
```

### Multi-network operations

```bash
# Mainnet
begin cardano balance addr1... --network mainnet

# Testnet (preprod)
begin cardano balance addr_test1... --network preprod
```

## Security Notes

- Never log or expose `BEGIN_CLI_MNEMONIC` in outputs
- Use `--password` flag or interactive prompt, avoid hardcoding
- For production agents, consider using keystore with strong passwords
- The `--yes` flag skips confirmations — use carefully

## Error Handling

Commands return non-zero exit codes on failure. With `--json`, errors include structured error messages:

```json
{
  "success": false,
  "error": "Insufficient funds"
}
```

## Links

- **GitHub**: https://github.com/arlo-agent/begin-cli
- **NPM**: https://www.npmjs.com/package/@beginwallet/cli
- **Begin Wallet**: https://begin.is
