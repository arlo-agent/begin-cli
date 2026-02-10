//! Send command - transfer funds to an address

use anyhow::{bail, Result};

/// Execute the send command
pub async fn execute(chain: &str, address: &str, amount: &str) -> Result<()> {
    // Parse amount
    let amount_value: f64 = amount.parse().map_err(|_| anyhow::anyhow!("Invalid amount: {}", amount))?;

    if amount_value <= 0.0 {
        bail!("Amount must be positive");
    }

    match chain.to_lowercase().as_str() {
        "cardano" | "ada" => {
            println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            println!("  Cardano Transaction");
            println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            println!("  To: {}...", &address[..20.min(address.len())]);
            println!("  Amount: {} ADA", amount_value);
            println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            println!();
            println!("⚠️  Transaction signing not yet implemented.");
            println!("    This requires wallet keys to be loaded.");
            println!();
            println!("Coming in next release:");
            println!("  - Load wallet from mnemonic/key file");
            println!("  - Build and sign transaction");
            println!("  - Submit to network");
        }
        "bitcoin" | "btc" => bail!("Bitcoin support coming soon"),
        "solana" | "sol" => bail!("Solana support coming soon"),
        _ => bail!("Unknown chain: {}", chain),
    }

    Ok(())
}
