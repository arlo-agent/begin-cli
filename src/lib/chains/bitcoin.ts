/**
 * Bitcoin chain adapter
 * Implements wallet creation, balance queries, transactions, and history
 * Uses BIP84 native SegWit (bc1...) addresses
 */

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import BIP32Factory from "bip32";
import ECPairFactory from "ecpair";
import * as bip39 from "bip39";
import type {
  IChainAdapter,
  ChainWallet,
  ChainBalance,
  ChainTransaction,
  SendTransactionParams,
  BitcoinNetwork,
} from "./types.js";

// Initialize ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

// Minimum output value to avoid dust (in satoshis)
const DUST_THRESHOLD_SATOSHIS = 546;

const BLOCKSTREAM_API: Record<BitcoinNetwork, string> = {
  mainnet: "https://blockstream.info/api",
  testnet: "https://blockstream.info/testnet/api",
};

const MEMPOOL_API = "https://mempool.space/api/v1";

interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
}

interface BlockstreamTx {
  txid: string;
  version: number;
  locktime: number;
  vin: Array<{
    txid: string;
    vout: number;
    prevout?: {
      scriptpubkey_address: string;
      value: number;
    };
  }>;
  vout: Array<{
    scriptpubkey_address: string;
    value: number;
  }>;
  size: number;
  weight: number;
  fee: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
}

export class BitcoinAdapter implements IChainAdapter {
  readonly chainId = "bitcoin" as const;
  private network: BitcoinNetwork;
  private bitcoinNetwork: bitcoin.Network;

  constructor(network: BitcoinNetwork = "mainnet") {
    this.network = network;
    this.bitcoinNetwork = network === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  }

  /**
   * Derive Bitcoin keypair from mnemonic using BIP84 path
   */
  private deriveKeyPair(
    mnemonic: string[],
    accountIndex: number = 0
  ): { keyPair: ReturnType<typeof ECPair.fromPrivateKey>; publicKey: Buffer } {
    const mnemonicStr = mnemonic.join(" ");
    const seed = bip39.mnemonicToSeedSync(mnemonicStr);

    // BIP84 path: m/84'/0'/accountIndex'/0/0 (mainnet)
    // For testnet: m/84'/1'/accountIndex'/0/0
    const coinType = this.network === "mainnet" ? 0 : 1;
    const path = `m/84'/${coinType}'/${accountIndex}'/0/0`;

    const root = bip32.fromSeed(seed, this.bitcoinNetwork);
    const child = root.derivePath(path);

    if (!child.privateKey) {
      throw new Error("Failed to derive private key");
    }

    const keyPair = ECPair.fromPrivateKey(child.privateKey, {
      network: this.bitcoinNetwork,
    });

    return { keyPair, publicKey: Buffer.from(child.publicKey) };
  }

