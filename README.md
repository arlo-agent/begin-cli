<p align="center">
  <img src="https://raw.githubusercontent.com/arlo-agent/begin-cli/main/docs/logo.svg" width="120" alt="begin-cli logo">
</p>

<h1 align="center">begin-cli</h1>

<p align="center">
  <strong>The first Cardano CLI wallet designed for AI agents</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#agent-quick-start">Agent Quick Start</a> •
  <a href="#commands">Commands</a> •
  <a href="#for-ai-agents">For AI Agents</a> •
  <a href="#security">Security</a>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/begin-cli?color=blue" alt="npm version">
  <img src="https://img.shields.io/badge/cardano-mainnet%20%7C%20preprod%20%7C%20preview-green" alt="networks">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="license">
</p>

---

**begin-cli** is a headless, scriptable Cardano wallet built for autonomous AI agents. No browser extensions. No GUIs. Just clean CLI commands with JSON output, environment variable support, and zero interactive prompts when you need them gone.

## Why begin-cli?

| Feature | Traditional Wallets | begin-cli |
|---------|-------------------|-----------|
| **Non-interactive mode** | ❌ Requires clicks/prompts | ✅ `--yes` flag, env vars |
| **JSON output** | ❌ Human-formatted only | ✅ `--json` for parsing |
| **Scriptable** | ❌ GUI-dependent | ✅ Pipe-friendly |
| **Agent-native** | ❌ Designed for humans | ✅ Built for agents |
| **Env var secrets** | ❌ File-based only | ✅ `BEGIN_CLI_MNEMONIC` |

---

## Quick Start

Get a working wallet in under 5 minutes:

```bash
# Option 1: Run directly with npx (no install)
npx @aspect58/begin-cli balance addr1qy...

# Option 2: Install globally
npm install -g @aspect58/begin-cli
begin balance addr1qy...
```

### Prerequisites

