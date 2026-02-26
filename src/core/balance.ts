/**
 * Core balance fetching logic
 *
 * Pure functions for fetching wallet/address balances.
 */

import { createProvider, hasApiKey, type Asset } from "../lib/provider.js";
import type { Network } from "../lib/config.js";

export interface TokenInfo {
  policyId: string;
  assetName: string;
  assetNameHex: string;
  quantity: string;
  unit: string;
}

export interface BalanceResult {
  address: string;
  network: Network;
  lovelace: string;
  ada: string;
  tokenCount: number;
  tokens: TokenInfo[];
  mock?: boolean;
}

export interface UtxoInfo {
  txHash: string;
  outputIndex: number;
  lovelace: string;
  ada: string;
  tokens: TokenInfo[];
  datumHash?: string;
  scriptRef?: boolean;
}

export interface UtxosResult {
  address: string;
  network: Network;
  utxoCount: number;
  totalLovelace: string;
  totalAda: string;
  utxos: UtxoInfo[];
  mock?: boolean;
}

function lovelaceToAda(lovelace: bigint): string {
  const whole = lovelace / 1_000_000n;
  const frac = lovelace % 1_000_000n;
  return `${whole.toString()}.${frac.toString().padStart(6, "0")}`;
}

function parseAssetUnit(unit: string): {
  policyId: string;
  assetName: string;
  assetNameHex: string;
} {
  const policyId = unit.slice(0, 56);
  const assetNameHex = unit.slice(56);
  let assetName = "";
  if (assetNameHex) {
    try {
      assetName = Buffer.from(assetNameHex, "hex").toString("utf8");
    } catch {
      assetName = assetNameHex;
    }
  }
  return { policyId, assetName, assetNameHex };
}

function getMockBalance(address: string, network: Network): BalanceResult {
  return {
    address,
    network,
    lovelace: "125430000",
    ada: "125.430000",
    tokenCount: 2,
    tokens: [
      {
        policyId: "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235",
        assetName: "HOSKY",
        assetNameHex: "484f534b59",
        quantity: "1000000",
        unit: "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59",
      },
      {
        policyId: "b0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235",
        assetName: "SNEK",
        assetNameHex: "534e454b",
        quantity: "500",
        unit: "b0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235534e454b",
      },
    ],
    mock: true,
  };
}

function getMockUtxos(address: string, network: Network): UtxosResult {
  const utxos: UtxoInfo[] = [
    {
      txHash: "abc123def456789abc123def456789abc123def456789abc123def456789abcd",
      outputIndex: 0,
      lovelace: "50000000",
      ada: "50.000000",
      tokens: [
        {
          policyId: "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235",
          assetName: "HOSKY",
          assetNameHex: "484f534b59",
          quantity: "1000000",
          unit: "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59",
        },
      ],
    },
    {
      txHash: "def456789abc123def456789abc123def456789abc123def456789abc123defa",
      outputIndex: 1,
      lovelace: "75430000",
      ada: "75.430000",
      tokens: [],
    },
  ];
  const totalLovelace = utxos.reduce((sum, u) => sum + BigInt(u.lovelace), 0n);
  return {
    address,
    network,
    utxoCount: utxos.length,
    totalLovelace: totalLovelace.toString(),
    totalAda: lovelaceToAda(totalLovelace),
    utxos,
    mock: true,
  };
}

/**
 * Fetch balance for a Cardano address
 */
export async function getBalance(address: string, network: Network): Promise<BalanceResult> {
  if (!hasApiKey(network)) {
    return getMockBalance(address, network);
  }

  const provider = createProvider(network);
  const utxos = await provider.fetchAddressUTxOs(address);

  let totalLovelace = 0n;
  const tokenMap = new Map<string, bigint>();

  for (const utxo of utxos) {
    for (const asset of utxo.output.amount as Asset[]) {
      if (asset.unit === "lovelace") {
        totalLovelace += BigInt(asset.quantity);
      } else {
        const current = tokenMap.get(asset.unit) || 0n;
        tokenMap.set(asset.unit, current + BigInt(asset.quantity));
      }
    }
  }

  const tokens: TokenInfo[] = [];
  for (const [unit, quantity] of tokenMap) {
    const { policyId, assetName, assetNameHex } = parseAssetUnit(unit);
    tokens.push({ policyId, assetName, assetNameHex, quantity: quantity.toString(), unit });
  }

  tokens.sort((a, b) => {
    if (a.policyId !== b.policyId) return a.policyId.localeCompare(b.policyId);
    return a.assetName.localeCompare(b.assetName);
  });

  return {
    address,
    network,
    lovelace: totalLovelace.toString(),
    ada: lovelaceToAda(totalLovelace),
    tokenCount: tokens.length,
    tokens,
  };
}

/**
 * Fetch UTXOs for a Cardano address
 */
export async function getUtxos(address: string, network: Network): Promise<UtxosResult> {
  if (!hasApiKey(network)) {
    return getMockUtxos(address, network);
  }

  const provider = createProvider(network);
  const rawUtxos = await provider.fetchAddressUTxOs(address);

  const utxos: UtxoInfo[] = rawUtxos.map((utxo) => {
    const lovelace = utxo.output.amount.find((a: Asset) => a.unit === "lovelace");
    const lovelaceStr = lovelace?.quantity || "0";
    const tokens = utxo.output.amount
      .filter((a: Asset) => a.unit !== "lovelace")
      .map((a: Asset) => ({
        ...parseAssetUnit(a.unit),
        quantity: a.quantity,
        unit: a.unit,
      }));

    return {
      txHash: utxo.input.txHash,
      outputIndex: utxo.input.outputIndex,
      lovelace: lovelaceStr,
      ada: lovelaceToAda(BigInt(lovelaceStr)),
      tokens,
      datumHash: utxo.output.dataHash || undefined,
      scriptRef: !!utxo.output.scriptRef,
    };
  });

  const totalLovelace = utxos.reduce((sum, u) => sum + BigInt(u.lovelace), 0n);

  return {
    address,
    network,
    utxoCount: utxos.length,
    totalLovelace: totalLovelace.toString(),
    totalAda: lovelaceToAda(totalLovelace),
    utxos,
  };
}
