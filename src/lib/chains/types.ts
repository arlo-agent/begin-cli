/**
 * Multi-chain wallet types and interfaces
 */

export type ChainId = "cardano" | "solana" | "bitcoin" | "evm";

export type SolanaNetwork = "mainnet-beta" | "devnet" | "testnet";
export type BitcoinNetwork = "mainnet" | "testnet";
export type EVMNetwork =
  | "ethereum"
  | "base"
  | "polygon"
  | "arbitrum"
  | "optimism"
  | "bnb"
  | "avalanche";

export interface TokenBalance {
  mint: string;
  symbol?: string;
  name?: string;
  amount: string;
  decimals: number;
  uiAmount: number;
}

export interface ChainBalance {
  address: string;
  native: {
    amount: string;
    decimals: number;
    symbol: string;
    uiAmount: number;
  };
  tokens: TokenBalance[];
}

export interface ChainTransaction {
  hash: string;
  blockNumber?: number;
  blockTime?: number;
  from?: string;
  to?: string;
  amount?: string;
  fee?: string;
  status: "confirmed" | "pending" | "failed";
  type?: "send" | "receive" | "swap" | "unknown";
}

export interface ChainWallet {
  address: string;
  publicKey: string;
}

export interface SendTransactionParams {
  to: string;
  amount: number; // In display units (SOL, BTC, ETH)
  token?: string; // Optional token mint/contract for token transfers
}

export interface SendTransactionResult {
  txHash: string;
  fee: string;
}

export interface IChainAdapter {
  readonly chainId: ChainId;

  /**
   * Create a wallet from a mnemonic
   */
  createWallet(mnemonic: string[], accountIndex?: number): Promise<ChainWallet>;

  /**
   * Validate an address format
   */
  validateAddress(address: string): boolean;

  /**
   * Get balance (native + tokens)
   */
  getBalance(address: string): Promise<ChainBalance>;

  /**
   * Get transaction history
   */
  getTransactions(
    address: string,
    limit?: number,
    beforeSignature?: string
  ): Promise<ChainTransaction[]>;

  /**
   * Build and sign a transaction (returns signed tx ready to submit)
   */
  buildTransaction(
    mnemonic: string[],
    params: SendTransactionParams,
    accountIndex?: number
  ): Promise<{ signedTx: string; fee: string }>;

  /**
   * Submit a signed transaction
   */
  submitTransaction(signedTx: string): Promise<string>;

  /**
   * Estimate fee for a transaction
   */
  estimateFee(params: SendTransactionParams): Promise<string>;
}

/**
 * Chain-specific wallet data stored in wallet file
 */
export interface CardanoWalletData {
  networkId: 0 | 1;
  addresses: {
    payment: string;
    stake?: string;
  };
}

export interface SolanaWalletData {
  address: string;
  publicKey: string;
}

export interface BitcoinWalletData {
  address: string;
  publicKey: string;
}

export interface EVMWalletData {
  address: string;
}

export interface MultiChainAddresses {
  cardano?: CardanoWalletData;
  solana?: SolanaWalletData;
  bitcoin?: BitcoinWalletData;
  evm?: EVMWalletData;
}
