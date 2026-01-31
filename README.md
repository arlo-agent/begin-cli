# begin-cli

A command-line interface for interacting with the Cardano blockchain, built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs).

## Installation

```bash
# From npm (when published)
npm install -g begin-cli

# From source
git clone https://github.com/ArloByte/begin-cli.git
cd begin-cli
npm install
npm run build
npm link
```

## Usage

```bash
# Show help
begin --help

# Check ADA balance
begin cardano balance <address>

# Check balance on testnet
begin cardano balance <address> --network preprod

# Send ADA (mock/stub for now)
begin cardano send <recipient-address> <amount>
```

## Commands

### `begin cardano balance <address>`

Check the ADA balance and native tokens for a Cardano address.

**Options:**
- `--network, -n` - Network to use: `mainnet`, `preprod`, or `preview` (default: `mainnet`)

**Example:**
```bash
$ begin cardano balance addr1qy2...xyz

┌────────────────────────────────────┐
│ Cardano Balance (mainnet)          │
├────────────────────────────────────┤
│ Address: addr1qy2...xyz            │
│ Balance: 125.430000 ADA            │
│                                    │
│ Native Tokens:                     │
│   • HOSKY: 1000000                 │
│   • SNEK: 500                      │
└────────────────────────────────────┘
```

### `begin cardano send <to> <amount>`

Send ADA to a recipient address.

> ⚠️ **Note:** This command is currently a mock/stub. Real transaction signing will be implemented with wallet integration.

**Options:**
- `--network, -n` - Network to use (default: `mainnet`)

**Example:**
```bash
$ begin cardano send addr1qy2...xyz 10

Send ADA (mainnet)
┌──────────────────────────────────┐
│ To:     addr1qy2...xyz           │
│ Amount: 10 ADA                   │
│ Fee:    ~0.17 ADA (estimated)    │
└──────────────────────────────────┘

⚠ This is a MOCK transaction

Confirm send? [Y]es / [N]o
```

## Configuration

### Blockfrost API Key

For real balance lookups, you need a Blockfrost API key:

1. Sign up at [blockfrost.io](https://blockfrost.io) (free tier available)
2. Create a project for your desired network
3. Set the environment variable:

```bash
export BLOCKFROST_API_KEY=your_api_key_here
```

Without an API key, the CLI returns mock data for development purposes.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Type check
npm run typecheck

# Run locally
node dist/cli.js cardano balance <address>
```

## Project Structure

```
begin-cli/
├── src/
│   ├── cli.tsx              # Entry point, argument parsing
│   ├── app.tsx              # Main app component, routing
│   ├── index.ts             # Library exports
│   ├── commands/
│   │   └── cardano/
│   │       ├── balance.tsx  # Balance check component
│   │       └── send.tsx     # Send transaction component
│   └── services/
│       └── blockfrost.ts    # Blockfrost API client
├── package.json
├── tsconfig.json
└── README.md
```

## Roadmap

- [ ] Wallet integration (seed phrase / hardware wallet)
- [ ] Real transaction building and signing
- [ ] Token transfers (native assets)
- [ ] Stake pool delegation
- [ ] NFT minting
- [ ] Smart contract interaction
- [ ] Multi-signature transactions

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
