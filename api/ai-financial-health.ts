export const config = {
  runtime: "edge"
};

type AiReport = {
  healthScore: number;
  summary: string;
  biggestRisk: string;
  topPriority: string;
  actions: string[];
  protectedEssentials: string[];
  expectedImpact: string;
  disclaimer: string;
  cacheKey: string;
  generatedAt: string;
};

type CacheEntry = {
  expiresAt: number;
  report: AiReport;
};

const cache = new Map<string, CacheEntry>();
const rateLimit = new Map<string, number[]>();

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const aiEnabled = readBooleanEnv("AI_ENABLED", false);
  const mockMode = readBooleanEnv("AI_MOCK_MODE", true);
  const model = readEnv("AI_MODEL", "mock-finance-advisor");
  const limitPerHour = Number(readEnv("AI_RATE_LIMIT_PER_HOUR", "5"));
  const cacheTtlSeconds = Number(readEnv("AI_CACHE_TTL_SECONDS", "86400"));
  const maxItems = Number(readEnv("MAX_AI_SUMMARY_ITEMS", "120"));

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const summary = minimizeInput(input, maxItems);
  const cacheKey = stableHash(summary);
  const clientKey = request.headers.get("x-user-id") ?? request.headers.get("x-forwarded-for") ?? "anonymous";

  const rate = checkRateLimit(clientKey, limitPerHour);
  if (!rate.allowed) {
    return json({ error: "Rate limit exceeded" }, 429);
  }

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return json({ ...cached.report, cacheKey, metadata: { cached: true, model } });
  }

  if (!aiEnabled || mockMode) {
    const report = buildMockReport(summary, cacheKey);
    cache.set(cacheKey, { report, expiresAt: Date.now() + cacheTtlSeconds * 1000 });
    return json({ ...report, metadata: { cached: false, model, mock: true } });
  }

  const apiKey = readEnv("AI_API_KEY", "");
  if (!apiKey) {
    return json({ error: "AI service is not configured" }, 503);
  }

  const report = await buildProviderReport(summary, cacheKey, apiKey, model);
  cache.set(cacheKey, { report, expiresAt: Date.now() + cacheTtlSeconds * 1000 });
  return json({ ...report, metadata: { cached: false, model, mock: false } });
}

function minimizeInput(input: unknown, maxItems: number): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  return {
    month: source.month,
    dashboard: source.dashboard,
    categoryBreakdown: Array.isArray(source.categoryBreakdown) ? source.categoryBreakdown.slice(0, maxItems) : [],
    loans: Array.isArray(source.loans) ? source.loans.slice(0, maxItems) : [],
    creditCards: Array.isArray(source.creditCards) ? source.creditCards.slice(0, maxItems) : [],
    fixedExpenseCents: source.fixedExpenseCents
  };
}

function buildMockReport(summary: Record<string, unknown>, cacheKey: string): AiReport {
  const dashboard = (summary.dashboard ?? {}) as Record<string, number>;
  const debtRatio = finite(dashboard.debtRatio);
  const emergencyMonths = finite(dashboard.emergencyFundMonths);
  const monthlyBalance = finite(dashboard.monthlyBalanceCents);
  const monthlyCardDue = finite(dashboard.monthlyCreditCardDueCents);
  const healthScore = Math.max(35, Math.min(92, Math.round(78 - debtRatio * 25 + Math.min(emergencyMonths, 6) * 2)));

  return {
    healthScore,
    summary: `${String(summary.month ?? "本月")} 的收支彙總已完成，結餘為新台幣 ${Math.round(monthlyBalance / 100).toLocaleString("zh-TW")} 元。`,
    biggestRisk:
      monthlyCardDue > monthlyBalance
        ? "信用卡待繳金額高於本月結餘，需優先避免循環信用與只繳最低應繳。"
        : "目前風險主要來自固定支出、貸款與信用卡待繳金額對現金流的壓力。",
    topPriority: "先確保帳單與信用卡全額繳清，再把額外資金投入預備金或高利率債務。",
    actions: [
      "檢查前三大支出分類，設定下月上限。",
      "保留必要支出所需現金，避免用信用卡最低應繳作為常態策略。",
      "若預備金不足三個月，先補足預備金再增加投資風險。"
    ],
    protectedEssentials: ["房租", "保險", "基本餐食", "通勤", "必要醫療與教育費"],
    expectedImpact: "持續降低非必要支出並避免循環信用，可改善下月現金流並降低短期資金壓力。",
    disclaimer: "此分析僅供個人理財整理與教育參考，不構成投資、貸款、稅務或法律建議。",
    cacheKey,
    generatedAt: new Date().toISOString()
  };
}

async function buildProviderReport(summary: Record<string, unknown>, cacheKey: string, apiKey: string, model: string): Promise<AiReport> {
  const prompt = [
    "你是台灣個人理財整理助手。根據彙總資料輸出 JSON，不能保證獲利、不能鼓勵高槓桿、不能鼓勵循環信用。",
    "輸出欄位：healthScore, summary, biggestRisk, topPriority, actions, protectedEssentials, expectedImpact, disclaimer。",
    JSON.stringify(summary)
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: 900,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error("AI provider error");
  }

  const data = (await response.json()) as { output_text?: string };
  const parsed = safeJson(data.output_text ?? "");
  return {
    healthScore: clamp(Number(parsed.healthScore ?? 70), 0, 100),
    summary: String(parsed.summary ?? "已完成本月摘要。"),
    biggestRisk: String(parsed.biggestRisk ?? "資訊不足，請補齊收入、支出與負債資料。"),
    topPriority: String(parsed.topPriority ?? "優先確保必要帳單與信用卡全額繳清。"),
    actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3).map(String) : [],
    protectedEssentials: Array.isArray(parsed.protectedEssentials) ? parsed.protectedEssentials.map(String) : [],
    expectedImpact: String(parsed.expectedImpact ?? "改善幅度需依後續實際支出追蹤。"),
    disclaimer: "此分析僅供個人理財整理與教育參考，不構成投資、貸款、稅務或法律建議。",
    cacheKey,
    generatedAt: new Date().toISOString()
  };
}

function checkRateLimit(clientKey: string, limitPerHour: number): { allowed: boolean } {
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  const entries = (rateLimit.get(clientKey) ?? []).filter((timestamp) => timestamp > windowStart);
  if (entries.length >= limitPerHour) {
    rateLimit.set(clientKey, entries);
    return { allowed: false };
  }
  entries.push(now);
  rateLimit.set(clientKey, entries);
  return { allowed: true };
}

function stableHash(value: unknown): string {
  const jsonValue = JSON.stringify(sortKeys(value));
  let hash = 0;
  for (let index = 0; index < jsonValue.length; index += 1) {
    hash = (hash * 31 + jsonValue.charCodeAt(index)) >>> 0;
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

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function readEnv(key: string, fallback: string): string {
  return globalThis.process?.env?.[key] ?? fallback;
}

function readBooleanEnv(key: string, fallback: boolean): boolean {
  const value = readEnv(key, String(fallback));
  return value === "true";
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
