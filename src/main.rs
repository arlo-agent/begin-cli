//! begin-cli - Multi-chain wallet CLI
//!
//! A command-line wallet supporting Cardano, Bitcoin, and Solana.

mod chains;
mod commands;
mod ui;
mod wallet;

use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "begin")]
#[command(author, version, about = "Multi-chain wallet CLI", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Show wallet balance
    Balance {
        /// Chain to query (cardano, bitcoin, solana)
        #[arg(short, long, default_value = "cardano")]
        chain: String,

        /// Wallet address (uses configured wallet if not provided)
        #[arg(short, long)]
        address: Option<String>,
    },

    /// Send funds to an address
    Send {
        /// Recipient address
        address: String,

        /// Amount to send
        amount: String,

        /// Chain to use (cardano, bitcoin, solana)
        #[arg(short, long, default_value = "cardano")]
        chain: String,
    },

    /// Generate a new wallet
    New {
        /// Chain for the wallet (cardano, bitcoin, solana)
        #[arg(short, long, default_value = "cardano")]
        chain: String,
    },

    /// Import an existing wallet
    Import {
        /// Chain for the wallet
        #[arg(short, long, default_value = "cardano")]
        chain: String,
    },

    /// Launch interactive TUI
    Ui,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Balance { chain, address } => {
            commands::balance::execute(&chain, address.as_deref()).await?;
        }
        Commands::Send {
            address,
            amount,
            chain,
        } => {
            commands::send::execute(&chain, &address, &amount).await?;
        }
        Commands::New { chain } => {
            commands::new_wallet::execute(&chain)?;
        }
        Commands::Import { chain } => {
            commands::import::execute(&chain)?;
        }
        Commands::Ui => {
            ui::run()?;
        }
    }

    Ok(())
}
