/**
 * Format integer smallest-unit amounts as decimal strings (no floating-point).
 */

/**
 * Convert a non-negative integer string in smallest units to a human-readable decimal string.
 */
export function formatSmallestUnitToDecimal(amount: string, decimals: number): string {
  if (decimals === 0) return amount;

  const normalized = amount.trim().replace(/^\+/, "");
  if (!/^\d+$/.test(normalized)) return amount;

  const padded = normalized.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, -decimals) || "0";
  const decPart = padded.slice(-decimals);
  const trimmedDecPart = decPart.replace(/0+$/, "");

  if (trimmedDecPart === "") {
    return intPart;
  }

  return `${intPart}.${trimmedDecPart}`;
}

/** Parsed non-negative decimal (integer + fractional digit strings, no sign). */
interface PositiveDecimalParts {
  intPart: string;
  fracPart: string;
}

/**
 * Parse a positive decimal amount string: trim, optional leading "+", digits and at most one ".".
 * Rejects negatives, scientific notation, underscores, and commas.
 */
function parsePositiveDecimalString(input: string): PositiveDecimalParts {
  let s = input.trim();
  if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }
  if (s === "") {
    throw new Error("Amount is empty");
  }
  if (/[eE,_-]/.test(s)) {
    throw new Error("Invalid amount: use a plain decimal string");
  }
  const parts = s.split(".");
  if (parts.length > 2) {
    throw new Error("Invalid amount: multiple decimal points");
  }
  const intPart = parts[0] ?? "";
  const fracPart = parts[1] ?? "";
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) {
    throw new Error("Invalid amount: expected digits and at most one decimal point");
  }
  const hasDigit = /\d/.test(intPart + fracPart);
  if (!hasDigit) {
    throw new Error("Invalid amount");
  }
  return { intPart, fracPart };
}

/**
 * Truncate the fractional part to at most `maxFractionDigits` (toward zero).
 * Returns a canonical decimal string (no unnecessary leading zeros on the whole part).
 */
export function truncateDecimalString(input: string, maxFractionDigits: number): string {
  const { intPart, fracPart } = parsePositiveDecimalString(input);
  const whole = BigInt(intPart || "0").toString();

  if (maxFractionDigits <= 0) {
    return whole;
  }

  let frac = fracPart.slice(0, maxFractionDigits);
  frac = frac.replace(/0+$/, "");
  if (frac === "") {
    return whole;
  }
  return `${whole}.${frac}`;
}

/**
 * Convert a human decimal string to smallest-unit integer string using `decimals` (truncation).
 * Rejects zero and negative amounts.
 */
export function parseDecimalToSmallestUnit(input: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error("decimals must be a non-negative integer");
  }

  const { intPart, fracPart } = parsePositiveDecimalString(input);

  if (decimals === 0) {
    const whole = BigInt(intPart || "0");
    if (whole <= 0n) {
      throw new Error("Amount must be positive");
    }
    return whole.toString();
  }

  const fracTrunc = fracPart.slice(0, decimals).padEnd(decimals, "0");
  const whole = BigInt(intPart || "0");
  const fracValue = BigInt(fracTrunc || "0");
  const scale = 10n ** BigInt(decimals);
  const smallest = whole * scale + fracValue;

  if (smallest <= 0n) {
    throw new Error("Amount must be positive");
  }

  return smallest.toString();
}
