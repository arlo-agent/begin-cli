/**
 * Blockfrost REST helpers for Cardano asset metadata (decimals, etc.)
 */

import type { Network } from "./config.js";
import { getBlockfrostApiKey } from "./provider.js";

const BASE_URLS: Record<Network, string> = {
  mainnet: "https://cardano-mainnet.blockfrost.io/api/v0",
  preprod: "https://cardano-preprod.blockfrost.io/api/v0",
  preview: "https://cardano-preview.blockfrost.io/api/v0",
};

interface BlockfrostAssetResponse {
  metadata?: {
    decimals?: number;
    ticker?: string;
    name?: string;
  } | null;
}

const MAX_DECIMALS = 30;

/** Fields from Blockfrost / token registry (when present). */
export interface AssetRegistryFields {
  decimals: number;
  ticker?: string;
  name?: string;
}

/**
 * Fetch decimals and optional registry ticker/name in one request.
 * Returns null only when the HTTP request fails or is unauthorized.
 */
export async function fetchAssetMetadata(
  network: Network,
  unit: string
): Promise<AssetRegistryFields | null> {
  const apiKey = getBlockfrostApiKey(network);
  if (!apiKey) return null;

  const base = BASE_URLS[network];
  const url = `${base}/assets/${encodeURIComponent(unit)}`;

  try {
    const res = await fetch(url, { headers: { project_id: apiKey } });
    if (!res.ok) return null;
    const body = (await res.json()) as BlockfrostAssetResponse;
    const meta = body.metadata;
    let decimals = 0;
    const d = meta?.decimals;
    if (typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= MAX_DECIMALS) {
      decimals = d;
    }
    const ticker = typeof meta?.ticker === "string" ? meta.ticker : undefined;
    const name = typeof meta?.name === "string" ? meta.name : undefined;
    return { decimals, ticker, name };
  } catch {
    return null;
  }
}

/**
 * @deprecated Prefer fetchAssetMetadata when you also need a display label.
 */
export async function getAssetDecimals(network: Network, unit: string): Promise<number> {
  const m = await fetchAssetMetadata(network, unit);
  return m?.decimals ?? 0;
}
