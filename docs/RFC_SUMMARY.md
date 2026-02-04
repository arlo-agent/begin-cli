# BEGIN-CLI RFC Summary

**RFC Status:** In Progress | **Author:** Arlo | **Updated:** 2025-02-04

> Comprehensive summary of the `begin-cli` project — a headless Cardano CLI wallet designed for AI agents.

---

## 📋 Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [Key Architectural Decisions](#2-key-architectural-decisions)
3. [Command Structure](#3-command-structure)
4. [Supported Chains & Features](#4-supported-chains--features)
5. [Dependencies & Tech Stack](#5-dependencies--tech-stack)
6. [Security Model](#6-security-model)
7. [Open Questions & TODOs](#7-open-questions--todos)
8. [Timeline & Phases](#8-timeline--phases)
9. [Items Needing Decision](#9-items-needing-decision-)

---

## 1. Vision & Goals

### Mission Statement

**"The first Cardano CLI wallet designed for AI agents"** — a headless, scriptable wallet that enables autonomous agents to interact with blockchain networks without human intervention.

### Core Goals

| Goal | Description |
|------|-------------|
| **Agent-First** | Zero prompts when `--yes` is set, all secrets via env vars |
| **Composable** | Clean exit codes, JSON output, pipe-friendly |
| **Secure** | Local-only cryptography, optional offline signing |
| **Progressive** | Human-readable by default, machine-parseable on demand |

### Target Users

1. **AI Agents** — Autonomous systems that need crypto access
2. **Power Users** — CLI-native developers who prefer terminal over GUIs
3. **Scripts & Automation** — CI/CD pipelines, monitoring, batch operations
4. **OpenClaw Skills** — Native integration with OpenClaw framework

### Non-Goals (v1)

- ❌ Browser extension features
- ❌ Mobile app
- ❌ DeFi integrations (staking, swaps) — beyond basic delegation
- ❌ Full node operation

---

## 2. Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Language** | TypeScript | Type safety, ecosystem, agent tooling compatibility |
| **CLI Framework** | Ink (React for CLI) | Composable components, interactive TUI when needed |
| **Argument Parsing** | Meow | Lightweight, TypeScript-friendly |
| **Cardano SDK** | @meshsdk/core | Comprehensive tx building, signing, well-maintained |
| **Key Generation** | BIP39 mnemonics | Industry standard, cross-wallet compatible |
| **API Provider** | Blockfrost | Free tier (50k req/day), reliable |
| **Output Modes** | JSON + Human-readable | `--json` for agents, readable for humans |
| **Key Storage** | File-based + Env vars | Persistent at `~/.begin-cli/`, ephemeral via `BEGIN_CLI_MNEMONIC` |

### Design Philosophy

```
┌─────────────────────────────────────────────────────────┐
│                     begin-cli                           │
├─────────────────────────────────────────────────────────┤
│  CLI Layer (meow args + Ink components)                │
├─────────────────────────────────────────────────────────┤
│  Command Handlers (balance, send, stake, etc.)          │
├─────────────────────────────────────────────────────────┤
│  Service Layer (Blockfrost API, Transaction Building)   │
├─────────────────────────────────────────────────────────┤
│  Core SDK (@meshsdk/core, bip39)                        │
└─────────────────────────────────────────────────────────┘
```

### Project Structure

```
begin-cli/
├── src/
│   ├── cli.tsx              # Entry point, meow argument parsing
│   ├── app.tsx              # Main component, command routing
│   ├── index.ts             # Library exports
│   ├── commands/
│   │   ├── cardano/
│   │   │   ├── balance.tsx  # Balance query component
│   │   │   └── send.tsx     # Send transaction component
│   │   ├── sign.tsx         # Transaction signing
│   │   └── submit.tsx       # Transaction submission
│   ├── lib/
│   │   └── transaction.ts   # Transaction building utilities
│   └── services/
│       └── blockfrost.ts    # Blockfrost API client
├── docs/
│   ├── RFC_SUMMARY.md       # This file
│   ├── CHAIN_ABSTRACTION_AUDIT.md
│   └── logo.svg
├── skills/                  # OpenClaw skill definitions
├── tests/                   # Vitest test files
├── package.json
├── tsconfig.json
└── README.md
```

---

## 3. Command Structure

### Global Flags

| Flag | Description |
|------|-------------|
| `--network, -n` | Network: `mainnet`, `preprod`, `preview` |
| `--json` | Output as JSON (for parsing) |
| `--yes, -y` | Skip confirmations (non-interactive) |
| `--wallet, -w` | Specify wallet name |
| `--help` | Show help |
| `--version` | Show version |

### ✅ Implemented Commands

```bash
# Balance queries
begin cardano balance <address> [--network <net>] [--json]

# Send ADA
begin cardano send <to> <amount> [--yes] [--json]

# Transaction workflow
begin sign <file> --output <signed>
begin submit <file>
```

### 🚧 In Progress

```bash
# Wallet management
begin wallet create <name>
begin wallet restore <name> --mnemonic "..."
begin wallet address [--qr]
begin wallet list
begin wallet export
```

### 📋 Planned Commands

```bash
# Offline signing workflow
begin send <to> <amount> --dry-run --output tx.unsigned
begin sign tx.unsigned --output tx.signed
begin submit tx.signed

# Staking
begin stake pools [--limit <n>]
begin stake delegate <pool>
begin stake status
begin stake withdraw --yes

# Token operations
begin send <to> <amount> --token <policyId.assetName>
begin send <to> <amount> --asset <policyId.assetName:quantity>

# History & UTXOs
begin history [--limit <n>]
begin utxos [address]

# Agent safety (future)
begin policy set --max-tx <amount>
begin policy set --daily-limit <amount>
begin policy allow|deny --address <addr>
```

---

## 4. Supported Chains & Features

### Chain Support Matrix

| Chain | Status | Phase | SDK/Library |
|-------|--------|-------|-------------|
| **Cardano** | ✅ Active | 1 | @meshsdk/core |
| **Bitcoin** | 📋 Planned | 4 | bitcoinjs-lib |
| **Solana** | 📋 Planned | 4 | @solana/web3.js |

### Cardano Feature Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| Balance checking (ADA) | ✅ Complete | Via Blockfrost |
| Native token balances | ✅ Complete | All CIP-25/CIP-68 tokens |
| Multi-network support | ✅ Complete | mainnet, preprod, preview |
| Wallet creation | 🚧 In Progress | BIP39 24-word |
| Wallet restoration | 🚧 In Progress | From mnemonic |
| Transaction signing | 🚧 In Progress | Local software signing |
| Transaction submission | 🚧 In Progress | Via Blockfrost |
| JSON output mode | 🚧 In Progress | `--json` flag |
| Non-interactive mode | 🚧 In Progress | `--yes` flag |
| QR code display | 📋 Planned | For addresses |
| UTXO listing | 📋 Planned | With asset breakdown |
| Transaction history | 📋 Planned | Via Blockfrost |
| Native token transfers | 📋 Planned | With policy IDs |
| Staking/delegation | 📋 Planned | Pool selection, withdraw |
| Offline signing | 📋 Planned | Air-gapped workflow |
| Hardware wallets | 📋 Future | Ledger, Trezor |
| Spending policies | 📋 Future | Limits, allowlists |

### API Providers

| Chain | Provider | Cost | Limits |
|-------|----------|------|--------|
| Cardano | Blockfrost | Free tier | 50k req/day |
| Bitcoin | Mempool.space | Free | No key needed |
| Bitcoin | Blockstream | Free | Open source |
| Solana | Helius | Free tier | TBD |

---

## 5. Dependencies & Tech Stack

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@meshsdk/core` | ^1.9.0-beta.98 | Cardano transaction building, signing |
| `bip39` | ^3.1.0 | Mnemonic generation & validation |
| `ink` | ^5.0.1 | React-based CLI framework |
| `ink-text-input` | ^6.0.0 | Interactive text input components |
| `meow` | ^13.2.0 | CLI argument parsing |
| `qrcode-terminal` | ^0.12.0 | QR code display for addresses |
| `react` | ^18.3.1 | UI component model |

### Development Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | ^5.6.3 | Type safety |
| `vitest` | ^3.0.0 | Testing framework |
| `@types/*` | Type definitions |

### Runtime Requirements

- **Node.js 18+** required
- No native dependencies (pure JS/TS)

### Future Integrations

| Integration | Purpose | Priority |
|-------------|---------|----------|
| HashiCorp Vault | Enterprise key storage | Medium |
| AWS KMS | Cloud key management | Medium |
| Ledger HID | Hardware wallet signing | High |
| Trezor | Hardware wallet signing | Medium |
| Keystone QR | Air-gapped signing | Low |

---

## 6. Security Model

### Key Management

| Method | Storage | Use Case |
|--------|---------|----------|
| **File-based** | `~/.begin-cli/wallets/` (AES-256-GCM encrypted) | Persistent wallets |
| **Environment** | `BEGIN_CLI_MNEMONIC` | Ephemeral/agent use |
| **Hardware** | Ledger/Trezor (future) | Maximum security |

### Security Layers

| Layer | Mechanism |
|-------|-----------|
| Key storage | AES-256-GCM encryption at rest |
| Key derivation | Argon2 (planned) |
| Network isolation | Offline signing workflow |
| Audit logging | All operations logged (planned) |
| Confirmation | Interactive confirm for large tx |

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BLOCKFROST_API_KEY` | Blockfrost project ID | Yes |
| `BEGIN_CLI_MNEMONIC` | 24-word recovery phrase | No (ephemeral mode) |
| `BEGIN_CLI_NETWORK` | Default network | No |
| `BEGIN_CLI_WALLET` | Default wallet name | No |
| `BEGIN_CLI_CONFIG` | Config file path | No |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Network error |
| 4 | Insufficient funds |
| 5 | Invalid address |
| 6 | Transaction rejected |
| 10 | Wallet not found |
| 11 | Wrong password |

---

## 7. Open Questions & TODOs

### ✅ Resolved Decisions

- ✅ **Language**: TypeScript (not Rust — ArkFinance/begin-cli has Rust prototype)
- ✅ **CLI Framework**: Ink with meow for argument parsing
- ✅ **Cardano SDK**: @meshsdk/core (not pallas or cardano-serialization-lib)
- ✅ **API Provider**: Blockfrost (free tier available)
- ✅ **Package name**: `@beginwallet/cli`

### 🟡 Active Open Questions

1. **Wallet encryption scheme**
   - Current plan: AES-256-GCM
   - Alternative: Argon2 for key derivation + AES?
   - **Needs input:** Security review

2. **Multi-chain architecture**
   - How to structure chain adapters?
   - Share code with begin-core/b58-extension?
   - **See:** CHAIN_ABSTRACTION_AUDIT.md

3. **Agent safety policies (v1 scope)**
   - Include spending limits per transaction?
   - Daily limits?
   - Address allowlists?
   - **Needs input:** MVP scope decision

4. **Hardware wallet priority**
   - Should Ledger support be in v1?
   - Estimated effort: 2-3 days
   - **Needs input:** Roadmap priority

### 📋 Implementation TODOs

**Phase 2 (Current):**
- [ ] Complete wallet create/restore commands
- [ ] Implement transaction signing
- [ ] Add `--json` output mode
- [ ] Add `--yes` non-interactive mode
- [ ] Write unit tests for core flows

**Phase 3:**
- [ ] Native token transfers
- [ ] Staking/delegation commands
- [ ] Transaction history
- [ ] UTXO listing
- [ ] QR code address display

**Phase 4:**
- [ ] Bitcoin support (bitcoinjs-lib)
- [ ] Solana support (@solana/web3.js)
- [ ] Chain adapter abstraction layer

**Phase 5:**
- [ ] Ledger/Trezor hardware wallet support
- [ ] HashiCorp Vault backend
- [ ] Spending policies
- [ ] Audit logging

---

## 8. Timeline & Phases

| Phase | Scope | Status | Est. Duration |
|-------|-------|--------|---------------|
| **1** | Cardano balance, Blockfrost integration | ✅ Complete | — |
| **2** | Wallet management, transaction signing | 🚧 In Progress | 1-2 weeks |
| **3** | Token transfers, staking, JSON output | 📋 Planned | 2 weeks |
| **4** | Bitcoin + Solana support | 📋 Future | 3-4 weeks |
| **5** | Hardware wallets, Vault, policies | 📋 Future | TBD |

### Estimated Effort (from Chain Abstraction Audit)

| Task | Days |
|------|------|
| Hardware wallet support | 2-3 |
| Bitcoin coin selection + fees | 1-2 |
| Chain adapter architecture | 3-5 |
| CLI Bitcoin commands | 2-3 |
| **Total (multi-chain)** | 8-13 |

---

## 9. Items Needing Decision 🚨

These items require Francis's input before proceeding:

### High Priority

1. **📦 Package Publishing**
   - Ready to publish `@beginwallet/cli` to npm?
   - Version strategy: 0.1.0 beta → 1.0.0?

2. **🔐 Hardware Wallet in v1**
   - Include Ledger support in v1.0?
   - Delays release by ~3 days
   - Significantly increases agent security

3. **⚠️ Agent Safety Policies Scope**
   - MVP: No policies (trust the agent)
   - v1: Basic spending limits
   - v1.x: Full policy engine
   - **Recommendation:** Defer to v1.x unless specific use case

### Medium Priority

4. **🔗 Multi-Chain Strategy**
   - Option A: Keep Cardano-only, defer Bitcoin/Solana indefinitely
   - Option B: Add Bitcoin in v1.x (reuse begin-core code)
   - Option C: Build unified chain adapter architecture
   - **See:** CHAIN_ABSTRACTION_AUDIT.md for details

5. **🏗️ Code Sharing with b58-extension**
   - Should begin-cli share chain adapters with b58-extension?
   - Monorepo approach vs. separate packages?

### Low Priority

6. **📊 Monetization Model**
   - Free tier + paid features?
   - Premium API keys?
   - Transaction fee model?

---

## TL;DR

**What:** Headless Cardano CLI wallet for AI agents  
**Why:** Agents need autonomous crypto access — no wallet exists for this  
**How:** Ink + TypeScript + @meshsdk/core  
**Status:** Balance queries ✅, wallet management 🚧  
**Chains:** Cardano now → Bitcoin & Solana later  
**Safety:** Offline signing, env vars for secrets, structured exit codes

---

## Related Documents

- [README.md](../README.md) — User-facing documentation
- [CHAIN_ABSTRACTION_AUDIT.md](./CHAIN_ABSTRACTION_AUDIT.md) — Multi-chain architecture analysis
- [ArkFinance/begin-cli RFC.md](https://github.com/ArkFinance/begin-cli/blob/main/RFC.md) — Original Rust prototype RFC

---

*Last updated: 2025-02-04*  
*Source repo: github.com/arlo-agent/begin-cli*
