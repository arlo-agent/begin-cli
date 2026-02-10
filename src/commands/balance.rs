//! Balance command - query wallet balance across chains

use anyhow::{bail, Result};

use crate::chains::{cardano, Chain};
use crate::wallet::WalletStore;

/// Execute the balance command
pub async fn execute(chain: &str, address: Option<&str>) -> Result<()> {
    let chain_impl = get_chain(chain)?;

    let address = match address {
        Some(addr) => addr.to_string(),
        None => {
            // Try to load from wallet store
            let store = WalletStore::load()?;
            store
                .get_address(chain)
                .ok_or_else(|| anyhow::anyhow!("No wallet configured for {}. Use 'begin new' or provide --address", chain))?
        }
    };

    println!("Querying {} balance for {}...", chain, &address[..20.min(address.len())]);

    let balance = chain_impl.get_balance(&address).await?;

    println!();
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("  {} Balance", chain.to_uppercase());
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("  Address: {}...", &address[..20.min(address.len())]);
    println!("  Balance: {} {}", balance.amount, balance.symbol);
    if !balance.tokens.is_empty() {
        println!();
        println!("  Tokens:");
        for token in &balance.tokens {
            println!("    {} {}", token.amount, token.symbol);
        }
    }
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    Ok(())
}

fn get_chain(name: &str) -> Result<Box<dyn Chain>> {
    match name.to_lowercase().as_str() {
        "cardano" | "ada" => Ok(Box::new(cardano::Cardano::new())),
        "bitcoin" | "btc" => bail!("Bitcoin support coming soon"),
        "solana" | "sol" => bail!("Solana support coming soon"),
        _ => bail!("Unknown chain: {}. Supported: cardano, bitcoin, solana", name),
    }
}
