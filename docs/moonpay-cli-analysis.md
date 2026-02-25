# MoonPay CLI vs Begin CLI: Competitive Analysis & Roadmap

**Date:** 2025-02-24
**Author:** Arlo (automated analysis)
**Status:** Draft for review

---

## 1. Executive Summary

MoonPay shipped a CLI (`@moonpay/cli`, v0.6.24) that turns a terminal into a full crypto banking interface — wallets, fiat on/off ramp, swaps, bridges, trading automation, and an MCP server for AI agent integration. It supports 9 chains and positions itself as the default wallet for AI agents and developers.

This matters for Begin because:

- **MoonPay validated the CLI-as-wallet thesis.** A major fintech company bet real engineering on terminal-native crypto. The market is real.
- **AI agent integration is the land grab.** MoonPay's MCP server and Skills system mean Claude Desktop users can manage crypto through natural language. Begin needs parity here or risks irrelevance in the agent economy.
- **Begin has advantages MoonPay can't easily replicate** — open source, Ink-based rich UI, deep Cardano DeFi (staking, governance, Minswap), and offline signing. The gap is in breadth, not depth.

The recommendation: ship an MCP server and Skills system within weeks (low effort, high leverage), then layer on multi-chain and fiat onramp over the next quarter.

---

## 2. Feature Comparison

| Feature | MoonPay CLI | Begin CLI | Gap |
|---|---|---|---|
| **Chains** | 9 (SOL, ETH, BTC, Base, Polygon, etc.) | 1 (Cardano) | Large |
| **Wallet creation** | BIP39, AES-256-GCM, OS keychain | BIP39, password-encrypted keystore | Comparable |
| **Auth** | Email + OTP | Mnemonic env var / keystore | Different models |
| **Fiat on/off ramp** | Virtual bank accounts, Apple Pay, Venmo, PayPal | None | Large |
| **Token swaps** | Multi-chain via swaps.xyz | Cardano via Minswap aggregator | Begin deeper on Cardano |
| **Cross-chain bridges** | Yes (swaps.xyz) | None | Large |
| **Staking** | None visible | Full delegation, pool search, rewards | Begin ahead |
| **Governance** | None | Cardano governance support | Begin ahead |
| **Trading automation** | DCA, limit orders, stop losses (OS cron) | None | Large |
| **Token discovery** | Trending, market data, risk scores | None | Medium |
| **MCP server** | `mp mcp` built-in | None | Critical gap |
| **Skills system** | SKILL.md in npm package | None | Critical gap |
| **Offline signing** | None visible | Full air-gapped workflow | Begin ahead |
| **Output formats** | `--format compact` (JSON), `--format table` | `--json` flag | Comparable |
| **Terminal UI** | Plain text | Ink 5 + React components | Begin ahead |
| **Deposit links** | Auto-convert to stablecoins | None | Medium |
| **Portfolio export** | CSV/JSON | None | Small |
| **Price alerts** | Yes | None | Small |
| **x402 payments** | Machine-to-machine payments | None | Medium |
| **Open source** | No (minified bundles) | Yes | Begin ahead |
| **CI/Agent support** | Email OTP (agent-capable) | `BEGIN_CLI_MNEMONIC` env var | Both work |
| **QR codes** | None visible | Receive addresses with QR | Begin ahead |

---

## 3. Priority Improvements

### P0 — Do Now (1-3 weeks each)

**MCP Server (`begin mcp`)**
- Effort: ~1 week
- Impact: Unlocks AI agent integration, Claude Desktop/Code compatibility
- Why now: Low hanging fruit. The protocol is standardized, SDKs exist. Every day without this is a day agents can't use Begin.

**Skills System (SKILL.md)**
- Effort: ~2 days
- Impact: AI agents discover Begin's capabilities automatically
- Why now: Literally just shipping markdown files in the npm package. No code changes to core.

**Multi-chain architecture prep**
- Effort: ~2 weeks (refactor only, no new chains yet)
- Impact: Unblocks everything else
- Why now: Begin Wallet mobile already supports Bitcoin and Solana. The chain logic exists — it needs to be extracted and made available to the CLI.

### P1 — Next Quarter

**Fiat onramp integration**
- Effort: 2-4 weeks depending on provider
- Impact: High — this is what makes a wallet sticky for normies and agents alike
- Options: MoonPay API (ironic but practical), Transak, Ramp Network, or Begin's own if available

