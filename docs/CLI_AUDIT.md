# Begin CLI Consistency Audit

**Date:** 2026-02-02  
**Auditor:** Arlo (automated review)

## Executive Summary

This document provides a comprehensive review of the Begin CLI codebase to identify inconsistencies and propose standardization. The audit covers command flags, naming conventions, input flexibility, UX patterns, and code patterns.

### Key Findings

- ✅ **Good:** Consistent `--wallet`, `--network`, `--password` naming across commands that use them
- ✅ **Good:** Password masking uses `mask="*"` consistently
- ❌ **Critical:** Stake commands (`delegate`, `status`, `withdraw`) lack wallet integration
- ❌ **Major:** `cardano balance` missing `--json` output
- ❌ **Major:** `--yes` flag missing from stake confirmation flows
- ⚠️ **Minor:** Inconsistent JSON prop naming (`json` vs `jsonOutput`)
- ⚠️ **Minor:** Mixed exit patterns (`process.exit()` vs `useApp().exit()`)

---

## 1. Current State Matrix

### Command Flag Support

| Command | `--network` | `--wallet` | `--password` | `--json` | `--yes` | `--dry-run` | Other |
|---------|:-----------:|:----------:|:------------:|:--------:|:-------:|:-----------:|-------|
| `cardano balance` | ✅ | ❌ | ❌ | ❌ | N/A | N/A | `<address>` positional |
| `cardano send` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | `--asset`, `--output` |
| `sign` | ✅ | ✅ | ✅ | ✅ | N/A | N/A | `--output` |
| `submit` | ✅ | N/A | N/A | ✅ | N/A | N/A | `--wait/--no-wait` |
| `stake pools` | ✅ | N/A | N/A | ✅ | N/A | N/A | `[search]` positional |
| `stake delegate` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | Missing wallet support |
| `stake status` | ✅ | ❌ | ❌ | ✅ | N/A | N/A | Missing wallet support |
| `stake withdraw` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | Missing wallet support |
| `wallet address` | ✅ | ✅ | ✅ | ✅ | N/A | N/A | `--full` |
| `swap` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | `--from`, `--to`, `--amount`, `--slippage`, `--multi-hop` |
| `swap quote` | ✅ | N/A | N/A | ✅ | N/A | N/A | `--from`, `--to`, `--amount`, `--slippage`, `--multi-hop` |

### Legend
- ✅ = Supported
- ❌ = Not supported (but should be)
- N/A = Not applicable for this command

---

## 2. Inconsistencies Found

### 2.1 Critical Issues

#### **ISSUE-001: Stake commands lack wallet integration**
**Severity:** Critical  
**Affected:** `stake delegate`, `stake status`, `stake withdraw`

These commands use a hardcoded mock stake address:
```typescript
const effectiveStakeAddress = stakeAddress || 'stake1uy4s2fc8qjzqchpjxh6yjzgx3ckg4zhfz8rpvj0l0wvtqgsxhfr8c';
```

They don't accept `--wallet` or `--password` flags, making them unusable with real wallets.

**Impact:** Users cannot perform staking operations with their actual wallets.

---

### 2.2 Major Issues

#### **ISSUE-002: `cardano balance` missing `--json` output**
**Severity:** Major  
**Affected:** `cardano balance`

Every other data-outputting command supports `--json` for scripting/automation, except `cardano balance`.

**Current code:**
```typescript
// CardanoBalance component has no json prop or JSON output path
```

**Impact:** Cannot use balance checks in scripts/CI pipelines.

---

#### **ISSUE-003: `--yes` flag missing from stake commands**
**Severity:** Major  
**Affected:** `stake delegate`, `stake withdraw`

Both commands have interactive confirmation prompts (Y/N) but no `--yes` flag to skip them.

**Current (stake delegate):**
```typescript
useInput((input, key) => {
  if (input === 'y' || input === 'Y') { /* proceed */ }
  else if (input === 'n' || input === 'N' || key.escape) { /* cancel */ }
});
```

**Impact:** Cannot automate staking operations.