  /**
   * Get native SegWit (P2WPKH) address from public key
   */
  private getSegwitAddress(publicKey: Buffer): string {
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: publicKey,
      network: this.bitcoinNetwork,
    });
    if (!address) {
      throw new Error("Failed to generate SegWit address");
    }
    return address;
  }

  async createWallet(mnemonic: string[], accountIndex: number = 0): Promise<ChainWallet> {
    const { publicKey } = this.deriveKeyPair(mnemonic, accountIndex);
    const address = this.getSegwitAddress(publicKey);

    return {
      address,
      publicKey: publicKey.toString("hex"),
    };
  }

  validateAddress(address: string): boolean {
    try {
      bitcoin.address.toOutputScript(address, this.bitcoinNetwork);
      return true;
    } catch {
      return false;
    }
  }

  async getBalance(address: string): Promise<ChainBalance> {
    const apiUrl = BLOCKSTREAM_API[this.network];

    const response = await fetch(`${apiUrl}/address/${address}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch balance: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
      mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
    };
    const { chain_stats, mempool_stats } = data;

    // Confirmed balance in satoshis
    const confirmedBalance = chain_stats.funded_txo_sum - chain_stats.spent_txo_sum;
    // Unconfirmed balance (pending)
    const unconfirmedBalance = mempool_stats.funded_txo_sum - mempool_stats.spent_txo_sum;

    const totalSatoshis = confirmedBalance + unconfirmedBalance;
    const btcBalance = totalSatoshis / 100_000_000;

    return {
      address,
      native: {
        amount: totalSatoshis.toString(),
        decimals: 8,
        symbol: "BTC",
        uiAmount: btcBalance,
      },
      tokens: [], // Bitcoin doesn't have native tokens
    };
  }

  async getTransactions(
    address: string,
    limit: number = 10
  ): Promise<ChainTransaction[]> {
    const apiUrl = BLOCKSTREAM_API[this.network];

    const response = await fetch(`${apiUrl}/address/${address}/txs`);
    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch transactions: ${response.statusText}`);
    }

    const txs = (await response.json()) as BlockstreamTx[];
    const transactions: ChainTransaction[] = [];

    for (const tx of txs.slice(0, limit)) {
      // Determine if this address is sender or receiver
      let type: ChainTransaction["type"] = "unknown";
      let from: string | undefined;
      let to: string | undefined;
      let amount: string | undefined;

      // Check inputs for this address (sending)
      const isInput = tx.vin.some(
        (input) => input.prevout?.scriptpubkey_address === address
      );

      // Check outputs for this address (receiving)
      const outputToAddress = tx.vout.find(
        (output) => output.scriptpubkey_address === address
      );

      if (isInput) {
        type = "send";
        from = address;
        // Find the output that's not change back to us
        const nonChangeOutput = tx.vout.find(
          (output) => output.scriptpubkey_address !== address
        );
        to = nonChangeOutput?.scriptpubkey_address;
        amount = nonChangeOutput
          ? (nonChangeOutput.value / 100_000_000).toFixed(8)
          : undefined;
      } else if (outputToAddress) {
        type = "receive";
        to = address;
        // Find the sender address from inputs
        from = tx.vin[0]?.prevout?.scriptpubkey_address;
        amount = (outputToAddress.value / 100_000_000).toFixed(8);
      }

      transactions.push({
        hash: tx.txid,
        blockNumber: tx.status.block_height,
        blockTime: tx.status.block_time,
        from,
        to,
        amount,
        fee: (tx.fee / 100_000_000).toFixed(8),
        status: tx.status.confirmed ? "confirmed" : "pending",
        type,
      });
    }

    return transactions;
  }

  /**
   * Get UTXOs for an address
   */
  private async getUTXOs(address: string): Promise<UTXO[]> {
    const apiUrl = BLOCKSTREAM_API[this.network];
    const response = await fetch(`${apiUrl}/address/${address}/utxo`);
    if (!response.ok) {
      throw new Error(`Failed to fetch UTXOs: ${response.statusText}`);
    }
    return (await response.json()) as UTXO[];
  }

  /**
   * Get fee rate from mempool.space
   */
  private async getFeeRate(): Promise<number> {
    try {
      const response = await fetch(`${MEMPOOL_API}/fees/recommended`);
      if (response.ok) {
        const data = (await response.json()) as {
          fastestFee?: number;
          hourFee?: number;
        };
        // Use fastestFee for priority, fallback to hourFee
        return data.fastestFee || data.hourFee || 10;
      }
    } catch {
      // Fallback to default fee rate
    }
    return 10; // satoshis per vbyte default
  }

  async buildTransaction(
    mnemonic: string[],
    params: SendTransactionParams,
    accountIndex: number = 0
  ): Promise<{ signedTx: string; fee: string }> {
    const { keyPair, publicKey } = this.deriveKeyPair(mnemonic, accountIndex);
    const fromAddress = this.getSegwitAddress(publicKey);

    // Get UTXOs
    const utxos = await this.getUTXOs(fromAddress);
    if (utxos.length === 0) {
      throw new Error("No UTXOs available");
    }

    // Get fee rate
    const feeRate = await this.getFeeRate();

    // Convert amount to satoshis
    const amountSatoshis = Math.floor(params.amount * 100_000_000);

    // Create payment for sender (for signing)
    const p2wpkh = bitcoin.payments.p2wpkh({
      pubkey: publicKey,
      network: this.bitcoinNetwork,
    });

    // Build PSBT (Partially Signed Bitcoin Transaction)
    const psbt = new bitcoin.Psbt({ network: this.bitcoinNetwork });

    // Sort UTXOs by value descending (use largest first)
    const sortedUtxos = [...utxos].sort((a, b) => b.value - a.value);

    // Add inputs and calculate total
    let totalInput = 0;
    const inputsAdded: UTXO[] = [];

    // Estimate transaction size: ~110 vbytes for 1 input + ~31 vbytes per additional input + ~31 vbytes per output
    // We'll estimate 2 outputs (recipient + change)
    let estimatedVsize = 110 + 31 * 2;

    for (const utxo of sortedUtxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: p2wpkh.output!,
          value: BigInt(utxo.value),
        },
      });

      totalInput += utxo.value;
      inputsAdded.push(utxo);

      // Update estimated size
      estimatedVsize = 110 + 31 * (inputsAdded.length - 1) + 31 * 2;
      const estimatedFee = Math.ceil(estimatedVsize * feeRate);

      // Check if we have enough
      if (totalInput >= amountSatoshis + estimatedFee) {
        break;
      }
    }

    // Calculate final fee
    const estimatedFee = Math.ceil(estimatedVsize * feeRate);

    if (totalInput < amountSatoshis + estimatedFee) {
      throw new Error(
        `Insufficient funds. Have ${totalInput / 100_000_000} BTC, need ${
          (amountSatoshis + estimatedFee) / 100_000_000
        } BTC (including fee)`
      );
    }

    // Add recipient output
    psbt.addOutput({
      address: params.to,
      value: BigInt(amountSatoshis),
    });

    // Add change output if significant
    const change = totalInput - amountSatoshis - estimatedFee;
    if (change > DUST_THRESHOLD_SATOSHIS) {
      psbt.addOutput({
        address: fromAddress,
        value: BigInt(change),
      });
    }

    // Sign all inputs
    for (let i = 0; i < inputsAdded.length; i++) {
      psbt.signInput(i, keyPair);
    }

    // Finalize and extract
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();

    return {
      signedTx: tx.toHex(),
      fee: (estimatedFee / 100_000_000).toFixed(8),
    };
  }

  async submitTransaction(signedTx: string): Promise<string> {
    const apiUrl = BLOCKSTREAM_API[this.network];

    const response = await fetch(`${apiUrl}/tx`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: signedTx,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to broadcast transaction: ${error}`);
    }

    // Blockstream API returns the txid as plain text
    const txid = await response.text();
    return txid;
  }

  async estimateFee(params: SendTransactionParams): Promise<string> {
    const feeRate = await this.getFeeRate();

    // Estimate transaction size (1 input, 2 outputs = ~140 vbytes typical)
    const estimatedVsize = 140;
    const estimatedFee = Math.ceil(estimatedVsize * feeRate);

    return (estimatedFee / 100_000_000).toFixed(8);
  }
}

/**
 * Create a Bitcoin adapter instance
 */
export function createBitcoinAdapter(network: BitcoinNetwork = "mainnet"): BitcoinAdapter {
  return new BitcoinAdapter(network);
}
