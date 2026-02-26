/**
 * EVM chain adapter
 * Supports multiple EVM networks: Ethereum, Base, Polygon, Arbitrum, Optimism, BNB Chain, Avalanche
 * Uses ethers v6 for wallet and transaction operations
 */

import { ethers } from "ethers";
import * as bip39 from "bip39";
import type {
  IChainAdapter,
  ChainWallet,
  ChainBalance,
  ChainTransaction,
  SendTransactionParams,
  EVMNetwork,
  TokenBalance,
} from "./types.js";

// BIP44 derivation path template for Ethereum (same for all EVM chains)
// Format: m/44'/60'/account'/0/0
const getEVMDerivationPath = (accountIndex: number): string =>
  `m/44'/60'/${accountIndex}'/0/0`;

// Network configurations
interface NetworkConfig {
  chainId: number;
  name: string;
  symbol: string;
  decimals: number;
  rpcUrl: string;
  explorerUrl: string;
  explorerApiUrl?: string;
}

const NETWORK_CONFIGS: Record<EVMNetwork, NetworkConfig> = {
  ethereum: {
    chainId: 1,
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
    rpcUrl: "https://eth.llamarpc.com",
    explorerUrl: "https://etherscan.io",
    explorerApiUrl: "https://api.etherscan.io/api",
  },
  base: {
    chainId: 8453,
    name: "Base",
    symbol: "ETH",
    decimals: 18,
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    explorerApiUrl: "https://api.basescan.org/api",
  },
  polygon: {
    chainId: 137,
    name: "Polygon",
    symbol: "MATIC",
    decimals: 18,
    rpcUrl: "https://polygon-rpc.com",
    explorerUrl: "https://polygonscan.com",
    explorerApiUrl: "https://api.polygonscan.com/api",
  },
  arbitrum: {
    chainId: 42161,
    name: "Arbitrum One",
    symbol: "ETH",
    decimals: 18,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
    explorerApiUrl: "https://api.arbiscan.io/api",
  },
  optimism: {
    chainId: 10,
    name: "Optimism",
    symbol: "ETH",
    decimals: 18,
    rpcUrl: "https://mainnet.optimism.io",
    explorerUrl: "https://optimistic.etherscan.io",
    explorerApiUrl: "https://api-optimistic.etherscan.io/api",
  },
  bnb: {
    chainId: 56,
    name: "BNB Chain",
    symbol: "BNB",
    decimals: 18,
    rpcUrl: "https://bsc-dataseed.binance.org",
    explorerUrl: "https://bscscan.com",
    explorerApiUrl: "https://api.bscscan.com/api",
  },
  avalanche: {
    chainId: 43114,
    name: "Avalanche C-Chain",
    symbol: "AVAX",
    decimals: 18,
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    explorerUrl: "https://snowtrace.io",
    explorerApiUrl: "https://api.snowtrace.io/api",
  },
};

// Environment variable names for RPC URLs
const RPC_ENV_VARS: Record<EVMNetwork, string> = {
  ethereum: "BEGIN_ETH_RPC",
  base: "BEGIN_BASE_RPC",
  polygon: "BEGIN_POLYGON_RPC",
  arbitrum: "BEGIN_ARBITRUM_RPC",
  optimism: "BEGIN_OPTIMISM_RPC",
  bnb: "BEGIN_BNB_RPC",
  avalanche: "BEGIN_AVALANCHE_RPC",
};

/**
 * Get RPC URL for a network, preferring environment variable over hardcoded default
 */
function getRpcUrl(network: EVMNetwork): string {
  const envVar = RPC_ENV_VARS[network];
  const envValue = process.env[envVar];
  if (envValue) {
    return envValue;
  }
  return NETWORK_CONFIGS[network].rpcUrl;
}

