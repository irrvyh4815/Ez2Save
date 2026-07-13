import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Bot,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CreditCard as CreditCardIcon,
  Download,
  Landmark,
  LineChart,
  Moon,
  PiggyBank,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
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
import { isSupabaseConfigured } from "./services/supabaseClient";
import { mockAiFinancialHealth, requestAiFinancialHealth } from "./services/aiFinancialHealth";
import {
  createFinancialAccount,
  createTransactionWithCategory,
  deleteTransaction,
  emptyFinanceData,
  loadFinanceData,
  normalizeCategoryName,
  sendSignInLink,
  signOut
} from "./services/financeRepository";
import type {
  AccountType,
  AiFinancialReport,
  Budget,
  CreditCard,
  Deposit,
  FinancialAccount,
  FinancialReminder,
  Loan,
  Transaction
} from "./types/finance";

type Page =
  | "dashboard"
  | "transactions"
  | "accounts"
  | "cards"
  | "loans"
  | "deposits"
  | "budgets"
  | "reminders"
  | "reports"
  | "ai"
  | "settings";

type ToastType = "success" | "error";
type Toast = { type: ToastType; message: string } | null;

const navItems: { page: Page; label: string; icon: typeof BarChart3 }[] = [
  { page: "dashboard", label: "理財總覽", icon: BarChart3 },
  { page: "transactions", label: "收支紀錄", icon: ReceiptText },
  { page: "accounts", label: "帳戶", icon: WalletCards },
  { page: "cards", label: "信用卡", icon: CreditCardIcon },
  { page: "loans", label: "貸款", icon: Landmark },
  { page: "deposits", label: "存款", icon: PiggyBank },
  { page: "budgets", label: "預算", icon: Banknote },
  { page: "reminders", label: "固定帳單", icon: CalendarClock },
  { page: "reports", label: "報表", icon: LineChart },
  { page: "ai", label: "AI 健檢", icon: Bot },
  { page: "settings", label: "設定", icon: Settings }
];

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

