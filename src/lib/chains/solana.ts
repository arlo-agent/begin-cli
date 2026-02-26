/**
 * Solana chain adapter
 * Implements wallet creation, balance queries, transactions, and history
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmRawTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  AccountLayout,
} from "@solana/spl-token";
import { derivePath } from "ed25519-hd-key";
import * as bip39 from "bip39";
import type {
  IChainAdapter,
  ChainWallet,
  ChainBalance,
  ChainTransaction,
  SendTransactionParams,
  TokenBalance,
  SolanaNetwork,
} from "./types.js";

const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";

/**
 * Parse a decimal amount string to bigint without floating-point
 * @param amountStr - Amount as string (e.g., "1.5", "100", "0.000000001")
 * @param decimals - Number of decimal places for the token
 * @returns BigInt representation of the smallest unit
 */
function parseAmount(amountStr: string, decimals: number): bigint {
  const [intPart, decPart = ""] = amountStr.split(".");
  const paddedDecPart = decPart.padEnd(decimals, "0").slice(0, decimals);
  const fullStr = intPart + paddedDecPart;
  return BigInt(fullStr);
}

const RPC_URLS: Record<SolanaNetwork, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

export class SolanaAdapter implements IChainAdapter {
  readonly chainId = "solana" as const;
  private connection: Connection;
  private network: SolanaNetwork;

  constructor(network: SolanaNetwork = "mainnet-beta") {
    this.network = network;
    const rpcUrl = process.env.BEGIN_SOLANA_RPC || RPC_URLS[network];
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  /**
   * Derive Solana keypair from mnemonic using BIP44 path
   */
  private deriveKeypair(mnemonic: string[], accountIndex: number = 0): Keypair {
    const mnemonicStr = mnemonic.join(" ");
    const seed = bip39.mnemonicToSeedSync(mnemonicStr);

    // BIP44 path for Solana: m/44'/501'/accountIndex'/0'
    const path =
      accountIndex === 0 ? SOLANA_DERIVATION_PATH : `m/44'/501'/${accountIndex}'/0'`;

    const { key } = derivePath(path, seed.toString("hex"));
    return Keypair.fromSeed(key);
  }

  async createWallet(mnemonic: string[], accountIndex: number = 0): Promise<ChainWallet> {
    const keypair = this.deriveKeypair(mnemonic, accountIndex);
    return {
      address: keypair.publicKey.toBase58(),
      publicKey: keypair.publicKey.toBase58(),
    };
  }

  validateAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  async getBalance(address: string): Promise<ChainBalance> {
    const pubkey = new PublicKey(address);

    // Get native SOL balance
    const lamports = await this.connection.getBalance(pubkey);
    const solBalance = lamports / LAMPORTS_PER_SOL;

    // Get SPL token accounts
    const tokens: TokenBalance[] = [];

    // Query both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID
    for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
      try {
        const tokenAccounts = await this.connection.getTokenAccountsByOwner(pubkey, {
          programId,
        });

        for (const { account } of tokenAccounts.value) {
          try {
            const data = AccountLayout.decode(account.data);
            const mint = new PublicKey(data.mint).toBase58();
            const amount = data.amount.toString();

            // Get mint info for decimals
            let decimals = 9; // Default
            try {
              const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(mint));
              if (mintInfo.value?.data && "parsed" in mintInfo.value.data) {
                decimals = mintInfo.value.data.parsed.info.decimals;
              }
            } catch {
              // Use default decimals
            }

            const uiAmount = Number(amount) / Math.pow(10, decimals);

            if (uiAmount > 0) {
              tokens.push({
                mint,
                amount,
                decimals,
                uiAmount,
              });
            }
          } catch {
            // Skip malformed accounts
          }
        }
      } catch {
        // Skip if program query fails
      }
    }

