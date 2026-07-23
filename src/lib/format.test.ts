import { afterEach, describe, expect, it } from "vitest";
import { formatCurrencyAmount, formatMoney, parseMoneyToCents, setDefaultMoneyCurrency } from "./format";

afterEach(() => setDefaultMoneyCurrency("TWD"));

describe("currency formatting", () => {
  it("formats TWD without unnecessary decimals", () => {
    expect(formatMoney(1_234_00, "TWD")).toBe("$1,234");
  });

  it("formats foreign ledger currencies with their currency symbol", () => {
    expect(formatMoney(1_234_56, "USD")).toContain("1,234.56");
    expect(formatCurrencyAmount(0.5, "USDT")).toContain("USDT");
    expect(formatCurrencyAmount(0.5, "USDT")).toContain("0.5");
  });

  it("parses grouped money input into integer cents", () => {
    expect(parseMoneyToCents("1,234.56")).toBe(123_456);
  });
});
