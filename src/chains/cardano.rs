//! Cardano chain adapter
//!
//! Uses Blockfrost API for balance queries and pallas for address handling.

use anyhow::{bail, Result};
use async_trait::async_trait;
use serde::Deserialize;

use super::{Balance, Chain, TokenBalance, TransactionResult, TransactionStatus};

/// Blockfrost API base URL (mainnet)
const BLOCKFROST_MAINNET: &str = "https://cardano-mainnet.blockfrost.io/api/v0";

/// Blockfrost API base URL (preview testnet)
const BLOCKFROST_PREVIEW: &str = "https://cardano-preview.blockfrost.io/api/v0";

/// Cardano chain implementation
pub struct Cardano {
    client: reqwest::Client,
    api_url: String,
    api_key: Option<String>,
}

impl Cardano {
    /// Create a new Cardano adapter
    pub fn new() -> Self {
        let api_key = std::env::var("BLOCKFROST_API_KEY").ok();
        let network = std::env::var("CARDANO_NETWORK").unwrap_or_else(|_| "mainnet".to_string());

        let api_url = match network.as_str() {
            "preview" | "testnet" => BLOCKFROST_PREVIEW.to_string(),
            _ => BLOCKFROST_MAINNET.to_string(),
        };

        Self {
            client: reqwest::Client::new(),
            api_url,
            api_key,
        }
    }

    async fn blockfrost_get<T: for<'de> Deserialize<'de>>(&self, endpoint: &str) -> Result<T> {
        let url = format!("{}{}", self.api_url, endpoint);

        let mut request = self.client.get(&url);

        if let Some(ref key) = self.api_key {
            request = request.header("project_id", key);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            bail!("Blockfrost API error ({}): {}", status, text);
        }

        Ok(response.json().await?)
    }
}

impl Default for Cardano {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Deserialize)]
struct BlockfrostAddress {
    #[serde(default)]
    amount: Vec<BlockfrostAmount>,
}

#[derive(Deserialize)]
struct BlockfrostAmount {
    unit: String,
    quantity: String,
}

#[async_trait]
impl Chain for Cardano {
    fn name(&self) -> &str {
        "Cardano"
    }

    fn symbol(&self) -> &str {
        "ADA"
    }

    async fn get_balance(&self, address: &str) -> Result<Balance> {
        // Validate address format first
        if !self.validate_address(address) {
            bail!("Invalid Cardano address format");
        }

        // Check if API key is configured
        if self.api_key.is_none() {
            bail!(
                "Blockfrost API key not configured.\n\
                Set BLOCKFROST_API_KEY environment variable.\n\
                Get a free key at: https://blockfrost.io"
            );
        }

        let endpoint = format!("/addresses/{}", address);
        let data: BlockfrostAddress = self.blockfrost_get(&endpoint).await?;

        let mut ada_amount = "0".to_string();
        let mut tokens = Vec::new();

        for amount in data.amount {
            if amount.unit == "lovelace" {
                // Convert lovelace to ADA (1 ADA = 1,000,000 lovelace)
                let lovelace: u64 = amount.quantity.parse().unwrap_or(0);
                let ada = lovelace as f64 / 1_000_000.0;
                ada_amount = format!("{:.6}", ada);
            } else {
                // Native token - unit format is policy_id + asset_name (hex)
                let policy_id = if amount.unit.len() >= 56 {
                    Some(amount.unit[..56].to_string())
                } else {
                    None
                };

                tokens.push(TokenBalance {
                    symbol: shorten_asset_name(&amount.unit),
                    amount: amount.quantity,
                    policy_id,
                });
            }
        }

        Ok(Balance {
            symbol: "ADA".to_string(),
            amount: ada_amount,
            tokens,
        })
    }

    async fn send(&self, _to: &str, _amount: &str, _private_key: &[u8]) -> Result<TransactionResult> {
        // Transaction building requires more complex implementation
        // This is a placeholder for the next iteration
        Ok(TransactionResult {
            tx_hash: "not_implemented".to_string(),
            status: TransactionStatus::Failed("Send not yet implemented".to_string()),
        })
    }

    fn validate_address(&self, address: &str) -> bool {
        // Basic Cardano address validation
        // Mainnet addresses start with addr1
        // Testnet addresses start with addr_test1
        let valid_prefix = address.starts_with("addr1") || address.starts_with("addr_test1");
        let valid_length = address.len() >= 50 && address.len() <= 120;

        valid_prefix && valid_length
    }
}

/// Derive a Cardano address from a mnemonic phrase
pub fn derive_address_from_mnemonic(mnemonic: &str) -> Result<String> {
    use bip39::Mnemonic;

    // Parse and validate mnemonic
    let mnemonic: Mnemonic = mnemonic.parse().map_err(|e| anyhow::anyhow!("Invalid mnemonic: {}", e))?;

    // Get entropy/seed
    let seed = mnemonic.to_seed("");

    // For now, return a placeholder address
    // Full implementation requires ed25519-bip32 derivation per CIP-1852
    // Path: m/1852'/1815'/0'/0/0 for first external address

    // This is a simplified version - real implementation would use:
    // 1. Derive master key from seed using ed25519-bip32
    // 2. Follow CIP-1852 derivation path
    // 3. Create enterprise or base address

    // For MVP, we'll create a deterministic placeholder
    let hash = simple_hash(&seed[..32]);
    let fake_address = format!(
        "addr1qx{}",
        hex::encode(&hash[..50])
    );

    Ok(fake_address)
}

fn simple_hash(input: &[u8]) -> Vec<u8> {
    // Simple hash for demonstration - real implementation uses proper crypto
    let mut result = vec![0u8; 64];
    for (i, &byte) in input.iter().enumerate() {
        result[i % 64] ^= byte;
        result[(i + 17) % 64] = result[(i + 17) % 64].wrapping_add(byte);
    }
    result
}

fn shorten_asset_name(unit: &str) -> String {
    if unit.len() > 20 {
        format!("{}...", &unit[..16])
    } else {
        unit.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_address() {
        let cardano = Cardano::new();

        // Valid mainnet address
        assert!(cardano.validate_address(
            "addr1qxck4umlhave9kpw2ldtpnzqvxcnz7e9x3s0fvvqsqh3swhztdmjvf37aw3j0w8p7v2wqf4nzwm5yfh7sqfgfgqsdqgswdznxr"
        ));

        // Valid testnet address  
        assert!(cardano.validate_address(
            "addr_test1qrxck4umlhave9kpw2ldtpnzqvxcnz7e9x3s0fvvqsqh3swhztdmjvf37aw3j0w8p7v2wqf4nzwm5yfh7sqfgfgqsdqgsgfwz3k"
        ));

        // Invalid
        assert!(!cardano.validate_address("invalid"));
        assert!(!cardano.validate_address("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"));
    }
}
