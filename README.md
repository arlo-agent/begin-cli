# begin-cli

A multi-chain wallet CLI for Cardano, Bitcoin, and Solana.

## Features

- 🔐 **Secure wallet generation** - BIP39 mnemonic support
- 💰 **Balance queries** - Check your ADA balance
- 📤 **Send funds** - Transfer tokens (coming soon)
- 🖥️ **Interactive TUI** - Terminal user interface
- 🔗 **Multi-chain** - Cardano first, Bitcoin & Solana coming

## Installation

```bash
cargo install --path .
```

## Usage

### Check Balance

```bash
# With address
begin balance --address addr1qx...

# With configured wallet
begin balance
```

### Create New Wallet

```bash
begin new --chain cardano
```

### Import Existing Wallet

```bash
begin import --chain cardano
```

### Send ADA

```bash
begin send addr1qx... 10.5
```

### Launch Interactive UI

```bash
begin ui
```

## Configuration

### Environment Variables

- `BLOCKFROST_API_KEY` - Required for Cardano balance queries (get one at [blockfrost.io](https://blockfrost.io))
- `CARDANO_NETWORK` - `mainnet` (default) or `preview`

### Wallet Store

Addresses are stored in `~/.config/begin-cli/wallets.json`. Private keys are **never** stored automatically - manage them securely yourself.

## Architecture

```
src/
├── main.rs         # CLI entry point
├── commands/       # Command implementations
│   ├── balance.rs  # Balance queries
│   ├── send.rs     # Transaction sending
│   ├── new_wallet.rs
│   └── import.rs
├── chains/         # Blockchain adapters
│   └── cardano.rs  # Cardano via Blockfrost
├── wallet/         # Wallet management
│   └── mod.rs      # Address storage
└── ui/             # TUI components
    └── mod.rs      # Ratatui interface
```

## Roadmap

- [x] Project scaffold
- [x] Cardano balance query
- [x] Wallet generation
- [x] Basic TUI
- [ ] Cardano transaction signing
- [ ] Bitcoin support
- [ ] Solana support
- [ ] Hardware wallet integration

## License

MIT
