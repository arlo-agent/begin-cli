# begin-cli — Agent & developer setup

Cardano CLI wallet for AI agents. Headless, scriptable, JSON output and env-based config.

## Prerequisites

- **Node.js 18+**
- **pnpm** (e.g. `corepack enable` then use project `packageManager`, or install: `npm install -g pnpm`)
- **Blockfrost API key** for mainnet/testnet ([blockfrost.io](https://blockfrost.io))

## Setup

```bash
pnpm install
```

Optional environment variables:

- `BLOCKFROST_API_KEY` — Blockfrost project ID (required for cardano/balance, utxos, history, send, etc.)
- `BEGIN_CLI_MNEMONIC` — Wallet mnemonic for signing (optional, use with caution)
- `BEGIN_CLI_NETWORK` — Default network: `mainnet`, `preprod`, or `preview`

## Commands

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `pnpm build` | Compile TypeScript to `dist/` |
| `dev` | `pnpm dev` | Watch and recompile on change |
| `start` | `pnpm start` | Run built CLI (no args) |
| `cli` | `pnpm cli -- <args>` | Run built CLI with subcommand/args, e.g. `pnpm cli -- balance addr1...` |
| `run` | `pnpm run -- <args>` | Build (if needed) then run CLI with args |
| `dev:cli` | `pnpm dev:cli -- <args>` | Run CLI from source (no build), e.g. `pnpm dev:cli -- --help` |
| `link` | `pnpm link` | Symlink built CLI globally so `begin` is available (run `pnpm build` first) |
| `lint` | `pnpm lint` | Run ESLint |
| `typecheck` | `pnpm typecheck` | Type-check without emitting |
| `test` | `pnpm test` | Run Vitest once |
| `test:watch` | `pnpm test:watch` | Run Vitest in watch mode |
| `clean` | `pnpm clean` | Remove `dist/` |
| `prepublishOnly` | (auto) | Runs before publish (build) |

## Run the CLI

- **Built:** `pnpm start` or `pnpm cli -- <command> [options]`
- **From source (no build):** `pnpm dev:cli -- <command> [options]`
- **Build then run:** `pnpm run -- <command> [options]`
- **Global:** `pnpm build && pnpm link` then run `begin` from anywhere

For full command list and options, see the [README](README.md) and run `pnpm cli -- --help`.
