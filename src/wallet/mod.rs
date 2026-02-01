//! Wallet management - store and retrieve wallet addresses
//!
//! Note: This stores addresses only, NOT private keys or mnemonics.
//! Keys should be managed securely by the user.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Wallet store - persists wallet addresses locally
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct WalletStore {
    /// Chain name -> address mapping
    addresses: HashMap<String, String>,

    /// Active wallet name (for future multi-wallet support)
    #[serde(default)]
    active_wallet: Option<String>,
}

impl WalletStore {
    /// Load wallet store from disk
    pub fn load() -> Result<Self> {
        let path = Self::store_path()?;

        if !path.exists() {
            return Ok(Self::default());
        }

        let contents = fs::read_to_string(&path)?;
        let store: WalletStore = serde_json::from_str(&contents)?;

        Ok(store)
    }

    /// Save wallet store to disk
    pub fn save(&self) -> Result<()> {
        let path = Self::store_path()?;

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let contents = serde_json::to_string_pretty(self)?;
        fs::write(&path, contents)?;

        Ok(())
    }

    /// Get the store file path
    fn store_path() -> Result<PathBuf> {
        let config_dir = dirs_next::config_dir()
            .or_else(dirs_next::home_dir)
            .unwrap_or_else(|| PathBuf::from("."));

        Ok(config_dir.join("begin-cli").join("wallets.json"))
    }

    /// Get address for a chain
    pub fn get_address(&self, chain: &str) -> Option<String> {
        self.addresses.get(&chain.to_lowercase()).cloned()
    }

    /// Set address for a chain
    pub fn set_address(&mut self, chain: &str, address: &str) {
        self.addresses.insert(chain.to_lowercase(), address.to_string());
    }

    /// List all stored addresses
    pub fn list_addresses(&self) -> &HashMap<String, String> {
        &self.addresses
    }

    /// Remove address for a chain
    pub fn remove_address(&mut self, chain: &str) -> Option<String> {
        self.addresses.remove(&chain.to_lowercase())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wallet_store_roundtrip() {
        let mut store = WalletStore::default();
        store.set_address("cardano", "addr1test123");
        store.set_address("bitcoin", "bc1test456");

        assert_eq!(store.get_address("cardano"), Some("addr1test123".to_string()));
        assert_eq!(store.get_address("CARDANO"), Some("addr1test123".to_string())); // case insensitive
        assert_eq!(store.get_address("bitcoin"), Some("bc1test456".to_string()));
        assert_eq!(store.get_address("solana"), None);
    }
}
