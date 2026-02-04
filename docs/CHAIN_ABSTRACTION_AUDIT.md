# Chain Abstraction Feature Parity Audit

**Date:** February 3, 2026  
**Author:** Arlo (automated audit)  
**Scope:** Begin Wallet codebase (begin-core, begin-cli, b58-extension)

---

## Executive Summary

This audit examines feature parity between the old chain-specific implementations (Cardano/Bitcoin) and identifies gaps in the chain abstraction architecture across the Begin Wallet ecosystem. The codebase currently uses a **mixed approach** rather than a unified chain adapter pattern.

### Key Findings

| Area | Cardano | Bitcoin | Gap Analysis |
|------|---------|---------|--------------|
| **Transaction Building** | ✅ Complete | ⚠️ Basic | Bitcoin lacks multi-asset support |
| **Hardware Wallet** | ✅ Ledger + Keystone | ❌ None | No HW support for BTC |
| **Fee Estimation** | ✅ Protocol parameters | ⚠️ Static/API | BTC uses fixed fees |
| **UTXO Management** | ✅ CIP-2 selection | ⚠️ Sequential | BTC lacks coin selection |
| **Staking** | ✅ Full delegation | N/A | N/A for Bitcoin |
| **Multi-chain Adapter** | ❌ None | ❌ None | No abstraction layer |

---

## 1. Current Architecture Analysis

### 1.1 begin-core (Cryptographic SDK)

**Location:** `/home/ubuntu/repos/begin-core/src/`

The core SDK uses a **Base class pattern** that accepts chain-specific libraries at construction time:

```typescript
// core/base.ts
class Base {
    Cardano: CardanoType;
    Message: MessageType | undefined;
    Bitcoin: BitcoinJsType | undefined;
    
    constructor(_Cardano: CardanoType, _Message?: MessageType, _Bitcoin?: BitcoinJsType) {
        this.Cardano = _Cardano;
        this.Message = _Message;
        this.Bitcoin = _Bitcoin;
    }
}
```

**Issue:** This is not a true chain adapter pattern—it's dependency injection of chain libraries. Each chain still requires completely separate implementations.

### 1.2 Chain-Specific Implementations

#### Cardano Implementation (Complete)

| File | Purpose | Status |
|------|---------|--------|
| `core/account.ts` | Account derivation (BIP39/CIP-1852) | ✅ Complete |
| `core/address.ts` | Address validation, extraction | ✅ Complete |
| `core/transaction.ts` | Tx building, signing, delegation | ✅ Complete |
| `core/keystonehq.ts` | Keystone HW wallet integration | ✅ Complete |

**Features:**
- Full transaction building with CML
- Stake delegation, withdrawal, deregistration
- Message signing (CIP-30)
- Hardware wallet support (Ledger, Keystone)
- Multi-asset handling
- Plutus/script support foundations

#### Bitcoin Implementation (Partial)

| File | Purpose | Status |
|------|---------|--------|
| `core/chain/bitcoin/account.ts` | Account creation | ⚠️ Basic |
| `core/chain/bitcoin/transaction.ts` | Tx building | ⚠️ Basic |

**Implemented Features:**
- SegWit address derivation (P2WPKH via BIP49)
- Taproot/Ordinals address derivation (P2TR via BIP86)
- Basic PSBT transaction building
- WIF encryption/decryption
- Dogecoin network support

**Missing Features:**
- ❌ Hardware wallet signing
- ❌ Advanced coin selection algorithms
- ❌ Replace-by-fee (RBF) management
- ❌ Multi-sig support
- ❌ OP_RETURN data embedding beyond Runes
- ❌ Fee estimation from mempool
- ❌ Batch transactions

---

## 2. begin-cli Analysis

**Location:** `/home/ubuntu/repos/begin-cli/src/`

The CLI is **Cardano-only** and uses MeshJS for transaction building.

### 2.1 Feature Coverage

