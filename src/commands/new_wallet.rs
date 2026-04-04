//! New wallet command - generate a fresh wallet

use anyhow::{bail, Result};
use bip39::{Language, Mnemonic};

use crate::chains::cardano;
use crate::wallet::WalletStore;

/// Execute the new wallet command
pub fn execute(chain: &str) -> Result<()> {
    match chain.to_lowercase().as_str() {
        "cardano" | "ada" => create_cardano_wallet(),
        "bitcoin" | "btc" => bail!("Bitcoin wallet generation coming soon"),
        "solana" | "sol" => bail!("Solana wallet generation coming soon"),
        _ => bail!("Unknown chain: {}", chain),
    }
}

fn create_cardano_wallet() -> Result<()> {
    // Generate 32 bytes of entropy for 24-word mnemonic
    let mut entropy = [0u8; 32];
    getrandom::fill(&mut entropy).map_err(|e| anyhow::anyhow!("Failed to generate entropy: {}", e))?;
    
    let mnemonic = Mnemonic::from_entropy_in(Language::English, &entropy)?;
    let phrase = mnemonic.to_string();

    // Derive address from mnemonic
    let address = cardano::derive_address_from_mnemonic(&phrase)?;

    println!();
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("  🎉 New Cardano Wallet Created!");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!();
    println!("  ⚠️  IMPORTANT: Write down your recovery phrase!");
    println!("  ⚠️  Anyone with this phrase can access your funds.");
    println!("  ⚠️  Store it securely offline. Never share it.");
    println!();
    println!("  Recovery Phrase (24 words):");
    println!("  ┌─────────────────────────────────────────────────────────┐");

    // Display words in a readable format
    let words: Vec<&str> = phrase.split_whitespace().collect();
    for (i, chunk) in words.chunks(4).enumerate() {
        let line: String = chunk
            .iter()
            .enumerate()
            .map(|(j, word)| format!("{:2}. {:<12}", i * 4 + j + 1, word))
            .collect::<Vec<String>>()
            .join(" ");
        println!("  │ {} │", line);
    }

    println!("  └─────────────────────────────────────────────────────────┘");
    println!();
    println!("  Your Address:");
    println!("  {}", address);
    println!();
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Save address to wallet store (but NOT the mnemonic!)
    let mut store = WalletStore::load().unwrap_or_default();
    store.set_address("cardano", &address);
    store.save()?;

    println!();
    println!("  ✓ Address saved to wallet store");
    println!("  Use 'begin balance' to check your balance");
    println!();

    Ok(())
}
