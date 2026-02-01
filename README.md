# begin-cli

A command-line interface for interacting with the Cardano blockchain, built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs) and [MeshJS](https://meshjs.dev/).

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

## Setup

### Blockfrost API Key

For blockchain queries and transactions, you need a Blockfrost API key:

1. Sign up at [blockfrost.io](https://blockfrost.io) (free tier available)
2. Create a project for your desired network
3. Set the environment variable:

```bash
export BLOCKFROST_API_KEY=your_api_key_here
```

### Wallet Setup

Create a wallet file with your 24-word mnemonic:

```bash
mkdir -p ~/.begin
# Create wallet.key with your 24-word mnemonic (space or newline separated)
echo "word1 word2 word3 ... word24" > ~/.begin/wallet.key
chmod 600 ~/.begin/wallet.key
```

⚠️ **Security Warning:** Keep your mnemonic file secure. Never share it or commit it to git.

## Usage

```bash
# Show help
begin --help

# Check ADA balance
begin cardano balance <address>

# Send ADA
begin cardano send <to> <amount>

# Send ADA with native tokens
begin cardano send <to> <amount> --asset <policyId.assetName:quantity>

# Offline signing workflow
begin cardano send <to> <amount> --dry-run --output tx.unsigned
begin sign tx.unsigned --output tx.signed
begin submit tx.signed
```

## Commands

### `begin cardano balance <address>`

Check the ADA balance and native tokens for a Cardano address.

**Options:**
- `--network, -n` - Network to use: `mainnet`, `preprod`, or `preview` (default: `mainnet`)

**Example:**
```bash
$ begin cardano balance addr1qy2...xyz

Cardano Balance (mainnet)
Address: addr1qy2...xyz
Balance: 125.430000 ADA

Native Tokens:
  • HOSKY: 1000000
  • SNEK: 500
```

### `begin cardano send <to> <amount>`

Send ADA (and optionally native tokens) to a recipient address.

**Options:**
- `--network, -n` - Network to use (default: `mainnet`)
- `--wallet, -w` - Path to wallet file (default: `~/.begin/wallet.key`)
- `--dry-run, -d` - Build transaction but don't submit (save unsigned tx)
- `--output, -o` - Output file path for unsigned transaction
- `--json, -j` - Output result as JSON
- `--asset, -a` - Native asset to send (can be specified multiple times)

**Examples:**
```bash
# Simple ADA send
$ begin cardano send addr1qy... 10

# Send on testnet
$ begin cardano send addr1qy... 10 --network preprod

# Build transaction without submitting (dry run)
$ begin cardano send addr1qy... 10 --dry-run --output my-tx.unsigned

# Send ADA with native tokens
$ begin cardano send addr1qy... 2 \
  --asset "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235.HOSKY:1000" \
  --asset "b0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235.SNEK:500"

# JSON output for scripting
$ begin cardano send addr1qy... 10 --json
{"status":"confirmed","txHash":"abc123...","network":"mainnet"}
```

### `begin sign <tx-file>`

Sign an unsigned transaction (supports offline signing).

**Options:**
- `--wallet, -w` - Path to wallet file (default: `~/.begin/wallet.key`)
- `--network, -n` - Network (for display purposes)
- `--output, -o` - Output file path for signed transaction
- `--json, -j` - Output result as JSON

**Example:**
```bash
# Sign an unsigned transaction
$ begin sign tx.unsigned --output tx.signed

✓ Transaction signed successfully!
TX Hash:    abc123def456...
Signed TX:  tx.signed

Submit with: begin submit tx.signed --network mainnet
```

### `begin submit <signed-tx-file>`

Submit a signed transaction to the network.

**Options:**
- `--network, -n` - Network to submit to (default: `mainnet`)
- `--no-wait` - Don't wait for confirmation
- `--json, -j` - Output result as JSON

**Example:**
```bash
# Submit and wait for confirmation
$ begin submit tx.signed --network preprod

⏳ Submitting transaction to preprod...
⏳ Waiting for confirmation... (attempt 3/60)

✓ Transaction confirmed!
TX Hash: abc123def456...
Network: preprod
View on: https://preprod.cardanoscan.io/transaction/abc123def456...

# Submit without waiting
$ begin submit tx.signed --no-wait --json
{"status":"submitted","txHash":"abc123...","network":"mainnet","confirmed":false}
```

## Offline Signing Workflow

For enhanced security, you can build transactions on an online machine and sign them on an air-gapped offline machine:

```bash
# 1. On ONLINE machine: Build the transaction
begin cardano send addr1qy... 100 --dry-run --output tx.unsigned

# 2. Transfer tx.unsigned to OFFLINE machine (USB drive, QR code, etc.)

# 3. On OFFLINE machine: Sign the transaction
begin sign tx.unsigned --wallet /path/to/secure/wallet.key --output tx.signed

# 4. Transfer tx.signed back to ONLINE machine

# 5. On ONLINE machine: Submit the signed transaction
begin submit tx.signed --network mainnet
```

## Project Structure

```
begin-cli/
├── src/
│   ├── cli.tsx              # Entry point, argument parsing
│   ├── app.tsx              # Main app component, routing
│   ├── index.ts             # Library exports
│   ├── lib/
│   │   └── transaction.ts   # Transaction building utilities
│   ├── commands/
│   │   ├── cardano/
│   │   │   ├── balance.tsx  # Balance check component
│   │   │   └── send.tsx     # Send transaction component
│   │   ├── sign.tsx         # Sign transaction component
│   │   └── submit.tsx       # Submit transaction component
│   └── services/
│       └── blockfrost.ts    # Blockfrost API client
├── package.json
├── tsconfig.json
└── README.md
```

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

## Roadmap

- [x] Balance checking
- [x] Simple ADA transactions
- [x] Multi-asset transactions (native tokens)
- [x] Offline signing support
- [x] Transaction submission with confirmation
- [ ] Hardware wallet support (Ledger/Trezor)
- [ ] Stake pool delegation
- [ ] NFT minting
- [ ] Smart contract interaction
- [ ] Multi-signature transactions

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