// Standard ERC-20 ABI for balance and transfer
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export class EVMAdapter implements IChainAdapter {
  readonly chainId = "evm" as const;
  private network: EVMNetwork;
  private provider: ethers.JsonRpcProvider;
  private config: NetworkConfig;

  constructor(network: EVMNetwork = "ethereum") {
    this.network = network;
    this.config = NETWORK_CONFIGS[network];
    this.provider = new ethers.JsonRpcProvider(getRpcUrl(network));
  }

  /**
   * Derive EVM wallet from mnemonic using BIP44 path
   */
  private deriveWallet(mnemonic: string[], accountIndex: number = 0): ethers.HDNodeWallet {
    const mnemonicStr = mnemonic.join(" ");

    // BIP44 path: m/44'/60'/account'/0/0
    const path = getEVMDerivationPath(accountIndex);

    const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonicStr, undefined, path);
    return hdNode;
  }

  async createWallet(mnemonic: string[], accountIndex: number = 0): Promise<ChainWallet> {
    const wallet = this.deriveWallet(mnemonic, accountIndex);

    return {
      address: wallet.address,
      publicKey: wallet.publicKey,
    };
  }

  validateAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  async getBalance(address: string): Promise<ChainBalance> {
    // Get native balance
    const nativeBalance = await this.provider.getBalance(address);
    const nativeUiAmount = Number(ethers.formatUnits(nativeBalance, this.config.decimals));

    const tokens: TokenBalance[] = [];

    // Note: For a full implementation, you'd want to query a token indexer
    // like Alchemy, Moralis, or Covalent to get all token balances
    // For now, we just return native balance

    return {
      address,
      native: {
        amount: nativeBalance.toString(),
        decimals: this.config.decimals,
        symbol: this.config.symbol,
        uiAmount: nativeUiAmount,
      },
      tokens,
    };
  }

  /**
   * Get ERC-20 token balance
   */
  async getTokenBalance(
    walletAddress: string,
    tokenAddress: string
  ): Promise<TokenBalance | null> {
    try {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      const [balance, decimals, symbol] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals(),
        contract.symbol(),
      ]);

      const uiAmount = Number(ethers.formatUnits(balance, decimals));

      return {
        mint: tokenAddress,
        symbol,
        amount: balance.toString(),
        decimals,
        uiAmount,
      };
    } catch {
      return null;
    }
  }

  async getTransactions(
    address: string,
    limit: number = 10
  ): Promise<ChainTransaction[]> {
    // For transaction history, we'd ideally use an explorer API
    // For now, return an empty array - the user can use block explorers
    // In production, integrate with Etherscan-compatible APIs

    const transactions: ChainTransaction[] = [];

    // Try to get recent blocks and find transactions
    // This is limited but works without API keys
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const blocksToCheck = Math.min(100, currentBlock);

      for (let i = 0; i < blocksToCheck && transactions.length < limit; i++) {
        const block = await this.provider.getBlock(currentBlock - i, true);
        if (!block || !block.prefetchedTransactions) continue;

        for (const tx of block.prefetchedTransactions) {
          if (
            tx.from?.toLowerCase() === address.toLowerCase() ||
            tx.to?.toLowerCase() === address.toLowerCase()
          ) {
            const isOutgoing = tx.from?.toLowerCase() === address.toLowerCase();

            transactions.push({
              hash: tx.hash,
              blockNumber: tx.blockNumber ?? undefined,
              blockTime: block.timestamp,
              from: tx.from,
              to: tx.to ?? undefined,
              amount: ethers.formatEther(tx.value),
              fee: tx.gasPrice
                ? ethers.formatEther(tx.gasPrice * (tx.gasLimit || 21000n))
                : undefined,
              status: "confirmed",
              type: isOutgoing ? "send" : "receive",
            });

            if (transactions.length >= limit) break;
          }
        }
      }
    } catch {
      // Fallback: return empty array
    }

    return transactions;
  }

  async buildTransaction(
    mnemonic: string[],
    params: SendTransactionParams,
    accountIndex: number = 0
  ): Promise<{ signedTx: string; fee: string }> {
    const hdWallet = this.deriveWallet(mnemonic, accountIndex);
    const wallet = hdWallet.connect(this.provider);

    let tx: ethers.TransactionRequest;
    let estimatedGas: bigint;

    if (params.token) {
      // ERC-20 token transfer
      const contract = new ethers.Contract(params.token, ERC20_ABI, wallet);
      const decimals = await contract.decimals();
      const amount = ethers.parseUnits(params.amount.toString(), decimals);

      // Encode the transfer call
      const data = contract.interface.encodeFunctionData("transfer", [params.to, amount]);

      tx = {
        to: params.token,
        data,
      };

      estimatedGas = await contract.transfer.estimateGas(params.to, amount);
    } else {
      // Native token transfer
      const value = ethers.parseEther(params.amount.toString());

      tx = {
        to: params.to,
        value,
      };

      estimatedGas = await this.provider.estimateGas({
        from: wallet.address,
        to: params.to,
        value,
      });
    }

    // Get current gas price
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits("20", "gwei");

    // Build transaction with gas parameters
    const nonce = await this.provider.getTransactionCount(wallet.address);

    const fullTx: ethers.TransactionRequest = {
      ...tx,
      from: wallet.address,
      nonce,
      gasLimit: (estimatedGas * 120n) / 100n, // Add 20% buffer
      gasPrice,
      chainId: this.config.chainId,
    };

    // Sign transaction
    const signedTx = await wallet.signTransaction(fullTx);

    // Calculate fee
    const fee = ethers.formatEther(gasPrice * estimatedGas);

    return {
      signedTx,
      fee,
    };
  }

  async submitTransaction(signedTx: string): Promise<string> {
    const txResponse = await this.provider.broadcastTransaction(signedTx);
    return txResponse.hash;
  }

  async estimateFee(params: SendTransactionParams): Promise<string> {
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits("20", "gwei");

    // Estimate gas for a simple transfer (21000 for native, more for tokens)
    const estimatedGas = params.token ? 65000n : 21000n;

    const fee = ethers.formatEther(gasPrice * estimatedGas);
    return fee;
  }

  /**
   * Get network configuration
   */
  getNetworkConfig(): NetworkConfig {
    return this.config;
  }

  /**
   * Get current network
   */
  getNetwork(): EVMNetwork {
    return this.network;
  }
}

/**
 * Create an EVM adapter instance
 */
export function createEVMAdapter(network: EVMNetwork = "ethereum"): EVMAdapter {
  return new EVMAdapter(network);
}

/**
 * Get all supported EVM networks
 */
export function getSupportedEVMNetworks(): EVMNetwork[] {
  return Object.keys(NETWORK_CONFIGS) as EVMNetwork[];
}

/**
 * Get network config by name
 */
export function getEVMNetworkConfig(network: EVMNetwork): NetworkConfig {
  return NETWORK_CONFIGS[network];
}