| Feature | Implementation | Notes |
|---------|---------------|-------|
| Wallet Create/Restore | ✅ Complete | BIP39 24-word, encrypted storage |
| Balance Query | ✅ Complete | Blockfrost provider |
| Send ADA | ✅ Complete | With multi-asset support |
| UTXO Listing | ✅ Complete | With asset breakdown |
| Staking | ✅ Complete | Delegate, withdraw, pools |
| Transaction History | ✅ Complete | Via Blockfrost |
| Offline Signing | ✅ Complete | Sign/submit workflow |

### 2.2 Missing Bitcoin Support

The CLI has **zero Bitcoin functionality**:
- No `begin bitcoin balance`
- No `begin bitcoin send`
- No BTC wallet management
- No BTC transaction history

### 2.3 Chain Abstraction Status

The CLI uses MeshJS which is Cardano-specific. There is no abstraction layer:

```typescript
// lib/transaction.ts
import { Transaction, MeshWallet, BlockfrostProvider } from '@meshsdk/core';
```

**Recommendation:** Create a `ChainAdapter` interface that MeshJS implements for Cardano, and bitcoinjs-lib implements for Bitcoin.

---

## 3. b58-extension (Mobile/Extension) Analysis

**Location:** `/home/ubuntu/.openclaw/workspace/b58-extension/src/`

### 3.1 Current Chain Support

**Chains Configuration (`lib/chains.ts`):**
```typescript
export const chains = {
  cardano: { name: 'Cardano', value: 'cardano', icon: cardanoIcon },
  bitcoin: { name: 'Bitcoin', value: 'bitcoin', icon: bitcoinIcon },
};
```

### 3.2 Bitcoin Implementation via useBitcoin Hook

**Location:** `hooks/useBitcoin.ts`

| Feature | Status | Implementation |
|---------|--------|----------------|
| Balance Query | ✅ Working | Blockstream API |
| Transaction History | ⚠️ Basic | Maestro API |
| Send BTC | ⚠️ Basic | Via begin-core |
| Fee Estimation | ✅ Working | mempool.space API |
| Address Validation | ✅ Working | bitcoinjs-lib |

**Code Analysis:**
```typescript
const buildBtcTx = async (
    account: Account,
    password: string,
    chain: 'BTC' | 'DOGE',
    receiver: string,
    amount: number,
    feeAmount: number,  // Static fee, not dynamic
    tokens: any[],
    isEstimative = false
) => { ... }
```

**Issues:**
1. Fee estimation is separated from transaction building
2. No dynamic UTXO selection
3. Token (Runes) support is incomplete

### 3.3 Hardware Wallet Support

**Ledger (Cardano Only):**

| Feature | Status | Location |
|---------|--------|----------|
| Connect via WebHID | ✅ Working | `lib/ledgerUtils.ts` |
| Connect via BLE | ✅ Working | `views/hardware/ledger/transport-mobile-ble/` |
| Transaction Signing | ✅ Working | `signTxHW()` |
| Message Signing | ✅ Working | `signMsgHW()` |
| Address Verification | ✅ Working | `verifyAddress()` |

**Keystone (Cardano Only):**
- QR-based signing workflow implemented
- No Bitcoin support

**Bitcoin Hardware Wallet Status: ❌ NOT IMPLEMENTED**

### 3.4 Transaction Builder Analysis

**Location:** `core/builder.ts`

The builder handles four signing methods for Cardano:
1. `buildSend()` - Software wallet signing
2. `buildSendHW()` - Ledger hardware wallet
3. `buildQR()` - Keystone QR signing
4. `buildSendQR()` - Keystone QR submission

**Gap:** No equivalent methods for Bitcoin transactions.

---

## 4. Feature Parity Gap Analysis

### 4.1 Critical Gaps

