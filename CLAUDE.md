# Task: Add Multi-Chain Wallet Support to begin-cli

You are working on begin-cli, an Ink 5 + React + TypeScript CLI crypto wallet. Currently it only supports Cardano. Add Solana, Bitcoin, and EVM (Ethereum, Base, Polygon, Arbitrum, Optimism, BNB Chain, Avalanche) wallet support.

## Reference Implementation
The b58-extension project (~/repos/b58-extension) has working Solana and Bitcoin adapters in:
- `src/core/chains/types.ts` — IChainAdapter interface
- `src/core/chains/adapters/solana.ts` — Full Solana implementation (Ed25519, BIP44 m/44'/501'/n'/0', @solana/web3.js)
- `src/core/chains/adapters/bitcoin.ts` — Bitcoin implementation (bitcoinjs-lib, BIP32, segwit)
- `src/core/chains/registry.ts` — Chain registry

**IMPORTANT:** The b58-extension is a browser extension using Capacitor. The CLI needs Node.js-compatible implementations. Don't import browser-only APIs (Capacitor, Http plugin). Use `fetch` directly.

## Architecture

### Phase 1: Solana Wallet
Add @solana/web3.js and @solana/spl-token as dependencies.

Create `src/lib/chains/` directory with:
- `types.ts` — ChainId type ('cardano' | 'solana' | 'bitcoin' | 'evm'), chain adapter interface
- `solana.ts` — Solana adapter: wallet creation (Ed25519 via ed25519-hd-key + bip39, path m/44'/501'/n'/0'), balance (SOL + SPL tokens), send SOL/SPL, tx history, address validation
- `registry.ts` — Chain registry to get adapters by chain ID

Modify existing files:
- `src/lib/wallet.ts` — Add chain parameter, store chain-specific data in wallet file (e.g. `chains: { solana: { address, publicKey, encryptedPrivateKey } }`)
- `src/commands/wallet/create.tsx` — Add --chain flag (default: cardano)
- `src/commands/wallet/restore.tsx` — Add --chain flag
- `src/commands/wallet/address.tsx` — Show address for specified chain
- `src/commands/receive.tsx` — Support --chain
- Add `src/commands/solana/` with: balance.tsx, send.tsx, history.tsx

### Phase 2: Bitcoin Wallet
Add bitcoinjs-lib, tiny-secp256k1, bip32, ecpair as dependencies.

Create `src/lib/chains/bitcoin.ts`:
- Wallet creation: BIP32/BIP84 (native segwit bc1...), path m/84'/0'/n'/0/0
- Balance via Blockstream API (blockstream.info/api)
- Send BTC (UTXO selection, segwit signing)
- Tx history via Blockstream API
- Fee estimation via mempool.space API

Add `src/commands/bitcoin/` with: balance.tsx, send.tsx, history.tsx

### Phase 3: EVM Wallet
Add ethers (v6) as dependency.

Create `src/lib/chains/evm.ts`:
- Wallet creation: BIP44 path m/44'/60'/0'/0/n (same key works across all EVM chains)
- Support multiple networks: Ethereum, Base, Polygon, Arbitrum, Optimism, BNB Chain, Avalanche
- Each network needs: RPC URL (use public RPCs), chain ID, explorer URL, native currency
- Balance (native + ERC-20 tokens)
- Send native currency + ERC-20 tokens
- Tx history (use Etherscan-compatible APIs where available, or basic RPC otherwise)

Add `src/commands/evm/` with: balance.tsx, send.tsx, history.tsx
Add --network flag for EVM commands (default: ethereum)

### Wallet File Format Update
Update wallet file format to support multi-chain:
```json
{
  "version": 3,
  "name": "my-wallet",
  "mnemonic_encrypted": "...",
  "chains": {
    "cardano": { "networkId": 1, "addresses": { "payment": "addr1...", "stake": "stake1..." } },
    "solana": { "address": "...", "publicKey": "..." },
    "bitcoin": { "address": "bc1...", "publicKey": "..." },
    "evm": { "address": "0x..." }
  },
  "createdAt": "..."
}
```

One mnemonic → derive keys for all chains. The encrypted mnemonic is stored once; chain-specific addresses are derived on creation.

## Key Rules
1. Follow existing code patterns (look at how Cardano commands work)
2. Use Ink 5 React components for all UI
3. Support --json flag for machine-readable output
4. Support --yes flag to skip confirmations
5. All amounts in display units (SOL not lamports, BTC not satoshis) — convert internally
6. Use the policy/audit system for sends (src/lib/policy.ts, src/lib/audit.ts)
7. Proper error handling using getErrorMessage from src/lib/errors.ts
8. Add ed25519-hd-key as a dependency for Solana key derivation

## CLI Structure
Check src/cli.tsx and src/app.tsx to understand how commands are registered. Follow the same pattern.

## Don't
- Don't modify Cardano functionality (it works, leave it alone)
- Don't add tests yet
- Don't add hardware wallet support yet
- Don't use browser-only APIs

## Do
- Commit after each phase (Solana, Bitcoin, EVM) with clear commit messages
- Make sure TypeScript compiles (`pnpm run typecheck`)
- Update the CLI help text

When completely finished, run: openclaw system event --text "Done: Multi-chain wallet support added to begin-cli (Solana, Bitcoin, EVM)" --mode now
