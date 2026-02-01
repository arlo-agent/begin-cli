import { BeginError } from './errors.js';

export interface JsonSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface JsonError {
  success: false;
  error: string;
  code: string;
}

export type JsonOutput<T = unknown> = JsonSuccess<T> | JsonError;

/**
 * Output context for commands
 */
export interface OutputContext {
  json: boolean;
}

/**
 * Print JSON success output and exit
 */
export function outputSuccess<T>(data: T, ctx: OutputContext): void {
  if (ctx.json) {
    const output: JsonSuccess<T> = { success: true, data };
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  }
}

/**
 * Print JSON error output and exit
 */
export function outputError(error: Error | BeginError, ctx: OutputContext): never {
  const exitCode = error instanceof BeginError ? error.exitCode : 1;
  const code = error instanceof BeginError ? error.code : 'UNKNOWN_ERROR';

  if (ctx.json) {
    const output: JsonError = {
      success: false,
      error: error.message,
      code,
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.error(`Error: ${error.message}`);
  }

  process.exit(exitCode);
}

/**
 * Format ADA amount with symbol
 */
export function formatAda(lovelace: bigint | number | string): string {
  const ada = Number(lovelace) / 1_000_000;
  return `₳${ada.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

/**
 * Format address for display (truncated)
 */
export function formatAddress(address: string, length = 16): string {
  if (address.length <= length * 2) return address;
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

/**
 * Create a table-like output for terminal
 */
export function formatTable(rows: [string, string][]): string {
  const maxKeyLen = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `${k.padEnd(maxKeyLen)}  ${v}`).join('\n');
}
