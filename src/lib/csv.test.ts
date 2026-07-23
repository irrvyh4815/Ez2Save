import { describe, expect, it } from "vitest";
import { parseTransactionsCsv } from "./csv";

describe("CSV import preview", () => {
  it("reports missing fields", () => {
    const rows = parseTransactionsCsv("日期,金額\n2026-07-13,100", 500);
    expect(rows[0].errors[0]).toContain("CSV 缺少欄位");
  });

  it("reports duplicated rows", () => {
    const csv = "日期,類型,金額,分類\n2026-07-13,支出,100,餐飲\n2026-07-13,支出,100,餐飲";
    const rows = parseTransactionsCsv(csv, 500);
    expect(rows[1].errors).toContain("CSV 內有重複資料");
  });

  it("accepts an Excel UTF-8 BOM and preserves escaped quotes", () => {
    const csv = "\uFEFF日期,類型,金額,分類,商家\n2026-07-13,支出,100,餐飲,\"小明\"\"早餐店\"";
    const rows = parseTransactionsCsv(csv, 500);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].transaction?.merchant).toBe("小明\"早餐店");
  });

  it("rejects a blank category value", () => {
    const rows = parseTransactionsCsv("日期,類型,金額,分類\n2026-07-13,支出,100,", 500);
    expect(rows[0].errors).toContain("分類不可空白");
  });
});
