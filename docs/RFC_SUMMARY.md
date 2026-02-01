# BEGIN-CLI RFC Summary

**RFC Status:** Draft | **Author:** Arlo | **Date:** 2025-01-31

> Quick reference for the `begin-cli` proposal — a headless crypto wallet for AI agents.

---

## 1. Key Architectural Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Framework** | Ink (React for CLI) | TypeScript, composable, can be interactive when needed |
| **Core Logic** | Reuse from `b58-extension` | Don't reinvent chain adapters, leverage existing work |
| **Key Storage** | Pluggable backends | Flexibility: start simple (file/env), scale to Vault/HSM |
| **Output** | JSON + human-readable | `--json` flag for machine parsing, readable defaults for humans |
| **Security** | Local policy enforcement | Spending limits, allowlists, audit logs — all enforced client-side |

**Architectural highlights:**
- Monorepo-friendly structure with clear separation (commands, core, keystore, policy)
- Chain adapters shared/symlinked from b58-extension
- Designed for both CLI invocation and programmatic import

---

## 2. Command Structure Proposed

### Wallet Setup
```bash
begin init [--chain <chain>] [--network <network>]
begin import --mnemonic "..."
begin export --format json
```

### Key Management
```bash
begin keys list|add|rotate
```

### Balances & Transactions
```bash
begin balance [--chain <chain>] [--json]
begin send --to <addr> --amount <n> --asset <token> [--fee-rate <n>]
begin sign --tx <file> --out <file>
begin broadcast --tx <file>
begin history [--limit <n>]
```

### Agent Safety Policies
```bash
begin policy set --max-tx <amount> <asset>
begin policy set --daily-limit <amount> <asset>
begin policy allow|deny --address <addr>
```

### Config & Status
```bash
begin status
begin config get|set
```

---

## 3. Authentication / Key Management

### v1 Backends
- **`file`** — Encrypted JSON at `~/.begin/keystore.json`
- **`env`** — Environment variables (`BEGIN_MNEMONIC`, `BEGIN_KEY`)

### Future Backends
- **`vault`** — HashiCorp Vault integration
- **`aws-kms`** — AWS KMS for key operations
- **`hardware`** — Ledger/Trezor via HID

### Security Layers
| Layer | Mechanism |
|-------|-----------|
| Key storage | Encrypted at rest, pluggable backends |
| Spending limits | Per-tx and daily caps, enforced locally |
| Allowlists | Only send to approved addresses |
| Audit log | All operations logged with timestamps |
| Confirmation | Optional interactive confirm for large tx |

---

## 4. Open Questions / TODOs

### Explicit Open Questions (from RFC)
1. **Repo structure** — Separate repo or monorepo with b58-extension?
2. **Package name** — `@aspect/begin-cli`? `begin-wallet-cli`?
3. **Initial chain priority** — Start with Cardano (most complete adapter)?
4. **Monetization** — Free tier + paid features? Transaction fees?

### Implicit TODOs (from rollout plan)
- Phase 1: Scaffold, chain adapters, Cardano `init`/`balance`/`send`, file keystore
- Phase 2: Bitcoin + Solana support, policies, JSON output, audit logging
- Phase 3: Programmatic API, OpenClaw skill, npm publish
- Phase 4: Vault backend, hardware wallet, rate limiting, testnet safety

### Non-Goals (v1)
- Browser extension features
- Mobile app
- DeFi integrations (staking, swaps)
- Full node operation

---

## 5. Dependencies & Tech Stack

### Core Stack
| Dependency | Purpose |
|------------|---------|
| **Ink** | React-like CLI framework (TypeScript) |
| **b58-extension core** | Chain adapters for BTC, ADA, SOL |
| **TypeScript** | Primary language |

### Chain Support (v1)
- **Cardano** — Primary, most complete adapter
- **Bitcoin** — Phase 2
- **Solana** — Phase 2

### Future Integrations
- HashiCorp Vault
- AWS KMS
- Ledger/Trezor HID

### References
- [Ink framework](https://github.com/vadimdemedes/ink)
- b58-extension chain adapters (`./src/core/chains/`)
- CHAIN_ABSTRACTION_STATUS.md in b58-extension

---

## Timeline Estimate

| Phase | Scope | Duration |
|-------|-------|----------|
| 1 | Foundation (Cardano CLI) | Week 1-2 |
| 2 | Multi-chain + Policy | Week 3-4 |
| 3 | Agent Integration | Week 5-6 |
| 4 | Production Hardening | TBD |

---

## TL;DR

**What:** Headless CLI wallet for AI agents using Begin's chain abstraction layer  
**Why:** Agents need autonomous crypto access — no wallet exists for this  
**How:** Ink + TypeScript, reuse b58-extension adapters, pluggable key storage  
**Chains:** Cardano → Bitcoin → Solana  
**Safety:** Spending limits, allowlists, audit logs, multiple key backends

*Source: `b58-extension/docs/BEGIN_CLI_RFC.md`*
