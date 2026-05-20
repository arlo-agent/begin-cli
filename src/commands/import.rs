//! Import wallet command - restore from mnemonic

use anyhow::{bail, Result};
use std::io::{self, Write};

use crate::chains::cardano;
use crate::wallet::WalletStore;

/// Execute the import command
pub fn execute(chain: &str) -> Result<()> {
    match chain.to_lowercase().as_str() {
        "cardano" | "ada" => import_cardano_wallet(),
        "bitcoin" | "btc" => bail!("Bitcoin wallet import coming soon"),
        "solana" | "sol" => bail!("Solana wallet import coming soon"),
        _ => bail!("Unknown chain: {}", chain),
    }
}

fn import_cardano_wallet() -> Result<()> {
    println!();
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("  Import Cardano Wallet");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!();
    println!("  Enter your 24-word recovery phrase:");
    println!("  (words separated by spaces)");
    println!();

    print!("  > ");
    io::stdout().flush()?;

    let mut phrase = String::new();
    io::stdin().read_line(&mut phrase)?;
    let phrase = phrase.trim();

    // Validate word count
    let word_count = phrase.split_whitespace().count();
    if word_count != 24 && word_count != 12 && word_count != 15 {
        bail!("Invalid recovery phrase. Expected 12, 15, or 24 words, got {}", word_count);
    }

    // Derive address
    let address = cardano::derive_address_from_mnemonic(phrase)?;

    println!();
    println!("  ✓ Wallet imported successfully!");
    println!();
    println!("  Your Address:");
    println!("  {}", address);
    println!();

    // Save to wallet store
    let mut store = WalletStore::load().unwrap_or_default();
    store.set_address("cardano", &address);
    store.save()?;

    println!("  ✓ Address saved to wallet store");
    println!("  Use 'begin balance' to check your balance");
    println!();
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    Ok(())
}
