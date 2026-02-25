---
name: begin-swap
description: Swap tokens via Minswap DEX aggregator. Get quotes, execute swaps, manage orders.
tags: [swap, dex, minswap, trading]
---

# Token Swaps

Swap tokens on Cardano via the Minswap DEX aggregator. Get quotes, execute swaps, view pending orders, and cancel orders.

## Commands

### Get a Quote

```bash
begin swap quote --from ADA --to MIN --amount 100
begin swap quote --from ADA --to MIN --amount 100 --json
```

Get a swap quote without executing. Shows expected output amount and price impact.

### Execute a Swap

```bash
begin swap --from ADA --to MIN --amount 100
begin swap --from ADA --to MIN --amount 100 --slippage 1.0
begin swap --from ADA --to MIN --amount 100 --yes --json
```

Execute a token swap. Default slippage tolerance is 0.5%.

### List Pending Orders

```bash
begin swap orders
begin swap orders --wallet <name>
begin swap orders --address addr1...
begin swap orders --json
```

List pending (unfilled) swap orders for a wallet or address.

### Cancel Orders

```bash
begin swap cancel --id <tx_in>
begin swap cancel --id <tx_in> --id <tx_in2> --yes
begin swap cancel --id <tx_in> --yes --json
```

Cancel one or more pending swap orders. Use `--id` multiple times for batch cancellation.

## Token Identifiers

Tokens can be specified as:

- **ADA** - Native ADA
- **Ticker** - Common tokens like `MIN`, `HOSKY`, `SUNDAE`
- **Policy.AssetName** - Full asset identifier (e.g., `abc123...def.HOSKY`)

## JSON Mode

Use `--json` flag for structured output:

```bash
begin swap quote --from ADA --to MIN --amount 100 --json
begin swap --from ADA --to MIN --amount 100 --yes --json
begin swap orders --json
begin swap cancel --id tx123#0 --yes --json
```

**Quote Response:**
```json
{
  "inputToken": "ADA",
  "outputToken": "MIN",
  "inputAmount": "100",
  "expectedOutput": "245.67",
  "priceImpact": "0.12%",
  "route": ["ADA", "MIN"]
}
```

**Swap Response:**
```json
{
  "success": true,
  "txHash": "abc123...",
  "inputAmount": "100",
  "expectedOutput": "245.67"
}
```

**Orders Response:**
```json
{
  "orders": [
    {
      "txIn": "abc123...#0",
      "inputToken": "ADA",
      "outputToken": "MIN",
      "inputAmount": "100",
      "status": "pending"
    }
  ]
}
```

**Cancel Response:**
```json
{
  "success": true,
  "txHash": "def456...",
  "cancelledOrders": ["abc123...#0"]
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BEGIN_CLI_MNEMONIC` | 24-word mnemonic for agent use |
| `BEGIN_CLI_WALLET_PASSWORD` | Wallet password for automation |
| `BLOCKFROST_API_KEY` | API key for blockchain access |

## Swap Options

| Flag | Description |
|------|-------------|
| `--from` | Token to swap from (ADA, ticker, or policyId.assetName) |
| `--to` | Token to swap to |
| `--amount` | Amount of input token to swap |
| `--slippage, -s` | Slippage tolerance in % (default: 0.5) |
| `--multi-hop` | Allow multi-hop routing (default: true) |
| `--yes, -y` | Skip confirmation prompt |
| `--json, -j` | Output as JSON |

## Cancel Options

| Flag | Description |
|------|-------------|
| `--id, -i` | Pending order tx_in (repeatable) |
| `--address` | Wallet address for order lookup |
| `--protocol` | Protocol override if not in pending list |
| `--yes, -y` | Skip confirmation prompt |

## Workflow

### Simple Swap

```bash
# 1. Get a quote first
begin swap quote --from ADA --to MIN --amount 100

# 2. If quote looks good, execute
begin swap --from ADA --to MIN --amount 100 --yes --json
```

### Automated Trading

```bash
export BEGIN_CLI_MNEMONIC="word1 word2 ... word24"
export BLOCKFROST_API_KEY="mainnet..."

# Get quote and extract expected output
quote=$(begin swap quote --from ADA --to MIN --amount 100 --json)
expected=$(echo "$quote" | jq -r '.expectedOutput')

# Execute if rate is favorable
if (( $(echo "$expected > 240" | bc -l) )); then
  begin swap --from ADA --to MIN --amount 100 --yes --json
fi
```

### Cancel Stale Orders

```bash
# List pending orders
begin swap orders --json

# Cancel specific order
begin swap cancel --id abc123...#0 --yes --json

# Cancel multiple orders
begin swap cancel --id tx1#0 --id tx2#1 --yes --json
```

## Examples

```bash
# Get quote for swapping 100 ADA to MIN
begin swap quote --from ADA --to MIN --amount 100

# Execute swap with 1% slippage tolerance
begin swap --from ADA --to MIN --amount 100 --slippage 1.0 --yes

# Swap MIN back to ADA
begin swap --from MIN --to ADA --amount 200 --yes --json

# List all pending orders
begin swap orders --json

# Cancel a pending order
begin swap cancel --id abc123...#0 --yes
```

## Notes

- Swaps use Minswap DEX aggregator for best rates
- Multi-hop routing is enabled by default for better prices
- Orders may remain pending if liquidity is insufficient
- Always check quotes before executing large swaps
- Price impact increases with larger swap amounts

## Related Skills

- [begin-wallet](../begin-wallet/SKILL.md) - Wallet management and balances
- [begin-discovery](../begin-discovery/SKILL.md) - Token discovery for swap pairs