const today = "2026-07-13";
const localUserId = "local-user";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [month, setMonth] = useState(currentTaipeiMonth());
  const [darkMode, setDarkMode] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [accounts, setAccounts] = useState(emptyFinanceData.accounts);
  const [transactions, setTransactions] = useState(emptyFinanceData.transactions);
  const [creditCards, setCreditCards] = useState(emptyFinanceData.creditCards);
  const [loans, setLoans] = useState(emptyFinanceData.loans);
  const [deposits, setDeposits] = useState(emptyFinanceData.deposits);
  const [budgets, setBudgets] = useState(emptyFinanceData.budgets);
  const [reminders, setReminders] = useState(emptyFinanceData.reminders);
  const [rememberedCategories, setRememberedCategories] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataNotice, setDataNotice] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
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
      setLoans(result.data.loans);
      setDeposits(result.data.deposits);
      setBudgets(result.data.budgets);
      setReminders(result.data.reminders);
      setRememberedCategories(result.data.categories);
      setSessionEmail(result.session?.user.email ?? null);
      setDataNotice(
        !isSupabaseConfigured
          ? "尚未設定 Supabase 環境變數，已停用範例資料並顯示空資料。"
          : result.session
            ? ""
            : "尚未登入 Supabase，請到設定頁寄送登入連結後讀取你的已儲存資料。"
      );
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : "資料讀取失敗");
    } finally {
      setDataLoading(false);
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

  const dashboard = useMemo(
    () =>
      summarizeDashboard({
        accounts,
        creditCards,
        loans,
        transactions,
        month,
        averageNecessaryExpenseCents: recentNecessaryAverage
      }),
    [accounts, creditCards, loans, month, recentNecessaryAverage, transactions]
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

  const rootClass = darkMode ? "dark min-h-screen bg-slate-950" : "min-h-screen bg-slate-50";

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

  return (
    <div className={rootClass}>
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 lg:block">
          <Brand />
          <nav className="mt-6 space-y-1">
            {navItems.map((item) => (
              <NavButton key={item.page} item={item} active={page === item.page} onClick={() => setPage(item.page)} />
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-0">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-6">
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
                <button className="btn-secondary h-10 w-10 px-0" title="切換深色模式" onClick={() => setDarkMode((value) => !value)}>
                  <Moon size={18} />
                </button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-7xl p-4 sm:p-6">
            {toast && <ToastBanner toast={toast} />}
            {page === "dashboard" && (
              <DashboardPage
                dashboard={dashboard}
                categoryBreakdown={categoryBreakdown}
                monthlyTrend={monthlyTrend}
                reminders={reminders}
                accounts={accounts}
                creditCards={creditCards}
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
            {page === "cards" && <CardsPage cards={creditCards} accounts={accounts} setCards={setCreditCards} notify={notify} />}
            {page === "loans" && <LoansPage loans={loans} setLoans={setLoans} notify={notify} />}
            {page === "deposits" && <DepositsPage deposits={deposits} setDeposits={setDeposits} notify={notify} />}
            {page === "budgets" && (
              <BudgetsPage budgets={budgets} transactions={transactions} month={month} setBudgets={setBudgets} notify={notify} />
            )}
            {page === "reminders" && <RemindersPage reminders={reminders} accounts={accounts} setReminders={setReminders} notify={notify} />}
            {page === "reports" && (
              <ReportsPage
                transactions={transactions}
                loans={loans}
                creditCards={creditCards}
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
                darkMode={darkMode}
                isSupabaseConfigured={isSupabaseConfigured}
                sessionEmail={sessionEmail}
                dataNotice={dataNotice}
                onRefresh={refreshFinanceData}
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

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:hidden">
        <div className="grid grid-cols-6 gap-1 px-2 py-2">
          {navItems.slice(0, 6).map((item) => (
            <MobileNavButton key={item.page} item={item} active={page === item.page} onClick={() => setPage(item.page)} />
          ))}
        </div>
        <details className="border-t border-slate-200 px-2 pb-2 dark:border-slate-800">
          <summary className="flex cursor-pointer list-none items-center justify-center gap-1 py-1 text-xs text-slate-500">
            更多 <ChevronDown size={14} />
          </summary>
          <div className="grid grid-cols-5 gap-1">
            {navItems.slice(6).map((item) => (
              <MobileNavButton key={item.page} item={item} active={page === item.page} onClick={() => setPage(item.page)} />
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
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-white">
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
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium ${
        active ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
      }`}
      onClick={onClick}
    >
      <Icon size={18} />
      {item.label}
    </button>
  );
}

function MobileNavButton({ item, active, onClick }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium ${
        active ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100" : "text-slate-500 dark:text-slate-400"
      }`}
      onClick={onClick}
    >
      <Icon size={17} />
      <span className="leading-tight">{item.label}</span>
    </button>
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

function DashboardPage({
  dashboard,
  categoryBreakdown,
  monthlyTrend,
  reminders,
  accounts,
  creditCards,
  loans,
  dataLoading,
  dataNotice
}: {
  dashboard: ReturnType<typeof summarizeDashboard>;
  categoryBreakdown: { category: string; amountCents: number }[];
  monthlyTrend: { month: string; incomeCents: number; expenseCents: number }[];
  reminders: FinancialReminder[];
  accounts: FinancialAccount[];
  creditCards: CreditCard[];
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
          <LiabilityChart creditCards={creditCards} loans={loans} />
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
            <Progress label="負債比" value={dashboard.debtRatio} />
            <Progress label="緊急預備金月數" value={Math.min(dashboard.emergencyFundMonths / 6, 1)} helper={`${dashboard.emergencyFundMonths.toFixed(1)} 個月`} />
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
            {reminders.map((reminder) => (
              <div key={reminder.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{reminder.name}</p>
                  <span className="text-xs text-brand-700 dark:text-brand-100">{reminder.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{formatMoney(reminder.amountCents)} · 每月 {reminder.debitDay} 日</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel min-h-24">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 break-words text-2xl font-bold tracking-normal text-slate-950 dark:text-slate-50">{value}</p>
    </div>
  );
}

function Progress({ label, value, helper }: { label: string; value: number; helper?: string }) {
  const bounded = Math.max(0, Math.min(value, 1));
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span>{helper ?? formatPercent(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-2 rounded-full bg-brand-600" style={{ width: `${bounded * 100}%` }} />
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: { month: string; incomeCents: number; expenseCents: number }[] }) {
  const max = Math.max(...data.flatMap((item) => [item.incomeCents, item.expenseCents]), 1);
  return (
    <div className="mt-5 overflow-x-auto">
      <div className="flex min-w-[560px] items-end gap-4">
        {data.map((item) => (
          <div key={item.month} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-44 w-full items-end justify-center gap-2 rounded-md bg-slate-50 px-2 py-2 dark:bg-slate-900">
              <div className="w-5 rounded-t bg-brand-600" style={{ height: `${Math.max(8, (item.incomeCents / max) * 160)}px` }} title="收入" />
              <div className="w-5 rounded-t bg-sky-600" style={{ height: `${Math.max(8, (item.expenseCents / max) * 160)}px` }} title="支出" />
            </div>
            <span className="text-xs text-slate-500">{item.month.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryBars({ data }: { data: { category: string; amountCents: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.amountCents, 0);
  if (data.length === 0) return <EmptyState label="本月尚無支出資料" />;
  return (
    <div className="mt-4 space-y-3">
      {data.map((item) => (
        <div key={item.category}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span>{item.category}</span>
            <span>{formatMoney(item.amountCents)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-2 rounded-full bg-sky-600" style={{ width: `${(item.amountCents / Math.max(total, 1)) * 100}%` }} />
          </div>
        </div>
      ))}
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
  const active = accounts.filter((account) => account.isActive);
  const max = Math.max(...active.map((account) => account.balanceCents), 1);
  if (active.length === 0) return <EmptyState label="尚無帳戶資料，新增帳戶後會顯示總帳分布" />;
  return (
    <div className="mt-4 space-y-3">
      {active.map((account) => (
        <div key={account.id}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate">{account.name}</span>
            <span className="shrink-0 font-semibold">{formatMoney(account.balanceCents)}</span>
          </div>
          <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-3 rounded-full bg-brand-600" style={{ width: `${Math.max(4, (account.balanceCents / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LedgerDonut({ dashboard }: { dashboard: ReturnType<typeof summarizeDashboard> }) {
  const assets = Math.max(0, dashboard.totalAssetsCents);
  const liabilities = Math.max(0, dashboard.totalLiabilitiesCents);
  const total = Math.max(assets + liabilities, 1);
  const liabilityDeg = (liabilities / total) * 360;
  return (
    <div className="mt-4 flex items-center gap-5">
      <div
        className="h-32 w-32 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(#0284c7 0deg ${liabilityDeg}deg, #059669 ${liabilityDeg}deg 360deg)`
        }}
        aria-label="資產負債比例圖"
      />
      <div className="space-y-3 text-sm">
        <Legend color="bg-brand-600" label="資產" value={formatMoney(assets)} />
        <Legend color="bg-sky-600" label="負債" value={formatMoney(liabilities)} />
        <p className="text-slate-500">淨資產 {formatMoney(dashboard.netWorthCents)}</p>
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

function LiabilityChart({ creditCards, loans }: { creditCards: CreditCard[]; loans: Loan[] }) {
  const cardDebt = creditCards.reduce((sum, card) => sum + card.currentStatementAmountCents + card.unbilledAmountCents + card.installmentBalanceCents, 0);
  const loanDebt = loans.reduce((sum, loan) => sum + loan.remainingPrincipalCents, 0);
  return (
    <MiniBars
      data={[
        { label: "信用卡", amountCents: cardDebt },
        { label: "貸款", amountCents: loanDebt }
      ]}
      emptyLabel="尚無負債資料"
    />
  );
}

function MiniBars({ data, emptyLabel }: { data: { label: string; amountCents: number }[]; emptyLabel: string }) {
  const filtered = data.filter((item) => item.amountCents > 0);
  const total = filtered.reduce((sum, item) => sum + item.amountCents, 0);
  if (filtered.length === 0) return <EmptyState label={emptyLabel} />;
  return (
    <div className="mt-4 space-y-3">
      {filtered.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span>{item.label}</span>
            <span>{formatMoney(item.amountCents)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-2 rounded-full bg-sky-600" style={{ width: `${Math.max(4, (item.amountCents / Math.max(total, 1)) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded ${color}`} />
      <span className="min-w-10 text-slate-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
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
  return (
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
  );
}

function AccountsPage({ accounts, onAdd }: { accounts: FinancialAccount[]; onAdd: (formData: FormData) => void }) {
  return (
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
  );
}

function CardsPage({
  cards,
  accounts,
  setCards,
  notify
}: {
  cards: CreditCard[];
  accounts: FinancialAccount[];
  setCards: React.Dispatch<React.SetStateAction<CreditCard[]>>;
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

  return (
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
          const used = card.unbilledAmountCents + card.currentStatementAmountCents + card.installmentBalanceCents;
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
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <section className="panel">
        <h2 className="text-lg font-semibold">新增每月預算</h2>
        <form className="mt-4 space-y-3" onSubmit={handleFormSubmit(addBudget)}>
          <Field label="分類"><input className="input" name="category" defaultValue="全部" /></Field>
          <Field label="預算金額"><input className="input" name="amount" inputMode="decimal" required /></Field>
          <button className="btn-primary w-full" type="submit"><Plus size={16} />新增預算</button>
        </form>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        {budgets.filter((budget) => budget.month === month).map((budget) => {
          const spent = transactions
            .filter((transaction) => transaction.date.startsWith(month))
            .filter((transaction) => transaction.type === "expense" || transaction.type === "credit_card_purchase")
            .filter((transaction) => budget.category === "全部" || transaction.category === budget.category)
            .reduce((sum, transaction) => sum + transaction.amountCents, 0);
          const ratio = spent / Math.max(budget.budgetCents, 1);
          const projected = Math.round(spent / 13 * 31);
          return (
            <div key={budget.id} className="panel">
              <p className="font-semibold">{budget.category} 預算</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info label="已使用" value={formatMoney(spent)} />
                <Info label="剩餘" value={formatMoney(Math.max(0, budget.budgetCents - spent))} />
                <Info label="超支" value={formatMoney(Math.max(0, spent - budget.budgetCents))} />
                <Info label="預估月底" value={formatMoney(projected)} />
              </div>
              <div className="mt-4"><Progress label="使用比例" value={ratio} /></div>
            </div>
          );
        })}
      </section>
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
  );
}

function ReportsPage({
  transactions,
  loans,
  creditCards,
  monthlyTrend,
  categoryBreakdown,
  accounts,
  dashboard
}: {
  transactions: Transaction[];
  loans: Loan[];
  creditCards: CreditCard[];
  monthlyTrend: { month: string; incomeCents: number; expenseCents: number }[];
  categoryBreakdown: { category: string; amountCents: number }[];
  accounts: FinancialAccount[];
  dashboard: ReturnType<typeof summarizeDashboard>;
}) {
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
      <div className="panel flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">財務報表</h2>
          <p className="text-sm text-slate-500">查詢採期間資料，不一次載入全部年份。</p>
        </div>
        <button className="btn-primary" onClick={downloadCsv}><Download size={16} />匯出 CSV</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel"><h3 className="font-semibold">全部帳戶總帳分布</h3><AccountBalanceChart accounts={accounts} /></section>
        <section className="panel"><h3 className="font-semibold">總資產與總負債比例</h3><LedgerDonut dashboard={dashboard} /></section>
        <section className="panel"><h3 className="font-semibold">帳戶類型資產</h3><AccountTypeChart accounts={accounts} /></section>
        <section className="panel"><h3 className="font-semibold">可動用與暫不可動用資金</h3><CashAvailabilityChart accounts={accounts} /></section>
        <section className="panel"><h3 className="font-semibold">月收支與現金流趨勢</h3><TrendChart data={monthlyTrend} /></section>
        <section className="panel"><h3 className="font-semibold">支出分類報表</h3><CategoryBars data={categoryBreakdown} /></section>
        <section className="panel"><h3 className="font-semibold">貸款餘額報表</h3>{loans.map((loan) => <Progress key={loan.id} label={loan.name} value={loan.remainingPrincipalCents / loan.originalPrincipalCents} helper={formatMoney(loan.remainingPrincipalCents)} />)}</section>
        <section className="panel"><h3 className="font-semibold">信用卡使用報表</h3>{creditCards.map((card) => <Progress key={card.id} label={card.name} value={(card.currentStatementAmountCents + card.unbilledAmountCents) / Math.max(card.creditLimitCents, 1)} />)}</section>
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
  darkMode,
  isSupabaseConfigured,
  sessionEmail,
  dataNotice,
  onRefresh,
  onSendSignInLink,
  onSignOut
}: {
  darkMode: boolean;
  isSupabaseConfigured: boolean;
  sessionEmail: string | null;
  dataNotice: string;
  onRefresh: () => void;
  onSendSignInLink: (email: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel">
        <h2 className="text-lg font-semibold">系統設定</h2>
        <div className="mt-4 grid gap-3 text-sm">
          <Info label="語言" value="繁體中文" />
          <Info label="貨幣" value="TWD 新台幣" />
          <Info label="時區" value="Asia/Taipei" />
          <Info label="日期格式" value="YYYY/MM/DD" />
          <Info label="深色模式" value={darkMode ? "已開啟" : "未開啟"} />
        </div>
      </section>
      <section className="panel">
        <h2 className="text-lg font-semibold">連線與資安</h2>
        <div className="mt-4 space-y-3 text-sm">
          <Info label="Supabase" value={isSupabaseConfigured ? "已設定前端 anon key" : "未設定，請先設定 Vercel 環境變數"} />
          <Info label="登入狀態" value={sessionEmail ?? "尚未登入"} />
          <Info label="AI" value="預設 mock mode；API Key 僅允許後端環境變數" />
          <Info label="敏感資料" value="不儲存完整卡號、CVV、網銀密碼；財務資料不寫入 localStorage" />
          <Info label="CSV 限制" value="512KB、500 筆、先預覽再匯入" />
        </div>
      </section>
      <section className="panel lg:col-span-2">
        <h2 className="text-lg font-semibold">Supabase 資料連線</h2>
        {dataNotice && <div className="mt-3"><InlineNotice tone="warning" message={dataNotice} /></div>}
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleFormSubmit((formData) => void onSendSignInLink(String(formData.get("email") ?? "")))}>
          <input className="input mt-0" name="email" type="email" placeholder="輸入 Supabase Auth email" required disabled={!isSupabaseConfigured} />
          <button className="btn-primary shrink-0" type="submit" disabled={!isSupabaseConfigured}>寄送登入連結</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={onRefresh}>重新讀取 Supabase 資料</button>
          <button className="btn-danger" onClick={() => void onSignOut()} disabled={!sessionEmail}>登出</button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="panel flex min-h-36 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
      {label}
    </div>
  );
}
