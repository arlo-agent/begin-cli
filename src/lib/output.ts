/**
 * Output helpers for JSON vs pretty print modes
 */

import { BeginError, toBeginError, ExitCode } from './errors.js';

export interface OutputContext {
  json: boolean;
}

export interface JsonSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface JsonError {
  success: false;
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

export type JsonOutput<T = unknown> = JsonSuccess<T> | JsonError;

// Global output context (set by CLI)
let globalContext: OutputContext = { json: false };

export function setOutputContext(ctx: OutputContext): void {
  globalContext = ctx;
}

export function getOutputContext(): OutputContext {
  return globalContext;
}

export function isJsonMode(): boolean {
  return globalContext.json;
}

/**
 * Output success data
 * - In JSON mode: prints {"success": true, "data": {...}}
 * - In pretty mode: does nothing (let Ink handle display)
 */
export function outputSuccess<T>(data: T): void {
  if (globalContext.json) {
    const output: JsonSuccess<T> = { success: true, data };
    console.log(JSON.stringify(output, null, 2));
  }
}

/**
 * Output error
 * - In JSON mode: prints {"success": false, "error": "...", "code": "..."}
 * - In pretty mode: prints to stderr
 */
export function outputError(err: unknown): void {
  const beginErr = toBeginError(err);
  
  if (globalContext.json) {
    console.log(JSON.stringify(beginErr.toJSON(), null, 2));
  } else {
    console.error(`Error: ${beginErr.message}`);
  }
}

/**
 * Exit with proper code based on error
 */
export function exitWithError(err: unknown): never {
  const beginErr = toBeginError(err);
  outputError(beginErr);
  process.exit(beginErr.exitCode);
}

/**
 * Exit with success
 */
export function exitSuccess<T>(data?: T): never {
  if (data !== undefined) {
    outputSuccess(data);
  }
  process.exit(ExitCode.SUCCESS);
}

/**
 * Format ADA amount from lovelace
 */
export function formatAda(lovelace: bigint | number | string): string {
  const amount = BigInt(lovelace);
  const ada = Number(amount) / 1_000_000;
  return ada.toFixed(6);
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, startLen = 20, endLen = 10): string {
  if (address.length <= startLen + endLen + 3) {
    return address;
  }
  return `${address.slice(0, startLen)}...${address.slice(-endLen)}`;
}

/**
 * Format timestamp
 */
export function formatTimestamp(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date * 1000) : date;
  return d.toISOString();
}

/**
 * Create a result object for commands
 * Used by Ink components to report results
 */
export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: BeginError;
}

export function successResult<T>(data: T): CommandResult<T> {
  return { success: true, data };
}

export function errorResult(err: unknown): CommandResult<never> {
  return { success: false, error: toBeginError(err) };
}