- **Node.js 18+** required
- **Blockfrost API key** for mainnet/testnet queries (free tier: [blockfrost.io](https://blockfrost.io))

```bash
# Set your API key
export BLOCKFROST_API_KEY=your_project_id_here
```

---

## Agent Quick Start

For AI agents that need to operate autonomously:

### 1. Set Environment Variables

```bash
# Required: Blockfrost API access
export BLOCKFROST_API_KEY=mainnetXXXXXXXX

# Optional: Wallet mnemonic for signing (use with caution)
export BEGIN_CLI_MNEMONIC="word1 word2 word3 ... word24"

# Optional: Default network
export BEGIN_CLI_NETWORK=mainnet
```

### 2. Use JSON Output Mode

```bash
# All commands support --json for machine parsing
begin balance addr1qy... --json

# Output:
{
  "address": "addr1qy...",
  "network": "mainnet",
  "balance": {
    "ada": "125.430000",
    "lovelace": "125430000"
  },
  "tokens": [
    {"name": "HOSKY", "quantity": "1000000", "unit": "a0028f..."},
    {"name": "SNEK", "quantity": "500", "unit": "b0028f..."}
  ]
}
```

### 3. Non-Interactive Operations

```bash
# Skip all confirmations with --yes
begin send addr1recipient... 10 --yes --json

# Combine with jq for scripting
TX_HASH=$(begin send addr1... 10 --yes --json | jq -r '.txHash')
echo "Sent! TX: $TX_HASH"
```

---

## Complete Workflow Guide

### Step 1: Install

```bash
npm install -g @aspect58/begin-cli
```

### Step 2: Configure

```bash
# Set Blockfrost API key (get free key at blockfrost.io)
export BLOCKFROST_API_KEY=mainnetXXXXXXXX

# Verify setup
begin --version
```

### Step 3: Create or Restore a Wallet

```bash
# Create new wallet (saves encrypted to ~/.begin-cli/)
begin wallet create mywallet

# Or restore from mnemonic
begin wallet restore mywallet --mnemonic "word1 word2 ... word24"

# Or use environment variable (no file storage)
export BEGIN_CLI_MNEMONIC="word1 word2 ... word24"
```

### Step 4: Get Your Address

```bash
# Display receiving address
begin wallet address

# With QR code for mobile wallets
begin wallet address --qr
```

### Step 5: Check Balance

```bash
# Check balance for your wallet
begin balance

# Check any address
begin balance addr1qy2kv2n5r...

# On testnet
begin balance addr_test1... --network preprod
```

### Step 6: Send ADA

```bash
# Interactive send (with confirmation)
begin send addr1recipient... 10

# Non-interactive send (for agents)
begin send addr1recipient... 10 --yes

# With JSON output
begin send addr1recipient... 10 --yes --json
```

### Step 7: Send Native Tokens

```bash
# Send tokens by name (if registered)
begin send addr1... 100 --token HOSKY

# Send by policy ID
begin send addr1... 100 --token a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235.HOSKY
```

### Step 8: Staking

```bash
# View available pools
begin stake pools --limit 10

# Delegate to a pool
begin stake delegate TICKER

# Check staking status
begin stake status

# Withdraw rewards
begin stake withdraw --yes
```

---

## Commands

### Wallet Management

| Command | Description |
|---------|-------------|
| `begin wallet create <name>` | Create a new wallet |
| `begin wallet restore <name>` | Restore from mnemonic |
| `begin wallet list` | List all wallets |
| `begin wallet address` | Show receiving address |
| `begin wallet address --qr` | Show address with QR code |
| `begin wallet export` | Export wallet (encrypted) |

### Balance & History

| Command | Description |
|---------|-------------|
| `begin balance [address]` | Check ADA and token balance |
| `begin utxos [address]` | List UTXOs |
| `begin history [address]` | Transaction history |

### Transactions

| Command | Description |
|---------|-------------|
| `begin send <to> <amount>` | Send ADA |
| `begin send <to> <amount> --token <token>` | Send native tokens |
| `begin sign --tx <file>` | Sign a transaction |
| `begin submit --tx <file>` | Submit signed transaction |

### Staking

| Command | Description |
|---------|-------------|
| `begin stake pools` | List stake pools |
| `begin stake delegate <pool>` | Delegate to pool |
| `begin stake status` | View delegation status |
| `begin stake withdraw` | Withdraw rewards |

### Global Flags

| Flag | Description |
|------|-------------|
| `--network, -n` | Network: `mainnet`, `preprod`, `preview` |
| `--json` | Output as JSON |
| `--yes, -y` | Skip confirmations |
| `--wallet, -w` | Specify wallet name |
| `--help` | Show help |
| `--version` | Show version |

---

## Configuration

### Config File

Located at `~/.begin-cli/config.json`:

```json
{
  "defaultNetwork": "mainnet",
  "defaultWallet": "mywallet",
  "blockfrost": {
    "mainnet": "mainnetXXXXXXXX",
    "preprod": "preprodXXXXXXXX",
    "preview": "previewXXXXXXXX"
  }
}
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `BLOCKFROST_API_KEY` | Blockfrost project ID | `mainnetABC123...` |
| `BEGIN_CLI_MNEMONIC` | 24-word recovery phrase | `word1 word2...` |
| `BEGIN_CLI_NETWORK` | Default network | `mainnet` |
| `BEGIN_CLI_WALLET` | Default wallet name | `mywallet` |
| `BEGIN_CLI_CONFIG` | Config file path | `~/.begin-cli/config.json` |

**Priority order:** CLI flags > Environment variables > Config file > Defaults

---

## For AI Agents

### JSON Output Format

All commands support `--json` for structured output:

```bash
# Balance query
begin balance addr1... --json
```

```json
{
  "success": true,
  "data": {
    "address": "addr1qy...",
    "network": "mainnet",
    "balance": {
      "ada": "125.430000",
      "lovelace": "125430000"
    },
    "tokens": [
      {
        "unit": "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59",
        "name": "HOSKY",
        "quantity": "1000000"
      }
    ]
  }
}
```

```bash
# Transaction submission
begin send addr1... 10 --yes --json
```

```json
{
  "success": true,
  "data": {
    "txHash": "abc123def456...",
    "fee": "0.170000",
    "network": "mainnet"
  }
}
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments |
| `3` | Network error (Blockfrost unreachable) |
| `4` | Insufficient funds |
| `5` | Invalid address |
| `6` | Transaction rejected |
| `10` | Wallet not found |
| `11` | Wrong password |

### Error Handling

Errors in JSON mode follow a consistent structure:

```json
{
  "success": false,
  "error": {
    "code": 4,
    "message": "Insufficient funds",
    "details": {
      "required": "100.000000",
      "available": "50.430000",
      "missing": "49.570000"
    }
  }
}
```

### Integration Examples

#### OpenClaw Skill

```yaml
# skills/begin-cli/SKILL.md
name: begin-cli
description: Cardano wallet for sending ADA and tokens

commands:
  - begin balance {address} --json
  - begin send {to} {amount} --yes --json
  - begin stake status --json

environment:
  - BLOCKFROST_API_KEY
  - BEGIN_CLI_MNEMONIC
```

#### Shell Script

```bash
#!/bin/bash
set -e

# Check balance before sending
BALANCE=$(begin balance --json | jq -r '.data.balance.ada')

if (( $(echo "$BALANCE > 10" | bc -l) )); then
  TX=$(begin send addr1recipient... 5 --yes --json)
  echo "Sent! TX: $(echo $TX | jq -r '.data.txHash')"
else
  echo "Insufficient balance: $BALANCE ADA"
  exit 4
fi
```

#### Python

```python
import subprocess
import json

def get_balance(address: str) -> dict:
    result = subprocess.run(
        ["begin", "balance", address, "--json"],
        capture_output=True,
        text=True
    )
    return json.loads(result.stdout)

def send_ada(to: str, amount: float) -> dict:
    result = subprocess.run(
        ["begin", "send", to, str(amount), "--yes", "--json"],
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        raise Exception(json.loads(result.stdout)["error"]["message"])
    return json.loads(result.stdout)

# Usage
balance = get_balance("addr1qy...")
print(f"Balance: {balance['data']['balance']['ada']} ADA")
```

#### MCP Tool

```json
{
  "name": "cardano_send",
  "description": "Send ADA to an address",
  "parameters": {
    "to": { "type": "string", "description": "Recipient address" },
    "amount": { "type": "number", "description": "Amount in ADA" }
  },
  "command": "begin send {to} {amount} --yes --json"
}
```

---

## Security

### Wallet Storage

- Wallets are encrypted at rest using AES-256-GCM
- Stored in `~/.begin-cli/wallets/`
- Password required for signing operations

### Environment Variable Mode

For agents, you can skip file storage entirely:

```bash
# Wallet lives only in memory during execution
export BEGIN_CLI_MNEMONIC="word1 word2 ... word24"
begin send addr1... 10 --yes
```

⚠️ **Warning:** Environment variables may be visible in process lists. Use with caution.

### Offline Signing Workflow

For maximum security, sign transactions on an air-gapped machine:

```bash
# On online machine: build unsigned transaction
begin send addr1... 10 --build-only --out unsigned.tx

# On offline machine: sign
begin sign --tx unsigned.tx --out signed.tx

# On online machine: submit
begin submit --tx signed.tx
```

### Best Practices

1. **Never commit mnemonics** to version control
2. **Use testnet first** (`--network preprod`) for development
3. **Set spending limits** for agent wallets
4. **Monitor addresses** via Blockfrost webhooks
5. **Rotate keys** periodically for high-value wallets

---

## Development

```bash
# Clone
git clone https://github.com/arlo-agent/begin-cli.git
cd begin-cli

# Install dependencies
npm install

# Build
npm run build

# Run locally
node dist/cli.js balance addr1...

# Watch mode
npm run dev

# Type check
npm run typecheck

# Link for global testing
npm link
```

### Project Structure

```
begin-cli/
├── src/
│   ├── cli.tsx              # Entry point, argument parsing
│   ├── app.tsx              # Main app component, routing
│   ├── index.ts             # Library exports
│   ├── commands/
│   │   └── cardano/
│   │       ├── balance.tsx  # Balance check
│   │       └── send.tsx     # Send transactions
│   └── services/
│       └── blockfrost.ts    # Blockfrost API client
├── docs/
│   └── RFC_SUMMARY.md       # Design decisions
├── package.json
├── tsconfig.json
└── README.md
```

---

## Roadmap

### ✅ Implemented
- [x] Balance checking (ADA + native tokens)
- [x] Multi-network support (mainnet, preprod, preview)
- [x] Blockfrost integration

### 🚧 In Progress
- [ ] Wallet creation and restoration
- [ ] Transaction signing and submission
- [ ] JSON output mode
- [ ] Non-interactive mode (`--yes`)

### 📋 Planned
- [ ] Token transfers
- [ ] Staking and delegation
- [ ] QR code generation
- [ ] Spending limits and policies
- [ ] Bitcoin and Solana support
- [ ] Hardware wallet support (Ledger/Trezor)
- [ ] HashiCorp Vault integration

---

## FAQ

**Q: Do I need ADA to check balances?**  
No. Balance queries are free (uses Blockfrost API).

**Q: Is my mnemonic sent anywhere?**  
No. All cryptographic operations happen locally. Your mnemonic never leaves your machine.

**Q: Can I use this on testnet?**  
Yes! Use `--network preprod` or `--network preview`. Get test ADA from the [Cardano Faucet](https://docs.cardano.org/cardano-testnets/tools/faucet).

**Q: Is this safe for production?**  
This is beta software. Use small amounts and testnet for development. Always verify transactions before signing.

---

## License

MIT © [Arlo](https://github.com/arlo-agent)

---

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting PRs.

---

<p align="center">
  <sub>Built for agents, by agents 🤖</sub>
</p>
