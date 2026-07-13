import { describe, expect, it } from "vitest";
import {
  validateAnnualRate,
  validateCsvHeaders,
  validateCsvRowLimit,
  validateDateRange,
  validateIsoDate,
  validatePositiveAmount
} from "./validation";

describe("form validation", () => {
  it("rejects negative, zero, and huge amounts", () => {
    expect(validatePositiveAmount(-1).valid).toBe(false);
    expect(validatePositiveAmount(0).valid).toBe(false);
    expect(validatePositiveAmount(1_000_000_000_00).valid).toBe(false);
    expect(validatePositiveAmount(100_00).valid).toBe(true);
  });

  it("rejects invalid dates and reversed ranges", () => {
    expect(validateIsoDate("2026/07/13").valid).toBe(false);
    expect(validateDateRange("2026-07-13", "2026-07-12").valid).toBe(false);
    expect(validateDateRange("2026-07-12", "2026-07-13").valid).toBe(true);
  });

  it("rejects unreasonable rates", () => {
    expect(validateAnnualRate(-0.01).valid).toBe(false);
    expect(validateAnnualRate(1.01).valid).toBe(false);
    expect(validateAnnualRate(0.025).valid).toBe(true);
  });

  it("validates CSV headers and row count", () => {
    expect(validateCsvHeaders(["日期", "金額"], ["日期", "類型", "金額"]).valid).toBe(false);
    expect(validateCsvHeaders(["日期", "類型", "金額"], ["日期", "類型", "金額"]).valid).toBe(true);
    expect(validateCsvRowLimit(501, 500).valid).toBe(false);
  });
});