| Feature | Cardano Status | Bitcoin Gap | Priority |
|---------|---------------|-------------|----------|
| Hardware Wallet Signing | ✅ Full | ❌ None | 🔴 Critical |
| Dynamic Fee Estimation | ✅ Protocol params | ⚠️ Static/Manual | 🟠 High |
| Coin Selection | ✅ CIP-2 algorithms | ❌ Sequential only | 🟠 High |
| Multi-sig Support | ⚠️ Partial | ❌ None | 🟡 Medium |
| Watch-only Wallets | ✅ Supported | ❌ None | 🟡 Medium |

### 4.2 UTXO Management Comparison

**Cardano (begin-core/MeshJS):**
```typescript
// Uses CIP-2 coin selection strategies
txBuilder.select_utxos(CoinSelectionStrategyCIP2.LargestFirstMultiAsset);
// Or RandomImprove strategy
txBuilder.select_utxos(CoinSelectionStrategyCIP2.RandomImprove);
```

**Bitcoin (begin-core):**
```typescript
// Sequential iteration - uses ALL UTXOs
for (const utxo of utxos) {
    psbt.addInput(inputParams);
    inputSum += parseInt(utxo.satoshis, 10);
    if (token && tokenInputSum >= tokenAmount && inputSum > feeAmount) {
        break;
    }
}
```

**Issues with Bitcoin approach:**
1. No minimum UTXO selection
2. No fee-aware selection
3. Creates unnecessarily large transactions
4. No dust avoidance

### 4.3 Fee Estimation Comparison

**Cardano:**
- Uses on-chain protocol parameters
- Linear fee model: `fee = minFeeA * size + minFeeB`
- Accurate pre-calculation before signing

**Bitcoin:**
- Static fees: `1000 satoshis (BTC)` or `100000 satoshis (DOGE)`
- Optional mempool.space query (not integrated into tx builder)
- No sat/vB calculation

---

## 5. Recommended Chain Adapter Architecture

### 5.1 Proposed Interface

```typescript
interface ChainAdapter {
    // Identity
    readonly chainId: string;
    readonly networkType: 'mainnet' | 'testnet';
    
    // Account Management
    deriveAddress(account: number, index: number): Promise<string>;
    getBalance(address: string): Promise<Balance>;
    getUtxos(address: string): Promise<UTXO[]>;
    
    // Transaction Building
    createTransaction(params: TxParams): Promise<UnsignedTransaction>;
    estimateFee(tx: UnsignedTransaction): Promise<bigint>;
    signTransaction(tx: UnsignedTransaction, signers: Signer[]): Promise<SignedTransaction>;
    submitTransaction(tx: SignedTransaction): Promise<string>;
    
    // Hardware Wallet
    supportsHardwareWallet(type: HWType): boolean;
    signWithHardware(tx: UnsignedTransaction, hw: HardwareWallet): Promise<SignedTransaction>;
}
```

### 5.2 Implementation Priority

1. **Phase 1: Core Abstraction**
   - Define `ChainAdapter` interface
   - Implement `CardanoAdapter` wrapping existing code
   - Implement `BitcoinAdapter` wrapping existing code

2. **Phase 2: Bitcoin Feature Parity**
   - Add Ledger Bitcoin app support
   - Implement proper coin selection
   - Add dynamic fee estimation

3. **Phase 3: CLI Multi-chain**
   - Add `begin bitcoin` command group
   - Unified wallet management
   - Cross-chain transaction history

---

## 6. Specific Recommendations

### 6.1 Hardware Wallet for Bitcoin

**Implementation Path:**
1. Use `@ledgerhq/hw-app-btc` package
2. Add BTC Ledger app detection in `ledgerUtils.ts`
3. Create PSBT signing flow similar to Cardano CML flow
4. Add Keystone Bitcoin QR protocol support

**Example Integration:**
```typescript
import Btc from '@ledgerhq/hw-app-btc';

const signBtcTxWithLedger = async (psbt: Psbt, transport: Transport) => {
    const btcApp = new Btc({ transport });
    const walletPolicy = new DefaultWalletPolicy(/* derivation path */);
    
    const signatures = await btcApp.signPsbt(psbt, walletPolicy, null);
    // Apply signatures to PSBT
    psbt.finalizeAllInputs();
    return psbt.extractTransaction().toHex();
};
```

