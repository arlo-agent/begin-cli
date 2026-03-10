# begin-cli (Rust Implementation)

An alternative Rust implementation of begin-cli using ratatui for the TUI.

## Why Rust?

- **Native binaries** - No runtime dependencies (Node.js not required)
- **Better performance** - For cryptographic operations
- **Strong type system** - Extra safety for financial applications
- **Easy cross-compilation** - Build for any platform

## Features

- 🔐 **Secure wallet generation** - BIP39 24-word mnemonic
- 💰 **Balance queries** - Check ADA balance via Blockfrost
- 📤 **Send funds** - Transaction framework (signing in progress)
- 🖥️ **Interactive TUI** - Built with ratatui/crossterm
- 🔗 **Multi-chain ready** - Architecture supports Bitcoin & Solana

## Quick Start

```bash
# Build
cargo build --release

# Install globally
cargo install --path .

# Generate new wallet
begin new --chain cardano

# Check balance
export BLOCKFROST_API_KEY=your_key_here
begin balance --address addr1...

# Interactive TUI
begin ui
```

## Project Structure

```
src/
├── main.rs         # CLI entry point (clap)
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

## Commands

| Command | Description |
|---------|-------------|
| `begin balance` | Query wallet balance |
| `begin send <addr> <amount>` | Send ADA (WIP) |
| `begin new` | Generate new wallet |
| `begin import` | Import from mnemonic |
| `begin ui` | Launch interactive TUI |

## Configuration

| Variable | Description |
|----------|-------------|
| `BLOCKFROST_API_KEY` | Required for Cardano queries |
| `CARDANO_NETWORK` | `mainnet` (default) or `preview` |

## Building from Source

```bash
# Debug build
cargo build

# Release build
cargo build --release

# Run tests
cargo test

# Check for issues
cargo clippy
```

## Comparison with TypeScript Version

| Feature | Rust | TypeScript |
|---------|------|------------|
| Runtime | Native binary | Node.js |
| TUI | ratatui | Ink |
| Bundle size | ~5MB | ~50MB+ |
| Startup time | <10ms | ~500ms |
| Memory | ~10MB | ~50MB |

## Status

This is an alternative implementation. See the main README for the TypeScript/Ink version.
