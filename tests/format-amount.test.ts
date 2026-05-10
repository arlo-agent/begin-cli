import { describe, it, expect } from "vitest";
import {
  formatSmallestUnitToDecimal,
  parseDecimalToSmallestUnit,
  truncateDecimalString,
} from "../src/lib/format-amount.js";

describe("formatSmallestUnitToDecimal", () => {
  it("returns integer string when decimals is 0", () => {
    expect(formatSmallestUnitToDecimal("1457210", 0)).toBe("1457210");
  });

  it("formats with 6 decimals and trims trailing zeros", () => {
    expect(formatSmallestUnitToDecimal("1457210", 6)).toBe("1.45721");
  });

  it("handles zero amount", () => {
    expect(formatSmallestUnitToDecimal("0", 6)).toBe("0");
  });

  it("handles large integers safely", () => {
    expect(formatSmallestUnitToDecimal("1000000000000", 6)).toBe("1000000");
  });

  it("passes through non-digit amounts unchanged", () => {
    expect(formatSmallestUnitToDecimal("abc", 6)).toBe("abc");
  });
});

describe("parseDecimalToSmallestUnit", () => {
  it("trims whitespace", () => {
    expect(parseDecimalToSmallestUnit("  1.5  ", 6)).toBe("1500000");
  });

  it("allows optional leading +", () => {
    expect(parseDecimalToSmallestUnit("+1.5", 6)).toBe("1500000");
  });

  it("converts 1.5 with 6 decimals", () => {
    expect(parseDecimalToSmallestUnit("1.5", 6)).toBe("1500000");
  });

  it("converts 1.5 with 9 decimals", () => {
    expect(parseDecimalToSmallestUnit("1.5", 9)).toBe("1500000000");
  });

  it("truncates excess fractional digits toward zero", () => {
    expect(parseDecimalToSmallestUnit("1.123456789", 6)).toBe("1123456");
  });

  it("handles leading zeros on the whole part", () => {
    expect(parseDecimalToSmallestUnit("001.5", 6)).toBe("1500000");
  });

  it("handles fractional-only input .5", () => {
    expect(parseDecimalToSmallestUnit(".5", 9)).toBe("500000000");
  });

  it("handles large integer without a decimal point", () => {
    expect(parseDecimalToSmallestUnit("1000000000000000000000", 6)).toBe(
      "1000000000000000000000000000"
    );
  });

  it("uses decimals 0 as integer only", () => {
    expect(parseDecimalToSmallestUnit("42", 0)).toBe("42");
    expect(parseDecimalToSmallestUnit("99.99", 0)).toBe("99");
  });

  it("rejects zero", () => {
    expect(() => parseDecimalToSmallestUnit("0", 6)).toThrow(/positive/i);
    expect(() => parseDecimalToSmallestUnit("0.0", 9)).toThrow(/positive/i);
  });

  it("rejects invalid amounts", () => {
    expect(() => parseDecimalToSmallestUnit("1.2.3", 6)).toThrow(/decimal/i);
    expect(() => parseDecimalToSmallestUnit("abc", 6)).toThrow();
    expect(() => parseDecimalToSmallestUnit("", 6)).toThrow();
    expect(() => parseDecimalToSmallestUnit("1e6", 6)).toThrow();
  });

  it("rejects invalid decimals parameter", () => {
    expect(() => parseDecimalToSmallestUnit("1", -1)).toThrow(/decimals/i);
  });
});

describe("truncateDecimalString", () => {
  it("truncates fractional length to maxFractionDigits", () => {
    expect(truncateDecimalString("100.123456789", 6)).toBe("100.123456");
  });

  it("strips trailing zeros in the fraction after truncate", () => {
    expect(truncateDecimalString("00.500", 6)).toBe("0.5");
  });

  it("returns integer string when maxFractionDigits is 0", () => {
    expect(truncateDecimalString("10.9", 0)).toBe("10");
  });

  it("trims and matches parse rules", () => {
    expect(truncateDecimalString("  1.001  ", 2)).toBe("1");
  });

  it("rejects invalid amounts like parseDecimalToSmallestUnit", () => {
    expect(() => truncateDecimalString("1.2.3", 6)).toThrow();
  });
});
