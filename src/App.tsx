import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Bell,
  Bot,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CreditCard as CreditCardIcon,
  Download,
  FileText,
  Landmark,
  LineChart,
  Moon,
  PiggyBank,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Sparkles,
  Table,
  TrendingUp,
  Trash2,
  Upload,
  WalletCards
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  calculateDeposit,
  calculateLoan,
  summarizeDashboard,
  type DepositCalculationInput,
  type LoanCalculationInput
} from "./lib/financialCalculations";
import { currentTaipeiMonth, formatDate, formatMoney, formatPercent, parseMoneyToCents } from "./lib/format";
import { parseTransactionsCsv } from "./lib/csv";
import { combineValidations, validateAnnualRate, validateDateRange, validatePositiveAmount } from "./lib/validation";
import { exportReportToExcel, exportReportToPdf } from "./lib/reportExport";
import { isSupabaseConfigured } from "./services/supabaseClient";
import { mockAiFinancialHealth, requestAiFinancialHealth } from "./services/aiFinancialHealth";
import {
  checkSupabaseConnection,
  createFinancialAccount,
  createCreditCardInstallment,
  createTransactionWithCategory,
  deleteTransaction,
  emptyFinanceData,
  loadFinanceData,
  normalizeCategoryName,
  sendSignInLink,
  signInWithPassword,
  signUpWithPassword,
  signOut
} from "./services/financeRepository";
import type {
  AccountType,
  AiFinancialReport,
  Budget,
  CreditCard,
  CreditCardInstallment,
  Deposit,
  FinancialAccount,
  FinancialReminder,
  Loan,
  Transaction,
  UserProfile
} from "./types/finance";

type Page =
  | "dashboard"
  | "transactions"
  | "accounts"
  | "cards"
  | "loans"
  | "deposits"
  | "investments"
  | "calculators"
  | "budgets"
  | "reminders"
  | "reports"
  | "ai"
  | "settings";

type ToastType = "success" | "error";
type Toast = { type: ToastType; message: string } | null;
type FinanceNotification = {
  id: string;
  title: string;
  detail: string;
  date: string;
  amountCents?: number;
  source: "credit_card" | "loan" | "installment" | "reminder";
  status: "overdue" | "due_today" | "upcoming" | "scheduled";
};

const navGroups: { title: "理財" | "投資" | "其他" | "設定"; items: { page: Page; label: string; icon: typeof BarChart3 }[] }[] = [
  {
    title: "理財",
    items: [
      { page: "dashboard", label: "理財總覽", icon: BarChart3 },
      { page: "transactions", label: "收支紀錄", icon: ReceiptText },
      { page: "accounts", label: "帳戶", icon: WalletCards },
      { page: "cards", label: "信用卡", icon: CreditCardIcon },
      { page: "loans", label: "貸款", icon: Landmark },
      { page: "deposits", label: "存款", icon: PiggyBank },
      { page: "budgets", label: "預算", icon: Banknote },
      { page: "reminders", label: "固定帳單", icon: CalendarClock },
      { page: "reports", label: "報表", icon: LineChart }
    ]
  },
  {
    title: "投資",
    items: [
      { page: "investments", label: "股票基金", icon: TrendingUp }
    ]
  },
  {
    title: "其他",
    items: [
      { page: "calculators", label: "計算機", icon: Calculator },
      { page: "ai", label: "AI 健檢", icon: Bot }
    ]
  },
  {
    title: "設定",
    items: [
      { page: "settings", label: "設定", icon: Settings }
    ]
  }
];
const navItems = navGroups.flatMap((group) => group.items);

const pageIntros: Record<Page, { eyebrow: string; title: string; description: string; accent: string; tint: string }> = {
  dashboard: {
    eyebrow: "Today at a glance",
    title: "你的財務全景已整理好",
    description: "快速掌握資產、負債、現金流與近期到期事項，先看方向，再處理細節。",
    accent: "#059669",
    tint: "#ecfdf5"
  },
  transactions: {
    eyebrow: "Smart ledger",
    title: "讓每筆收支都有清楚位置",
    description: "分類記憶、CSV 匯入與近期交易，協助你把資料整理成可分析的帳本。",
    accent: "#0284c7",
    tint: "#eff6ff"
  },
  accounts: {
    eyebrow: "Portfolio base",
    title: "整理所有帳戶與可動用資金",
    description: "從現金、活存到定存，建立你的資產底圖，後續報表才會更準。",
    accent: "#0f766e",
    tint: "#f0fdfa"
  },
  cards: {
    eyebrow: "Debt clarity",
    title: "信用卡、帳單與分期一次看清",
    description: "追蹤本期帳款、未出帳、額度使用率與分期負債，降低漏繳與高使用率風險。",
    accent: "#7c3aed",
    tint: "#f5f3ff"
  },
  loans: {
    eyebrow: "Payoff map",
    title: "把貸款變成可規劃的路線",
    description: "集中檢視本金、利率、期數與還款日，搭配試算器評估提前還款效果。",
    accent: "#d97706",
    tint: "#fffbeb"
  },
  deposits: {
    eyebrow: "Savings growth",
    title: "掌握存款到期與預估收益",
    description: "整理活存、定存與定期儲蓄，讓資金配置更有節奏。",
    accent: "#16a34a",
    tint: "#f0fdf4"
  },
  investments: {
    eyebrow: "Investment classes",
    title: "管理股票與基金分類",
    description: "把台股、美股、ETF、基金與其他投資分類整理好，後續持倉與報表才有清楚架構。",
    accent: "#2563eb",
    tint: "#eff6ff"
  },
  calculators: {
    eyebrow: "Scenario lab",
    title: "把常用試算集中在計算機",
    description: "貸款、存款、淨資產、負債比與預備金月數都能快速試算，先模擬，再行動。",
    accent: "#0891b2",
    tint: "#ecfeff"
  },
  budgets: {
    eyebrow: "Spending rhythm",
    title: "用預算掌握本月節奏",
    description: "追蹤已使用、剩餘與預估月底支出，及早看見超支風險。",
    accent: "#db2777",
    tint: "#fdf2f8"
  },
  reminders: {
    eyebrow: "Never miss a due date",
    title: "重要扣款與帳單到期都在這裡",
    description: "固定帳單、信用卡與貸款提醒會集中顯示，讓付款節奏更穩。",
    accent: "#ea580c",
    tint: "#fff7ed"
  },
  reports: {
    eyebrow: "Monthly review",
    title: "把你的總帳輸出成報表",
    description: "查看趨勢、分類、帳戶與負債報表，並匯出 CSV、Excel 或 PDF。",
    accent: "#4f46e5",
    tint: "#eef2ff"
  },
  ai: {
    eyebrow: "Insight mode",
    title: "把數字轉成下一步行動",
    description: "AI 只在你主動點擊時分析彙總資料，協助整理風險、優先順序與建議。",
    accent: "#9333ea",
    tint: "#faf5ff"
  },
  settings: {
    eyebrow: "Account settings",
    title: "管理帳號與資料連線",
    description: "只保留登入狀態、帳號權限與 Supabase 連線檢查。",
    accent: "#475569",
    tint: "#f8fafc"
  }
};

const accountTypeLabels: Record<AccountType, string> = {
  cash: "現金",
  checking: "銀行活存",
  digital: "數位帳戶",
  savings: "儲蓄帳戶",
  time_deposit: "定期存款",
  e_wallet: "電子支付",
  other_asset: "其他資產帳戶"
};

const transactionTypeLabels: Record<Transaction["type"], string> = {
  income: "收入",
  expense: "支出",
  transfer: "轉帳",
  credit_card_purchase: "信用卡消費",
  credit_card_payment: "信用卡繳款",
  loan_payment: "貸款還款",
  deposit_transfer: "存款轉入"
};

type InvestmentCategory = {
  id: string;
  name: string;
  kind: "tw_stock" | "us_stock" | "etf" | "mutual_fund" | "bond_fund" | "money_market" | "other";
  market: "TW" | "US" | "GLOBAL";
  targetAllocation: number;
  risk: "low" | "medium" | "high";
  note: string;
};

const investmentKindLabels: Record<InvestmentCategory["kind"], string> = {
  tw_stock: "台股",
  us_stock: "美股",
  etf: "ETF",
  mutual_fund: "共同基金",
  bond_fund: "債券基金",
  money_market: "貨幣市場",
  other: "其他"
};

const investmentMarketLabels: Record<InvestmentCategory["market"], string> = {
  TW: "台灣",
  US: "美國",
  GLOBAL: "全球"
};

const investmentRiskLabels: Record<InvestmentCategory["risk"], string> = {
  low: "低風險",
  medium: "中風險",
  high: "高風險"
};

const budgetCategoryOptions = [
  "全部",
  "餐飲",
  "交通",
  "房租",
  "水電瓦斯",
  "電信網路",
  "保險",
  "醫療",
  "教育",
  "育兒",
  "購物",
  "娛樂",
  "訂閱服務",
  "旅遊",
  "投資",
  "儲蓄",
  "其他"
];