---

#### **ISSUE-004: `--yes` flag missing from `cardano send`**
**Severity:** Major  
**Affected:** `cardano send`

Same pattern as above—has confirmation but no skip flag.

**Impact:** Cannot fully automate send operations (env mnemonic helps but still prompts).

---

### 2.3 Minor Issues

#### **ISSUE-005: Inconsistent JSON prop naming**
**Severity:** Minor  
**Affected:** Multiple components

Some components use `jsonOutput`:
```typescript
// CardanoSend, Sign, Submit
jsonOutput?: boolean;
```

Others use `json`:
```typescript
// StakePools, StakeDelegate, StakeStatus, StakeWithdraw, SwapQuote
json: boolean;
```

---

#### **ISSUE-006: Inconsistent exit handling**
**Severity:** Minor  
**Affected:** Multiple components

Some components use `process.exit()`:
```typescript
// StakePools, StakeDelegate, StakeStatus, StakeWithdraw
process.exit(0);
process.exit(1);
```

Others properly use ink's `useApp().exit()`:
```typescript
// CardanoSend, Sign, Submit, Swap
const { exit } = useApp();
setTimeout(() => exit(), 1000);
```

Using `process.exit()` bypasses ink's cleanup, potentially causing output issues.

---

#### **ISSUE-007: Hidden `--limit` for `stake pools`**
**Severity:** Minor  
**Affected:** `stake pools`

The component accepts a `limit` prop but it's not exposed as a CLI flag:
```typescript
interface StakePoolsProps {
  search?: string;
  network: string;
  json: boolean;
  limit?: number;  // Not exposed in CLI!
}
```

---

#### **ISSUE-008: No `--address` alternative input**
**Severity:** Minor  
**Affected:** `stake status`, potentially `cardano balance`

