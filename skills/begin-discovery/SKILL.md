---
name: begin-discovery
description: Discover Cardano tokens and trading pairs via Minswap API.
tags: [tokens, discovery, minswap, dex]
---

# Token Discovery

Discover Cardano native tokens available for trading on Minswap DEX. Find token information, trading pairs, and liquidity data.

## Overview

Token discovery uses the Minswap API to find tokens tradeable on Cardano. This is useful for:

- Finding token identifiers for swaps
- Checking available trading pairs
- Verifying token metadata
- Discovering new tokens

## Minswap API

The Minswap API provides token data at:

```
https://api-mainnet-prod.minswap.org/
```

### Get All Tokens

```bash
curl -s "https://api-mainnet-prod.minswap.org/tokens" | jq '.[:5]'
```

Returns token list with policy IDs, asset names, and metadata.

### Get Token by Ticker

```bash
curl -s "https://api-mainnet-prod.minswap.org/tokens?ticker=MIN" | jq '.'
```

### Get Trading Pairs

```bash
curl -s "https://api-mainnet-prod.minswap.org/pools" | jq '.[:3]'
```

Returns liquidity pools and trading pairs.

## Token Identifiers

Tokens on Cardano are identified by:

| Format | Example | Description |
|--------|---------|-------------|
| Ticker | `MIN`, `SUNDAE` | Human-readable symbol |
| Policy.Asset | `abc...def.MIN` | Full on-chain identifier |
| ADA | `ADA` | Native currency |

## Common Tokens

| Ticker | Name | Notes |
|--------|------|-------|
| ADA | Cardano | Native currency |
| MIN | Minswap | DEX governance token |
| SUNDAE | SundaeSwap | DEX governance token |
| HOSKY | Hosky | Community meme token |
| WMT | World Mobile | Telecom token |
| INDY | Indigo | Synthetic assets protocol |
| JPG | JPG Store | NFT marketplace token |

## Workflow

### Find Token for Swap

```bash
# 1. Search for token by ticker
curl -s "https://api-mainnet-prod.minswap.org/tokens?ticker=HOSKY" | jq '.[0]'

# 2. Get the full identifier
# Output: { "policyId": "abc...", "assetName": "HOSKY", ... }

# 3. Use in swap command
begin swap --from ADA --to HOSKY --amount 100 --yes
```

### Check Token Liquidity

```bash
# Get pools containing a token
curl -s "https://api-mainnet-prod.minswap.org/pools" | \
  jq '.[] | select(.tokenA.ticker == "MIN" or .tokenB.ticker == "MIN")'
```

### Discover New Tokens

```bash
# List recently added tokens
curl -s "https://api-mainnet-prod.minswap.org/tokens?sort=createdAt&order=desc&limit=10" | jq '.'
```

## Integration with begin-cli

Token discovery complements the swap functionality:

```bash
# 1. Discover available tokens
# (Use Minswap API directly)

# 2. Get a swap quote
begin swap quote --from ADA --to MIN --amount 100 --json

# 3. Execute the swap
begin swap --from ADA --to MIN --amount 100 --yes --json
```

## API Endpoints Reference

| Endpoint | Description |
|----------|-------------|
| `/tokens` | List all tokens |
| `/tokens?ticker=X` | Find by ticker |
| `/pools` | List liquidity pools |
| `/pools/{poolId}` | Pool details |

## Notes

- Token list updates dynamically as new tokens are added
- Some tokens may have low liquidity - check before large swaps
- Verified tokens have additional metadata available
- Use policy ID for unambiguous token identification

## Related Skills

- [begin-swap](../begin-swap/SKILL.md) - Execute token swaps
- [begin-wallet](../begin-wallet/SKILL.md) - Check token balances