    return {
      address,
      native: {
        amount: lamports.toString(),
        decimals: 9,
        symbol: "SOL",
        uiAmount: solBalance,
      },
      tokens,
    };
  }

  async getTransactions(
    address: string,
    limit: number = 10,
    beforeSignature?: string
  ): Promise<ChainTransaction[]> {
    const pubkey = new PublicKey(address);

    const signatures = await this.connection.getSignaturesForAddress(pubkey, {
      limit,
      before: beforeSignature,
    });

    const transactions: ChainTransaction[] = [];

    for (const sig of signatures) {
      try {
        const tx = await this.connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx) continue;

        // Extract basic transaction info
        let from: string | undefined;
        let to: string | undefined;
        let amount: string | undefined;
        let type: ChainTransaction["type"] = "unknown";

        // Check for SOL transfers
        const instructions = tx.transaction.message.instructions;
        for (const ix of instructions) {
          if ("parsed" in ix && ix.program === "system" && ix.parsed?.type === "transfer") {
            from = ix.parsed.info.source;
            to = ix.parsed.info.destination;
            amount = (Number(ix.parsed.info.lamports) / LAMPORTS_PER_SOL).toString();
            type = from === address ? "send" : "receive";
            break;
          }
        }

        transactions.push({
          hash: sig.signature,
          blockNumber: tx.slot,
          blockTime: tx.blockTime ?? undefined,
          from,
          to,
          amount,
          fee: tx.meta?.fee ? (tx.meta.fee / LAMPORTS_PER_SOL).toString() : undefined,
          status: sig.err ? "failed" : "confirmed",
          type,
        });
      } catch {
        // Skip failed transaction fetches
        transactions.push({
          hash: sig.signature,
          blockTime: sig.blockTime ?? undefined,
          status: sig.err ? "failed" : "confirmed",
          type: "unknown",
        });
      }
    }

    return transactions;
  }

  async buildTransaction(
    mnemonic: string[],
    params: SendTransactionParams,
    accountIndex: number = 0
  ): Promise<{ signedTx: string; fee: string }> {
    const keypair = this.deriveKeypair(mnemonic, accountIndex);
    const fromPubkey = keypair.publicKey;
    const toPubkey = new PublicKey(params.to);

    const transaction = new Transaction();

    // Add compute budget for priority fee
    const priorityFee = await this.getPriorityFee();
    if (priorityFee > 0) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee,
        })
      );
    }

    let fee: number;

    if (params.token) {
      // SPL token transfer
      const mintPubkey = new PublicKey(params.token);

      // Determine which token program owns this mint
      const mintInfo = await this.connection.getAccountInfo(mintPubkey);
      const tokenProgramId = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      // Get or create associated token accounts
      const fromAta = await getAssociatedTokenAddress(mintPubkey, fromPubkey, false, tokenProgramId);
      const toAta = await getAssociatedTokenAddress(mintPubkey, toPubkey, false, tokenProgramId);

      // Check if recipient ATA exists
      const toAtaInfo = await this.connection.getAccountInfo(toAta);
      if (!toAtaInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            fromPubkey,
            toAta,
            toPubkey,
            mintPubkey,
            tokenProgramId
          )
        );
      }

      // Get mint decimals
      const mintAccountInfo = await this.connection.getParsedAccountInfo(mintPubkey);
      let decimals = 9;
      if (mintAccountInfo.value?.data && "parsed" in mintAccountInfo.value.data) {
        decimals = mintAccountInfo.value.data.parsed.info.decimals;
      }

      const amountLamports = parseAmount(String(params.amount), decimals);

      transaction.add(
        createTransferInstruction(fromAta, toAta, fromPubkey, amountLamports, [], tokenProgramId)
      );

      // Estimate fee with simulation
      fee = await this.estimateFeeForTransaction(transaction, fromPubkey);
    } else {
      // Native SOL transfer
      const lamports = parseAmount(String(params.amount), 9);

      transaction.add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports,
        })
      );

      fee = await this.estimateFeeForTransaction(transaction, fromPubkey);
    }

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = fromPubkey;

    // Sign transaction
    transaction.sign(keypair);

    const signedTx = transaction.serialize().toString("base64");
    const feeInSol = fee / LAMPORTS_PER_SOL;

    return {
      signedTx,
      fee: feeInSol.toFixed(9),
    };
  }

  async submitTransaction(signedTx: string): Promise<string> {
    const txBuffer = Buffer.from(signedTx, "base64");
    const signature = await sendAndConfirmRawTransaction(this.connection, txBuffer, {
      commitment: "confirmed",
    });
    return signature;
  }

  async estimateFee(params: SendTransactionParams): Promise<string> {
    // Create a dummy transaction to estimate fee
    const dummyKeypair = Keypair.generate();
    const toPubkey = new PublicKey(params.to);

    const transaction = new Transaction();

    if (params.token) {
      // For token transfers, estimate with ATA creation + transfer
      const mintPubkey = new PublicKey(params.token);
      const fromAta = await getAssociatedTokenAddress(mintPubkey, dummyKeypair.publicKey);
      const toAta = await getAssociatedTokenAddress(mintPubkey, toPubkey);

      transaction.add(
        createAssociatedTokenAccountInstruction(
          dummyKeypair.publicKey,
          toAta,
          toPubkey,
          mintPubkey
        )
      );
      transaction.add(createTransferInstruction(fromAta, toAta, dummyKeypair.publicKey, 1));
    } else {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: dummyKeypair.publicKey,
          toPubkey,
          lamports: parseAmount(String(params.amount), 9),
        })
      );
    }

    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = dummyKeypair.publicKey;

    const fee = await this.connection.getFeeForMessage(transaction.compileMessage());
    const feeInSol = (fee.value || 5000) / LAMPORTS_PER_SOL;

    return feeInSol.toFixed(9);
  }

  private async getPriorityFee(): Promise<number> {
    try {
      const fees = await this.connection.getRecentPrioritizationFees();
      if (fees.length === 0) return 0;

      // Use median priority fee
      const sorted = fees.map((f) => f.prioritizationFee).sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    } catch {
      return 0;
    }
  }

  private async estimateFeeForTransaction(
    transaction: Transaction,
    feePayer: PublicKey
  ): Promise<number> {
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = feePayer;

    const fee = await this.connection.getFeeForMessage(transaction.compileMessage());
    return fee.value || 5000;
  }
}

/**
 * Create a Solana adapter instance
 */
export function createSolanaAdapter(network: SolanaNetwork = "mainnet-beta"): SolanaAdapter {
  return new SolanaAdapter(network);
}
