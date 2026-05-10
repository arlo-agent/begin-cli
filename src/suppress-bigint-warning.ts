/**
 * Suppress the harmless "bigint: Failed to load bindings, pure JS will be used" warning
 * from bigint-buffer (pulled in by @solana/spl-token). The pure JS fallback works fine.
 */
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = typeof args[0] === "string" ? args[0] : String(args[0] ?? "");
  if (msg.includes("bigint: Failed to load bindings")) return;
  originalWarn.apply(console, args);
};
