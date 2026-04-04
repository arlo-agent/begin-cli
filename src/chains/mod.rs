//! Chain adapters for different blockchains
//!
//! Each chain implements the `Chain` trait providing a unified interface
//! for balance queries, transactions, and address derivation.

pub mod cardano;

use anyhow::Result;
use async_trait::async_trait;

/// Token balance information
#[derive(Debug, Clone)]
pub struct TokenBalance {
    pub symbol: String,
    pub amount: String,
    pub policy_id: Option<String>,
}

/// Wallet balance for a chain
#[derive(Debug, Clone)]
pub struct Balance {
    /// Native token symbol (ADA, BTC, SOL)
    pub symbol: String,
    /// Native token amount (human-readable)
    pub amount: String,
    /// Additional tokens (NFTs, native tokens)
    pub tokens: Vec<TokenBalance>,
}

/// Transaction result
#[derive(Debug, Clone)]
pub struct TransactionResult {
    pub tx_hash: String,
    pub status: TransactionStatus,
}

#[derive(Debug, Clone)]
pub enum TransactionStatus {
    Pending,
    Confirmed,
    Failed(String),
}

/// Unified chain interface
#[async_trait]
pub trait Chain: Send + Sync {
    /// Get the chain name
    fn name(&self) -> &str;

    /// Get the native token symbol
    fn symbol(&self) -> &str;

    /// Query balance for an address
    async fn get_balance(&self, address: &str) -> Result<Balance>;

    /// Send funds to an address (requires wallet keys)
    async fn send(&self, to: &str, amount: &str, private_key: &[u8]) -> Result<TransactionResult>;

    /// Validate an address format
    fn validate_address(&self, address: &str) -> bool;
}