**Token discovery & market data**
- Effort: 2-3 weeks
- Impact: Medium-high — agents need to research before trading
- Sources: CoinGecko API, DeFi Llama, chain-specific APIs

**Multi-chain: Bitcoin + Solana**
- Effort: 4-6 weeks (after architecture prep)
- Impact: High — matches mobile app parity

### P2 — Later

**Trading automation (DCA, limit orders)**
- Effort: 3-4 weeks
- Impact: Medium — power user feature, good for agents
- Approach: OS cron like MoonPay, or a lightweight daemon

**Price alerts**
- Effort: 1-2 weeks
- Impact: Low-medium
- Approach: Polling + OS notifications or webhook

**Deposit links**
- Effort: 2-3 weeks
- Impact: Medium — requires backend service for link generation

**Cross-chain bridges**
- Effort: 3-4 weeks
- Impact: Medium — depends on multi-chain shipping first
- Approach: Integrate an aggregator (LI.FI, Socket, etc.)

**Portfolio export (CSV/JSON)**
- Effort: 3-5 days
- Impact: Low — nice to have for tax and reporting

---

## 4. MCP Server Implementation Plan

### What MoonPay does

`mp mcp` starts a stdio-based MCP server that exposes wallet operations as tools. Claude Desktop connects to it via `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "moonpay": {
      "command": "mp",
      "args": ["mcp"]
    }
  }
}
```

### How to build `begin mcp`

**Step 1: Add the `@modelcontextprotocol/sdk` dependency**

```bash
npm install @modelcontextprotocol/sdk
```

**Step 2: Create `src/commands/mcp.ts`**

The MCP server should expose these tools (matching existing CLI commands):

| MCP Tool | Maps to |
|---|---|
| `wallet_balance` | `begin balance` |
| `wallet_send` | `begin send` |
| `wallet_receive` | `begin receive` |
| `wallet_history` | `begin history` |
| `stake_delegate` | `begin stake delegate` |
| `stake_withdraw` | `begin stake withdraw-rewards` |
| `swap_execute` | `begin swap` |
| `utxos_list` | `begin utxos` |

Each tool returns JSON. No Ink rendering — MCP is pure data.

**Step 3: Wire it into the CLI entry point**

Since begin-cli uses meow + Ink, the `mcp` subcommand should bypass Ink entirely and start the MCP stdio server directly:

```typescript
// In the main CLI router, before Ink rendering:
if (subcommand === 'mcp') {
  const { startMcpServer } = await import('./mcp/server.js');
  await startMcpServer();
  // Don't render any Ink components
  return;
}
```

**Step 4: Add resources**

Expose wallet address and balance as MCP resources so agents can read state without calling tools:

- `wallet://address` — current receive address
- `wallet://balance` — ADA + native asset balances
- `wallet://stake` — delegation status and rewards

**Step 5: Test with Claude Desktop**

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "begin": {
      "command": "begin",
      "args": ["mcp"],
      "env": {
        "BEGIN_CLI_MNEMONIC": "your mnemonic here"
      }
    }
  }
}
```

### Estimated effort: 5-7 days

The wallet logic already exists. This is a new transport layer, not new functionality.

---

## 5. Skills System

### What MoonPay does

MoonPay ships `SKILL.md` files inside the npm package (under `dist/skills/`). These are markdown files that describe capabilities in a format AI agents can parse. When an agent has filesystem access, it reads these files to understand what the CLI can do.

### How Begin should do it

**Create `skills/` directory in the package root:**

```
skills/
  WALLET.md        — Create, restore, check balance, send, receive
  STAKING.md       — Delegate, search pools, withdraw rewards
  SWAP.md          — Token swaps via Minswap
  DEFI.md          — Cardano DeFi overview and capabilities
  OFFLINE.md       — Air-gapped signing workflow
```

**Each file follows a standard structure:**

```markdown
# Skill: Wallet Management

## Commands
- `begin balance` — Check ADA and native asset balances
- `begin send --to <addr> --amount <ada>` — Send ADA
- `begin send --to <addr> --asset <unit> --amount <n>` — Send native assets
- `begin receive` — Show receive address with QR code
- `begin history` — Transaction history

## JSON Mode
Add `--json` to any command for machine-readable output.

