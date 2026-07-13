import type { Transaction } from "../types/finance";
import { parseMoneyToCents } from "./format";
import { combineValidations, validateCsvHeaders, validateCsvRowLimit, validateIsoDate, validatePositiveAmount } from "./validation";

export interface CsvPreviewRow {
  rowNumber: number;
  transaction?: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">;
  errors: string[];
  fingerprint: string;
}

const requiredHeaders = ["日期", "類型", "金額", "分類"];

export function parseTransactionsCsv(text: string, limit = 500): CsvPreviewRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  const headerValidation = validateCsvHeaders(headers, requiredHeaders);
  if (!headerValidation.valid) {
    return [{ rowNumber: 1, errors: headerValidation.errors, fingerprint: "header-error" }];
  }

  const rowLimitValidation = validateCsvRowLimit(lines.length - 1, limit);
  if (!rowLimitValidation.valid) {
    return [{ rowNumber: 1, errors: rowLimitValidation.errors, fingerprint: "row-limit-error" }];
  }

  const seen = new Set<string>();
  return lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    const amountCents = parseMoneyToCents(row["金額"]);
    const fingerprint = `${row["日期"]}-${row["類型"]}-${amountCents}-${row["分類"]}-${row["商家"] ?? ""}`;
    const duplicate = seen.has(fingerprint);
    seen.add(fingerprint);

    const validation = combineValidations(validateIsoDate(row["日期"]), validatePositiveAmount(amountCents));
    const errors = [...validation.errors, ...(duplicate ? ["CSV 內有重複資料"] : [])];
    const type = normalizeType(row["類型"]);

    return {
      rowNumber: index + 2,
      errors: type ? errors : [...errors, "類型必須是收入、支出、轉帳、信用卡消費、信用卡繳款或貸款還款"],
      fingerprint,
      transaction:
        errors.length === 0 && type
          ? {
              date: row["日期"],
              type,
              amountCents,
              category: row["分類"],
              subcategory: row["子分類"],
              merchant: row["商家"],
              note: row["備註"],
              isNecessary: row["是否必要"] === "是",
              isRecurring: row["是否固定"] === "是",
              tags: row["標籤"] ? row["標籤"].split("|").map((tag) => tag.trim()).filter(Boolean) : [],
              source: "csv"
            }
          : undefined
    };
  });
}

function normalizeType(value: string): Transaction["type"] | undefined {
  const map: Record<string, Transaction["type"]> = {
    收入: "income",
    支出: "expense",
    轉帳: "transfer",
    信用卡消費: "credit_card_purchase",
    信用卡繳款: "credit_card_payment",
    貸款還款: "loan_payment",
    存款轉入: "deposit_transfer"
  };
  return map[value];
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}
