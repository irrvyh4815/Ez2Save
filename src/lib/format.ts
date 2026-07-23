import type { CurrencyCode, InvestmentQuoteCurrency } from "../types/finance";

let defaultMoneyCurrency: CurrencyCode = "TWD";

const numberFormatter = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 0
});

export function setDefaultMoneyCurrency(currency: CurrencyCode): void {
  defaultMoneyCurrency = currency;
}

export function formatMoney(cents: number, currency: CurrencyCode = defaultMoneyCurrency): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "TWD" || currency === "JPY" ? 0 : 2
  }).format(cents / 100);
}

export function formatCompactMoney(cents: number, currency: CurrencyCode = defaultMoneyCurrency): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    notation: Math.abs(amount) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: currency === "TWD" || currency === "JPY" ? 0 : 2
  }).format(amount);
}

export function formatCurrencyAmount(value: number, currency: InvestmentQuoteCurrency): string {
  if (!Number.isFinite(value)) return `${currency} 0`;
  if (currency === "USDT") return `USDT ${value.toLocaleString("zh-TW", { maximumFractionDigits: 4 })}`;
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "TWD" || currency === "JPY" ? 0 : 4
  }).format(value);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "0%";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDate(date: string | Date): string {
  const parsed = typeof date === "string" ? new Date(`${date}T00:00:00+08:00`) : date;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(parsed);
}

export function parseMoneyToCents(value: string): number {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.round(parsed * 100);
}

export function currentTaipeiMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}
