---
name: begin-offline
description: Air-gapped transaction signing workflow for secure operations.
tags: [offline, security, signing, air-gapped]
---

# Offline Signing

Build transactions on an online machine, sign on an air-gapped device, and submit from online. Maximum security for high-value operations.

## Commands

### Build Unsigned Transaction

```bash
begin cardano send <to-address> <amount> --dry-run --output tx.unsigned
begin cardano send <to-address> <amount> --dry-run --output tx.unsigned --json
```

Build a transaction without signing or submitting. Save to a file for offline signing.

### Sign Transaction

```bash
begin sign <tx-file>
begin sign tx.unsigned --wallet <name> --password <pass>
begin sign tx.unsigned --output tx.signed
```

Sign an unsigned transaction file. Can be done on an air-gapped machine.

### Submit Transaction

```bash
begin submit <signed-tx-file>
begin submit tx.signed
begin submit tx.signed --no-wait --json
```

Submit a signed transaction to the network. Use `--no-wait` to return immediately without waiting for confirmation.

## Options

| Flag | Description |
|------|-------------|
| `--dry-run, -d` | Build transaction without submitting |
| `--output, -o` | Output file path for unsigned/signed tx |
| `--wallet, -w` | Wallet name for signing |
| `--password` | Wallet password |
| `--no-wait` | Don't wait for confirmation (submit) |
| `--json, -j` | Output as JSON |
| `--network, -n` | Network: mainnet, preprod, preview |

## JSON Mode

Use `--json` flag for structured output:

```bash
begin cardano send addr1... 10 --dry-run --output tx.unsigned --json
begin sign tx.unsigned --json
begin submit tx.signed --json
```

**Dry-run Response:**
```json
{
  "success": true,
  "txFile": "tx.unsigned",
  "fee": "180000",
  "inputs": 1,
  "outputs": 2
}
```

**Sign Response:**
```json
{
  "success": true,
  "signedFile": "tx.signed",
  "txHash": "abc123..."
}
```

**Submit Response:**
```json
{
  "success": true,
  "txHash": "abc123...",
  "confirmed": true
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BEGIN_CLI_MNEMONIC` | Mnemonic for signing (air-gapped machine) |
| `BEGIN_CLI_WALLET_PASSWORD` | Wallet password |
| `BLOCKFROST_API_KEY` | API key (online machine only) |

## Workflow

### Three-Step Offline Signing

This workflow keeps your private keys on an air-gapped (offline) machine while building and submitting transactions from an online machine.

#### On Online Machine (Step 1)

```bash
# Build unsigned transaction
begin cardano send addr1recipient... 10 --dry-run --output tx.unsigned

# Transfer tx.unsigned to air-gapped machine (USB, QR, etc.)
```

#### On Air-Gapped Machine (Step 2)

```bash
# Set mnemonic (keys never leave this machine)
export BEGIN_CLI_MNEMONIC="word1 word2 ... word24"

# Sign the transaction
begin sign tx.unsigned --output tx.signed

# Transfer tx.signed back to online machine
```

#### On Online Machine (Step 3)

```bash
# Submit signed transaction
begin submit tx.signed --json

# Or submit without waiting for confirmation
begin submit tx.signed --no-wait --json
```

### Automated Offline Signing

For scripted environments where the signing machine is isolated but automated:

```bash
# On signing machine (isolated network)
export BEGIN_CLI_MNEMONIC="word1 word2 ... word24"

# Watch for unsigned transactions
inotifywait -m /inbox -e create |
while read path action file; do
  if [[ "$file" == *.unsigned ]]; then
    begin sign "/inbox/$file" --output "/outbox/${file%.unsigned}.signed"
  fi
done
```

## Examples

```bash
# Build unsigned transaction
begin cardano send addr1recipient... 50 --dry-run --output payment.unsigned

# Sign with interactive password prompt
begin sign payment.unsigned --wallet cold-wallet

# Sign with password flag
begin sign payment.unsigned --wallet cold-wallet --password mypass

# Submit and wait for confirmation
begin submit payment.signed

# Submit without waiting
begin submit payment.signed --no-wait --json

# Full workflow with JSON output
begin cardano send addr1... 100 --dry-run --output tx.unsigned --json
begin sign tx.unsigned --wallet hw-wallet --output tx.signed
begin submit tx.signed --json
```

## Security Notes

- Keep mnemonics only on air-gapped machines
- Never connect signing machines to the internet
- Verify transaction details before signing
- Use hardware wallets when possible for additional security
- Clear environment variables after use: `unset BEGIN_CLI_MNEMONIC`

## Related Skills

- [begin-wallet](../begin-wallet/SKILL.md) - Wallet management
