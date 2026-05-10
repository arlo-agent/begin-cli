/**
 * Safe display labels for Cardano native assets (terminal / Ink friendly).
 */

import type { AssetRegistryFields } from "./blockfrost-asset.js";

/** Strip replacement chars from bad UTF-8 decode and non-printable ASCII. */
export function sanitizeUtf8Ticker(s: string): string {
  return s
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

/**
 * Prefer Blockfrost registry ticker/name, then sanitized on-chain UTF-8 name, then short hex.
 */
export function resolveCardanoAssetDisplayLabel(
  assetName: string,
  assetNameHex: string,
  registry: AssetRegistryFields | null
): string {
  const tick = registry?.ticker ? sanitizeUtf8Ticker(registry.ticker) : "";
  if (tick.length > 0) {
    return tick.length <= 32 ? tick : `${tick.slice(0, 29)}…`;
  }

  const longName = registry?.name ? sanitizeUtf8Ticker(registry.name.split(/\r?\n/)[0] ?? "") : "";
  if (longName.length > 0) {
    return longName.length <= 40 ? longName : `${longName.slice(0, 37)}…`;
  }

  const fromChain = sanitizeUtf8Ticker(assetName);
  if (fromChain.length > 0) {
    return fromChain.length <= 40 ? fromChain : `${fromChain.slice(0, 37)}…`;
  }

  if (assetNameHex.length >= 4) {
    return `${assetNameHex.slice(0, 12)}…`;
  }

  return "asset";
}
