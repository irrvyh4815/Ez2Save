import type { AiFinancialReport, CreditCard, DashboardSummary, Loan } from "../types/finance";

export interface AiFinancialHealthInput {
  dashboard: DashboardSummary;
  categoryBreakdown: { category: string; amountCents: number }[];
  loans: Pick<Loan, "name" | "remainingPrincipalCents" | "annualRate" | "paymentPerPeriodCents">[];
  creditCards: Pick<CreditCard, "name" | "creditLimitCents" | "unbilledAmountCents" | "currentStatementAmountCents">[];
  fixedExpenseCents: number;
  month: string;
}

export async function requestAiFinancialHealth(input: AiFinancialHealthInput): Promise<AiFinancialReport> {
  const response = await fetch("/api/ai-financial-health", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error("AI 理財健檢暫時無法使用，請稍後再試。");
  }

  return (await response.json()) as AiFinancialReport;
}

export function mockAiFinancialHealth(input: AiFinancialHealthInput): AiFinancialReport {
  const debtPressure = input.dashboard.debtRatio > 0.6 ? "偏高" : input.dashboard.debtRatio > 0.35 ? "中等" : "可控";
  const emergency = input.dashboard.emergencyFundMonths >= 6 ? "充足" : input.dashboard.emergencyFundMonths >= 3 ? "接近標準" : "不足";
  const healthScore = Math.max(
    35,
    Math.min(92, Math.round(82 - input.dashboard.debtRatio * 25 + Math.min(input.dashboard.emergencyFundMonths, 6) * 2))
  );

  return {
    healthScore,
    summary: `${input.month} 收入支出仍有結餘，債務壓力${debtPressure}，緊急預備金${emergency}。`,
    biggestRisk: input.dashboard.monthlyCreditCardDueCents > input.dashboard.monthlyBalanceCents
      ? "信用卡待繳金額接近或高於本月結餘，需避免把最低應繳當成常態。"
      : "目前主要風險是固定支出與貸款應繳金額會壓縮可支配所得。",
    topPriority: "先確保信用卡全額繳清，再評估是否把額外現金投入高利率債務提前還款。",
    actions: [
      "設定本月非必要支出上限，優先檢查餐飲、娛樂與訂閱服務。",
      "保留至少 3 個月必要支出的緊急預備金後，再安排提前還款。",
      "把信用卡額度使用率維持在建議門檻以下，並確認自動扣款帳戶餘額。"
    ],
    protectedEssentials: ["房租", "保險", "基本餐食", "交通", "必要醫療與教育費"],
    expectedImpact: "若每月多保留 5% 可支配所得，通常可更快累積預備金並降低短期資金壓力。",
    disclaimer: "此分析僅供個人理財整理與教育參考，不構成投資、貸款、稅務或法律建議。",
    cacheKey: stableHash(input),
    generatedAt: new Date().toISOString()
  };
}

export function stableHash(value: unknown): string {
  const json = JSON.stringify(sortKeys(value));
  let hash = 0;
  for (let index = 0; index < json.length; index += 1) {
    hash = (hash * 31 + json.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortKeys(child)])
    );
  }
  return value;
}