For read-only operations, users might want to check any address (not just their wallet's). Currently no flag for this.

---

## 3. Proposed Standard

### 3.1 Flag Naming Standards

| Flag | Short | Type | Description | When to use |
|------|-------|------|-------------|-------------|
| `--network` | `-n` | string | Network (mainnet/preprod/preview) | All commands |
| `--wallet` | `-w` | string | Wallet name from keystore | Commands needing signing |
| `--password` | `-p` | string | Wallet password | Commands needing signing |
| `--json` | `-j` | boolean | Output as JSON | Commands with output |
| `--yes` | `-y` | boolean | Skip confirmation | Commands with prompts |
| `--dry-run` | `-d` | boolean | Build but don't submit | Transaction commands |
| `--output` | `-o` | string | Output file path | Transaction file commands |
| `--address` | `-a` | string | Raw address for read ops | Read-only commands |

### 3.2 Prop Naming Standards

```typescript
// Standard interface pattern
interface CommandProps {
  // Network config
  network: string;
  
  // Wallet (when signing needed)
  walletName?: string;  // Not 'wallet' - avoid collision
  password?: string;
  
  // Output options
  json?: boolean;       // Not 'jsonOutput'
  
  // Confirmation
  yes?: boolean;        // Skip interactive confirmation
  
  // Transaction options
  dryRun?: boolean;
  outputFile?: string;  // Not 'output'
}
```

### 3.3 Exit Pattern Standard

Always use ink's `useApp()` for exits:
```typescript
const { exit } = useApp();

// For errors
setState('error');
setTimeout(() => exit(), 1500);

// For success
setState('success');
setTimeout(() => exit(), 1000);

// For cancellation
setState('cancelled');
setTimeout(() => exit(), 500);
```

### 3.4 JSON Output Standard

```typescript
// Success output
{
  "status": "success",
  "data": { /* command-specific */ },
  "network": "mainnet"
}

// Error output
{
  "status": "error",
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### 3.5 Confirmation Flow Standard

```typescript
// All confirmation prompts should:
// 1. Support --yes flag to skip
// 2. Use consistent Y/N format
// 3. Handle escape key

interface ConfirmableProps {
  yes?: boolean;  // Skip confirmation
}

// In component
if (yes) {
  executeAction();
} else {
  setState('confirm');
}

useInput((input, key) => {
  if (state !== 'confirm') return;
  if (input === 'y' || input === 'Y') executeAction();
  else if (input === 'n' || input === 'N' || key.escape) {
    setState('cancelled');
    setTimeout(() => exit(), 500);
  }
});
```

---

## 4. Task Breakdown

### Phase 1: Critical Fixes (High Priority)

#### PR-001: Add wallet integration to stake commands
**Files:** 
- `src/commands/stake/delegate.tsx`
- `src/commands/stake/status.tsx`
- `src/commands/stake/withdraw.tsx`
- `src/app.tsx` (pass wallet/password flags)

**Changes:**
1. Add `walletName` and `password` props
2. Use `checkWalletAvailability()` pattern from other commands
3. Derive stake address from wallet
4. Add password prompt for file-based wallets

**Estimate:** Medium (3-4 hours)

---

### Phase 2: Major Fixes (Medium Priority)

#### PR-002: Add `--json` to `cardano balance`
**Files:**
- `src/commands/cardano/balance.tsx`
- `src/app.tsx`

**Changes:**
1. Add `json` prop to `CardanoBalance`
2. Add JSON output path
3. Pass `flags.json` in app.tsx

**Estimate:** Small (1 hour)

---

#### PR-003: Add `--yes` flag to stake commands
**Files:**
- `src/commands/stake/delegate.tsx`
- `src/commands/stake/withdraw.tsx`
- `src/app.tsx`

**Changes:**
1. Add `yes` prop
2. Skip confirmation when `yes=true`
3. Pass `flags.yes` in app.tsx

**Estimate:** Small (1 hour)

---

#### PR-004: Add `--yes` flag to `cardano send`
**Files:**
- `src/commands/cardano/send.tsx`
- `src/app.tsx`

**Changes:**
1. Add `yes` prop
2. Skip confirmation when `yes=true`
3. Pass `flags.yes` in app.tsx

**Estimate:** Small (1 hour)

---

### Phase 3: Minor Fixes (Low Priority)

#### PR-005: Standardize JSON prop naming
**Files:** All command components

**Changes:**
1. Rename `jsonOutput` to `json` in:
   - `CardanoSend`
   - `Sign`
   - `Submit`
2. Update all references

**Estimate:** Small (30 min)

---

#### PR-006: Standardize exit handling
**Files:**
- `src/commands/stake/pools.tsx`
- `src/commands/stake/delegate.tsx`
- `src/commands/stake/status.tsx`
- `src/commands/stake/withdraw.tsx`

**Changes:**
1. Replace `process.exit()` with `useApp().exit()`
2. Add proper exit delays

**Estimate:** Small (1 hour)

---

#### PR-007: Expose `--limit` flag for `stake pools`
**Files:**
- `src/cli.tsx`
- `src/app.tsx`
- `src/commands/stake/pools.tsx`

**Changes:**
1. Add `limit` flag to CLI definition
2. Pass to `StakePools` component

**Estimate:** Small (30 min)

---

#### PR-008: Add `--address` flag for read operations
**Files:**
- `src/cli.tsx`
- `src/app.tsx`
- `src/commands/stake/status.tsx`
- `src/commands/cardano/balance.tsx` (refactor to use flag)

**Changes:**
1. Add `address` flag
2. Allow checking status of any stake address
3. Refactor balance to use `--address` flag

**Estimate:** Small (1 hour)

---

## 5. Implementation Priority Matrix

| PR | Issue | Priority | Effort | Impact |
|----|-------|----------|--------|--------|
| PR-001 | ISSUE-001 | 🔴 Critical | Medium | High - Enables core functionality |
| PR-002 | ISSUE-002 | 🟠 Major | Small | Medium - Scripting support |
| PR-003 | ISSUE-003 | 🟠 Major | Small | Medium - Automation support |
| PR-004 | ISSUE-004 | 🟠 Major | Small | Medium - Automation support |
| PR-005 | ISSUE-005 | 🟡 Minor | Small | Low - Code consistency |
| PR-006 | ISSUE-006 | 🟡 Minor | Small | Low - Proper cleanup |
| PR-007 | ISSUE-007 | 🟢 Low | Small | Low - Nice to have |
| PR-008 | ISSUE-008 | 🟢 Low | Small | Low - Nice to have |

---

## 6. Recommended Merge Order

1. **PR-001** - Stake wallet integration (unlocks core functionality)
2. **PR-002** - Balance JSON output (quick win)
3. **PR-003 + PR-004** - Yes flags (can combine into one PR)
4. **PR-005** - JSON prop naming standardization
5. **PR-006** - Exit handling standardization
6. **PR-007 + PR-008** - Additional flags (can combine)

---

## 7. Code Quality Notes

### Positive Patterns (Keep These)

1. **Consistent wallet loading pattern** via `checkWalletAvailability()` and `loadWallet()`
2. **Environment variable override** (`BEGIN_CLI_MNEMONIC`) for CI
3. **Password masking** with `mask="*"` in TextInput
4. **State machine pattern** for multi-step flows (e.g., `checking → loading → confirm → building → signing → submitting → success`)
5. **Error handling** with user-friendly messages

### Patterns to Improve

1. **Duplicate wallet checking logic** - Stake commands should reuse `checkWalletAvailability()`
2. **Mock data everywhere** - Consider centralizing mock generation
3. **Direct console.log for JSON** - Consider a utility function for consistent JSON output

---

## Appendix A: File Inventory

```
src/
├── commands/
│   ├── cardano/
│   │   ├── balance.tsx      # Check ADA balance
│   │   └── send.tsx         # Send ADA/tokens
│   ├── stake/
│   │   ├── delegate.tsx     # Delegate to pool
│   │   ├── pools.tsx        # List/search pools
│   │   ├── status.tsx       # Check delegation status
│   │   └── withdraw.tsx     # Withdraw rewards
│   ├── swap/
│   │   ├── index.tsx        # Execute swap
│   │   └── quote.tsx        # Get swap quote
│   ├── wallet/
│   │   └── address.tsx      # Show wallet addresses
│   ├── sign.tsx             # Sign transactions
│   └── submit.tsx           # Submit transactions
├── lib/
│   ├── address.ts           # Address derivation
│   ├── keystore.ts          # Wallet encryption/storage
│   ├── staking.ts           # Staking utilities
│   ├── swap.ts              # Swap utilities
│   └── transaction.ts       # Transaction building
├── services/
│   ├── blockfrost.ts        # Blockfrost API client
│   └── minswap.ts           # Minswap API client
├── app.tsx                  # Command router
└── cli.tsx                  # CLI entry point & flag definitions
```

---

## Appendix B: Flag Definition Reference

Current `cli.tsx` flag definitions:
```typescript
flags: {
  network: { type: 'string', shortFlag: 'n', default: 'mainnet' },
  wallet: { type: 'string', shortFlag: 'w' },
  password: { type: 'string', shortFlag: 'p' },
  dryRun: { type: 'boolean', shortFlag: 'd', default: false },
  output: { type: 'string', shortFlag: 'o' },
  json: { type: 'boolean', shortFlag: 'j', default: false },
  wait: { type: 'boolean', default: true },
  asset: { type: 'string', shortFlag: 'a', isMultiple: true },
  full: { type: 'boolean', default: false },
  // Swap-specific
  from: { type: 'string' },
  to: { type: 'string' },
  amount: { type: 'string' },
  slippage: { type: 'number', shortFlag: 's', default: 0.5 },
  multiHop: { type: 'boolean', default: true },
  yes: { type: 'boolean', shortFlag: 'y', default: false },
}
```

Proposed additions:
```typescript
// For stake pools
limit: { type: 'number', shortFlag: 'l', default: 10 },

// For read operations on any address
address: { type: 'string', shortFlag: 'a' }, // Note: conflicts with asset
// Consider: stakeAddress for stake commands specifically
stakeAddress: { type: 'string' },
```