## Environment
- `BEGIN_CLI_MNEMONIC` — Set mnemonic for non-interactive use
- `BLOCKFROST_API_KEY` — Custom Blockfrost key

## Examples
...
```

**Add to `package.json` files list:**

```json
{
  "files": ["dist", "skills"]
}
```

### Estimated effort: 2 days

Writing documentation. No code changes needed except including the directory in the published package.

---

## 6. Fiat Onramp Options

### Option A: MoonPay API

- Pros: Battle-tested, wide payment method support, handles compliance
- Cons: Revenue share model, dependency on a competitor, rate limits
- Integration: REST API, webhook for completion, or embed their widget URL

### Option B: Transak

- Pros: Good Cardano support, widget and API modes, competitive rates
- Cons: Smaller coverage than MoonPay
- Integration: Similar to MoonPay — API or widget URL

### Option C: Ramp Network

- Pros: Strong European coverage, good developer experience
- Cons: Less US coverage
- Integration: SDK or hosted widget

### Option D: Build on Begin's existing infrastructure

- Pros: Full control, no revenue share, brand consistency
- Cons: Compliance complexity (MSB licensing, KYC/AML), long timeline
- Feasibility: Only if Begin Wallet already has the licensing and partnerships

### Recommendation

Start with **Transak** for Cardano-specific onramp (they have good ADA support). Add MoonPay as a second provider for broader chain coverage when multi-chain ships. Building in-house only makes sense if Begin already has the compliance infrastructure from the mobile app.

For CLI integration, the pattern is:

1. `begin buy --amount 50 --currency USD` generates a payment URL
2. Opens in browser (or prints URL for agents)
3. Webhook / polling confirms completion
4. CLI shows updated balance

---

## 7. Architecture Recommendations

### Current state

Begin CLI uses Ink 5 + React for rendering and meow for argument parsing. All chain logic is Cardano-specific, tightly coupled to Blockfrost and MeshSDK.

### What needs to change

**A. Chain abstraction layer**

Create an interface that all chain implementations conform to:

```typescript
interface ChainProvider {
  getBalance(address: string): Promise<Balance>;
  send(params: SendParams): Promise<TxHash>;
  getHistory(address: string, opts?: HistoryOpts): Promise<Transaction[]>;
  estimateFee(params: SendParams): Promise<Fee>;
}
```

Cardano becomes one implementation. Bitcoin and Solana follow the same interface. The CLI commands stay chain-agnostic — they call the provider, not the chain directly.

Begin Wallet mobile reportedly already has multi-chain — extract and reuse that logic if possible.

**B. Separate rendering from logic**

Right now, Ink components likely contain business logic. For MCP support (and testing), the pattern should be:

```
CLI input → Command logic (pure functions) → Output
                                               ├→ Ink renderer (interactive)
                                               ├→ JSON formatter (--json)
                                               └→ MCP tool response
```

This separation is the single most important architectural change. It unblocks MCP, testing, and any future transport (REST API, SDK, etc.).

**C. Keep Ink as a differentiator**

MoonPay's plain text output is functional but boring. Begin's Ink UI is genuinely better for interactive use. Don't abandon it — just make sure it's one rendering layer among several, not the only path.

**D. Configuration management**

Currently: password-encrypted keystore + env vars.

Consider adding:
- Config file (`~/.config/begin/config.toml`) for defaults (network, preferred DEX, default chain)
- OS keychain integration for key material (like MoonPay does with AES-256-GCM + keychain)
- Multiple wallet profiles

**E. Plugin architecture (longer term)**

MoonPay's skills system hints at a plugin model. Begin could go further — allow community plugins for new chains, DEXes, or data sources. The chain abstraction layer is the foundation for this.

---

## Appendix: MoonPay CLI Technical Notes

- Built with Commander.js (not Ink — plain text output)
- Ships minified JS bundles (proprietary, not inspectable)
- MCP server uses `@modelcontextprotocol/sdk` over stdio
- Trading automation uses `node-cron` or OS-level cron jobs
- Auth flow: email → OTP code → JWT → stored locally
- Wallet encryption: BIP39 mnemonic → AES-256-GCM → OS keychain (via `keytar` or similar)
- Multi-chain via unified API layer (swaps.xyz for DEX aggregation)
- `x402` is a payment protocol for HTTP 402 responses — machine-to-machine micropayments
