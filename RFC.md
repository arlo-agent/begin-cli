# RFC: begin-cli Multi-Chain Wallet

## Overview

`begin-cli` is a command-line wallet designed for power users who want unified access to multiple blockchains. The initial focus is Cardano, with Bitcoin and Solana support planned.

## Design Goals

1. **Security First** - Never store private keys without explicit user consent
2. **Clean Architecture** - Pluggable chain adapters for easy expansion
3. **Great UX** - Both CLI flags and interactive TUI
4. **Offline Capable** - Transaction signing can happen offline

## Architecture

### Chain Trait

All blockchains implement the `Chain` trait:

```rust
#[async_trait]
pub trait Chain: Send + Sync {
    fn name(&self) -> &str;
    fn symbol(&self) -> &str;
    async fn get_balance(&self, address: &str) -> Result<Balance>;
    async fn send(&self, to: &str, amount: &str, private_key: &[u8]) -> Result<TransactionResult>;
    fn validate_address(&self, address: &str) -> bool;
}
```

### Wallet Storage

We separate concerns:
- **Address storage**: `~/.config/begin-cli/wallets.json` - just addresses
- **Key management**: User-controlled (hardware wallet, file, environment)

### API Strategy

| Chain | API Provider | Notes |
|-------|-------------|-------|
| Cardano | Blockfrost | Free tier available |
| Bitcoin | Mempool.space | Open source, no key needed |
| Solana | Helius / RPC | Multiple options |

## Security Considerations

1. **Mnemonic display** - Show once, warn user to write down
2. **No key storage** - Keys stay with user
3. **Address validation** - Validate before any operation
4. **Network selection** - Clear testnet/mainnet distinction

## Implementation Phases

### Phase 1 (Current)
- [x] Project structure
- [x] Cardano balance query via Blockfrost
- [x] Wallet generation with BIP39
- [x] Basic TUI shell

### Phase 2
- [ ] Cardano transaction building
- [ ] Transaction signing
- [ ] UTXO management

### Phase 3
- [ ] Bitcoin support (P2WPKH addresses)
- [ ] Solana support (Ed25519)
- [ ] Multi-wallet management

### Phase 4
- [ ] Hardware wallet support (Ledger)
- [ ] Watch-only wallets
- [ ] Transaction history

## CLI Design

```
begin <command> [options]

Commands:
  balance   Show wallet balance
  send      Send funds to address
  new       Generate new wallet
  import    Import from mnemonic
  ui        Launch interactive TUI

Global Options:
  -c, --chain <CHAIN>   Target blockchain (cardano|bitcoin|solana)
  -n, --network <NET>   Network (mainnet|testnet)
  -v, --verbose         Verbose output
```

## Questions for Review

1. Should we support hardware wallets in Phase 1?
2. Preferred Cardano transaction library (pallas vs cardano-serialization-lib)?
3. Multi-sig support priority?