const today = "2026-07-13";
const localUserId = "local-user";
const chartPalette = ["#059669", "#0284c7", "#d97706", "#7c3aed", "#dc2626", "#0f766e", "#be123c", "#4f46e5"];

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [month, setMonth] = useState(currentTaipeiMonth());
  const [darkMode, setDarkMode] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [accounts, setAccounts] = useState(emptyFinanceData.accounts);
  const [transactions, setTransactions] = useState(emptyFinanceData.transactions);
  const [creditCards, setCreditCards] = useState(emptyFinanceData.creditCards);
  const [creditCardInstallments, setCreditCardInstallments] = useState(emptyFinanceData.creditCardInstallments);
  const [loans, setLoans] = useState(emptyFinanceData.loans);
  const [deposits, setDeposits] = useState(emptyFinanceData.deposits);
  const [budgets, setBudgets] = useState(emptyFinanceData.budgets);
  const [reminders, setReminders] = useState(emptyFinanceData.reminders);
  const [rememberedCategories, setRememberedCategories] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataNotice, setDataNotice] = useState("");
  const [supabaseCheck, setSupabaseCheck] = useState<Awaited<ReturnType<typeof checkSupabaseConnection>> | null>(null);
  const [supabaseChecking, setSupabaseChecking] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof parseTransactionsCsv>>([]);
  const [aiReport, setAiReport] = useState<AiFinancialReport | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    void refreshFinanceData();
  }, []);

  async function refreshFinanceData() {
    setDataLoading(true);
    try {
      const result = await loadFinanceData();
      setAccounts(result.data.accounts);
      setTransactions(result.data.transactions);
      setCreditCards(result.data.creditCards);
      setCreditCardInstallments(result.data.creditCardInstallments);
      setLoans(result.data.loans);
      setDeposits(result.data.deposits);
      setBudgets(result.data.budgets);
      setReminders(result.data.reminders);
      setRememberedCategories(result.data.categories);
      setCurrentProfile(result.profile);
      setSessionEmail(result.session?.user.email ?? null);
      setDataNotice(
        !isSupabaseConfigured
          ? "尚未設定 Supabase 環境變數，已停用範例資料並顯示空資料。"
          : result.session
            ? ""
            : "登入或註冊後，即可讀取你儲存在 Supabase 的個人理財資料。"
      );
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : "資料讀取失敗");
      setCurrentProfile(null);
    } finally {
      setDataLoading(false);
    }
  }

  async function handlePasswordSignIn(email: string, password: string) {
    await signInWithPassword(email, password);
    await refreshFinanceData();
    notify("success", "登入成功");
  }

  async function handlePasswordSignUp(email: string, password: string, displayName: string) {
    const result = await signUpWithPassword(email, password, displayName);
    if (result.needsEmailConfirmation) {
      notify("success", "註冊完成，請到信箱點擊認證連結後再登入");
      return;
    }
    await refreshFinanceData();
    notify("success", "註冊並登入成功");
  }

  async function handleMagicLink(email: string) {
    await sendSignInLink(email);
    notify("success", "認證登入連結已寄出，請到信箱完成登入");
  }

  async function runSupabaseConnectionCheck() {
    setSupabaseChecking(true);
    try {
      const result = await checkSupabaseConnection();
      setSupabaseCheck(result);
      notify(result.ok ? "success" : "error", result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Supabase 連線檢查失敗";
      setSupabaseCheck({
        ok: false,
        status: "schema_error",
        message,
        details: ["請確認環境變數、登入狀態、migration 與 RLS policy"]
      });
      notify("error", message);
    } finally {
      setSupabaseChecking(false);
    }
  }

  const recentNecessaryAverage = useMemo(() => {
    const months = ["2026-05", "2026-06", "2026-07"];
    const total = transactions
      .filter((transaction) => months.some((candidate) => transaction.date.startsWith(candidate)))
      .filter((transaction) => transaction.isNecessary && ["expense", "credit_card_purchase", "loan_payment"].includes(transaction.type))
      .reduce((sum, transaction) => sum + transaction.amountCents, 0);
    return Math.round(total / Math.max(months.length, 1));
  }, [transactions]);

  const creditCardsForSummary = useMemo(
    () =>
      creditCards.map((card) => ({
        ...card,
        installmentBalanceCents: getCardInstallmentDebt(card.id, creditCardInstallments, card.installmentBalanceCents)
      })),
    [creditCardInstallments, creditCards]
  );

  const dashboard = useMemo(
    () =>
      summarizeDashboard({
        accounts,
        creditCards: creditCardsForSummary,
        loans,
        transactions,
        month,
        averageNecessaryExpenseCents: recentNecessaryAverage
      }),
    [accounts, creditCardsForSummary, loans, month, recentNecessaryAverage, transactions]
  );

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    transactions
      .filter((transaction) => transaction.date.startsWith(month))
      .filter((transaction) => transaction.type === "expense" || transaction.type === "credit_card_purchase")
      .forEach((transaction) => map.set(transaction.category, (map.get(transaction.category) ?? 0) + transaction.amountCents));
    return [...map.entries()].map(([category, amountCents]) => ({ category, amountCents })).sort((a, b) => b.amountCents - a.amountCents);
  }, [month, transactions]);

  const monthlyTrend = useMemo(() => {
    const months = ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
    return months.map((candidate) => {
      const items = transactions.filter((transaction) => transaction.date.startsWith(candidate));
      return {
        month: candidate,
        incomeCents: items.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amountCents, 0),
        expenseCents: items
          .filter((item) => item.type === "expense" || item.type === "credit_card_purchase")
          .reduce((sum, item) => sum + item.amountCents, 0)
      };
    });
  }, [transactions]);

  const financeNotifications = useMemo(
    () =>
      buildFinanceNotifications({
        month,
        reminders,
        creditCards,
        installments: creditCardInstallments,
        loans
      }),
    [creditCardInstallments, creditCards, loans, month, reminders]
  );

  const rootClass = darkMode ? "dark min-h-screen bg-slate-950" : "min-h-screen bg-[#f6f8fb]";

  function notify(type: ToastType, message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2800);
  }

  async function addAccount(formData: FormData) {
    const balanceCents = parseMoneyToCents(String(formData.get("balance") ?? ""));
    const validation = combineValidations(validatePositiveAmount(balanceCents, "目前餘額"));
    if (!validation.valid) return notify("error", validation.errors[0]);
    const now = new Date().toISOString();
    const account: FinancialAccount = {
      id: crypto.randomUUID(),
      userId: localUserId,
      name: String(formData.get("name")),
      type: String(formData.get("type")) as AccountType,
      institution: String(formData.get("institution") ?? ""),
      balanceCents,
      includeInAvailableCash: formData.get("available") === "on",
      includeInEmergencyFund: formData.get("emergency") === "on",
      note: String(formData.get("note") ?? ""),
      isActive: true,
      createdAt: now,
      updatedAt: now
    };
    try {
      const saved = await createFinancialAccount(account);
      setAccounts((current) => [saved, ...current]);
      notify("success", isSupabaseConfigured ? "帳戶已儲存到 Supabase" : "帳戶已新增");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "帳戶儲存失敗");
    }
  }

  async function addTransaction(formData: FormData) {
    const amountCents = parseMoneyToCents(String(formData.get("amount") ?? ""));
    const date = String(formData.get("date") ?? "");
    const validation = combineValidations(validatePositiveAmount(amountCents), validateDateRange(date));
    if (!validation.valid) return notify("error", validation.errors[0]);
    const now = new Date().toISOString();
    const type = String(formData.get("type")) as Transaction["type"];
    const transaction: Transaction = {
      id: crypto.randomUUID(),
      userId: localUserId,
      date,
      type,
      amountCents,
      category: normalizeCategoryName(String(formData.get("category") || "未分類")),
      subcategory: String(formData.get("subcategory") ?? ""),
      accountId: String(formData.get("accountId") ?? ""),
      creditCardId: String(formData.get("creditCardId") ?? "") || undefined,
      merchant: String(formData.get("merchant") ?? ""),
      note: String(formData.get("note") ?? ""),
      isNecessary: formData.get("necessary") === "on",
      isRecurring: formData.get("recurring") === "on",
      tags: String(formData.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
      source: "manual",
      createdAt: now,
      updatedAt: now
    };
    try {
      const saved = await createTransactionWithCategory(transaction);
      setTransactions((current) => [saved, ...current]);
      setRememberedCategories((current) => [...new Set([saved.category, ...current])].sort((a, b) => a.localeCompare(b, "zh-Hant")));
      notify("success", isSupabaseConfigured ? "交易與分類記憶已儲存" : "交易已新增");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "交易儲存失敗");
      return;
    }
    if (type === "credit_card_purchase" && transaction.creditCardId) {
      setCreditCards((current) =>
        current.map((card) =>
          card.id === transaction.creditCardId ? { ...card, unbilledAmountCents: card.unbilledAmountCents + amountCents } : card
        )
      );
    }
    if (type === "credit_card_payment" && transaction.creditCardId) {
      setCreditCards((current) =>
        current.map((card) =>
          card.id === transaction.creditCardId
            ? { ...card, currentStatementAmountCents: Math.max(0, card.currentStatementAmountCents - amountCents) }
            : card
        )
      );
      setAccounts((current) =>
        current.map((account) =>
          account.id === transaction.accountId ? { ...account, balanceCents: Math.max(0, account.balanceCents - amountCents) } : account
        )
      );
    }
  }

  async function softDeleteTransaction(id: string) {
    if (!window.confirm("確定要刪除此交易？此操作需要二次確認。")) return;
    try {
      await deleteTransaction(id);
      setTransactions((current) => current.filter((transaction) => transaction.id !== id));
      notify("success", "交易已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "交易刪除失敗");
    }
  }

  async function handleCsvUpload(file: File | null) {
    if (!file) return;
    if (file.size > 512 * 1024) return notify("error", "CSV 檔案不可超過 512KB");
    const text = await file.text();
    setCsvPreview(parseTransactionsCsv(text, 500));
  }

  async function importCsvRows() {
    const validRows = csvPreview.filter((row) => row.transaction && row.errors.length === 0);
    const now = new Date().toISOString();
    const imported: Transaction[] = validRows.map((row) => ({
      ...(row.transaction as Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">),
      id: crypto.randomUUID(),
      userId: localUserId,
      createdAt: now,
      updatedAt: now
    }));
    try {
      const saved: Transaction[] = [];
      for (const transaction of imported) {
        saved.push(await createTransactionWithCategory(transaction));
      }
      setTransactions((current) => [...saved, ...current]);
      setRememberedCategories((current) => [...new Set([...saved.map((transaction) => transaction.category), ...current])].sort((a, b) => a.localeCompare(b, "zh-Hant")));
      setCsvPreview([]);
      notify("success", `已匯入 ${saved.length} 筆交易並更新分類記憶`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "CSV 匯入失敗");
    }
  }

  async function generateAiReport() {
    const input = {
      dashboard,
      categoryBreakdown,
      loans: loans.map(({ name, remainingPrincipalCents, annualRate, paymentPerPeriodCents }) => ({
        name,
        remainingPrincipalCents,
        annualRate,
        paymentPerPeriodCents
      })),
      creditCards: creditCards.map(({ name, creditLimitCents, unbilledAmountCents, currentStatementAmountCents }) => ({
        name,
        creditLimitCents,
        unbilledAmountCents,
        currentStatementAmountCents
      })),
      creditCardInstallments: summarizeInstallmentDebt(creditCardInstallments),
      fixedExpenseCents: transactions.filter((transaction) => transaction.isRecurring).reduce((sum, transaction) => sum + transaction.amountCents, 0),
      month
    };
    setAiLoading(true);
    try {
      const report = import.meta.env.VITE_AI_CLIENT_MOCK === "false" ? await requestAiFinancialHealth(input) : mockAiFinancialHealth(input);
      setAiReport(report);
      notify("success", "AI 理財健檢已產生");
    } catch (error) {
      setAiReport(mockAiFinancialHealth(input));
      notify("error", error instanceof Error ? error.message : "AI 暫時無法使用，已顯示 mock 分析");
    } finally {
      setAiLoading(false);
    }
  }

  if (isSupabaseConfigured && !dataLoading && !sessionEmail) {
    return (
      <div className={rootClass}>
        <AuthPage
          dataNotice={dataNotice}
          onSignIn={handlePasswordSignIn}
          onSignUp={handlePasswordSignUp}
          onMagicLink={handleMagicLink}
        />
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 lg:block">
          <Brand />
          {currentProfile && (
            <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/80 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
              <p className="truncate font-semibold text-slate-950 dark:text-slate-50">{currentProfile.displayName || currentProfile.email}</p>
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{currentProfile.email}</p>
              <div className="mt-2"><Badge>{getRoleLabel(currentProfile)}</Badge></div>
            </div>
          )}
          <nav className="mt-6 space-y-5">
            {navGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{group.title}</p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavButton key={item.page} item={item} active={page === item.page} onClick={() => setPage(item.page)} />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-0">
          <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-[#f6f8fb]/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-brand-700 dark:text-brand-100">Asia/Taipei · TWD · YYYY/MM/DD</p>
                <h1 className="text-xl font-bold text-slate-950 dark:text-slate-50">{navItems.find((item) => item.page === page)?.label}</h1>
              </div>
              <div className="flex items-center gap-2">
                <label className="label hidden sm:block" htmlFor="month">
                  月份
                </label>
                <input id="month" className="input mt-0 w-36" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                <div className="relative">
                  <button
                    className="btn-secondary relative h-10 w-10 px-0"
                    title="通知中心"
                    aria-label={`通知中心，共 ${financeNotifications.length} 則提醒`}
                    onClick={() => setNotificationOpen((value) => !value)}
                  >
                    <Bell size={18} />
                    {financeNotifications.length > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-950">
                        {financeNotifications.length > 9 ? "9+" : financeNotifications.length}
                      </span>
                    )}
                  </button>
                  {notificationOpen && <NotificationPanel notifications={financeNotifications} onClose={() => setNotificationOpen(false)} />}
                </div>
                <button className="btn-secondary h-10 w-10 px-0" title="切換深色模式" onClick={() => setDarkMode((value) => !value)}>
                  <Moon size={18} />
                </button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
            <PageExperience page={page} dashboard={dashboard} month={month} notifications={financeNotifications.length} />
            {toast && <ToastBanner toast={toast} />}
            {page === "dashboard" && (
              <DashboardPage
                dashboard={dashboard}
                categoryBreakdown={categoryBreakdown}
                monthlyTrend={monthlyTrend}
                notifications={financeNotifications}
                accounts={accounts}
                creditCards={creditCards}
                creditCardInstallments={creditCardInstallments}
                loans={loans}
                dataLoading={dataLoading}
                dataNotice={dataNotice}
              />
            )}
            {page === "transactions" && (
              <TransactionsPage
                accounts={accounts}
                creditCards={creditCards}
                transactions={transactions}
                onAdd={addTransaction}
                onDelete={softDeleteTransaction}
                onCsvUpload={handleCsvUpload}
                csvPreview={csvPreview}
                onImportCsv={importCsvRows}
                rememberedCategories={rememberedCategories}
              />
            )}
            {page === "accounts" && <AccountsPage accounts={accounts} onAdd={addAccount} />}
            {page === "cards" && (
              <CardsPage
                cards={creditCards}
                accounts={accounts}
                installments={creditCardInstallments}
                setCards={setCreditCards}
                setInstallments={setCreditCardInstallments}
                notify={notify}
              />
            )}
            {page === "loans" && <LoansPage loans={loans} setLoans={setLoans} notify={notify} />}
            {page === "deposits" && <DepositsPage deposits={deposits} setDeposits={setDeposits} notify={notify} />}
            {page === "investments" && <InvestmentsPage notify={notify} />}
            {page === "calculators" && <CalculatorsPage />}
            {page === "budgets" && (
              <BudgetsPage budgets={budgets} transactions={transactions} month={month} setBudgets={setBudgets} notify={notify} />
            )}
            {page === "reminders" && <RemindersPage reminders={reminders} accounts={accounts} setReminders={setReminders} notify={notify} />}
            {page === "reports" && (
              <ReportsPage
                month={month}
                transactions={transactions}
                loans={loans}
                creditCards={creditCards}
                creditCardInstallments={creditCardInstallments}
                monthlyTrend={monthlyTrend}
                categoryBreakdown={categoryBreakdown}
                accounts={accounts}
                dashboard={dashboard}
              />
            )}
            {page === "ai" && (
              <AiPage
                report={aiReport}
                loading={aiLoading}
                onGenerate={generateAiReport}
                dashboard={dashboard}
                categoryBreakdown={categoryBreakdown}
              />
            )}
            {page === "settings" && (
              <SettingsPage
                isSupabaseConfigured={isSupabaseConfigured}
                sessionEmail={sessionEmail}
                profile={currentProfile}
                dataNotice={dataNotice}
                supabaseCheck={supabaseCheck}
                supabaseChecking={supabaseChecking}
                onRefresh={refreshFinanceData}
                onCheckSupabase={runSupabaseConnectionCheck}
                onSendSignInLink={async (email) => {
                  try {
                    await sendSignInLink(email);
                    notify("success", "登入連結已寄出，請到信箱完成登入");
                  } catch (error) {
                    notify("error", error instanceof Error ? error.message : "登入連結寄送失敗");
                  }
                }}
                onSignOut={async () => {
                  try {
                    await signOut();
                    await refreshFinanceData();
                    notify("success", "已登出");
                  } catch (error) {
                    notify("error", error instanceof Error ? error.message : "登出失敗");
                  }
                }}
              />
            )}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:hidden">
        <div className="grid grid-cols-6 gap-1 px-2 py-2">
          {navItems.slice(0, 6).map((item) => (
            <MobileNavButton key={item.page} item={item} active={page === item.page} onClick={() => setPage(item.page)} />
          ))}
        </div>
        <details className="border-t border-slate-200 px-2 pb-2 dark:border-slate-800">
          <summary className="flex cursor-pointer list-none items-center justify-center gap-1 py-1 text-xs text-slate-500">
            更多 <ChevronDown size={14} />
          </summary>
          <div className="space-y-2">
            {navGroups.map((group) => (
              <div key={group.title}>
                <p className="px-1 pb-1 text-[10px] font-bold tracking-[0.16em] text-slate-400">{group.title}</p>
                <div className="grid grid-cols-5 gap-1">
                  {group.items.filter((item) => !navItems.slice(0, 6).some((primary) => primary.page === item.page)).map((item) => (
                    <MobileNavButton key={item.page} item={item} active={page === item.page} onClick={() => setPage(item.page)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white shadow-md dark:bg-white dark:text-slate-950">
        <ShieldCheck size={22} />
      </div>
      <div>
        <p className="font-bold text-slate-950 dark:text-slate-50">Ez2SaveMore</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">個人投資理財助手</p>
      </div>
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
        active
          ? "border border-emerald-100 bg-emerald-50 text-brand-700 shadow-subtle dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-brand-100"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
      }`}
      onClick={onClick}
    >
      <span className={`flex h-8 w-8 items-center justify-center rounded-md ${active ? "bg-white text-brand-700 dark:bg-slate-950 dark:text-brand-100" : "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400"}`}>
        <Icon size={17} />
      </span>
      {item.label}
    </button>
  );
}

function MobileNavButton({ item, active, onClick }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium ${
        active ? "bg-emerald-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100" : "text-slate-500 dark:text-slate-400"
      }`}
      onClick={onClick}
    >
      <Icon size={17} />
      <span className="leading-tight">{item.label}</span>
    </button>
  );
}

function PageExperience({
  page,
  dashboard,
  month,
  notifications
}: {
  page: Page;
  dashboard: ReturnType<typeof summarizeDashboard>;
  month: string;
  notifications: number;
}) {
  const intro = pageIntros[page];
  return (
    <section
      className="tech-grid overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-5"
      style={{
        backgroundImage: `linear-gradient(115deg, ${intro.tint} 0%, rgba(255,255,255,0.96) 44%, rgba(255,255,255,0.98) 100%)`
      }}
    >
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr] lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-subtle dark:bg-slate-900 dark:text-slate-300">
            <Sparkles size={14} style={{ color: intro.accent }} />
            {intro.eyebrow}
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-normal text-slate-950">{intro.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{intro.description}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <PageMiniStat label="月份" value={month.replace("-", "/")} accent={intro.accent} />
          <PageMiniStat label="本月結餘" value={formatCompactMoney(dashboard.monthlyBalanceCents)} accent={dashboard.monthlyBalanceCents >= 0 ? "#059669" : "#dc2626"} />
          <PageMiniStat label="提醒" value={`${notifications}`} accent={notifications > 0 ? "#dc2626" : "#64748b"} />
        </div>
      </div>
    </section>
  );
}

function PageMiniStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-md border border-white/80 bg-white/85 p-3 shadow-subtle">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-bold text-slate-950" style={{ color: accent }}>{value}</p>
    </div>
  );
}

function ToastBanner({ toast }: { toast: NonNullable<Toast> }) {
  return (
    <div
      className={`mb-4 flex items-center gap-2 rounded-md border p-3 text-sm ${
        toast.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
          : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
      }`}
    >
      {toast.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      {toast.message}
    </div>
  );
}

function AuthPage({
  dataNotice,
  onSignIn,
  onSignUp,
  onMagicLink
}: {
  dataNotice: string;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, displayName: string) => Promise<void>;
  onMagicLink: (email: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submitAuth(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const displayName = String(formData.get("displayName") ?? "").trim();
    if (password.length < 8) {
      setMessage("密碼至少需要 8 碼。");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      if (mode === "signup") {
        await onSignUp(email, password, displayName || email.split("@")[0] || "使用者");
        setMessage("如果你的專案啟用 Email confirmation，請到信箱完成認證後再登入。");
      } else {
        await onSignIn(email, password);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "認證失敗");
    } finally {
      setLoading(false);
    }
  }

  async function submitMagicLink(formData: FormData) {
    const email = String(formData.get("magicEmail") ?? "").trim();
    setLoading(true);
    setMessage("");
    try {
      await onMagicLink(email);
      setMessage("認證信件已寄出，請至信箱點擊連結。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "認證信寄送失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="tech-grid min-h-screen bg-[#f6f8fb] text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <section className="mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:px-8">
        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-sky-500 to-amber-400" />
          <div className="flex items-center justify-between gap-3">
            <Brand />
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
              TWD · Asia/Taipei
            </span>
          </div>
          <div className="mt-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Personal finance OS
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-normal text-slate-950 dark:text-slate-50 sm:text-5xl">
              把你的總帳，整理成可以行動的財務決策。
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
              用一個清楚、安靜、專業的介面，管理帳戶、收支、信用卡、貸款、預算與提醒。從每月現金流到完整負債結構，都能快速看懂。
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <AuthMetric label="可視化總帳" value="15+" helper="核心財務指標" />
            <AuthMetric label="負債追蹤" value="3 層" helper="卡費、分期、貸款" />
            <AuthMetric label="報表輸出" value="PDF" helper="Excel / CSV 同步支援" />
          </div>

          <div className="mt-8 rounded-lg border border-slate-200 bg-slate-950 p-4 text-white shadow-lg dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-emerald-300">Live finance workspace</p>
                <p className="mt-1 text-lg font-semibold">本月財務指揮台</p>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-1 text-xs text-slate-200">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                已連接 Supabase
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-white/10 p-3">
                <p className="text-xs text-slate-300">淨資產</p>
                <p className="mt-2 text-2xl font-bold">+NT$842K</p>
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <p className="text-xs text-slate-300">本月結餘</p>
                <p className="mt-2 text-2xl font-bold text-emerald-300">+NT$18K</p>
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <p className="text-xs text-slate-300">負債壓力</p>
                <p className="mt-2 text-2xl font-bold text-amber-300">32%</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-md bg-white/10 p-4">
                <div className="flex h-32 items-end gap-2">
                  {[42, 64, 48, 76, 58, 88].map((height, index) => (
                    <div key={height} className="flex flex-1 flex-col items-center gap-2">
                      <div className="w-full rounded-t bg-emerald-400" style={{ height: `${height}%` }} />
                      <span className="text-[10px] text-slate-400">{index + 2}月</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3 rounded-md bg-white/10 p-4">
                <AuthPreviewRow label="信用卡待繳" value="NT$26,300" color="bg-sky-400" />
                <AuthPreviewRow label="貸款應繳" value="NT$18,900" color="bg-amber-300" />
                <AuthPreviewRow label="固定帳單" value="NT$12,480" color="bg-rose-300" />
              </div>
            </div>
          </div>
        </div>

        <div className="relative rounded-lg border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
          <div>
            <p className="text-sm font-semibold text-brand-700 dark:text-brand-100">開始使用</p>
            <h2 className="mt-2 text-2xl font-bold tracking-normal">登入你的財務工作台</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {dataNotice || "登入或註冊後，系統會載入你儲存在 Supabase 的資料。"}
            </p>
          </div>
          {message && <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</div>}
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
            <button className={`rounded-md px-3 py-2 text-sm font-semibold transition ${mode === "signin" ? "bg-white text-brand-700 shadow-subtle dark:bg-slate-800 dark:text-brand-100" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`} onClick={() => setMode("signin")}>登入</button>
            <button className={`rounded-md px-3 py-2 text-sm font-semibold transition ${mode === "signup" ? "bg-white text-brand-700 shadow-subtle dark:bg-slate-800 dark:text-brand-100" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`} onClick={() => setMode("signup")}>註冊</button>
          </div>
          <form className="mt-5 space-y-4" onSubmit={handleFormSubmit((formData) => void submitAuth(formData))}>
            {mode === "signup" && <Field label="顯示名稱"><input className="input" name="displayName" placeholder="例如 Renault" /></Field>}
            <Field label="Email"><input className="input" name="email" type="email" autoComplete="email" required /></Field>
            <Field label="密碼"><input className="input" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required /></Field>
            <button className="btn-primary h-11 w-full" type="submit" disabled={loading}>
              {loading ? "處理中" : mode === "signup" ? "建立帳號並寄送認證信" : "登入 Ez2SaveMore"}
            </button>
          </form>
          <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            免密碼登入
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>
          <form className="space-y-4" onSubmit={handleFormSubmit((formData) => void submitMagicLink(formData))}>
            <Field label="Email 認證登入信"><input className="input" name="magicEmail" type="email" autoComplete="email" required /></Field>
            <button className="btn-secondary h-11 w-full" type="submit" disabled={loading}>寄送 Magic Link</button>
          </form>
          <p className="mt-5 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
            最高管理員帳號會由 Supabase profile role 判定；一般使用者無法自行提升權限。
          </p>
        </div>
      </section>
    </main>
  );
}

function AuthMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-slate-50">{value}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p>
    </div>
  );
}

function AuthPreviewRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div className={`h-2 rounded-full ${color}`} style={{ width: label === "信用卡待繳" ? "72%" : label === "貸款應繳" ? "54%" : "38%" }} />
      </div>
    </div>
  );
}

function NotificationPanel({ notifications, onClose }: { notifications: FinanceNotification[]; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-12 z-40 w-[calc(100vw-2rem)] max-w-md rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-950 dark:text-slate-50">通知中心</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">信用卡、貸款、分期與固定帳單提醒</p>
        </div>
        <button className="btn-secondary px-2 py-1" onClick={onClose}>關閉</button>
      </div>
      <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            目前沒有本月提醒。
          </div>
        ) : (
          notifications.map((item) => (
            <div key={item.id} className={`rounded-md border p-3 ${getNotificationClass(item.status)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm opacity-90">{item.detail}</p>
                </div>
                <span className="shrink-0 rounded bg-white/70 px-2 py-1 text-xs font-semibold dark:bg-slate-950/50">{getNotificationStatusLabel(item.status)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-90">
                <span>{formatDate(item.date)}</span>
                {item.amountCents !== undefined && <span>{formatMoney(item.amountCents)}</span>}
                <span>{getNotificationSourceLabel(item.source)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function buildFinanceNotifications({
  month,
  reminders,
  creditCards,
  installments,
  loans
}: {
  month: string;
  reminders: FinancialReminder[];
  creditCards: CreditCard[];
  installments: CreditCardInstallment[];
  loans: Loan[];
}): FinanceNotification[] {
  const items: FinanceNotification[] = [];
  const todayIso = getTaipeiTodayIso();

  creditCards
    .filter((card) => card.isActive)
    .forEach((card) => {
      const statementDate = createMonthlyDate(month, card.statementDay);
      const dueDate = createMonthlyDate(month, card.paymentDueDay);
      items.push({
        id: `card-statement-${card.id}-${statementDate}`,
        title: `${card.name} 結帳日`,
        detail: `${card.issuer} **** ${card.last4}，本期帳款 ${formatMoney(card.currentStatementAmountCents)}，未出帳 ${formatMoney(card.unbilledAmountCents)}`,
        date: statementDate,
        amountCents: card.currentStatementAmountCents + card.unbilledAmountCents,
        source: "credit_card",
        status: getNotificationStatus(statementDate, todayIso, 5)
      });
      items.push({
        id: `card-due-${card.id}-${dueDate}`,
        title: `${card.name} 繳款截止`,
        detail: `本期帳單 ${formatMoney(card.currentStatementAmountCents)}，最低應繳 ${formatMoney(card.minimumPaymentCents)}。最低應繳僅作提醒，不建議作為長期策略。`,
        date: dueDate,
        amountCents: card.currentStatementAmountCents,
        source: "credit_card",
        status: getNotificationStatus(dueDate, todayIso, 7)
      });
    });

  installments
    .filter((installment) => installment.status === "active")
    .filter((installment) => installment.nextDueDate?.startsWith(month))
    .forEach((installment) => {
      const date = installment.nextDueDate as string;
      const card = creditCards.find((candidate) => candidate.id === installment.creditCardId);
      items.push({
        id: `installment-${installment.id}-${date}`,
        title: `${installment.merchant || card?.name || "信用卡"} 分期應繳`,
        detail: `${card?.name ?? "信用卡"}，已還 ${installment.paidPeriods}/${installment.periods} 期，剩餘 ${formatMoney(installment.remainingAmountCents)}，年利率 ${formatPercent(installment.annualRate)}`,
        date,
        amountCents: installment.monthlyPaymentCents,
        source: "installment",
        status: getNotificationStatus(date, todayIso, 7)
      });
    });

  loans
    .filter((loan) => loan.status === "active")
    .forEach((loan) => {
      const date = createMonthlyDate(month, loan.monthlyPaymentDay);
      items.push({
        id: `loan-${loan.id}-${date}`,
        title: `${loan.name} 貸款還款`,
        detail: `${loan.institution || "貸款"}，剩餘本金 ${formatMoney(loan.remainingPrincipalCents)}，已繳 ${loan.paidPeriods}/${loan.termMonths} 期`,
        date,
        amountCents: loan.paymentPerPeriodCents,
        source: "loan",
        status: getNotificationStatus(date, todayIso, 7)
      });
    });

  reminders
    .filter((reminder) => reminder.status !== "done")
    .forEach((reminder) => {
      const date = createMonthlyDate(month, reminder.debitDay);
      if (reminder.startDate > date) return;
      if (reminder.endDate && reminder.endDate < date) return;
      items.push({
        id: `reminder-${reminder.id}-${date}`,
        title: reminder.name,
        detail: `${reminder.frequency} 固定帳單${reminder.autoCreateTransaction ? "，可自動建立交易" : ""}`,
        date,
        amountCents: reminder.amountCents,
        source: "reminder",
        status: getNotificationStatus(date, todayIso, reminder.remindDaysBefore)
      });
    });

  const statusWeight: Record<FinanceNotification["status"], number> = {
    overdue: 0,
    due_today: 1,
    upcoming: 2,
    scheduled: 3
  };
  return items.sort((a, b) => statusWeight[a.status] - statusWeight[b.status] || a.date.localeCompare(b.date));
}

function createMonthlyDate(month: string, day: number) {
  const [yearValue, monthValue] = month.split("-").map(Number);
  const safeDay = Math.max(1, Math.min(day || 1, new Date(yearValue, monthValue, 0).getDate()));
  return `${yearValue}-${String(monthValue).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function getTaipeiTodayIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function getNotificationStatus(date: string, todayIso: string, remindDaysBefore: number): FinanceNotification["status"] {
  const diff = getDaysBetween(todayIso, date);
  if (diff < 0) return "overdue";
  if (diff === 0) return "due_today";
  if (diff <= Math.max(0, remindDaysBefore)) return "upcoming";
  return "scheduled";
}

function getDaysBetween(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T00:00:00+08:00`).getTime();
  const to = new Date(`${toIso}T00:00:00+08:00`).getTime();
  return Math.round((to - from) / 86_400_000);
}

function getNotificationStatusLabel(status: FinanceNotification["status"]) {
  const labels: Record<FinanceNotification["status"], string> = {
    overdue: "已逾期",
    due_today: "今日到期",
    upcoming: "即將到期",
    scheduled: "已排程"
  };
  return labels[status];
}

function getNotificationSourceLabel(source: FinanceNotification["source"]) {
  const labels: Record<FinanceNotification["source"], string> = {
    credit_card: "信用卡",
    loan: "貸款",
    installment: "分期",
    reminder: "固定帳單"
  };
  return labels[source];
}

function getNotificationClass(status: FinanceNotification["status"]) {
  const classes: Record<FinanceNotification["status"], string> = {
    overdue: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
    due_today: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
    upcoming: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
    scheduled: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
  };
  return classes[status];
}

function DashboardPage({
  dashboard,
  categoryBreakdown,
  monthlyTrend,
  notifications,
  accounts,
  creditCards,
  creditCardInstallments,
  loans,
  dataLoading,
  dataNotice
}: {
  dashboard: ReturnType<typeof summarizeDashboard>;
  categoryBreakdown: { category: string; amountCents: number }[];
  monthlyTrend: { month: string; incomeCents: number; expenseCents: number }[];
  notifications: FinanceNotification[];
  accounts: FinancialAccount[];
  creditCards: CreditCard[];
  creditCardInstallments: CreditCardInstallment[];
  loans: Loan[];
  dataLoading: boolean;
  dataNotice: string;
}) {
  const stats = [
    ["目前總資產", dashboard.totalAssetsCents],
    ["目前總負債", dashboard.totalLiabilitiesCents],
    ["淨資產", dashboard.netWorthCents],
    ["本月收入", dashboard.monthlyIncomeCents],
    ["本月支出", dashboard.monthlyExpenseCents],
    ["本月結餘", dashboard.monthlyBalanceCents],
    ["本月信用卡待繳", dashboard.monthlyCreditCardDueCents],
    ["本月貸款應繳", dashboard.monthlyLoanDueCents],
    ["可動用現金", dashboard.availableCashCents],
    ["定期存款總額", dashboard.timeDepositTotalCents]
  ] as const;

  return (
    <div className="space-y-4">
      {dataLoading && <InlineNotice tone="neutral" message="正在讀取 Supabase 已儲存資料..." />}
      {!dataLoading && dataNotice && <InlineNotice tone="warning" message={dataNotice} />}
      <DashboardPulse dashboard={dashboard} monthlyTrend={monthlyTrend} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([label, value]) => (
          <StatCard key={label} label={label} value={formatMoney(value)} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel lg:col-span-2">
          <h2 className="text-lg font-semibold">全部帳戶餘額分布</h2>
          <AccountBalanceChart accounts={accounts} />
        </section>
        <section className="panel">
          <h2 className="text-lg font-semibold">總帳結構</h2>
          <LedgerDonut dashboard={dashboard} />
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel">
          <h2 className="text-lg font-semibold">資產帳戶類型</h2>
          <AccountTypeChart accounts={accounts} />
        </section>
        <section className="panel">
          <h2 className="text-lg font-semibold">可動用現金比例</h2>
          <CashAvailabilityChart accounts={accounts} />
        </section>
        <section className="panel">
          <h2 className="text-lg font-semibold">負債來源</h2>
          <LiabilityChart creditCards={creditCards} installments={creditCardInstallments} loans={loans} />
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel lg:col-span-2">
          <h2 className="text-lg font-semibold">最近六個月收支趨勢</h2>
          <TrendChart data={monthlyTrend} />
        </section>
        <section className="panel">
          <h2 className="text-lg font-semibold">資產負債與預備金</h2>
          <div className="mt-4 space-y-4">
            <Progress label="負債比" value={dashboard.debtRatio} colorClass={dashboard.debtRatio > 0.5 ? "bg-rose-600" : "bg-amber-500"} />
            <Progress label="緊急預備金月數" value={Math.min(dashboard.emergencyFundMonths / 6, 1)} helper={`${dashboard.emergencyFundMonths.toFixed(1)} 個月`} colorClass="bg-emerald-600" />
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              淨資產 = 總資產 - 總負債；若分母為 0，比例會安全顯示為 0。
            </p>
          </div>
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel lg:col-span-2">
          <h2 className="text-lg font-semibold">本月支出分類</h2>
          <CategoryBars data={categoryBreakdown} />
        </section>
        <section className="panel">
          <h2 className="text-lg font-semibold">最近即將到期項目</h2>
          <div className="mt-3 space-y-3">
            {notifications.length === 0 && <EmptyState label="本月尚無信用卡、貸款或帳單提醒" />}
            {notifications.slice(0, 5).map((item) => (
              <div key={item.id} className={`rounded-md border p-3 ${getNotificationClass(item.status)}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{item.title}</p>
                  <span className="text-xs font-semibold">{getNotificationStatusLabel(item.status)}</span>
                </div>
                <p className="mt-1 text-sm opacity-90">{formatDate(item.date)} · {item.amountCents !== undefined ? formatMoney(item.amountCents) : getNotificationSourceLabel(item.source)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function DashboardPulse({
  dashboard,
  monthlyTrend
}: {
  dashboard: ReturnType<typeof summarizeDashboard>;
  monthlyTrend: { month: string; incomeCents: number; expenseCents: number }[];
}) {
  const latest = monthlyTrend.at(-1);
  const prior = monthlyTrend.at(-2);
  const latestBalance = latest ? latest.incomeCents - latest.expenseCents : dashboard.monthlyBalanceCents;
  const priorBalance = prior ? prior.incomeCents - prior.expenseCents : 0;
  const balanceDelta = latestBalance - priorBalance;
  const positiveBalance = dashboard.monthlyBalanceCents >= 0;
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 p-4 text-white shadow-lg dark:border-slate-800 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr] lg:items-center">
        <div>
          <p className="text-sm font-medium text-emerald-300">財務脈搏</p>
          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
            <div>
              <p className="text-sm text-slate-300">淨資產</p>
              <p className="break-words text-4xl font-bold tracking-normal text-white">{formatMoney(dashboard.netWorthCents)}</p>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold ${
                positiveBalance
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-100"
              }`}
            >
              {positiveBalance ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              本月結餘 {formatMoney(dashboard.monthlyBalanceCents)}
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <PulseMetric label="可動用現金" value={formatMoney(dashboard.availableCashCents)} accent="border-emerald-400" />
            <PulseMetric label="負債比" value={formatPercent(dashboard.debtRatio)} accent="border-amber-300" />
            <PulseMetric label="預備金" value={`${dashboard.emergencyFundMonths.toFixed(1)} 個月`} accent="border-sky-300" />
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-white">近月現金流</p>
            <span className={`text-sm font-semibold ${balanceDelta >= 0 ? "text-emerald-700 dark:text-emerald-100" : "text-rose-700 dark:text-rose-100"}`}>
              {balanceDelta >= 0 ? "+" : ""}{formatMoney(balanceDelta)}
            </span>
          </div>
          <CashFlowMiniChart data={monthlyTrend} />
        </div>
      </div>
    </section>
  );
}

function PulseMetric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className={`rounded-md border-l-4 ${accent} bg-white/10 px-3 py-2`}>
      <p className="text-xs text-slate-300">{label}</p>
      <p className="mt-1 break-words text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  const theme = getStatTheme(label);
  return (
    <div className={`panel min-h-24 border-l-4 ${theme.border} bg-white/95`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`h-2.5 w-2.5 rounded-full ${theme.dot}`} />
      </div>
      <p className={`mt-2 break-words text-2xl font-bold tracking-normal ${theme.text}`}>{value}</p>
    </div>
  );
}

function getStatTheme(label: string) {
  if (label.includes("負債") || label.includes("支出") || label.includes("待繳") || label.includes("應繳")) {
    return { border: "border-rose-500", dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-100" };
  }
  if (label.includes("收入") || label.includes("資產") || label.includes("現金") || label.includes("存款")) {
    return { border: "border-emerald-500", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-100" };
  }
  if (label.includes("結餘")) {
    return { border: "border-sky-500", dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-100" };
  }
  return { border: "border-slate-300 dark:border-slate-700", dot: "bg-slate-400", text: "text-slate-950 dark:text-slate-50" };
}

function FeatureHero({
  icon,
  label,
  title,
  value,
  metrics,
  children,
  tone = "emerald"
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  value: string;
  metrics: { label: string; value: string; accent: string }[];
  children?: React.ReactNode;
  tone?: "emerald" | "sky" | "violet" | "amber" | "rose" | "slate";
}) {
  const toneClass = {
    emerald: "from-slate-950 via-emerald-950 to-sky-950 border-emerald-200 dark:border-emerald-900 text-emerald-200",
    sky: "from-slate-950 via-sky-950 to-emerald-950 border-sky-200 dark:border-sky-900 text-sky-200",
    violet: "from-slate-950 via-violet-950 to-sky-950 border-violet-200 dark:border-violet-900 text-violet-200",
    amber: "from-slate-950 via-amber-950 to-emerald-950 border-amber-200 dark:border-amber-900 text-amber-200",
    rose: "from-slate-950 via-rose-950 to-violet-950 border-rose-200 dark:border-rose-900 text-rose-200",
    slate: "from-slate-950 via-slate-900 to-sky-950 border-slate-200 dark:border-slate-800 text-slate-200"
  }[tone];
  return (
    <section className={`overflow-hidden rounded-xl border bg-gradient-to-br p-5 text-white shadow-card ${toneClass}`}>
      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {label}
          </div>
          <p className="mt-3 text-sm text-slate-300">{title}</p>
          <p className="mt-1 break-words text-4xl font-bold tracking-normal text-white">{value}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {metrics.map((metric) => (
              <PulseMetric key={metric.label} label={metric.label} value={metric.value} accent={metric.accent} />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/10 p-4">
          {children}
        </div>
      </div>
    </section>
  );
}

function Progress({ label, value, helper, colorClass = "bg-brand-600" }: { label: string; value: number; helper?: string; colorClass?: string }) {
  const bounded = Math.max(0, Math.min(value, 1));
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span>{helper ?? formatPercent(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
        <div className={`h-2 rounded-full ${colorClass}`} style={{ width: `${bounded * 100}%` }} />
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: { month: string; incomeCents: number; expenseCents: number }[] }) {
  if (data.length === 0) return <EmptyState label="尚無收支趨勢資料" />;
  const width = 720;
  const height = 260;
  const padding = { top: 18, right: 24, bottom: 36, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const netValues = data.map((item) => item.incomeCents - item.expenseCents);
  const maxValue = Math.max(...data.flatMap((item) => [item.incomeCents, item.expenseCents]), ...netValues, 1);
  const minValue = Math.min(0, ...netValues);
  const range = Math.max(maxValue - minValue, 1);
  const yFor = (value: number) => padding.top + ((maxValue - value) / range) * plotHeight;
  const slot = plotWidth / data.length;
  const barWidth = Math.min(24, slot / 4);
  const zeroY = yFor(0);
  const linePoints = data
    .map((item, index) => `${padding.left + slot * index + slot / 2},${yFor(item.incomeCents - item.expenseCents)}`)
    .join(" ");
  return (
    <div className="mt-4">
      <ChartLegend
        items={[
          { color: "#059669", label: "收入" },
          { color: "#0284c7", label: "支出" },
          { color: "#d97706", label: "淨現金流" }
        ]}
      />
      <div className="mt-3 overflow-x-auto">
        <svg className="min-w-[680px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="最近六個月收入支出與淨現金流趨勢">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + ratio * plotHeight;
            return <line key={ratio} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" />;
          })}
          <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="currentColor" className="text-slate-400 dark:text-slate-600" strokeDasharray="4 5" />
          {data.map((item, index) => {
            const center = padding.left + slot * index + slot / 2;
            const incomeHeight = Math.abs(zeroY - yFor(item.incomeCents));
            const expenseHeight = Math.abs(zeroY - yFor(item.expenseCents));
            return (
              <g key={item.month}>
                <rect x={center - barWidth - 3} y={Math.min(zeroY, yFor(item.incomeCents))} width={barWidth} height={Math.max(3, incomeHeight)} rx="4" fill="#059669">
                  <title>{`${item.month} 收入 ${formatMoney(item.incomeCents)}`}</title>
                </rect>
                <rect x={center + 3} y={Math.min(zeroY, yFor(item.expenseCents))} width={barWidth} height={Math.max(3, expenseHeight)} rx="4" fill="#0284c7">
                  <title>{`${item.month} 支出 ${formatMoney(item.expenseCents)}`}</title>
                </rect>
                <text x={center} y={height - 12} textAnchor="middle" className="fill-slate-500 text-xs">{item.month.slice(5)}</text>
              </g>
            );
          })}
          <polyline points={linePoints} fill="none" stroke="#d97706" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {data.map((item, index) => {
            const center = padding.left + slot * index + slot / 2;
            const net = item.incomeCents - item.expenseCents;
            return (
              <circle key={`${item.month}-net`} cx={center} cy={yFor(net)} r="4" fill="#d97706" stroke="white" strokeWidth="2">
                <title>{`${item.month} 淨現金流 ${formatMoney(net)}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function CategoryBars({ data }: { data: { category: string; amountCents: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.amountCents, 0);
  if (data.length === 0) return <EmptyState label="本月尚無支出資料" />;
  const topItems = data.slice(0, 6);
  return (
    <div className="mt-4 space-y-4">
      <StackedDistribution data={topItems} total={total} />
      {topItems.map((item, index) => (
        <div key={item.category}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: getChartColor(index) }} />
              {item.category}
            </span>
            <span className="shrink-0 font-semibold">{formatMoney(item.amountCents)} · {formatPercent(item.amountCents / Math.max(total, 1))}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-2.5 rounded-full" style={{ width: `${(item.amountCents / Math.max(total, 1)) * 100}%`, backgroundColor: getChartColor(index) }} />
          </div>
        </div>
      ))}
      {data.length > topItems.length && <p className="text-xs text-slate-500">其餘 {data.length - topItems.length} 個分類合併保留在報表資料中。</p>}
    </div>
  );
}

function InlineNotice({ message, tone }: { message: string; tone: "neutral" | "warning" }) {
  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
      }`}
    >
      {message}
    </div>
  );
}

function AccountBalanceChart({ accounts }: { accounts: FinancialAccount[] }) {
  const active = accounts.filter((account) => account.isActive && account.balanceCents > 0).sort((a, b) => b.balanceCents - a.balanceCents);
  const max = Math.max(...active.map((account) => account.balanceCents), 1);
  if (active.length === 0) return <EmptyState label="尚無帳戶資料，新增帳戶後會顯示總帳分布" />;
  const total = active.reduce((sum, account) => sum + account.balanceCents, 0);
  return (
    <div className="mt-4 space-y-4">
      <StackedDistribution data={active.map((account) => ({ category: account.name, amountCents: account.balanceCents })).slice(0, 8)} total={total} />
      <div className="grid gap-3 md:grid-cols-2">
      {active.slice(0, 8).map((account, index) => (
        <div key={account.id}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: getChartColor(index) }} />
              {account.name}
            </span>
            <span className="shrink-0 font-semibold">{formatMoney(account.balanceCents)}</span>
          </div>
          <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-3 rounded-full" style={{ width: `${Math.max(4, (account.balanceCents / max) * 100)}%`, backgroundColor: getChartColor(index) }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">{accountTypeLabels[account.type]} · {formatPercent(account.balanceCents / Math.max(total, 1))}</p>
        </div>
      ))}
      </div>
    </div>
  );
}

function LedgerDonut({ dashboard }: { dashboard: ReturnType<typeof summarizeDashboard> }) {
  const assets = Math.max(0, dashboard.totalAssetsCents);
  const liabilities = Math.max(0, dashboard.totalLiabilitiesCents);
  return (
    <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
      <DonutChart
        segments={[
          { label: "資產", value: assets, color: "#059669" },
          { label: "負債", value: liabilities, color: "#0284c7" }
        ]}
        centerLabel="淨資產"
        centerValue={formatCompactMoney(dashboard.netWorthCents)}
      />
      <div className="space-y-3 text-sm">
        <Legend color="#059669" label="資產" value={formatMoney(assets)} />
        <Legend color="#0284c7" label="負債" value={formatMoney(liabilities)} />
        <Legend color="#d97706" label="負債比" value={formatPercent(dashboard.debtRatio)} />
      </div>
    </div>
  );
}

function AccountTypeChart({ accounts }: { accounts: FinancialAccount[] }) {
  const grouped = accounts.reduce<Map<string, number>>((map, account) => {
    map.set(accountTypeLabels[account.type], (map.get(accountTypeLabels[account.type]) ?? 0) + account.balanceCents);
    return map;
  }, new Map());
  return <MiniBars data={[...grouped.entries()].map(([label, amountCents]) => ({ label, amountCents }))} emptyLabel="尚無帳戶類型資料" />;
}

function CashAvailabilityChart({ accounts }: { accounts: FinancialAccount[] }) {
  const available = accounts.filter((account) => account.includeInAvailableCash).reduce((sum, account) => sum + account.balanceCents, 0);
  const locked = accounts.filter((account) => !account.includeInAvailableCash).reduce((sum, account) => sum + account.balanceCents, 0);
  return (
    <MiniBars
      data={[
        { label: "可動用", amountCents: available },
        { label: "暫不可動用", amountCents: locked }
      ]}
      emptyLabel="尚無可動用現金資料"
    />
  );
}

function LiabilityChart({ creditCards, installments, loans }: { creditCards: CreditCard[]; installments: CreditCardInstallment[]; loans: Loan[] }) {
  const cardDebt = creditCards.reduce((sum, card) => sum + card.currentStatementAmountCents + card.unbilledAmountCents, 0);
  const installmentDebt = getInstallmentDebtCents(creditCards, installments);
  const loanDebt = loans.reduce((sum, loan) => sum + loan.remainingPrincipalCents, 0);
  const monthlyPressure = creditCards.reduce((sum, card) => sum + card.minimumPaymentCents, 0) + getInstallmentMonthlyDueCents(installments) + loans.reduce((sum, loan) => sum + loan.paymentPerPeriodCents, 0);
  return (
    <div>
      <MiniBars
        data={[
          { label: "信用卡帳款", amountCents: cardDebt },
          { label: "信用卡分期", amountCents: installmentDebt },
          { label: "貸款", amountCents: loanDebt }
        ]}
        emptyLabel="尚無負債資料"
      />
      {(cardDebt + installmentDebt + loanDebt) > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          每月最低現金流壓力約 {formatMoney(monthlyPressure)}，包含信用卡最低應繳、分期與貸款應繳。
        </div>
      )}
    </div>
  );
}

function getInstallmentDebtCents(cards: CreditCard[], installments: CreditCardInstallment[]): number {
  const activeInstallments = installments.filter((installment) => installment.status === "active");
  if (activeInstallments.length > 0) {
    return activeInstallments.reduce((sum, installment) => sum + installment.remainingAmountCents, 0);
  }
  return cards.reduce((sum, card) => sum + card.installmentBalanceCents, 0);
}

function getInstallmentMonthlyDueCents(installments: CreditCardInstallment[]): number {
  return installments
    .filter((installment) => installment.status === "active")
    .reduce((sum, installment) => sum + installment.monthlyPaymentCents, 0);
}

function getCardInstallmentDebt(cardId: string, installments: CreditCardInstallment[], fallbackCents: number): number {
  const cardInstallments = installments.filter((installment) => installment.creditCardId === cardId && installment.status === "active");
  if (cardInstallments.length > 0) {
    return cardInstallments.reduce((sum, installment) => sum + installment.remainingAmountCents, 0);
  }
  return fallbackCents;
}

function summarizeInstallmentDebt(installments: CreditCardInstallment[]) {
  const active = installments.filter((installment) => installment.status === "active");
  const totalRemainingCents = active.reduce((sum, installment) => sum + installment.remainingAmountCents, 0);
  const monthlyDueCents = getInstallmentMonthlyDueCents(active);
  const weightedRateSum = active.reduce((sum, installment) => sum + installment.remainingAmountCents * installment.annualRate, 0);
  return {
    totalRemainingCents,
    monthlyDueCents,
    weightedAverageAnnualRate: totalRemainingCents > 0 ? weightedRateSum / totalRemainingCents : 0,
    activeCount: active.length
  };
}

function InstallmentDebtTable({ cards, installments }: { cards: CreditCard[]; installments: CreditCardInstallment[] }) {
  const active = installments.filter((installment) => installment.status === "active");
  if (active.length === 0) return <EmptyState label="尚無信用卡分期負債資料" />;
  const cardName = (cardId: string) => cards.find((card) => card.id === cardId)?.name ?? "信用卡";
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th>卡片</th>
            <th>項目</th>
            <th>總額</th>
            <th>年利率</th>
            <th>已還</th>
            <th>剩餘</th>
            <th>期數</th>
            <th>每月應繳</th>
            <th>下次應繳</th>
          </tr>
        </thead>
        <tbody>
          {active.map((installment) => (
            <tr key={installment.id} className="border-t border-slate-200 dark:border-slate-800">
              <td className="py-3">{cardName(installment.creditCardId)}</td>
              <td>{installment.merchant || "-"}</td>
              <td>{formatMoney(installment.totalAmountCents)}</td>
              <td>{formatPercent(installment.annualRate)}</td>
              <td>{formatMoney(installment.paidAmountCents)}</td>
              <td className="font-semibold">{formatMoney(installment.remainingAmountCents)}</td>
              <td>{installment.paidPeriods}/{installment.periods}</td>
              <td>{formatMoney(installment.monthlyPaymentCents)}</td>
              <td>{installment.nextDueDate ? formatDate(installment.nextDueDate) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniBars({ data, emptyLabel }: { data: { label: string; amountCents: number }[]; emptyLabel: string }) {
  const filtered = data.filter((item) => item.amountCents > 0);
  const total = filtered.reduce((sum, item) => sum + item.amountCents, 0);
  if (filtered.length === 0) return <EmptyState label={emptyLabel} />;
  return (
    <div className="mt-4 space-y-4">
      <StackedDistribution data={filtered.map((item) => ({ category: item.label, amountCents: item.amountCents }))} total={total} />
      {filtered.map((item, index) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: getChartColor(index) }} />
              {item.label}
            </span>
            <span className="shrink-0 font-semibold">{formatMoney(item.amountCents)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(4, (item.amountCents / Math.max(total, 1)) * 100)}%`, backgroundColor: getChartColor(index) }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">{formatPercent(item.amountCents / Math.max(total, 1))}</p>
        </div>
      ))}
    </div>
  );
}

function StackedDistribution({ data, total }: { data: { category: string; amountCents: number }[]; total: number }) {
  if (total <= 0) return null;
  return (
    <div className="flex h-4 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-label="比例分布">
      {data.map((item, index) => (
        <div
          key={item.category}
          style={{ width: `${(item.amountCents / total) * 100}%`, backgroundColor: getChartColor(index) }}
          title={`${item.category} ${formatMoney(item.amountCents)} ${formatPercent(item.amountCents / total)}`}
        />
      ))}
    </div>
  );
}

function CompactDistributionList({
  data,
  total,
  inverse = false
}: {
  data: { category: string; amountCents: number }[];
  total: number;
  inverse?: boolean;
}) {
  const filtered = data.filter((item) => item.amountCents > 0);
  if (filtered.length === 0 || total <= 0) return <p className={`text-sm ${inverse ? "text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>尚無分布資料</p>;
  return (
    <div className="space-y-2">
      {filtered.map((item, index) => (
        <div key={item.category} className={`flex items-center justify-between gap-3 text-sm ${inverse ? "text-slate-200" : "text-slate-600 dark:text-slate-300"}`}>
          <span className="min-w-0 truncate">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: getChartColor(index) }} />
            {item.category}
          </span>
          <span className="shrink-0 font-semibold">{formatPercent(item.amountCents / total)}</span>
        </div>
      ))}
    </div>
  );
}

function DepositMaturityBars({ data, total }: { data: { month: string; amountCents: number }[]; total: number }) {
  const filtered = data.filter((item) => item.amountCents > 0);
  if (filtered.length === 0) return <EmptyState label="尚無存款到期資料" />;
  const max = Math.max(...filtered.map((item) => item.amountCents), 1);
  return (
    <div className="mt-4 space-y-4">
      <StackedDistribution data={filtered.map((item) => ({ category: item.month, amountCents: item.amountCents }))} total={total} />
      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((item, index) => (
          <div key={item.month}>
            <div className="mb-1 flex justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: getChartColor(index) }} />
                {item.month}
              </span>
              <span className="shrink-0 font-semibold">{formatMoney(item.amountCents)}</span>
            </div>
            <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="h-3 rounded-full" style={{ width: `${Math.max(4, (item.amountCents / max) * 100)}%`, backgroundColor: getChartColor(index) }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">{formatPercent(item.amountCents / Math.max(total, 1))}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetPlanChart({
  rows
}: {
  rows: { category: string; budgetCents: number; spentCents: number; remainingCents: number; ratio: number }[];
}) {
  const activeRows = rows.filter((row) => row.budgetCents > 0 || row.spentCents > 0);
  if (activeRows.length === 0) return <EmptyState label="尚無預算資料，新增分類預算後會顯示規劃圖表" />;
  const max = Math.max(...activeRows.map((row) => Math.max(row.budgetCents, row.spentCents)), 1);
  return (
    <div className="mt-4 space-y-4">
      {activeRows.map((row, index) => {
        const overBudget = row.spentCents > row.budgetCents && row.budgetCents > 0;
        return (
          <div key={row.category} className="rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-semibold">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: getChartColor(index) }} />
                <span className="truncate">{row.category}</span>
              </span>
              <span className={`shrink-0 font-semibold ${overBudget ? "text-rose-600 dark:text-rose-300" : "text-slate-700 dark:text-slate-200"}`}>
                {formatPercent(row.ratio)}
              </span>
            </div>
            <div className="space-y-2">
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>預算</span>
                  <span>{formatMoney(row.budgetCents)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(4, (row.budgetCents / max) * 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>已使用</span>
                  <span>{formatMoney(row.spentCents)}{overBudget ? ` · 超支 ${formatMoney(row.spentCents - row.budgetCents)}` : ""}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className={`h-2 rounded-full ${overBudget ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(4, (row.spentCents / max) * 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({
  segments,
  centerLabel,
  centerValue
}: {
  segments: { label: string; value: number; color: string }[];
  centerLabel: string;
  centerValue: string;
}) {
  const size = 156;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const total = Math.max(segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0), 1);
  let offset = 0;
  return (
    <svg className="h-40 w-40 shrink-0" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel} ${centerValue}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="18" />
      {segments.map((segment) => {
        const value = Math.max(0, segment.value);
        const dash = (value / total) * circumference;
        const element = (
          <circle
            key={segment.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          >
            <title>{`${segment.label} ${formatMoney(segment.value)}`}</title>
          </circle>
        );
        offset += dash;
        return element;
      })}
      <text x="78" y="72" textAnchor="middle" className="fill-slate-500 text-xs">{centerLabel}</text>
      <text x="78" y="92" textAnchor="middle" className="fill-slate-950 text-base font-bold dark:fill-slate-50">{centerValue}</text>
    </svg>
  );
}

function CashFlowMiniChart({ data }: { data: { month: string; incomeCents: number; expenseCents: number }[] }) {
  const values = data.map((item) => item.incomeCents - item.expenseCents);
  if (values.length === 0) return <EmptyState label="尚無現金流資料" />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const width = 420;
  const height = 94;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = 12 + ((max - value) / range) * 66;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="mt-3 overflow-hidden">
      <svg className="w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="近月淨現金流迷你趨勢">
        <polyline points={points} fill="none" stroke="#059669" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((value, index) => {
          const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
          const y = 12 + ((max - value) / range) * 66;
          return (
            <circle key={data[index].month} cx={x} cy={y} r="4" fill={value >= 0 ? "#059669" : "#dc2626"}>
              <title>{`${data[index].month} ${formatMoney(value)}`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 rounded" style={{ backgroundColor: color }} />
      <span className="min-w-10 text-slate-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function getChartColor(index: number) {
  return chartPalette[index % chartPalette.length];
}

function formatCompactMoney(cents: number) {
  const amount = cents / 100;
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    notation: Math.abs(amount) >= 1000000 ? "compact" : "standard",
    maximumFractionDigits: 0
  }).format(amount);
}

function TransactionsPage({
  accounts,
  creditCards,
  transactions,
  onAdd,
  onDelete,
  onCsvUpload,
  csvPreview,
  onImportCsv,
  rememberedCategories
}: {
  accounts: FinancialAccount[];
  creditCards: CreditCard[];
  transactions: Transaction[];
  onAdd: (formData: FormData) => void;
  onDelete: (id: string) => void;
  onCsvUpload: (file: File | null) => void;
  csvPreview: ReturnType<typeof parseTransactionsCsv>;
  onImportCsv: () => void;
  rememberedCategories: string[];
}) {
  const currentMonth = currentTaipeiMonth();
  const monthlyTransactions = transactions.filter((transaction) => transaction.date.startsWith(currentMonth));
  const monthlyIncomeCents = monthlyTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const monthlyExpenseCents = monthlyTransactions
    .filter((transaction) => transaction.type === "expense" || transaction.type === "credit_card_purchase")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const monthlyBalanceCents = monthlyIncomeCents - monthlyExpenseCents;
  const monthlyTransferCents = monthlyTransactions
    .filter((transaction) => transaction.type === "transfer" || transaction.type === "credit_card_payment" || transaction.type === "loan_payment" || transaction.type === "deposit_transfer")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const transactionCategoryBreakdown = Object.entries(
    monthlyTransactions
      .filter((transaction) => transaction.type === "expense" || transaction.type === "credit_card_purchase")
      .reduce<Record<string, number>>((acc, transaction) => {
        acc[transaction.category] = (acc[transaction.category] ?? 0) + transaction.amountCents;
        return acc;
      }, {})
  )
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<ReceiptText size={18} />}
        label="收支紀錄"
        title="本月已記錄現金流"
        value={formatMoney(monthlyBalanceCents)}
        tone="sky"
        metrics={[
          { label: "本月收入", value: formatMoney(monthlyIncomeCents), accent: "border-emerald-300" },
          { label: "本月支出", value: formatMoney(monthlyExpenseCents), accent: "border-rose-300" },
          { label: "內部轉帳", value: formatMoney(monthlyTransferCents), accent: "border-sky-300" }
        ]}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DonutChart
            segments={transactionCategoryBreakdown.map((item, index) => ({ label: item.category, value: item.amountCents, color: getChartColor(index) }))}
            centerLabel="支出"
            centerValue={formatCompactMoney(monthlyExpenseCents)}
          />
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-300">本月交易數</span>
              <span className="font-semibold text-white">{monthlyTransactions.length} 筆</span>
            </div>
            <StackedDistribution data={transactionCategoryBreakdown} total={monthlyExpenseCents} />
            <CompactDistributionList data={transactionCategoryBreakdown} total={monthlyExpenseCents} inverse />
          </div>
        </div>
      </FeatureHero>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <section className="panel">
        <h2 className="text-lg font-semibold">新增交易</h2>
        <form className="mt-4 space-y-3" onSubmit={handleFormSubmit(onAdd)}>
          <Field label="日期"><input className="input" name="date" type="date" defaultValue={today} required /></Field>
          <Field label="類型">
            <select className="input" name="type" defaultValue="expense">
              {Object.entries(transactionTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="金額"><input className="input" name="amount" inputMode="decimal" placeholder="例如 1,200" required /></Field>
          <Field label="分類">
            <input className="input" name="category" list="remembered-categories" placeholder="餐飲、薪資、交通" required />
            <datalist id="remembered-categories">
              {rememberedCategories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>
          {rememberedCategories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {rememberedCategories.slice(0, 8).map((category) => (
                <span key={category} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  {category}
                </span>
              ))}
            </div>
          )}
          <Field label="子分類"><input className="input" name="subcategory" placeholder="可留空" /></Field>
          <Field label="支付帳戶">
            <select className="input" name="accountId">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
          </Field>
          <Field label="信用卡">
            <select className="input" name="creditCardId">
              <option value="">不適用</option>
              {creditCards.map((card) => <option key={card.id} value={card.id}>{card.name}（{card.last4}）</option>)}
            </select>
          </Field>
          <Field label="商家或對象"><input className="input" name="merchant" /></Field>
          <Field label="標籤"><input className="input" name="tags" placeholder="以逗號分隔" /></Field>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2"><input name="necessary" type="checkbox" /> 必要支出</label>
            <label className="flex items-center gap-2"><input name="recurring" type="checkbox" /> 固定支出</label>
          </div>
          <Field label="備註"><textarea className="input" name="note" rows={2} /></Field>
          <button className="btn-primary w-full" type="submit"><Plus size={16} />新增</button>
        </form>
      </section>

      <section className="space-y-4">
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">CSV 匯入預覽</h2>
            <label className="btn-secondary cursor-pointer">
              <Upload size={16} />
              選擇 CSV
              <input className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => onCsvUpload(event.target.files?.[0] ?? null)} />
            </label>
          </div>
          {csvPreview.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-slate-500"><th>列</th><th>狀態</th><th>分類</th><th>金額</th><th>錯誤</th></tr></thead>
                <tbody>
                  {csvPreview.slice(0, 8).map((row) => (
                    <tr key={row.rowNumber} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="py-2">{row.rowNumber}</td>
                      <td>{row.errors.length ? "需修正" : "可匯入"}</td>
                      <td>{row.transaction?.category ?? "-"}</td>
                      <td>{row.transaction ? formatMoney(row.transaction.amountCents) : "-"}</td>
                      <td className="text-red-600">{row.errors.join("、")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn-primary mt-3" onClick={onImportCsv} disabled={csvPreview.some((row) => row.errors.length > 0)}>匯入有效資料</button>
            </div>
          )}
        </div>

        <div className="panel">
          <h2 className="text-lg font-semibold">最近交易</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="hidden w-full min-w-[780px] text-sm md:table">
              <thead><tr className="text-left text-slate-500"><th>日期</th><th>類型</th><th>分類</th><th>商家</th><th>金額</th><th>來源</th><th></th></tr></thead>
              <tbody>
                {transactions.slice(0, 18).map((transaction) => (
                  <tr key={transaction.id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="py-3">{formatDate(transaction.date)}</td>
                    <td>{transactionTypeLabels[transaction.type]}</td>
                    <td>{transaction.category}</td>
                    <td>{transaction.merchant ?? "-"}</td>
                    <td className="font-semibold">{formatMoney(transaction.amountCents)}</td>
                    <td>{transaction.source}</td>
                    <td><button className="btn-danger px-2 py-1" onClick={() => onDelete(transaction.id)}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-3 md:hidden">
              {transactions.slice(0, 12).map((transaction) => (
                <div key={transaction.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{transaction.category}</p>
                      <p className="text-sm text-slate-500">{formatDate(transaction.date)} · {transactionTypeLabels[transaction.type]}</p>
                    </div>
                    <p className="font-bold">{formatMoney(transaction.amountCents)}</p>
                  </div>
                  <button className="btn-danger mt-3 px-2 py-1" onClick={() => onDelete(transaction.id)}><Trash2 size={14} />刪除</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}

function AccountsPage({ accounts, onAdd }: { accounts: FinancialAccount[]; onAdd: (formData: FormData) => void }) {
  const activeAccounts = accounts.filter((account) => account.isActive);
  const totalBalanceCents = activeAccounts.reduce((sum, account) => sum + account.balanceCents, 0);
  const availableCashCents = activeAccounts
    .filter((account) => account.includeInAvailableCash)
    .reduce((sum, account) => sum + account.balanceCents, 0);
  const emergencyFundCents = activeAccounts
    .filter((account) => account.includeInEmergencyFund)
    .reduce((sum, account) => sum + account.balanceCents, 0);
  const timeDepositBalanceCents = activeAccounts
    .filter((account) => account.type === "time_deposit")
    .reduce((sum, account) => sum + account.balanceCents, 0);
  const accountTypeBreakdown = Object.entries(
    activeAccounts.reduce<Record<string, number>>((acc, account) => {
      acc[accountTypeLabels[account.type]] = (acc[accountTypeLabels[account.type]] ?? 0) + account.balanceCents;
      return acc;
    }, {})
  )
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);
  const accountSegments = accountTypeBreakdown.map((item, index) => ({
    label: item.category,
    value: item.amountCents,
    color: getChartColor(index)
  }));

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-slate-950 via-emerald-950 to-sky-950 p-5 text-white shadow-card dark:border-emerald-900">
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <WalletCards size={18} />
              帳戶總覽
            </div>
            <p className="mt-3 text-sm text-slate-300">所有啟用帳戶目前餘額</p>
            <p className="mt-1 break-words text-4xl font-bold tracking-normal">{formatMoney(totalBalanceCents)}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <PulseMetric label="可動用現金" value={formatMoney(availableCashCents)} accent="border-emerald-300" />
              <PulseMetric label="緊急預備金" value={formatMoney(emergencyFundCents)} accent="border-sky-300" />
              <PulseMetric label="定存帳戶餘額" value={formatMoney(timeDepositBalanceCents)} accent="border-amber-300" />
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/10 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {accountSegments.length > 0 ? (
                <DonutChart segments={accountSegments} centerLabel="總資產" centerValue={formatCompactMoney(totalBalanceCents)} />
              ) : (
                <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm text-slate-300">尚無資料</div>
              )}
              <div className="flex-1 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">啟用帳戶</span>
                  <span className="font-semibold text-white">{activeAccounts.length} 個</span>
                </div>
                <StackedDistribution data={accountTypeBreakdown} total={totalBalanceCents} />
                <CompactDistributionList data={accountTypeBreakdown.slice(0, 4)} total={totalBalanceCents} inverse />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-4">
        <StatCard label="目前總資產" value={formatMoney(totalBalanceCents)} />
        <StatCard label="可動用現金" value={formatMoney(availableCashCents)} />
        <StatCard label="緊急預備金" value={formatMoney(emergencyFundCents)} />
        <StatCard label="帳戶數量" value={`${activeAccounts.length} 個`} />
      </div>

      <section className="panel">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} />
          <h2 className="text-lg font-semibold">帳戶餘額排行</h2>
        </div>
        <AccountBalanceChart accounts={activeAccounts} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <section className="panel">
          <h2 className="text-lg font-semibold">新增帳戶</h2>
          <form className="mt-4 space-y-3" onSubmit={handleFormSubmit(onAdd)}>
            <Field label="帳戶名稱"><input className="input" name="name" required /></Field>
            <Field label="帳戶類型">
              <select className="input" name="type">{Object.entries(accountTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </Field>
            <Field label="金融機構"><input className="input" name="institution" /></Field>
            <Field label="目前餘額"><input className="input" name="balance" inputMode="decimal" required /></Field>
            <label className="flex items-center gap-2 text-sm"><input name="available" type="checkbox" defaultChecked /> 列入可動用現金</label>
            <label className="flex items-center gap-2 text-sm"><input name="emergency" type="checkbox" defaultChecked /> 列入緊急預備金</label>
            <Field label="備註"><textarea className="input" name="note" rows={2} /></Field>
            <button className="btn-primary w-full" type="submit"><Plus size={16} />新增帳戶</button>
          </form>
        </section>
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <div key={account.id} className="panel">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{account.name}</p>
                <span className="text-xs text-slate-500">{account.isActive ? "啟用" : "停用"}</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{accountTypeLabels[account.type]} · {account.institution}</p>
              <p className="mt-4 text-2xl font-bold">{formatMoney(account.balanceCents)}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {account.includeInAvailableCash && <Badge>可動用</Badge>}
                {account.includeInEmergencyFund && <Badge>預備金</Badge>}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function CardsPage({
  cards,
  accounts,
  installments,
  setCards,
  setInstallments,
  notify
}: {
  cards: CreditCard[];
  accounts: FinancialAccount[];
  installments: CreditCardInstallment[];
  setCards: React.Dispatch<React.SetStateAction<CreditCard[]>>;
  setInstallments: React.Dispatch<React.SetStateAction<CreditCardInstallment[]>>;
  notify: (type: ToastType, message: string) => void;
}) {
  function addCard(formData: FormData) {
    const limit = parseMoneyToCents(String(formData.get("limit") ?? ""));
    const validation = validatePositiveAmount(limit, "信用額度");
    if (!validation.valid) return notify("error", validation.errors[0]);
    const now = new Date().toISOString();
    setCards((current) => [
      {
        id: crypto.randomUUID(),
        userId: localUserId,
        name: String(formData.get("name")),
        issuer: String(formData.get("issuer")),
        last4: String(formData.get("last4")).slice(-4),
        creditLimitCents: limit,
        statementDay: Number(formData.get("statementDay")),
        paymentDueDay: Number(formData.get("paymentDueDay")),
        unbilledAmountCents: 0,
        currentStatementAmountCents: 0,
        minimumPaymentCents: 0,
        installmentBalanceCents: 0,
        autoPayAccountId: String(formData.get("autoPayAccountId") ?? ""),
        annualFeeCents: parseMoneyToCents(String(formData.get("annualFee") ?? "0")),
        annualFeeWaiver: String(formData.get("waiver") ?? ""),
        note: "",
        isActive: true,
        recommendedUtilizationRate: 0.3,
        createdAt: now,
        updatedAt: now
      },
      ...current
    ]);
    notify("success", "信用卡已新增");
  }

  async function addInstallment(formData: FormData) {
    const totalAmountCents = parseMoneyToCents(String(formData.get("totalAmount") ?? ""));
    const paidAmountCents = parseMoneyToCents(String(formData.get("paidAmount") ?? "0"));
    const annualRate = Number(formData.get("annualRate")) / 100;
    const periods = Math.max(1, Number(formData.get("periods")));
    const paidPeriods = Math.min(periods, Math.max(0, Number(formData.get("paidPeriods"))));
    const monthlyPaymentInput = parseMoneyToCents(String(formData.get("monthlyPayment") ?? ""));
    const validation = combineValidations(validatePositiveAmount(totalAmountCents, "分期總額"), validateAnnualRate(annualRate));
    if (!validation.valid) return notify("error", validation.errors[0]);
    const now = new Date().toISOString();
    const remainingAmountCents = Math.max(0, totalAmountCents - paidAmountCents);
    const installment: CreditCardInstallment = {
      id: crypto.randomUUID(),
      userId: localUserId,
      creditCardId: String(formData.get("creditCardId")),
      merchant: String(formData.get("merchant") ?? ""),
      totalAmountCents,
      annualRate,
      periods,
      paidPeriods,
      monthlyPaymentCents: monthlyPaymentInput > 0 ? monthlyPaymentInput : Math.ceil(remainingAmountCents / Math.max(1, periods - paidPeriods)),
      paidAmountCents,
      remainingAmountCents,
      startedOn: String(formData.get("startedOn")),
      nextDueDate: String(formData.get("nextDueDate") || "") || undefined,
      status: remainingAmountCents === 0 ? "paid_off" : "active",
      note: String(formData.get("note") ?? ""),
      createdAt: now,
      updatedAt: now
    };
    try {
      const saved = await createCreditCardInstallment(installment);
      setInstallments((current) => [saved, ...current]);
      notify("success", "信用卡分期已加入負債整理");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "信用卡分期儲存失敗");
    }
  }

  const installmentDebt = getInstallmentDebtCents(cards, installments);
  const installmentMonthlyDue = getInstallmentMonthlyDueCents(installments);
  const totalCardStatementDebt = cards.reduce((sum, card) => sum + card.currentStatementAmountCents + card.unbilledAmountCents, 0);
  const totalCreditLimitCents = cards.reduce((sum, card) => sum + card.creditLimitCents, 0);
  const currentStatementCents = cards.reduce((sum, card) => sum + card.currentStatementAmountCents, 0);
  const unbilledCents = cards.reduce((sum, card) => sum + card.unbilledAmountCents, 0);
  const cardUtilization = (totalCardStatementDebt + installmentDebt) / Math.max(totalCreditLimitCents, 1);

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<CreditCardIcon size={18} />}
        label="信用卡總覽"
        title="卡費、未出帳與分期負債"
        value={formatMoney(totalCardStatementDebt + installmentDebt)}
        tone="violet"
        metrics={[
          { label: "本期帳單", value: formatMoney(currentStatementCents), accent: "border-rose-300" },
          { label: "下期未出帳", value: formatMoney(unbilledCents), accent: "border-amber-300" },
          { label: "額度使用率", value: formatPercent(cardUtilization), accent: "border-violet-300" }
        ]}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DonutChart
            segments={[
              { label: "本期帳單", value: currentStatementCents, color: "#7c3aed" },
              { label: "未出帳", value: unbilledCents, color: "#f59e0b" },
              { label: "分期負債", value: installmentDebt, color: "#dc2626" }
            ]}
            centerLabel="待整理"
            centerValue={formatCompactMoney(totalCardStatementDebt + installmentDebt)}
          />
          <div className="flex-1 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-300">信用額度</span>
              <span className="font-semibold text-white">{formatMoney(totalCreditLimitCents)}</span>
            </div>
            <Progress label="總額度使用率" value={cardUtilization} colorClass={cardUtilization >= 0.3 ? "bg-amber-500" : "bg-emerald-500"} />
            <CompactDistributionList data={[
              { category: "本期帳單", amountCents: currentStatementCents },
              { category: "下期未出帳", amountCents: unbilledCents },
              { category: "分期負債", amountCents: installmentDebt }
            ]} total={Math.max(totalCardStatementDebt + installmentDebt, 1)} inverse />
          </div>
        </div>
      </FeatureHero>
      <section className="grid gap-3 md:grid-cols-3">
        <StatCard label="信用卡帳款" value={formatMoney(totalCardStatementDebt)} />
        <StatCard label="分期剩餘負債" value={formatMoney(installmentDebt)} />
        <StatCard label="分期每月應繳" value={formatMoney(installmentMonthlyDue)} />
      </section>
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <section className="panel">
        <h2 className="text-lg font-semibold">新增信用卡</h2>
        <form className="mt-4 space-y-3" onSubmit={handleFormSubmit(addCard)}>
          <Field label="信用卡名稱"><input className="input" name="name" required /></Field>
          <Field label="發卡銀行"><input className="input" name="issuer" required /></Field>
          <Field label="末四碼"><input className="input" name="last4" inputMode="numeric" maxLength={4} required /></Field>
          <Field label="信用額度"><input className="input" name="limit" inputMode="decimal" required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="結帳日"><input className="input" name="statementDay" type="number" min={1} max={31} defaultValue={20} /></Field>
            <Field label="繳款截止日"><input className="input" name="paymentDueDay" type="number" min={1} max={31} defaultValue={5} /></Field>
          </div>
          <Field label="自動扣款帳戶"><select className="input" name="autoPayAccountId">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
          <Field label="年費"><input className="input" name="annualFee" inputMode="decimal" defaultValue="0" /></Field>
          <Field label="年費減免條件"><input className="input" name="waiver" /></Field>
          <button className="btn-primary w-full" type="submit"><Plus size={16} />新增信用卡</button>
        </form>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => {
          const cardInstallmentDebt = getCardInstallmentDebt(card.id, installments, card.installmentBalanceCents);
          const used = card.unbilledAmountCents + card.currentStatementAmountCents + cardInstallmentDebt;
          const utilization = used / Math.max(card.creditLimitCents, 1);
          return (
            <div key={card.id} className="panel">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-semibold">{card.name}</p><p className="text-sm text-slate-500">{card.issuer} · **** {card.last4}</p></div>
                <Badge>{card.isActive ? "啟用" : "停用"}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info label="本期帳單" value={formatMoney(card.currentStatementAmountCents)} />
                <Info label="下期未出帳" value={formatMoney(card.unbilledAmountCents)} />
                <Info label="分期剩餘" value={formatMoney(cardInstallmentDebt)} />
                <Info label="剩餘額度" value={formatMoney(Math.max(0, card.creditLimitCents - used))} />
                <Info label="最低應繳" value={formatMoney(card.minimumPaymentCents)} />
              </div>
              <div className="mt-4"><Progress label="額度使用率" value={utilization} /></div>
              {utilization > card.recommendedUtilizationRate && (
                <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-100">已超過建議額度使用率 {formatPercent(card.recommendedUtilizationRate)}。</p>
              )}
            </div>
          );
        })}
      </section>
      </div>
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <section className="panel">
          <h2 className="text-lg font-semibold">新增分期款項</h2>
          <form className="mt-4 space-y-3" onSubmit={handleFormSubmit(addInstallment)}>
            <Field label="信用卡">
              <select className="input" name="creditCardId" required>
                {cards.map((card) => <option key={card.id} value={card.id}>{card.name}（{card.last4}）</option>)}
              </select>
            </Field>
            <Field label="商家或項目"><input className="input" name="merchant" placeholder="例如 手機、家電、旅遊" /></Field>
            <Field label="分期總額"><input className="input" name="totalAmount" inputMode="decimal" required /></Field>
            <Field label="年利率 %"><input className="input" name="annualRate" inputMode="decimal" defaultValue="0" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="總期數"><input className="input" name="periods" type="number" min={1} defaultValue={12} /></Field>
              <Field label="已還期數"><input className="input" name="paidPeriods" type="number" min={0} defaultValue={0} /></Field>
            </div>
            <Field label="已還款金額"><input className="input" name="paidAmount" inputMode="decimal" defaultValue="0" /></Field>
            <Field label="每月應繳"><input className="input" name="monthlyPayment" inputMode="decimal" placeholder="可留空自動估算" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="開始日"><input className="input" name="startedOn" type="date" defaultValue={today} /></Field>
              <Field label="下次應繳日"><input className="input" name="nextDueDate" type="date" /></Field>
            </div>
            <Field label="備註"><textarea className="input" name="note" rows={2} /></Field>
            <button className="btn-primary w-full" type="submit"><Plus size={16} />新增分期</button>
          </form>
        </section>
        <section className="panel">
          <h2 className="text-lg font-semibold">分期負債整理</h2>
          <InstallmentDebtTable cards={cards} installments={installments} />
        </section>
      </div>
    </div>
  );
}

function LoansPage({
  loans,
  setLoans,
  notify
}: {
  loans: Loan[];
  setLoans: React.Dispatch<React.SetStateAction<Loan[]>>;
  notify: (type: ToastType, message: string) => void;
}) {
  const [calcInput, setCalcInput] = useState<LoanCalculationInput>({
    principalCents: 600_000_00,
    annualRate: 0.0275,
    termMonths: 60,
    method: "equal_payment",
    extraMonthlyPaymentCents: 0,
    oneTimePrepaymentCents: 0,
    oneTimePrepaymentMonth: 1
  });
  const result = calculateLoan(calcInput);
  const activeLoans = loans.filter((loan) => loan.status === "active");
  const loanPrincipalCents = activeLoans.reduce((sum, loan) => sum + loan.remainingPrincipalCents, 0);
  const loanOriginalPrincipalCents = activeLoans.reduce((sum, loan) => sum + loan.originalPrincipalCents, 0);
  const loanMonthlyDueCents = activeLoans.reduce((sum, loan) => sum + loan.paymentPerPeriodCents, 0);
  const weightedLoanRate = loanPrincipalCents > 0
    ? activeLoans.reduce((sum, loan) => sum + loan.remainingPrincipalCents * loan.annualRate, 0) / loanPrincipalCents
    : 0;
  const paidDownRatio = loanOriginalPrincipalCents > 0 ? 1 - loanPrincipalCents / loanOriginalPrincipalCents : 0;
  const loanBreakdown = activeLoans
    .map((loan) => ({ category: loan.name, amountCents: loan.remainingPrincipalCents }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 6);

  function addLoan(formData: FormData) {
    const principal = parseMoneyToCents(String(formData.get("principal") ?? ""));
    const annualRate = Number(formData.get("annualRate")) / 100;
    const validation = combineValidations(validatePositiveAmount(principal, "貸款本金"), validateAnnualRate(annualRate));
    if (!validation.valid) return notify("error", validation.errors[0]);
    const termMonths = Number(formData.get("termMonths"));
    const payment = calculateLoan({ principalCents: principal, annualRate, termMonths, method: "equal_payment" }).monthlyPaymentCents;
    const now = new Date().toISOString();
    setLoans((current) => [
      {
        id: crypto.randomUUID(),
        userId: localUserId,
        name: String(formData.get("name")),
        type: "personal",
        institution: String(formData.get("institution") ?? ""),
        originalPrincipalCents: principal,
        remainingPrincipalCents: principal,
        annualRate,
        termMonths,
        paidPeriods: 0,
        monthlyPaymentDay: Number(formData.get("paymentDay")),
        startDate: String(formData.get("startDate")),
        repaymentMethod: "equal_payment",
        paymentPerPeriodCents: payment,
        status: "active",
        createdAt: now,
        updatedAt: now
      },
      ...current
    ]);
    notify("success", "貸款已新增");
  }

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<Landmark size={18} />}
        label="貸款負債"
        title="剩餘本金與每月現金流壓力"
        value={formatMoney(loanPrincipalCents)}
        tone="amber"
        metrics={[
          { label: "每月應繳", value: formatMoney(loanMonthlyDueCents), accent: "border-rose-300" },
          { label: "平均利率", value: formatPercent(weightedLoanRate), accent: "border-amber-300" },
          { label: "已清償比例", value: formatPercent(Math.max(0, paidDownRatio)), accent: "border-emerald-300" }
        ]}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DonutChart
            segments={[
              { label: "剩餘本金", value: loanPrincipalCents, color: "#d97706" },
              { label: "已還本金", value: Math.max(0, loanOriginalPrincipalCents - loanPrincipalCents), color: "#059669" }
            ]}
            centerLabel="清償"
            centerValue={formatPercent(Math.max(0, paidDownRatio))}
          />
          <div className="flex-1 space-y-3">
            <Progress label="清償進度" value={Math.max(0, paidDownRatio)} colorClass="bg-emerald-500" />
            <StackedDistribution data={loanBreakdown} total={loanPrincipalCents} />
            <CompactDistributionList data={loanBreakdown} total={loanPrincipalCents} inverse />
          </div>
        </div>
      </FeatureHero>
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <section className="panel">
          <h2 className="text-lg font-semibold">新增貸款</h2>
          <form className="mt-4 space-y-3" onSubmit={handleFormSubmit(addLoan)}>
            <Field label="貸款名稱"><input className="input" name="name" required /></Field>
            <Field label="金融機構"><input className="input" name="institution" /></Field>
            <Field label="原始本金"><input className="input" name="principal" inputMode="decimal" required /></Field>
            <Field label="年利率 %"><input className="input" name="annualRate" inputMode="decimal" defaultValue="2.75" required /></Field>
            <Field label="貸款期數（月）"><input className="input" name="termMonths" type="number" min={1} defaultValue={60} /></Field>
            <Field label="每月還款日"><input className="input" name="paymentDay" type="number" min={1} max={31} defaultValue={12} /></Field>
            <Field label="起始日期"><input className="input" name="startDate" type="date" defaultValue={today} /></Field>
            <button className="btn-primary w-full" type="submit"><Plus size={16} />新增貸款</button>
          </form>
        </section>
        <section className="grid gap-3 md:grid-cols-2">
          {loans.map((loan) => (
            <div key={loan.id} className="panel">
              <p className="font-semibold">{loan.name}</p>
              <p className="text-sm text-slate-500">{loan.institution} · 年利率 {formatPercent(loan.annualRate)}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info label="剩餘本金" value={formatMoney(loan.remainingPrincipalCents)} />
                <Info label="每期應繳" value={formatMoney(loan.paymentPerPeriodCents)} />
                <Info label="已繳期數" value={`${loan.paidPeriods}/${loan.termMonths}`} />
                <Info label="還款日" value={`每月 ${loan.monthlyPaymentDay} 日`} />
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <div className="flex items-center gap-2"><Calculator size={18} /><h2 className="text-lg font-semibold">貸款試算器</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <CalcInput label="本金" value={calcInput.principalCents / 100} onChange={(value) => setCalcInput((current) => ({ ...current, principalCents: Math.round(value * 100) }))} />
          <CalcInput label="年利率 %" value={calcInput.annualRate * 100} onChange={(value) => setCalcInput((current) => ({ ...current, annualRate: value / 100 }))} />
          <CalcInput label="期數" value={calcInput.termMonths} onChange={(value) => setCalcInput((current) => ({ ...current, termMonths: Math.max(1, Math.round(value)) }))} />
          <CalcInput label="每月加還" value={(calcInput.extraMonthlyPaymentCents ?? 0) / 100} onChange={(value) => setCalcInput((current) => ({ ...current, extraMonthlyPaymentCents: Math.round(value * 100) }))} />
          <CalcInput label="一次提前還款" value={(calcInput.oneTimePrepaymentCents ?? 0) / 100} onChange={(value) => setCalcInput((current) => ({ ...current, oneTimePrepaymentCents: Math.round(value * 100) }))} />
          <Field label="方式">
            <select className="input" value={calcInput.method} onChange={(event) => setCalcInput((current) => ({ ...current, method: event.target.value as LoanCalculationInput["method"] }))}>
              <option value="equal_payment">本息平均攤還</option>
              <option value="equal_principal">本金平均攤還</option>
              <option value="fixed_payment">固定金額還款</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="每月應繳" value={formatMoney(result.monthlyPaymentCents)} />
          <StatCard label="總利息" value={formatMoney(result.totalInterestCents)} />
          <StatCard label="總還款" value={formatMoney(result.totalPaymentCents)} />
          <StatCard label="節省利息" value={formatMoney(result.interestSavedCents)} />
          <StatCard label="縮短期數" value={`${result.monthsShortened} 期`} />
        </div>
      </section>
    </div>
  );
}

function DepositsPage({
  deposits,
  setDeposits,
  notify
}: {
  deposits: Deposit[];
  setDeposits: React.Dispatch<React.SetStateAction<Deposit[]>>;
  notify: (type: ToastType, message: string) => void;
}) {
  const [calcInput, setCalcInput] = useState<DepositCalculationInput>({
    principalCents: 100_000_00,
    annualRate: 0.016,
    months: 12,
    interestType: "simple",
    monthlyContributionCents: 0,
    taxRate: 0
  });
  const result = calculateDeposit(calcInput);
  const activeDeposits = deposits.filter((deposit) => deposit.isActive);
  const depositPrincipalCents = activeDeposits.reduce((sum, deposit) => sum + deposit.principalCents, 0);
  const depositInterestCents = activeDeposits.reduce((sum, deposit) => sum + deposit.estimatedInterestCents, 0);
  const depositMaturityAmountCents = activeDeposits.reduce((sum, deposit) => sum + deposit.estimatedMaturityAmountCents, 0);
  const availableDepositCents = activeDeposits
    .filter((deposit) => deposit.includeInAvailableCash)
    .reduce((sum, deposit) => sum + deposit.estimatedMaturityAmountCents, 0);
  const weightedAnnualRate = depositPrincipalCents > 0
    ? activeDeposits.reduce((sum, deposit) => sum + deposit.principalCents * deposit.annualRate, 0) / depositPrincipalCents
    : 0;
  const upcomingDeposit = [...activeDeposits].sort((a, b) => a.maturityDate.localeCompare(b.maturityDate))[0];
  const depositSegments = [
    { label: "本金", value: depositPrincipalCents, color: "#059669" },
    { label: "預估利息", value: depositInterestCents, color: "#f59e0b" }
  ];
  const maturityBuckets = Object.entries(
    activeDeposits.reduce<Record<string, number>>((acc, deposit) => {
      const label = deposit.maturityDate.slice(0, 7).replace("-", "/");
      acc[label] = (acc[label] ?? 0) + deposit.estimatedMaturityAmountCents;
      return acc;
    }, {})
  )
    .map(([month, amountCents]) => ({ month, amountCents }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(0, 8);

  function addDeposit(formData: FormData) {
    const principal = parseMoneyToCents(String(formData.get("principal") ?? ""));
    const annualRate = Number(formData.get("annualRate")) / 100;
    const startDate = String(formData.get("startDate"));
    const maturityDate = String(formData.get("maturityDate"));
    const validation = combineValidations(validatePositiveAmount(principal, "本金"), validateAnnualRate(annualRate), validateDateRange(startDate, maturityDate));
    if (!validation.valid) return notify("error", validation.errors[0]);
    const termMonths = Number(formData.get("termMonths"));
    const estimate = calculateDeposit({ principalCents: principal, annualRate, months: termMonths, interestType: "simple" });
    const now = new Date().toISOString();
    setDeposits((current) => [
      {
        id: crypto.randomUUID(),
        userId: localUserId,
        name: String(formData.get("name")),
        institution: String(formData.get("institution") ?? ""),
        principalCents: principal,
        annualRate,
        startDate,
        maturityDate,
        termMonths,
        interestType: "simple",
        interestPayout: "maturity",
        autoRenew: formData.get("autoRenew") === "on",
        maturityInstruction: "transfer_out",
        estimatedInterestCents: estimate.totalInterestCents,
        estimatedMaturityAmountCents: estimate.maturityAmountCents,
        includeInAvailableCash: formData.get("available") === "on",
        isActive: true,
        createdAt: now,
        updatedAt: now
      },
      ...current
    ]);
    notify("success", "存款已新增");
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-sky-200 bg-gradient-to-br from-slate-950 via-sky-950 to-emerald-950 p-5 text-white shadow-card dark:border-sky-900">
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-200">
              <PiggyBank size={18} />
              存款總覽
            </div>
            <p className="mt-3 text-sm text-slate-300">定存與儲蓄型存款預估到期總額</p>
            <p className="mt-1 break-words text-4xl font-bold tracking-normal">{formatMoney(depositMaturityAmountCents)}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <PulseMetric label="存款本金" value={formatMoney(depositPrincipalCents)} accent="border-emerald-300" />
              <PulseMetric label="預估利息" value={formatMoney(depositInterestCents)} accent="border-amber-300" />
              <PulseMetric label="平均年利率" value={formatPercent(weightedAnnualRate)} accent="border-sky-300" />
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/10 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {depositMaturityAmountCents > 0 ? (
                <DonutChart segments={depositSegments} centerLabel="到期" centerValue={formatCompactMoney(depositMaturityAmountCents)} />
              ) : (
                <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm text-slate-300">尚無資料</div>
              )}
              <div className="flex-1 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">最近到期</span>
                  <span className="font-semibold text-white">{upcomingDeposit ? formatDate(upcomingDeposit.maturityDate) : "尚無資料"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">列入可動用</span>
                  <span className="font-semibold text-white">{formatMoney(availableDepositCents)}</span>
                </div>
                <StackedDistribution data={[
                  { category: "本金", amountCents: depositPrincipalCents },
                  { category: "預估利息", amountCents: depositInterestCents }
                ]} total={depositMaturityAmountCents} />
                <CompactDistributionList data={[
                  { category: "本金", amountCents: depositPrincipalCents },
                  { category: "預估利息", amountCents: depositInterestCents }
                ]} total={depositMaturityAmountCents} inverse />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-4">
        <StatCard label="定期存款總額" value={formatMoney(depositPrincipalCents)} />
        <StatCard label="預估總利息" value={formatMoney(depositInterestCents)} />
        <StatCard label="預估到期金額" value={formatMoney(depositMaturityAmountCents)} />
        <StatCard label="存款筆數" value={`${activeDeposits.length} 筆`} />
      </div>

      <section className="panel">
        <div className="flex items-center gap-2">
          <CalendarClock size={18} />
          <h2 className="text-lg font-semibold">到期月份分布</h2>
        </div>
        <DepositMaturityBars data={maturityBuckets} total={depositMaturityAmountCents} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <section className="panel">
          <h2 className="text-lg font-semibold">新增定期存款</h2>
          <form className="mt-4 space-y-3" onSubmit={handleFormSubmit(addDeposit)}>
            <Field label="存款名稱"><input className="input" name="name" required /></Field>
            <Field label="金融機構"><input className="input" name="institution" /></Field>
            <Field label="本金"><input className="input" name="principal" inputMode="decimal" required /></Field>
            <Field label="年利率 %"><input className="input" name="annualRate" inputMode="decimal" defaultValue="1.6" /></Field>
            <Field label="期間（月）"><input className="input" name="termMonths" type="number" min={1} defaultValue={12} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="起存日"><input className="input" name="startDate" type="date" defaultValue={today} /></Field><Field label="到期日"><input className="input" name="maturityDate" type="date" defaultValue="2027-07-13" /></Field></div>
            <label className="flex items-center gap-2 text-sm"><input name="available" type="checkbox" /> 列入可動用資金</label>
            <label className="flex items-center gap-2 text-sm"><input name="autoRenew" type="checkbox" /> 自動續存</label>
            <button className="btn-primary w-full" type="submit"><Plus size={16} />新增存款</button>
          </form>
        </section>
        <section className="grid gap-3 md:grid-cols-2">
          {deposits.map((deposit) => (
            <div key={deposit.id} className="panel">
              <p className="font-semibold">{deposit.name}</p>
              <p className="text-sm text-slate-500">{deposit.institution} · {deposit.termMonths} 個月 · {formatPercent(deposit.annualRate)}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info label="本金" value={formatMoney(deposit.principalCents)} />
                <Info label="預估利息" value={formatMoney(deposit.estimatedInterestCents)} />
                <Info label="到期金額" value={formatMoney(deposit.estimatedMaturityAmountCents)} />
                <Info label="到期日" value={formatDate(deposit.maturityDate)} />
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <div className="flex items-center gap-2"><Calculator size={18} /><h2 className="text-lg font-semibold">存款試算器</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <CalcInput label="本金" value={calcInput.principalCents / 100} onChange={(value) => setCalcInput((current) => ({ ...current, principalCents: Math.round(value * 100) }))} />
          <CalcInput label="年利率 %" value={calcInput.annualRate * 100} onChange={(value) => setCalcInput((current) => ({ ...current, annualRate: value / 100 }))} />
          <CalcInput label="期間（月）" value={calcInput.months} onChange={(value) => setCalcInput((current) => ({ ...current, months: Math.max(1, Math.round(value)) }))} />
          <CalcInput label="每月追加" value={(calcInput.monthlyContributionCents ?? 0) / 100} onChange={(value) => setCalcInput((current) => ({ ...current, monthlyContributionCents: Math.round(value * 100) }))} />
          <CalcInput label="扣除率 %" value={(calcInput.taxRate ?? 0) * 100} onChange={(value) => setCalcInput((current) => ({ ...current, taxRate: value / 100 }))} />
          <Field label="方式"><select className="input" value={calcInput.interestType} onChange={(event) => setCalcInput((current) => ({ ...current, interestType: event.target.value as Deposit["interestType"] }))}><option value="simple">單利</option><option value="compound">複利</option></select></Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="預估總利息" value={formatMoney(result.totalInterestCents)} />
          <StatCard label="到期金額" value={formatMoney(result.maturityAmountCents)} />
          <StatCard label="實際年化報酬率" value={formatPercent(result.annualizedReturn)} />
        </div>
      </section>
    </div>
  );
}

function InvestmentsPage({ notify }: { notify: (type: ToastType, message: string) => void }) {
  const [categories, setCategories] = useState<InvestmentCategory[]>([]);

  const totalAllocation = categories.reduce((sum, category) => sum + category.targetAllocation, 0);
  const highRiskAllocation = categories
    .filter((category) => category.risk === "high")
    .reduce((sum, category) => sum + category.targetAllocation, 0);
  const fundAllocation = categories
    .filter((category) => category.kind === "mutual_fund" || category.kind === "bond_fund" || category.kind === "money_market")
    .reduce((sum, category) => sum + category.targetAllocation, 0);
  const investmentRiskRows = Object.entries(
    categories.reduce<Record<string, number>>((acc, category) => {
      acc[investmentRiskLabels[category.risk]] = (acc[investmentRiskLabels[category.risk]] ?? 0) + category.targetAllocation;
      return acc;
    }, {})
  ).map(([category, amountCents]) => ({ category, amountCents }));

  function addCategory(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const targetAllocation = Number(formData.get("targetAllocation"));
    if (!name) return notify("error", "請輸入分類名稱");
    if (!Number.isFinite(targetAllocation) || targetAllocation < 0 || targetAllocation > 100) {
      return notify("error", "目標配置需介於 0% 到 100%");
    }
    setCategories((current) => [
      {
        id: crypto.randomUUID(),
        name,
        kind: String(formData.get("kind")) as InvestmentCategory["kind"],
        market: String(formData.get("market")) as InvestmentCategory["market"],
        targetAllocation,
        risk: String(formData.get("risk")) as InvestmentCategory["risk"],
        note: String(formData.get("note") ?? "")
      },
      ...current
    ]);
    notify("success", "投資分類已新增");
  }

  function deleteCategory(id: string) {
    if (!window.confirm("確定刪除此投資分類？")) return;
    setCategories((current) => current.filter((category) => category.id !== id));
    notify("success", "投資分類已刪除");
  }

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<TrendingUp size={18} />}
        label="投資分類"
        title="股票與基金目標配置"
        value={`${totalAllocation.toFixed(0)}%`}
        tone="sky"
        metrics={[
          { label: "基金類配置", value: `${fundAllocation.toFixed(0)}%`, accent: "border-emerald-300" },
          { label: "高風險配置", value: `${highRiskAllocation.toFixed(0)}%`, accent: "border-rose-300" },
          { label: "分類數", value: `${categories.length} 類`, accent: "border-sky-300" }
        ]}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DonutChart
            segments={investmentRiskRows.map((row, index) => ({ label: row.category, value: row.amountCents, color: getChartColor(index) }))}
            centerLabel="配置"
            centerValue={`${totalAllocation.toFixed(0)}%`}
          />
          <div className="flex-1 space-y-3">
            <Progress label="目標配置合計" value={totalAllocation / 100} colorClass={totalAllocation > 100 ? "bg-rose-500" : "bg-emerald-500"} />
            <CompactDistributionList data={investmentRiskRows} total={Math.max(totalAllocation, 1)} inverse />
          </div>
        </div>
      </FeatureHero>
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard label="分類數" value={`${categories.length} 類`} />
        <StatCard label="目標配置合計" value={`${totalAllocation.toFixed(0)}%`} />
        <StatCard label="高風險配置" value={`${highRiskAllocation.toFixed(0)}%`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <section className="panel">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} />
            <h2 className="text-lg font-semibold">新增投資分類</h2>
          </div>
          <form className="mt-4 space-y-3" onSubmit={handleFormSubmit(addCategory)}>
            <Field label="分類名稱"><input className="input" name="name" placeholder="例如：台股高股息 ETF" required /></Field>
            <Field label="投資類型">
              <select className="input" name="kind" defaultValue="etf">
                {Object.entries(investmentKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="市場">
              <select className="input" name="market" defaultValue="TW">
                {Object.entries(investmentMarketLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="目標配置 %"><input className="input" name="targetAllocation" type="number" min={0} max={100} defaultValue={10} required /></Field>
            <Field label="風險等級">
              <select className="input" name="risk" defaultValue="medium">
                {Object.entries(investmentRiskLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="備註"><input className="input" name="note" placeholder="配置目的、觀察重點" /></Field>
            <button className="btn-primary w-full" type="submit"><Plus size={16} />新增分類</button>
          </form>
        </section>

        <section className="panel">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">股票基金分類</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">目前基金類配置 {fundAllocation.toFixed(0)}%，高風險配置 {highRiskAllocation.toFixed(0)}%。</p>
            </div>
            <Badge>{totalAllocation > 100 ? "配置超過 100%" : "配置可用"}</Badge>
          </div>
          {categories.length === 0 ? (
            <EmptyState label="尚未建立股票或基金分類" />
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {categories.map((category) => (
                <div key={category.id} className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-subtle dark:border-slate-800 dark:bg-slate-950/70">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{category.name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {investmentKindLabels[category.kind]} · {investmentMarketLabels[category.market]} · {investmentRiskLabels[category.risk]}
                      </p>
                    </div>
                    <button className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950" onClick={() => deleteCategory(category.id)} aria-label="刪除投資分類">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mt-4">
                    <Progress label="目標配置" value={category.targetAllocation / 100} helper={`${category.targetAllocation.toFixed(0)}%`} colorClass={category.risk === "high" ? "bg-rose-500" : category.risk === "low" ? "bg-emerald-500" : "bg-sky-500"} />
                  </div>
                  {category.note && <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">{category.note}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CalculatorsPage() {
  const [loanInput, setLoanInput] = useState<LoanCalculationInput>({
    principalCents: 800_000_00,
    annualRate: 0.0288,
    termMonths: 84,
    method: "equal_payment",
    extraMonthlyPaymentCents: 0,
    oneTimePrepaymentCents: 0,
    oneTimePrepaymentMonth: 1
  });
  const [depositInput, setDepositInput] = useState<DepositCalculationInput>({
    principalCents: 200_000_00,
    annualRate: 0.018,
    months: 24,
    interestType: "compound",
    monthlyContributionCents: 5_000_00,
    taxRate: 0
  });
  const [totalAssetsCents, setTotalAssetsCents] = useState(1_200_000_00);
  const [totalLiabilitiesCents, setTotalLiabilitiesCents] = useState(360_000_00);
  const [availableCashCents, setAvailableCashCents] = useState(180_000_00);
  const [necessaryExpenseCents, setNecessaryExpenseCents] = useState(45_000_00);
  const [investmentPrincipalCents, setInvestmentPrincipalCents] = useState(100_000_00);
  const [monthlyInvestmentCents, setMonthlyInvestmentCents] = useState(8_000_00);
  const [investmentAnnualRate, setInvestmentAnnualRate] = useState(0.05);
  const [investmentYears, setInvestmentYears] = useState(10);

  const loanResult = calculateLoan(loanInput);
  const depositResult = calculateDeposit(depositInput);
  const netWorthCents = totalAssetsCents - totalLiabilitiesCents;
  const debtRatio = totalAssetsCents > 0 ? totalLiabilitiesCents / totalAssetsCents : 0;
  const emergencyMonths = necessaryExpenseCents > 0 ? availableCashCents / necessaryExpenseCents : 0;
  const investmentFutureValueCents = calculateInvestmentFutureValueCents({
    principalCents: investmentPrincipalCents,
    monthlyContributionCents: monthlyInvestmentCents,
    annualRate: investmentAnnualRate,
    years: investmentYears
  });
  const investmentContributionCents = investmentPrincipalCents + monthlyInvestmentCents * investmentYears * 12;

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<Calculator size={18} />}
        label="財務計算機"
        title="常用試算結果摘要"
        value={formatMoney(netWorthCents)}
        tone="slate"
        metrics={[
          { label: "貸款月付", value: formatMoney(loanResult.monthlyPaymentCents), accent: "border-rose-300" },
          { label: "存款到期", value: formatMoney(depositResult.maturityAmountCents), accent: "border-emerald-300" },
          { label: "投資期末", value: formatMoney(investmentFutureValueCents), accent: "border-sky-300" }
        ]}
      >
        <div className="space-y-4">
          <Progress label="負債比" value={debtRatio} colorClass={debtRatio > 0.5 ? "bg-rose-500" : "bg-emerald-500"} />
          <Progress label="預備金月數" value={Math.min(emergencyMonths / 6, 1)} helper={`${emergencyMonths.toFixed(1)} / 6 個月`} colorClass="bg-sky-500" />
          <CompactDistributionList data={[
            { category: "總資產", amountCents: totalAssetsCents },
            { category: "總負債", amountCents: totalLiabilitiesCents }
          ]} total={Math.max(totalAssetsCents + totalLiabilitiesCents, 1)} inverse />
        </div>
      </FeatureHero>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel">
        <div className="flex items-center gap-2"><Calculator size={18} /><h2 className="text-lg font-semibold">貸款試算</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <CalcInput label="貸款本金" value={loanInput.principalCents / 100} onChange={(value) => setLoanInput((current) => ({ ...current, principalCents: Math.round(value * 100) }))} />
          <CalcInput label="年利率 %" value={loanInput.annualRate * 100} onChange={(value) => setLoanInput((current) => ({ ...current, annualRate: value / 100 }))} />
          <CalcInput label="期數（月）" value={loanInput.termMonths} onChange={(value) => setLoanInput((current) => ({ ...current, termMonths: Math.max(1, Math.round(value)) }))} />
          <CalcInput label="每月加還" value={(loanInput.extraMonthlyPaymentCents ?? 0) / 100} onChange={(value) => setLoanInput((current) => ({ ...current, extraMonthlyPaymentCents: Math.round(value * 100) }))} />
          <CalcInput label="一次提前還款" value={(loanInput.oneTimePrepaymentCents ?? 0) / 100} onChange={(value) => setLoanInput((current) => ({ ...current, oneTimePrepaymentCents: Math.round(value * 100) }))} />
          <Field label="還款方式">
            <select className="input" value={loanInput.method} onChange={(event) => setLoanInput((current) => ({ ...current, method: event.target.value as LoanCalculationInput["method"] }))}>
              <option value="equal_payment">本息平均攤還</option>
              <option value="equal_principal">本金平均攤還</option>
              <option value="fixed_payment">固定金額還款</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Info label="每月應繳" value={formatMoney(loanResult.monthlyPaymentCents)} />
          <Info label="總利息" value={formatMoney(loanResult.totalInterestCents)} />
          <Info label="節省利息" value={formatMoney(loanResult.interestSavedCents)} />
        </div>
      </section>

      <section className="panel">
        <div className="flex items-center gap-2"><PiggyBank size={18} /><h2 className="text-lg font-semibold">存款試算</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <CalcInput label="本金" value={depositInput.principalCents / 100} onChange={(value) => setDepositInput((current) => ({ ...current, principalCents: Math.round(value * 100) }))} />
          <CalcInput label="年利率 %" value={depositInput.annualRate * 100} onChange={(value) => setDepositInput((current) => ({ ...current, annualRate: value / 100 }))} />
          <CalcInput label="期間（月）" value={depositInput.months} onChange={(value) => setDepositInput((current) => ({ ...current, months: Math.max(1, Math.round(value)) }))} />
          <CalcInput label="每月追加" value={(depositInput.monthlyContributionCents ?? 0) / 100} onChange={(value) => setDepositInput((current) => ({ ...current, monthlyContributionCents: Math.round(value * 100) }))} />
          <CalcInput label="扣除率 %" value={(depositInput.taxRate ?? 0) * 100} onChange={(value) => setDepositInput((current) => ({ ...current, taxRate: value / 100 }))} />
          <Field label="計息方式">
            <select className="input" value={depositInput.interestType} onChange={(event) => setDepositInput((current) => ({ ...current, interestType: event.target.value as Deposit["interestType"] }))}>
              <option value="simple">單利</option>
              <option value="compound">複利</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Info label="預估總利息" value={formatMoney(depositResult.totalInterestCents)} />
          <Info label="到期金額" value={formatMoney(depositResult.maturityAmountCents)} />
          <Info label="年化報酬率" value={formatPercent(depositResult.annualizedReturn)} />
        </div>
      </section>

      <section className="panel">
        <div className="flex items-center gap-2"><WalletCards size={18} /><h2 className="text-lg font-semibold">資產負債與預備金</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <CalcInput label="總資產" value={totalAssetsCents / 100} onChange={(value) => setTotalAssetsCents(Math.round(value * 100))} />
          <CalcInput label="總負債" value={totalLiabilitiesCents / 100} onChange={(value) => setTotalLiabilitiesCents(Math.round(value * 100))} />
          <CalcInput label="可動用現金" value={availableCashCents / 100} onChange={(value) => setAvailableCashCents(Math.round(value * 100))} />
          <CalcInput label="每月必要支出" value={necessaryExpenseCents / 100} onChange={(value) => setNecessaryExpenseCents(Math.round(value * 100))} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Info label="淨資產" value={formatMoney(netWorthCents)} />
          <Info label="負債比" value={formatPercent(debtRatio)} />
          <Info label="預備金月數" value={`${emergencyMonths.toFixed(1)} 個月`} />
        </div>
      </section>

      <section className="panel">
        <div className="flex items-center gap-2"><LineChart size={18} /><h2 className="text-lg font-semibold">投資定期定額</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <CalcInput label="初始投入" value={investmentPrincipalCents / 100} onChange={(value) => setInvestmentPrincipalCents(Math.round(value * 100))} />
          <CalcInput label="每月投入" value={monthlyInvestmentCents / 100} onChange={(value) => setMonthlyInvestmentCents(Math.round(value * 100))} />
          <CalcInput label="年化報酬率 %" value={investmentAnnualRate * 100} onChange={(value) => setInvestmentAnnualRate(value / 100)} />
          <CalcInput label="投資年數" value={investmentYears} onChange={(value) => setInvestmentYears(Math.max(1, Math.round(value)))} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Info label="投入本金" value={formatMoney(investmentContributionCents)} />
          <Info label="預估期末價值" value={formatMoney(investmentFutureValueCents)} />
          <Info label="預估成長" value={formatMoney(investmentFutureValueCents - investmentContributionCents)} />
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">此試算僅為複利模型估算，不代表任何投資報酬保證。</p>
      </section>
      </div>
    </div>
  );
}

function calculateInvestmentFutureValueCents({
  principalCents,
  monthlyContributionCents,
  annualRate,
  years
}: {
  principalCents: number;
  monthlyContributionCents: number;
  annualRate: number;
  years: number;
}) {
  const months = Math.max(1, Math.round(years * 12));
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return principalCents + monthlyContributionCents * months;
  const principalValue = principalCents * (1 + monthlyRate) ** months;
  const contributionValue = monthlyContributionCents * (((1 + monthlyRate) ** months - 1) / monthlyRate);
  return Math.round(principalValue + contributionValue);
}

function BudgetsPage({
  budgets,
  transactions,
  month,
  setBudgets,
  notify
}: {
  budgets: Budget[];
  transactions: Transaction[];
  month: string;
  setBudgets: React.Dispatch<React.SetStateAction<Budget[]>>;
  notify: (type: ToastType, message: string) => void;
}) {
  const monthlyExpenseTransactions = transactions
    .filter((transaction) => transaction.date.startsWith(month))
    .filter((transaction) => transaction.type === "expense" || transaction.type === "credit_card_purchase");
  const currentBudgets = budgets.filter((budget) => budget.month === month);
  const categoryBudgets = currentBudgets.filter((budget) => budget.category !== "全部");
  const totalBudgetFromCategories = categoryBudgets.reduce((sum, budget) => sum + budget.budgetCents, 0);
  const fallbackTotalBudget = currentBudgets
    .filter((budget) => budget.category === "全部")
    .reduce((sum, budget) => Math.max(sum, budget.budgetCents), 0);
  const plannedBudgetCents = totalBudgetFromCategories > 0 ? totalBudgetFromCategories : fallbackTotalBudget;
  const spentCents = monthlyExpenseTransactions.reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const necessarySpentCents = monthlyExpenseTransactions
    .filter((transaction) => transaction.isNecessary)
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const fixedSpentCents = monthlyExpenseTransactions
    .filter((transaction) => transaction.isRecurring)
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const flexibleSpentCents = Math.max(0, spentCents - necessarySpentCents);
  const remainingBudgetCents = Math.max(0, plannedBudgetCents - spentCents);
  const overspentCents = Math.max(0, spentCents - plannedBudgetCents);
  const dayOfMonth = Math.max(1, new Date().getDate());
  const projectedMonthEndCents = Math.round((spentCents / dayOfMonth) * 31);
  const budgetUseRatio = spentCents / Math.max(plannedBudgetCents, 1);
  const categorySpentMap = monthlyExpenseTransactions.reduce<Record<string, number>>((acc, transaction) => {
    acc[transaction.category] = (acc[transaction.category] ?? 0) + transaction.amountCents;
    return acc;
  }, {});
  const budgetPlanRows = [...new Set([...budgetCategoryOptions, ...currentBudgets.map((budget) => budget.category ?? "全部"), ...Object.keys(categorySpentMap)])]
    .filter((category) => category !== "全部")
    .map((category) => {
      const budgetCents = currentBudgets
        .filter((budget) => budget.category === category)
        .reduce((sum, budget) => sum + budget.budgetCents, 0);
      const spent = categorySpentMap[category] ?? 0;
      return {
        category,
        budgetCents,
        spentCents: spent,
        remainingCents: Math.max(0, budgetCents - spent),
        ratio: spent / Math.max(budgetCents, 1)
      };
    })
    .filter((row) => row.budgetCents > 0 || row.spentCents > 0 || budgetCategoryOptions.includes(row.category))
    .slice(0, 18);
  const topBudgetRows = budgetPlanRows
    .filter((row) => row.budgetCents > 0 || row.spentCents > 0)
    .sort((a, b) => Math.max(b.spentCents, b.budgetCents) - Math.max(a.spentCents, a.budgetCents))
    .slice(0, 8);

  function addBudget(formData: FormData) {
    const amount = parseMoneyToCents(String(formData.get("amount") ?? ""));
    const validation = validatePositiveAmount(amount, "預算");
    if (!validation.valid) return notify("error", validation.errors[0]);
    const now = new Date().toISOString();
    setBudgets((current) => [
      {
        id: crypto.randomUUID(),
        userId: localUserId,
        month,
        totalBudgetCents: amount,
        category: String(formData.get("category") || "全部"),
        budgetCents: amount,
        thresholds: [0.5, 0.8, 1],
        createdAt: now,
        updatedAt: now
      },
      ...current
    ]);
    notify("success", "預算已新增");
  }

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<Banknote size={18} />}
        label="預算規劃"
        title="本月預算使用狀態"
        value={plannedBudgetCents > 0 ? `${formatPercent(budgetUseRatio)} 已使用` : "尚未設定預算"}
        tone="rose"
        metrics={[
          { label: "總預算", value: formatMoney(plannedBudgetCents), accent: "border-sky-300" },
          { label: "已使用", value: formatMoney(spentCents), accent: "border-rose-300" },
          { label: "剩餘", value: formatMoney(remainingBudgetCents), accent: "border-emerald-300" }
        ]}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DonutChart
            segments={[
              { label: "已使用", value: spentCents, color: overspentCents > 0 ? "#dc2626" : "#db2777" },
              { label: "剩餘", value: remainingBudgetCents, color: "#059669" }
            ]}
            centerLabel="預算"
            centerValue={plannedBudgetCents > 0 ? formatPercent(budgetUseRatio) : "0%"}
          />
          <div className="flex-1 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-300">預估月底</span>
              <span className="font-semibold text-white">{formatMoney(projectedMonthEndCents)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-300">超支金額</span>
              <span className="font-semibold text-white">{formatMoney(overspentCents)}</span>
            </div>
            <StackedDistribution data={[
              { category: "必要支出", amountCents: necessarySpentCents },
              { category: "非必要支出", amountCents: flexibleSpentCents }
            ]} total={Math.max(spentCents, 1)} />
            <CompactDistributionList data={[
              { category: "必要支出", amountCents: necessarySpentCents },
              { category: "非必要支出", amountCents: flexibleSpentCents }
            ]} total={Math.max(spentCents, 1)} inverse />
          </div>
        </div>
      </FeatureHero>

      <div className="grid gap-4 lg:grid-cols-5">
        <StatCard label="必要支出" value={formatMoney(necessarySpentCents)} />
        <StatCard label="固定支出" value={formatMoney(fixedSpentCents)} />
        <StatCard label="非必要支出" value={formatMoney(flexibleSpentCents)} />
        <StatCard label="超支金額" value={formatMoney(overspentCents)} />
        <StatCard label="預估月底支出" value={formatMoney(projectedMonthEndCents)} />
      </div>

      <section className="panel">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} />
          <h2 className="text-lg font-semibold">分類預算地圖</h2>
        </div>
        <BudgetPlanChart rows={topBudgetRows} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <section className="panel">
          <h2 className="text-lg font-semibold">新增每月預算</h2>
          <form className="mt-4 space-y-3" onSubmit={handleFormSubmit(addBudget)}>
            <Field label="分類">
              <input className="input" name="category" list="budget-categories" defaultValue="餐飲" />
              <datalist id="budget-categories">
                {budgetCategoryOptions.map((category) => <option key={category} value={category} />)}
              </datalist>
            </Field>
            <Field label="預算金額"><input className="input" name="amount" inputMode="decimal" required /></Field>
            <button className="btn-primary w-full" type="submit"><Plus size={16} />新增預算</button>
          </form>
        </section>
        <section className="grid gap-3 md:grid-cols-2">
          {budgetPlanRows.map((row) => (
            <div key={row.category} className="panel">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{row.category}</p>
                <Badge>{row.budgetCents > 0 ? "已設定" : "待規劃"}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info label="預算" value={formatMoney(row.budgetCents)} />
                <Info label="已使用" value={formatMoney(row.spentCents)} />
                <Info label="剩餘" value={formatMoney(row.remainingCents)} />
                <Info label="超支" value={formatMoney(Math.max(0, row.spentCents - row.budgetCents))} />
              </div>
              <div className="mt-4"><Progress label="使用比例" value={row.ratio} colorClass={row.ratio >= 1 ? "bg-rose-500" : row.ratio >= 0.8 ? "bg-amber-500" : "bg-emerald-500"} /></div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function RemindersPage({
  reminders,
  accounts,
  setReminders,
  notify
}: {
  reminders: FinancialReminder[];
  accounts: FinancialAccount[];
  setReminders: React.Dispatch<React.SetStateAction<FinancialReminder[]>>;
  notify: (type: ToastType, message: string) => void;
}) {
  const activeReminders = reminders.filter((reminder) => reminder.status !== "done");
  const monthlyReminderAmountCents = activeReminders.reduce((sum, reminder) => {
    const multiplier = reminder.frequency === "weekly" ? 4 : reminder.frequency === "quarterly" ? 1 / 3 : reminder.frequency === "yearly" ? 1 / 12 : 1;
    return sum + Math.round(reminder.amountCents * multiplier);
  }, 0);
  const necessaryReminderCents = activeReminders
    .filter((reminder) => reminder.isNecessary)
    .reduce((sum, reminder) => sum + reminder.amountCents, 0);
  const autoReminderCount = activeReminders.filter((reminder) => reminder.autoCreateTransaction).length;
  const reminderStatusRows = Object.entries(
    activeReminders.reduce<Record<string, number>>((acc, reminder) => {
      acc[reminder.status] = (acc[reminder.status] ?? 0) + reminder.amountCents;
      return acc;
    }, {})
  ).map(([category, amountCents]) => ({ category, amountCents }));

  function addReminder(formData: FormData) {
    const amount = parseMoneyToCents(String(formData.get("amount") ?? ""));
    const validation = combineValidations(validatePositiveAmount(amount), validateDateRange(String(formData.get("startDate"))));
    if (!validation.valid) return notify("error", validation.errors[0]);
    const now = new Date().toISOString();
    setReminders((current) => [
      {
        id: crypto.randomUUID(),
        userId: localUserId,
        name: String(formData.get("name")),
        amountCents: amount,
        frequency: String(formData.get("frequency")) as FinancialReminder["frequency"],
        debitDay: Number(formData.get("debitDay")),
        accountId: String(formData.get("accountId") ?? ""),
        remindDaysBefore: Number(formData.get("remindDaysBefore")),
        autoCreateTransaction: formData.get("autoCreate") === "on",
        isNecessary: formData.get("necessary") === "on",
        startDate: String(formData.get("startDate")),
        status: "pending",
        createdAt: now,
        updatedAt: now
      },
      ...current
    ]);
    notify("success", "提醒已新增");
  }

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<CalendarClock size={18} />}
        label="固定帳單"
        title="週期性扣款與提醒狀態"
        value={formatMoney(monthlyReminderAmountCents)}
        tone="sky"
        metrics={[
          { label: "必要帳單", value: formatMoney(necessaryReminderCents), accent: "border-rose-300" },
          { label: "提醒項目", value: `${activeReminders.length} 項`, accent: "border-sky-300" },
          { label: "自動交易", value: `${autoReminderCount} 項`, accent: "border-emerald-300" }
        ]}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DonutChart
            segments={[
              { label: "必要", value: necessaryReminderCents, color: "#dc2626" },
              { label: "其他", value: Math.max(0, monthlyReminderAmountCents - necessaryReminderCents), color: "#0284c7" }
            ]}
            centerLabel="月扣款"
            centerValue={formatCompactMoney(monthlyReminderAmountCents)}
          />
          <div className="flex-1 space-y-3">
            <StackedDistribution data={reminderStatusRows} total={activeReminders.reduce((sum, reminder) => sum + reminder.amountCents, 0)} />
            <CompactDistributionList data={reminderStatusRows} total={Math.max(activeReminders.reduce((sum, reminder) => sum + reminder.amountCents, 0), 1)} inverse />
          </div>
        </div>
      </FeatureHero>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <section className="panel">
        <h2 className="text-lg font-semibold">新增固定帳單</h2>
        <form className="mt-4 space-y-3" onSubmit={handleFormSubmit(addReminder)}>
          <Field label="名稱"><input className="input" name="name" required /></Field>
          <Field label="金額"><input className="input" name="amount" inputMode="decimal" required /></Field>
          <Field label="週期"><select className="input" name="frequency"><option value="monthly">每月</option><option value="weekly">每週</option><option value="quarterly">每季</option><option value="yearly">每年</option></select></Field>
          <Field label="扣款日"><input className="input" name="debitDay" type="number" min={1} max={31} defaultValue={5} /></Field>
          <Field label="扣款帳戶"><select className="input" name="accountId">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
          <Field label="提醒天數"><input className="input" name="remindDaysBefore" type="number" min={0} defaultValue={3} /></Field>
          <Field label="開始日期"><input className="input" name="startDate" type="date" defaultValue={today} /></Field>
          <label className="flex items-center gap-2 text-sm"><input name="autoCreate" type="checkbox" /> 自動建立交易</label>
          <label className="flex items-center gap-2 text-sm"><input name="necessary" type="checkbox" defaultChecked /> 必要支出</label>
          <button className="btn-primary w-full" type="submit"><Plus size={16} />新增提醒</button>
        </form>
      </section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {reminders.map((reminder) => (
          <div key={reminder.id} className="panel">
            <div className="flex items-start justify-between gap-3"><p className="font-semibold">{reminder.name}</p><Badge>{reminder.status}</Badge></div>
            <p className="mt-2 text-2xl font-bold">{formatMoney(reminder.amountCents)}</p>
          <p className="mt-2 text-sm text-slate-500">{reminder.frequency} · 每月 {reminder.debitDay} 日 · 提前 {reminder.remindDaysBefore} 天提醒</p>
        </div>
      ))}
        </section>
      </div>
    </div>
  );
}

function ReportsPage({
  month,
  transactions,
  loans,
  creditCards,
  creditCardInstallments,
  monthlyTrend,
  categoryBreakdown,
  accounts,
  dashboard
}: {
  month: string;
  transactions: Transaction[];
  loans: Loan[];
  creditCards: CreditCard[];
  creditCardInstallments: CreditCardInstallment[];
  monthlyTrend: { month: string; incomeCents: number; expenseCents: number }[];
  categoryBreakdown: { category: string; amountCents: number }[];
  accounts: FinancialAccount[];
  dashboard: ReturnType<typeof summarizeDashboard>;
}) {
  const reportInput = {
    month,
    dashboard,
    accounts,
    transactions,
    creditCards,
    creditCardInstallments,
    loans,
    monthlyTrend,
    categoryBreakdown
  };

  function downloadCsv() {
    const headers = ["日期", "類型", "金額", "分類", "商家", "備註"];
    const rows = transactions.map((transaction) => [
      transaction.date,
      transactionTypeLabels[transaction.type],
      String(transaction.amountCents / 100),
      transaction.category,
      transaction.merchant ?? "",
      transaction.note ?? ""
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, "\"\"")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ez2savemore-transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<FileText size={18} />}
        label="財務報表"
        title="總帳、現金流與負債報表"
        value={formatMoney(dashboard.netWorthCents)}
        tone="slate"
        metrics={[
          { label: "本月結餘", value: formatMoney(dashboard.monthlyBalanceCents), accent: "border-sky-300" },
          { label: "支出分類", value: `${categoryBreakdown.length} 類`, accent: "border-emerald-300" },
          { label: "報表月份", value: month.replace("-", "/"), accent: "border-violet-300" }
        ]}
      >
        <div className="space-y-4">
          <Progress label="負債比" value={dashboard.debtRatio} colorClass={dashboard.debtRatio > 0.5 ? "bg-rose-500" : "bg-emerald-500"} />
          <CompactDistributionList data={[
            { category: "總資產", amountCents: dashboard.totalAssetsCents },
            { category: "總負債", amountCents: dashboard.totalLiabilitiesCents }
          ]} total={Math.max(dashboard.totalAssetsCents + dashboard.totalLiabilitiesCents, 1)} inverse />
        </div>
      </FeatureHero>
      <div className="panel flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">財務報表</h2>
          <p className="text-sm text-slate-500">查詢採期間資料，不一次載入全部年份。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={downloadCsv}><Download size={16} />CSV</button>
          <button className="btn-secondary" onClick={() => exportReportToExcel(reportInput)}><Table size={16} />Excel</button>
          <button
            className="btn-primary"
            onClick={() => {
              try {
                exportReportToPdf(reportInput);
              } catch (error) {
                window.alert(error instanceof Error ? error.message : "PDF 匯出失敗");
              }
            }}
          >
            <FileText size={16} />PDF
          </button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <section className="panel lg:col-span-8"><h3 className="font-semibold">月收支與現金流趨勢</h3><TrendChart data={monthlyTrend} /></section>
        <section className="panel lg:col-span-4"><h3 className="font-semibold">總資產與總負債比例</h3><LedgerDonut dashboard={dashboard} /></section>
        <section className="panel lg:col-span-7"><h3 className="font-semibold">全部帳戶總帳分布</h3><AccountBalanceChart accounts={accounts} /></section>
        <section className="panel lg:col-span-5"><h3 className="font-semibold">支出分類報表</h3><CategoryBars data={categoryBreakdown} /></section>
        <section className="panel lg:col-span-4"><h3 className="font-semibold">帳戶類型資產</h3><AccountTypeChart accounts={accounts} /></section>
        <section className="panel lg:col-span-4"><h3 className="font-semibold">可動用與暫不可動用資金</h3><CashAvailabilityChart accounts={accounts} /></section>
        <section className="panel lg:col-span-4"><h3 className="font-semibold">信用卡使用報表</h3>{creditCards.map((card, index) => <Progress key={card.id} label={card.name} value={(card.currentStatementAmountCents + card.unbilledAmountCents + getCardInstallmentDebt(card.id, creditCardInstallments, card.installmentBalanceCents)) / Math.max(card.creditLimitCents, 1)} colorClass={index % 2 === 0 ? "bg-sky-600" : "bg-violet-600"} />)}</section>
        <section className="panel lg:col-span-5"><h3 className="font-semibold">貸款餘額報表</h3><div className="mt-4 space-y-4">{loans.length === 0 ? <EmptyState label="尚無貸款資料" /> : loans.map((loan, index) => <Progress key={loan.id} label={loan.name} value={loan.remainingPrincipalCents / Math.max(loan.originalPrincipalCents, 1)} helper={formatMoney(loan.remainingPrincipalCents)} colorClass={index % 2 === 0 ? "bg-rose-600" : "bg-amber-500"} />)}</div></section>
        <section className="panel lg:col-span-7"><h3 className="font-semibold">分期負債明細</h3><InstallmentDebtTable cards={creditCards} installments={creditCardInstallments} /></section>
      </div>
    </div>
  );
}

function AiPage({
  report,
  loading,
  onGenerate,
  dashboard,
  categoryBreakdown
}: {
  report: AiFinancialReport | null;
  loading: boolean;
  onGenerate: () => void;
  dashboard: ReturnType<typeof summarizeDashboard>;
  categoryBreakdown: { category: string; amountCents: number }[];
}) {
  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<Bot size={18} />}
        label="AI 理財健檢"
        title="送出前先確認財務摘要"
        value={formatMoney(dashboard.monthlyBalanceCents)}
        tone="violet"
        metrics={[
          { label: "本月收入", value: formatMoney(dashboard.monthlyIncomeCents), accent: "border-emerald-300" },
          { label: "本月支出", value: formatMoney(dashboard.monthlyExpenseCents), accent: "border-rose-300" },
          { label: "預備金", value: `${dashboard.emergencyFundMonths.toFixed(1)} 個月`, accent: "border-sky-300" }
        ]}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DonutChart
            segments={categoryBreakdown.slice(0, 5).map((item, index) => ({ label: item.category, value: item.amountCents, color: getChartColor(index) }))}
            centerLabel="支出"
            centerValue={formatCompactMoney(dashboard.monthlyExpenseCents)}
          />
          <div className="flex-1 space-y-3">
            <Progress label="負債比" value={dashboard.debtRatio} colorClass={dashboard.debtRatio > 0.5 ? "bg-rose-500" : "bg-emerald-500"} />
            <CompactDistributionList data={categoryBreakdown.slice(0, 5)} total={dashboard.monthlyExpenseCents} inverse />
          </div>
        </div>
      </FeatureHero>
      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">AI 理財健檢</h2>
            <p className="text-sm text-slate-500">只傳送彙總資料，不傳完整交易明細。頁面載入不會自動呼叫 AI。</p>
          </div>
          <button className="btn-primary" onClick={onGenerate} disabled={loading}><Bot size={16} />{loading ? "產生中" : "產生本月理財建議"}</button>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="本月收入" value={formatMoney(dashboard.monthlyIncomeCents)} />
        <StatCard label="本月支出" value={formatMoney(dashboard.monthlyExpenseCents)} />
        <StatCard label="負債比" value={formatPercent(dashboard.debtRatio)} />
        <StatCard label="緊急預備金" value={`${dashboard.emergencyFundMonths.toFixed(1)} 個月`} />
      </section>
      <section className="panel">
        <h3 className="font-semibold">送往 AI 的彙總摘要</h3>
        <CategoryBars data={categoryBreakdown} />
      </section>
      {report ? (
        <section className="panel space-y-4">
          <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">財務健康分數</h3><p className="text-3xl font-bold text-brand-700 dark:text-brand-100">{report.healthScore}</p></div>
          <InfoBlock title="本月重點摘要" value={report.summary} />
          <InfoBlock title="目前最大風險" value={report.biggestRisk} />
          <InfoBlock title="最優先處理事項" value={report.topPriority} />
          <div><h4 className="font-semibold">可立即執行的三項行動</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">{report.actions.map((action) => <li key={action}>{action}</li>)}</ul></div>
          <InfoBlock title="不建議削減的必要支出" value={report.protectedEssentials.join("、")} />
          <InfoBlock title="預估改善效果" value={report.expectedImpact} />
          <InfoBlock title="免責聲明" value={report.disclaimer} />
        </section>
      ) : (
        <EmptyState label="尚未產生 AI 健檢，請主動點擊按鈕開始分析" />
      )}
    </div>
  );
}

function SettingsPage({
  isSupabaseConfigured,
  sessionEmail,
  profile,
  dataNotice,
  supabaseCheck,
  supabaseChecking,
  onRefresh,
  onCheckSupabase,
  onSendSignInLink,
  onSignOut
}: {
  isSupabaseConfigured: boolean;
  sessionEmail: string | null;
  profile: UserProfile | null;
  dataNotice: string;
  supabaseCheck: Awaited<ReturnType<typeof checkSupabaseConnection>> | null;
  supabaseChecking: boolean;
  onRefresh: () => void;
  onCheckSupabase: () => void;
  onSendSignInLink: (email: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel">
        <h2 className="text-lg font-semibold">帳號狀態</h2>
        <div className="mt-4 grid gap-3 text-sm">
          <Info label="登入 Email" value={sessionEmail ?? "尚未登入"} />
          <Info label="帳號角色" value={profile ? getRoleLabel(profile) : "尚未建立 profile"} />
          <Info label="資料來源" value={sessionEmail ? "Supabase 已登入帳號" : "尚未讀取雲端資料"} />
        </div>
      </section>
      <section className="panel">
        <h2 className="text-lg font-semibold">Supabase 資料連線</h2>
        {dataNotice && <div className="mt-3"><InlineNotice tone="warning" message={dataNotice} /></div>}
        {supabaseCheck && (
          <div className={`mt-3 rounded-md border p-3 text-sm ${
            supabaseCheck.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          }`}>
            <p className="font-semibold">{supabaseCheck.message}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {supabaseCheck.details.map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
          </div>
        )}
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleFormSubmit((formData) => void onSendSignInLink(String(formData.get("email") ?? "")))}>
          <input className="input mt-0" name="email" type="email" placeholder="輸入 Supabase Auth email" required disabled={!isSupabaseConfigured} />
          <button className="btn-primary shrink-0" type="submit" disabled={!isSupabaseConfigured}>寄送登入連結</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={onCheckSupabase} disabled={supabaseChecking}>
            {supabaseChecking ? "檢查中" : "檢查 Supabase 連線"}
          </button>
          <button className="btn-secondary" onClick={onRefresh}>重新讀取資料</button>
          <button className="btn-danger" onClick={() => void onSignOut()} disabled={!sessionEmail}>登出</button>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
          目前狀態：{isSupabaseConfigured ? "已設定 Supabase 前端連線。" : "尚未設定 Supabase 前端連線。"}
        </p>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block rounded-lg border border-slate-200/80 bg-white/70 p-3 shadow-subtle transition focus-within:border-emerald-300 focus-within:bg-white focus-within:shadow-md dark:border-slate-800 dark:bg-slate-950/60 dark:focus-within:border-emerald-800 dark:focus-within:bg-slate-950">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function handleFormSubmit(handler: (formData: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handler(new FormData(event.currentTarget));
    event.currentTarget.reset();
  };
}

function CalcInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <input className="input" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </Field>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words font-semibold">{value}</p>
    </div>
  );
}

function InfoBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <h4 className="font-semibold">{title}</h4>
      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{value}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-100">{children}</span>;
}

function getRoleLabel(profile: UserProfile) {
  if (profile.isSuperAdmin || profile.role === "super_admin") return "最高管理員";
  if (profile.role === "admin") return "管理員";
  return "一般使用者";
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/70 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
      <div>
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          <Sparkles size={18} />
        </div>
        {label}
      </div>
    </div>
  );
}
