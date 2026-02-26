---
name: begin-staking
description: Delegate ADA to stake pools, check delegation status, withdraw rewards.
tags: [staking, delegation, cardano, rewards]
---

# Staking

Delegate ADA to stake pools, monitor delegation status, and withdraw staking rewards.

## Commands

### Search Stake Pools

```bash
begin stake pools
begin stake pools <search-term>
begin stake pools <search-term> --json
```

List or search available stake pools. Search by pool name or ticker.

### Delegate to a Pool

```bash
begin stake delegate <pool-id>
begin stake delegate <pool-id> --wallet <name> --yes
begin stake delegate <pool-id> --yes --json
```

Delegate your stake to a pool. Use `--yes` to skip confirmation prompt.

### Check Delegation Status

```bash
begin stake status
begin stake status --wallet <name>
begin stake status --json
```

View current delegation status, active pool, and available rewards.

### Withdraw Rewards

```bash
begin stake withdraw
begin stake withdraw --wallet <name> --yes
begin stake withdraw --yes --json
```

Withdraw accumulated staking rewards to your wallet.

## JSON Mode

Use `--json` flag for structured output:

```bash
begin stake pools cardano --json
begin stake status --json
begin stake withdraw --yes --json
```

**Pools Response:**
```json
{
  "pools": [
    {
      "poolId": "pool1...",
      "ticker": "CARD",
      "name": "Cardano Pool",
      "saturation": "45.2%",
      "margin": "2%",
      "pledge": "500000"
    }
  ]
}
```

**Status Response:**
```json
{
  "delegated": true,
  "poolId": "pool1...",
  "poolTicker": "CARD",
  "rewards": "12500000",
  "rewardsAda": "12.5"
}
```

**Withdraw Response:**
```json
{
  "success": true,
  "txHash": "abc123...",
  "amount": "12500000"
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BEGIN_CLI_MNEMONIC` | 24-word mnemonic for agent use |
| `BEGIN_CLI_WALLET_PASSWORD` | Wallet password for automation |
| `BLOCKFROST_API_KEY` | API key for blockchain access |

## Common Options

| Flag | Description |
|------|-------------|
| `--network, -n` | Network: mainnet, preprod, preview |
| `--wallet, -w` | Wallet name from keystore |
| `--password` | Wallet password |
| `--json, -j` | Output as JSON |
| `--yes, -y` | Skip confirmation prompts |

## Workflow

### Full Staking Workflow

```bash
# 1. Search for a pool
begin stake pools CARD --json

# 2. Delegate to chosen pool
begin stake delegate pool1abc... --yes --json

# 3. Wait for delegation to become active (2-3 epochs)

# 4. Check status and rewards
begin stake status --json

# 5. Withdraw rewards when ready
begin stake withdraw --yes --json
```

### Automated Reward Withdrawal

```bash
export BEGIN_CLI_MNEMONIC="word1 word2 ... word24"
export BLOCKFROST_API_KEY="mainnet..."

# Check rewards
rewards=$(begin stake status --json | jq -r '.rewards')

# Withdraw if rewards exceed threshold (10 ADA)
if [ "$rewards" -gt 10000000 ]; then
  begin stake withdraw --yes --json
fi
```

## Examples

```bash
# Search for pools with "CARD" in name/ticker
begin stake pools CARD

# Delegate to a pool
begin stake delegate pool1abc123... --yes

# Check current delegation
begin stake status --json

# Withdraw all rewards
begin stake withdraw --yes --json
```

## Notes

- Delegation takes effect after 2-3 epochs (~10-15 days)
- Rewards accumulate every epoch (5 days)
- You can change delegation at any time without unstaking
- Staked ADA remains liquid and can be spent

## Related Skills

- [begin-wallet](../begin-wallet/SKILL.md) - Wallet management
- [begin-swap](../begin-swap/SKILL.md) - Swap tokens via Minswap