### 6.2 Fee Estimation Improvements

**For Bitcoin:**
```typescript
const estimateBtcFee = async (vBytes: number): Promise<number> => {
    const feeRates = await fetch('https://mempool.space/api/v1/fees/recommended')
        .then(r => r.json());
    
    // Priority options
    return {
        fastest: vBytes * feeRates.fastestFee,
        halfHour: vBytes * feeRates.halfHourFee,
        hour: vBytes * feeRates.hourFee,
        economy: vBytes * feeRates.economyFee,
    };
};
```

### 6.3 Coin Selection Algorithm

**Implement Branch and Bound (BIP-125 compatible):**
```typescript
const selectCoins = (utxos: UTXO[], target: bigint, feeRate: number): UTXO[] => {
    // Sort by value descending for deterministic selection
    const sorted = [...utxos].sort((a, b) => 
        Number(BigInt(b.value) - BigInt(a.value)));
    
    // Try exact match first (avoids change output)
    const exactMatch = findExactMatch(sorted, target);
    if (exactMatch) return exactMatch;
    
    // Fall back to largest-first with change
    return selectLargestFirst(sorted, target, feeRate);
};
```

---

## 7. Files to Modify

### 7.1 begin-core

| File | Changes Required |
|------|------------------|
| `src/core/base.ts` | Add abstract `ChainAdapter` interface |
| `src/core/chain/bitcoin/transaction.ts` | Add coin selection, fee estimation |
| `src/core/chain/bitcoin/hardware.ts` | **NEW** - Ledger/Keystone support |
| `src/core/chain/cardano/adapter.ts` | **NEW** - Implement ChainAdapter |

### 7.2 begin-cli

| File | Changes Required |
|------|------------------|
| `src/commands/bitcoin/` | **NEW** - Bitcoin command group |
| `src/lib/chain-adapter.ts` | **NEW** - Adapter factory |
| `src/lib/bitcoin-provider.ts` | **NEW** - Bitcoin API provider |

### 7.3 b58-extension

| File | Changes Required |
|------|------------------|
| `src/hooks/useBitcoin.ts` | Add hardware wallet support |
| `src/lib/ledgerUtils.ts` | Add Bitcoin Ledger app support |
| `src/core/builder.ts` | Add `buildSendBtc()` methods |
| `src/views/hardware/` | Add Bitcoin flow |

---

## 8. Testing Recommendations

### 8.1 Unit Tests Required

- [ ] Bitcoin UTXO selection algorithms
- [ ] Bitcoin fee estimation accuracy
- [ ] Bitcoin address derivation (all types)
- [ ] PSBT construction and signing
- [ ] Hardware wallet mock interactions

### 8.2 Integration Tests Required

- [ ] End-to-end Bitcoin send on testnet
- [ ] Ledger Bitcoin app signing flow
- [ ] Cross-chain balance display
- [ ] Transaction history aggregation

---

## 9. Conclusion

The Begin Wallet codebase has a solid Cardano implementation but lacks parity for Bitcoin. The absence of a formal chain adapter pattern makes it difficult to add new chains and maintain consistency.

**Recommended Immediate Actions:**
1. 🔴 Add Ledger Bitcoin app support
2. 🔴 Implement proper Bitcoin coin selection
3. 🟠 Create `ChainAdapter` interface
4. 🟠 Refactor existing code to implement adapters
5. 🟡 Add Bitcoin commands to CLI

**Estimated Effort:**
- Hardware wallet support: 2-3 days
- Coin selection + fees: 1-2 days
- Chain adapter architecture: 3-5 days
- CLI Bitcoin commands: 2-3 days
- **Total: 8-13 developer days**

---

*This audit was generated automatically. Manual review recommended before implementation.*
