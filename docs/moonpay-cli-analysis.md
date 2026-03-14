# MoonPay CLI vs Begin CLI: Competitive Analysis & Roadmap

**Date:** 2026-02-25 (revised)
**Author:** Arlo
**Status:** Draft for review

---

## 1. Executive Summary

MoonPay shipped a CLI (`@moonpay/cli`, v0.6.24) on Feb 24 that turns a terminal into a full crypto banking interface — wallets, fiat on/off ramp, swaps, bridges, trading automation, and an MCP server for AI agent integration. It supports 9 chains and positions itself as the default wallet for AI agents.

This matters for Begin because:

- **MoonPay validated the CLI-as-wallet thesis.** A major fintech bet real engineering on terminal-native crypto. The market is real.
- **AI agent integration is the land grab.** MoonPay's MCP server and Skills system mean Claude Desktop users can manage crypto through natural language. Begin needs parity here fast.
- **Begin has advantages MoonPay can't easily replicate** — open source, Ink-based rich UI, deep Cardano DeFi (staking, governance, Minswap swaps), offline signing, NFT minting (NMKR), and QR code support.

The recommendation: ship an MCP server and improve the existing Skills files within weeks, then layer on multi-chain and fiat onramp over the next quarter.

---

## 2. Feature Comparison

| Feature | MoonPay CLI | Begin CLI | Gap |
|---|---|---|---|
| **Chains** | 9 (SOL, ETH, BTC, Base, Polygon, Arbitrum, Optimism, BNB, Avalanche) | 10 (ADA, SOL, BTC, ETH, Base, Polygon, Arbitrum, Optimism, BNB, Avalanche) | ✅ **Parity+ (PR #30)** |
| **Wallet creation** | BIP39, AES-256-GCM, OS keychain | BIP39, OS keychain + password fallback | ✅ **Done (PR #21)** |
| **Auth / Agent mode** | Email + OTP (autonomous login possible) | `BEGIN_CLI_MNEMONIC` + `BEGIN_CLI_WALLET_PASSWORD` env vars, OS keychain | ✅ **Done (PR #21)** |
| **Fiat on/off ramp** | Virtual bank accounts, Apple Pay, Venmo, PayPal | Onramper buy command (URL builder) | ✅ **Done (PR #25)** |
| **Token swaps** | Multi-chain via swaps.xyz | Cardano: Minswap (CLI). Solana: Jupiter token search (PR #27) | **TODO:** Jupiter swap execution |
| **Cross-chain bridges** | Yes (swaps.xyz) | XOSwap integration exists in b58-extension (feature/solana) | Port XOSwap to CLI |
| **Staking** | None | Delegate, pool search, status, rewards — real MeshSDK | ✅ **Done (PR #23)** |
| **Governance** | None | Cardano governance support | **Begin ahead** |
| **NFT minting** | None | NMKR integration (mint + send in one command) | **Begin ahead** |
| **Trading automation** | DCA, limit orders, stop losses (OS cron scripts) | None | Large |
| **Token discovery** | Trending, market data, risk scores | Minswap (Cardano) + Jupiter (Solana) + CoinGecko + Binance | ✅ **Done (PR #26, #27)** |
| **MCP server** | `mp mcp` built-in | `begin mcp` built-in | ✅ **Done (PR #20)** |
| **Skills system** | 16 SKILL.md files shipped in npm package | Individual SKILL.md files per feature | ✅ **Done (PR #22)** |
| **Offline signing** | None visible | Full air-gapped workflow (dry-run → sign → submit) | **Begin ahead** |
| **Output formats** | `--format compact` (JSON), `--format table` | `--json` flag | Comparable |
| **Terminal UI** | Plain text (Commander.js) | Ink 5 + React interactive components | **Begin ahead** |
| **QR codes** | None visible | Receive addresses with QR codes | **Begin ahead** |
| **Deposit links** | Auto-convert to stablecoins | None | Medium |
| **Portfolio export** | CSV/JSON via jq pipelines | None | Small |
| **Price alerts** | Yes (OS notifications) | None | Small |
| **x402 payments** | Machine-to-machine payments | None | Medium |
| **Open source** | No (minified proprietary bundles) | Yes | **Begin ahead** |
| **Confirmation control** | Not visible | `--yes` flag on send, stake, swap, mint | **Begin ahead** |
| **Multi-wallet** | Named wallets, encrypted keychain | Named wallets, password-encrypted keystore | Comparable |

---

## 3. Current Begin CLI Inventory (main branch, Feb 25)

Commands available today:

| Command | Status | Notes |
|---|---|---|
| `cardano balance <addr>` | ✅ Production | JSON output supported |
| `cardano utxos <addr>` | ✅ Production | JSON output supported |
| `cardano history <addr>` | ✅ Production | Pagination (--limit, --page) |
| `cardano send <to> <amount>` | ✅ Production | --yes, --asset, --dry-run, native tokens |
| `wallet create <name>` | ✅ Production | Interactive mnemonic generation |
| `wallet restore <name>` | ✅ Production | Interactive mnemonic input |
| `wallet address` | ✅ Production | --full flag for complete addresses |
| `receive` | ✅ Production | --qr for QR codes |
| `sign <tx-file>` | ✅ Production | Offline signing |
| `submit <signed-tx>` | ✅ Production | --no-wait option |
| `stake pools [search]` | ⚠️ Simulated | Pool search — needs MeshSDK implementation |
| `stake delegate <pool>` | ⚠️ Simulated | --yes flag — needs MeshSDK implementation |
| `stake status` | ⚠️ Simulated | Delegation status + rewards — needs MeshSDK |
| `stake withdraw` | ⚠️ Simulated | --yes flag — needs MeshSDK implementation |
| `swap` | ✅ Production | Minswap aggregator |
| `swap quote` | ✅ Production | Quote without executing |
| `swap orders` | ✅ Production | List pending orders |
| `swap cancel` | ✅ Production | Cancel by tx_in |
| `mint` | ✅ Production | NMKR: --image, --name, --to, --description |

**Environment variables:**
- `BEGIN_CLI_MNEMONIC` — Bypass keystore for agents
- `BEGIN_CLI_WALLET_PASSWORD` — Auto-decrypt wallet for agents
- `BLOCKFROST_API_KEY` (+ network-specific variants)
- `NMKR_API_KEY` + `NMKR_PROJECT_UID`

**Skills files:** Two exist (`skills/SKILL.md` and `skill/SKILL.md`) — need consolidation and expansion.

---

## 4. Priority Improvements

### P0 — Do Now (1-3 weeks each)

**MCP Server (`begin mcp`)**
- Effort: ~1 week
- Impact: Unlocks AI agent integration, Claude Desktop/Code compatibility
- Why now: The protocol is standardized, `@modelcontextprotocol/sdk` exists. Every day without this is a day agents can't use Begin. MoonPay has it. We need it.
- See Section 5 for implementation plan.

**Skills consolidation and expansion**
- Effort: ~2-3 days
- Impact: AI agents discover Begin's capabilities automatically
- What to do: Consolidate the two existing SKILL.md files into a proper `skills/` directory. Add individual skill files for each command group (wallet, staking, swap, mint, offline-signing). Follow MoonPay's pattern of one skill per workflow. Update `package.json` files list.

**OS Keychain wallet storage**
- Effort: ~1 week
- Impact: Better security, password becomes optional, agent-friendly (read mnemonic from keychain)
- Approach: Use `keytar` or similar for macOS Keychain, Linux libsecret, Windows Credential Manager
- Mnemonic stored encrypted in OS keychain. Password optional (keychain handles auth).

**Real staking via MeshSDK**
- Effort: ~1 week
- Impact: Currently simulated data — needs to be real for production use
- Approach: Use @meshsdk/core for delegation, pool queries, reward withdrawal on Cardano

**Multi-chain architecture prep**
- Effort: ~2 weeks (refactor only, no new chains yet)
- Impact: Unblocks everything else
- Why now: Jupiter swaps, XOSwap bridges, Onramper fiat, and Jupiter token discovery already exist in b58-extension (feature/solana branch). The code is written — it needs to be extracted and wired into CLI.
- Key change: Separate Ink rendering from business logic so MCP and CLI share the same core.

### P1 — Next Quarter

**Fiat onramp (Onramper)**
- Effort: ~1 week (integration already exists in b58-extension)
- Impact: High — makes the wallet useful for buying, not just managing
- Approach: Port Onramper URL builder from b58-extension. CLI generates checkout URL → prints or opens in browser. For agents, return URL as JSON.
- Existing: `src/views/exchange/onramper.tsx` in b58-extension — uses `buy.onramper.com` with API key `pk_prod_01HETEQF46GSK6BS5JWKDF31BT`

**Token discovery (Minswap + Jupiter)**
- Effort: ~1-2 weeks (both integrations exist in other repos)
- Impact: Agents need to research before trading
- **Cardano:** Minswap public API (`https://api-mainnet-prod.minswap.org`)
  - Docs: https://docs.minswap.org/developer/minswap-apis
  - `GET /v1/assets` — search/list tokens with metadata, verification status
  - `POST /v1/assets/metrics` — price, volume (1h/24h/7d), liquidity, market cap, supply, sorted by any metric
  - `GET /v1/assets/:id/metrics` — detailed metrics for a specific token (by policyId+tokenName)
  - `GET /v1/assets/:id/price/candlestick` — OHLCV candlestick data (1m to 1M intervals)
  - `GET /v1/assets/:id/price/timeseries` — price history (1d to all)
  - Pools API for TVL, volume, fee timeseries
  - Supports 45+ fiat currencies for price display
  - No API key needed, rate-limited
- **Solana:** Jupiter token list + verified tokens (already in b58-extension `src/core/chains/adapters/solana-token-list.ts`)
- **BTC + ADA/USD + charts:** CoinGecko + Binance (both already in b58-extension)
  - Minswap doesn't return ADA metrics (ADA is the base pair — `/v1/assets/lovelace/metrics` returns 404)
  - **CoinGecko** (`src/config/production.ts`): `GET /api/v3/simple/price?ids=cardano,bitcoin,solana&include_24hr_change=true` — prices, 24h change. Free tier, no key.
  - **Binance** (`src/core/chains/adapters/solana-chart.ts`): `data-api.binance.vision/api/v3/klines` — OHLCV candlestick data for price charts. Resolves symbols dynamically. Free, no key.
  - Both integrations exist and just need porting to CLI.

**Jupiter swaps for Solana**
- Effort: ~2 weeks (swap logic exists in b58-extension)
- Impact: Multi-chain swaps. Jupiter aggregator with Metis routing, platform fee support.
- Existing: `src/core/chains/adapters/solana-swap.ts` — full quote + swap implementation with fee accounts

**XOSwap cross-chain bridges**
- Effort: ~2 weeks (integration exists in b58-extension)
- Impact: Cross-chain swaps (BTC↔ETH↔SOL↔ADA etc.)
- Existing: `src/hooks/useXOSwap.ts` — uses Exodus exchange API (`exchange.exodus.io/v3`)

**Multi-chain: Bitcoin + Solana**
- Effort: 3-4 weeks (after architecture prep, faster since adapters exist)
- Impact: Parity with mobile app. Three chains, one CLI.

### P2 — Later

**Trading automation (DCA, limit orders)**
- Effort: 3-4 weeks
- Impact: Power user feature, good for autonomous agents
- Approach: Shell script templates (like MoonPay does) or built-in scheduler

**Price alerts**
- Effort: 1-2 weeks
- Approach: Polling + OS notifications or webhook

**Portfolio export (CSV/JSON)**
- Effort: 3-5 days
- Good for tax reporting, agent analysis

**Cross-chain bridges**
- Effort: 3-4 weeks (depends on multi-chain)
- Approach: Integrate an aggregator (LI.FI, Socket, etc.)

**Deposit links / Payment requests**
- Effort: 2-3 weeks
- Requires backend service

---

## 5. MCP Server Implementation Plan

### What MoonPay does

`mp mcp` starts a stdio-based MCP server. Claude Desktop connects via config:

```json
{
  "mcpServers": {
    "moonpay": { "command": "mp", "args": ["mcp"] }
  }
}
```

Their MCP exposes every CLI command as a tool. They also ship `@modelcontextprotocol/sdk` as a dependency.

### How to build `begin mcp`

**Step 1: Add dependency**

```bash
npm install @modelcontextprotocol/sdk
```

**Step 2: Create `src/mcp/server.ts`**

Map existing commands to MCP tools:

| MCP Tool | Maps to | Description |
|---|---|---|
| `wallet_create` | wallet create | Create new HD wallet |
| `wallet_list` | wallet address | List wallet addresses |
| `wallet_balance` | cardano balance | Get ADA + token balances |
| `wallet_utxos` | cardano utxos | List UTXOs |
| `wallet_history` | cardano history | Transaction history |
| `wallet_send` | cardano send | Send ADA + native tokens |
| `wallet_receive` | receive | Get receive address |
| `stake_status` | stake status | Delegation status + rewards |
| `stake_delegate` | stake delegate | Delegate to pool |
| `stake_pools` | stake pools | Search stake pools |
| `stake_withdraw` | stake withdraw | Withdraw rewards |
| `swap_quote` | swap quote | Get swap quote |
| `swap_execute` | swap | Execute token swap |
| `swap_orders` | swap orders | List pending orders |
| `swap_cancel` | swap cancel | Cancel pending order |
| `mint_nft` | mint | Mint NFT via NMKR |
| `sign_tx` | sign | Sign unsigned transaction |
| `submit_tx` | submit | Submit signed transaction |

Each tool returns JSON. No Ink rendering — MCP is pure data.

**Step 3: Bypass Ink for MCP mode**

```typescript
// In cli.tsx, before Ink rendering:
if (command === 'mcp') {
  const { startMcpServer } = await import('./mcp/server.js');
  await startMcpServer();
  process.exit(0); // Don't render Ink
}
```

**Step 4: Add MCP resources**

Expose wallet state as readable resources:
- `wallet://address` — current receive address
- `wallet://balance` — ADA + native asset balances
- `wallet://stake` — delegation status and rewards

**Step 5: Claude Desktop config**

```json
{
  "mcpServers": {
    "begin": {
      "command": "begin",
      "args": ["mcp"],
      "env": {
        "BEGIN_CLI_MNEMONIC": "your mnemonic here",
        "BLOCKFROST_API_KEY": "your key"
      }
    }
  }
}
```

### Critical architecture requirement

Current commands mix Ink rendering with business logic. For MCP to work, we need to extract the core logic into pure functions that return data objects. Then:
- Ink components call the functions and render results
- MCP tools call the same functions and return JSON
- `--json` mode calls the functions and prints JSON

This refactor is the bottleneck. Without it, MCP tools would need to shell out to `begin` commands and parse output — fragile and slow.

### Estimated effort: 5-7 days (including the logic extraction refactor)

---

## 6. Skills System

### Current state

Begin already has two SKILL.md files:
- `skills/SKILL.md` — comprehensive, well-structured (the good one)
- `skill/SKILL.md` — shorter, slightly different format

### What to do

1. **Consolidate** — Pick one directory (`skills/`), delete the other
2. **Split into multiple files** matching MoonPay's pattern:

```
skills/
  begin-wallet/SKILL.md       — Wallet create, restore, balance, send, receive
  begin-staking/SKILL.md      — Delegate, pools, status, withdraw
  begin-swap/SKILL.md         — Minswap swaps, quotes, orders, cancel
  begin-mint/SKILL.md         — NMKR NFT minting
  begin-offline/SKILL.md      — Air-gapped signing workflow
  begin-mcp/SKILL.md          — MCP server setup (once built)
```

3. **Include in npm package** — Add to `package.json` files list:
```json
{ "files": ["dist", "skills"] }
```

4. **Follow MoonPay's format** — Each skill has: description, commands with examples, environment variables, workflow steps, related skills.

### Estimated effort: 2-3 days

---

## 7. Fiat Onramp — Onramper (Already Integrated)

Begin already uses **Onramper** in b58-extension (`src/views/exchange/onramper.tsx`). This is a meta-aggregator that routes through multiple providers (MoonPay, Transak, Ramp, etc.) — so we get broad coverage without integrating each provider separately.

### Current integration (b58-extension)
- API key: `pk_prod_01HETEQF46GSK6BS5JWKDF31BT`
- Supported: BTC, ADA (Cardano) — expandable
- Default fiat: EUR
- Customizable theme/branding

### CLI implementation plan

```bash
begin buy --amount 50 --currency EUR --token ADA
# → Generates Onramper checkout URL with wallet address pre-filled
# → Opens in browser (or prints URL for agents)
# → JSON mode returns { "url": "https://buy.onramper.com?..." }
```

The URL builder is straightforward — construct query params:
- `apiKey` — existing prod key
- `onlyCryptos` — token filter (ada_cardano, btc, sol)
- `defaultFiat` — user's currency
- `wallets` — pre-fill destination address
- Theme params for branding

Effort: ~1 week to port and add CLI command. No backend needed — it's a URL.

---

## 8. Architecture Recommendations

### A. Separate rendering from logic (CRITICAL)

This is the single most important change. Right now, Ink components in `src/commands/` contain business logic mixed with React rendering. For MCP, JSON output, and testing, we need:

```
CLI input → Command logic (pure functions returning data) → Output layer
                                                              ├→ Ink renderer (interactive terminal)
                                                              ├→ JSON formatter (--json flag)
                                                              └→ MCP tool response (begin mcp)
```

Suggested approach: create `src/core/` with pure functions, keep `src/commands/` as thin Ink wrappers.

### B. Chain abstraction layer

Begin Wallet mobile already has `IChainAdapter` for Cardano, Bitcoin, Solana. Extract and reuse:

```typescript
interface ChainProvider {
  getBalance(address: string): Promise<Balance>;
  send(params: SendParams): Promise<TxResult>;
  getHistory(address: string, opts?: PaginationOpts): Promise<Transaction[]>;
  estimateFee(params: SendParams): Promise<Fee>;
}
```

### C. Keep Ink as a differentiator

MoonPay's plain text is functional but dull. Begin's interactive Ink UI is genuinely better for humans. Don't abandon it — just make it one output layer, not the only path.

### D. Configuration improvements

Consider adding:
- Config file (`~/.config/begin/config.toml`) for defaults
- OS keychain integration for key storage (like MoonPay's AES-256-GCM + keychain)
- Chain selection (`--chain cardano|bitcoin|solana`) for future multi-chain

### E. Consolidate skill directories

Clean up the duplicate `skills/` vs `skill/` situation. Pick one, delete the other.

---

## Appendix: MoonPay CLI Technical Notes

- Built with Commander.js (plain text output, no interactive UI)
- Ships minified JS bundles (proprietary, not readable)
- MCP server uses `@modelcontextprotocol/sdk` over stdio
- Wallet encryption: BIP39 → AES-256-GCM → OS keychain (via keytar or similar)
- `wallet export` blocked in non-interactive mode (agent-safe)
- Multi-chain via unified swaps.xyz API layer
- x402 is a payment protocol for HTTP 402 responses — machine-to-machine micropayments
- 16 skill files covering: auth, wallet, swaps, bridges, buy, deposits, trading automation, price alerts, token discovery, block explorer, data export, MCP setup, virtual accounts, x402, feedback, missions (onboarding)
- Skills are the main way agents learn what the CLI can do — effectively documentation-as-API
