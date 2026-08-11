import {
  AlertTriangle,
  ArrowLeft,
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Bell,
  Bot,
  Bitcoin,
  BookOpen,
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
  Table,
  Target,
  TrendingUp,
  Trash2,
  Umbrella,
  Upload,
  UserCheck,
  UserX,
  Users,
  KeyRound,
  Pencil,
  RefreshCw,
  Send,
  Smartphone,
  WalletCards
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  calculateDeposit,
  calculateDebtServiceRatio,
  calculateFinancialPlan,
  calculateFutureCashFlow,
  calculateInstallmentOpeningBalance,
  calculateInvestmentAssetValuation,
  calculateLoanProgress,
  getFinancialPlanAllocation,
  inferAnnualRateFromPayment,
  inferLoanTrackingMode,
  calculateLoan,
  calculateReserveCredit,
  calculateSavingsRate,
  summarizeCreditCardLimit,
  summarizeCreditCardLimits,
  summarizeExpenseNature,
  summarizeLoanProgress,
  summarizeDashboard,
  type DepositCalculationInput,
  type FinancialPlanCalculationResult,
  type LoanCalculationInput,
  type LoanTrackingMode,
  type ReserveCreditCalculationInput
} from "./lib/financialCalculations";
import { currentTaipeiMonth, formatCompactMoney, formatCurrencyAmount, formatDate, formatMoney, formatPercent, parseMoneyToCents, setDefaultMoneyCurrency } from "./lib/format";
import { parseTransactionsCsv } from "./lib/csv";
import { combineValidations, validateAnnualRate, validateDateRange, validateIntegerRange, validateNonNegativeAmount, validatePositiveAmount } from "./lib/validation";
import { exportReportToExcel, exportReportToPdf } from "./lib/reportExport";
import { getNotificationStatus, isNotificationVisible } from "./lib/notificationRules";
import { calculateLoanPaymentBreakdown, resolveTransactionPayment, type ExpensePaymentMethod } from "./lib/transactionPayments";
import { isSupabaseConfigured, supabase } from "./services/supabaseClient";
import { mockAiFinancialHealth, requestAiFinancialHealth } from "./services/aiFinancialHealth";
import { listAdminUsers, manageAdminUser, type AdminManagedUser, type AdminAuditLog } from "./services/adminUsers";
import { disableWebPush, enableWebPush, getWebPushState, sendTestWebPush, type WebPushState } from "./services/webPush";
import { installPwa, isPwaInstallAvailable } from "./services/pwaInstall";
import {
  checkSupabaseConnection,
  type FinanceData,
  createLedgerBook,
  createLedgerInvitation,
  createBudget,
  createDeposit,
  createFinancialAccount,
  createFinancialReminder,
  createCreditCard,
  createCreditCardInstallment,
  createInsurancePolicy,
  createInvestmentAsset,
  createInvestmentCategory,
  createFinancialPlan,
  createRecurringIncome,
  createLoan,
  createCreditCardPaymentRecord,
  createLoanPaymentRecord,
  createTransactionWithCategory,
  deleteBudget,
  deleteCreditCard,
  deleteDeposit,
  deleteFinancialAccount,
  deleteFinancialReminder,
  deleteInsurancePolicy,
  deleteInvestmentAsset,
  deleteInvestmentCategory,
  deleteFinancialPlan,
  deleteRecurringIncome,
  deleteLoan,
  deleteLinkedPaymentRecords,
  deleteTransaction,
  emptyFinanceData,
  loadLedgerBooks,
  loadLedgerInvitations,
  loadAllLedgerNotificationData,
  loadFinanceData,
  normalizeCategoryName,
  sendSignInLink,
  signInWithPassword,
  signUpWithPassword,
  signOut,
  deleteLedgerBook,
  updateLedgerBook,
  convertLedgerCurrency,
  updateBudget,
  updateCreditCard,
  updateDeposit,
  updateFinancialAccount,
  updateFinancialPlan,
  updateRecurringIncome,
  updateInvestmentAsset,
  updateLoan,
  updateOwnPassword,
  updateOwnProfile,
  saveNotificationPreferences
} from "./services/financeRepository";
import type {
  AccountType,
  AiFinancialReport,
  Budget,
  CreditCard,
  CreditCardInstallment,
  Deposit,
  FinancialAccount,
  FinancialPlan,
  FinancialReminder,
  NotificationPreference,
  InsurancePolicy,
  InvestmentAsset,
  InvestmentCategory,
  CurrencyCode,
  LedgerBook as PersistedLedgerBook,
  LedgerInvitation as PersistedLedgerInvitation,
  Loan,
  RecurringIncome,
  Transaction,
  UserProfile
} from "./types/finance";

type Page =
  | "dashboard"
  | "data_import"
  | "transactions"
  | "accounts"
  | "cards"
  | "loans"
  | "deposits"
  | "insurance"
  | "financial_plan"
  | "stocks"
  | "etfs"
  | "funds"
  | "bonds"
  | "forex"
  | "crypto"
  | "calculators"
  | "budgets"
  | "reminders"
  | "reports"
  | "ai"
  | "notification_settings"
  | "settings"
  | "users";

const pushDestinationPages = new Set<Page>(["dashboard", "transactions", "cards", "loans", "deposits", "insurance", "reminders", "settings"]);

function getInitialPage(): Page {
  const requested = new URLSearchParams(window.location.search).get("open") as Page | null;
  return requested && pushDestinationPages.has(requested) ? requested : "dashboard";
}

type PeriodMode = "all" | "month" | "three_months" | "six_months" | "year" | "range";

type DatePeriod = {
  mode: PeriodMode;
  startDate: string;
  endDate: string;
  label: string;
};

type ToastType = "success" | "error";
type Toast = { type: ToastType; message: string } | null;
type TransactionPreset =
  | { type: "credit_card_payment"; creditCardId: string }
  | { type: "loan_payment" | "loan_drawdown"; loanId: string };
type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};
type FinanceNotification = {
  id: string;
  title: string;
  detail: string;
  date: string;
  amountCents?: number;
  source: "credit_card" | "loan" | "installment" | "reminder" | "deposit" | "insurance";
  status: "overdue" | "due_today" | "upcoming" | "scheduled";
  ledgerId?: string;
  ledgerName?: string;
  deliveryMode: "single" | "repeat";
  repeatHours: number;
};

type LedgerBook = {
  id: string;
  name: string;
  owner: string;
  purpose: "personal" | "family" | "business" | "investment" | "custom";
  color: "emerald" | "sky" | "violet" | "amber" | "rose";
  currency: CurrencyCode;
  note: string;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
};

type LedgerInvitation = {
  id: string;
  ledgerId: string;
  target: string;
  method: "email" | "member_code";
  role: "viewer" | "editor" | "admin";
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
};

type FinanceSnapshot = {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  creditCards: CreditCard[];
  creditCardInstallments: CreditCardInstallment[];
  loans: Loan[];
  deposits: Deposit[];
  budgets: Budget[];
  reminders: FinancialReminder[];
  rememberedCategories: string[];
  insurancePolicies: InsurancePolicy[];
  investmentCategories: InvestmentCategory[];
  investmentAssets: InvestmentAsset[];
  financialPlans: FinancialPlan[];
  recurringIncomes: RecurringIncome[];
  notificationPreferences: NotificationPreference[];
};

const navGroups: { title: "理財" | "投資" | "其他" | "設定"; items: { page: Page; label: string; icon: typeof BarChart3 }[] }[] = [
  {
    title: "理財",
    items: [
      { page: "dashboard", label: "理財總覽", icon: BarChart3 },
      { page: "financial_plan", label: "財務計劃", icon: Target },
      { page: "transactions", label: "收支紀錄", icon: ReceiptText },
      { page: "accounts", label: "帳戶", icon: WalletCards },
      { page: "cards", label: "信用卡", icon: CreditCardIcon },
      { page: "loans", label: "貸款", icon: Landmark },
      { page: "deposits", label: "存款", icon: PiggyBank },
      { page: "insurance", label: "保險", icon: Umbrella },
      { page: "budgets", label: "預算", icon: Banknote },
      { page: "reminders", label: "固定帳單", icon: CalendarClock },
      { page: "reports", label: "報表", icon: LineChart }
    ]
  },
  {
    title: "投資",
    items: [
      { page: "stocks", label: "股票", icon: TrendingUp },
      { page: "etfs", label: "ETF", icon: BarChart3 },
      { page: "funds", label: "基金", icon: PiggyBank },
      { page: "bonds", label: "債券", icon: Landmark },
      { page: "forex", label: "外匯", icon: ArrowRightLeft },
      { page: "crypto", label: "加密貨幣", icon: Bitcoin }
    ]
  },
  {
    title: "其他",
    items: [
      { page: "data_import", label: "資料導入", icon: Upload },
      { page: "calculators", label: "計算機", icon: Calculator },
      { page: "ai", label: "AI 健檢", icon: Bot }
    ]
  },
  {
    title: "設定",
    items: [
      { page: "settings", label: "設定", icon: Settings },
      { page: "users", label: "用戶管理", icon: Users }
    ]
  }
];
type NavItem = (typeof navGroups)[number]["items"][number];

const pageIntros: Record<Page, { eyebrow: string; title: string; description: string; accent: string; tint: string }> = {
  dashboard: {
    eyebrow: "財務概覽",
    title: "財務全景",
    description: "資產、負債、現金流與近期提醒。",
    accent: "#059669",
    tint: "#ecfdf5"
  },
  data_import: {
    eyebrow: "快速開始",
    title: "匯入既有財務現況",
    description: "從目前餘額開始建檔，不必重建過去每一筆紀錄。",
    accent: "#0f766e",
    tint: "#f0fdfa"
  },
  transactions: {
    eyebrow: "日常收支管理",
    title: "收支與交易",
    description: "新增、匯入並依分類整理每筆交易。",
    accent: "#0284c7",
    tint: "#eff6ff"
  },
  accounts: {
    eyebrow: "資金帳戶管理",
    title: "帳戶與可用資金",
    description: "管理現金、活存、定存與其他資產帳戶。",
    accent: "#0f766e",
    tint: "#f0fdfa"
  },
  cards: {
    eyebrow: "信用與分期管理",
    title: "信用卡與分期",
    description: "追蹤帳單、額度、分期負債與繳款日。",
    accent: "#7c3aed",
    tint: "#f5f3ff"
  },
  loans: {
    eyebrow: "還款規劃",
    title: "貸款與還款",
    description: "檢視本金、利率、期數與提前還款效果。",
    accent: "#d97706",
    tint: "#fffbeb"
  },
  deposits: {
    eyebrow: "存款規劃",
    title: "存款與到期收益",
    description: "管理定存、到期日與預估利息。",
    accent: "#16a34a",
    tint: "#f0fdf4"
  },
  insurance: {
    eyebrow: "保障規劃",
    title: "保費與保障",
    description: "管理保單、保障額與理賠進度。",
    accent: "#0d9488",
    tint: "#f0fdfa"
  },
  financial_plan: {
    eyebrow: "目標財務規劃",
    title: "財務目標路線圖",
    description: "試算目標期限、每月投入與預估缺口。",
    accent: "#2563eb",
    tint: "#eff6ff"
  },
  stocks: {
    eyebrow: "股票配置",
    title: "分開管理台股與美股策略",
    description: "設定股票市場、目標比例與風險等級。",
    accent: "#2563eb",
    tint: "#eff6ff"
  },
  etfs: {
    eyebrow: "ETF 配置",
    title: "整理指數與主題型 ETF",
    description: "設定 ETF 市場、風險與目標比例。",
    accent: "#0891b2",
    tint: "#ecfeff"
  },
  funds: {
    eyebrow: "基金配置",
    title: "掌握共同基金與貨幣市場配置",
    description: "依市場與風險層級管理基金配置。",
    accent: "#7c3aed",
    tint: "#f5f3ff"
  },
  bonds: {
    eyebrow: "債券配置",
    title: "整理收益與防禦型資產",
    description: "管理收益、防禦與債券基金配置。",
    accent: "#d97706",
    tint: "#fffbeb"
  },
  forex: {
    eyebrow: "外匯資產",
    title: "掌握外幣成本、匯率與損益",
    description: "換算外幣成本、目前價值與損益。",
    accent: "#0284c7",
    tint: "#eff6ff"
  },
  crypto: {
    eyebrow: "加密貨幣",
    title: "數位資產持倉",
    description: "管理數量、成本、現價與損益。",
    accent: "#2563eb",
    tint: "#eff6ff"
  },
  calculators: {
    eyebrow: "財務試算",
    title: "常用財務試算",
    description: "貸款、存款、淨資產與預備金試算。",
    accent: "#0891b2",
    tint: "#ecfeff"
  },
  budgets: {
    eyebrow: "開支規劃",
    title: "用預算掌握本月節奏",
    description: "追蹤已使用、剩餘與預估月底支出，及早看見超支風險。",
    accent: "#db2777",
    tint: "#fdf2f8"
  },
  reminders: {
    eyebrow: "付款提醒",
    title: "重要扣款與帳單到期都在這裡",
    description: "管理固定帳單、扣款日與付款狀態。",
    accent: "#ea580c",
    tint: "#fff7ed"
  },
  reports: {
    eyebrow: "財務回顧",
    title: "報表與趨勢",
    description: "檢視財務趨勢，匯出 CSV、Excel 或 PDF。",
    accent: "#4f46e5",
    tint: "#eef2ff"
  },
  ai: {
    eyebrow: "財務洞察",
    title: "把數字轉成下一步行動",
    description: "主動產生財務摘要、風險與行動建議。",
    accent: "#9333ea",
    tint: "#faf5ff"
  },
  notification_settings: {
    eyebrow: "帳本通知設定",
    title: "依你的付款節奏安排提醒",
    description: "設定提醒項目、提前天數與通知頻率。",
    accent: "#ea580c",
    tint: "#fff7ed"
  },
  settings: {
    eyebrow: "帳號與資料",
    title: "管理登入與雲端資料",
    description: "確認帳號狀態、資料讀取與安全設定。",
    accent: "#475569",
    tint: "#f8fafc"
  },
  users: {
    eyebrow: "平台管理",
    title: "管理使用者與帳號權限",
    description: "搜尋帳號、調整角色與管理存取狀態。",
    accent: "#0f766e",
    tint: "#f0fdfa"
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
  loan_drawdown: "備用金動用",
  deposit_transfer: "存款轉入",
  investment_buy: "投資買入",
  investment_sell: "投資賣出"
};

const loanTypeLabels: Record<Loan["type"], string> = {
  personal: "信用貸款",
  mortgage: "房屋貸款",
  auto: "汽車貸款",
  motorcycle: "機車貸款",
  student: "學貸",
  family: "親友借款",
  reserve_credit: "備用金",
  other: "其他貸款"
};

const investmentKindLabels: Record<InvestmentCategory["kind"], string> = {
  tw_stock: "台股",
  us_stock: "美股",
  etf: "ETF",
  mutual_fund: "共同基金",
  bond_fund: "債券基金",
  money_market: "貨幣市場",
  forex: "外匯",
  crypto: "加密貨幣",
  other: "其他"
};

const investmentMarketLabels: Record<InvestmentCategory["market"], string> = {
  TW: "台灣",
  US: "美國",
  GLOBAL: "全球",
  FX: "外匯市場",
  CRYPTO: "加密市場"
};

const investmentRiskLabels: Record<InvestmentCategory["risk"], string> = {
  low: "低風險",
  medium: "中風險",
  high: "高風險"
};

const financialPlanGoalLabels: Record<FinancialPlan["goalType"], string> = {
  emergency_fund: "緊急預備金",
  debt_repayment: "債務清償",
  major_purchase: "大額購置",
  education: "教育進修",
  home: "購屋準備",
  retirement: "退休準備",
  investment: "投資目標",
  custom: "自訂目標"
};

const financialPlanHorizonLabels: Record<FinancialPlan["horizon"], string> = {
  short: "近期",
  medium: "中期",
  long: "長期"
};

const financialPlanRiskLabels: Record<FinancialPlan["riskProfile"], string> = {
  conservative: "保守",
  balanced: "平衡",
  growth: "成長"
};

const financialPlanStatusLabels: Record<FinancialPlan["status"], string> = {
  active: "進行中",
  paused: "暫停",
  completed: "已完成"
};

const recurringIncomeTypeLabels: Record<RecurringIncome["incomeType"], string> = {
  salary: "薪資",
  bonus: "獎金",
  rental: "租金收入",
  pension: "退休金",
  side_business: "副業收入",
  other: "其他收入"
};

const recurringFrequencyLabels: Record<RecurringIncome["frequency"], string> = {
  weekly: "每週",
  monthly: "每月",
  quarterly: "每季",
  yearly: "每年"
};

const insuranceTypeLabels: Record<InsurancePolicy["type"], string> = {
  life: "壽險",
  medical: "醫療險",
  accident: "意外險",
  car: "車險",
  home: "住宅險",
  travel: "旅平險",
  investment: "投資型保單",
  other: "其他保險"
};

const insuranceStatusLabels: Record<InsurancePolicy["status"], string> = {
  active: "有效",
  paused: "暫停",
  expired: "已到期"
};

const ledgerPurposeLabels: Record<LedgerBook["purpose"], string> = {
  personal: "個人帳本",
  family: "家庭帳本",
  business: "事業帳本",
  investment: "投資帳本",
  custom: "自訂帳本"
};

const currencyLabels: Record<CurrencyCode, string> = {
  TWD: "新台幣 TWD",
  USD: "美元 USD",
  JPY: "日圓 JPY",
  EUR: "歐元 EUR",
  GBP: "英鎊 GBP",
  CNY: "人民幣 CNY",
  HKD: "港幣 HKD",
  SGD: "新加坡幣 SGD"
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

const today = getTaipeiTodayIso();
const nextYearDate = addMonthsToIsoDate(today, 12);
const localUserId = "local-user";
const chartPalette = ["#059669", "#0284c7", "#d97706", "#7c3aed", "#dc2626", "#0f766e", "#be123c", "#4f46e5"];
const legacyLedgerId = "legacy-personal";

function mapLedgerForUi(ledger: PersistedLedgerBook, currentUserId: string): LedgerBook {
  return {
    id: ledger.id,
    name: ledger.name,
    owner: ledger.ownerUserId === currentUserId ? "自己" : "共用帳本",
    purpose: ledger.purpose,
    color: ledger.color,
    currency: ledger.currency,
    note: ledger.note ?? "",
    isShared: ledger.isShared,
    createdAt: ledger.createdAt,
    updatedAt: ledger.updatedAt
  };
}

function mapInvitationForUi(invitation: PersistedLedgerInvitation): LedgerInvitation {
  const target = invitation.inviteeEmail ?? invitation.inviteeMemberCode ?? "";
  return {
    id: invitation.id,
    ledgerId: invitation.ledgerId,
    target,
    method: invitation.inviteeEmail ? "email" : "member_code",
    role: invitation.role,
    status: invitation.status,
    createdAt: invitation.createdAt
  };
}

function isPersistedLedgerId(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export default function App() {
  const [activeLedgerId, setActiveLedgerId] = useState<string | null>(null);
  const [ledgerBooks, setLedgerBooks] = useState<LedgerBook[]>([]);
  const [ledgerInvitations, setLedgerInvitations] = useState<LedgerInvitation[]>([]);
  const [ledgerSnapshots, setLedgerSnapshots] = useState<Record<string, FinanceSnapshot>>({});
  const [allLedgerNotificationData, setAllLedgerNotificationData] = useState<Awaited<ReturnType<typeof loadAllLedgerNotificationData>>>([]);
  const [ledgerHomeView, setLedgerHomeView] = useState<"ledgers" | "users">("ledgers");
  const [ledgerTransitioning, setLedgerTransitioning] = useState(false);
  const [page, setPage] = useState<Page>(getInitialPage);
  const [transactionPreset, setTransactionPreset] = useState<TransactionPreset | null>(null);
  const [month, setMonth] = useState(currentTaipeiMonth());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("all");
  const [periodYear, setPeriodYear] = useState(currentTaipeiMonth().slice(0, 4));
  const [rangeStart, setRangeStart] = useState(`${currentTaipeiMonth()}-01`);
  const [rangeEnd, setRangeEnd] = useState(getTaipeiTodayIso());
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const savedTheme = window.localStorage.getItem("ez2savemore-theme");
      if (savedTheme === "dark") return true;
      if (savedTheme === "light") return false;
    } catch {
      // Use the device preference when browser storage is unavailable.
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [toast, setToast] = useState<Toast>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const notificationAreaRef = useRef<HTMLDivElement>(null);
  const [accounts, setAccounts] = useState(emptyFinanceData.accounts);
  const [transactions, setTransactions] = useState(emptyFinanceData.transactions);
  const [creditCards, setCreditCards] = useState(emptyFinanceData.creditCards);
  const [creditCardInstallments, setCreditCardInstallments] = useState(emptyFinanceData.creditCardInstallments);
  const [loans, setLoans] = useState(emptyFinanceData.loans);
  const [deposits, setDeposits] = useState(emptyFinanceData.deposits);
  const [budgets, setBudgets] = useState(emptyFinanceData.budgets);
  const [reminders, setReminders] = useState(emptyFinanceData.reminders);
  const [insurancePolicies, setInsurancePolicies] = useState<InsurancePolicy[]>([]);
  const [investmentCategories, setInvestmentCategories] = useState<InvestmentCategory[]>([]);
  const [investmentAssets, setInvestmentAssets] = useState<InvestmentAsset[]>([]);
  const [financialPlans, setFinancialPlans] = useState<FinancialPlan[]>([]);
  const [recurringIncomes, setRecurringIncomes] = useState<RecurringIncome[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreference[]>([]);
  const [rememberedCategories, setRememberedCategories] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataNotice, setDataNotice] = useState("");
  const [supabaseCheck, setSupabaseCheck] = useState<Awaited<ReturnType<typeof checkSupabaseConnection>> | null>(null);
  const [supabaseChecking, setSupabaseChecking] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof parseTransactionsCsv>>([]);
  const [aiReport, setAiReport] = useState<AiFinancialReport | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem("ez2savemore-theme", darkMode ? "dark" : "light");
    } catch {
      // Theme persistence is optional.
    }
  }, [darkMode]);
  const [aiLoading, setAiLoading] = useState(false);
  const refreshFinanceDataRef = useRef<() => Promise<void>>(async () => undefined);
  const loadedSessionUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    void refreshFinanceDataRef.current();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        loadedSessionUserIdRef.current = null;
        setSessionEmail(null);
        setCurrentProfile(null);
        setActiveLedgerId(null);
        return;
      }
      if (!session) return;
      setSessionEmail(session.user.email ?? null);
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        const userId = session.user.id;
        window.setTimeout(() => {
          if (loadedSessionUserIdRef.current !== userId) void refreshFinanceDataRef.current();
        }, 0);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!notificationOpen) return;
    const closeOnOutsideInteraction = (event: PointerEvent) => {
      if (!notificationAreaRef.current?.contains(event.target as Node)) setNotificationOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationOpen]);

  function captureCurrentSnapshot(): FinanceSnapshot {
    return {
      accounts,
      transactions,
      creditCards,
      creditCardInstallments,
      loans,
      deposits,
      budgets,
      reminders,
      rememberedCategories,
      insurancePolicies,
      investmentCategories,
      investmentAssets,
      financialPlans,
      recurringIncomes,
      notificationPreferences
    };
  }

  function applySnapshot(snapshot: FinanceSnapshot) {
    setAccounts(snapshot.accounts);
    setTransactions(snapshot.transactions);
    setCreditCards(snapshot.creditCards);
    setCreditCardInstallments(snapshot.creditCardInstallments);
    setLoans(snapshot.loans);
    setDeposits(snapshot.deposits);
    setBudgets(snapshot.budgets);
    setReminders(snapshot.reminders);
    setRememberedCategories(snapshot.rememberedCategories);
    setInsurancePolicies(snapshot.insurancePolicies);
    setInvestmentCategories(snapshot.investmentCategories);
    setInvestmentAssets(snapshot.investmentAssets);
    setFinancialPlans(snapshot.financialPlans);
    setRecurringIncomes(snapshot.recurringIncomes);
    setNotificationPreferences(snapshot.notificationPreferences);
    setAiReport(null);
    setCsvPreview([]);
  }

  function createFinanceSnapshot(data: FinanceData): FinanceSnapshot {
    return {
      accounts: data.accounts,
      transactions: data.transactions,
      creditCards: data.creditCards,
      creditCardInstallments: data.creditCardInstallments,
      loans: data.loans,
      deposits: data.deposits,
      budgets: data.budgets,
      reminders: data.reminders,
      rememberedCategories: data.categories,
      insurancePolicies: data.insurancePolicies,
      investmentCategories: data.investmentCategories,
      investmentAssets: data.investmentAssets,
      financialPlans: data.financialPlans,
      recurringIncomes: data.recurringIncomes,
      notificationPreferences: data.notificationPreferences
    };
  }

  async function reloadCurrentLedgerData() {
    if (!activePersistedLedgerId) return;
    const result = await loadFinanceData(activePersistedLedgerId);
    const snapshot = createFinanceSnapshot(result.data);
    applySnapshot(snapshot);
    setLedgerSnapshots((current) => ({ ...current, [activePersistedLedgerId]: snapshot }));
  }

  async function refreshFinanceData() {
    setDataLoading(true);
    try {
      let result = await loadFinanceData();
      loadedSessionUserIdRef.current = result.session?.user.id ?? null;
      const userId = result.session?.user.id ?? localUserId;
      let nextLedgerBooks: LedgerBook[] = [];
      let nextInvitations: LedgerInvitation[] = [];

      if (result.session) {
        try {
          const [persistedLedgers, persistedInvitations, notificationData] = await Promise.all([loadLedgerBooks(), loadLedgerInvitations(), loadAllLedgerNotificationData()]);
          nextLedgerBooks = persistedLedgers.map((ledger) => mapLedgerForUi(ledger, userId));
          nextInvitations = persistedInvitations.map(mapInvitationForUi);
          setAllLedgerNotificationData(notificationData);
        } catch {
          nextLedgerBooks = [];
          setAllLedgerNotificationData([]);
        }
        if (nextLedgerBooks.length === 0) {
          nextLedgerBooks = [{
            id: legacyLedgerId,
            name: "我的帳本",
            owner: "自己",
            purpose: "personal",
            color: "emerald",
            currency: "TWD",
            note: "",
            isShared: false,
            createdAt: result.profile?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }];
        }
      }

      const selectedLedgerId = nextLedgerBooks.some((ledger) => ledger.id === activeLedgerId)
        ? activeLedgerId
        : nextLedgerBooks[0]?.id ?? null;
      if (isPersistedLedgerId(selectedLedgerId)) {
        result = await loadFinanceData(selectedLedgerId);
      }

      const personalSnapshot: FinanceSnapshot = {
        accounts: result.data.accounts,
        transactions: result.data.transactions,
        creditCards: result.data.creditCards,
        creditCardInstallments: result.data.creditCardInstallments,
        loans: result.data.loans,
        deposits: result.data.deposits,
        budgets: result.data.budgets,
        reminders: result.data.reminders,
        rememberedCategories: result.data.categories,
        insurancePolicies: result.data.insurancePolicies,
        investmentCategories: result.data.investmentCategories,
        investmentAssets: result.data.investmentAssets,
        financialPlans: result.data.financialPlans,
        recurringIncomes: result.data.recurringIncomes,
        notificationPreferences: result.data.notificationPreferences
      };
      setLedgerBooks(nextLedgerBooks);
      setLedgerInvitations(nextInvitations);
      setLedgerSnapshots(selectedLedgerId ? { [selectedLedgerId]: personalSnapshot } : {});
      setActiveLedgerId(selectedLedgerId);
      applySnapshot(personalSnapshot);
      setCurrentProfile(result.profile);
      setSessionEmail(result.session?.user.email ?? null);
      if (result.session) {
        setSupabaseChecking(true);
        try {
          setSupabaseCheck(await checkSupabaseConnection());
        } catch {
          setSupabaseCheck({ ok: false, status: "schema_error", message: "雲端資料無法連線", details: [] });
        } finally {
          setSupabaseChecking(false);
        }
      } else {
        setSupabaseCheck(null);
      }
      setDataNotice(
        !isSupabaseConfigured
          ? "雲端資料尚未完成設定，目前顯示空白帳本。"
          : result.session
            ? ""
            : "登入或註冊後，即可讀取你已儲存的個人理財資料。"
      );
    } catch (error) {
      setDataNotice(error instanceof Error ? error.message : "資料讀取失敗");
      setCurrentProfile(null);
      setSupabaseCheck({ ok: false, status: "schema_error", message: "雲端資料無法連線", details: [] });
    } finally {
      setDataLoading(false);
    }
  }

  refreshFinanceDataRef.current = refreshFinanceData;

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

  async function savePersonalProfile(displayName: string) {
    try {
      const profile = await updateOwnProfile({ displayName });
      setCurrentProfile(profile);
      notify("success", "個人設定已儲存");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "個人設定儲存失敗");
    }
  }

  async function savePassword(password: string, confirmation: string) {
    if (password !== confirmation) return notify("error", "兩次輸入的密碼不一致");
    try {
      await updateOwnPassword(password);
      notify("success", "密碼已更新");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "密碼更新失敗");
    }
  }

  async function runSupabaseConnectionCheck() {
    setSupabaseChecking(true);
    try {
      const result = await checkSupabaseConnection();
      setSupabaseCheck(result);
      notify(result.ok ? "success" : "error", result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "雲端資料檢查失敗";
      setSupabaseCheck({
        ok: false,
        status: "schema_error",
        message,
        details: ["請確認登入狀態與雲端資料設定"]
      });
      notify("error", message);
    } finally {
      setSupabaseChecking(false);
    }
  }

  const period = useMemo<DatePeriod>(() => {
    if (periodMode === "all") {
      return { mode: periodMode, startDate: "0001-01-01", endDate: "9999-12-31", label: "全部" };
    }
    if (periodMode === "three_months" || periodMode === "six_months") {
      const [year, monthNumber] = month.split("-").map(Number);
      const periodMonths = periodMode === "three_months" ? 3 : 6;
      const start = new Date(year, monthNumber - periodMonths, 1);
      const endDay = new Date(year, monthNumber, 0).getDate();
      return {
        mode: periodMode,
        startDate: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`,
        endDate: `${month}-${String(endDay).padStart(2, "0")}`,
        label: periodMonths === 3 ? "近三個月" : "近半年"
      };
    }
    if (periodMode === "year") {
      return { mode: periodMode, startDate: `${periodYear}-01-01`, endDate: `${periodYear}-12-31`, label: `${periodYear} 年` };
    }
    if (periodMode === "range") {
      const startDate = rangeStart || `${month}-01`;
      const endDate = rangeEnd && rangeEnd >= startDate ? rangeEnd : startDate;
      return { mode: periodMode, startDate, endDate, label: `${formatDate(startDate)} - ${formatDate(endDate)}` };
    }
    const [year, monthNumber] = month.split("-").map(Number);
    const endDay = new Date(year, monthNumber, 0).getDate();
    return { mode: periodMode, startDate: `${month}-01`, endDate: `${month}-${String(endDay).padStart(2, "0")}`, label: month.replace("-", "/") };
  }, [month, periodMode, periodYear, rangeEnd, rangeStart]);

  const periodTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.date >= period.startDate && transaction.date <= period.endDate),
    [period, transactions]
  );

  const recentNecessaryAverage = useMemo(() => {
    const months = getRecentMonthKeys(period.mode === "all" ? month : period.endDate.slice(0, 7), 3);
    const total = transactions
      .filter((transaction) => months.some((candidate) => transaction.date.startsWith(candidate)))
      .filter((transaction) => transaction.isNecessary && ["expense", "credit_card_purchase", "loan_payment"].includes(transaction.type))
      .reduce((sum, transaction) => sum + transaction.amountCents, 0);
    return Math.round(total / Math.max(months.length, 1));
  }, [month, period.endDate, period.mode, transactions]);

  const creditCardsForSummary = useMemo(
    () =>
      creditCards.map((card) => ({
        ...card,
        installmentBalanceCents: summarizeCreditCardLimit(card, creditCardInstallments).installmentOccupancyCents
      })),
    [creditCardInstallments, creditCards]
  );

  const dashboard = useMemo(
    () =>
      summarizeDashboard({
        accounts,
        creditCards: creditCardsForSummary,
        creditCardInstallments,
        loans,
        deposits,
        investmentAssets,
        transactions,
        month,
        dateRange: period,
        averageNecessaryExpenseCents: recentNecessaryAverage
      }),
    [accounts, creditCardInstallments, creditCardsForSummary, deposits, investmentAssets, loans, month, period, recentNecessaryAverage, transactions]
  );

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    periodTransactions
      .filter((transaction) => transaction.type === "expense" || transaction.type === "credit_card_purchase")
      .forEach((transaction) => map.set(transaction.category, (map.get(transaction.category) ?? 0) + transaction.amountCents));
    return [...map.entries()].map(([category, amountCents]) => ({ category, amountCents })).sort((a, b) => b.amountCents - a.amountCents);
  }, [periodTransactions]);

  const monthlyTrend = useMemo(() => {
    const months = period.mode === "all"
      ? [...new Set(transactions.map((transaction) => transaction.date.slice(0, 7)).filter((value) => /^\d{4}-\d{2}$/.test(value)))].sort().slice(-24)
      : getMonthsInPeriod(period, month);
    const visibleMonths = months.length > 0 ? months : getRecentMonthKeys(month, 6).reverse();
    return visibleMonths.map((candidate) => {
      const items = transactions.filter((transaction) => transaction.date.startsWith(candidate));
      return {
        month: candidate,
        incomeCents: items.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amountCents, 0),
        expenseCents: items
          .filter((item) => item.type === "expense" || item.type === "credit_card_purchase")
          .reduce((sum, item) => sum + item.amountCents, 0)
      };
    });
  }, [month, period, transactions]);

  const activeLedger = ledgerBooks.find((ledger) => ledger.id === activeLedgerId) ?? null;
  const activePersistedLedgerId = isPersistedLedgerId(activeLedgerId) ? activeLedgerId : undefined;
  setDefaultMoneyCurrency(activeLedger?.currency ?? "TWD");

  const financeNotifications = useMemo(
    () =>
      buildFinanceNotifications({
        month,
        reminders,
        creditCards,
        installments: creditCardInstallments,
        loans,
        deposits,
        insurancePolicies,
        preferences: notificationPreferences,
        ledgerId: activeLedgerId ?? undefined,
        ledgerName: activeLedger?.name
      }),
    [activeLedger?.name, activeLedgerId, creditCardInstallments, creditCards, deposits, insurancePolicies, loans, month, notificationPreferences, reminders]
  );

  const allFinanceNotifications = useMemo(
    () =>
      allLedgerNotificationData
        .flatMap((data) => buildFinanceNotifications({
          month,
          reminders: data.reminders,
          creditCards: data.creditCards,
          installments: data.installments,
          loans: data.loans,
          deposits: data.deposits,
          insurancePolicies: data.insurancePolicies,
          preferences: data.preferences,
          ledgerId: data.ledgerId,
          ledgerName: ledgerBooks.find((ledger) => ledger.id === data.ledgerId)?.name
        }))
        .sort((a, b) => getNotificationSortWeight(a.status) - getNotificationSortWeight(b.status) || a.date.localeCompare(b.date)),
    [allLedgerNotificationData, ledgerBooks, month]
  );

  useEffect(() => {
    const repeating = financeNotifications.filter((item) => item.deliveryMode === "repeat" && item.status !== "scheduled");
    if (repeating.length === 0) return;
    const intervalHours = Math.min(...repeating.map((item) => Math.max(1, item.repeatHours)));
    const timer = window.setInterval(() => {
      setToast({ type: "error", message: "提醒：" + repeating[0].title });
    }, intervalHours * 3_600_000);
    return () => window.clearInterval(timer);
  }, [financeNotifications]);

  const rootClass = darkMode ? "dark min-h-screen" : "min-h-screen";
  const isPlatformAdmin = Boolean(currentProfile?.isSuperAdmin && currentProfile.role === "super_admin");
  const visibleNavGroups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => item.page !== "users") }));
  const visibleNavItems = visibleNavGroups.flatMap((group) => group.items);

  function notify(type: ToastType, message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2800);
  }

  function startLedgerTransition() {
    setLedgerTransitioning(true);
    window.setTimeout(() => setLedgerTransitioning(false), 560);
  }

  async function openLedger(ledgerId: string, forceReload = false) {
    if (activeLedgerId === ledgerId && !forceReload) return;
    if (activeLedgerId) {
      setLedgerSnapshots((current) => ({ ...current, [activeLedgerId]: captureCurrentSnapshot() }));
    }
    setDataLoading(true);
    try {
      const result = await loadFinanceData(isPersistedLedgerId(ledgerId) ? ledgerId : undefined);
      const nextSnapshot: FinanceSnapshot = {
        accounts: result.data.accounts,
        transactions: result.data.transactions,
        creditCards: result.data.creditCards,
        creditCardInstallments: result.data.creditCardInstallments,
        loans: result.data.loans,
        deposits: result.data.deposits,
        budgets: result.data.budgets,
        reminders: result.data.reminders,
        rememberedCategories: result.data.categories,
        insurancePolicies: result.data.insurancePolicies,
        investmentCategories: result.data.investmentCategories,
        investmentAssets: result.data.investmentAssets,
        financialPlans: result.data.financialPlans,
        recurringIncomes: result.data.recurringIncomes,
        notificationPreferences: result.data.notificationPreferences
      };
      applySnapshot(nextSnapshot);
      setLedgerSnapshots((current) => ({ ...current, [ledgerId]: nextSnapshot }));
      setActiveLedgerId(ledgerId);
      setLedgerHomeView("ledgers");
      setPage("dashboard");
      startLedgerTransition();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "帳本資料讀取失敗");
    } finally {
      setDataLoading(false);
    }
  }

  async function createLedger(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return notify("error", "請輸入帳本名稱");
    if (!currentProfile?.userId) return notify("error", "請先登入再建立帳本");
    try {
      const saved = await createLedgerBook({
        userId: currentProfile.userId,
        ownerUserId: currentProfile.userId,
        name,
        purpose: String(formData.get("purpose") ?? "custom") as PersistedLedgerBook["purpose"],
        color: String(formData.get("color") ?? "emerald") as PersistedLedgerBook["color"],
        currency: String(formData.get("currency") ?? "TWD") as CurrencyCode,
        note: String(formData.get("note") ?? "").trim() || undefined,
        isDefault: false,
        isShared: formData.get("isShared") === "on"
      });
      const ledger = mapLedgerForUi(saved, currentProfile.userId);
      setLedgerBooks((current) => [...current.filter((item) => item.id !== legacyLedgerId), ledger]);
      notify("success", "帳本已建立");
      await openLedger(ledger.id);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "帳本建立失敗");
    }
  }

  async function updateLedger(ledgerId: string, formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return notify("error", "請輸入帳本名稱");
    const current = ledgerBooks.find((ledger) => ledger.id === ledgerId);
    if (!currentProfile?.userId || !current || !isPersistedLedgerId(ledgerId)) return notify("error", "此帳本尚未完成雲端設定");
    try {
      const nextCurrency = String(formData.get("currency") ?? current.currency) as CurrencyCode;
      const currencyChanged = nextCurrency !== current.currency;
      if (currencyChanged) {
        const conversionRate = Number(formData.get("conversionRate"));
        if (!Number.isFinite(conversionRate) || conversionRate <= 0) {
          return notify("error", `請輸入 1 ${current.currency} 可換算多少 ${nextCurrency}`);
        }
        if (!window.confirm(`確定將「${current.name}」從 ${current.currency} 轉換為 ${nextCurrency}？所有帳務金額會依匯率 ${conversionRate} 換算並留下紀錄。`)) return;
        await convertLedgerCurrency(ledgerId, nextCurrency, conversionRate);
      }
      const saved = await updateLedgerBook({
        id: current.id,
        userId: currentProfile.userId,
        ownerUserId: current.owner === "自己" ? currentProfile.userId : "",
        name,
        purpose: String(formData.get("purpose") ?? current.purpose) as PersistedLedgerBook["purpose"],
        color: String(formData.get("color") ?? current.color) as PersistedLedgerBook["color"],
        currency: nextCurrency,
        note: String(formData.get("note") ?? "").trim() || undefined,
        isDefault: false,
        isShared: current.isShared,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt
      });
      const ledger = mapLedgerForUi(saved, currentProfile.userId);
      setLedgerBooks((items) => items.map((item) => item.id === ledgerId ? ledger : item));
      if (currencyChanged && activeLedgerId === ledgerId) await openLedger(ledgerId, true);
      notify("success", "帳本已更新");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "帳本更新失敗");
    }
  }

  async function deleteLedger(ledgerId: string) {
    if (ledgerBooks.length <= 1) return notify("error", "至少需要保留一本帳本");
    const ledger = ledgerBooks.find((candidate) => candidate.id === ledgerId);
    if (!window.confirm(`確定刪除「${ledger?.name ?? "此帳本"}」？刪除後無法復原。`)) return;
    try {
      if (!isPersistedLedgerId(ledgerId)) return notify("error", "此帳本尚未完成雲端設定");
      await deleteLedgerBook(ledgerId);
      setLedgerBooks((current) => current.filter((candidate) => candidate.id !== ledgerId));
    setLedgerSnapshots((current) => {
      const next = { ...current };
      delete next[ledgerId];
      return next;
    });
    setLedgerInvitations((current) => current.filter((invite) => invite.ledgerId !== ledgerId));
    if (activeLedgerId === ledgerId) {
      setActiveLedgerId(null);
    }
      notify("success", "帳本已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "帳本刪除失敗");
    }
  }

  async function toggleLedgerSharing(ledgerId: string, enabled: boolean) {
    const current = ledgerBooks.find((ledger) => ledger.id === ledgerId);
    if (!currentProfile?.userId || !current || !isPersistedLedgerId(ledgerId)) return notify("error", "此帳本尚未完成雲端設定");
    try {
      const saved = await updateLedgerBook({
        id: current.id,
        userId: currentProfile.userId,
        ownerUserId: current.owner === "自己" ? currentProfile.userId : "",
        name: current.name,
        purpose: current.purpose,
        color: current.color,
        currency: current.currency,
        note: current.note || undefined,
        isDefault: false,
        isShared: enabled,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt
      });
      const ledger = mapLedgerForUi(saved, currentProfile.userId);
      setLedgerBooks((items) => items.map((item) => item.id === ledgerId ? ledger : item));
      notify("success", enabled ? "帳本共用已開啟" : "帳本共用已關閉");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "帳本共用設定失敗");
    }
  }

  async function inviteLedgerMember(ledgerId: string, formData: FormData) {
    const ledger = ledgerBooks.find((candidate) => candidate.id === ledgerId);
    if (!ledger?.isShared) return notify("error", "請先開啟帳本共用功能");
    const method = String(formData.get("method") ?? "email") as LedgerInvitation["method"];
    const target = String(formData.get("target") ?? "").trim();
    if (!target) return notify("error", "請輸入會員編號或電子信箱");
    if (method === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return notify("error", "電子信箱格式不正確");
    if (method === "member_code" && !/^M[0-9A-Z]{6,16}$/i.test(target)) return notify("error", "會員編號格式需為 M 開頭的 6-16 碼英數字");
    if (!isPersistedLedgerId(ledgerId)) return notify("error", "此帳本尚未完成雲端設定");
    try {
      const saved = await createLedgerInvitation({
        ledgerId,
        inviteeEmail: method === "email" ? target.toLowerCase() : undefined,
        inviteeMemberCode: method === "member_code" ? target.toUpperCase() : undefined,
        role: String(formData.get("role") ?? "viewer") as PersistedLedgerInvitation["role"],
        status: "pending",
        expiresAt: ""
      });
      setLedgerInvitations((current) => [mapInvitationForUi(saved), ...current]);
      notify("success", "邀請已建立");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "帳本邀請建立失敗");
    }
  }

  function returnToLedgerHome() {
    if (activeLedgerId) {
      setLedgerSnapshots((current) => ({ ...current, [activeLedgerId]: captureCurrentSnapshot() }));
    }
    setActiveLedgerId(null);
    setLedgerHomeView("ledgers");
    setNotificationOpen(false);
    setMobileMoreOpen(false);
    startLedgerTransition();
  }

  function navigateToPage(nextPage: Page) {
    if (nextPage === "users") return openUserManagement();
    setMobileMoreOpen(false);
    setNotificationOpen(false);
    if (nextPage === page) return;
    const update = () => setPage(nextPage);
    const transition = (document as ViewTransitionDocument).startViewTransition;
    if (transition) {
      transition.call(document, update);
    } else {
      update();
    }
  }

  function openNotification(item: FinanceNotification) {
    const destination: Record<FinanceNotification["source"], Page> = {
      credit_card: "cards",
      installment: "cards",
      loan: "loans",
      reminder: "reminders",
      deposit: "deposits",
      insurance: "insurance"
    };
    setNotificationOpen(false);
    navigateToPage(destination[item.source]);
  }

  function openUserManagement() {
    if (!isPlatformAdmin) return notify("error", "你沒有用戶管理權限");
    if (activeLedgerId) {
      setLedgerSnapshots((current) => ({ ...current, [activeLedgerId]: captureCurrentSnapshot() }));
    }
    setActiveLedgerId(null);
    setLedgerHomeView("users");
    setNotificationOpen(false);
    startLedgerTransition();
  }

  async function openGlobalNotification(item: FinanceNotification) {
    if (item.ledgerId && item.ledgerId !== activeLedgerId) await openLedger(item.ledgerId);
    openNotification(item);
  }

  async function addAccount(formData: FormData) {
    const balanceCents = parseMoneyToCents(String(formData.get("balance") ?? ""));
    const accountName = String(formData.get("name") ?? "").trim();
    const validation = combineValidations(validateNonNegativeAmount(balanceCents, "目前餘額"));
    if (!validation.valid) return notify("error", validation.errors[0]);
    if (!accountName) return notify("error", "請輸入帳戶名稱");
    if (accounts.some((item) => item.name.trim().toLowerCase() === accountName.toLowerCase())) return notify("error", "相同名稱的帳戶已存在");
    const now = new Date().toISOString();
    const account: FinancialAccount = {
      id: crypto.randomUUID(),
      userId: localUserId,
      name: accountName,
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
      const saved = await createFinancialAccount(account, activePersistedLedgerId);
      setAccounts((current) => [saved, ...current]);
      notify("success", isSupabaseConfigured ? "帳戶已儲存" : "帳戶已新增");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "帳戶儲存失敗");
    }
  }

  async function saveAccount(account: FinancialAccount) {
    try {
      const saved = await updateFinancialAccount(account);
      setAccounts((current) => current.map((item) => item.id === saved.id ? saved : item));
      notify("success", "帳戶已更新");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "帳戶更新失敗");
    }
  }

  async function removeAccount(account: FinancialAccount) {
    if (account.balanceCents !== 0) {
      notify("error", "請先將帳戶餘額轉出或調整為 0，再刪除帳戶");
      return;
    }
    if (!window.confirm(`確定刪除「${account.name}」？既有交易不會被刪除。`)) return;
    try {
      await deleteFinancialAccount(account.id);
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      notify("success", "帳戶已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "帳戶刪除失敗");
    }
  }

  async function saveCard(card: CreditCard) {
    try {
      const saved = await updateCreditCard(card);
      setCreditCards((current) => current.map((item) => item.id === saved.id ? saved : item));
      notify("success", "信用卡已更新");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "信用卡更新失敗");
    }
  }

  async function addCard(card: CreditCard) {
    if (creditCards.some((item) => item.issuer.trim().toLowerCase() === card.issuer.trim().toLowerCase() && item.last4 === card.last4)) {
      return notify("error", "相同銀行與末四碼的信用卡已存在");
    }
    try {
      const saved = await createCreditCard(card, activePersistedLedgerId);
      setCreditCards((current) => [saved, ...current]);
      notify("success", "信用卡已新增");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "信用卡儲存失敗");
    }
  }

  async function addCardInstallment(installment: CreditCardInstallment) {
    const duplicate = creditCardInstallments.some((item) =>
      item.creditCardId === installment.creditCardId
      && item.totalAmountCents === installment.totalAmountCents
      && item.startedOn === installment.startedOn
      && (item.merchant ?? "").trim().toLowerCase() === (installment.merchant ?? "").trim().toLowerCase()
    );
    if (duplicate) return notify("error", "相同信用卡、項目、總額與開始日的分期已存在");
    try {
      const saved = await createCreditCardInstallment(installment, activePersistedLedgerId);
      setCreditCardInstallments((current) => [saved, ...current]);
      notify("success", "既有分期已匯入");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "信用卡分期儲存失敗");
    }
  }

  async function removeCard(card: CreditCard) {
    const cardSummary = summarizeCreditCardLimit(card, creditCardInstallments);
    if (cardSummary.usedCreditCents > 0 || cardSummary.installmentDebtCents > 0) {
      notify("error", "請先繳清信用卡帳款與分期，再刪除信用卡");
      return;
    }
    if (!window.confirm(`確定刪除「${card.name}」？既有消費與分期記錄不會被刪除。`)) return;
    try {
      await deleteCreditCard(card.id);
      setCreditCards((current) => current.filter((item) => item.id !== card.id));
      notify("success", "信用卡已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "信用卡刪除失敗");
    }
  }

  async function saveLoan(loan: Loan) {
    try {
      const saved = await updateLoan(loan);
      setLoans((current) => current.map((item) => item.id === saved.id ? saved : item));
      notify("success", loan.status === "paid_off" ? "貸款已結清，提醒已停止" : "貸款已更新");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "貸款更新失敗");
    }
  }

  async function addLoan(loan: Loan) {
    if (loans.some((item) => item.name.trim().toLowerCase() === loan.name.trim().toLowerCase() && (item.institution ?? "").trim().toLowerCase() === (loan.institution ?? "").trim().toLowerCase())) {
      return notify("error", "相同名稱與金融機構的貸款已存在");
    }
    try {
      const saved = await createLoan(loan, activePersistedLedgerId);
      setLoans((current) => [saved, ...current]);
      notify("success", "貸款已新增");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "貸款儲存失敗");
    }
  }

  async function removeLoan(loan: Loan) {
    if (loan.remainingPrincipalCents > 0) {
      notify("error", "請先將剩餘本金結清，再刪除貸款");
      return;
    }
    if (!window.confirm(`確定刪除「${loan.name}」？既有還款記錄不會被刪除。`)) return;
    try {
      await deleteLoan(loan.id);
      setLoans((current) => current.filter((item) => item.id !== loan.id));
      notify("success", "貸款已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "貸款刪除失敗");
    }
  }

  async function addTransaction(formData: FormData) {
    const amountCents = parseMoneyToCents(String(formData.get("amount") ?? ""));
    const date = String(formData.get("date") ?? "");
    const validation = combineValidations(validatePositiveAmount(amountCents), validateDateRange(date));
    if (!validation.valid) return notify("error", validation.errors[0]);
    const now = new Date().toISOString();
    const requestedType = String(formData.get("type")) as Transaction["type"];
    const payment = resolveTransactionPayment(
      requestedType,
      String(formData.get("paymentMethod") || "account") as ExpensePaymentMethod,
      String(formData.get("accountId") ?? ""),
      String(formData.get("creditCardId") ?? ""),
      String(formData.get("loanId") ?? "")
    );
    if (payment.error) return notify("error", payment.error);
    const type = payment.type;
    const transferAccountId = ["transfer", "deposit_transfer"].includes(type)
      ? String(formData.get("transferAccountId") ?? "")
      : undefined;
    const investmentAssetId = ["investment_buy", "investment_sell"].includes(type)
      ? String(formData.get("investmentAssetId") ?? "")
      : undefined;
    const investmentQuantity = ["investment_buy", "investment_sell"].includes(type)
      ? Number(formData.get("investmentQuantity"))
      : undefined;
    const installmentIds = type === "credit_card_payment"
      ? formData.getAll("installmentIds").map(String).filter(Boolean)
      : [];
    const advanceLoanPeriod = type === "loan_payment" ? formData.get("advanceLoanPeriod") === "on" : undefined;
    if (transferAccountId && transferAccountId === payment.accountId) return notify("error", "轉出與轉入帳戶不可相同");
    if (["transfer", "deposit_transfer"].includes(type) && !transferAccountId) return notify("error", "請選擇轉入帳戶");
    if (["investment_buy", "investment_sell"].includes(type) && !investmentAssetId) return notify("error", "請選擇投資持倉");
    if (["investment_buy", "investment_sell"].includes(type) && (!Number.isFinite(investmentQuantity) || Number(investmentQuantity) <= 0)) {
      return notify("error", "投資買賣數量必須大於 0");
    }
    if (type === "investment_sell") {
      const asset = investmentAssets.find((candidate) => candidate.id === investmentAssetId);
      if (!asset || Number(investmentQuantity) > asset.quantity) return notify("error", "賣出數量不可大於目前持有數量");
    }
    if (type === "credit_card_payment") {
      const selectedInstallments = installmentIds.map((id) => creditCardInstallments.find((candidate) => candidate.id === id));
      if (selectedInstallments.some((installment) => !installment || installment.creditCardId !== payment.creditCardId || installment.status !== "active")) {
        return notify("error", "分期項目與所選信用卡不符，請重新選擇");
      }
      const installmentDueCents = selectedInstallments.reduce(
        (sum, installment) => sum + Math.min(installment?.monthlyPaymentCents ?? 0, installment?.remainingAmountCents ?? 0),
        0
      );
      if (installmentDueCents > amountCents) return notify("error", "勾選的分期應繳合計不可大於本次繳款金額");
    }
    if (["expense", "transfer", "deposit_transfer", "credit_card_payment", "loan_payment", "investment_buy"].includes(type)) {
      const sourceAccount = accounts.find((candidate) => candidate.id === payment.accountId);
      if (!sourceAccount) return notify("error", "找不到付款帳戶");
      if (sourceAccount.balanceCents < amountCents) return notify("error", "付款帳戶餘額不足");
    }
    const selectedLoan = payment.loanId ? loans.find((candidate) => candidate.id === payment.loanId) : undefined;
    const principalInput = String(formData.get("principalAmount") ?? "").trim();
    const explicitPrincipalCents = principalInput === "" ? undefined : parseMoneyToCents(principalInput);
    if (type === "loan_payment" && !selectedLoan) return notify("error", "找不到選擇的貸款");
    if (type === "loan_drawdown") {
      if (!selectedLoan || selectedLoan.type !== "reserve_credit") return notify("error", "請選擇有效的備用金");
      const availableCreditCents = Math.max(0, (selectedLoan.creditLimitCents ?? 0) - selectedLoan.remainingPrincipalCents);
      if (amountCents > availableCreditCents) return notify("error", "動用金額不可超過備用金可用額度");
    }
    if (type === "loan_payment" && explicitPrincipalCents !== undefined && (explicitPrincipalCents < 0 || explicitPrincipalCents > amountCents)) {
      return notify("error", "本期本金不可小於 0 或大於還款金額");
    }
    if (type === "loan_payment" && selectedLoan && explicitPrincipalCents !== undefined && explicitPrincipalCents > selectedLoan.remainingPrincipalCents) {
      return notify("error", "本期本金不可大於貸款剩餘本金");
    }
    const loanBreakdown = type === "loan_payment" && selectedLoan
      ? calculateLoanPaymentBreakdown(amountCents, selectedLoan.remainingPrincipalCents, selectedLoan.annualRate, explicitPrincipalCents)
      : undefined;
    const transaction: Transaction = {
      id: crypto.randomUUID(),
      userId: localUserId,
      date,
      type,
      amountCents,
      category: normalizeCategoryName(String(formData.get("category") || "未分類")),
      subcategory: String(formData.get("subcategory") ?? ""),
      accountId: payment.accountId,
      transferAccountId,
      creditCardId: payment.creditCardId,
      loanId: payment.loanId,
      investmentAssetId,
      merchant: String(formData.get("merchant") ?? ""),
      note: String(formData.get("note") ?? ""),
      isNecessary: formData.get("necessary") === "on",
      isRecurring: formData.get("recurring") === "on",
      tags: String(formData.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
      source: "manual",
      metadata: {
        ...(loanBreakdown ? {
          loan_principal_cents: loanBreakdown.principalCents,
          loan_interest_cents: loanBreakdown.interestCents
        } : {}),
        ...(investmentQuantity ? { investment_quantity: investmentQuantity } : {}),
        ...(installmentIds.length ? { credit_card_installment_ids: installmentIds } : {}),
        ...(advanceLoanPeriod !== undefined ? { advance_loan_period: advanceLoanPeriod } : {})
      },
      createdAt: now,
      updatedAt: now
    };
    let saved: Transaction;
    try {
      saved = await createTransactionWithCategory(transaction, activePersistedLedgerId);
      setTransactions((current) => [saved, ...current]);
      setRememberedCategories((current) => [...new Set([saved.category, ...current])].sort((a, b) => a.localeCompare(b, "zh-Hant")));
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "交易儲存失敗");
      return;
    }
    if (Number(saved.metadata?.ledger_effect_version) === 1) {
      try {
        await reloadCurrentLedgerData();
        notify("success", "交易已同步更新帳戶與總帳");
      } catch (error) {
        notify("error", error instanceof Error ? error.message : "交易已儲存，但重新整理失敗");
      }
      return;
    }
    try {
      if (type === "income" && saved.accountId) {
        const account = accounts.find((candidate) => candidate.id === saved.accountId);
        if (account) {
          const updatedAccount = await updateFinancialAccount({ ...account, balanceCents: account.balanceCents + amountCents });
          setAccounts((current) => current.map((candidate) => candidate.id === updatedAccount.id ? updatedAccount : candidate));
        }
      }
      if (type === "expense" && saved.accountId) {
        const account = accounts.find((candidate) => candidate.id === saved.accountId);
        if (account && account.balanceCents < amountCents) throw new Error("付款帳戶餘額不足");
        if (account) {
          const updatedAccount = await updateFinancialAccount({ ...account, balanceCents: account.balanceCents - amountCents });
          setAccounts((current) => current.map((candidate) => candidate.id === updatedAccount.id ? updatedAccount : candidate));
        }
      }
      if (["transfer", "deposit_transfer"].includes(type) && saved.accountId && saved.transferAccountId) {
        const source = accounts.find((candidate) => candidate.id === saved.accountId);
        const destination = accounts.find((candidate) => candidate.id === saved.transferAccountId);
        if (!source || !destination) throw new Error("找不到轉帳帳戶");
        if (source.balanceCents < amountCents) throw new Error("轉出帳戶餘額不足");
        const [updatedSource, updatedDestination] = await Promise.all([
          updateFinancialAccount({ ...source, balanceCents: source.balanceCents - amountCents }),
          updateFinancialAccount({ ...destination, balanceCents: destination.balanceCents + amountCents })
        ]);
        setAccounts((current) => current.map((candidate) => candidate.id === updatedSource.id ? updatedSource : candidate.id === updatedDestination.id ? updatedDestination : candidate));
      }
      if (type === "credit_card_purchase" && saved.creditCardId) {
        const card = creditCards.find((candidate) => candidate.id === saved.creditCardId);
        if (card) {
          const updatedCard = await updateCreditCard({ ...card, unbilledAmountCents: card.unbilledAmountCents + amountCents });
          setCreditCards((current) => current.map((candidate) => candidate.id === updatedCard.id ? updatedCard : candidate));
        }
      }
      if (type === "credit_card_payment" && saved.creditCardId) {
        const card = creditCards.find((candidate) => candidate.id === saved.creditCardId);
        const account = accounts.find((candidate) => candidate.id === saved.accountId);
        if (!saved.accountId) throw new Error("找不到信用卡繳款的扣款帳戶");
        await createCreditCardPaymentRecord({
          transactionId: saved.id,
          creditCardId: saved.creditCardId,
          accountId: saved.accountId,
          paidDate: saved.date,
          amountCents: saved.amountCents
        }, activePersistedLedgerId);
        const updates = await Promise.all([
          card ? updateCreditCard({ ...card, currentStatementAmountCents: Math.max(0, card.currentStatementAmountCents - amountCents) }) : Promise.resolve(null),
          account ? updateFinancialAccount({ ...account, balanceCents: Math.max(0, account.balanceCents - amountCents) }) : Promise.resolve(null)
        ]);
        const [updatedCard, updatedAccount] = updates;
        if (updatedCard) setCreditCards((current) => current.map((candidate) => candidate.id === updatedCard.id ? updatedCard : candidate));
        if (updatedAccount) setAccounts((current) => current.map((candidate) => candidate.id === updatedAccount.id ? updatedAccount : candidate));
      }
      if (type === "loan_payment" && saved.loanId && loanBreakdown) {
        const loan = loans.find((candidate) => candidate.id === saved.loanId);
        const account = accounts.find((candidate) => candidate.id === saved.accountId);
        if (!loan || !saved.accountId) throw new Error("找不到貸款或扣款帳戶");
        await createLoanPaymentRecord({
          transactionId: saved.id,
          loanId: saved.loanId,
          paidDate: saved.date,
          paymentCents: saved.amountCents,
          principalCents: loanBreakdown.principalCents,
          interestCents: loanBreakdown.interestCents
        }, activePersistedLedgerId);
        const remainingPrincipalCents = Math.max(0, loan.remainingPrincipalCents - loanBreakdown.principalCents);
        const [updatedLoan, updatedAccount] = await Promise.all([
          updateLoan({
            ...loan,
            remainingPrincipalCents,
            paidPeriods: Math.min(loan.termMonths, loan.paidPeriods + 1),
            paidAmountCents: loan.paidAmountCents + saved.amountCents,
            status: remainingPrincipalCents === 0 ? "paid_off" : loan.status
          }),
          account ? updateFinancialAccount({ ...account, balanceCents: Math.max(0, account.balanceCents - saved.amountCents) }) : Promise.resolve(null)
        ]);
        setLoans((current) => current.map((candidate) => candidate.id === updatedLoan.id ? updatedLoan : candidate));
        if (updatedAccount) setAccounts((current) => current.map((candidate) => candidate.id === updatedAccount.id ? updatedAccount : candidate));
      }
      notify("success", isSupabaseConfigured ? "交易與分類記憶已儲存" : "交易已新增");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "還款連動資料儲存失敗");
    }
  }

  async function addDeposit(deposit: Deposit) {
    try {
      const saved = await createDeposit(deposit, activePersistedLedgerId);
      setDeposits((current) => [saved, ...current]);
      notify("success", "存款已儲存");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "存款儲存失敗");
    }
  }

  async function saveDeposit(deposit: Deposit) {
    try {
      const saved = await updateDeposit(deposit);
      setDeposits((current) => current.map((item) => item.id === saved.id ? saved : item));
      notify("success", "存款資料已更新");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "存款更新失敗");
    }
  }

  async function removeDeposit(deposit: Deposit) {
    if (!window.confirm(`確定刪除「${deposit.name}」？`)) return;
    try {
      await deleteDeposit(deposit.id);
      setDeposits((current) => current.filter((item) => item.id !== deposit.id));
      notify("success", "存款已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "存款刪除失敗");
    }
  }

  async function addBudget(budget: Budget) {
    try {
      const existing = budgets.find((candidate) => candidate.month === budget.month && candidate.category === budget.category);
      const saved = existing
        ? await updateBudget({ ...budget, id: existing.id, createdAt: existing.createdAt })
        : await createBudget(budget, activePersistedLedgerId);
      setBudgets((current) => existing ? current.map((candidate) => candidate.id === saved.id ? saved : candidate) : [saved, ...current]);
      notify("success", existing ? "預算已更新" : "預算已儲存");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "預算儲存失敗");
    }
  }

  async function removeBudget(budget: Budget) {
    if (!window.confirm(`確定刪除「${budget.category || "全部"}」預算？`)) return;
    try {
      await deleteBudget(budget.id);
      setBudgets((current) => current.filter((item) => item.id !== budget.id));
      notify("success", "預算已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "預算刪除失敗");
    }
  }

  async function addReminder(reminder: FinancialReminder) {
    try {
      const saved = await createFinancialReminder(reminder, activePersistedLedgerId);
      setReminders((current) => [saved, ...current]);
      notify("success", "提醒已儲存");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "提醒儲存失敗");
    }
  }

  async function removeReminder(reminder: FinancialReminder) {
    if (!window.confirm(`確定刪除「${reminder.name}」提醒？`)) return;
    try {
      await deleteFinancialReminder(reminder.id);
      setReminders((current) => current.filter((item) => item.id !== reminder.id));
      notify("success", "提醒已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "提醒刪除失敗");
    }
  }

  async function saveLedgerNotificationPreferences(preferences: NotificationPreference[]) {
    try {
      const saved = await saveNotificationPreferences(preferences, activePersistedLedgerId);
      setNotificationPreferences(saved);
      if (activePersistedLedgerId) {
        setAllLedgerNotificationData((current) => current.map((item) => item.ledgerId === activePersistedLedgerId ? { ...item, preferences: saved } : item));
      }
      notify("success", "通知設定已儲存");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "通知設定儲存失敗");
    }
  }

  async function addInsurancePolicy(formData: FormData) {
    const annualPremiumCents = parseMoneyToCents(String(formData.get("annualPremium") ?? ""));
    const coverageAmountCents = parseMoneyToCents(String(formData.get("coverageAmount") ?? ""));
    const paidClaimAmountCents = parseMoneyToCents(String(formData.get("paidClaimAmount") ?? "0"));
    const pendingClaimAmountCents = parseMoneyToCents(String(formData.get("pendingClaimAmount") ?? "0"));
    const renewalDate = String(formData.get("renewalDate") ?? "");
    const paymentDay = Number(formData.get("paymentDay") ?? 1);
    const validation = combineValidations(
      validatePositiveAmount(annualPremiumCents, "年保費"),
      validatePositiveAmount(coverageAmountCents, "保障額度"),
      validateDateRange(renewalDate),
      validateIntegerRange(paymentDay, 1, 31, "繳費日")
    );
    if (!validation.valid) return notify("error", validation.errors[0]);
    if (paidClaimAmountCents < 0 || pendingClaimAmountCents < 0) return notify("error", "理賠金額不可為負數");
    const now = new Date().toISOString();
    const policy: InsurancePolicy = {
      id: crypto.randomUUID(),
      userId: localUserId,
      name: String(formData.get("name") ?? ""),
      type: String(formData.get("type") ?? "medical") as InsurancePolicy["type"],
      insurer: String(formData.get("insurer") ?? ""),
      policyNumberLast4: String(formData.get("policyNumberLast4") ?? "").slice(-4),
      insuredPerson: String(formData.get("insuredPerson") ?? ""),
      annualPremiumCents,
      coverageAmountCents,
      paidClaimAmountCents,
      pendingClaimAmountCents,
      paymentDay,
      renewalDate,
      beneficiary: String(formData.get("beneficiary") ?? ""),
      note: String(formData.get("note") ?? ""),
      status: String(formData.get("status") ?? "active") as InsurancePolicy["status"],
      createdAt: now,
      updatedAt: now
    };
    try {
      const saved = await createInsurancePolicy(policy, activePersistedLedgerId);
      setInsurancePolicies((current) => [saved, ...current]);
      notify("success", "保單已儲存");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "保單儲存失敗");
    }
  }

  async function removeInsurancePolicy(policy: InsurancePolicy) {
    if (!window.confirm(`確定刪除「${policy.name}」保單？`)) return;
    try {
      await deleteInsurancePolicy(policy.id);
      setInsurancePolicies((current) => current.filter((item) => item.id !== policy.id));
      notify("success", "保單已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "保單刪除失敗");
    }
  }

  async function addInvestmentCategory(category: InvestmentCategory) {
    try {
      const saved = await createInvestmentCategory(category, activePersistedLedgerId);
      setInvestmentCategories((current) => [saved, ...current]);
      notify("success", "投資分類已儲存");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "投資分類儲存失敗");
    }
  }

  async function removeInvestmentCategory(category: InvestmentCategory) {
    if (!window.confirm(`確定刪除「${category.name}」投資分類？`)) return;
    try {
      await deleteInvestmentCategory(category.id);
      setInvestmentCategories((current) => current.filter((item) => item.id !== category.id));
      notify("success", "投資分類已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "投資分類刪除失敗");
    }
  }

  async function addInvestmentAsset(asset: InvestmentAsset) {
    try {
      const saved = await createInvestmentAsset(asset, activePersistedLedgerId);
      setInvestmentAssets((current) => [saved, ...current]);
      notify("success", "投資持倉已儲存");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "投資持倉儲存失敗");
    }
  }

  async function saveInvestmentAsset(asset: InvestmentAsset) {
    try {
      const saved = await updateInvestmentAsset(asset);
      setInvestmentAssets((current) => current.map((item) => item.id === saved.id ? saved : item));
      notify("success", "投資持倉已更新");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "投資持倉更新失敗");
    }
  }

  async function removeInvestmentAsset(asset: InvestmentAsset) {
    if (asset.quantity > 0) {
      notify("error", "請先賣出或調整持有數量為 0，再刪除持倉");
      return;
    }
    if (!window.confirm(`確定刪除「${asset.name}」持倉？`)) return;
    try {
      await deleteInvestmentAsset(asset.id);
      setInvestmentAssets((current) => current.filter((item) => item.id !== asset.id));
      notify("success", "投資持倉已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "投資持倉刪除失敗");
    }
  }

  async function addFinancialPlan(plan: FinancialPlan) {
    try {
      const saved = await createFinancialPlan(plan, activePersistedLedgerId);
      setFinancialPlans((current) => [...current, saved]);
      notify("success", "財務計劃已儲存");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "財務計劃儲存失敗");
    }
  }

  async function saveFinancialPlan(plan: FinancialPlan) {
    try {
      const saved = await updateFinancialPlan(plan);
      setFinancialPlans((current) => current.map((item) => item.id === saved.id ? saved : item));
      notify("success", "財務計劃已更新");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "財務計劃更新失敗");
    }
  }

  async function removeFinancialPlan(plan: FinancialPlan) {
    if (!window.confirm(`確定刪除「${plan.name}」財務計劃？`)) return;
    try {
      await deleteFinancialPlan(plan.id);
      setFinancialPlans((current) => current.filter((item) => item.id !== plan.id));
      notify("success", "財務計劃已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "財務計劃刪除失敗");
    }
  }

  async function addRecurringIncome(income: RecurringIncome) {
    try {
      const saved = await createRecurringIncome(income, activePersistedLedgerId);
      setRecurringIncomes((current) => [...current, saved]);
      notify("success", "固定收入已儲存");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "固定收入儲存失敗");
    }
  }

  async function saveRecurringIncome(income: RecurringIncome) {
    try {
      const saved = await updateRecurringIncome(income);
      setRecurringIncomes((current) => current.map((item) => item.id === saved.id ? saved : item));
      notify("success", "固定收入已更新");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "固定收入更新失敗");
    }
  }

  async function removeRecurringIncome(income: RecurringIncome) {
    if (!window.confirm(`確定刪除「${income.name}」固定收入？`)) return;
    try {
      await deleteRecurringIncome(income.id);
      setRecurringIncomes((current) => current.filter((item) => item.id !== income.id));
      notify("success", "固定收入已刪除");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "固定收入刪除失敗");
    }
  }

  async function softDeleteTransaction(id: string) {
    if (!window.confirm("確定要刪除此交易？此操作需要二次確認。")) return;
    const transaction = transactions.find((item) => item.id === id);
    try {
      await deleteTransaction(id);
      if (Number(transaction?.metadata?.ledger_effect_version) === 1) {
        await reloadCurrentLedgerData();
        notify("success", "交易已刪除，相關餘額已同步還原");
        return;
      }
      setTransactions((current) => current.filter((transaction) => transaction.id !== id));
      if (transaction?.type === "income" && transaction.accountId) {
        const account = accounts.find((candidate) => candidate.id === transaction.accountId);
        if (account) {
          const updatedAccount = await updateFinancialAccount({ ...account, balanceCents: Math.max(0, account.balanceCents - transaction.amountCents) });
          setAccounts((current) => current.map((candidate) => candidate.id === updatedAccount.id ? updatedAccount : candidate));
        }
      }
      if (transaction?.type === "expense" && transaction.accountId) {
        const account = accounts.find((candidate) => candidate.id === transaction.accountId);
        if (account) {
          const updatedAccount = await updateFinancialAccount({ ...account, balanceCents: account.balanceCents + transaction.amountCents });
          setAccounts((current) => current.map((candidate) => candidate.id === updatedAccount.id ? updatedAccount : candidate));
        }
      }
      if (["transfer", "deposit_transfer"].includes(transaction?.type ?? "") && transaction?.accountId && transaction.transferAccountId) {
        const source = accounts.find((candidate) => candidate.id === transaction.accountId);
        const destination = accounts.find((candidate) => candidate.id === transaction.transferAccountId);
        if (source && destination && destination.balanceCents >= transaction.amountCents) {
          const [updatedSource, updatedDestination] = await Promise.all([
            updateFinancialAccount({ ...source, balanceCents: source.balanceCents + transaction.amountCents }),
            updateFinancialAccount({ ...destination, balanceCents: destination.balanceCents - transaction.amountCents })
          ]);
          setAccounts((current) => current.map((candidate) => candidate.id === updatedSource.id ? updatedSource : candidate.id === updatedDestination.id ? updatedDestination : candidate));
        }
      }
      if (transaction?.type === "credit_card_purchase" && transaction.creditCardId) {
        const card = creditCards.find((candidate) => candidate.id === transaction.creditCardId);
        if (card) {
          const updatedCard = await updateCreditCard({ ...card, unbilledAmountCents: Math.max(0, card.unbilledAmountCents - transaction.amountCents) });
          setCreditCards((current) => current.map((candidate) => candidate.id === updatedCard.id ? updatedCard : candidate));
        }
      }
      if (transaction?.type === "credit_card_payment" && transaction.creditCardId) {
        const card = creditCards.find((candidate) => candidate.id === transaction.creditCardId);
        const account = accounts.find((candidate) => candidate.id === transaction.accountId);
        const [updatedCard, updatedAccount] = await Promise.all([
          card ? updateCreditCard({ ...card, currentStatementAmountCents: card.currentStatementAmountCents + transaction.amountCents }) : Promise.resolve(null),
          account ? updateFinancialAccount({ ...account, balanceCents: account.balanceCents + transaction.amountCents }) : Promise.resolve(null)
        ]);
        if (updatedCard) setCreditCards((current) => current.map((candidate) => candidate.id === updatedCard.id ? updatedCard : candidate));
        if (updatedAccount) setAccounts((current) => current.map((candidate) => candidate.id === updatedAccount.id ? updatedAccount : candidate));
      }
      if (transaction?.type === "loan_payment" && transaction.loanId) {
        const loan = loans.find((candidate) => candidate.id === transaction.loanId);
        const account = accounts.find((candidate) => candidate.id === transaction.accountId);
        const storedPrincipal = Number(transaction.metadata?.loan_principal_cents ?? 0);
        const principalCents = Number.isFinite(storedPrincipal) ? Math.max(0, storedPrincipal) : 0;
        const [updatedLoan, updatedAccount] = await Promise.all([
          loan ? updateLoan({
            ...loan,
            remainingPrincipalCents: Math.min(loan.originalPrincipalCents, loan.remainingPrincipalCents + principalCents),
            paidPeriods: Math.max(0, loan.paidPeriods - 1),
            paidAmountCents: Math.max(0, loan.paidAmountCents - transaction.amountCents),
            status: "active"
          }) : Promise.resolve(null),
          account ? updateFinancialAccount({ ...account, balanceCents: account.balanceCents + transaction.amountCents }) : Promise.resolve(null)
        ]);
        if (updatedLoan) setLoans((current) => current.map((candidate) => candidate.id === updatedLoan.id ? updatedLoan : candidate));
        if (updatedAccount) setAccounts((current) => current.map((candidate) => candidate.id === updatedAccount.id ? updatedAccount : candidate));
      }
      if (transaction?.type === "credit_card_payment" || transaction?.type === "loan_payment") {
        await deleteLinkedPaymentRecords(transaction.id);
      }
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
        saved.push(await createTransactionWithCategory(transaction, activePersistedLedgerId));
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
      month,
      currency: activeLedger?.currency ?? "TWD"
    };
    setAiLoading(true);
    try {
      const report = import.meta.env.VITE_AI_CLIENT_MOCK === "false" ? await requestAiFinancialHealth(input) : mockAiFinancialHealth(input);
      setAiReport(report);
      notify("success", "AI 理財健檢已產生");
    } catch (error) {
      setAiReport(mockAiFinancialHealth(input));
      notify("error", error instanceof Error ? error.message : "AI 暫時無法使用，已顯示預設分析");
    } finally {
      setAiLoading(false);
    }
  }

  if (isSupabaseConfigured && !dataLoading && !sessionEmail) {
    return (
      <div className={`${rootClass} app-shell`}>
        <AuthPage
          onSignIn={handlePasswordSignIn}
          onSignUp={handlePasswordSignUp}
          onMagicLink={handleMagicLink}
          onToggleDarkMode={() => setDarkMode((value) => !value)}
        />
      </div>
    );
  }

  if (!activeLedgerId) {
    return (
      <div className={`${rootClass} app-shell`}>
        {ledgerTransitioning && <TransitionOverlay label="切換帳本中" />}
        <LedgerHomePage
          ledgerBooks={ledgerBooks}
          invitations={ledgerInvitations}
          snapshots={{ ...ledgerSnapshots, personal: ledgerSnapshots.personal ?? captureCurrentSnapshot() }}
          month={month}
          sessionEmail={sessionEmail}
          profile={currentProfile}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((value) => !value)}
          onOpenLedger={openLedger}
          onCreateLedger={createLedger}
          onUpdateLedger={updateLedger}
          onDeleteLedger={deleteLedger}
          onToggleSharing={toggleLedgerSharing}
          onInviteMember={inviteLedgerMember}
          onOpenUserManagement={openUserManagement}
          showUserManagement={ledgerHomeView === "users"}
          onCloseUserManagement={() => setLedgerHomeView("ledgers")}
          globalNotifications={allFinanceNotifications}
          onOpenNotification={openGlobalNotification}
          notify={notify}
        />
        {toast && <div className="fixed right-4 top-4 z-50 max-w-sm"><ToastBanner toast={toast} /></div>}
      </div>
    );
  }

  return (
    <div className={`${rootClass} app-shell`}>
      {ledgerTransitioning && <TransitionOverlay label={activeLedger ? `進入 ${activeLedger.name}` : "切換帳本中"} />}
      <div className="flex min-h-screen">
        <aside className="app-sidebar sticky top-0 hidden h-screen w-[272px] shrink-0 overflow-y-auto border-r border-slate-200/80 p-4 backdrop-blur dark:border-slate-800 lg:block">
          <Brand />
          {activeLedger && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950 dark:text-slate-50">{activeLedger.name}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{ledgerPurposeLabels[activeLedger.purpose]} · {activeLedger.owner}</p>
                </div>
                <BookOpen size={18} className="shrink-0 text-sky-600" />
              </div>
              <button className="btn-secondary mt-3 w-full" onClick={returnToLedgerHome}>
                <ArrowLeft size={16} />
                帳本首頁
              </button>
            </div>
          )}
          <nav className="mt-5 space-y-4">
            {visibleNavGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-1.5 px-2 text-[11px] font-bold tracking-[0.12em] text-slate-400 dark:text-slate-500">{group.title}</p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavButton key={item.page} item={item} active={page === item.page} onClick={() => navigateToPage(item.page)} />
                  ))}
                </div>
              </div>
            ))}
          </nav>
          {currentProfile && (
            <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{currentProfile.displayName || currentProfile.email}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{getRoleLabel(currentProfile)}</p>
            </div>
          )}
        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-0">
          <header className="app-topbar sticky top-0 z-50 border-b border-slate-200/70 px-4 py-2.5 backdrop-blur-xl dark:border-slate-800 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-950 dark:text-slate-50">{page === "notification_settings" ? "通知設定" : visibleNavItems.find((item) => item.page === page)?.label ?? "理財總覽"}</h1>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{activeLedger?.name} · {activeLedger?.currency ?? "TWD"}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-secondary h-10 px-2 sm:px-3" onClick={returnToLedgerHome} title="切換帳本">
                  <BookOpen size={16} />
                  <span className="hidden sm:inline">切換帳本</span>
                </button>
                <div className="static sm:relative" ref={notificationAreaRef}>
                  <button
                    className="icon-button relative"
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
                  {notificationOpen && <NotificationPanel notifications={financeNotifications} onClose={() => setNotificationOpen(false)} onOpen={openNotification} onManage={() => navigateToPage("notification_settings")} />}
                </div>
                <button className="icon-button" title="切換深色模式" onClick={() => setDarkMode((value) => !value)}>
                  <Moon size={18} />
                </button>
              </div>
            </div>
          </header>

          <div key={`${activeLedgerId}-${page}`} className="route-transition mx-auto max-w-[1440px] space-y-4 p-4 sm:p-6">
            {page !== "users" && <PageExperience page={page} dashboard={dashboard} period={period} month={month} periodYear={periodYear} rangeStart={rangeStart} rangeEnd={rangeEnd} onMonthChange={setMonth} onPeriodModeChange={setPeriodMode} onPeriodYearChange={setPeriodYear} onRangeStartChange={setRangeStart} onRangeEndChange={setRangeEnd} notifications={financeNotifications.length} />}
            {toast && <ToastBanner toast={toast} />}
            {page === "dashboard" && (
              <DashboardPage
                dashboard={dashboard}
                period={period}
                categoryBreakdown={categoryBreakdown}
                monthlyTrend={monthlyTrend}
                notifications={financeNotifications}
                accounts={accounts}
                creditCards={creditCards}
                creditCardInstallments={creditCardInstallments}
                loans={loans}
                transactions={periodTransactions}
                dataLoading={dataLoading}
                dataNotice={dataNotice}
                onNavigate={navigateToPage}
              />
            )}
            {page === "data_import" && (
              <DataImportPage
                accounts={accounts}
                cards={creditCards}
                installments={creditCardInstallments}
                loans={loans}
                onAddAccount={addAccount}
                onAddCard={addCard}
                onAddInstallment={addCardInstallment}
                onAddLoan={addLoan}
                onNavigate={navigateToPage}
                notify={notify}
              />
            )}
            {page === "transactions" && (
              <TransactionsPage
                accounts={accounts}
                creditCards={creditCards}
                installments={creditCardInstallments}
                loans={loans}
                investmentAssets={investmentAssets}
                transactions={periodTransactions}
                period={period}
                preset={transactionPreset}
                onPresetConsumed={() => setTransactionPreset(null)}
                onAdd={addTransaction}
                onDelete={softDeleteTransaction}
                onCsvUpload={handleCsvUpload}
                csvPreview={csvPreview}
                onImportCsv={importCsvRows}
                rememberedCategories={rememberedCategories}
              />
            )}
            {page === "accounts" && <AccountsPage accounts={accounts} onAdd={addAccount} onUpdate={saveAccount} onDelete={removeAccount} />}
            {page === "cards" && (
              <CardsPage
                cards={creditCards}
                accounts={accounts}
                installments={creditCardInstallments}
                onAdd={addCard}
                onAddInstallment={addCardInstallment}
                onUpdate={saveCard}
                onDelete={removeCard}
                onRecordPayment={(card) => {
                  setTransactionPreset({ type: "credit_card_payment", creditCardId: card.id });
                  navigateToPage("transactions");
                }}
                notify={notify}
              />
            )}
            {page === "loans" && <LoansPage loans={loans} onAdd={addLoan} onUpdate={saveLoan} onDelete={removeLoan} onRecordPayment={(loan) => {
              setTransactionPreset({ type: "loan_payment", loanId: loan.id });
              navigateToPage("transactions");
            }} onDrawdown={(loan) => {
              setTransactionPreset({ type: "loan_drawdown", loanId: loan.id });
              navigateToPage("transactions");
            }} notify={notify} />}
            {page === "deposits" && <DepositsPage accounts={accounts} deposits={deposits} onAdd={addDeposit} onUpdate={saveDeposit} onDelete={removeDeposit} notify={notify} />}
            {page === "insurance" && <InsurancePage policies={insurancePolicies} onAdd={addInsurancePolicy} onDelete={removeInsurancePolicy} />}
            {page === "notification_settings" && <NotificationSettingsPage preferences={notificationPreferences} onSave={saveLedgerNotificationPreferences} notify={notify} />}
            {page === "financial_plan" && (
              <FinancialPlansPage
                plans={financialPlans}
                recurringIncomes={recurringIncomes}
                accounts={accounts}
                transactions={transactions}
                reminders={reminders}
                loans={loans}
                installments={creditCardInstallments}
                creditCards={creditCards}
                dashboard={dashboard}
                onAdd={addFinancialPlan}
                onUpdate={saveFinancialPlan}
                onDelete={removeFinancialPlan}
                onAddIncome={addRecurringIncome}
                onUpdateIncome={saveRecurringIncome}
                onDeleteIncome={removeRecurringIncome}
                notify={notify}
              />
            )}
            {["stocks", "etfs", "funds", "bonds", "forex", "crypto"].includes(page) && (
              <InvestmentsPage
                section={page as InvestmentSection}
                categories={investmentCategories}
                assets={investmentAssets}
                ledgerCurrency={activeLedger?.currency ?? "TWD"}
                onAddCategory={addInvestmentCategory}
                onDeleteCategory={removeInvestmentCategory}
                onAddAsset={addInvestmentAsset}
                onUpdateAsset={saveInvestmentAsset}
                onDeleteAsset={removeInvestmentAsset}
                notify={notify}
              />
            )}
            {page === "calculators" && <CalculatorsPage />}
            {page === "budgets" && (
              <BudgetsPage budgets={budgets} transactions={periodTransactions} month={month} onAdd={addBudget} onDelete={removeBudget} notify={notify} />
            )}
            {page === "reminders" && <RemindersPage reminders={reminders} accounts={accounts} onAdd={addReminder} onDelete={removeReminder} notify={notify} />}
            {page === "reports" && (
              <ReportsPage
                month={month}
                period={period}
                transactions={periodTransactions}
                loans={loans}
                creditCards={creditCards}
                creditCardInstallments={creditCardInstallments}
                monthlyTrend={monthlyTrend}
                categoryBreakdown={categoryBreakdown}
                accounts={accounts}
                dashboard={dashboard}
                currency={activeLedger?.currency ?? "TWD"}
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
                onSaveProfile={savePersonalProfile}
                onChangePassword={savePassword}
                notificationPreferences={notificationPreferences}
                onSaveNotificationPreferences={saveLedgerNotificationPreferences}
                notify={notify}
              />
            )}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/96 shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/96 lg:hidden">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {visibleNavItems.slice(0, 5).map((item) => (
            <MobileNavButton key={item.page} item={item} active={page === item.page} onClick={() => navigateToPage(item.page)} />
          ))}
        </div>
        <details
          className="border-t border-slate-200 px-2 pb-2 dark:border-slate-800"
          open={mobileMoreOpen}
          onToggle={(event) => setMobileMoreOpen(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-center gap-1 py-1 text-xs text-slate-500 dark:text-slate-400">
            更多 <ChevronDown size={14} />
          </summary>
          <div className="space-y-2">
            {visibleNavGroups.map((group) => (
              <div key={group.title}>
                <p className="px-1 pb-1 text-[10px] font-bold tracking-[0.16em] text-slate-400 dark:text-slate-500">{group.title}</p>
                <div className="grid grid-cols-5 gap-1">
                  {group.items.filter((item) => !visibleNavItems.slice(0, 5).some((primary) => primary.page === item.page)).map((item) => (
                    <MobileNavButton key={item.page} item={item} active={page === item.page} onClick={() => navigateToPage(item.page)} />
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

function LedgerHomePage({
  ledgerBooks,
  invitations,
  snapshots,
  month,
  sessionEmail,
  profile,
  darkMode,
  onToggleDarkMode,
  onOpenLedger,
  onCreateLedger,
  onUpdateLedger,
  onDeleteLedger,
  onToggleSharing,
  onInviteMember,
  onOpenUserManagement,
  showUserManagement,
  onCloseUserManagement,
  globalNotifications,
  onOpenNotification,
  notify
}: {
  ledgerBooks: LedgerBook[];
  invitations: LedgerInvitation[];
  snapshots: Record<string, FinanceSnapshot>;
  month: string;
  sessionEmail: string | null;
  profile: UserProfile | null;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenLedger: (ledgerId: string) => void;
  onCreateLedger: (formData: FormData) => void;
  onUpdateLedger: (ledgerId: string, formData: FormData) => void;
  onDeleteLedger: (ledgerId: string) => void;
  onToggleSharing: (ledgerId: string, enabled: boolean) => void;
  onInviteMember: (ledgerId: string, formData: FormData) => void;
  onOpenUserManagement: () => void;
  showUserManagement: boolean;
  onCloseUserManagement: () => void;
  globalNotifications: FinanceNotification[];
  onOpenNotification: (notification: FinanceNotification) => void;
  notify: (type: ToastType, message: string) => void;
}) {
  const [globalNotificationOpen, setGlobalNotificationOpen] = useState(false);
  const globalNotificationAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!globalNotificationOpen) return;

    const closeOnOutsideInteraction = (event: PointerEvent) => {
      if (!globalNotificationAreaRef.current?.contains(event.target as Node)) {
        setGlobalNotificationOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGlobalNotificationOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [globalNotificationOpen]);

  if (showUserManagement) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] p-3 dark:bg-slate-950 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-subtle dark:border-slate-800 dark:bg-slate-950/95">
            <Brand />
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={onCloseUserManagement}><ArrowLeft size={16} />帳本總覽</button>
              <button className="btn-secondary h-10 w-10 px-0" title="切換深色模式" onClick={onToggleDarkMode}><Moon size={18} /></button>
            </div>
          </header>
          <AdminUsersPage currentUserId={profile?.userId ?? ""} notify={notify} />
        </div>
      </main>
    );
  }
  const summaryFor = (ledgerId: string) => {
    const snapshot = snapshots[ledgerId] ?? {
      accounts: [],
      transactions: [],
      creditCards: [],
      creditCardInstallments: [],
      loans: [],
      deposits: [],
      budgets: [],
      reminders: [],
      rememberedCategories: [],
      insurancePolicies: [],
      investmentCategories: [],
      investmentAssets: [],
      financialPlans: [],
      recurringIncomes: [],
      notificationPreferences: []
    };
    const dashboard = summarizeDashboard({
      accounts: snapshot.accounts,
      creditCards: snapshot.creditCards,
      creditCardInstallments: snapshot.creditCardInstallments,
      loans: snapshot.loans,
      deposits: snapshot.deposits,
      investmentAssets: snapshot.investmentAssets,
      transactions: snapshot.transactions,
      month,
      averageNecessaryExpenseCents: 0
    });
    return { snapshot, dashboard };
  };
  const totalNetWorthCents = ledgerBooks.reduce((sum, ledger) => sum + summaryFor(ledger.id).dashboard.netWorthCents, 0);
  const totalInsuranceCoverageCents = ledgerBooks.reduce(
    (sum, ledger) => sum + summaryFor(ledger.id).snapshot.insurancePolicies.reduce((policySum, policy) => policySum + policy.coverageAmountCents, 0),
    0
  );
  const ledgerCurrencySet = new Set(ledgerBooks.map((ledger) => ledger.currency));
  const sharedSummaryCurrency = ledgerCurrencySet.size === 1 ? ledgerBooks[0]?.currency ?? "TWD" : null;
  const ledgerChartRows = ledgerBooks.map((ledger) => {
    const { snapshot, dashboard } = summaryFor(ledger.id);
    return {
      id: ledger.id,
      name: ledger.name,
      color: ledger.color,
      currency: ledger.currency,
      netWorthCents: Math.max(0, dashboard.netWorthCents),
      expenseCents: dashboard.monthlyExpenseCents,
      coverageCents: snapshot.insurancePolicies.reduce((sum, policy) => sum + policy.coverageAmountCents, 0)
    };
  });
  const totalMonthlyExpenseCents = ledgerChartRows.reduce((sum, row) => sum + row.expenseCents, 0);
  const sharedLedgerCount = ledgerBooks.filter((ledger) => ledger.isShared).length;
  const pendingInviteCount = invitations.filter((invite) => invite.status === "pending").length;
  const primaryLedger = ledgerBooks[0] ?? null;
  const memberCode = profile ? formatMemberCode(profile.userId) : null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f7fb] p-3 dark:bg-slate-950 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="relative z-50 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-subtle backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <Brand />
          <div className="flex items-center gap-2">
            {profile && <Badge>{getRoleLabel(profile)}</Badge>}
            <div className="static sm:relative" ref={globalNotificationAreaRef}>
              <button className="btn-secondary relative h-10 w-10 px-0" title="全部帳本通知中心" aria-label={"全部帳本通知中心，共 " + globalNotifications.length + " 則提醒"} onClick={() => setGlobalNotificationOpen((value) => !value)}>
                <Bell size={18} />
                {globalNotifications.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-950">{globalNotifications.length > 9 ? "9+" : globalNotifications.length}</span>}
              </button>
              {globalNotificationOpen && <NotificationPanel notifications={globalNotifications} onClose={() => setGlobalNotificationOpen(false)} onOpen={(item) => { setGlobalNotificationOpen(false); onOpenNotification(item); }} />}
            </div>
            {profile?.isSuperAdmin && <button className="btn-secondary h-10 px-3" onClick={onOpenUserManagement}><Users size={16} />用戶管理</button>}
            {memberCode && <span className="hidden rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 shadow-subtle dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100 sm:inline-flex">會員編號 {memberCode}</span>}
            {sessionEmail && <span className="hidden rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-600 shadow-subtle dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 sm:inline-flex">{sessionEmail}</span>}
            <button className="btn-secondary h-10 w-10 px-0" title="切換深色模式" onClick={onToggleDarkMode}>
              <Moon size={18} />
            </button>
          </div>
        </header>

        <section className="screen-fade overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-950">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
            <div className="flex flex-col justify-between p-5 sm:p-7">
              <div>
                <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                  <ShieldCheck size={16} />
                  帳本管理
                </div>
                <h1 className="mt-5 max-w-2xl text-3xl font-bold tracking-normal text-slate-950 dark:text-slate-50 sm:text-4xl">
                  所有帳本，一個入口。
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
                  分開管理個人、家庭與投資資料，需要時再邀請成員共用。
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a className="btn-primary h-11 px-4" href="#create-ledger">
                    <Plus size={16} />
                    建立新帳本
                  </a>
                  {primaryLedger && (
                    <button className="btn-secondary h-11 px-4" onClick={() => onOpenLedger(primaryLedger.id)}>
                      進入最近帳本
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                </div>
                <div className="mt-7 grid grid-cols-3 gap-2 sm:gap-3">
                  <LedgerOfficialMetric label="帳本數" value={`${ledgerBooks.length} 本`} detail={`${sharedLedgerCount} 本共用`} />
                  <LedgerOfficialMetric label="淨資產總覽" value={sharedSummaryCurrency ? formatMoney(totalNetWorthCents, sharedSummaryCurrency) : "多幣別"} detail={sharedSummaryCurrency ? "跨帳本彙整" : "請分帳本查看"} />
                  <LedgerOfficialMetric label="本月支出" value={sharedSummaryCurrency ? formatMoney(totalMonthlyExpenseCents, sharedSummaryCurrency) : "多幣別"} detail={sharedSummaryCurrency ? "全部帳本合計" : "避免錯誤加總"} />
                </div>
              </div>
            </div>

            <div className="hidden border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60 lg:flex lg:border-l lg:border-t-0">
              <LedgerProductPreview
                ledgerChartRows={ledgerChartRows}
                totalInsuranceCoverageCents={totalInsuranceCoverageCents}
                sharedCurrency={sharedSummaryCurrency}
                pendingInviteCount={pendingInviteCount}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-slate-950 dark:text-slate-50">我的帳本</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">選擇帳本，或調整共用與幣別。</p>
              </div>
              <Badge>{ledgerBooks.length} 個工作區</Badge>
            </div>

            {ledgerBooks.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900">
                <BookOpen className="mx-auto text-slate-400 dark:text-slate-500" size={30} />
                <p className="mt-3 font-semibold text-slate-900 dark:text-slate-100">尚未建立帳本</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">先從右上方建立第一個帳本，就能開始整理資料。</p>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {ledgerBooks.map((ledger) => {
                  const { snapshot, dashboard } = summaryFor(ledger.id);
                  const tone = getLedgerToneClasses(ledger.color);
                  const ledgerInvites = invitations.filter((invite) => invite.ledgerId === ledger.id);
                  const ledgerCoverageCents = snapshot.insurancePolicies.reduce((sum, policy) => sum + policy.coverageAmountCents, 0);
                  const pendingLedgerInvites = ledgerInvites.filter((invite) => invite.status === "pending").length;

                  return (
                    <div
                      key={ledger.id}
                      className="ledger-card group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-subtle transition hover:-translate-y-0.5 hover:shadow-card dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div className={`h-1 ${tone.bar}`} />
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone.soft} ${tone.text}`}>
                                <BookOpen size={18} />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-lg font-bold text-slate-950 dark:text-slate-50">{ledger.name}</p>
                                <p className="truncate text-sm text-slate-500 dark:text-slate-400">{ledgerPurposeLabels[ledger.purpose]} · {ledger.owner} · {ledger.currency}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge>{ledger.isShared ? "共用" : "私人"}</Badge>
                            {pendingLedgerInvites > 0 && <span className="text-xs font-semibold text-amber-600 dark:text-amber-300">{pendingLedgerInvites} 邀請</span>}
                          </div>
                        </div>

                        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600 dark:text-slate-300">{ledger.note || "獨立帳本工作區"}</p>

                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <LedgerHomeInlineStat label="淨資產" value={formatMoney(dashboard.netWorthCents, ledger.currency)} />
                          <LedgerHomeInlineStat label="月支出" value={formatMoney(dashboard.monthlyExpenseCents, ledger.currency)} />
                          <LedgerHomeInlineStat label="保障額" value={formatMoney(ledgerCoverageCents, ledger.currency)} />
                        </div>

                        <div className="mt-4 space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>帳本完整度</span>
                            <span>{snapshot.accounts.length} 帳戶 · {snapshot.insurancePolicies.length} 保單</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, 24 + snapshot.accounts.length * 14 + snapshot.insurancePolicies.length * 10)}%` }} />
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button className="btn-primary flex-1" onClick={() => onOpenLedger(ledger.id)}>
                            進入帳本
                            <ArrowUpRight size={16} />
                          </button>
                        </div>

                        <div className="mt-3 grid gap-2">
                          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                            <span>共用帳本</span>
                            <input type="checkbox" checked={ledger.isShared} onChange={(event) => onToggleSharing(ledger.id, event.target.checked)} />
                          </label>

                          <details className="rounded-lg border border-slate-200 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/80">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">編輯帳本</summary>
                            <form className="mt-3 space-y-3" onSubmit={handleFormSubmit((formData) => onUpdateLedger(ledger.id, formData))}>
                              <Field label="帳本名稱"><input className="input" name="name" defaultValue={ledger.name} required /></Field>
                              <Field label="帳本類型">
                                <select className="input" name="purpose" defaultValue={ledger.purpose}>
                                  {Object.entries(ledgerPurposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                              </Field>
                              <Field label="擁有者"><input className="input" name="owner" defaultValue={ledger.owner} /></Field>
                              <Field label="主題色">
                                <select className="input" name="color" defaultValue={ledger.color}>
                                  <option value="emerald">綠色</option>
                                  <option value="sky">藍色</option>
                                  <option value="violet">紫色</option>
                                  <option value="amber">金色</option>
                                  <option value="rose">紅色</option>
                                </select>
                              </Field>
                              <Field label="帳本幣別">
                                <select className="input" name="currency" defaultValue={ledger.currency}>
                                  {Object.entries(currencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                              </Field>
                              <Field label={`轉換匯率（1 ${ledger.currency} 可換多少新幣別）`}>
                                <input className="input" name="conversionRate" type="number" min="0.000001" max="1000000" step="0.000001" defaultValue={1} />
                              </Field>
                              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">只有變更幣別時才會使用匯率；確認後會換算整本帳務並保留紀錄。</p>
                              <Field label="備註"><input className="input" name="note" defaultValue={ledger.note} /></Field>
                              <button className="btn-secondary w-full" type="submit">儲存帳本設定</button>
                            </form>
                          </details>

                          {ledger.isShared && (
                            <details className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900 dark:bg-sky-950/30">
                              <summary className="cursor-pointer text-sm font-semibold text-sky-800 dark:text-sky-100">邀請與共用權限</summary>
                              <form className="mt-3 space-y-3" onSubmit={handleFormSubmit((formData) => onInviteMember(ledger.id, formData))}>
                                <Field label="邀請方式">
                                  <select className="input" name="method" defaultValue="email">
                                    <option value="email">電子信箱</option>
                                    <option value="member_code">會員編號</option>
                                  </select>
                                </Field>
                                <Field label="會員編號或 Email"><input className="input" name="target" placeholder="member@example.com 或 M123456" required /></Field>
                                <Field label="權限">
                                  <select className="input" name="role" defaultValue="viewer">
                                    <option value="viewer">檢視者</option>
                                    <option value="editor">可編輯</option>
                                    <option value="admin">管理員</option>
                                  </select>
                                </Field>
                                <button className="btn-primary w-full" type="submit">建立邀請</button>
                              </form>
                              <div className="mt-3 space-y-2">
                                {ledgerInvites.length === 0 ? (
                                  <p className="text-xs text-slate-500 dark:text-slate-400">尚無邀請紀錄</p>
                                ) : (
                                  ledgerInvites.slice(0, 4).map((invite) => (
                                    <div key={invite.id} className="rounded-md bg-white/80 p-2 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="truncate">{invite.target}</span>
                                        <Badge>{invite.status === "pending" ? "待接受" : invite.status === "accepted" ? "已接受" : "已撤銷"}</Badge>
                                      </div>
                                      <p className="mt-1">{invite.method === "email" ? "Email" : "會員編號"} · {invite.role}</p>
                                    </div>
                                  ))
                                )}
                              </div>
                            </details>
                          )}

                          <details className="rounded-lg border border-red-200 bg-red-50/70 p-3 dark:border-red-900 dark:bg-red-950/30">
                            <summary className="cursor-pointer text-sm font-semibold text-red-700 dark:text-red-200">刪除</summary>
                            <p className="mt-2 text-xs leading-5 text-red-700 dark:text-red-200">刪除帳本後，帳本內容與成員邀請將一併移除，無法復原。</p>
                            <button className="btn-danger mt-3 w-full" onClick={() => onDeleteLedger(ledger.id)}>
                              <Trash2 size={16} />
                              刪除帳本
                            </button>
                          </details>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <form id="create-ledger" className="rounded-lg border border-slate-200 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-950" onSubmit={handleFormSubmit(onCreateLedger)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-950 dark:text-slate-50">新增帳本</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
                  <Plus size={16} />
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                <Field label="帳本名稱"><input className="input" name="name" placeholder="例如：家庭帳本" required /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="類型">
                    <select className="input" name="purpose" defaultValue="custom">
                      {Object.entries(ledgerPurposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="主題色">
                    <select className="input" name="color" defaultValue={darkMode ? "sky" : "emerald"}>
                      <option value="emerald">綠色</option>
                      <option value="sky">藍色</option>
                      <option value="violet">紫色</option>
                      <option value="amber">金色</option>
                      <option value="rose">紅色</option>
                    </select>
                  </Field>
                </div>
                <Field label="帳本幣別">
                  <select className="input" name="currency" defaultValue="TWD">
                    {Object.entries(currencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="擁有者"><input className="input" name="owner" defaultValue="自己" /></Field>
                <Field label="備註"><input className="input" name="note" placeholder="用途或管理範圍" /></Field>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                  <span>開啟共用邀請</span>
                  <input name="isShared" type="checkbox" />
                </label>
                <button className="btn-primary h-11 w-full" type="submit">建立並進入</button>
              </div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-950 dark:text-slate-50">共用管理</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">帳本成員與邀請。</p>
                </div>
                <ShieldCheck className="text-emerald-600 dark:text-emerald-300" size={24} />
              </div>
              <div className="mt-4 grid gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">會員編號</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{memberCode ?? "尚未建立"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <LedgerHomeInlineStat label="共用帳本" value={`${sharedLedgerCount} 本`} />
                  <LedgerHomeInlineStat label="待處理邀請" value={`${pendingInviteCount} 個`} />
                </div>
              </div>
            </section>

            {profile?.isSuperAdmin && (
              <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 shadow-card dark:border-sky-900 dark:bg-sky-950/30">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-950 dark:text-slate-50">平台用戶管理</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">管理帳號狀態、角色與存取權限，不屬於任何單一本帳本。</p>
                  </div>
                  <Users className="shrink-0 text-sky-600 dark:text-sky-300" size={24} />
                </div>
                <button className="btn-secondary mt-4 w-full" onClick={onOpenUserManagement}><Users size={16} />開啟用戶管理</button>
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-950">
              <p className="font-bold text-slate-950 dark:text-slate-50">帳本資產</p>
              <div className="mt-4 space-y-3">
                {ledgerChartRows.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">尚無帳本可排序</p>
                ) : (
                  ledgerChartRows
                    .slice()
                    .sort((a, b) => sharedSummaryCurrency ? b.netWorthCents - a.netWorthCents : a.name.localeCompare(b.name, "zh-TW"))
                    .slice(0, 5)
                    .map((row) => {
                      const tone = getLedgerToneClasses(row.color);
                      return (
                        <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{row.name}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">淨資產 {formatMoney(row.netWorthCents, row.currency)}</p>
                          </div>
                          <span className={`h-9 w-1.5 rounded-full ${tone.bar}`} />
                        </div>
                      );
                    })
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function TransitionOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-white/72 backdrop-blur-md ledger-transition dark:bg-slate-950/78">
      <div className="min-w-56 rounded-lg border border-slate-200 bg-white px-5 py-4 text-center text-slate-950 shadow-card dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-emerald-300 dark:bg-white dark:text-emerald-700">
          <BookOpen size={19} />
        </div>
        <p className="mt-3 text-sm font-semibold">{label}</p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-emerald-500" />
        </div>
      </div>
    </div>
  );
}

function LedgerOfficialMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-subtle dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 truncate text-base font-bold text-slate-950 dark:text-slate-50 sm:text-lg">{value}</p>
      <p className="mt-1 hidden text-xs text-slate-500 dark:text-slate-400 sm:block">{detail}</p>
    </div>
  );
}

function LedgerProductPreview({
  ledgerChartRows,
  totalInsuranceCoverageCents,
  sharedCurrency,
  pendingInviteCount
}: {
  ledgerChartRows: { id: string; name: string; color: LedgerBook["color"]; currency: CurrencyCode; netWorthCents: number; expenseCents: number; coverageCents: number }[];
  totalInsuranceCoverageCents: number;
  sharedCurrency: CurrencyCode | null;
  pendingInviteCount: number;
}) {
  const visibleRows = ledgerChartRows.slice(0, 4);
  const maxNetWorthCents = Math.max(...visibleRows.map((row) => row.netWorthCents), 1);
  const totalNetWorthCents = ledgerChartRows.reduce((sum, row) => sum + row.netWorthCents, 0);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-subtle dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">Ez2SaveMore</span>
      </div>

      <div className="mt-4 flex flex-1 flex-col rounded-lg border border-slate-200 bg-[#f8fafc] p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">帳本管理中心</p>
            <p className="mt-1 text-xl font-bold text-slate-950 dark:text-slate-50">帳本總覽</p>
          </div>
          <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">資料已更新</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-white p-3 shadow-subtle dark:bg-slate-950">
            <p className="text-xs text-slate-500 dark:text-slate-400">淨資產</p>
            <p className="mt-1 truncate text-sm font-bold text-slate-950 dark:text-slate-50">{sharedCurrency ? formatMoney(totalNetWorthCents, sharedCurrency) : "多幣別"}</p>
          </div>
          <div className="rounded-lg bg-white p-3 shadow-subtle dark:bg-slate-950">
            <p className="text-xs text-slate-500 dark:text-slate-400">保障額</p>
            <p className="mt-1 truncate text-sm font-bold text-slate-950 dark:text-slate-50">{sharedCurrency ? formatMoney(totalInsuranceCoverageCents, sharedCurrency) : "多幣別"}</p>
          </div>
          <div className="rounded-lg bg-white p-3 shadow-subtle dark:bg-slate-950">
            <p className="text-xs text-slate-500 dark:text-slate-400">邀請</p>
            <p className="mt-1 truncate text-sm font-bold text-slate-950 dark:text-slate-50">{pendingInviteCount} 個</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-slate-950 shadow-subtle dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">多帳本資產分布</p>
            <BarChart3 size={16} className="text-slate-400 dark:text-slate-500" />
          </div>
          <div className="mt-4 space-y-3">
            {visibleRows.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">建立帳本後會顯示資料預覽。</p>
            ) : (
              visibleRows.map((row) => (
                <div key={row.id}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-slate-600 dark:text-slate-300">{row.name}</span>
                    <span className="shrink-0 font-semibold">{formatMoney(row.netWorthCents, row.currency)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-2 rounded-full ${getLedgerToneClasses(row.color).bar}`}
                      style={{ width: sharedCurrency ? `${Math.max(8, (row.netWorthCents / maxNetWorthCents) * 100)}%` : "100%" }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            權限保護已啟用
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            帳本資料已保存
          </span>
        </div>
      </div>
    </div>
  );
}

function LedgerHomeInlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-slate-950 dark:text-slate-50">{value}</p>
    </div>
  );
}

function getLedgerToneClasses(color: LedgerBook["color"]) {
  if (color === "sky") {
    return {
      bar: "bg-sky-500",
      soft: "bg-sky-50 dark:bg-sky-950",
      text: "text-sky-700 dark:text-sky-100"
    };
  }
  if (color === "violet") {
    return {
      bar: "bg-violet-500",
      soft: "bg-violet-50 dark:bg-violet-950",
      text: "text-violet-700 dark:text-violet-100"
    };
  }
  if (color === "amber") {
    return {
      bar: "bg-amber-500",
      soft: "bg-amber-50 dark:bg-amber-950",
      text: "text-amber-700 dark:text-amber-100"
    };
  }
  if (color === "rose") {
    return {
      bar: "bg-rose-500",
      soft: "bg-rose-50 dark:bg-rose-950",
      text: "text-rose-700 dark:text-rose-100"
    };
  }
  return {
    bar: "bg-emerald-500",
    soft: "bg-emerald-50 dark:bg-emerald-950",
    text: "text-emerald-700 dark:text-emerald-100"
  };
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white shadow-md dark:bg-emerald-500/15 dark:text-emerald-300">
        <ShieldCheck size={22} />
      </div>
      <div>
        <p className="font-bold text-slate-950 dark:text-slate-50">Ez2SaveMore</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">個人投資理財助手</p>
      </div>
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      className={`group flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition duration-200 ${
        active
          ? "bg-slate-950 text-white shadow-card dark:bg-emerald-500/15 dark:text-emerald-200"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
      }`}
      onClick={onClick}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${active ? "bg-white/12 text-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-200"}`}>
        <Icon size={16} />
      </span>
      {item.label}
    </button>
  );
}

function MobileNavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-semibold transition ${
        active ? "bg-slate-950 text-white dark:bg-emerald-500/15 dark:text-emerald-200" : "text-slate-500 dark:text-slate-400"
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
  period,
  month,
  periodYear,
  rangeStart,
  rangeEnd,
  onMonthChange,
  onPeriodModeChange,
  onPeriodYearChange,
  onRangeStartChange,
  onRangeEndChange,
  notifications
}: {
  page: Page;
  dashboard: ReturnType<typeof summarizeDashboard>;
  period: DatePeriod;
  month: string;
  periodYear: string;
  rangeStart: string;
  rangeEnd: string;
  onMonthChange: (value: string) => void;
  onPeriodModeChange: (value: PeriodMode) => void;
  onPeriodYearChange: (value: string) => void;
  onRangeStartChange: (value: string) => void;
  onRangeEndChange: (value: string) => void;
  notifications: number;
}) {
  const intro = pageIntros[page];
  const dashboardCopy = getDashboardPeriodCopy(period);
  const title = page === "dashboard" ? dashboardCopy.heroTitle : intro.title;
  const description = page === "dashboard" ? `${period.label}的資產、負債、現金流與近期提醒。` : intro.description;
  const PageIcon = navGroups.flatMap((group) => group.items).find((item) => item.page === page)?.icon ?? Bell;
  const showPeriodStatus = !["settings", "users", "calculators", "notification_settings", "data_import"].includes(page);
  return (
    <section
      className="page-experience overflow-hidden rounded-lg border border-slate-200/90 p-4 shadow-card dark:border-slate-800 sm:p-5"
      style={{ "--page-tint": intro.tint } as React.CSSProperties}
    >
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-subtle dark:bg-slate-900" style={{ color: intro.accent }}>
            <PageIcon size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold" style={{ color: intro.accent }}>{intro.eyebrow}</p>
            <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950 dark:text-slate-50">{title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
          </div>
        </div>
        {showPeriodStatus && <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-1.5 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{period.label}</span>
          <span className={`rounded-md px-2.5 py-1.5 ${dashboard.monthlyBalanceCents >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200"}`}>
            結餘 {formatCompactMoney(dashboard.monthlyBalanceCents)}
          </span>
          {notifications > 0 && <span className="rounded-md bg-rose-50 px-2.5 py-1.5 text-rose-700 dark:bg-rose-950 dark:text-rose-200">{notifications} 則提醒</span>}
        </div>}
      </div>
      {!["settings", "users", "calculators", "stocks", "etfs", "funds", "bonds", "forex", "crypto", "financial_plan", "notification_settings", "data_import"].includes(page) && (
        <PeriodSelector
          mode={period.mode}
          month={month}
          year={periodYear}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onModeChange={onPeriodModeChange}
          onMonthChange={onMonthChange}
          onYearChange={onPeriodYearChange}
          onRangeStartChange={onRangeStartChange}
          onRangeEndChange={onRangeEndChange}
        />
      )}
    </section>
  );
}

function PeriodSelector({
  mode,
  month,
  year,
  rangeStart,
  rangeEnd,
  onModeChange,
  onMonthChange,
  onYearChange,
  onRangeStartChange,
  onRangeEndChange
}: {
  mode: PeriodMode;
  month: string;
  year: string;
  rangeStart: string;
  rangeEnd: string;
  onModeChange: (value: PeriodMode) => void;
  onMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
  onRangeStartChange: (value: string) => void;
  onRangeEndChange: (value: string) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-200/80 pt-4 dark:border-slate-700">
      <div className="flex max-w-full flex-wrap rounded-md border border-slate-200 bg-white/90 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-950">
        {(["all", "month", "three_months", "six_months", "year", "range"] as const).map((item) => (
          <button key={item} className={`rounded px-3 py-1.5 text-sm font-semibold transition ${mode === item ? "bg-slate-950 text-white shadow-sm dark:bg-emerald-600 dark:text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`} onClick={() => onModeChange(item)}>{item === "all" ? "全部" : item === "month" ? "單月" : item === "three_months" ? "近三月" : item === "six_months" ? "近半年" : item === "year" ? "全年" : "自訂"}</button>
        ))}
      </div>
      {mode === "month" && <input className="input mt-0 w-36" type="month" value={month} onChange={(event) => onMonthChange(event.target.value)} aria-label="選擇月份" />}
      {mode === "year" && <input className="input mt-0 w-28" type="number" min="2000" max="2100" value={year} onChange={(event) => onYearChange(event.target.value)} aria-label="選擇年份" />}
      {mode === "range" && <><input className="input mt-0 w-40" type="date" value={rangeStart} onChange={(event) => onRangeStartChange(event.target.value)} aria-label="開始日期" /><span className="pb-2 text-sm text-slate-500 dark:text-slate-400">至</span><input className="input mt-0 w-40" type="date" min={rangeStart} value={rangeEnd} onChange={(event) => onRangeEndChange(event.target.value)} aria-label="結束日期" /></>}
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
  onSignIn,
  onSignUp,
  onMagicLink,
  onToggleDarkMode
}: {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, displayName: string) => Promise<void>;
  onMagicLink: (email: string) => Promise<void>;
  onToggleDarkMode: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submitAuth(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const displayName = String(formData.get("displayName") ?? "").trim();
    if (mode === "signup" && (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      setMessage("註冊密碼請至少 10 碼，並包含英文字母與數字。");
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
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <section className="mx-auto grid min-h-screen w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:px-8">
        <div className="order-last relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900 sm:p-8 lg:order-none">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-sky-500 to-amber-400" />
          <div className="flex items-center justify-between gap-3">
            <Brand />
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
              TWD · Asia/Taipei
            </span>
          </div>
          <div className="mt-9 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              多帳本財務管理
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-normal text-slate-950 dark:text-slate-50">
              財務，都在正確的位置。
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
              從日常收支到資產、負債與投資，用一本清楚的總帳掌握每個重要決定。
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <AuthMetric label="分帳管理" value="多帳本" helper="個人、家庭與投資" />
            <AuthMetric label="負債管理" value="全景" helper="卡費、分期與貸款" />
            <AuthMetric label="報表" value="完整" helper="PDF、Excel、CSV" />
          </div>

          <div className="mt-8 rounded-lg border border-slate-800 bg-slate-950 p-4 text-white shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-emerald-300">本月財務摘要</p>
                <p className="mt-1 text-lg font-semibold">重要數據一次掌握</p>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-1 text-xs text-slate-200">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                私人帳本
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-white/10 p-3">
                <p className="text-xs text-slate-300">帳戶總覽</p>
                <p className="mt-2 text-2xl font-bold">完整</p>
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <p className="text-xs text-slate-300">收支趨勢</p>
                <p className="mt-2 text-2xl font-bold text-emerald-300">可視化</p>
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <p className="text-xs text-slate-300">負債規劃</p>
                <p className="mt-2 text-2xl font-bold text-amber-300">可規劃</p>
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
                <AuthPreviewRow label="信用卡與分期" value="72%" color="bg-sky-400" />
                <AuthPreviewRow label="貸款進度" value="54%" color="bg-amber-300" />
                <AuthPreviewRow label="預算使用" value="38%" color="bg-rose-300" />
              </div>
            </div>
          </div>
        </div>

        <div className="order-first relative rounded-lg border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900 sm:p-8 lg:order-none">
          <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-brand-700 dark:text-brand-100">{mode === "signin" ? "歡迎回來" : "建立帳號"}</p>
              <h2 className="mt-2 text-2xl font-bold tracking-normal">{mode === "signin" ? "登入 Ez2SaveMore" : "開始管理你的財務"}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">使用 Email 登入，帳本會自動載入。</p>
            </div>
            <button className="icon-button" type="button" title="切換深色模式" onClick={onToggleDarkMode}><Moon size={18} /></button>
          </div>
          {message && <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</div>}
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
            <button className={`rounded-md px-3 py-2 text-sm font-semibold transition ${mode === "signin" ? "bg-white text-brand-700 shadow-subtle dark:bg-slate-800 dark:text-brand-100" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`} onClick={() => setMode("signin")}>登入</button>
            <button className={`rounded-md px-3 py-2 text-sm font-semibold transition ${mode === "signup" ? "bg-white text-brand-700 shadow-subtle dark:bg-slate-800 dark:text-brand-100" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`} onClick={() => setMode("signup")}>註冊</button>
          </div>
          <form className="mt-5 space-y-4" onSubmit={handleFormSubmit((formData) => void submitAuth(formData))}>
            {mode === "signup" && <Field label="顯示名稱"><input className="input" name="displayName" placeholder="例如 Renault" /></Field>}
            <Field label="Email"><input className="input" name="email" type="email" autoComplete="email" required /></Field>
            <Field label="密碼"><input className="input" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 10 : 1} required /></Field>
            {mode === "signup" && <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">至少 10 碼，包含英文字母與數字。</p>}
            <button className="btn-primary h-11 w-full" type="submit" disabled={loading}>
              {loading ? "處理中" : mode === "signup" ? "建立帳號" : "登入"}
            </button>
          </form>
          <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            或使用登入連結
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>
          <form className="space-y-4" onSubmit={handleFormSubmit((formData) => void submitMagicLink(formData))}>
            <Field label="Email"><input className="input" name="magicEmail" type="email" autoComplete="email" required /></Field>
            <button className="btn-secondary h-11 w-full" type="submit" disabled={loading}>寄送登入連結</button>
          </form>
          <p className="mt-5 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
            私人帳本只對你開放；受邀成員僅能存取指定帳本。
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

function NotificationPanel({ notifications, onClose, onOpen, onManage }: { notifications: FinanceNotification[]; onClose: () => void; onOpen: (notification: FinanceNotification) => void; onManage?: () => void }) {
  return (
    <div
      className="absolute inset-x-3 top-full z-[70] mt-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-950 sm:inset-x-auto sm:right-0 sm:top-12 sm:mt-0 sm:w-[calc(100vw-2rem)] sm:max-w-md"
      role="dialog"
      aria-label="通知中心"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-950 dark:text-slate-50">通知中心</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">信用卡、貸款、分期、定存與固定帳單提醒</p>
        </div>
        <div className="flex items-center gap-2">
          {onManage && <button className="btn-secondary px-2 py-1" onClick={onManage}>設定</button>}
          <button className="btn-secondary px-2 py-1" onClick={onClose}>關閉</button>
        </div>
      </div>
      <div className="mt-3 max-h-[calc(100vh-9rem)] space-y-2 overflow-y-auto sm:max-h-[420px]">
        {notifications.length === 0 ? (
          <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            目前沒有本月提醒。
          </div>
        ) : (
          notifications.map((item) => (
            <button key={item.id} className={`w-full rounded-md border p-3 text-left transition hover:brightness-95 ${getNotificationClass(item.status)}`} onClick={() => onOpen(item)}>
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
                {item.ledgerName && <span>{item.ledgerName}</span>}
                <span>{item.deliveryMode === "repeat" ? "每 " + item.repeatHours + " 小時提醒" : "單次提醒"}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

const notificationPreferenceLabels: Record<NotificationPreference["type"], { label: string; detail: string }> = {
  credit_card: { label: "信用卡", detail: "結帳日與繳款截止" },
  installment: { label: "信用卡分期", detail: "分期應繳與到期日" },
  loan: { label: "貸款", detail: "每期還款日" },
  reminder: { label: "固定帳單", detail: "房租、水電、保費與訂閱" },
  deposit: { label: "定期存款", detail: "到期日與到期金額" },
  insurance: { label: "保險", detail: "保費繳款與續保日" }
};

function NotificationSettingsPage({ preferences, onSave, notify, compact = false }: { preferences: NotificationPreference[]; onSave: (preferences: NotificationPreference[]) => Promise<void>; notify: (type: ToastType, message: string) => void; compact?: boolean }) {
  const preferenceFor = (type: NotificationPreference["type"]) => preferences.find((item) => item.type === type);
  const enabledCount = (Object.keys(notificationPreferenceLabels) as NotificationPreference["type"][]).filter((type) => preferenceFor(type)?.isEnabled ?? true).length;

  function save(formData: FormData) {
    const now = new Date().toISOString();
    const next = (Object.keys(notificationPreferenceLabels) as NotificationPreference["type"][]).map((type) => {
      const existing = preferenceFor(type);
      const remindDaysBefore = Number(formData.get("days-" + type));
      const repeatHours = Number(formData.get("hours-" + type));
      if (!Number.isInteger(remindDaysBefore) || remindDaysBefore < 0 || remindDaysBefore > 90) {
        notify("error", "提前提醒天數需介於 0 到 90 天");
        return null;
      }
      if (!Number.isInteger(repeatHours) || repeatHours < 1 || repeatHours > 168) {
        notify("error", "持續提醒間隔需介於 1 到 168 小時");
        return null;
      }
      return {
        id: existing?.id ?? crypto.randomUUID(),
        userId: existing?.userId ?? localUserId,
        type,
        isEnabled: formData.get("enabled-" + type) === "on",
        remindDaysBefore,
        deliveryMode: String(formData.get("mode-" + type)) as NotificationPreference["deliveryMode"],
        repeatHours,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
    });
    if (next.some((item) => item === null)) return;
    void onSave(next as NotificationPreference[]);
  }

  return (
    <div className="space-y-4">
      {!compact && <FeatureHero
        icon={<Bell size={18} />}
        label="通知設定"
        title="為這本帳本設定提醒節奏"
        value={String(enabledCount) + " 類"}
        tone="amber"
        metrics={[
          { label: "已啟用類別", value: String(enabledCount), accent: "border-emerald-300" },
          { label: "提醒模式", value: "單次或持續", accent: "border-amber-300" },
          { label: "帳本範圍", value: "目前帳本", accent: "border-sky-300" }
        ]}
      >
        <div className="space-y-3 text-sm text-slate-200">
          <p>關閉某一類後，該類事項不會出現在此帳本的通知中心。</p>
          <p>未另行設定時每 12 小時提醒一次；啟用手機通知後，關閉頁面也能接收。</p>
        </div>
      </FeatureHero>}

      <form className="panel" onSubmit={(event) => { event.preventDefault(); save(new FormData(event.currentTarget)); }}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-semibold">繳款與到期提醒</h2><p className="text-sm text-slate-500 dark:text-slate-400">預設每 12 小時提醒，可依目前帳本的需求調整。</p></div>
          <button className="btn-primary" type="submit"><CheckCircle2 size={16} />儲存通知設定</button>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {(Object.keys(notificationPreferenceLabels) as NotificationPreference["type"][]).map((type) => {
            const existing = preferenceFor(type);
            const label = notificationPreferenceLabels[type];
            return (
              <section key={type} className="rounded-lg border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-semibold text-slate-950 dark:text-slate-50">{label.label}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label.detail}</p></div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>開啟</span><input name={"enabled-" + type} type="checkbox" defaultChecked={existing?.isEnabled ?? true} /></label>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Field label="截止日前幾天"><input className="input" name={"days-" + type} type="number" min={0} max={90} defaultValue={existing?.remindDaysBefore ?? (type === "deposit" || type === "insurance" ? 14 : 7)} /></Field>
                  <Field label="提醒方式"><select className="input" name={"mode-" + type} defaultValue={existing?.deliveryMode ?? "repeat"}><option value="single">單次提醒</option><option value="repeat">持續提醒</option></select></Field>
                  <Field label="持續間隔（小時）"><input className="input" name={"hours-" + type} type="number" min={1} max={168} defaultValue={existing?.repeatHours ?? 12} /></Field>
                </div>
              </section>
            );
          })}
        </div>
      </form>
    </div>
  );
}

function buildFinanceNotifications({
  month,
  reminders,
  creditCards,
  installments,
  loans,
  deposits,
  insurancePolicies,
  preferences = [],
  ledgerId,
  ledgerName
}: {
  month: string;
  reminders: FinancialReminder[];
  creditCards: CreditCard[];
  installments: CreditCardInstallment[];
  loans: Loan[];
  deposits: Deposit[];
  insurancePolicies: InsurancePolicy[];
  preferences?: NotificationPreference[];
  ledgerId?: string;
  ledgerName?: string;
}): FinanceNotification[] {
  const items: FinanceNotification[] = [];
  const todayIso = getTaipeiTodayIso();
  const settingFor = (source: FinanceNotification["source"]) => preferences.find((item) => item.type === source) ?? {
    isEnabled: true,
    remindDaysBefore: source === "insurance" || source === "deposit" ? 14 : 7,
    deliveryMode: "repeat" as const,
    repeatHours: 12
  };
  const push = (item: Omit<FinanceNotification, "status" | "ledgerId" | "ledgerName" | "deliveryMode" | "repeatHours">, remindDaysBefore?: number) => {
    const savedSetting = preferences.find((preference) => preference.type === item.source);
    const setting = savedSetting ?? settingFor(item.source);
    if (!setting.isEnabled) return;
    const status = getNotificationStatus(item.date, todayIso, savedSetting?.remindDaysBefore ?? remindDaysBefore ?? setting.remindDaysBefore);
    if (!isNotificationVisible(status)) return;
    items.push({
      ...item,
      status,
      ledgerId,
      ledgerName,
      deliveryMode: setting.deliveryMode,
      repeatHours: setting.repeatHours
    });
  };

  creditCards
    .filter((card) => card.isActive)
    .forEach((card) => {
      const statementDate = createMonthlyDate(month, card.statementDay);
      const dueDate = createMonthlyDate(month, card.paymentDueDay);
      if (card.unbilledAmountCents > 0) {
        push({
          id: "card-statement-" + card.id + "-" + statementDate,
          title: card.name + " 結帳日",
          detail: card.issuer + " **** " + card.last4 + "，本期帳款 " + formatMoney(card.currentStatementAmountCents) + "，未出帳 " + formatMoney(card.unbilledAmountCents),
          date: statementDate,
          amountCents: card.currentStatementAmountCents + card.unbilledAmountCents,
          source: "credit_card"
        });
      }
      if (card.currentStatementAmountCents > 0) {
        push({
          id: "card-due-" + card.id + "-" + dueDate,
          title: card.name + " 繳款截止",
          detail: "本期帳單 " + formatMoney(card.currentStatementAmountCents) + "，最低應繳 " + formatMoney(card.minimumPaymentCents) + "。最低應繳僅作提醒，不建議作為長期策略。",
          date: dueDate,
          amountCents: card.currentStatementAmountCents,
          source: "credit_card"
        });
      }
    });

  installments
    .filter((installment) => installment.status === "active")
    .filter((installment) => installment.nextDueDate?.startsWith(month))
    .forEach((installment) => {
      const date = installment.nextDueDate as string;
      const card = creditCards.find((candidate) => candidate.id === installment.creditCardId);
      push({
        id: "installment-" + installment.id + "-" + date,
        title: (installment.merchant || card?.name || "信用卡") + " 分期應繳",
        detail: (card?.name ?? "信用卡") + "，已還 " + installment.paidPeriods + "/" + installment.periods + " 期，剩餘 " + formatMoney(installment.remainingAmountCents) + "，年利率 " + formatPercent(installment.annualRate),
        date,
        amountCents: installment.monthlyPaymentCents,
        source: "installment"
      });
    });

  loans
    .filter((loan) => loan.status === "active")
    .filter((loan) => summarizeLoanProgress(loan).remainingPrincipalCents > 0)
    .forEach((loan) => {
      const date = createMonthlyDate(month, loan.monthlyPaymentDay);
      const progress = summarizeLoanProgress(loan);
      push({
        id: "loan-" + loan.id + "-" + date,
        title: loan.name + " 貸款還款",
        detail: (loan.institution || "貸款") + "，剩餘本金 " + formatMoney(progress.remainingPrincipalCents) + "，已繳 " + loan.paidPeriods + "/" + loan.termMonths + " 期，累計實付 " + formatMoney(progress.totalCashPaidCents),
        date,
        amountCents: loan.paymentPerPeriodCents,
        source: "loan"
      });
    });

  reminders
    .filter((reminder) => reminder.status !== "done")
    .forEach((reminder) => {
      const date = createMonthlyDate(month, reminder.debitDay);
      if (reminder.startDate > date) return;
      if (reminder.endDate && reminder.endDate < date) return;
      push({
        id: "reminder-" + reminder.id + "-" + date,
        title: reminder.name,
        detail: reminder.frequency + " 固定帳單" + (reminder.autoCreateTransaction ? "，可自動建立交易" : ""),
        date,
        amountCents: reminder.amountCents,
        source: "reminder"
      }, reminder.remindDaysBefore);
    });

  insurancePolicies
    .filter((policy) => policy.status === "active")
    .forEach((policy) => {
      const premiumDate = createMonthlyDate(month, policy.paymentDay);
      push({
        id: "insurance-premium-" + policy.id + "-" + premiumDate,
        title: policy.name + " 保費繳款",
        detail: policy.insurer + " · " + insuranceTypeLabels[policy.type] + "，年保費 " + formatMoney(policy.annualPremiumCents) + "，保障額 " + formatMoney(policy.coverageAmountCents),
        date: premiumDate,
        amountCents: Math.round(policy.annualPremiumCents / 12),
        source: "insurance"
      });
      if (policy.renewalDate.startsWith(month)) {
        push({
          id: "insurance-renewal-" + policy.id + "-" + policy.renewalDate,
          title: policy.name + " 續保日",
          detail: policy.insurer + " · " + insuranceTypeLabels[policy.type] + "，已理賠 " + formatMoney(policy.paidClaimAmountCents) + "，待理賠 " + formatMoney(policy.pendingClaimAmountCents),
          date: policy.renewalDate,
          amountCents: policy.annualPremiumCents,
          source: "insurance"
        });
      }
    });

  deposits
    .filter((deposit) => deposit.isActive && deposit.maturityDate.startsWith(month))
    .forEach((deposit) => {
      push({
        id: "deposit-maturity-" + deposit.id + "-" + deposit.maturityDate,
        title: deposit.name + " 到期日",
        detail: (deposit.institution || "存款帳戶") + "，預估到期金額 " + formatMoney(deposit.estimatedMaturityAmountCents),
        date: deposit.maturityDate,
        amountCents: deposit.estimatedMaturityAmountCents,
        source: "deposit"
      });
    });

  return items.sort((a, b) => getNotificationSortWeight(a.status) - getNotificationSortWeight(b.status) || a.date.localeCompare(b.date));
}

function getNotificationSortWeight(status: FinanceNotification["status"]) {
  return { overdue: 0, due_today: 1, upcoming: 2, scheduled: 3 }[status];
}

function createMonthlyDate(month: string, day: number) {
  const [yearValue, monthValue] = month.split("-").map(Number);
  const safeDay = Math.max(1, Math.min(day || 1, new Date(yearValue, monthValue, 0).getDate()));
  return `${yearValue}-${String(monthValue).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function addMonthsToIsoDate(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function monthsBetween(startDate: string, endDate: string) {
  const [startYear, startMonth] = startDate.split("-").map(Number);
  const [endYear, endMonth] = endDate.split("-").map(Number);
  return Math.max(1, (endYear - startYear) * 12 + endMonth - startMonth);
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

function getRecentMonthKeys(anchorMonth: string, count: number): string[] {
  const [anchorYear, anchorMonthNumber] = anchorMonth.split("-").map(Number);
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const date = new Date(anchorYear, anchorMonthNumber - 1 - index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function getMonthsInPeriod(period: DatePeriod, fallbackMonth: string): string[] {
  if (period.mode === "month") return getRecentMonthKeys(fallbackMonth, 6).reverse();
  const start = new Date(`${period.startDate.slice(0, 7)}-01T00:00:00+08:00`);
  const end = new Date(`${period.endDate.slice(0, 7)}-01T00:00:00+08:00`);
  const months: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && months.length < 24) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months.length > 0 ? months : [fallbackMonth];
}

function getDashboardPeriodCopy(period: DatePeriod) {
  if (period.mode === "all") {
    return {
      heroTitle: "全部財務全景",
      incomeLabel: "累計收入",
      expenseLabel: "累計支出",
      balanceLabel: "累計結餘",
      scoreLabel: "整體節奏",
      trendTitle: "全部收支趨勢",
      categoryTitle: "全部支出分類"
    };
  }
  if (period.mode === "month") {
    return {
      heroTitle: `${period.label} 財務全景`,
      incomeLabel: "單月收入",
      expenseLabel: "單月支出",
      balanceLabel: "單月結餘",
      scoreLabel: "單月節奏",
      trendTitle: "最近六個月收支趨勢",
      categoryTitle: "單月支出分類"
    };
  }
  if (period.mode === "three_months") {
    return {
      heroTitle: "近三個月財務全景",
      incomeLabel: "近三月收入",
      expenseLabel: "近三月支出",
      balanceLabel: "近三月結餘",
      scoreLabel: "近三月節奏",
      trendTitle: "近三個月收支趨勢",
      categoryTitle: "近三月支出分類"
    };
  }
  if (period.mode === "six_months") {
    return {
      heroTitle: "近半年財務全景",
      incomeLabel: "近半年收入",
      expenseLabel: "近半年支出",
      balanceLabel: "近半年結餘",
      scoreLabel: "近半年節奏",
      trendTitle: "近半年收支趨勢",
      categoryTitle: "近半年支出分類"
    };
  }
  if (period.mode === "year") {
    return {
      heroTitle: `${period.label}財務全景`,
      incomeLabel: "全年收入",
      expenseLabel: "全年支出",
      balanceLabel: "全年結餘",
      scoreLabel: "全年節奏",
      trendTitle: `${period.label}收支趨勢`,
      categoryTitle: "全年支出分類"
    };
  }
  return {
    heroTitle: "指定期間財務全景",
    incomeLabel: "期間收入",
    expenseLabel: "期間支出",
    balanceLabel: "期間結餘",
    scoreLabel: "期間節奏",
    trendTitle: "指定期間收支趨勢",
    categoryTitle: "指定期間支出分類"
  };
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
    reminder: "固定帳單",
    deposit: "定期存款",
    insurance: "保險"
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
  period,
  categoryBreakdown,
  monthlyTrend,
  notifications,
  accounts,
  creditCards,
  creditCardInstallments,
  loans,
  transactions,
  dataLoading,
  dataNotice,
  onNavigate
}: {
  dashboard: ReturnType<typeof summarizeDashboard>;
  period: DatePeriod;
  categoryBreakdown: { category: string; amountCents: number }[];
  monthlyTrend: { month: string; incomeCents: number; expenseCents: number }[];
  notifications: FinanceNotification[];
  accounts: FinancialAccount[];
  creditCards: CreditCard[];
  creditCardInstallments: CreditCardInstallment[];
  loans: Loan[];
  transactions: Transaction[];
  dataLoading: boolean;
  dataNotice: string;
  onNavigate: (page: Page) => void;
}) {
  const periodCopy = getDashboardPeriodCopy(period);
  const stats = [
    ["目前總資產", dashboard.totalAssetsCents],
    ["帳戶資產", dashboard.accountAssetsCents],
    ["投資持倉市值", dashboard.investmentAssetsCents],
    ["定期存款", dashboard.timeDepositTotalCents],
    ["目前總負債", dashboard.totalLiabilitiesCents],
    ["淨資產", dashboard.netWorthCents],
    [periodCopy.incomeLabel, dashboard.monthlyIncomeCents],
    [periodCopy.expenseLabel, dashboard.monthlyExpenseCents],
    [periodCopy.balanceLabel, dashboard.monthlyBalanceCents],
    ["目前信用卡待繳", dashboard.monthlyCreditCardDueCents],
    ["每月貸款應繳", dashboard.monthlyLoanDueCents],
    ["可動用現金", dashboard.availableCashCents],
    ["定期存款總額", dashboard.timeDepositTotalCents]
  ] as const;

  return (
    <div className="space-y-4">
      {dataLoading && <InlineNotice tone="neutral" message="載入資料中..." />}
      {!dataLoading && dataNotice && <InlineNotice tone="warning" message={dataNotice} />}
      <DashboardPulse dashboard={dashboard} monthlyTrend={monthlyTrend} period={period} onNavigate={onNavigate} />
      <DashboardFinanceCenter dashboard={dashboard} period={period} onNavigate={onNavigate} />
      <FinancialDecisionCenter
        dashboard={dashboard}
        monthlyTrend={monthlyTrend}
        transactions={transactions}
        creditCards={creditCards}
        creditCardInstallments={creditCardInstallments}
      />
      <details className="panel group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <h2 className="section-heading">完整財務指標</h2>
            <p className="helper-text">資產、負債、收入與應繳款項</p>
          </div>
          <span className="icon-button" aria-hidden="true"><ChevronDown size={17} className="transition group-open:rotate-180" /></span>
        </summary>
        <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 xl:grid-cols-5 dark:border-slate-800">
          {stats.map(([label, value]) => (
            <StatCard key={label} label={label} value={formatMoney(value)} />
          ))}
        </div>
      </details>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel min-w-0 lg:col-span-2">
          <h2 className="text-lg font-semibold">全部帳戶餘額分布</h2>
          <AccountBalanceChart accounts={accounts} />
        </section>
        <section className="panel">
          <h2 className="text-lg font-semibold">總帳結構</h2>
          <LedgerDonut dashboard={dashboard} />
        </section>
      </div>
      <details className="panel group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <h2 className="section-heading">資產與負債結構</h2>
            <p className="helper-text">帳戶類型、資金流動性與負債來源</p>
          </div>
          <span className="icon-button" aria-hidden="true"><ChevronDown size={17} className="transition group-open:rotate-180" /></span>
        </summary>
        <div className="mt-4 grid gap-6 border-t border-slate-200 pt-4 lg:grid-cols-3 lg:divide-x lg:divide-slate-200 dark:border-slate-800 dark:lg:divide-slate-800">
          <section>
            <h3 className="font-semibold">資產帳戶類型</h3>
            <AccountTypeChart accounts={accounts} />
          </section>
          <section className="lg:pl-6">
            <h3 className="font-semibold">可動用現金比例</h3>
            <CashAvailabilityChart accounts={accounts} />
          </section>
          <section className="lg:pl-6">
            <h3 className="font-semibold">負債來源</h3>
            <LiabilityChart creditCards={creditCards} installments={creditCardInstallments} loans={loans} />
          </section>
        </div>
      </details>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel min-w-0 lg:col-span-2">
          <h2 className="text-lg font-semibold">{periodCopy.trendTitle}</h2>
          <TrendChart data={monthlyTrend} />
        </section>
        <section className="panel">
          <h2 className="text-lg font-semibold">資產負債與預備金</h2>
          <div className="mt-4 space-y-4">
            <Progress label="負債比" value={dashboard.debtRatio} colorClass={dashboard.debtRatio > 0.5 ? "bg-rose-600" : "bg-amber-500"} />
            <Progress label="緊急預備金月數" value={Math.min(dashboard.emergencyFundMonths / 6, 1)} helper={`${dashboard.emergencyFundMonths.toFixed(1)} 個月`} colorClass="bg-emerald-600" />
          </div>
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel lg:col-span-2">
          <h2 className="text-lg font-semibold">{periodCopy.categoryTitle}</h2>
          <CategoryBars data={categoryBreakdown} />
        </section>
        <section className="panel">
          <h2 className="text-lg font-semibold">最近即將到期項目</h2>
          <div className="mt-3 space-y-3">
            {notifications.length === 0 && <EmptyState label="目前尚無信用卡、貸款或帳單提醒" />}
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
  monthlyTrend,
  period,
  onNavigate
}: {
  dashboard: ReturnType<typeof summarizeDashboard>;
  monthlyTrend: { month: string; incomeCents: number; expenseCents: number }[];
  period: DatePeriod;
  onNavigate: (page: Page) => void;
}) {
  const periodCopy = getDashboardPeriodCopy(period);
  const latest = monthlyTrend.at(-1);
  const prior = monthlyTrend.at(-2);
  const latestBalance = latest ? latest.incomeCents - latest.expenseCents : dashboard.monthlyBalanceCents;
  const priorBalance = prior ? prior.incomeCents - prior.expenseCents : 0;
  const balanceDelta = latestBalance - priorBalance;
  const positiveBalance = dashboard.monthlyBalanceCents >= 0;
  const hasBalance = dashboard.monthlyIncomeCents > 0 || dashboard.monthlyExpenseCents > 0;
  const flowScore = hasBalance ? Math.round(Math.max(0, Math.min(100, 58 + (dashboard.monthlyBalanceCents >= 0 ? 24 : -18) + (dashboard.debtRatio < 0.35 ? 12 : -8) + Math.min(10, dashboard.emergencyFundMonths * 2)))) : 0;
  return (
    <section className="finance-today-hero overflow-hidden rounded-lg border border-emerald-100 p-4 shadow-subtle dark:border-emerald-900 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <span className="inline-flex rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-rose-600 shadow-sm dark:bg-slate-900 dark:text-rose-200">{positiveBalance ? "現金流穩定" : "支出高於收入"}</span>
          <h2 className="mt-3 text-2xl font-bold text-slate-950 dark:text-slate-50 sm:text-3xl">{hasBalance ? `${periodCopy.balanceLabel} ${formatMoney(dashboard.monthlyBalanceCents)}` : "從第一筆紀錄開始"}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">{hasBalance ? `收入 ${formatMoney(dashboard.monthlyIncomeCents)} · 支出 ${formatMoney(dashboard.monthlyExpenseCents)}` : "新增收入、支出或帳戶餘額後，摘要會自動更新。"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => onNavigate("transactions")}><Plus size={16} />記一筆</button>
            <button className="btn-secondary bg-white/80 dark:bg-slate-900" onClick={() => onNavigate("budgets")}><Banknote size={16} />設定預算</button>
            <button className="btn-secondary bg-white/80 dark:bg-slate-900" onClick={() => onNavigate("reminders")}><CalendarClock size={16} />查看提醒</button>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>可動用現金 {formatMoney(dashboard.availableCashCents)}</span>
            <span>信用卡待繳 {formatMoney(dashboard.monthlyCreditCardDueCents)}</span>
            <span>{periodCopy.balanceLabel} {formatMoney(dashboard.monthlyBalanceCents)}</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[132px_1fr] sm:items-center lg:grid-cols-[132px_1fr]">
          <div className="mx-auto flex h-32 w-32 flex-col items-center justify-center rounded-full border-[10px] border-emerald-200 bg-white text-center shadow-sm dark:border-emerald-900 dark:bg-slate-900">
            <strong className="text-3xl text-slate-950 dark:text-slate-50">{flowScore}</strong>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{periodCopy.scoreLabel}</span>
          </div>
          <div className="rounded-lg border border-white/80 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-slate-950 dark:text-slate-50">近月現金流</p>
            <span
              className={`text-sm font-semibold ${balanceDelta >= 0 ? "text-emerald-700 dark:text-emerald-200" : "text-rose-700 dark:text-rose-200"}`}
            >
              {positiveBalance ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              {balanceDelta >= 0 ? "+" : ""}{formatMoney(balanceDelta)}
            </span>
          </div>
            <CashFlowMiniChart data={monthlyTrend} />
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardFinanceCenter({ dashboard, period, onNavigate }: { dashboard: ReturnType<typeof summarizeDashboard>; period: DatePeriod; onNavigate: (page: Page) => void }) {
  const periodCopy = getDashboardPeriodCopy(period);
  const tiles = [
    { label: "可動用現金", value: formatMoney(dashboard.availableCashCents), className: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100", page: "accounts" as const },
    { label: periodCopy.balanceLabel, value: formatMoney(dashboard.monthlyBalanceCents), className: "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-100", page: "transactions" as const },
    { label: "信用卡待繳", value: formatMoney(dashboard.monthlyCreditCardDueCents), className: "bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-100", page: "cards" as const },
    { label: "預備金", value: `${dashboard.emergencyFundMonths.toFixed(1)} 個月`, className: "bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-100", page: "budgets" as const }
  ];
  return (
    <section className="finance-goal-panel rounded-lg border border-slate-200 p-4 shadow-subtle dark:border-slate-700 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950 dark:text-slate-50">關鍵資金</h2>
        </div>
        <button className="btn-primary" onClick={() => onNavigate("budgets")}><Banknote size={16} />規劃預算</button>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1.35fr_repeat(4,minmax(0,1fr))]">
        <button className="finance-focus-card min-h-[116px] rounded-lg p-4 text-left text-white shadow-md transition hover:-translate-y-0.5" onClick={() => onNavigate("reports")}>
          <p className="text-xs font-semibold text-emerald-200">整體資產狀態</p>
          <p className="mt-2 text-3xl font-bold">{formatMoney(dashboard.netWorthCents)}</p>
          <p className="mt-3 text-xs leading-5 text-slate-300">總資產 {formatMoney(dashboard.totalAssetsCents)} · 總負債 {formatMoney(dashboard.totalLiabilitiesCents)}</p>
        </button>
        {tiles.map((tile) => (
          <button key={tile.label} className={`finance-metric-tile rounded-lg p-4 text-left transition hover:-translate-y-0.5 ${tile.className}`} onClick={() => onNavigate(tile.page)}>
            <p className="text-xs font-semibold opacity-70">{tile.label}</p>
            <p className="mt-3 break-words text-xl font-bold">{tile.value}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function FinancialDecisionCenter({
  dashboard,
  monthlyTrend,
  transactions,
  creditCards,
  creditCardInstallments
}: {
  dashboard: ReturnType<typeof summarizeDashboard>;
  monthlyTrend: { month: string; incomeCents: number; expenseCents: number }[];
  transactions: Transaction[];
  creditCards: CreditCard[];
  creditCardInstallments: CreditCardInstallment[];
}) {
  const expenseNature = summarizeExpenseNature(transactions);
  const latestFlow = monthlyTrend.at(-1);
  const latestIncomeCents = latestFlow?.incomeCents ?? dashboard.monthlyIncomeCents;
  const latestExpenseCents = latestFlow?.expenseCents ?? dashboard.monthlyExpenseCents;
  const installmentDueCents = getInstallmentMonthlyDueCents(creditCardInstallments);
  const statementDueCents = creditCards.reduce((sum, card) => sum + card.currentStatementAmountCents, 0);
  const monthlyDebtPaymentCents = dashboard.monthlyLoanDueCents + Math.max(statementDueCents, installmentDueCents);
  const debtServiceRatio = calculateDebtServiceRatio(monthlyDebtPaymentCents, latestIncomeCents);
  const currentSavingsRate = calculateSavingsRate(latestIncomeCents, latestExpenseCents);
  const hasFinancialData = dashboard.totalAssetsCents > 0
    || dashboard.totalLiabilitiesCents > 0
    || monthlyTrend.some((item) => item.incomeCents > 0 || item.expenseCents > 0);
  const monthsWithIncome = monthlyTrend.filter((item) => item.incomeCents > 0);
  const averageSavingsRate = monthsWithIncome.length > 0
    ? monthsWithIncome.reduce((sum, item) => sum + calculateSavingsRate(item.incomeCents, item.expenseCents), 0) / monthsWithIncome.length
    : 0;
  const signals = hasFinancialData
    ? buildFinancialSignals({
        currentSavingsRate,
        debtServiceRatio,
        emergencyFundMonths: dashboard.emergencyFundMonths,
        necessaryExpenseRatio: expenseNature.necessaryCents / Math.max(expenseNature.totalCents, 1)
      })
    : [
        { title: "先建立收入基準", detail: "記錄每月收入，才能判讀儲蓄率與還款負擔。", tone: "watch" as const },
        { title: "標記必要支出", detail: "新增支出時標記必要性，系統會整理可調整空間。", tone: "watch" as const },
        { title: "補上帳戶餘額", detail: "帳戶餘額會用於淨資產與緊急預備金計算。", tone: "watch" as const }
      ];

  return (
    <section aria-labelledby="financial-decision-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-brand-700 dark:text-brand-200">財務判讀</p>
          <h2 id="financial-decision-title" className="mt-1 text-xl font-bold text-slate-950 dark:text-slate-50">先看趨勢，再決定下一步</h2>
        </div>
        <p className="max-w-xl text-sm text-slate-500 dark:text-slate-400">依目前帳本資料即時計算，不使用 AI，也不會增加 API 呼叫。</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <section className="panel min-w-0 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">儲蓄率趨勢</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">每月收入扣除支出後的保留比例</p>
            </div>
            <span className={`rounded-md px-2.5 py-1 text-sm font-semibold ${currentSavingsRate >= 0.2 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200" : currentSavingsRate >= 0 ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200"}`}>
              {hasFinancialData ? `本期 ${formatPercent(currentSavingsRate)}` : "等待資料"}
            </span>
          </div>
          <SavingsRateTrendChart data={monthlyTrend} />
        </section>
        <section className="panel lg:col-span-5">
          <h3 className="font-semibold">必要與彈性支出</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">找出短期可調整的支出空間</p>
          <ExpenseNatureChart transactions={transactions} />
        </section>
        <section className="panel lg:col-span-5">
          <h3 className="font-semibold">目前還款負擔</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">貸款與已記錄卡費占收入比例</p>
          <DebtBurdenChart
            monthlyIncomeCents={latestIncomeCents}
            monthlyDebtPaymentCents={monthlyDebtPaymentCents}
            ratio={debtServiceRatio}
          />
        </section>
        <section className="panel lg:col-span-3">
          <h3 className="font-semibold">緊急預備金</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">以六個月必要支出為目標</p>
          <EmergencyFundScale months={dashboard.emergencyFundMonths} />
        </section>
        <section className="panel lg:col-span-4">
          <h3 className="font-semibold">本期重點</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">依數據排序的三項財務訊號</p>
          <div className="mt-4 space-y-3">
            {signals.map((signal) => (
              <div key={signal.title} className="flex gap-3">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${signal.tone === "good" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200" : signal.tone === "watch" ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200"}`}>
                  {signal.tone === "good" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{signal.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{signal.detail}</p>
                </div>
              </div>
            ))}
            <div className="border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {monthsWithIncome.length > 0 ? `近月平均儲蓄率 ${formatPercent(averageSavingsRate)}` : "完成收入與支出紀錄後，這裡會自動顯示判讀結果。"}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function SavingsRateTrendChart({ data }: { data: { month: string; incomeCents: number; expenseCents: number }[] }) {
  const validData = data.filter((item) => item.incomeCents > 0);
  if (validData.length === 0) return <EmptyState label="記錄收入後會顯示每月儲蓄率趨勢" />;
  const values = validData.map((item) => calculateSavingsRate(item.incomeCents, item.expenseCents));
  const plotValues = values.map((value) => Math.max(-1, Math.min(1, value)));
  const width = 680;
  const height = 230;
  const padding = { top: 24, right: 24, bottom: 38, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(0.4, ...plotValues);
  const minValue = Math.min(-0.4, ...plotValues);
  const range = Math.max(maxValue - minValue, 0.01);
  const xFor = (index: number) => validData.length === 1 ? padding.left + plotWidth / 2 : padding.left + (index / (validData.length - 1)) * plotWidth;
  const yFor = (value: number) => padding.top + ((maxValue - value) / range) * plotHeight;
  const zeroY = yFor(0);
  const targetY = yFor(0.2);
  const linePoints = plotValues.map((value, index) => `${xFor(index)},${yFor(value)}`).join(" ");
  const areaPoints = `${xFor(0)},${zeroY} ${linePoints} ${xFor(plotValues.length - 1)},${zeroY}`;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  return (
    <div className="mt-4">
      <div className="overflow-x-auto">
        <svg className="min-w-[620px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="每月儲蓄率趨勢">
          <defs>
            <linearGradient id="savings-rate-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((ratio) => {
            const y = padding.top + ratio * plotHeight;
            return <line key={ratio} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />;
          })}
          {targetY >= padding.top && targetY <= height - padding.bottom && (
            <>
              <line x1={padding.left} x2={width - padding.right} y1={targetY} y2={targetY} stroke="#0284c7" strokeDasharray="5 5" />
              <text x={width - padding.right} y={targetY - 6} textAnchor="end" className="fill-sky-600 text-[11px] dark:fill-sky-300">參考 20%</text>
            </>
          )}
          <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="currentColor" className="text-slate-400 dark:text-slate-600" />
          <polygon points={areaPoints} fill="url(#savings-rate-fill)" />
          <polyline points={linePoints} fill="none" stroke="#059669" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {plotValues.map((value, index) => (
            <g key={validData[index].month}>
              <circle cx={xFor(index)} cy={yFor(value)} r="5" fill={values[index] >= 0 ? "#059669" : "#dc2626"} stroke="white" strokeWidth="2">
                <title>{`${validData[index].month} 儲蓄率 ${formatPercent(values[index])}`}</title>
              </circle>
              <text x={xFor(index)} y={height - 12} textAnchor="middle" className="fill-slate-500 text-xs dark:fill-slate-400">{validData[index].month.slice(5)}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-2 grid grid-cols-3 divide-x divide-slate-200 text-center dark:divide-slate-800">
        <ChartSummary label="目前" value={formatPercent(values.at(-1) ?? 0)} />
        <ChartSummary label="期間平均" value={formatPercent(average)} />
        <ChartSummary label="參考目標" value="20%" />
      </div>
    </div>
  );
}

function ExpenseNatureChart({ transactions }: { transactions: Transaction[] }) {
  const summary = summarizeExpenseNature(transactions);
  if (summary.totalCents <= 0) return <EmptyState label="記錄支出後會顯示必要與彈性支出比例" />;
  const necessaryRatio = summary.necessaryCents / summary.totalCents;
  const recurringRatio = summary.recurringCents / summary.totalCents;
  return (
    <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
      <DonutChart
        segments={[
          { label: "必要支出", value: summary.necessaryCents, color: "#0284c7" },
          { label: "彈性支出", value: summary.flexibleCents, color: "#f59e0b" }
        ]}
        centerLabel="必要占比"
        centerValue={formatPercent(necessaryRatio)}
      />
      <div className="min-w-0 flex-1 space-y-3">
        <Legend color="#0284c7" label="必要" value={formatMoney(summary.necessaryCents)} />
        <Legend color="#f59e0b" label="彈性" value={formatMoney(summary.flexibleCents)} />
        <Progress label="固定支出占比" value={recurringRatio} helper={formatPercent(recurringRatio)} colorClass="bg-violet-500" />
      </div>
    </div>
  );
}

function DebtBurdenChart({
  monthlyIncomeCents,
  monthlyDebtPaymentCents,
  ratio
}: {
  monthlyIncomeCents: number;
  monthlyDebtPaymentCents: number;
  ratio: number;
}) {
  if (monthlyIncomeCents <= 0 && monthlyDebtPaymentCents <= 0) return <EmptyState label="記錄收入、卡費或貸款後會顯示還款負擔" />;
  const disposableCents = Math.max(0, monthlyIncomeCents - monthlyDebtPaymentCents);
  const tone = ratio > 0.5 ? "偏高" : ratio > 0.35 ? "需留意" : "穩定";
  return (
    <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
      <DonutChart
        segments={[
          { label: "本月還款", value: monthlyDebtPaymentCents, color: ratio > 0.5 ? "#dc2626" : ratio > 0.35 ? "#f59e0b" : "#059669" },
          { label: "還款後收入", value: disposableCents, color: "#cbd5e1" }
        ]}
        centerLabel="收入占比"
        centerValue={monthlyIncomeCents > 0 ? formatPercent(ratio) : "待補收入"}
      />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500 dark:text-slate-400">判讀</span>
          <span className={`font-semibold ${ratio > 0.5 ? "text-rose-600 dark:text-rose-300" : ratio > 0.35 ? "text-amber-600 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{tone}</span>
        </div>
        <Legend color="#dc2626" label="應繳" value={formatMoney(monthlyDebtPaymentCents)} />
        <Legend color="#94a3b8" label="收入" value={formatMoney(monthlyIncomeCents)} />
        <Progress label="還款負擔率" value={ratio} helper={monthlyIncomeCents > 0 ? formatPercent(ratio) : "-"} colorClass={ratio > 0.5 ? "bg-rose-500" : ratio > 0.35 ? "bg-amber-500" : "bg-emerald-500"} />
      </div>
    </div>
  );
}

function EmergencyFundScale({ months }: { months: number }) {
  const bounded = Math.max(0, Math.min(months, 6));
  return (
    <div className="mt-6">
      <p className="text-4xl font-bold text-slate-950 dark:text-slate-50">{months.toFixed(1)}<span className="ml-1 text-base font-semibold text-slate-500 dark:text-slate-400">個月</span></p>
      <div className="relative mt-7">
        <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div className={`h-3 rounded-full transition-all ${months >= 6 ? "bg-emerald-500" : months >= 3 ? "bg-sky-500" : "bg-amber-500"}`} style={{ width: `${(bounded / 6) * 100}%` }} />
        </div>
        {[1, 3, 6].map((target) => (
          <span key={target} className="absolute top-[-5px] h-5 w-px bg-slate-500/60" style={{ left: `${(target / 6) * 100}%` }} />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span>0</span>
        <span>3 個月</span>
        <span>6 個月</span>
      </div>
      <p className="mt-5 text-sm leading-6 text-slate-600 dark:text-slate-300">
        {months >= 6 ? "已達六個月參考目標，可持續維持流動性。" : months >= 3 ? "已有基本緩衝，下一步可朝六個月累積。" : "建議先累積至少三個月的必要支出。"}
      </p>
    </div>
  );
}

function ChartSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function buildFinancialSignals({
  currentSavingsRate,
  debtServiceRatio,
  emergencyFundMonths,
  necessaryExpenseRatio
}: {
  currentSavingsRate: number;
  debtServiceRatio: number;
  emergencyFundMonths: number;
  necessaryExpenseRatio: number;
}) {
  const savingsSignal = currentSavingsRate >= 0.2
    ? { title: "儲蓄率達到參考值", detail: `目前保留 ${formatPercent(currentSavingsRate)} 的收入。`, tone: "good" as const }
    : currentSavingsRate >= 0
      ? { title: "儲蓄空間仍可增加", detail: `目前儲蓄率 ${formatPercent(currentSavingsRate)}，可先從彈性支出調整。`, tone: "watch" as const }
      : { title: "本期現金流為負", detail: `支出超過收入 ${formatPercent(Math.abs(currentSavingsRate))}。`, tone: "risk" as const };
  const debtSignal = debtServiceRatio > 0.5
    ? { title: "還款負擔偏高", detail: `估計占本期收入 ${formatPercent(debtServiceRatio)}，優先檢查高利率負債。`, tone: "risk" as const }
    : debtServiceRatio > 0.35
      ? { title: "還款負擔需留意", detail: `估計占本期收入 ${formatPercent(debtServiceRatio)}。`, tone: "watch" as const }
      : { title: "還款負擔在穩定區間", detail: `估計占本期收入 ${formatPercent(debtServiceRatio)}。`, tone: "good" as const };
  const reserveSignal = emergencyFundMonths >= 6
    ? { title: "預備金已達六個月", detail: "短期風險緩衝較完整。", tone: "good" as const }
    : emergencyFundMonths >= 3
      ? { title: "預備金已有基本緩衝", detail: `目前約 ${emergencyFundMonths.toFixed(1)} 個月，可逐步補到六個月。`, tone: "watch" as const }
      : { title: "優先補足預備金", detail: `目前約 ${emergencyFundMonths.toFixed(1)} 個月，先以三個月必要支出為目標。`, tone: "risk" as const };
  const spendingSignal = necessaryExpenseRatio > 0.8
    ? { title: "必要支出占比較高", detail: `目前約 ${formatPercent(necessaryExpenseRatio)}，可調整空間較有限。`, tone: "watch" as const }
    : null;

  return spendingSignal ? [savingsSignal, debtSignal, spendingSignal] : [savingsSignal, debtSignal, reserveSignal];
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
    <div className={`panel min-h-24 border-l-4 ${theme.border} bg-white/95 dark:bg-slate-900`}>
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
    <section className={`overflow-hidden rounded-lg border bg-gradient-to-br p-4 text-white shadow-card sm:p-5 ${toneClass}`}>
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
                <text x={center} y={height - 12} textAnchor="middle" className="fill-slate-500 text-xs dark:fill-slate-400">{item.month.slice(5)}</text>
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
  if (data.length === 0) return <EmptyState label="所選期間尚無支出資料" />;
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
      {data.length > topItems.length && <p className="text-xs text-slate-500 dark:text-slate-400">其餘 {data.length - topItems.length} 個分類合併保留在報表資料中。</p>}
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
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{accountTypeLabels[account.type]} · {formatPercent(account.balanceCents / Math.max(total, 1))}</p>
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
  const creditSummary = summarizeCreditCardLimits(creditCards, installments);
  const cardDebt = creditSummary.currentStatementCents + creditSummary.unbilledCents;
  const installmentDebt = creditSummary.installmentOccupancyCents;
  const loanDebt = loans.reduce((sum, loan) => sum + summarizeLoanProgress(loan).remainingPrincipalCents, 0);
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

function getInstallmentMonthlyDueCents(installments: CreditCardInstallment[]): number {
  return installments
    .filter((installment) => installment.status === "active")
    .reduce((sum, installment) => sum + installment.monthlyPaymentCents, 0);
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
  const totalAmountCents = active.reduce((sum, installment) => sum + installment.totalAmountCents, 0);
  const paidAmountCents = active.reduce((sum, installment) => sum + installment.paidAmountCents, 0);
  const remainingAmountCents = active.reduce((sum, installment) => sum + installment.remainingAmountCents, 0);
  const additionalOccupancyCents = active
    .filter((installment) => !installment.includedInCardBalance)
    .reduce((sum, installment) => sum + installment.remainingAmountCents, 0);
  return (
    <div className="mt-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Info label="分期原始總額" value={formatMoney(totalAmountCents)} />
        <Info label="累計已還款" value={formatMoney(paidAmountCents)} />
        <Info label="分期剩餘本金" value={formatMoney(remainingAmountCents)} />
        <Info label="額外占用額度" value={formatMoney(additionalOccupancyCents)} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="text-left text-slate-500 dark:text-slate-400">
              <th>卡片</th>
              <th>項目</th>
              <th>分期類型</th>
              <th>額度計入</th>
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
                <td>{installment.installmentType === "statement" ? "帳單分期" : "單筆分期"}</td>
                <td>{installment.includedInCardBalance ? "已含帳單" : "額外占用"}</td>
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
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatPercent(item.amountCents / Math.max(total, 1))}</p>
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
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatPercent(item.amountCents / Math.max(total, 1))}</p>
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
                <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>預算</span>
                  <span>{formatMoney(row.budgetCents)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(4, (row.budgetCents / max) * 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
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
      <text x="78" y="72" textAnchor="middle" className="fill-slate-500 text-xs dark:fill-slate-400">{centerLabel}</text>
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
      <span className="min-w-10 text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function getChartColor(index: number) {
  return chartPalette[index % chartPalette.length];
}

type ImportSection = "account" | "card" | "installment" | "loan";

function DataImportPage({
  accounts,
  cards,
  installments,
  loans,
  onAddAccount,
  onAddCard,
  onAddInstallment,
  onAddLoan,
  onNavigate,
  notify
}: {
  accounts: FinancialAccount[];
  cards: CreditCard[];
  installments: CreditCardInstallment[];
  loans: Loan[];
  onAddAccount: (formData: FormData) => Promise<void>;
  onAddCard: (card: CreditCard) => Promise<void>;
  onAddInstallment: (installment: CreditCardInstallment) => Promise<void>;
  onAddLoan: (loan: Loan) => Promise<void>;
  onNavigate: (page: Page) => void;
  notify: (type: ToastType, message: string) => void;
}) {
  const [section, setSection] = useState<ImportSection>("account");
  const sections: { id: ImportSection; label: string; count: number; icon: typeof WalletCards }[] = [
    { id: "account", label: "帳戶餘額", count: accounts.length, icon: WalletCards },
    { id: "card", label: "信用卡現況", count: cards.length, icon: CreditCardIcon },
    { id: "installment", label: "既有分期", count: installments.length, icon: ReceiptText },
    { id: "loan", label: "貸款進度", count: loans.length, icon: Landmark }
  ];

  function importAccount(formData: FormData) {
    const openingDate = String(formData.get("openingDate") ?? today);
    const note = String(formData.get("note") ?? "").trim();
    formData.set("note", [note, `餘額截至 ${openingDate.replace(/-/g, "/")}`].filter(Boolean).join(" · "));
    void onAddAccount(formData);
  }

  function importCard(formData: FormData) {
    const limit = parseMoneyToCents(String(formData.get("limit") ?? ""));
    const statementAmount = parseMoneyToCents(String(formData.get("statementAmount") ?? "0"));
    const installmentBalance = parseMoneyToCents(String(formData.get("installmentBalance") ?? "0"));
    const knownUsed = parseMoneyToCents(String(formData.get("knownUsed") ?? "0"));
    const unbilledRaw = String(formData.get("unbilledAmount") ?? "").trim();
    let unbilledAmount = parseMoneyToCents(unbilledRaw || "0");
    if (knownUsed > 0 && !unbilledRaw) {
      if (knownUsed < statementAmount + installmentBalance) return notify("error", "已用額度不可小於本期帳單與分期餘額合計");
      unbilledAmount = knownUsed - statementAmount - installmentBalance;
    }
    const minimumPayment = parseMoneyToCents(String(formData.get("minimumPayment") ?? "0"));
    const annualFee = parseMoneyToCents(String(formData.get("annualFee") ?? "0"));
    const statementDay = Number(formData.get("statementDay"));
    const paymentDueDay = Number(formData.get("paymentDueDay"));
    const last4 = String(formData.get("last4") ?? "").trim();
    const validation = combineValidations(
      validatePositiveAmount(limit, "信用額度"),
      validateNonNegativeAmount(statementAmount, "本期帳單"),
      validateNonNegativeAmount(unbilledAmount, "未出帳金額"),
      validateNonNegativeAmount(installmentBalance, "分期餘額"),
      validateNonNegativeAmount(minimumPayment, "最低應繳"),
      validateIntegerRange(statementDay, 1, 31, "結帳日"),
      validateIntegerRange(paymentDueDay, 1, 31, "繳款截止日")
    );
    if (!validation.valid) return notify("error", validation.errors[0]);
    if (!/^\d{4}$/.test(last4)) return notify("error", "卡片末四碼需為 4 位數字");
    if (statementAmount + unbilledAmount + installmentBalance > limit && !window.confirm("輸入的已用額度超過信用額度，仍要依銀行現況匯入嗎？")) return;
    const now = new Date().toISOString();
    void onAddCard({
      id: crypto.randomUUID(), userId: localUserId,
      name: String(formData.get("name") ?? "").trim(), issuer: String(formData.get("issuer") ?? "").trim(), last4,
      creditLimitCents: limit, statementDay, paymentDueDay,
      currentStatementAmountCents: statementAmount, unbilledAmountCents: unbilledAmount,
      minimumPaymentCents: minimumPayment, installmentBalanceCents: installmentBalance,
      autoPayAccountId: String(formData.get("autoPayAccountId") ?? "") || undefined,
      annualFeeCents: annualFee, annualFeeWaiver: String(formData.get("waiver") ?? "").trim() || undefined,
      note: `資料截至 ${String(formData.get("openingDate") ?? today).replace(/-/g, "/")}`,
      isActive: true, recommendedUtilizationRate: 0.3, createdAt: now, updatedAt: now
    });
  }

  function importInstallment(formData: FormData) {
    if (cards.length === 0) return notify("error", "請先匯入信用卡");
    const totalAmount = parseMoneyToCents(String(formData.get("totalAmount") ?? ""));
    const periods = Number(formData.get("periods"));
    const paidPeriods = Number(formData.get("paidPeriods"));
    const monthlyPayment = parseMoneyToCents(String(formData.get("monthlyPayment") ?? "0"));
    const paidRaw = String(formData.get("paidAmount") ?? "").trim();
    const remainingRaw = String(formData.get("remainingAmount") ?? "").trim();
    const paidAmount = paidRaw ? parseMoneyToCents(paidRaw) : undefined;
    const remainingAmount = remainingRaw ? parseMoneyToCents(remainingRaw) : undefined;
    const annualRate = Number(formData.get("annualRate") ?? 0) / 100;
    const startedOn = String(formData.get("startedOn") ?? "");
    const nextDueDate = String(formData.get("nextDueDate") ?? "");
    const validation = combineValidations(
      validatePositiveAmount(totalAmount, "分期總額"),
      validateNonNegativeAmount(monthlyPayment, "每期應繳"),
      validateNonNegativeAmount(paidAmount ?? 0, "累計已繳金額"),
      validateNonNegativeAmount(remainingAmount ?? 0, "銀行剩餘金額"),
      validateAnnualRate(annualRate),
      validateIntegerRange(periods, 1, 600, "總期數"),
      validateIntegerRange(paidPeriods, 0, periods, "已繳期數"),
      validateDateRange(startedOn, nextDueDate || undefined)
    );
    if (!validation.valid) return notify("error", validation.errors[0]);
    const balance = calculateInstallmentOpeningBalance({
      totalAmountCents: totalAmount, periods, paidPeriods,
      monthlyPaymentCents: monthlyPayment || undefined,
      paidAmountCents: paidAmount,
      remainingAmountCents: remainingAmount
    });
    const now = new Date().toISOString();
    void onAddInstallment({
      id: crypto.randomUUID(), userId: localUserId,
      creditCardId: String(formData.get("creditCardId")), merchant: String(formData.get("merchant") ?? "").trim() || undefined,
      installmentType: String(formData.get("installmentType") ?? "single_purchase") as CreditCardInstallment["installmentType"],
      includedInCardBalance: formData.get("includedInCardBalance") === "on",
      totalAmountCents: totalAmount, annualRate, periods, paidPeriods,
      monthlyPaymentCents: balance.monthlyPaymentCents, paidAmountCents: balance.paidAmountCents,
      remainingAmountCents: balance.remainingAmountCents, startedOn,
      nextDueDate: nextDueDate || undefined, status: balance.remainingAmountCents === 0 ? "paid_off" : "active",
      note: String(formData.get("note") ?? "").trim() || undefined,
      metadata: { opening_balance_date: String(formData.get("openingDate") ?? today), source: "opening_balance" },
      createdAt: now, updatedAt: now
    });
  }

  function importLoan(formData: FormData) {
    const principal = parseMoneyToCents(String(formData.get("principal") ?? ""));
    const payment = parseMoneyToCents(String(formData.get("payment") ?? ""));
    const remainingRaw = String(formData.get("remaining") ?? "").trim();
    const remainingInput = parseMoneyToCents(remainingRaw || "0");
    const paidAmountInput = parseMoneyToCents(String(formData.get("paidAmount") ?? "0"));
    const prepaidInterest = parseMoneyToCents(String(formData.get("prepaidInterest") ?? "0"));
    const termMonths = Number(formData.get("termMonths"));
    const paidPeriods = Number(formData.get("paidPeriods"));
    const annualRate = Number(formData.get("annualRate") ?? 0) / 100;
    const paymentDay = Number(formData.get("paymentDay"));
    const trackingMode = String(formData.get("trackingMode") ?? "amortized") as LoanTrackingMode;
    const useBankBalance = formData.get("balanceSource") === "remaining";
    if (useBankBalance && !remainingRaw) return notify("error", "請輸入銀行目前顯示的剩餘本金，或改用已繳期數估算");
    const validation = combineValidations(
      validatePositiveAmount(principal, "原始本金"), validatePositiveAmount(payment, "每期應繳"),
      validateNonNegativeAmount(remainingInput, "銀行剩餘本金"), validateNonNegativeAmount(paidAmountInput, "累計實付"),
      validateNonNegativeAmount(prepaidInterest, "預付利息"), validateAnnualRate(annualRate),
      validateIntegerRange(termMonths, 1, 600, "貸款期數"), validateIntegerRange(paidPeriods, 0, termMonths, "已繳期數"),
      validateIntegerRange(paymentDay, 1, 31, "還款日"), validateDateRange(String(formData.get("startDate") ?? ""))
    );
    if (!validation.valid) return notify("error", validation.errors[0]);
    if (useBankBalance && remainingInput > principal) return notify("error", "銀行剩餘本金不可高於原始本金");
    const effectivePaidAmount = paidAmountInput > 0
      ? paidAmountInput
      : payment * paidPeriods + (trackingMode === "prepaid_interest" ? prepaidInterest : 0);
    const progress = calculateLoanProgress({
      originalPrincipalCents: principal, remainingPrincipalCents: useBankBalance ? remainingInput : principal,
      annualRate, termMonths, paidPeriods, paymentPerPeriodCents: payment, paidAmountCents: effectivePaidAmount,
      trackingMode, prepaidInterestCents: prepaidInterest, autoCalculate: !useBankBalance
    });
    const now = new Date().toISOString();
    void onAddLoan({
      id: crypto.randomUUID(), userId: localUserId,
      name: String(formData.get("name") ?? "").trim(), type: String(formData.get("loanType") ?? "other") as Loan["type"],
      institution: String(formData.get("institution") ?? "").trim() || undefined,
      originalPrincipalCents: principal, remainingPrincipalCents: progress.remainingPrincipalCents,
      annualRate, termMonths, paidPeriods, paidAmountCents: progress.totalCashPaidCents,
      monthlyPaymentDay: paymentDay, startDate: String(formData.get("startDate")),
      repaymentMethod: trackingMode === "prepaid_interest" ? "fixed_payment" : "equal_payment",
      paymentPerPeriodCents: payment,
      metadata: { loan_tracking_mode: trackingMode, prepaid_interest_cents: prepaidInterest, auto_calculate_progress: !useBankBalance, opening_balance_date: String(formData.get("openingDate") ?? today), source: "opening_balance" },
      status: progress.remainingPrincipalCents === 0 ? "paid_off" : "active", createdAt: now, updatedAt: now
    });
  }

  return (
    <div className="space-y-4">
      <section className="panel overflow-hidden">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">從今天的真實狀態開始</p>
            <h2 className="mt-1 text-xl font-bold">不用補登多年流水帳</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">先輸入銀行與帳單目前顯示的餘額，再視需要匯入歷史交易。期初資料只建立現況，不會重複計入本月收入或支出。</p>
          </div>
          <button className="btn-secondary shrink-0" onClick={() => onNavigate("transactions")}><Upload size={16} />匯入交易 CSV</button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {sections.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={`flex min-h-16 items-center gap-3 rounded-md border px-3 text-left transition ${section === item.id ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`} onClick={() => setSection(item.id)}><Icon size={18} /><span className="min-w-0"><span className="block font-semibold">{item.label}</span><span className="block text-xs opacity-70">目前 {item.count} 筆</span></span></button>;
          })}
        </div>
      </section>

      {section === "account" && <section className="panel max-w-3xl">
        <h2 className="text-lg font-semibold">匯入帳戶目前餘額</h2>
        <p className="helper-text mt-1">以網銀或存摺目前餘額為準，不會建立一筆收入。</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleFormSubmit(importAccount)}>
          <Field label="帳戶名稱"><input className="input" name="name" required /></Field>
          <Field label="帳戶類型"><select className="input" name="type">{Object.entries(accountTypeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="金融機構"><input className="input" name="institution" /></Field>
          <Field label="目前餘額"><input className="input" name="balance" inputMode="decimal" required /></Field>
          <Field label="餘額日期"><input className="input" name="openingDate" type="date" defaultValue={today} required /></Field>
          <Field label="備註"><input className="input" name="note" /></Field>
          <label className="flex items-center gap-2 text-sm"><input name="available" type="checkbox" defaultChecked />列入可動用現金</label>
          <label className="flex items-center gap-2 text-sm"><input name="emergency" type="checkbox" defaultChecked />列入緊急預備金</label>
          <button className="btn-primary sm:col-span-2" type="submit"><Plus size={16} />匯入帳戶</button>
        </form>
      </section>}

      {section === "card" && <section className="panel max-w-4xl">
        <h2 className="text-lg font-semibold">匯入信用卡帳務現況</h2>
        <p className="helper-text mt-1">若只知道銀行顯示的已用額度，可留空「未出帳」，系統會自動補差額。</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleFormSubmit(importCard)}>
          <Field label="信用卡名稱"><input className="input" name="name" required /></Field><Field label="發卡銀行"><input className="input" name="issuer" required /></Field>
          <Field label="末四碼"><input className="input" name="last4" maxLength={4} inputMode="numeric" required /></Field><Field label="信用額度"><input className="input" name="limit" inputMode="decimal" required /></Field>
          <Field label="銀行顯示已用額度"><input className="input" name="knownUsed" inputMode="decimal" placeholder="可留空" /></Field><Field label="本期帳單"><input className="input" name="statementAmount" inputMode="decimal" defaultValue="0" /></Field>
          <Field label="下期未出帳"><input className="input" name="unbilledAmount" inputMode="decimal" placeholder="留空可由已用額度回推" /></Field><Field label="尚未逐筆建檔的分期餘額"><input className="input" name="installmentBalance" inputMode="decimal" defaultValue="0" /></Field>
          <Field label="最低應繳"><input className="input" name="minimumPayment" inputMode="decimal" defaultValue="0" /></Field><Field label="年費"><input className="input" name="annualFee" inputMode="decimal" defaultValue="0" /></Field>
          <Field label="結帳日"><input className="input" name="statementDay" type="number" min={1} max={31} required /></Field><Field label="繳款截止日"><input className="input" name="paymentDueDay" type="number" min={1} max={31} required /></Field>
          <Field label="資料日期"><input className="input" name="openingDate" type="date" defaultValue={today} required /></Field><Field label="自動扣款帳戶"><select className="input" name="autoPayAccountId"><option value="">未設定</option>{accounts.map((account)=><option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
          <button className="btn-primary sm:col-span-2" type="submit"><Plus size={16} />匯入信用卡</button>
        </form>
      </section>}

      {section === "installment" && <section className="panel max-w-4xl">
        <h2 className="text-lg font-semibold">匯入進行中的信用卡分期</h2>
        <p className="helper-text mt-1">銀行剩餘金額最準確；不知道時再用已繳期數估算。</p>
        {cards.length === 0 ? <EmptyState label="請先在上方匯入至少一張信用卡。" /> : <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleFormSubmit(importInstallment)}>
          <Field label="信用卡"><select className="input" name="creditCardId">{cards.map((card)=><option key={card.id} value={card.id}>{card.name}（{card.last4}）</option>)}</select></Field><Field label="商家或項目"><input className="input" name="merchant" required /></Field>
          <Field label="分期類型"><select className="input" name="installmentType"><option value="single_purchase">單筆消費分期</option><option value="statement">帳單分期</option></select></Field><Field label="分期總額"><input className="input" name="totalAmount" inputMode="decimal" required /></Field>
          <Field label="總期數"><input className="input" name="periods" type="number" min={1} defaultValue={12} required /></Field><Field label="已繳期數"><input className="input" name="paidPeriods" type="number" min={0} defaultValue={0} required /></Field>
          <Field label="銀行顯示剩餘金額"><input className="input" name="remainingAmount" inputMode="decimal" placeholder="最優先，可留空" /></Field><Field label="累計已繳金額"><input className="input" name="paidAmount" inputMode="decimal" placeholder="可留空" /></Field>
          <Field label="每期應繳"><input className="input" name="monthlyPayment" inputMode="decimal" placeholder="可留空自動估算" /></Field><Field label="年利率 %"><input className="input" name="annualRate" inputMode="decimal" defaultValue="0" /></Field>
          <Field label="開始日"><input className="input" name="startedOn" type="date" required /></Field><Field label="下次應繳日"><input className="input" name="nextDueDate" type="date" /></Field>
          <Field label="資料日期"><input className="input" name="openingDate" type="date" defaultValue={today} required /></Field><Field label="備註"><input className="input" name="note" /></Field>
          <label className="sm:col-span-2 flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700"><input className="mt-0.5" name="includedInCardBalance" type="checkbox" defaultChecked /><span><span className="block font-medium">已包含在信用卡已用額度</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">一般銀行顯示的已用額度通常已包含分期餘額，維持勾選可避免重複計算。</span></span></label>
          <button className="btn-primary sm:col-span-2" type="submit"><Plus size={16} />匯入分期</button>
        </form>}
      </section>}

      {section === "loan" && <section className="panel max-w-4xl">
        <h2 className="text-lg font-semibold">匯入貸款目前進度</h2>
        <p className="helper-text mt-1">有銀行剩餘本金就直接採用；沒有時才依期數、利率與每期金額估算。</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleFormSubmit(importLoan)}>
          <Field label="貸款名稱"><input className="input" name="name" required /></Field><Field label="金融機構"><input className="input" name="institution" /></Field>
          <Field label="貸款類型"><select className="input" name="loanType"><option value="personal">信用貸款</option><option value="mortgage">房屋貸款</option><option value="auto">汽車貸款</option><option value="motorcycle">機車貸款</option><option value="student">學貸</option><option value="family">親友借款</option><option value="other">其他</option></select></Field><Field label="還款方式"><select className="input" name="trackingMode"><option value="amortized">本息按月攤還</option><option value="prepaid_interest">利息預付，本金按期攤還</option></select></Field>
          <Field label="原始本金"><input className="input" name="principal" inputMode="decimal" required /></Field><Field label="銀行剩餘本金"><input className="input" name="remaining" inputMode="decimal" placeholder="依銀行 App 或帳單填寫" /></Field>
          <Field label="總期數"><input className="input" name="termMonths" type="number" min={1} required /></Field><Field label="已繳期數"><input className="input" name="paidPeriods" type="number" min={0} defaultValue={0} required /></Field>
          <Field label="每期應繳"><input className="input" name="payment" inputMode="decimal" required /></Field><Field label="累計實付"><input className="input" name="paidAmount" inputMode="decimal" defaultValue="0" /></Field>
          <Field label="合約年利率 %"><input className="input" name="annualRate" inputMode="decimal" defaultValue="0" required /></Field><Field label="預付利息（如有）"><input className="input" name="prepaidInterest" inputMode="decimal" defaultValue="0" /></Field>
          <Field label="每月還款日"><input className="input" name="paymentDay" type="number" min={1} max={31} required /></Field><Field label="貸款起始日"><input className="input" name="startDate" type="date" required /></Field>
          <Field label="資料日期"><input className="input" name="openingDate" type="date" defaultValue={today} required /></Field><Field label="餘額依據"><select className="input" name="balanceSource"><option value="remaining">以銀行剩餘本金為準</option><option value="periods">依已繳期數估算</option></select></Field>
          <button className="btn-primary sm:col-span-2" type="submit"><Plus size={16} />匯入貸款</button>
        </form>
      </section>}
    </div>
  );
}

function TransactionsPage({
  accounts,
  creditCards,
  installments,
  loans,
  investmentAssets,
  transactions,
  period,
  preset,
  onPresetConsumed,
  onAdd,
  onDelete,
  onCsvUpload,
  csvPreview,
  onImportCsv,
  rememberedCategories
}: {
  accounts: FinancialAccount[];
  creditCards: CreditCard[];
  installments: CreditCardInstallment[];
  loans: Loan[];
  investmentAssets: InvestmentAsset[];
  transactions: Transaction[];
  period: DatePeriod;
  preset: TransactionPreset | null;
  onPresetConsumed: () => void;
  onAdd: (formData: FormData) => void;
  onDelete: (id: string) => void;
  onCsvUpload: (file: File | null) => void;
  csvPreview: ReturnType<typeof parseTransactionsCsv>;
  onImportCsv: () => void;
  rememberedCategories: string[];
}) {
  const [transactionType, setTransactionType] = useState<Transaction["type"]>("expense");
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<ExpensePaymentMethod>("account");
  const [selectedLoanId, setSelectedLoanId] = useState("");
  const [selectedCreditCardId, setSelectedCreditCardId] = useState("");

  useEffect(() => {
    if (!preset) return;
    setTransactionType(preset.type);
    if (preset.type === "credit_card_payment") setSelectedCreditCardId(preset.creditCardId);
    if (preset.type === "loan_payment" || preset.type === "loan_drawdown") setSelectedLoanId(preset.loanId);
    onPresetConsumed();
  }, [onPresetConsumed, preset]);
  const activeAccounts = accounts.filter((account) => account.isActive);
  const activeCreditCards = creditCards.filter((card) => card.isActive);
  const selectableInstallments = installments.filter(
    (installment) => installment.creditCardId === selectedCreditCardId && installment.status === "active" && installment.remainingAmountCents > 0
  );
  const activeLoans = loans.filter((loan) => loan.status === "active" && loan.remainingPrincipalCents > 0);
  const activeReserveCredits = loans.filter(
    (loan) => loan.status === "active" && loan.type === "reserve_credit" && (loan.creditLimitCents ?? 0) > loan.remainingPrincipalCents
  );
  const activeInvestmentAssets = investmentAssets.filter((asset) => asset.isActive && (transactionType === "investment_buy" || asset.quantity > 0));
  const selectableLoans = transactionType === "loan_drawdown" ? activeReserveCredits : activeLoans;
  const selectedLoan = selectableLoans.find((loan) => loan.id === selectedLoanId);
  useEffect(() => {
    if (selectedLoanId && !selectableLoans.some((loan) => loan.id === selectedLoanId)) setSelectedLoanId("");
  }, [selectableLoans, selectedLoanId]);
  const needsAccount = transactionType !== "expense" || expensePaymentMethod === "account";
  const needsCreditCard = (transactionType === "expense" && expensePaymentMethod === "credit_card") || transactionType === "credit_card_payment";
  const needsLoan = transactionType === "loan_payment" || transactionType === "loan_drawdown";
  const needsTransferAccount = ["transfer", "deposit_transfer"].includes(transactionType);
  const needsInvestmentAsset = ["investment_buy", "investment_sell"].includes(transactionType);
  const accountFieldLabel = ["income", "investment_sell", "loan_drawdown"].includes(transactionType)
    ? "入帳帳戶"
    : ["credit_card_payment", "loan_payment"].includes(transactionType)
      ? "扣款帳戶"
      : transactionType === "transfer" || transactionType === "deposit_transfer"
        ? "轉出帳戶"
        : "付款帳戶";
  const periodCopy = getDashboardPeriodCopy(period);
  const periodIncomeCents = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const periodExpenseCents = transactions
    .filter((transaction) => transaction.type === "expense" || transaction.type === "credit_card_purchase")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const periodBalanceCents = periodIncomeCents - periodExpenseCents;
  const periodTransferCents = transactions
    .filter((transaction) => ["transfer", "credit_card_payment", "loan_payment", "loan_drawdown", "deposit_transfer", "investment_buy", "investment_sell"].includes(transaction.type))
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const transactionCategoryBreakdown = Object.entries(
    transactions
      .filter((transaction) => transaction.type === "expense" || transaction.type === "credit_card_purchase")
      .reduce<Record<string, number>>((acc, transaction) => {
        acc[transaction.category] = (acc[transaction.category] ?? 0) + transaction.amountCents;
        return acc;
      }, {})
  )
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 6);

  function paymentSourceLabel(transaction: Transaction) {
    const accountName = transaction.accountId
      ? accounts.find((candidate) => candidate.id === transaction.accountId)?.name ?? "帳戶"
      : "";
    if (transaction.loanId) {
      const loan = loans.find((candidate) => candidate.id === transaction.loanId);
      return transaction.type === "loan_drawdown"
        ? `${loan?.name ?? "備用金"} → ${accountName || "帳戶"}`
        : `${accountName || "帳戶"} → ${loan?.name ?? "貸款"}`;
    }
    if (transaction.creditCardId) {
      const card = creditCards.find((candidate) => candidate.id === transaction.creditCardId);
      const cardName = card ? `${card.name}（${card.last4}）` : "信用卡";
      return transaction.type === "credit_card_payment" ? `${accountName || "帳戶"} → ${cardName}` : cardName;
    }
    if (transaction.investmentAssetId) {
      const asset = investmentAssets.find((candidate) => candidate.id === transaction.investmentAssetId);
      const assetName = asset ? `${asset.symbol} · ${asset.name}` : "投資持倉";
      return transaction.type === "investment_sell" ? `${assetName} → ${accountName || "帳戶"}` : `${accountName || "帳戶"} → ${assetName}`;
    }
    if (accountName) return accountName;
    return "-";
  }

  function downloadTransactionTemplate() {
    const template = "\uFEFF日期,類型,金額,分類,子分類,商家,備註,是否必要,是否固定,標籤\n2026-08-01,支出,120,餐飲,早餐,早餐店,,是,否,日常|外食";
    const url = URL.createObjectURL(new Blob([template], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ez2savemore-交易匯入範本.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<ReceiptText size={18} />}
        label="收支紀錄"
        title={`${period.label}已記錄現金流`}
        value={formatMoney(periodBalanceCents)}
        tone="sky"
        metrics={[
          { label: periodCopy.incomeLabel, value: formatMoney(periodIncomeCents), accent: "border-emerald-300" },
          { label: periodCopy.expenseLabel, value: formatMoney(periodExpenseCents), accent: "border-rose-300" },
          { label: "內部轉帳", value: formatMoney(periodTransferCents), accent: "border-sky-300" }
        ]}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DonutChart
            segments={transactionCategoryBreakdown.map((item, index) => ({ label: item.category, value: item.amountCents, color: getChartColor(index) }))}
            centerLabel="支出"
            centerValue={formatCompactMoney(periodExpenseCents)}
          />
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-300">交易筆數</span>
              <span className="font-semibold text-white">{transactions.length} 筆</span>
            </div>
            <StackedDistribution data={transactionCategoryBreakdown} total={periodExpenseCents} />
            <CompactDistributionList data={transactionCategoryBreakdown} total={periodExpenseCents} inverse />
          </div>
        </div>
      </FeatureHero>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <section className="panel">
        <h2 className="text-lg font-semibold">新增交易</h2>
        <form className="mt-4 space-y-3" onSubmit={handleFormSubmit(onAdd)}>
          <Field label="日期"><input className="input" name="date" type="date" defaultValue={today} required /></Field>
          <Field label="類型">
            <select className="input" name="type" value={transactionType} onChange={(event) => setTransactionType(event.target.value as Transaction["type"])}>
              {Object.entries(transactionTypeLabels).filter(([value]) => value !== "credit_card_purchase").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
          {transactionType === "expense" && (
            <Field label="付款方式">
              <select className="input" name="paymentMethod" value={expensePaymentMethod} onChange={(event) => setExpensePaymentMethod(event.target.value as ExpensePaymentMethod)}>
                <option value="account">帳戶</option>
                <option value="credit_card">信用卡</option>
              </select>
            </Field>
          )}
          {needsAccount && (
            <Field label={accountFieldLabel}>
              <select className="input" name="accountId" defaultValue="" required>
                <option value="" disabled>{activeAccounts.length ? "請選擇帳戶" : "尚無可用帳戶"}</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </Field>
          )}
          {needsCreditCard && (
            <Field label={transactionType === "credit_card_payment" ? "繳款信用卡" : "付款信用卡"}>
              <select className="input" name="creditCardId" value={selectedCreditCardId} onChange={(event) => setSelectedCreditCardId(event.target.value)} required>
                <option value="" disabled>{activeCreditCards.length ? "請選擇信用卡" : "尚無可用信用卡"}</option>
                {activeCreditCards.map((card) => <option key={card.id} value={card.id}>{card.name}（{card.last4}）</option>)}
              </select>
            </Field>
          )}
          {transactionType === "credit_card_payment" && selectableInstallments.length > 0 && (
            <fieldset className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <legend className="px-1 text-sm font-medium">本次包含的分期</legend>
              {selectableInstallments.map((installment) => (
                <label key={installment.id} className="flex items-start gap-3 text-sm">
                  <input className="mt-0.5 h-4 w-4 accent-emerald-600" name="installmentIds" type="checkbox" value={installment.id} />
                  <span>
                    <span className="block font-medium">{installment.merchant || "信用卡分期"} · 本期 {formatMoney(Math.min(installment.monthlyPaymentCents, installment.remainingAmountCents))}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">已繳 {installment.paidPeriods}/{installment.periods} 期，剩餘 {formatMoney(installment.remainingAmountCents)}</span>
                  </span>
                </label>
              ))}
              <p className="helper-text">勾選後會同步更新分期進度；沒有包含在本次帳單的項目請勿勾選。</p>
            </fieldset>
          )}
          {needsTransferAccount && (
            <Field label="轉入帳戶">
              <select className="input" name="transferAccountId" defaultValue="" required>
                <option value="" disabled>{activeAccounts.length > 1 ? "請選擇轉入帳戶" : "請先建立另一個帳戶"}</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </Field>
          )}
          {needsLoan && (
            <Field label={transactionType === "loan_drawdown" ? "動用備用金" : "還款貸款"}>
              <select className="input" name="loanId" value={selectedLoanId} onChange={(event) => setSelectedLoanId(event.target.value)} required>
                <option value="" disabled>{selectableLoans.length ? (transactionType === "loan_drawdown" ? "請選擇備用金" : "請選擇貸款") : (transactionType === "loan_drawdown" ? "尚無可用備用金" : "尚無進行中貸款")}</option>
                {selectableLoans.map((loan) => <option key={loan.id} value={loan.id}>{loan.name} · {transactionType === "loan_drawdown" ? `可用 ${formatMoney(Math.max(0, (loan.creditLimitCents ?? 0) - loan.remainingPrincipalCents))}` : `剩餘 ${formatMoney(loan.remainingPrincipalCents)}`}</option>)}
              </select>
            </Field>
          )}
          {needsInvestmentAsset && (
            <>
              <Field label="投資持倉">
                <select className="input" name="investmentAssetId" defaultValue="" required>
                  <option value="" disabled>{activeInvestmentAssets.length ? "請選擇持倉" : "請先到投資頁建立持倉"}</option>
                  {activeInvestmentAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} · {asset.name}（{asset.quantity.toLocaleString("zh-TW")}）</option>)}
                </select>
              </Field>
              <Field label={transactionType === "investment_buy" ? "買入數量" : "賣出數量"}>
                <input className="input" name="investmentQuantity" type="number" min="0.0000000001" step="0.0000000001" required />
              </Field>
            </>
          )}
          {transactionType === "loan_payment" && (
            <Field label="其中本金">
              <input className="input" name="principalAmount" inputMode="decimal" placeholder="留空自動估算" />
              <p className="helper-text mt-1">
                {selectedLoan
                  ? `剩餘本金 ${formatMoney(selectedLoan.remainingPrincipalCents)}；利息預付或特殊還款可填實際本金，只付利息時填 0。`
                  : "選擇貸款後可依帳單填寫本期實際本金。"}
              </p>
            </Field>
          )}
          {transactionType === "loan_payment" && (
            <label className="flex items-center gap-2 text-sm">
              <input name="advanceLoanPeriod" type="checkbox" defaultChecked /> 計入一期還款
            </label>
          )}
          <details className="group border-t border-slate-200 pt-3 dark:border-slate-800">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white">
              更多資訊
              <ChevronDown size={16} className="transition group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-3">
              <Field label="子分類"><input className="input" name="subcategory" placeholder="可留空" /></Field>
              <Field label="商家或對象"><input className="input" name="merchant" /></Field>
              <Field label="標籤"><input className="input" name="tags" placeholder="以逗號分隔" /></Field>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="flex items-center gap-2"><input name="necessary" type="checkbox" /> 必要支出</label>
                <label className="flex items-center gap-2"><input name="recurring" type="checkbox" /> 固定支出</label>
              </div>
              <Field label="備註"><textarea className="input" name="note" rows={2} /></Field>
            </div>
          </details>
          <button className="btn-primary w-full" type="submit"><Plus size={16} />新增</button>
        </form>
      </section>

      <section className="space-y-4">
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">CSV 匯入預覽</h2>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" type="button" onClick={downloadTransactionTemplate}><Download size={16} />下載範本</button>
              <label className="btn-secondary cursor-pointer">
                <Upload size={16} />
                選擇 CSV
                <input className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => onCsvUpload(event.target.files?.[0] ?? null)} />
              </label>
            </div>
          </div>
          {csvPreview.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-slate-500 dark:text-slate-400"><th>列</th><th>狀態</th><th>分類</th><th>金額</th><th>錯誤</th></tr></thead>
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
              <thead><tr className="text-left text-slate-500 dark:text-slate-400"><th>日期</th><th>類型</th><th>分類</th><th>商家</th><th>金額</th><th>付款方式</th><th></th></tr></thead>
              <tbody>
                {transactions.slice(0, 18).map((transaction) => (
                  <tr key={transaction.id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="py-3">{formatDate(transaction.date)}</td>
                    <td>{transactionTypeLabels[transaction.type]}</td>
                    <td>{transaction.category}</td>
                    <td>{transaction.merchant ?? "-"}</td>
                    <td className="font-semibold">{formatMoney(transaction.amountCents)}</td>
                    <td>{paymentSourceLabel(transaction)}</td>
                    <td><button className="btn-danger px-2 py-1" onClick={() => onDelete(transaction.id)} title="刪除交易" aria-label="刪除交易"><Trash2 size={14} /></button></td>
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
                      <p className="text-sm text-slate-500 dark:text-slate-400">{formatDate(transaction.date)} · {transactionTypeLabels[transaction.type]} · {paymentSourceLabel(transaction)}</p>
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

function AccountsPage({
  accounts,
  onAdd,
  onUpdate,
  onDelete
}: {
  accounts: FinancialAccount[];
  onAdd: (formData: FormData) => void;
  onUpdate: (account: FinancialAccount) => Promise<void>;
  onDelete: (account: FinancialAccount) => Promise<void>;
}) {
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
        <FormDisclosure title="新增帳戶" description="建立新的資產帳戶，餘額會即時納入帳戶總覽。">
          <form className="space-y-3" onSubmit={handleFormSubmit(onAdd)}>
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
        </FormDisclosure>
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.length === 0 ? <div className="md:col-span-2 xl:col-span-3"><EmptyState label="尚未建立帳戶，從新增帳戶開始整理你的資產。" /></div> : accounts.map((account) => (
            <div key={account.id} className="panel">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{account.name}</p>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{account.isActive ? "啟用" : "停用"}</span>
                  <button className="btn-danger h-8 w-8 px-0" onClick={() => void onDelete(account)} title="刪除帳戶" aria-label={`刪除 ${account.name}`}><Trash2 size={15} /></button>
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{accountTypeLabels[account.type]} · {account.institution}</p>
              <p className="mt-4 text-2xl font-bold">{formatMoney(account.balanceCents)}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {account.includeInAvailableCash && <Badge>可動用</Badge>}
                {account.includeInEmergencyFund && <Badge>預備金</Badge>}
              </div>
              <details className="group mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-100"><Pencil size={15} />編輯帳戶</summary>
                <form className="mt-3 space-y-3" onSubmit={handleFormSubmit((formData) => {
                  const balanceCents = parseMoneyToCents(String(formData.get("balance") ?? ""));
                  if (balanceCents < 0) return;
                  void onUpdate({
                    ...account,
                    name: String(formData.get("name") ?? "").trim() || account.name,
                    type: String(formData.get("type") ?? account.type) as AccountType,
                    institution: String(formData.get("institution") ?? "").trim() || undefined,
                    balanceCents,
                    includeInAvailableCash: formData.get("available") === "on",
                    includeInEmergencyFund: formData.get("emergency") === "on",
                    isActive: formData.get("active") === "on",
                    note: String(formData.get("note") ?? "").trim() || undefined
                  });
                })}>
                  <Field label="帳戶名稱"><input className="input" name="name" defaultValue={account.name} required /></Field>
                  <Field label="帳戶類型"><select className="input" name="type" defaultValue={account.type}>{Object.entries(accountTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                  <Field label="金融機構"><input className="input" name="institution" defaultValue={account.institution ?? ""} /></Field>
                  <Field label="目前餘額"><input className="input" name="balance" defaultValue={account.balanceCents / 100} inputMode="decimal" required /></Field>
                  <label className="flex items-center gap-2 text-sm"><input name="available" type="checkbox" defaultChecked={account.includeInAvailableCash} /> 列入可動用現金</label>
                  <label className="flex items-center gap-2 text-sm"><input name="emergency" type="checkbox" defaultChecked={account.includeInEmergencyFund} /> 列入緊急預備金</label>
                  <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={account.isActive} /> 啟用帳戶</label>
                  <Field label="備註"><textarea className="input" name="note" rows={2} defaultValue={account.note ?? ""} /></Field>
                  <button className="btn-primary w-full" type="submit">儲存變更</button>
                </form>
              </details>
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
  onAdd,
  onAddInstallment,
  onUpdate,
  onDelete,
  onRecordPayment,
  notify
}: {
  cards: CreditCard[];
  accounts: FinancialAccount[];
  installments: CreditCardInstallment[];
  onAdd: (card: CreditCard) => Promise<void>;
  onAddInstallment: (installment: CreditCardInstallment) => Promise<void>;
  onUpdate: (card: CreditCard) => Promise<void>;
  onDelete: (card: CreditCard) => Promise<void>;
  onRecordPayment: (card: CreditCard) => void;
  notify: (type: ToastType, message: string) => void;
}) {
  function addCard(formData: FormData) {
    const limit = parseMoneyToCents(String(formData.get("limit") ?? ""));
    const statementAmountCents = parseMoneyToCents(String(formData.get("statementAmount") ?? "0"));
    const unbilledAmountCents = parseMoneyToCents(String(formData.get("unbilledAmount") ?? "0"));
    const installmentBalanceCents = parseMoneyToCents(String(formData.get("installmentBalance") ?? "0"));
    const minimumPaymentCents = parseMoneyToCents(String(formData.get("minimumPayment") ?? "0"));
    const annualFeeCents = parseMoneyToCents(String(formData.get("annualFee") ?? "0"));
    const statementDay = Number(formData.get("statementDay"));
    const paymentDueDay = Number(formData.get("paymentDueDay"));
    const last4 = String(formData.get("last4")).trim();
    const validation = combineValidations(
      validatePositiveAmount(limit, "信用額度"),
      validateNonNegativeAmount(statementAmountCents, "本期帳單"),
      validateNonNegativeAmount(unbilledAmountCents, "未出帳金額"),
      validateNonNegativeAmount(installmentBalanceCents, "分期餘額"),
      validateNonNegativeAmount(minimumPaymentCents, "最低應繳"),
      validateNonNegativeAmount(annualFeeCents, "年費"),
      validateIntegerRange(statementDay, 1, 31, "結帳日"),
      validateIntegerRange(paymentDueDay, 1, 31, "繳款截止日")
    );
    if (!validation.valid) return notify("error", validation.errors[0]);
    if (!/^\d{4}$/.test(last4)) return notify("error", "卡片末四碼需為 4 位數字");
    const now = new Date().toISOString();
    void onAdd({
        id: crypto.randomUUID(),
        userId: localUserId,
        name: String(formData.get("name")),
        issuer: String(formData.get("issuer")),
        last4,
        creditLimitCents: limit,
        statementDay,
        paymentDueDay,
        unbilledAmountCents,
        currentStatementAmountCents: statementAmountCents,
        minimumPaymentCents,
        installmentBalanceCents,
        autoPayAccountId: String(formData.get("autoPayAccountId") ?? ""),
        annualFeeCents,
        annualFeeWaiver: String(formData.get("waiver") ?? ""),
        note: "",
        isActive: true,
        recommendedUtilizationRate: 0.3,
        createdAt: now,
        updatedAt: now
      });
  }

  async function addInstallment(formData: FormData) {
    const totalAmountCents = parseMoneyToCents(String(formData.get("totalAmount") ?? ""));
    const paidRaw = String(formData.get("paidAmount") ?? "").trim();
    const remainingRaw = String(formData.get("remainingAmount") ?? "").trim();
    const paidAmountInput = paidRaw ? parseMoneyToCents(paidRaw) : undefined;
    const remainingAmountInput = remainingRaw ? parseMoneyToCents(remainingRaw) : undefined;
    const annualRate = Number(formData.get("annualRate")) / 100;
    const periods = Number(formData.get("periods"));
    const paidPeriods = Number(formData.get("paidPeriods"));
    const monthlyPaymentInput = parseMoneyToCents(String(formData.get("monthlyPayment") ?? ""));
    const startedOn = String(formData.get("startedOn"));
    const nextDueDate = String(formData.get("nextDueDate") || "");
    const validation = combineValidations(
      validatePositiveAmount(totalAmountCents, "分期總額"),
      validateNonNegativeAmount(paidAmountInput ?? 0, "已還款金額"),
      validateNonNegativeAmount(remainingAmountInput ?? 0, "剩餘金額"),
      validateNonNegativeAmount(monthlyPaymentInput, "每月應繳"),
      validateAnnualRate(annualRate),
      validateIntegerRange(periods, 1, 600, "分期期數"),
      validateIntegerRange(paidPeriods, 0, periods, "已還期數"),
      validateDateRange(startedOn, nextDueDate || undefined)
    );
    if (!validation.valid) return notify("error", validation.errors[0]);
    const balance = calculateInstallmentOpeningBalance({
      totalAmountCents,
      periods,
      paidPeriods,
      monthlyPaymentCents: monthlyPaymentInput || undefined,
      paidAmountCents: paidAmountInput,
      remainingAmountCents: remainingAmountInput
    });
    const now = new Date().toISOString();
    const installment: CreditCardInstallment = {
      id: crypto.randomUUID(),
      userId: localUserId,
      creditCardId: String(formData.get("creditCardId")),
      merchant: String(formData.get("merchant") ?? ""),
      installmentType: String(formData.get("installmentType") ?? "single_purchase") as CreditCardInstallment["installmentType"],
      includedInCardBalance: formData.get("includedInCardBalance") === "on",
      totalAmountCents,
      annualRate,
      periods,
      paidPeriods,
      monthlyPaymentCents: balance.monthlyPaymentCents,
      paidAmountCents: balance.paidAmountCents,
      remainingAmountCents: balance.remainingAmountCents,
      startedOn,
      nextDueDate: nextDueDate || undefined,
      status: balance.remainingAmountCents === 0 ? "paid_off" : "active",
      note: String(formData.get("note") ?? ""),
      createdAt: now,
      updatedAt: now
    };
    await onAddInstallment(installment);
  }

  const creditSummary = summarizeCreditCardLimits(cards, installments);
  const installmentDebt = creditSummary.installmentDebtCents;
  const installmentMonthlyDue = getInstallmentMonthlyDueCents(installments);
  const totalCardStatementDebt = creditSummary.currentStatementCents + creditSummary.unbilledCents;
  const totalCreditLimitCents = creditSummary.creditLimitCents;
  const currentStatementCents = creditSummary.currentStatementCents;
  const unbilledCents = creditSummary.unbilledCents;
  const cardUtilization = creditSummary.utilizationRate;

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<CreditCardIcon size={18} />}
        label="信用卡總覽"
        title="卡費、未出帳與分期負債"
        value={formatMoney(creditSummary.usedCreditCents)}
        tone="violet"
        metrics={[
          { label: "本期帳單", value: formatMoney(currentStatementCents), accent: "border-rose-300" },
          { label: "下期未出帳", value: formatMoney(unbilledCents), accent: "border-amber-300" },
          { label: "已用額度", value: formatMoney(creditSummary.usedCreditCents), accent: "border-sky-300" },
          { label: "額度使用率", value: formatPercent(cardUtilization), accent: "border-violet-300" }
        ]}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DonutChart
            segments={[
              { label: "本期帳單", value: currentStatementCents, color: "#7c3aed" },
              { label: "未出帳", value: unbilledCents, color: "#f59e0b" },
              { label: "分期額外占用", value: creditSummary.installmentOccupancyCents, color: "#dc2626" }
            ]}
            centerLabel="待整理"
            centerValue={formatCompactMoney(creditSummary.usedCreditCents)}
          />
          <div className="flex-1 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-300">信用額度</span>
              <span className="font-semibold text-white">{formatMoney(totalCreditLimitCents)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-300">剩餘可用額度</span>
              <span className="font-semibold text-white">{formatMoney(creditSummary.availableCreditCents)}</span>
            </div>
            <Progress label="總額度使用率" value={cardUtilization} colorClass={cardUtilization >= 0.3 ? "bg-amber-500" : "bg-emerald-500"} />
            <CompactDistributionList data={[
              { category: "本期帳單", amountCents: currentStatementCents },
              { category: "下期未出帳", amountCents: unbilledCents },
              { category: "分期額外占用", amountCents: creditSummary.installmentOccupancyCents }
            ]} total={Math.max(creditSummary.usedCreditCents, 1)} inverse />
          </div>
        </div>
      </FeatureHero>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="已用額度" value={formatMoney(creditSummary.usedCreditCents)} />
        <StatCard label="剩餘額度" value={formatMoney(creditSummary.availableCreditCents)} />
        <StatCard label="信用卡帳款" value={formatMoney(totalCardStatementDebt)} />
        <StatCard label="分期剩餘負債" value={formatMoney(installmentDebt)} />
        <StatCard label="分期每月應繳" value={formatMoney(installmentMonthlyDue)} />
      </section>
      {creditSummary.overLimitCents > 0 && (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100">
          目前信用卡額度合計已超出 {formatMoney(creditSummary.overLimitCents)}，請核對匯入金額或優先安排還款。
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <FormDisclosure title="新增信用卡" description="只需卡片辨識末四碼與帳務日期，不會儲存完整卡號。">
        <form className="space-y-3" onSubmit={handleFormSubmit(addCard)}>
          <Field label="信用卡名稱"><input className="input" name="name" required /></Field>
          <Field label="發卡銀行"><input className="input" name="issuer" required /></Field>
          <Field label="末四碼"><input className="input" name="last4" inputMode="numeric" maxLength={4} required /></Field>
          <Field label="信用額度"><input className="input" name="limit" inputMode="decimal" required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="本期已出帳"><input className="input" name="statementAmount" inputMode="decimal" defaultValue="0" /></Field>
            <Field label="下期未出帳"><input className="input" name="unbilledAmount" inputMode="decimal" defaultValue="0" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="其他分期餘額"><input className="input" name="installmentBalance" inputMode="decimal" defaultValue="0" /></Field>
            <Field label="最低應繳"><input className="input" name="minimumPayment" inputMode="decimal" defaultValue="0" /></Field>
          </div>
          <p className="helper-text">已有單筆分期明細時，系統會優先採用明細，避免和「其他分期餘額」重複計算。</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="結帳日"><input className="input" name="statementDay" type="number" min={1} max={31} defaultValue={20} /></Field>
            <Field label="繳款截止日"><input className="input" name="paymentDueDay" type="number" min={1} max={31} defaultValue={5} /></Field>
          </div>
          <Field label="自動扣款帳戶"><select className="input" name="autoPayAccountId">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
          <Field label="年費"><input className="input" name="annualFee" inputMode="decimal" defaultValue="0" /></Field>
          <Field label="年費減免條件"><input className="input" name="waiver" /></Field>
          <button className="btn-primary w-full" type="submit"><Plus size={16} />新增信用卡</button>
        </form>
      </FormDisclosure>
      <section className="grid gap-3 md:grid-cols-2">
        {cards.length === 0 ? <div className="md:col-span-2"><EmptyState label="尚未建立信用卡，可從新增信用卡開始管理帳單與分期。" /></div> : cards.map((card) => {
          const cardSummary = summarizeCreditCardLimit(card, installments);
          const cardInstallmentDebt = cardSummary.installmentDebtCents;
          const used = cardSummary.usedCreditCents;
          const utilization = cardSummary.utilizationRate;
          return (
            <div key={card.id} className="panel">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-semibold">{card.name}</p><p className="text-sm text-slate-500 dark:text-slate-400">{card.issuer} · **** {card.last4}</p></div>
                <div className="flex items-center gap-2"><Badge>{card.isActive ? "啟用" : "停用"}</Badge><button className="btn-danger h-8 w-8 px-0" onClick={() => void onDelete(card)} title="刪除信用卡" aria-label={`刪除 ${card.name}`}><Trash2 size={15} /></button></div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info label="本期帳單" value={formatMoney(card.currentStatementAmountCents)} />
                <Info label="下期未出帳" value={formatMoney(card.unbilledAmountCents)} />
                <Info label="分期剩餘" value={formatMoney(cardInstallmentDebt)} />
                <Info label="已用額度" value={formatMoney(used)} />
                <Info label="剩餘額度" value={formatMoney(cardSummary.availableCreditCents)} />
                <Info label="最低應繳" value={formatMoney(card.minimumPaymentCents)} />
              </div>
              <div className="mt-4"><Progress label="額度使用率" value={utilization} /></div>
              {cardSummary.overLimitCents > 0 && (
                <p className="mt-3 rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-100">已超出信用額度 {formatMoney(cardSummary.overLimitCents)}，請核對帳款或安排還款。</p>
              )}
              {utilization > card.recommendedUtilizationRate && (
                <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-100">已超過建議額度使用率 {formatPercent(card.recommendedUtilizationRate)}。</p>
              )}
              {card.currentStatementAmountCents > 0 && <button className="btn-primary mt-4 w-full" onClick={() => onRecordPayment(card)}>前往記錄繳款</button>}
              <details className="group mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-100"><Pencil size={15} />編輯信用卡</summary>
                <form className="mt-3 space-y-3" onSubmit={handleFormSubmit((formData) => {
                  const creditLimitCents = parseMoneyToCents(String(formData.get("limit") ?? ""));
                  if (creditLimitCents <= 0) return;
                  void onUpdate({
                    ...card,
                    name: String(formData.get("name") ?? "").trim() || card.name,
                    issuer: String(formData.get("issuer") ?? "").trim() || card.issuer,
                    last4: String(formData.get("last4") ?? "").slice(-4) || card.last4,
                    creditLimitCents,
                    statementDay: Number(formData.get("statementDay") ?? card.statementDay),
                    paymentDueDay: Number(formData.get("paymentDueDay") ?? card.paymentDueDay),
                    currentStatementAmountCents: Math.max(0, parseMoneyToCents(String(formData.get("statementAmount") ?? "0"))),
                    unbilledAmountCents: Math.max(0, parseMoneyToCents(String(formData.get("unbilledAmount") ?? "0"))),
                    installmentBalanceCents: Math.max(0, parseMoneyToCents(String(formData.get("installmentBalance") ?? "0"))),
                    minimumPaymentCents: Math.max(0, parseMoneyToCents(String(formData.get("minimumPayment") ?? "0"))),
                    recommendedUtilizationRate: Math.min(1, Math.max(0.01, Number(formData.get("utilizationRate") ?? 30) / 100)),
                    isActive: formData.get("active") === "on"
                  });
                })}>
                  <div className="grid grid-cols-2 gap-3"><Field label="信用卡名稱"><input className="input" name="name" defaultValue={card.name} required /></Field><Field label="發卡銀行"><input className="input" name="issuer" defaultValue={card.issuer} required /></Field></div>
                  <div className="grid grid-cols-2 gap-3"><Field label="末四碼"><input className="input" name="last4" defaultValue={card.last4} maxLength={4} inputMode="numeric" required /></Field><Field label="信用額度"><input className="input" name="limit" defaultValue={card.creditLimitCents / 100} inputMode="decimal" required /></Field></div>
                  <div className="grid grid-cols-2 gap-3"><Field label="結帳日"><input className="input" name="statementDay" type="number" min={1} max={31} defaultValue={card.statementDay} /></Field><Field label="繳款截止日"><input className="input" name="paymentDueDay" type="number" min={1} max={31} defaultValue={card.paymentDueDay} /></Field></div>
                  <div className="grid grid-cols-2 gap-3"><Field label="本期帳單"><input className="input" name="statementAmount" defaultValue={card.currentStatementAmountCents / 100} inputMode="decimal" /></Field><Field label="下期未出帳"><input className="input" name="unbilledAmount" defaultValue={card.unbilledAmountCents / 100} inputMode="decimal" /></Field></div>
                  <div className="grid grid-cols-2 gap-3"><Field label="其他分期餘額"><input className="input" name="installmentBalance" defaultValue={card.installmentBalanceCents / 100} inputMode="decimal" /></Field><Field label="最低應繳"><input className="input" name="minimumPayment" defaultValue={card.minimumPaymentCents / 100} inputMode="decimal" /></Field></div>
                  <Field label="建議額度使用率 %"><input className="input" name="utilizationRate" type="number" min={1} max={100} defaultValue={Math.round(card.recommendedUtilizationRate * 100)} /></Field>
                  <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={card.isActive} /> 啟用信用卡</label>
                  <button className="btn-primary w-full" type="submit">儲存變更</button>
                </form>
              </details>
            </div>
          );
        })}
      </section>
      </div>
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <FormDisclosure title="新增分期款項" description="記錄利率、已繳金額與下次應繳，集中掌握信用卡負債。">
          <form className="space-y-3" onSubmit={handleFormSubmit(addInstallment)}>
            <Field label="信用卡">
              <select className="input" name="creditCardId" required>
                {cards.map((card) => <option key={card.id} value={card.id}>{card.name}（{card.last4}）</option>)}
              </select>
            </Field>
            <Field label="商家或項目"><input className="input" name="merchant" placeholder="例如 手機、家電、旅遊" /></Field>
            <Field label="分期類型">
              <select className="input" name="installmentType" defaultValue="single_purchase">
                <option value="single_purchase">單筆消費分期</option>
                <option value="statement">帳單分期</option>
              </select>
            </Field>
            <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
              <input className="mt-0.5" name="includedInCardBalance" type="checkbox" />
              <span>
                <span className="block font-medium">分期餘額已包含在卡片帳款</span>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">勾選後仍計入分期負債，但不會再次增加已用額度。</span>
              </span>
            </label>
            <Field label="分期總額"><input className="input" name="totalAmount" inputMode="decimal" required /></Field>
            <Field label="年利率 %"><input className="input" name="annualRate" inputMode="decimal" defaultValue="0" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="總期數"><input className="input" name="periods" type="number" min={1} defaultValue={12} /></Field>
              <Field label="已還期數"><input className="input" name="paidPeriods" type="number" min={0} defaultValue={0} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="已還款金額"><input className="input" name="paidAmount" inputMode="decimal" placeholder="可留空由期數估算" /></Field>
              <Field label="銀行剩餘金額"><input className="input" name="remainingAmount" inputMode="decimal" placeholder="有資料時優先填這裡" /></Field>
            </div>
            <Field label="每月應繳"><input className="input" name="monthlyPayment" inputMode="decimal" placeholder="可留空自動估算" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="開始日"><input className="input" name="startedOn" type="date" defaultValue={today} /></Field>
              <Field label="下次應繳日"><input className="input" name="nextDueDate" type="date" /></Field>
            </div>
            <Field label="備註"><textarea className="input" name="note" rows={2} /></Field>
            <button className="btn-primary w-full" type="submit"><Plus size={16} />新增分期</button>
          </form>
        </FormDisclosure>
        <section className="panel">
          <h2 className="text-lg font-semibold">分期負債整理</h2>
          <InstallmentDebtTable cards={cards} installments={installments} />
        </section>
      </div>
    </div>
  );
}

function updateLoanRateEstimate(form: HTMLFormElement | null) {
  if (!form) return;
  const principalInput = form.elements.namedItem("principal");
  const termInput = form.elements.namedItem("termMonths");
  const paymentInput = form.elements.namedItem("payment");
  const annualRateInput = form.elements.namedItem("annualRate");
  const trackingModeInput = form.elements.namedItem("trackingMode");
  const hint = form.querySelector<HTMLElement>("[data-loan-rate-hint]");
  if (!(principalInput instanceof HTMLInputElement)
    || !(termInput instanceof HTMLInputElement)
    || !(paymentInput instanceof HTMLInputElement)
    || !(annualRateInput instanceof HTMLInputElement)) return;

  const trackingMode = trackingModeInput instanceof HTMLSelectElement ? trackingModeInput.value as LoanTrackingMode : "amortized";
  paymentInput.setCustomValidity("");
  if (trackingMode === "prepaid_interest") {
    if (hint) hint.textContent = "合約利率會保留；每期款主要沖減本金，不用月付金反推利率。";
    return;
  }
  if (trackingMode === "manual") {
    if (hint) hint.textContent = "剩餘本金與累計實付由你手動維護，系統不回推利率。";
    return;
  }

  const principalCents = parseMoneyToCents(principalInput.value);
  const paymentCents = parseMoneyToCents(paymentInput.value);
  const termMonths = Number(termInput.value);

  if (!paymentInput.value.trim()) {
    if (hint) hint.textContent = "留空時會依本金、年利率與期數計算每期金額。";
    return;
  }
  if (principalCents <= 0 || termMonths <= 0) {
    if (hint) hint.textContent = "請先輸入原始本金與貸款期數。";
    return;
  }

  const inferredRate = inferAnnualRateFromPayment(principalCents, paymentCents, termMonths);
  if (inferredRate === null) {
    paymentInput.setCustomValidity("每期還款金額無法在設定期數內攤還本金");
    if (hint) hint.textContent = "此金額無法在設定期數內攤還本金，請提高每期金額或延長期數。";
    return;
  }

  const ratePercent = inferredRate * 100;
  annualRateInput.value = ratePercent.toFixed(ratePercent < 0.1 ? 4 : 3).replace(/\.?0+$/, "");
  if (hint) hint.textContent = `估算年利率 ${annualRateInput.value}%（本息平均攤還，不含手續費、寬限期與尾款）`;
}

function updateLoanProgressEstimate(form: HTMLFormElement | null) {
  if (!form) return;
  const principalInput = form.elements.namedItem("principal");
  const remainingInput = form.elements.namedItem("remaining");
  const annualRateInput = form.elements.namedItem("annualRate");
  const termInput = form.elements.namedItem("termMonths");
  const paidPeriodsInput = form.elements.namedItem("paidPeriods");
  const paymentInput = form.elements.namedItem("payment");
  const paidAmountInput = form.elements.namedItem("paidAmount");
  const trackingModeInput = form.elements.namedItem("trackingMode");
  const prepaidInterestInput = form.elements.namedItem("prepaidInterest");
  const autoCalculateInput = form.elements.namedItem("autoCalculateProgress");
  const hint = form.querySelector<HTMLElement>("[data-loan-progress-hint]");
  if (
    !(principalInput instanceof HTMLInputElement)
    || !(annualRateInput instanceof HTMLInputElement)
    || !(termInput instanceof HTMLInputElement)
    || !(paidPeriodsInput instanceof HTMLInputElement)
    || !(paymentInput instanceof HTMLInputElement)
    || !(paidAmountInput instanceof HTMLInputElement)
    || !(trackingModeInput instanceof HTMLSelectElement)
    || !(prepaidInterestInput instanceof HTMLInputElement)
    || !(autoCalculateInput instanceof HTMLInputElement)
  ) return;

  const trackingMode = trackingModeInput.value as LoanTrackingMode;
  const autoCalculate = autoCalculateInput.checked && trackingMode !== "manual";
  if (!autoCalculate) {
    if (hint) hint.textContent = "手動模式會保留你輸入的剩餘本金與累計實付。";
    return;
  }

  const principalCents = parseMoneyToCents(principalInput.value);
  const termMonths = Number(termInput.value);
  const annualRate = Math.max(0, Number(annualRateInput.value) / 100);
  const paymentInputCents = parseMoneyToCents(paymentInput.value);
  const paymentPerPeriodCents = paymentInputCents > 0
    ? paymentInputCents
    : calculateLoan({ principalCents, annualRate, termMonths, method: "equal_payment" }).monthlyPaymentCents;
  if (principalCents <= 0 || termMonths <= 0 || paymentPerPeriodCents <= 0) {
    if (hint) hint.textContent = "輸入本金、期數與每期金額後會自動更新清償進度。";
    return;
  }

  const progress = calculateLoanProgress({
    originalPrincipalCents: principalCents,
    remainingPrincipalCents: remainingInput instanceof HTMLInputElement ? parseMoneyToCents(remainingInput.value) : principalCents,
    annualRate,
    termMonths,
    paidPeriods: Number(paidPeriodsInput.value),
    paymentPerPeriodCents,
    paidAmountCents: parseMoneyToCents(paidAmountInput.value),
    trackingMode,
    prepaidInterestCents: parseMoneyToCents(prepaidInterestInput.value),
    autoCalculate
  });

  if (remainingInput instanceof HTMLInputElement) remainingInput.value = String(progress.remainingPrincipalCents / 100);
  paidAmountInput.value = String(progress.totalCashPaidCents / 100);
  if (hint) {
    const prepaidText = progress.prepaidInterestCents > 0 ? `，含預付利息 ${formatMoney(progress.prepaidInterestCents)}` : "";
    hint.textContent = `已清償本金 ${formatMoney(progress.principalPaidCents)}，剩餘 ${formatMoney(progress.remainingPrincipalCents)}，累計實付 ${formatMoney(progress.totalCashPaidCents)}${prepaidText}。`;
  }
}

function updateLoanFormEstimate(form: HTMLFormElement | null) {
  updateLoanRateEstimate(form);
  updateLoanProgressEstimate(form);
}

function LoansPage({
  loans,
  onAdd,
  onUpdate,
  onDelete,
  onRecordPayment,
  onDrawdown,
  notify
}: {
  loans: Loan[];
  onAdd: (loan: Loan) => Promise<void>;
  onUpdate: (loan: Loan) => Promise<void>;
  onDelete: (loan: Loan) => Promise<void>;
  onRecordPayment: (loan: Loan) => void;
  onDrawdown: (loan: Loan) => void;
  notify: (type: ToastType, message: string) => void;
}) {
  const [newLoanType, setNewLoanType] = useState<Loan["type"]>("personal");
  const [reserveMode, setReserveMode] = useState<"revolving" | "installment">("revolving");
  const [calcInput, setCalcInput] = useState<LoanCalculationInput>({
    principalCents: 600_000_00,
    annualRate: 0.0275,
    termMonths: 60,
    method: "equal_payment",
    extraMonthlyPaymentCents: 0,
    oneTimePrepaymentCents: 0,
    oneTimePrepaymentMonth: 1
  });
  const [reserveCalcInput, setReserveCalcInput] = useState<ReserveCreditCalculationInput>({
    creditLimitCents: 300_000_00,
    utilizedBalanceCents: 100_000_00,
    annualRate: 0.06,
    billingDays: 30,
    installmentMonths: 12,
    extraMonthlyPaymentCents: 0,
    immediatePrepaymentCents: 0
  });
  const result = calculateLoan(calcInput);
  const reserveResult = calculateReserveCredit(reserveCalcInput);
  const loansWithProgress = loans.map((loan) => ({
    loan,
    trackingMode: inferLoanTrackingMode(loan),
    progress: calculateLoanProgress({
      originalPrincipalCents: loan.originalPrincipalCents,
      remainingPrincipalCents: loan.remainingPrincipalCents,
      annualRate: loan.annualRate,
      termMonths: loan.termMonths,
      paidPeriods: loan.paidPeriods,
      paymentPerPeriodCents: loan.paymentPerPeriodCents,
      paidAmountCents: loan.paidAmountCents,
      trackingMode: inferLoanTrackingMode(loan),
      prepaidInterestCents: typeof loan.metadata?.prepaid_interest_cents === "number" ? loan.metadata.prepaid_interest_cents : 0,
      autoCalculate: typeof loan.metadata?.auto_calculate_progress === "boolean" ? loan.metadata.auto_calculate_progress : true
    })
  }));
  const activeLoans = loansWithProgress.filter(({ loan }) => loan.status === "active");
  const loanPrincipalCents = activeLoans.reduce((sum, item) => sum + item.progress.remainingPrincipalCents, 0);
  const loanOriginalPrincipalCents = activeLoans.reduce((sum, item) => sum + item.loan.originalPrincipalCents, 0);
  const loanMonthlyDueCents = activeLoans.reduce((sum, item) => sum + item.loan.paymentPerPeriodCents, 0);
  const loanPaidAmountCents = loansWithProgress.reduce((sum, item) => sum + item.progress.totalCashPaidCents, 0);
  const weightedLoanRate = loanPrincipalCents > 0
    ? activeLoans.reduce((sum, item) => sum + item.progress.remainingPrincipalCents * item.loan.annualRate, 0) / loanPrincipalCents
    : 0;
  const paidDownRatio = loanOriginalPrincipalCents > 0 ? 1 - loanPrincipalCents / loanOriginalPrincipalCents : 0;
  const loanBreakdown = activeLoans
    .map((item) => ({ category: item.loan.name, amountCents: item.progress.remainingPrincipalCents }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 6);

  function addLoan(formData: FormData) {
    const loanType = String(formData.get("loanType") ?? "personal") as Loan["type"];
    const principal = parseMoneyToCents(String(formData.get("principal") ?? ""));
    const creditLimitCents = loanType === "reserve_credit" ? parseMoneyToCents(String(formData.get("creditLimit") ?? "")) : undefined;
    const termMonths = Number(formData.get("termMonths"));
    const paidPeriods = Number(formData.get("paidPeriods") ?? 0);
    const enteredPaidAmountCents = parseMoneyToCents(String(formData.get("paidAmount") ?? "0"));
    const paymentInputCents = parseMoneyToCents(String(formData.get("payment") ?? "0"));
    const selectedReserveMode = String(formData.get("reserveMode") ?? "revolving") as "revolving" | "installment";
    const trackingMode = loanType === "reserve_credit"
      ? (selectedReserveMode === "installment" ? "amortized" : "manual")
      : String(formData.get("trackingMode") ?? "amortized") as LoanTrackingMode;
    const autoCalculate = formData.get("autoCalculateProgress") === "on" && trackingMode !== "manual";
    const effectiveAutoCalculate = loanType === "reserve_credit" ? selectedReserveMode === "installment" : autoCalculate;
    const prepaidInterestCents = parseMoneyToCents(String(formData.get("prepaidInterest") ?? "0"));
    const inferredAnnualRate = loanType !== "reserve_credit" && trackingMode === "amortized" && paymentInputCents > 0
      ? inferAnnualRateFromPayment(principal, paymentInputCents, termMonths)
      : null;
    const annualRate = inferredAnnualRate ?? Number(formData.get("annualRate")) / 100;
    const paymentDay = Number(formData.get("paymentDay"));
    const startDate = String(formData.get("startDate"));
    const validation = combineValidations(
      loanType === "reserve_credit" ? validateNonNegativeAmount(principal, "目前已動用金額") : validatePositiveAmount(principal, "貸款本金"),
      loanType === "reserve_credit" ? validatePositiveAmount(creditLimitCents ?? 0, "核准額度") : { valid: true, errors: [] },
      validateNonNegativeAmount(enteredPaidAmountCents, "已繳款金額"),
      validateNonNegativeAmount(prepaidInterestCents, "預付利息"),
      validateNonNegativeAmount(paymentInputCents, "每期還款金額"),
      validateAnnualRate(annualRate),
      validateIntegerRange(termMonths, 1, 600, "貸款期數"),
      validateIntegerRange(paidPeriods, 0, termMonths, "已繳期數"),
      validateIntegerRange(paymentDay, 1, 31, "每月還款日"),
      validateDateRange(startDate)
    );
    if (!validation.valid) return notify("error", validation.errors[0]);
    if (loanType === "reserve_credit" && principal > (creditLimitCents ?? 0)) return notify("error", "目前已動用金額不可大於核准額度");
    if (trackingMode === "amortized" && paymentInputCents > 0 && inferredAnnualRate === null) return notify("error", "每期還款金額無法在設定期數內攤還本金，請調整金額、期數或改用利息預付模式");
    const reserveEstimate = loanType === "reserve_credit" ? calculateReserveCredit({
      creditLimitCents: creditLimitCents ?? 0,
      utilizedBalanceCents: principal,
      annualRate,
      billingDays: Number(formData.get("billingDays") ?? 30),
      installmentMonths: selectedReserveMode === "installment" ? termMonths : 0
    }) : null;
    const payment = paymentInputCents > 0
      ? paymentInputCents
      : reserveEstimate?.installmentPaymentCents ?? calculateLoan({ principalCents: principal, annualRate, termMonths, method: "equal_payment" }).monthlyPaymentCents;
    const progress = calculateLoanProgress({
      originalPrincipalCents: principal,
      remainingPrincipalCents: principal,
      annualRate,
      termMonths,
      paidPeriods,
      paymentPerPeriodCents: payment,
      paidAmountCents: enteredPaidAmountCents,
      trackingMode,
      prepaidInterestCents,
      autoCalculate: effectiveAutoCalculate
    });
    const now = new Date().toISOString();
    void onAdd({
        id: crypto.randomUUID(),
        userId: localUserId,
        name: String(formData.get("name")),
        type: loanType,
        institution: String(formData.get("institution") ?? ""),
        originalPrincipalCents: principal,
        creditLimitCents,
        remainingPrincipalCents: progress.remainingPrincipalCents,
        annualRate,
        termMonths,
        paidPeriods,
        paidAmountCents: progress.totalCashPaidCents,
        monthlyPaymentDay: paymentDay,
        startDate,
        repaymentMethod: trackingMode === "prepaid_interest" ? "fixed_payment" : trackingMode === "manual" ? "manual" : "equal_payment",
        paymentPerPeriodCents: payment,
        metadata: {
          loan_tracking_mode: trackingMode,
          prepaid_interest_cents: prepaidInterestCents,
          auto_calculate_progress: effectiveAutoCalculate,
          ...(loanType === "reserve_credit" ? {
            reserve_mode: selectedReserveMode,
            reserve_billing_days: Number(formData.get("billingDays") ?? 30)
          } : {})
        },
        status: "active",
        createdAt: now,
        updatedAt: now
      });
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
          { label: "累計已繳", value: formatMoney(loanPaidAmountCents), accent: "border-sky-300" },
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
        <FormDisclosure title="新增貸款" description="新增後可在下方試算器檢視還款壓力與提前清償效果。">
          <form className="space-y-3" onSubmit={handleFormSubmit(addLoan)}>
            <Field label="貸款名稱"><input className="input" name="name" required /></Field>
            <Field label="貸款類型">
              <select className="input" name="loanType" value={newLoanType} onChange={(event) => setNewLoanType(event.target.value as Loan["type"])}>
                {Object.entries(loanTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="金融機構"><input className="input" name="institution" /></Field>
            {newLoanType !== "reserve_credit" && <Field label="還款追蹤方式">
              <select className="input" name="trackingMode" defaultValue="amortized" onChange={(event) => updateLoanFormEstimate(event.currentTarget.form)}>
                <option value="amortized">本息按月攤還</option>
                <option value="prepaid_interest">利息預付，本金按期攤還</option>
                <option value="manual">手動管理餘額</option>
              </select>
            </Field>}
            {newLoanType === "reserve_credit" && (
              <>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">只針對實際動用金額計息；未使用額度不列入負債。</div>
                <Field label="核准額度"><input className="input" name="creditLimit" inputMode="decimal" required /></Field>
                <Field label="使用方式">
                  <select className="input" name="reserveMode" value={reserveMode} onChange={(event) => setReserveMode(event.target.value as "revolving" | "installment")}>
                    <option value="revolving">隨借隨還</option>
                    <option value="installment">申請分期</option>
                  </select>
                </Field>
                <Field label="本期計息天數"><input className="input" name="billingDays" type="number" min={1} max={366} defaultValue={30} /></Field>
              </>
            )}
            <Field label={newLoanType === "reserve_credit" ? "目前已動用" : "原始本金"}><input className="input" name="principal" inputMode="decimal" defaultValue={newLoanType === "reserve_credit" ? "0" : undefined} onChange={(event) => updateLoanFormEstimate(event.currentTarget.form)} required /></Field>
            <Field label="年利率 %"><input className="input" name="annualRate" inputMode="decimal" defaultValue="2.75" required /></Field>
            <Field label={newLoanType === "reserve_credit" && reserveMode === "installment" ? "分期期數（月）" : "貸款期數（月）"}><input className="input" name="termMonths" type="number" min={1} defaultValue={newLoanType === "reserve_credit" ? 12 : 60} onChange={(event) => updateLoanFormEstimate(event.currentTarget.form)} /></Field>
            <Field label={newLoanType === "reserve_credit" ? "預計每期還款" : "每期還款金額"}><input className="input" name="payment" inputMode="decimal" placeholder={newLoanType === "reserve_credit" ? "留空由系統估算" : "輸入後自動估算利率"} onChange={(event) => updateLoanFormEstimate(event.currentTarget.form)} /></Field>
            <p data-loan-rate-hint className="helper-text">{newLoanType === "reserve_credit" ? "利率以實際動用餘額計算，不會由月付金反推。" : "留空時會依本金、年利率與期數計算每期金額。"}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="已繳期數"><input className="input" name="paidPeriods" type="number" min={0} defaultValue={0} onChange={(event) => updateLoanProgressEstimate(event.currentTarget.form)} /></Field>
              <Field label="目前已繳款金額"><input className="input" name="paidAmount" inputMode="decimal" defaultValue="0" /></Field>
            </div>
            {newLoanType !== "reserve_credit" && <Field label="預付利息（如有）"><input className="input" name="prepaidInterest" inputMode="decimal" defaultValue="0" onChange={(event) => updateLoanProgressEstimate(event.currentTarget.form)} /></Field>}
            {newLoanType !== "reserve_credit" && <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
              <input className="mt-0.5 h-4 w-4 accent-emerald-600" name="autoCalculateProgress" type="checkbox" defaultChecked onChange={(event) => updateLoanProgressEstimate(event.currentTarget.form)} />
              <span>
                <span className="block font-medium">依已繳期數自動更新</span>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">同步計算已清償本金、剩餘本金與累計實付。</span>
              </span>
            </label>}
            <p data-loan-progress-hint className="helper-text">輸入已繳期數後，系統會立即更新清償進度。</p>
            <Field label="每月還款日"><input className="input" name="paymentDay" type="number" min={1} max={31} defaultValue={12} /></Field>
            <Field label="起始日期"><input className="input" name="startDate" type="date" defaultValue={today} /></Field>
            <button className="btn-primary w-full" type="submit"><Plus size={16} />新增貸款</button>
          </form>
        </FormDisclosure>
        <section className="grid gap-3 md:grid-cols-2">
          {loans.length === 0 ? <div className="md:col-span-2"><EmptyState label="尚未建立貸款，新增後可直接試算每月還款與總利息。" /></div> : loansWithProgress.map(({ loan, progress, trackingMode }) => (
            <div key={loan.id} className="panel">
              <div className="flex items-start justify-between gap-3"><p className="font-semibold">{loan.name}</p><div className="flex items-center gap-2"><Badge>{loan.status === "paid_off" ? "已結清" : loan.status === "active" ? "進行中" : "已暫停"}</Badge><button className="btn-danger h-8 w-8 px-0" onClick={() => void onDelete(loan)} title="刪除貸款" aria-label={`刪除 ${loan.name}`}><Trash2 size={15} /></button></div></div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{loan.institution} · {loanTypeLabels[loan.type]} · 年利率 {formatPercent(loan.annualRate)} · {loan.type === "reserve_credit" ? (loan.metadata?.reserve_mode === "installment" ? "分期中" : "隨借隨還") : trackingMode === "prepaid_interest" ? "利息預付" : trackingMode === "manual" ? "手動追蹤" : "按月攤還"}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info label="剩餘本金" value={formatMoney(progress.remainingPrincipalCents)} />
                <Info label="每期應繳" value={formatMoney(loan.paymentPerPeriodCents)} />
                {loan.type === "reserve_credit" && <Info label="核准額度" value={formatMoney(loan.creditLimitCents ?? 0)} />}
                {loan.type === "reserve_credit" && <Info label="可用額度" value={formatMoney(Math.max(0, (loan.creditLimitCents ?? 0) - loan.remainingPrincipalCents))} />}
                <Info label="已清償本金" value={formatMoney(progress.principalPaidCents)} />
                <Info label="累計實付" value={formatMoney(progress.totalCashPaidCents)} />
                <Info label="已繳期數" value={`${loan.paidPeriods}/${loan.termMonths}`} />
                <Info label="還款日" value={`每月 ${loan.monthlyPaymentDay} 日`} />
                {progress.prepaidInterestCents > 0 && <Info label="預付利息" value={formatMoney(progress.prepaidInterestCents)} />}
              </div>
              {loan.status === "active" && (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {loan.type === "reserve_credit" && (loan.creditLimitCents ?? 0) > loan.remainingPrincipalCents && (
                    <button className="btn-primary w-full" onClick={() => onDrawdown(loan)}>動用備用金</button>
                  )}
                  <button className="btn-primary w-full" onClick={() => onRecordPayment(loan)}>記錄本期還款</button>
                  <button className="btn-secondary w-full" onClick={() => {
                    if (!window.confirm(`只在貸款已於其他地方結清時使用。確認將 ${loan.name} 手動設為已結清？`)) return;
                    const finalProgress = calculateLoanProgress({
                      originalPrincipalCents: loan.originalPrincipalCents,
                      remainingPrincipalCents: 0,
                      annualRate: loan.annualRate,
                      termMonths: loan.termMonths,
                      paidPeriods: loan.termMonths,
                      paymentPerPeriodCents: loan.paymentPerPeriodCents,
                      paidAmountCents: loan.paidAmountCents,
                      trackingMode,
                      prepaidInterestCents: progress.prepaidInterestCents,
                      autoCalculate: true
                    });
                    void onUpdate({ ...loan, remainingPrincipalCents: 0, paidAmountCents: finalProgress.totalCashPaidCents, paidPeriods: loan.termMonths, status: "paid_off" });
                  }}>手動設為已結清</button>
                </div>
              )}
              <details className="group mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-100"><Pencil size={15} />編輯貸款</summary>
                <form className="mt-3 space-y-3" onSubmit={handleFormSubmit((formData) => {
                  const enteredRemainingPrincipalCents = Math.max(0, parseMoneyToCents(String(formData.get("remaining") ?? "0")));
                  const annualRate = Math.max(0, Number(formData.get("annualRate") ?? 0) / 100);
                  const enteredPaidAmountCents = Math.max(0, parseMoneyToCents(String(formData.get("paidAmount") ?? "0")));
                  const paymentPerPeriodCents = Math.max(0, parseMoneyToCents(String(formData.get("payment") ?? "0")));
                  const paidPeriods = Math.min(loan.termMonths, Math.max(0, Number(formData.get("paidPeriods") ?? loan.paidPeriods)));
                  const selectedReserveMode = String(formData.get("reserveMode") ?? loan.metadata?.reserve_mode ?? "revolving");
                  const nextTrackingMode = loan.type === "reserve_credit"
                    ? (selectedReserveMode === "installment" ? "amortized" : "manual")
                    : String(formData.get("trackingMode") ?? trackingMode) as LoanTrackingMode;
                  const autoCalculate = loan.type === "reserve_credit"
                    ? selectedReserveMode === "installment"
                    : formData.get("autoCalculateProgress") === "on" && nextTrackingMode !== "manual";
                  const prepaidInterestCents = Math.max(0, parseMoneyToCents(String(formData.get("prepaidInterest") ?? "0")));
                  const nextCreditLimitCents = loan.type === "reserve_credit"
                    ? Math.max(0, parseMoneyToCents(String(formData.get("creditLimit") ?? "0")))
                    : loan.creditLimitCents;
                  const validation = combineValidations(
                    validateNonNegativeAmount(enteredRemainingPrincipalCents, "剩餘本金"),
                    validateNonNegativeAmount(enteredPaidAmountCents, "目前已繳款金額"),
                    validateNonNegativeAmount(prepaidInterestCents, "預付利息"),
                    loan.type === "reserve_credit" ? validateNonNegativeAmount(paymentPerPeriodCents, "每期應繳") : validatePositiveAmount(paymentPerPeriodCents, "每期應繳"),
                    loan.type === "reserve_credit" ? validatePositiveAmount(nextCreditLimitCents ?? 0, "核准額度") : { valid: true, errors: [] },
                    validateAnnualRate(annualRate),
                    validateIntegerRange(paidPeriods, 0, loan.termMonths, "已繳期數")
                  );
                  if (!validation.valid) return notify("error", validation.errors[0]);
                  if (loan.type === "reserve_credit" && enteredRemainingPrincipalCents > (nextCreditLimitCents ?? 0)) return notify("error", "已動用金額不可大於核准額度");
                  const nextProgress = calculateLoanProgress({
                    originalPrincipalCents: loan.originalPrincipalCents,
                    remainingPrincipalCents: enteredRemainingPrincipalCents,
                    annualRate,
                    termMonths: loan.termMonths,
                    paidPeriods,
                    paymentPerPeriodCents,
                    paidAmountCents: enteredPaidAmountCents,
                    trackingMode: nextTrackingMode,
                    prepaidInterestCents,
                    autoCalculate
                  });
                  const nextStatus = String(formData.get("status") ?? loan.status) as Loan["status"];
                  void onUpdate({
                    ...loan,
                    name: String(formData.get("name") ?? "").trim() || loan.name,
                    institution: String(formData.get("institution") ?? "").trim() || undefined,
                    creditLimitCents: nextCreditLimitCents,
                    remainingPrincipalCents: nextStatus === "paid_off" ? 0 : nextProgress.remainingPrincipalCents,
                    annualRate,
                    paidPeriods,
                    paidAmountCents: nextProgress.totalCashPaidCents,
                    monthlyPaymentDay: Math.min(31, Math.max(1, Number(formData.get("paymentDay") ?? loan.monthlyPaymentDay))),
                    paymentPerPeriodCents,
                    repaymentMethod: nextTrackingMode === "prepaid_interest" ? "fixed_payment" : nextTrackingMode === "manual" ? "manual" : "equal_payment",
                    metadata: {
                      ...(loan.metadata ?? {}),
                      loan_tracking_mode: nextTrackingMode,
                      prepaid_interest_cents: prepaidInterestCents,
                      auto_calculate_progress: autoCalculate,
                      ...(loan.type === "reserve_credit" ? {
                        reserve_mode: selectedReserveMode,
                        reserve_billing_days: Math.min(366, Math.max(1, Number(formData.get("billingDays") ?? loan.metadata?.reserve_billing_days ?? 30)))
                      } : {})
                    },
                    status: nextStatus
                  });
                })}>
                  <input name="principal" type="hidden" value={loan.originalPrincipalCents / 100} />
                  <input name="termMonths" type="hidden" value={loan.termMonths} />
                  <div className="grid grid-cols-2 gap-3"><Field label="貸款名稱"><input className="input" name="name" defaultValue={loan.name} required /></Field><Field label="金融機構"><input className="input" name="institution" defaultValue={loan.institution ?? ""} /></Field></div>
                  {loan.type !== "reserve_credit" ? <Field label="還款追蹤方式">
                    <select className="input" name="trackingMode" defaultValue={trackingMode} onChange={(event) => updateLoanFormEstimate(event.currentTarget.form)}>
                      <option value="amortized">本息按月攤還</option>
                      <option value="prepaid_interest">利息預付，本金按期攤還</option>
                      <option value="manual">手動管理餘額</option>
                    </select>
                  </Field> : (
                    <>
                      <input name="trackingMode" type="hidden" value={loan.metadata?.reserve_mode === "installment" ? "amortized" : "manual"} />
                      <Field label="核准額度"><input className="input" name="creditLimit" defaultValue={(loan.creditLimitCents ?? 0) / 100} inputMode="decimal" required /></Field>
                      <Field label="使用方式"><select className="input" name="reserveMode" defaultValue={String(loan.metadata?.reserve_mode ?? "revolving")}><option value="revolving">隨借隨還</option><option value="installment">申請分期</option></select></Field>
                      <Field label="本期計息天數"><input className="input" name="billingDays" type="number" min={1} max={366} defaultValue={Number(loan.metadata?.reserve_billing_days ?? 30)} /></Field>
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-3"><Field label="剩餘本金"><input className="input" name="remaining" defaultValue={progress.remainingPrincipalCents / 100} inputMode="decimal" required /></Field><Field label="年利率 %"><input className="input" name="annualRate" defaultValue={loan.annualRate * 100} inputMode="decimal" required /></Field></div>
                  <div className="grid grid-cols-2 gap-3"><Field label="已繳期數"><input className="input" name="paidPeriods" type="number" min={0} max={loan.termMonths} defaultValue={loan.paidPeriods} onChange={(event) => updateLoanProgressEstimate(event.currentTarget.form)} /></Field><Field label="累計實付"><input className="input" name="paidAmount" defaultValue={progress.totalCashPaidCents / 100} inputMode="decimal" /></Field></div>
                  {loan.type !== "reserve_credit" && <Field label="預付利息（如有）"><input className="input" name="prepaidInterest" defaultValue={progress.prepaidInterestCents / 100} inputMode="decimal" onChange={(event) => updateLoanProgressEstimate(event.currentTarget.form)} /></Field>}
                  <div className="grid grid-cols-2 gap-3"><Field label="每月還款日"><input className="input" name="paymentDay" type="number" min={1} max={31} defaultValue={loan.monthlyPaymentDay} /></Field><Field label="每期應繳"><input className="input" name="payment" defaultValue={loan.paymentPerPeriodCents / 100} inputMode="decimal" onChange={(event) => updateLoanFormEstimate(event.currentTarget.form)} required /></Field></div>
                  <p data-loan-rate-hint className="helper-text">{trackingMode === "prepaid_interest" ? "合約利率會保留；每期款主要沖減本金，不用月付金反推利率。" : "調整每期金額後，系統會依原始本金與總期數估算年利率。"}</p>
                  {loan.type !== "reserve_credit" && <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
                    <input className="mt-0.5 h-4 w-4 accent-emerald-600" name="autoCalculateProgress" type="checkbox" defaultChecked={loan.metadata?.auto_calculate_progress !== false && trackingMode !== "manual"} onChange={(event) => updateLoanProgressEstimate(event.currentTarget.form)} />
                    <span>
                      <span className="block font-medium">依已繳期數自動更新</span>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">關閉後可自行輸入剩餘本金與累計實付。</span>
                    </span>
                  </label>}
                  <p data-loan-progress-hint className="helper-text">已清償本金 {formatMoney(progress.principalPaidCents)}，剩餘 {formatMoney(progress.remainingPrincipalCents)}，累計實付 {formatMoney(progress.totalCashPaidCents)}。</p>
                  <Field label="狀態"><select className="input" name="status" defaultValue={loan.status}><option value="active">進行中</option><option value="paid_off">已結清</option><option value="paused">已暫停</option></select></Field>
                  <button className="btn-primary w-full" type="submit">儲存變更</button>
                </form>
              </details>
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
      <section className="panel">
        <div className="flex items-center gap-2"><WalletCards size={18} /><h2 className="text-lg font-semibold">備用金試算器</h2></div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">依實際動用餘額與計息天數估算利息，也可比較分期及提前還款效果。</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <CalcInput label="核准額度" value={reserveCalcInput.creditLimitCents / 100} onChange={(value) => setReserveCalcInput((current) => ({ ...current, creditLimitCents: Math.max(0, Math.round(value * 100)) }))} />
          <CalcInput label="已動用" value={reserveCalcInput.utilizedBalanceCents / 100} onChange={(value) => setReserveCalcInput((current) => ({ ...current, utilizedBalanceCents: Math.max(0, Math.round(value * 100)) }))} />
          <CalcInput label="年利率 %" value={reserveCalcInput.annualRate * 100} onChange={(value) => setReserveCalcInput((current) => ({ ...current, annualRate: Math.max(0, value / 100) }))} />
          <CalcInput label="計息天數" value={reserveCalcInput.billingDays} onChange={(value) => setReserveCalcInput((current) => ({ ...current, billingDays: Math.min(366, Math.max(1, Math.round(value))) }))} />
          <CalcInput label="分期期數" value={reserveCalcInput.installmentMonths} onChange={(value) => setReserveCalcInput((current) => ({ ...current, installmentMonths: Math.max(0, Math.round(value)) }))} />
          <CalcInput label="立即提前還款" value={(reserveCalcInput.immediatePrepaymentCents ?? 0) / 100} onChange={(value) => setReserveCalcInput((current) => ({ ...current, immediatePrepaymentCents: Math.max(0, Math.round(value * 100)) }))} />
          <CalcInput label="每月額外還款" value={(reserveCalcInput.extraMonthlyPaymentCents ?? 0) / 100} onChange={(value) => setReserveCalcInput((current) => ({ ...current, extraMonthlyPaymentCents: Math.max(0, Math.round(value * 100)) }))} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="可用額度" value={formatMoney(reserveResult.availableCreditCents)} />
          <StatCard label="本期估算利息" value={formatMoney(reserveResult.billingInterestCents)} />
          <StatCard label="提前還款後本金" value={formatMoney(reserveResult.principalAfterPrepaymentCents)} />
          <StatCard label="分期每月應繳" value={formatMoney(reserveResult.installmentPaymentCents)} />
          <StatCard label="預估分期總利息" value={formatMoney(reserveResult.totalInstallmentInterestCents)} />
          <StatCard label="預估節省利息" value={formatMoney(reserveResult.interestSavedCents)} />
        </div>
      </section>
    </div>
  );
}

function DepositsPage({
  accounts,
  deposits,
  onAdd,
  onUpdate,
  onDelete,
  notify
}: {
  accounts: FinancialAccount[];
  deposits: Deposit[];
  onAdd: (deposit: Deposit) => Promise<void>;
  onUpdate: (deposit: Deposit) => Promise<void>;
  onDelete: (deposit: Deposit) => Promise<void>;
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
  const depositAccounts = accounts.filter(
    (account) => account.isActive && (account.type === "time_deposit" || account.type === "savings")
  );
  const linkedDepositAccountIds = new Set(activeDeposits.map((deposit) => deposit.accountId).filter(Boolean));
  const availableDepositAccounts = depositAccounts.filter((account) => !linkedDepositAccountIds.has(account.id));
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
    const termMonths = Number(formData.get("termMonths"));
    const validation = combineValidations(
      validatePositiveAmount(principal, "本金"),
      validateAnnualRate(annualRate),
      validateIntegerRange(termMonths, 1, 600, "存款期間"),
      validateDateRange(startDate, maturityDate)
    );
    if (!validation.valid) return notify("error", validation.errors[0]);
    const estimate = calculateDeposit({ principalCents: principal, annualRate, months: termMonths, interestType: "simple" });
    const now = new Date().toISOString();
    void onAdd({
      id: crypto.randomUUID(),
      userId: localUserId,
      accountId: String(formData.get("accountId") || "") || undefined,
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
    });
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
        <FormDisclosure title="新增定期存款" description="建立定存後，預估利息與到期金額會自動帶入總覽。">
          <form className="space-y-3" onSubmit={handleFormSubmit(addDeposit)}>
            <Field label="存款名稱"><input className="input" name="name" required /></Field>
            <Field label="金融機構"><input className="input" name="institution" /></Field>
            <Field label="對應帳戶">
              <select className="input" name="accountId" defaultValue="">
                <option value="">不連結帳戶</option>
                {availableDepositAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {formatMoney(account.balanceCents)}</option>)}
              </select>
            </Field>
            <Field label="本金"><input className="input" name="principal" inputMode="decimal" required /></Field>
            <Field label="年利率 %"><input className="input" name="annualRate" inputMode="decimal" defaultValue="1.6" /></Field>
            <Field label="期間（月）"><input className="input" name="termMonths" type="number" min={1} defaultValue={12} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="起存日"><input className="input" name="startDate" type="date" defaultValue={today} /></Field><Field label="到期日"><input className="input" name="maturityDate" type="date" defaultValue={nextYearDate} /></Field></div>
            <label className="flex items-center gap-2 text-sm"><input name="available" type="checkbox" /> 列入可動用資金</label>
            <label className="flex items-center gap-2 text-sm"><input name="autoRenew" type="checkbox" /> 自動續存</label>
            <button className="btn-primary w-full" type="submit"><Plus size={16} />新增存款</button>
          </form>
        </FormDisclosure>
        <section className="grid gap-3 md:grid-cols-2">
          {deposits.length === 0 ? <div className="md:col-span-2"><EmptyState label="尚未建立定期存款，新增後會顯示到期日與預估利息。" /></div> : deposits.map((deposit) => (
            <div key={deposit.id} className="panel">
              <div className="flex items-start justify-between gap-3"><p className="font-semibold">{deposit.name}</p><button className="btn-danger h-8 w-8 px-0" onClick={() => void onDelete(deposit)} title="刪除存款" aria-label={`刪除 ${deposit.name}`}><Trash2 size={15} /></button></div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{deposit.institution} · {deposit.termMonths} 個月 · {formatPercent(deposit.annualRate)}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info label="本金" value={formatMoney(deposit.principalCents)} />
                <Info label="預估利息" value={formatMoney(deposit.estimatedInterestCents)} />
                <Info label="到期金額" value={formatMoney(deposit.estimatedMaturityAmountCents)} />
                <Info label="到期日" value={formatDate(deposit.maturityDate)} />
              </div>
              <details className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                <summary className="cursor-pointer text-sm font-semibold text-emerald-700 dark:text-emerald-300">編輯存款</summary>
                <form className="mt-3 space-y-3" onSubmit={handleFormSubmit((formData) => {
                  const accountId = String(formData.get("accountId") || "") || undefined;
                  void onUpdate({ ...deposit, accountId });
                })}>
                  <Field label="對應帳戶">
                    <select className="input" name="accountId" defaultValue={deposit.accountId ?? ""}>
                      <option value="">不連結帳戶</option>
                      {depositAccounts
                        .filter((account) => account.id === deposit.accountId || !linkedDepositAccountIds.has(account.id))
                        .map((account) => <option key={account.id} value={account.id}>{account.name} · {formatMoney(account.balanceCents)}</option>)}
                    </select>
                  </Field>
                  <p className="helper-text">連結後，總資產會採用帳戶餘額，避免同一筆定存重複計算。</p>
                  <button className="btn-primary w-full" type="submit">儲存連結</button>
                </form>
              </details>
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

function InsurancePage({ policies, onAdd, onDelete }: { policies: InsurancePolicy[]; onAdd: (formData: FormData) => void; onDelete: (policy: InsurancePolicy) => Promise<void> }) {
  const activePolicies = policies.filter((policy) => policy.status === "active");
  const totalCoverageCents = activePolicies.reduce((sum, policy) => sum + policy.coverageAmountCents, 0);
  const annualPremiumCents = activePolicies.reduce((sum, policy) => sum + policy.annualPremiumCents, 0);
  const monthlyPremiumCents = Math.round(annualPremiumCents / 12);
  const paidClaimsCents = activePolicies.reduce((sum, policy) => sum + policy.paidClaimAmountCents, 0);
  const pendingClaimsCents = activePolicies.reduce((sum, policy) => sum + policy.pendingClaimAmountCents, 0);
  const coverageLeverage = annualPremiumCents > 0 ? totalCoverageCents / annualPremiumCents : 0;
  const nextRenewal = [...activePolicies].sort((a, b) => a.renewalDate.localeCompare(b.renewalDate))[0];
  const typeBreakdown = Object.entries(
    activePolicies.reduce<Record<string, number>>((acc, policy) => {
      acc[insuranceTypeLabels[policy.type]] = (acc[insuranceTypeLabels[policy.type]] ?? 0) + policy.annualPremiumCents;
      return acc;
    }, {})
  )
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);
  const coverageBreakdown = Object.entries(
    activePolicies.reduce<Record<string, number>>((acc, policy) => {
      acc[insuranceTypeLabels[policy.type]] = (acc[insuranceTypeLabels[policy.type]] ?? 0) + policy.coverageAmountCents;
      return acc;
    }, {})
  )
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<Umbrella size={18} />}
        label="保險總覽"
        title="保障額、保費與理賠狀態"
        value={formatMoney(totalCoverageCents)}
        tone="emerald"
        metrics={[
          { label: "年保費", value: formatMoney(annualPremiumCents), accent: "border-amber-300" },
          { label: "月均保費", value: formatMoney(monthlyPremiumCents), accent: "border-sky-300" },
          { label: "已理賠", value: formatMoney(paidClaimsCents), accent: "border-emerald-300" }
        ]}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DonutChart
            segments={[
              { label: "已理賠", value: paidClaimsCents, color: "#059669" },
              { label: "待理賠", value: pendingClaimsCents, color: "#f59e0b" },
              { label: "剩餘保障", value: Math.max(0, totalCoverageCents - paidClaimsCents - pendingClaimsCents), color: "#0ea5e9" }
            ]}
            centerLabel="保障"
            centerValue={formatCompactMoney(totalCoverageCents)}
          />
          <div className="flex-1 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-300">保障/年保費</span>
              <span className="font-semibold text-white">{coverageLeverage.toFixed(1)} 倍</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-300">最近續保</span>
              <span className="font-semibold text-white">{nextRenewal ? formatDate(nextRenewal.renewalDate) : "尚無資料"}</span>
            </div>
            <StackedDistribution data={coverageBreakdown.slice(0, 5)} total={totalCoverageCents} />
            <CompactDistributionList data={coverageBreakdown.slice(0, 5)} total={totalCoverageCents} inverse />
          </div>
        </div>
      </FeatureHero>

      <div className="grid gap-4 lg:grid-cols-5">
        <StatCard label="有效保單" value={`${activePolicies.length} 張`} />
        <StatCard label="總保障額" value={formatMoney(totalCoverageCents)} />
        <StatCard label="年保費" value={formatMoney(annualPremiumCents)} />
        <StatCard label="待理賠" value={formatMoney(pendingClaimsCents)} />
        <StatCard label="保障倍數" value={`${coverageLeverage.toFixed(1)}x`} />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} />
            <h2 className="text-lg font-semibold">保費類型分布</h2>
          </div>
          <MiniBars data={typeBreakdown.map((item) => ({ label: item.category, amountCents: item.amountCents }))} emptyLabel="尚無保費資料" />
        </div>
        <div className="panel">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} />
            <h2 className="text-lg font-semibold">保障類型分布</h2>
          </div>
          <MiniBars data={coverageBreakdown.map((item) => ({ label: item.category, amountCents: item.amountCents }))} emptyLabel="尚無保障資料" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <FormDisclosure title="新增保單" description="建立保單後，保障額、保費與理賠狀態會整理在同一處。">
          <form className="space-y-3" onSubmit={handleFormSubmit(onAdd)}>
            <Field label="保單名稱"><input className="input" name="name" required /></Field>
            <Field label="保險類型">
              <select className="input" name="type" defaultValue="medical">
                {Object.entries(insuranceTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="保險公司"><input className="input" name="insurer" required /></Field>
            <Field label="保單末四碼"><input className="input" name="policyNumberLast4" maxLength={4} inputMode="numeric" /></Field>
            <Field label="被保險人"><input className="input" name="insuredPerson" defaultValue="自己" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="年保費"><input className="input" name="annualPremium" inputMode="decimal" required /></Field>
              <Field label="保障額度"><input className="input" name="coverageAmount" inputMode="decimal" required /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="已理賠"><input className="input" name="paidClaimAmount" inputMode="decimal" defaultValue="0" /></Field>
              <Field label="待理賠"><input className="input" name="pendingClaimAmount" inputMode="decimal" defaultValue="0" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="繳費日"><input className="input" name="paymentDay" type="number" min={1} max={31} defaultValue={5} /></Field>
              <Field label="續保日"><input className="input" name="renewalDate" type="date" defaultValue={nextYearDate} /></Field>
            </div>
            <Field label="受益人"><input className="input" name="beneficiary" /></Field>
            <Field label="狀態">
              <select className="input" name="status" defaultValue="active">
                {Object.entries(insuranceStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="備註"><textarea className="input" name="note" rows={2} /></Field>
            <button className="btn-primary w-full" type="submit"><Plus size={16} />新增保單</button>
          </form>
        </FormDisclosure>

        <section className="grid gap-3 md:grid-cols-2">
          {policies.length === 0 ? (
            <div className="md:col-span-2"><EmptyState label="尚未建立保單，新增後會顯示保費、保障與理賠狀態" /></div>
          ) : (
            policies.map((policy) => {
              const claimRatio = (policy.paidClaimAmountCents + policy.pendingClaimAmountCents) / Math.max(policy.coverageAmountCents, 1);
              return (
                <div key={policy.id} className="panel">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{policy.name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{policy.insurer} · {insuranceTypeLabels[policy.type]}{policy.policyNumberLast4 ? ` · **** ${policy.policyNumberLast4}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2"><Badge>{insuranceStatusLabels[policy.status]}</Badge><button className="btn-danger h-8 w-8 px-0" onClick={() => void onDelete(policy)} title="刪除保單" aria-label={`刪除 ${policy.name}`}><Trash2 size={15} /></button></div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Info label="保障額度" value={formatMoney(policy.coverageAmountCents)} />
                    <Info label="年保費" value={formatMoney(policy.annualPremiumCents)} />
                    <Info label="已理賠" value={formatMoney(policy.paidClaimAmountCents)} />
                    <Info label="待理賠" value={formatMoney(policy.pendingClaimAmountCents)} />
                    <Info label="繳費日" value={`每月 ${policy.paymentDay} 日`} />
                    <Info label="續保日" value={formatDate(policy.renewalDate)} />
                  </div>
                  <div className="mt-4">
                    <Progress label="理賠使用比例" value={claimRatio} colorClass={claimRatio > 0.7 ? "bg-rose-500" : "bg-emerald-500"} />
                  </div>
                  {policy.note && <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">{policy.note}</p>}
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

function FinancialPlansPage({
  plans,
  recurringIncomes,
  accounts,
  transactions,
  reminders,
  loans,
  installments,
  creditCards,
  dashboard,
  onAdd,
  onUpdate,
  onDelete,
  onAddIncome,
  onUpdateIncome,
  onDeleteIncome,
  notify
}: {
  plans: FinancialPlan[];
  recurringIncomes: RecurringIncome[];
  accounts: FinancialAccount[];
  transactions: Transaction[];
  reminders: FinancialReminder[];
  loans: Loan[];
  installments: CreditCardInstallment[];
  creditCards: CreditCard[];
  dashboard: ReturnType<typeof summarizeDashboard>;
  onAdd: (plan: FinancialPlan) => Promise<void>;
  onUpdate: (plan: FinancialPlan) => Promise<void>;
  onDelete: (plan: FinancialPlan) => Promise<void>;
  onAddIncome: (income: RecurringIncome) => Promise<void>;
  onUpdateIncome: (income: RecurringIncome) => Promise<void>;
  onDeleteIncome: (income: RecurringIncome) => Promise<void>;
  notify: (type: ToastType, message: string) => void;
}) {
  const [forecastMonths, setForecastMonths] = useState(12);
  const activePlans = plans.filter((plan) => plan.status === "active");
  const projections = activePlans.map((plan) => ({ plan, result: getPlanProjection(plan) }));
  const totalTargetCents = projections.reduce((sum, item) => sum + item.result.targetAmountCents, 0);
  const totalCurrentCents = projections.reduce((sum, item) => sum + item.result.currentAmountCents, 0);
  const totalRequiredMonthlyCents = projections.reduce((sum, item) => sum + item.result.requiredMonthlyContributionCents, 0);
  const totalMonthlyContributionCents = projections.reduce((sum, item) => sum + item.plan.monthlyContributionCents, 0);
  const allocationPlan = activePlans.find((plan) => plan.goalType === "investment" || plan.horizon === "long") ?? activePlans[0];
  const allocation = getFinancialPlanAllocation(allocationPlan?.riskProfile ?? "balanced");
  const recentLivingExpenseCents = (() => {
    const recentMonths = getRecentMonthKeys(currentTaipeiMonth(), 3);
    const total = transactions
      .filter((transaction) => recentMonths.some((month) => transaction.date.startsWith(month)))
      .filter((transaction) => transaction.type === "expense" || transaction.type === "credit_card_purchase")
      .reduce((sum, transaction) => sum + transaction.amountCents, 0);
    return Math.round(total / recentMonths.length);
  })();
  const activeReminderMonthlyCents = reminders
    .filter((reminder) => reminder.status !== "done")
    .reduce((sum, reminder) => sum + getMonthlyRecurringEquivalent(reminder.amountCents, reminder.frequency), 0);
  const flexibleLivingExpenseCents = Math.max(0, recentLivingExpenseCents - activeReminderMonthlyCents);
  const forecast = calculateFutureCashFlow({
    startMonth: currentTaipeiMonth(),
    months: forecastMonths,
    openingBalanceCents: dashboard.availableCashCents,
    incomes: recurringIncomes
      .filter((income) => income.isActive)
      .map((income) => ({
        amountCents: income.amountCents,
        frequency: income.frequency,
        startDate: income.startDate,
        endDate: income.endDate,
        annualGrowthRate: income.annualGrowthRate
      })),
    fixedExpenses: reminders
      .filter((reminder) => reminder.status !== "done")
      .map((reminder) => ({
        amountCents: reminder.amountCents,
        frequency: reminder.frequency,
        startDate: reminder.startDate,
        endDate: reminder.endDate
      }))
      .concat(flexibleLivingExpenseCents > 0 ? [{
        amountCents: flexibleLivingExpenseCents,
        frequency: "monthly" as const,
        startDate: today,
        endDate: undefined
      }] : []),
    debtPayments: [
      ...loans
        .filter((loan) => loan.status === "active" && loan.paymentPerPeriodCents > 0)
        .map((loan) => ({
          amountCents: loan.paymentPerPeriodCents,
          frequency: "monthly" as const,
          startDate: today,
          endDate: addMonthsToIsoDate(today, Math.max(0, loan.termMonths - loan.paidPeriods - 1))
        })),
      ...installments
        .filter((installment) => installment.status === "active" && !installment.includedInCardBalance && installment.monthlyPaymentCents > 0)
        .map((installment) => ({
          amountCents: installment.monthlyPaymentCents,
          frequency: "monthly" as const,
          startDate: today,
          endDate: addMonthsToIsoDate(today, Math.max(0, installment.periods - installment.paidPeriods - 1))
        })),
      ...creditCards
        .filter((card) => card.isActive && card.currentStatementAmountCents > 0)
        .map((card) => ({
          amountCents: card.currentStatementAmountCents,
          frequency: "one_time" as const,
          startDate: today
        }))
    ],
    goalContributions: projections
      .filter(({ result }) => result.requiredMonthlyContributionCents > 0)
      .map(({ plan, result }) => ({
        amountCents: Math.max(plan.monthlyContributionCents, result.requiredMonthlyContributionCents),
        frequency: "monthly" as const,
        startDate: today,
        endDate: plan.targetDate
      }))
  });
  const averageMonthlyIncomeCents = Math.round(forecast.totalIncomeCents / forecast.rows.length);
  const averageMonthlyOutflowCents = Math.round(forecast.totalOutflowCents / forecast.rows.length);
  const activeIncomeCount = recurringIncomes.filter((income) => income.isActive).length;

  function readPlan(formData: FormData, existing?: FinancialPlan): FinancialPlan | null {
    const name = String(formData.get("name") ?? "").trim();
    const targetAmountCents = parseMoneyToCents(String(formData.get("targetAmount") ?? ""));
    const currentAmountCents = parseMoneyToCents(String(formData.get("currentAmount") ?? "0"));
    const monthlyContributionCents = parseMoneyToCents(String(formData.get("monthlyContribution") ?? "0"));
    const targetDate = String(formData.get("targetDate") ?? "");
    const expectedAnnualReturn = Number(formData.get("expectedAnnualReturn") ?? 0) / 100;
    const priority = Number(formData.get("priority") ?? 3);
    if (!name) {
      notify("error", "請輸入計劃名稱");
      return null;
    }
    const validation = combineValidations(
      validatePositiveAmount(targetAmountCents, "目標金額"),
      validateNonNegativeAmount(currentAmountCents, "目前金額"),
      validateNonNegativeAmount(monthlyContributionCents, "每月投入"),
      validateDateRange(targetDate),
      validateAnnualRate(expectedAnnualReturn),
      validateIntegerRange(priority, 1, 5, "優先順序")
    );
    if (!validation.valid) {
      notify("error", validation.errors[0]);
      return null;
    }
    if (targetDate <= today) {
      notify("error", "目標日期需晚於今天");
      return null;
    }
    const now = new Date().toISOString();
    return {
      id: existing?.id ?? crypto.randomUUID(),
      userId: existing?.userId ?? localUserId,
      name,
      goalType: String(formData.get("goalType") ?? "custom") as FinancialPlan["goalType"],
      horizon: String(formData.get("horizon") ?? "medium") as FinancialPlan["horizon"],
      targetAmountCents,
      currentAmountCents,
      monthlyContributionCents,
      targetDate,
      expectedAnnualReturn,
      riskProfile: String(formData.get("riskProfile") ?? "balanced") as FinancialPlan["riskProfile"],
      priority,
      note: String(formData.get("note") ?? "").trim(),
      status: String(formData.get("status") ?? "active") as FinancialPlan["status"],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
  }

  function readRecurringIncome(formData: FormData, existing?: RecurringIncome): RecurringIncome | null {
    const name = String(formData.get("name") ?? "").trim();
    const amountCents = parseMoneyToCents(String(formData.get("amount") ?? ""));
    const startDate = String(formData.get("startDate") ?? "");
    const endDate = String(formData.get("endDate") ?? "");
    const dayOfMonth = Number(formData.get("dayOfMonth") ?? 1);
    const annualGrowthRate = Number(formData.get("annualGrowthRate") ?? 0) / 100;
    if (!name) {
      notify("error", "請輸入固定收入名稱");
      return null;
    }
    const validation = combineValidations(
      validatePositiveAmount(amountCents, "固定收入金額"),
      validateDateRange(startDate, endDate || undefined),
      validateIntegerRange(dayOfMonth, 1, 31, "入帳日")
    );
    if (!validation.valid) {
      notify("error", validation.errors[0]);
      return null;
    }
    if (!Number.isFinite(annualGrowthRate) || annualGrowthRate < -0.5 || annualGrowthRate > 1) {
      notify("error", "年度調整率請輸入 -50% 至 100%");
      return null;
    }
    const now = new Date().toISOString();
    return {
      id: existing?.id ?? crypto.randomUUID(),
      userId: existing?.userId ?? localUserId,
      name,
      incomeType: String(formData.get("incomeType") ?? "salary") as RecurringIncome["incomeType"],
      payer: String(formData.get("payer") ?? "").trim() || undefined,
      amountCents,
      frequency: String(formData.get("frequency") ?? "monthly") as RecurringIncome["frequency"],
      dayOfMonth,
      accountId: String(formData.get("accountId") ?? "") || undefined,
      startDate,
      endDate: endDate || undefined,
      annualGrowthRate,
      note: String(formData.get("note") ?? "").trim() || undefined,
      isActive: formData.get("isActive") === "on",
      metadata: existing?.metadata,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
  }

  const actions = getFinancialPlanActions(dashboard, totalRequiredMonthlyCents, totalMonthlyContributionCents, activePlans.length);

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<Target size={18} />}
        label="財務計劃"
        title="把目標、期限與每月行動放進同一張路線圖"
        value={formatMoney(totalTargetCents)}
        tone="sky"
        metrics={[
          { label: "已準備", value: formatMoney(totalCurrentCents), accent: "border-emerald-300" },
          { label: "每月目標投入", value: formatMoney(totalRequiredMonthlyCents), accent: "border-sky-300" },
          { label: "進行中", value: String(activePlans.length) + " 項", accent: "border-violet-300" }
        ]}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DonutChart
            segments={[
              { label: "已準備", value: totalCurrentCents, color: "#10b981" },
              { label: "尚待準備", value: Math.max(0, totalTargetCents - totalCurrentCents), color: "#60a5fa" }
            ]}
            centerLabel="總進度"
            centerValue={totalTargetCents > 0 ? formatPercent(totalCurrentCents / totalTargetCents, 0) : "0%"}
          />
          <div className="flex-1 space-y-3">
            <Progress label="目標準備進度" value={totalTargetCents > 0 ? totalCurrentCents / totalTargetCents : 0} helper={formatMoney(totalCurrentCents) + " / " + formatMoney(totalTargetCents)} colorClass="bg-emerald-500" />
            <Progress label="目前每月投入" value={totalRequiredMonthlyCents > 0 ? totalMonthlyContributionCents / totalRequiredMonthlyCents : 1} helper={formatMoney(totalMonthlyContributionCents) + " / " + formatMoney(totalRequiredMonthlyCents)} colorClass={totalMonthlyContributionCents >= totalRequiredMonthlyCents ? "bg-emerald-500" : "bg-amber-500"} />
            <p className="text-xs leading-5 text-slate-300">所有金額只在目前帳本內計算；試算用於規劃，不代表投資報酬保證。</p>
          </div>
        </div>
      </FeatureHero>

      <div className="grid gap-4 lg:grid-cols-4">
        <StatCard label="進行中目標" value={String(activePlans.length) + " 項"} />
        <StatCard label="尚待準備" value={formatMoney(Math.max(0, totalTargetCents - totalCurrentCents))} />
        <StatCard label="本月可投入結餘" value={formatMoney(Math.max(0, dashboard.monthlyBalanceCents))} />
        <StatCard label="每月投入差額" value={formatMoney(Math.max(0, totalRequiredMonthlyCents - totalMonthlyContributionCents))} />
      </div>

      <section className="panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><TrendingUp size={18} className="text-emerald-600 dark:text-emerald-300" /><h2 className="text-lg font-semibold">未來收支預估</h2></div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">依固定收入、帳單、債務及目標投入逐月估算。</p>
          </div>
          <div className="inline-flex w-fit rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
            {[12, 24, 36].map((months) => (
              <button
                key={months}
                className={`rounded px-3 py-2 text-sm font-medium ${forecastMonths === months ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "text-slate-600 dark:text-slate-300"}`}
                onClick={() => setForecastMonths(months)}
                type="button"
              >
                {months} 個月
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Info label="平均每月收入" value={formatMoney(averageMonthlyIncomeCents)} />
          <Info label="平均每月總支出" value={formatMoney(averageMonthlyOutflowCents)} />
          <Info label="期末可動用資金" value={formatMoney(forecast.endingBalanceCents)} />
          <Info label="目標資金缺口" value={formatMoney(forecast.fundingGapCents)} />
        </div>
        <FutureCashFlowChart rows={forecast.rows} />
        <div className={`mt-4 rounded-md border p-3 text-sm ${forecast.fundingGapCents === 0 && forecast.lowestBalanceCents >= 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"}`}>
          {activeIncomeCount === 0
            ? "先建立薪資或其他固定收入，才能判斷目前目標是否符合未來現金流。"
            : forecast.fundingGapCents > 0
              ? `目前收入與既定支出下，${forecastMonths} 個月內的目標投入缺口約 ${formatMoney(forecast.fundingGapCents)}。`
              : `目前收入可支應既定支出與目標投入，每月保守可投入約 ${formatMoney(forecast.sustainableGoalContributionCents)}。`}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <FormDisclosure title="新增固定收入" description="建立薪資、獎金、租金或其他可預期收入。">
          <form className="space-y-3" onSubmit={handleFormSubmit((formData) => {
            const income = readRecurringIncome(formData);
            if (income) void onAddIncome(income);
          })}>
            <RecurringIncomeFields accounts={accounts} />
            <button className="btn-primary w-full" type="submit"><Plus size={16} />新增固定收入</button>
          </form>
        </FormDisclosure>
        <section className="panel">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold">固定收入來源</h2><p className="text-sm text-slate-500 dark:text-slate-400">調薪或收入終止後，未來預估會立即更新。</p></div>
            <Badge>{activeIncomeCount} 項啟用</Badge>
          </div>
          {recurringIncomes.length === 0 ? <EmptyState label="尚未建立固定收入，先加入薪資或其他收入來源。" /> : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {recurringIncomes.map((income) => (
                <article key={income.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{income.name}</h3><Badge>{recurringIncomeTypeLabels[income.incomeType]}</Badge></div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{income.payer || "未填付款來源"} · {recurringFrequencyLabels[income.frequency]}</p>
                    </div>
                    <button className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950" onClick={() => void onDeleteIncome(income)} title="刪除固定收入" aria-label={`刪除 ${income.name}`}><Trash2 size={16} /></button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Info label="單次金額" value={formatMoney(income.amountCents)} />
                    <Info label="月均收入" value={formatMoney(getMonthlyIncomeEquivalent(income))} />
                    <Info label="年度調整" value={formatPercent(income.annualGrowthRate)} />
                    <Info label="狀態" value={income.isActive ? "計入預估" : "已停用"} />
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{formatDate(income.startDate)} 起{income.endDate ? `至 ${formatDate(income.endDate)}` : "，無結束日期"}</p>
                  <details className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-100"><Pencil size={15} />編輯固定收入</summary>
                    <form className="mt-3 space-y-3" onSubmit={handleFormSubmit((formData) => {
                      const next = readRecurringIncome(formData, income);
                      if (next) void onUpdateIncome(next);
                    })}>
                      <RecurringIncomeFields income={income} accounts={accounts} />
                      <button className="btn-primary w-full" type="submit">儲存變更</button>
                    </form>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <section className="panel">
          <div className="flex items-center gap-2"><Target size={18} className="text-sky-600 dark:text-sky-300" /><h2 className="text-lg font-semibold">建立財務計劃</h2></div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">設定一個目標，系統會反推每月應準備的金額。</p>
          <form className="mt-4 space-y-3" onSubmit={handleFormSubmit((formData) => {
            const plan = readPlan(formData);
            if (plan) void onAdd(plan);
          })}>
            <FinancialPlanFields />
            <button className="btn-primary w-full" type="submit"><Plus size={16} />建立計劃</button>
          </form>
        </section>

        <div className="space-y-4">
          <section className="panel">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-lg font-semibold">下一步行動</h2><p className="text-sm text-slate-500 dark:text-slate-400">依目前帳本的結餘、負債與預備金整理。</p></div>
              <Badge>{activePlans.length > 0 ? "已建立計劃" : "等待建立"}</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {actions.map((action, index) => (
                <div key={action.title} className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-200">{index + 1}</span>
                  <p className="mt-3 font-semibold text-slate-950 dark:text-slate-50">{action.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{action.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-lg font-semibold">長期資金配置參考</h2><p className="text-sm text-slate-500 dark:text-slate-400">{allocationPlan ? "依「" + allocationPlan.name + "」的" + financialPlanRiskLabels[allocationPlan.riskProfile] + "屬性顯示。" : "建立目標後會依風險屬性顯示配置參考。"}</p></div>
              <Badge>{allocation.label}</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <AllocationCell label="現金與短期存款" value={allocation.cash} colorClass="bg-emerald-500" />
              <AllocationCell label="固定收益資產" value={allocation.fixedIncome} colorClass="bg-sky-500" />
              <AllocationCell label="分散股票型資產" value={allocation.diversifiedEquity} colorClass="bg-violet-500" />
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">期限較短的目標宜優先保留流動性並降低價格波動風險；這是教育性配置框架，請自行評估風險與商品成本。</p>
          </section>
        </div>
      </div>

      <section className="panel">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-semibold">計劃路線圖</h2><p className="text-sm text-slate-500 dark:text-slate-400">更新累積金額或每月投入後，期限與缺口會立即重算。</p></div>
          <Badge>{String(plans.length) + " 項計劃"}</Badge>
        </div>
        {plans.length === 0 ? <EmptyState label="先建立近期、中期或長期目標，這裡會整理你的準備進度與每月行動。" /> : (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {plans.slice().sort((a, b) => a.priority - b.priority || a.targetDate.localeCompare(b.targetDate)).map((plan) => {
              const result = getPlanProjection(plan);
              const isOnTrack = plan.status !== "active" || plan.monthlyContributionCents >= result.requiredMonthlyContributionCents;
              return (
                <article key={plan.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-950/70">
                  <div className="border-b border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-950 dark:text-slate-50">{plan.name}</h3><Badge>{financialPlanHorizonLabels[plan.horizon]}</Badge><Badge>{financialPlanStatusLabels[plan.status]}</Badge></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{financialPlanGoalLabels[plan.goalType] + " · 目標日 " + formatDate(plan.targetDate) + " · 優先 " + plan.priority}</p></div>
                      <button className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950" onClick={() => void onDelete(plan)} title="刪除財務計劃" aria-label="刪除財務計劃"><Trash2 size={16} /></button>
                    </div>
                    <div className="mt-4"><Progress label="準備進度" value={result.progress} helper={formatMoney(plan.currentAmountCents) + " / " + formatMoney(plan.targetAmountCents)} colorClass={plan.status === "completed" ? "bg-emerald-500" : "bg-sky-500"} /></div>
                  </div>
                  <div className="grid gap-3 p-4 sm:grid-cols-3"><Info label="每月需準備" value={formatMoney(result.requiredMonthlyContributionCents)} /><Info label="目前每月投入" value={formatMoney(plan.monthlyContributionCents)} /><Info label="到期預估缺口" value={formatMoney(result.projectedShortfallCents)} /></div>
                  <div className="border-t border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                    <div className="grid gap-4 sm:grid-cols-[1fr_170px] sm:items-center"><div><p className={isOnTrack ? "text-sm font-semibold text-emerald-700 dark:text-emerald-300" : "text-sm font-semibold text-amber-700 dark:text-amber-300"}>{plan.status === "completed" ? "此計劃已完成" : isOnTrack ? "目前投入可望達成目標" : "目前投入仍不足以在目標日前完成"}</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{result.monthsToGoal === null ? "依目前投入無法推估達成時間，請提高每月投入或調整目標。" : result.monthsToGoal === 0 ? "目前累積金額已達目標。" : "依目前投入，預估約 " + result.monthsToGoal + " 個月可達成。"}</p></div><FinancialPlanSparkline result={result} /></div>
                  </div>
                  <details className="border-t border-slate-200 dark:border-slate-800"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">調整計劃 <Pencil size={15} /></summary><form className="border-t border-slate-200 p-4 dark:border-slate-800" onSubmit={handleFormSubmit((formData) => { const next = readPlan(formData, plan); if (next) void onUpdate(next); })}><div className="grid gap-3 md:grid-cols-2"><FinancialPlanFields plan={plan} /></div><button className="btn-primary mt-4" type="submit"><CheckCircle2 size={16} />儲存調整</button></form></details>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function FinancialPlanFields({ plan }: { plan?: FinancialPlan }) {
  return (
    <>
      <Field label="計劃名稱"><input className="input" name="name" defaultValue={plan?.name} placeholder="例如：三年購屋頭期款" required /></Field>
      <Field label="目標類型"><select className="input" name="goalType" defaultValue={plan?.goalType ?? "custom"}>{Object.entries(financialPlanGoalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="規劃期間"><select className="input" name="horizon" defaultValue={plan?.horizon ?? "medium"}>{Object.entries(financialPlanHorizonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="目標金額"><input className="input" name="targetAmount" inputMode="numeric" defaultValue={plan ? plan.targetAmountCents / 100 : ""} placeholder="0" required /></Field>
      <Field label="目前已準備"><input className="input" name="currentAmount" inputMode="numeric" defaultValue={plan ? plan.currentAmountCents / 100 : 0} /></Field>
      <Field label="每月投入"><input className="input" name="monthlyContribution" inputMode="numeric" defaultValue={plan ? plan.monthlyContributionCents / 100 : 0} /></Field>
      <Field label="目標日期"><input className="input" name="targetDate" type="date" defaultValue={plan?.targetDate ?? addMonthsToIsoDate(today, 12)} min={addMonthsToIsoDate(today, 1)} required /></Field>
      <Field label="預估年化成長率 %"><input className="input" name="expectedAnnualReturn" type="number" min={0} max={100} step={0.1} defaultValue={plan ? plan.expectedAnnualReturn * 100 : 0} /></Field>
      <Field label="資金風險屬性"><select className="input" name="riskProfile" defaultValue={plan?.riskProfile ?? "balanced"}>{Object.entries(financialPlanRiskLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="優先順序"><select className="input" name="priority" defaultValue={plan?.priority ?? 3}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value === 1 ? "1 最高" : value === 5 ? "5 最低" : String(value)}</option>)}</select></Field>
      <Field label="狀態"><select className="input" name="status" defaultValue={plan?.status ?? "active"}>{Object.entries(financialPlanStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="備註"><input className="input" name="note" defaultValue={plan?.note} placeholder="計劃用途或限制" /></Field>
    </>
  );
}

function RecurringIncomeFields({ income, accounts }: { income?: RecurringIncome; accounts: FinancialAccount[] }) {
  return (
    <>
      <Field label="收入名稱"><input className="input" name="name" defaultValue={income?.name} placeholder="例如：每月薪資" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="收入類型"><select className="input" name="incomeType" defaultValue={income?.incomeType ?? "salary"}>{Object.entries(recurringIncomeTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="週期"><select className="input" name="frequency" defaultValue={income?.frequency ?? "monthly"}>{Object.entries(recurringFrequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      </div>
      <Field label="公司或付款來源"><input className="input" name="payer" defaultValue={income?.payer} placeholder="例如：任職公司" /></Field>
      <Field label="每次入帳金額"><input className="input" name="amount" defaultValue={income ? income.amountCents / 100 : ""} inputMode="decimal" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="入帳日"><input className="input" name="dayOfMonth" type="number" min={1} max={31} defaultValue={income?.dayOfMonth ?? 5} /></Field>
        <Field label="年度調整率 %"><input className="input" name="annualGrowthRate" type="number" min={-50} max={100} step={0.1} defaultValue={income ? income.annualGrowthRate * 100 : 0} /></Field>
      </div>
      <Field label="入帳帳戶">
        <select className="input" name="accountId" defaultValue={income?.accountId ?? ""}>
          <option value="">不指定</option>
          {accounts.filter((account) => account.isActive).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="開始日期"><input className="input" name="startDate" type="date" defaultValue={income?.startDate ?? today} required /></Field>
        <Field label="結束日期"><input className="input" name="endDate" type="date" defaultValue={income?.endDate ?? ""} /></Field>
      </div>
      <Field label="備註"><textarea className="input" name="note" rows={2} defaultValue={income?.note} /></Field>
      <label className="flex items-center gap-2 text-sm"><input name="isActive" type="checkbox" defaultChecked={income?.isActive ?? true} /> 計入未來收支預估</label>
    </>
  );
}

function FutureCashFlowChart({ rows }: { rows: ReturnType<typeof calculateFutureCashFlow>["rows"] }) {
  if (rows.length === 0) return <EmptyState label="尚無未來收支預估資料" />;
  const width = Math.max(720, rows.length * 44);
  const height = 260;
  const padding = { top: 20, right: 28, bottom: 38, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxFlow = Math.max(...rows.flatMap((row) => [row.incomeCents, row.totalOutflowCents]), 1);
  const balances = rows.map((row) => row.projectedBalanceCents);
  const minBalance = Math.min(0, ...balances);
  const maxBalance = Math.max(0, ...balances);
  const balanceRange = Math.max(1, maxBalance - minBalance);
  const slot = plotWidth / rows.length;
  const barWidth = Math.min(14, slot * 0.32);
  const flowY = (value: number) => padding.top + (1 - value / maxFlow) * plotHeight;
  const balanceY = (value: number) => padding.top + ((maxBalance - value) / balanceRange) * plotHeight;
  const balancePoints = rows.map((row, index) => `${padding.left + slot * index + slot / 2},${balanceY(row.projectedBalanceCents)}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(rows.length / 12));
  return (
    <div className="mt-4">
      <ChartLegend items={[
        { color: "#10b981", label: "固定收入" },
        { color: "#0ea5e9", label: "支出與目標投入" },
        { color: "#f59e0b", label: "預估可動用資金" }
      ]} />
      <div className="mt-3 overflow-x-auto">
        <svg className="min-w-[720px]" style={{ width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="未來固定收入、支出與可動用資金預估">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + ratio * plotHeight;
            return <line key={ratio} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />;
          })}
          {rows.map((row, index) => {
            const center = padding.left + slot * index + slot / 2;
            return (
              <g key={row.month}>
                <rect x={center - barWidth - 2} y={flowY(row.incomeCents)} width={barWidth} height={Math.max(2, padding.top + plotHeight - flowY(row.incomeCents))} rx="3" fill="#10b981">
                  <title>{`${row.month} 收入 ${formatMoney(row.incomeCents)}`}</title>
                </rect>
                <rect x={center + 2} y={flowY(row.totalOutflowCents)} width={barWidth} height={Math.max(2, padding.top + plotHeight - flowY(row.totalOutflowCents))} rx="3" fill="#0ea5e9">
                  <title>{`${row.month} 總支出 ${formatMoney(row.totalOutflowCents)}`}</title>
                </rect>
                {index % labelStep === 0 && <text x={center} y={height - 12} textAnchor="middle" className="fill-slate-500 text-xs dark:fill-slate-400">{row.month.slice(2).replace("-", "/")}</text>}
              </g>
            );
          })}
          <polyline points={balancePoints} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {rows.map((row, index) => (
            <circle key={`${row.month}-balance`} cx={padding.left + slot * index + slot / 2} cy={balanceY(row.projectedBalanceCents)} r="3.5" fill="#f59e0b" stroke="white" strokeWidth="1.5">
              <title>{`${row.month} 可動用資金 ${formatMoney(row.projectedBalanceCents)}`}</title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  );
}

function getMonthlyIncomeEquivalent(income: RecurringIncome): number {
  return getMonthlyRecurringEquivalent(income.amountCents, income.frequency);
}

function getMonthlyRecurringEquivalent(amountCents: number, frequency: "weekly" | "monthly" | "quarterly" | "yearly"): number {
  if (frequency === "weekly") return Math.round(amountCents * 52 / 12);
  if (frequency === "quarterly") return Math.round(amountCents / 3);
  if (frequency === "yearly") return Math.round(amountCents / 12);
  return amountCents;
}

function AllocationCell({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70"><div className="flex items-center justify-between gap-2"><p className="text-sm text-slate-600 dark:text-slate-300">{label}</p><strong className="text-slate-950 dark:text-slate-50">{value}%</strong></div><div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-800"><div className={"h-2 rounded-full " + colorClass} style={{ width: String(value) + "%" }} /></div></div>;
}

function FinancialPlanSparkline({ result }: { result: FinancialPlanCalculationResult }) {
  const points = result.schedule.filter((_, index) => index === 0 || index === result.schedule.length - 1 || index % Math.max(1, Math.ceil(result.schedule.length / 8)) === 0);
  const max = Math.max(result.targetAmountCents, ...points.map((point) => point.balanceCents), 1);
  const line = points.map((point, index) => String(points.length === 1 ? 85 : index / (points.length - 1) * 170) + "," + String(6 + (1 - point.balanceCents / max) * 50)).join(" ");
  return <svg className="h-16 w-full text-sky-500" viewBox="0 0 170 64" role="img" aria-label="計劃金額預估趨勢"><line x1="0" x2="170" y1="6" y2="6" stroke="currentColor" strokeDasharray="4 4" opacity="0.25" /><polyline points={line} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function getPlanProjection(plan: FinancialPlan) {
  return calculateFinancialPlan({ targetAmountCents: plan.targetAmountCents, currentAmountCents: plan.currentAmountCents, monthlyContributionCents: plan.monthlyContributionCents, expectedAnnualReturn: plan.expectedAnnualReturn, monthsToTarget: monthsBetween(today, plan.targetDate) });
}

function getFinancialPlanActions(dashboard: ReturnType<typeof summarizeDashboard>, requiredCents: number, contributionCents: number, planCount: number) {
  if (planCount === 0) return [
    { title: "先選定一個目標", detail: "從近期、可衡量的目標開始，完成後再逐步加入中期與長期計劃。" },
    { title: "確認每月可投入金額", detail: "目前帳本本月結餘為 " + formatMoney(dashboard.monthlyBalanceCents) + "，建立計劃前先保留必要支出。" },
    { title: "設定目標日期", detail: "以真實日期反推每月需要準備的金額，讓目標有明確行動節奏。" }
  ];
  const gap = Math.max(0, requiredCents - contributionCents);
  return [
    dashboard.emergencyFundMonths < 3
      ? { title: "先補足緊急預備金", detail: "目前可支撐約 " + dashboard.emergencyFundMonths.toFixed(1) + " 個月，建議先建立至少 3 個月必要支出的緩衝。" }
      : { title: "維持緊急緩衝", detail: "目前可支撐約 " + dashboard.emergencyFundMonths.toFixed(1) + " 個月，持續保留可動用資金避免目標中斷。" },
    dashboard.debtRatio > 0.5
      ? { title: "優先處理高成本債務", detail: "目前負債比 " + formatPercent(dashboard.debtRatio) + "，新增高波動投資前，先確認高利率債務的還款順序。" }
      : { title: "將目標投入排入每月", detail: "每月預計投入 " + formatMoney(contributionCents) + "，可在固定入帳後安排，降低臨時決策壓力。" },
    gap > 0
      ? { title: "補足每月投入差額", detail: "距離目標試算仍少 " + formatMoney(gap) + " / 月，可調整期限、目標或每月投入。" }
      : { title: "定期更新實際進度", detail: "每次完成儲蓄或投資後更新目前已準備金額，期限與缺口會隨即重算。" }
  ];
}

type InvestmentSection = "stocks" | "etfs" | "funds" | "bonds" | "forex" | "crypto";

const investmentSectionConfig: Record<InvestmentSection, {
  label: string;
  assetType: InvestmentAsset["assetType"];
  kinds: InvestmentCategory["kind"][];
  defaultKind: InvestmentCategory["kind"];
  defaultMarket: InvestmentCategory["market"];
}> = {
  stocks: { label: "股票", assetType: "stock", kinds: ["tw_stock", "us_stock"], defaultKind: "tw_stock", defaultMarket: "TW" },
  etfs: { label: "ETF", assetType: "etf", kinds: ["etf"], defaultKind: "etf", defaultMarket: "TW" },
  funds: { label: "基金", assetType: "fund", kinds: ["mutual_fund", "money_market"], defaultKind: "mutual_fund", defaultMarket: "GLOBAL" },
  bonds: { label: "債券", assetType: "bond", kinds: ["bond_fund"], defaultKind: "bond_fund", defaultMarket: "GLOBAL" },
  forex: { label: "外匯", assetType: "forex", kinds: ["forex"], defaultKind: "forex", defaultMarket: "FX" },
  crypto: { label: "加密貨幣", assetType: "crypto", kinds: ["crypto"], defaultKind: "crypto", defaultMarket: "CRYPTO" }
};

function InvestmentsPage({
  section,
  categories,
  assets,
  ledgerCurrency,
  onAddCategory,
  onDeleteCategory,
  onAddAsset,
  onUpdateAsset,
  onDeleteAsset,
  notify
}: {
  section: InvestmentSection;
  categories: InvestmentCategory[];
  assets: InvestmentAsset[];
  ledgerCurrency: CurrencyCode;
  onAddCategory: (category: InvestmentCategory) => Promise<void>;
  onDeleteCategory: (category: InvestmentCategory) => Promise<void>;
  onAddAsset: (asset: InvestmentAsset) => Promise<void>;
  onUpdateAsset: (asset: InvestmentAsset) => Promise<void>;
  onDeleteAsset: (asset: InvestmentAsset) => Promise<void>;
  notify: (type: ToastType, message: string) => void;
}) {
  const config = investmentSectionConfig[section];
  const supportsHoldings = true;
  const selectedAssetType = config.assetType;
  const [assetType, setAssetType] = useState<InvestmentAsset["assetType"]>(selectedAssetType);
  const [quoteCurrency, setQuoteCurrency] = useState<InvestmentAsset["quoteCurrency"]>(ledgerCurrency);
  const [editingAsset, setEditingAsset] = useState<InvestmentAsset | null>(null);
  const [assetFormVersion, setAssetFormVersion] = useState(0);

  useEffect(() => {
    setAssetType(selectedAssetType);
    setQuoteCurrency(section === "crypto" ? "USD" : ledgerCurrency);
    setEditingAsset(null);
  }, [ledgerCurrency, section, selectedAssetType]);

  const visibleCategories = categories.filter((category) => config.kinds.includes(category.kind));
  const visibleAssets = supportsHoldings ? assets.filter((asset) => asset.assetType === selectedAssetType) : [];
  const totalAllocation = visibleCategories.reduce((sum, category) => sum + category.targetAllocation, 0);
  const highRiskAllocation = visibleCategories
    .filter((category) => category.risk === "high")
    .reduce((sum, category) => sum + category.targetAllocation, 0);
  const fundAllocation = visibleCategories
    .filter((category) => category.kind === "mutual_fund" || category.kind === "bond_fund" || category.kind === "money_market")
    .reduce((sum, category) => sum + category.targetAllocation, 0);
  const investmentRiskRows = Object.entries(
    visibleCategories.reduce<Record<string, number>>((acc, category) => {
      acc[investmentRiskLabels[category.risk]] = (acc[investmentRiskLabels[category.risk]] ?? 0) + category.targetAllocation;
      return acc;
    }, {})
  ).map(([category, amountCents]) => ({ category, amountCents }));
  const valuations = visibleAssets.map((asset) => ({ asset, valuation: calculateInvestmentAssetValuation(asset) }));
  const totalCostCents = valuations.reduce((sum, row) => sum + row.valuation.costCents, 0);
  const totalValueCents = valuations.reduce((sum, row) => sum + row.valuation.currentValueCents, 0);
  const totalProfitLossCents = totalValueCents - totalCostCents;
  const totalReturnRate = totalCostCents > 0 ? totalProfitLossCents / totalCostCents : 0;
  const assetDistributionRows = valuations
    .map(({ asset, valuation }) => ({ category: asset.symbol, amountCents: valuation.currentValueCents }))
    .filter((row) => row.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents);

  function addCategory(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const targetAllocation = Number(formData.get("targetAllocation"));
    if (!name) return notify("error", "請輸入分類名稱");
    if (!Number.isFinite(targetAllocation) || targetAllocation < 0 || targetAllocation > 100) {
      return notify("error", "目標配置需介於 0% 到 100%");
    }
    const now = new Date().toISOString();
    void onAddCategory({
      id: crypto.randomUUID(),
      userId: localUserId,
      name,
      kind: String(formData.get("kind")) as InvestmentCategory["kind"],
      market: String(formData.get("market")) as InvestmentCategory["market"],
      targetAllocation,
      risk: String(formData.get("risk")) as InvestmentCategory["risk"],
      note: String(formData.get("note") ?? ""),
      isActive: true,
      createdAt: now,
      updatedAt: now
    });
  }

  function deleteCategory(category: InvestmentCategory) {
    void onDeleteCategory(category);
  }

  function saveAsset(formData: FormData) {
    const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
    const name = String(formData.get("name") ?? "").trim();
    const quantity = Number(formData.get("quantity"));
    const averageUnitCost = Number(formData.get("averageUnitCost"));
    const currentUnitPrice = Number(formData.get("currentUnitPrice"));
    const acquiredDate = String(formData.get("acquiredDate") ?? "");
    const effectiveQuoteCurrency = assetType === "forex" ? ledgerCurrency : quoteCurrency;
    const exchangeRateToLedger = assetType === "forex" || effectiveQuoteCurrency === ledgerCurrency
      ? 1
      : Number(formData.get("exchangeRateToLedger"));
    if (!symbol || !name) return notify("error", "請輸入資產代碼與名稱");
    if (![quantity, averageUnitCost, currentUnitPrice, exchangeRateToLedger].every((value) => Number.isFinite(value) && value >= 0)) {
      return notify("error", "數量、成本、現價與匯率必須是有效數字");
    }
    if (quantity <= 0 || exchangeRateToLedger <= 0) return notify("error", "數量與換算匯率必須大於 0");
    if (acquiredDate) {
      const dateValidation = validateDateRange(acquiredDate);
      if (!dateValidation.valid) return notify("error", dateValidation.errors[0]);
    }
    const now = new Date().toISOString();
    const next: InvestmentAsset = {
      id: editingAsset?.id ?? crypto.randomUUID(),
      userId: editingAsset?.userId ?? localUserId,
      categoryId: String(formData.get("categoryId") ?? "") || undefined,
      assetType,
      symbol,
      name,
      quantity,
      quoteCurrency: effectiveQuoteCurrency,
      averageUnitCost,
      currentUnitPrice,
      exchangeRateToLedger,
      platform: String(formData.get("platform") ?? "").trim() || undefined,
      acquiredDate: acquiredDate || undefined,
      note: String(formData.get("note") ?? "").trim() || undefined,
      isActive: true,
      createdAt: editingAsset?.createdAt ?? now,
      updatedAt: now
    };
    void (editingAsset ? onUpdateAsset(next) : onAddAsset(next));
    setEditingAsset(null);
    setAssetFormVersion((version) => version + 1);
  }

  function beginEditAsset(asset: InvestmentAsset) {
    setEditingAsset(asset);
    setAssetType(asset.assetType);
    setQuoteCurrency(asset.quoteCurrency);
  }

  return (
    <div className="space-y-4">
      <FeatureHero
        icon={<TrendingUp size={18} />}
        label={`${config.label} · ${ledgerCurrency}`}
        title={`${config.label}資產與配置`}
        value={supportsHoldings ? formatMoney(totalValueCents, ledgerCurrency) : `${totalAllocation.toFixed(0)}%`}
        tone="sky"
        metrics={[
          { label: "投入成本", value: formatMoney(totalCostCents, ledgerCurrency), accent: "border-emerald-300" },
          { label: "未實現損益", value: formatMoney(totalProfitLossCents, ledgerCurrency), accent: totalProfitLossCents >= 0 ? "border-sky-300" : "border-rose-300" },
          { label: "總報酬率", value: formatPercent(totalReturnRate), accent: "border-violet-300" }
        ]}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DonutChart
            segments={(assetDistributionRows.length > 0 ? assetDistributionRows : investmentRiskRows).map((row, index) => ({ label: row.category, value: row.amountCents, color: getChartColor(index) }))}
            centerLabel={visibleAssets.length > 0 ? "持倉" : "配置"}
            centerValue={visibleAssets.length > 0 ? `${visibleAssets.length} 筆` : `${totalAllocation.toFixed(0)}%`}
          />
          <div className="flex-1 space-y-3">
            <Progress label="投資報酬" value={Math.min(Math.abs(totalReturnRate), 1)} helper={formatPercent(totalReturnRate)} colorClass={totalProfitLossCents >= 0 ? "bg-emerald-500" : "bg-rose-500"} />
            <CompactDistributionList data={assetDistributionRows.length > 0 ? assetDistributionRows : investmentRiskRows} total={Math.max(assetDistributionRows.length > 0 ? totalValueCents : totalAllocation, 1)} inverse />
          </div>
        </div>
      </FeatureHero>
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard label={supportsHoldings ? "目前價值" : "分類數"} value={supportsHoldings ? formatMoney(totalValueCents, ledgerCurrency) : `${visibleCategories.length} 項`} />
        <StatCard label={supportsHoldings ? "投入成本" : "高風險配置"} value={supportsHoldings ? formatMoney(totalCostCents, ledgerCurrency) : `${highRiskAllocation.toFixed(0)}%`} />
        <StatCard label="目標配置" value={`${totalAllocation.toFixed(0)}%`} />
      </div>

      {supportsHoldings && (
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <section className="panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-sky-600 dark:text-sky-300">{editingAsset ? "編輯持倉" : "新增持倉"}</p>
              <h2 className="mt-1 text-lg font-semibold">{config.label}</h2>
            </div>
            {assetType === "forex" ? <ArrowRightLeft className="text-sky-600 dark:text-sky-300" size={22} /> : assetType === "crypto" ? <Bitcoin className="text-amber-600 dark:text-amber-300" size={22} /> : <TrendingUp className="text-emerald-600 dark:text-emerald-300" size={22} />}
          </div>
          <form key={`${editingAsset?.id ?? "new"}-${assetType}-${assetFormVersion}`} className="mt-4 space-y-3" onSubmit={handleFormSubmit(saveAsset)}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="資產代碼"><input className="input uppercase" name="symbol" defaultValue={editingAsset?.symbol} placeholder={assetType === "forex" ? "USD" : assetType === "crypto" ? "BTC" : "例如 2330"} maxLength={20} required /></Field>
              <Field label="資產名稱"><input className="input" name="name" defaultValue={editingAsset?.name} placeholder={assetType === "forex" ? "美元" : assetType === "crypto" ? "Bitcoin" : config.label + "名稱"} maxLength={100} required /></Field>
            </div>
            <Field label="持有數量"><input className="input" name="quantity" type="number" min="0.0000000001" step="0.0000000001" defaultValue={editingAsset?.quantity ?? ""} required /></Field>
            {assetType !== "forex" && (
              <Field label="報價幣別">
                <select className="input" name="quoteCurrency" value={quoteCurrency} onChange={(event) => setQuoteCurrency(event.target.value as InvestmentAsset["quoteCurrency"])}>
                  {[...Object.keys(currencyLabels), "USDT"].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={assetType === "forex" ? `平均買入匯率（${ledgerCurrency}）` : `平均單價（${quoteCurrency}）`}>
                <input className="input" name="averageUnitCost" type="number" min="0" step="0.00000001" defaultValue={editingAsset?.averageUnitCost ?? ""} required />
              </Field>
              <Field label={assetType === "forex" ? `目前匯率（${ledgerCurrency}）` : `目前單價（${quoteCurrency}）`}>
                <input className="input" name="currentUnitPrice" type="number" min="0" step="0.00000001" defaultValue={editingAsset?.currentUnitPrice ?? ""} required />
              </Field>
            </div>
            {assetType !== "forex" && quoteCurrency !== ledgerCurrency && (
              <Field label={`1 ${quoteCurrency} 可換多少 ${ledgerCurrency}`}>
                <input className="input" name="exchangeRateToLedger" type="number" min="0.0000000001" max="1000000" step="0.0000000001" defaultValue={editingAsset?.exchangeRateToLedger ?? 1} required />
              </Field>
            )}
            <Field label="投資分類">
              <select className="input" name="categoryId" defaultValue={editingAsset?.categoryId ?? ""}>
                <option value="">不指定分類</option>
                {visibleCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={assetType === "forex" ? "持有機構" : "券商或平台"}><input className="input" name="platform" defaultValue={editingAsset?.platform} placeholder={assetType === "forex" ? "銀行或外幣帳戶" : assetType === "crypto" ? "交易所或冷錢包" : "券商、銀行或基金平台"} maxLength={100} /></Field>
              <Field label="首次買入日期"><input className="input" name="acquiredDate" type="date" defaultValue={editingAsset?.acquiredDate} /></Field>
            </div>
            <Field label="備註"><input className="input" name="note" defaultValue={editingAsset?.note} maxLength={500} placeholder="策略、用途或觀察重點" /></Field>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" type="submit">{editingAsset ? <Pencil size={16} /> : <Plus size={16} />}{editingAsset ? "儲存變更" : "新增持倉"}</button>
              {editingAsset && <button className="btn-secondary" type="button" onClick={() => setEditingAsset(null)}>取消</button>}
            </div>
          </form>
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">匯率與價格由你手動更新。系統不保存交易所密碼、API 金鑰、助記詞或私鑰。</p>
        </section>

        <section className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">投資持倉總覽</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">所有持倉已換算為帳本基準幣別 {ledgerCurrency}。</p>
            </div>
            <Badge>{visibleAssets.length} 筆持倉</Badge>
          </div>
          {visibleAssets.length === 0 ? (
            <EmptyState label={`尚未建立${config.label}持倉`} />
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {valuations.map(({ asset, valuation }) => (
                <article key={asset.id} className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-subtle dark:border-slate-800 dark:bg-slate-950/70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${asset.assetType === "forex" ? "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200"}`}>
                        {asset.assetType === "forex" ? <ArrowRightLeft size={18} /> : asset.assetType === "crypto" ? <Bitcoin size={18} /> : <TrendingUp size={18} />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{asset.symbol} · {asset.name}</p>
                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{asset.platform || "未填寫持有平台"} · {asset.quantity.toLocaleString("zh-TW", { maximumFractionDigits: 10 })} 單位</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button className="rounded-md p-2 text-slate-400 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950" type="button" title="編輯持倉" onClick={() => beginEditAsset(asset)}><Pencil size={16} /></button>
                      <button className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950" type="button" title="刪除持倉" onClick={() => void onDeleteAsset(asset)}><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">目前價值</p>
                      <p className="mt-1 font-semibold text-slate-950 dark:text-slate-50">{formatMoney(valuation.currentValueCents, ledgerCurrency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">未實現損益</p>
                      <p className={`mt-1 font-semibold ${valuation.profitLossCents >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>{formatMoney(valuation.profitLossCents, ledgerCurrency)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>現價 {formatCurrencyAmount(asset.currentUnitPrice, asset.quoteCurrency)}</span>
                    <span className={valuation.profitLossCents >= 0 ? "font-semibold text-emerald-600 dark:text-emerald-300" : "font-semibold text-rose-600 dark:text-rose-300"}>{formatPercent(valuation.returnRate)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <section className="panel">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} />
            <h2 className="text-lg font-semibold">新增投資分類</h2>
          </div>
          <form className="mt-4 space-y-3" onSubmit={handleFormSubmit(addCategory)}>
            <Field label="分類名稱"><input className="input" name="name" placeholder="例如：台股高股息 ETF" required /></Field>
            <Field label="投資類型">
              <select className="input" name="kind" defaultValue={config.defaultKind}>
                {config.kinds.map((value) => <option key={value} value={value}>{investmentKindLabels[value]}</option>)}
              </select>
            </Field>
            <Field label="市場">
              <select className="input" name="market" defaultValue={config.defaultMarket}>
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
              <h2 className="text-lg font-semibold">{config.label}配置</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">目前配置 {fundAllocation > 0 ? `${fundAllocation.toFixed(0)}%` : `${totalAllocation.toFixed(0)}%`}，高風險配置 {highRiskAllocation.toFixed(0)}%。</p>
            </div>
            <Badge>{totalAllocation > 100 ? "配置超過 100%" : "配置可用"}</Badge>
          </div>
          {visibleCategories.length === 0 ? (
            <EmptyState label={`尚未建立${config.label}分類`} />
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {visibleCategories.map((category) => (
                <div key={category.id} className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-subtle dark:border-slate-800 dark:bg-slate-950/70">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{category.name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {investmentKindLabels[category.kind]} · {investmentMarketLabels[category.market]} · {investmentRiskLabels[category.risk]}
                      </p>
                    </div>
                    <button className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950" onClick={() => deleteCategory(category)} title="刪除投資分類" aria-label="刪除投資分類">
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
    principalCents: 0,
    annualRate: 0,
    termMonths: 12,
    method: "equal_payment",
    extraMonthlyPaymentCents: 0,
    oneTimePrepaymentCents: 0,
    oneTimePrepaymentMonth: 1
  });
  const [depositInput, setDepositInput] = useState<DepositCalculationInput>({
    principalCents: 0,
    annualRate: 0,
    months: 12,
    interestType: "compound",
    monthlyContributionCents: 0,
    taxRate: 0
  });
  const [totalAssetsCents, setTotalAssetsCents] = useState(0);
  const [totalLiabilitiesCents, setTotalLiabilitiesCents] = useState(0);
  const [availableCashCents, setAvailableCashCents] = useState(0);
  const [necessaryExpenseCents, setNecessaryExpenseCents] = useState(0);
  const [investmentPrincipalCents, setInvestmentPrincipalCents] = useState(0);
  const [monthlyInvestmentCents, setMonthlyInvestmentCents] = useState(0);
  const [investmentAnnualRate, setInvestmentAnnualRate] = useState(0);
  const [investmentYears, setInvestmentYears] = useState(1);

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
  onAdd,
  onDelete,
  notify
}: {
  budgets: Budget[];
  transactions: Transaction[];
  month: string;
  onAdd: (budget: Budget) => Promise<void>;
  onDelete: (budget: Budget) => Promise<void>;
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
        ratio: spent / Math.max(budgetCents, 1),
        budget: currentBudgets.find((budget) => budget.category === category)
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
    void onAdd({
      id: crypto.randomUUID(),
      userId: localUserId,
      month,
      totalBudgetCents: amount,
      category: String(formData.get("category") || "全部"),
      budgetCents: amount,
      thresholds: [0.5, 0.8, 1],
      createdAt: now,
      updatedAt: now
    });
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
        <FormDisclosure title="新增每月預算" description="以分類建立月度額度，預算地圖會同步顯示使用進度。">
          <form className="space-y-3" onSubmit={handleFormSubmit(addBudget)}>
            <Field label="分類">
              <input className="input" name="category" list="budget-categories" defaultValue="餐飲" />
              <datalist id="budget-categories">
                {budgetCategoryOptions.map((category) => <option key={category} value={category} />)}
              </datalist>
            </Field>
            <Field label="預算金額"><input className="input" name="amount" inputMode="decimal" required /></Field>
            <button className="btn-primary w-full" type="submit"><Plus size={16} />新增預算</button>
          </form>
        </FormDisclosure>
        <section className="grid gap-3 md:grid-cols-2">
          {budgetPlanRows.map((row) => (
            <div key={row.category} className="panel">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{row.category}</p>
                <div className="flex items-center gap-2"><Badge>{row.budgetCents > 0 ? "已設定" : "待規劃"}</Badge>{row.budget && <button className="btn-danger h-8 w-8 px-0" onClick={() => void onDelete(row.budget!)} title="刪除預算" aria-label={`刪除 ${row.category} 預算`}><Trash2 size={15} /></button>}</div>
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
  onAdd,
  onDelete,
  notify
}: {
  reminders: FinancialReminder[];
  accounts: FinancialAccount[];
  onAdd: (reminder: FinancialReminder) => Promise<void>;
  onDelete: (reminder: FinancialReminder) => Promise<void>;
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
    const debitDay = Number(formData.get("debitDay"));
    const remindDaysBefore = Number(formData.get("remindDaysBefore"));
    const validation = combineValidations(
      validatePositiveAmount(amount),
      validateDateRange(String(formData.get("startDate"))),
      validateIntegerRange(debitDay, 1, 31, "扣款日"),
      validateIntegerRange(remindDaysBefore, 0, 365, "提醒天數")
    );
    if (!validation.valid) return notify("error", validation.errors[0]);
    const now = new Date().toISOString();
    void onAdd({
      id: crypto.randomUUID(),
      userId: localUserId,
      name: String(formData.get("name")),
      amountCents: amount,
      frequency: String(formData.get("frequency")) as FinancialReminder["frequency"],
      debitDay,
      accountId: String(formData.get("accountId") ?? ""),
      remindDaysBefore,
      autoCreateTransaction: formData.get("autoCreate") === "on",
      isNecessary: formData.get("necessary") === "on",
      startDate: String(formData.get("startDate")),
      status: "pending",
      createdAt: now,
      updatedAt: now
    });
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
        <FormDisclosure title="新增固定帳單" description="設定扣款日與提醒時間，通知中心會自動整理待辦。">
        <form className="space-y-3" onSubmit={handleFormSubmit(addReminder)}>
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
      </FormDisclosure>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {reminders.map((reminder) => (
          <div key={reminder.id} className="panel">
            <div className="flex items-start justify-between gap-3"><p className="font-semibold">{reminder.name}</p><div className="flex items-center gap-2"><Badge>{reminder.status}</Badge><button className="btn-danger h-8 w-8 px-0" onClick={() => void onDelete(reminder)} title="刪除提醒" aria-label={`刪除 ${reminder.name}`}><Trash2 size={15} /></button></div></div>
            <p className="mt-2 text-2xl font-bold">{formatMoney(reminder.amountCents)}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{reminder.frequency} · 每月 {reminder.debitDay} 日 · 提前 {reminder.remindDaysBefore} 天提醒</p>
        </div>
      ))}
        </section>
      </div>
    </div>
  );
}

function ReportsPage({
  month,
  period,
  transactions,
  loans,
  creditCards,
  creditCardInstallments,
  monthlyTrend,
  categoryBreakdown,
  accounts,
  dashboard,
  currency
}: {
  month: string;
  period: DatePeriod;
  transactions: Transaction[];
  loans: Loan[];
  creditCards: CreditCard[];
  creditCardInstallments: CreditCardInstallment[];
  monthlyTrend: { month: string; incomeCents: number; expenseCents: number }[];
  categoryBreakdown: { category: string; amountCents: number }[];
  accounts: FinancialAccount[];
  dashboard: ReturnType<typeof summarizeDashboard>;
  currency: CurrencyCode;
}) {
  const periodCopy = getDashboardPeriodCopy(period);
  const reportInput = {
    month,
    currency,
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
          { label: periodCopy.balanceLabel, value: formatMoney(dashboard.monthlyBalanceCents), accent: "border-sky-300" },
          { label: "支出分類", value: `${categoryBreakdown.length} 類`, accent: "border-emerald-300" },
          { label: "資料範圍", value: period.label, accent: "border-violet-300" }
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
          <p className="text-sm text-slate-500 dark:text-slate-400">查詢採期間資料，不一次載入全部年份。</p>
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
        <section className="panel min-w-0 lg:col-span-8"><h3 className="font-semibold">月收支與現金流趨勢</h3><TrendChart data={monthlyTrend} /></section>
        <section className="panel lg:col-span-4"><h3 className="font-semibold">總資產與總負債比例</h3><LedgerDonut dashboard={dashboard} /></section>
        <section className="panel min-w-0 lg:col-span-7">
          <h3 className="font-semibold">儲蓄率趨勢</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">比較各月收入扣除支出後的保留比例</p>
          <SavingsRateTrendChart data={monthlyTrend} />
        </section>
        <section className="panel lg:col-span-5">
          <h3 className="font-semibold">必要與彈性支出</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">判讀支出結構與短期調整空間</p>
          <ExpenseNatureChart transactions={transactions} />
        </section>
        <section className="panel lg:col-span-7"><h3 className="font-semibold">全部帳戶總帳分布</h3><AccountBalanceChart accounts={accounts} /></section>
        <section className="panel lg:col-span-5"><h3 className="font-semibold">支出分類報表</h3><CategoryBars data={categoryBreakdown} /></section>
        <section className="panel lg:col-span-4"><h3 className="font-semibold">帳戶類型資產</h3><AccountTypeChart accounts={accounts} /></section>
        <section className="panel lg:col-span-4"><h3 className="font-semibold">可動用與暫不可動用資金</h3><CashAvailabilityChart accounts={accounts} /></section>
        <section className="panel lg:col-span-4"><h3 className="font-semibold">信用卡使用報表</h3>{creditCards.map((card, index) => {
          const summary = summarizeCreditCardLimit(card, creditCardInstallments);
          return <Progress key={card.id} label={card.name} value={summary.utilizationRate} helper={`${formatMoney(summary.usedCreditCents)} / ${formatMoney(summary.creditLimitCents)}`} colorClass={index % 2 === 0 ? "bg-sky-600" : "bg-violet-600"} />;
        })}</section>
        <section className="panel lg:col-span-5"><h3 className="font-semibold">貸款餘額報表</h3><div className="mt-4 space-y-4">{loans.length === 0 ? <EmptyState label="尚無貸款資料" /> : loans.map((loan, index) => {
          const progress = summarizeLoanProgress(loan);
          return <Progress key={loan.id} label={loan.name} value={progress.remainingPrincipalCents / Math.max(loan.originalPrincipalCents, 1)} helper={formatMoney(progress.remainingPrincipalCents)} colorClass={index % 2 === 0 ? "bg-rose-600" : "bg-amber-500"} />;
        })}</div></section>
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
            <p className="text-sm text-slate-500 dark:text-slate-400">只傳送彙總資料，不傳完整交易明細。頁面載入不會自動呼叫 AI。</p>
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

function AdminUsersPage({ currentUserId, notify }: { currentUserId: string; notify: (type: ToastType, message: string) => void }) {
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageNumber, setPageNumber] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [capabilities, setCapabilities] = useState({ accountActions: false, auditLogs: false, ledgerCounts: false });
  const notifyRef = useRef(notify);
  const pageSize = 20;
  notifyRef.current = notify;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setLoadError("");
        try {
          const result = await listAdminUsers({ search, role: roleFilter, status: statusFilter, page: pageNumber, pageSize });
          if (cancelled) return;
          setUsers(result.users);
          setAuditLogs(result.auditLogs);
          setTotal(result.total);
          setCapabilities(result.capabilities);
        } catch (error) {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : "使用者清單讀取失敗";
            setLoadError(message);
            notifyRef.current("error", message);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, search ? 280 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pageNumber, refreshKey, roleFilter, search, statusFilter]);

  async function runAction(action: Parameters<typeof manageAdminUser>[0], successMessage?: string) {
    setActionId(`${action.action}-${action.targetUserId}`);
    try {
      const result = await manageAdminUser(action);
      notify("success", successMessage ?? result.message);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "使用者操作失敗");
    } finally {
      setActionId(null);
    }
  }

  const activeCount = users.filter((user) => user.isActive).length;
  const adminCount = users.filter((user) => user.role === "admin" || user.isSuperAdmin).length;
  const suspendedCount = users.filter((user) => !user.isActive).length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const actionDisabled = actionId !== null || !capabilities.accountActions;

  return (
    <div className="space-y-4">
      <section className="finance-today-hero overflow-hidden rounded-lg border border-emerald-100 p-4 shadow-subtle dark:border-emerald-900 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-100"><Users size={14} />最高管理員專區</span>
            <h2 className="mt-3 text-2xl font-bold text-slate-950 dark:text-slate-50">使用者管理</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">管理帳號角色、啟用狀態、重設密碼信與帳號刪除。每項異動都會保留管理紀錄。</p>
          </div>
          <button className="btn-secondary bg-white/80 dark:bg-slate-900" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} title="重新讀取使用者清單">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />重新整理
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="符合條件帳號" value={`${total} 位`} />
        <StatCard label="本頁管理員" value={`${adminCount} 位`} />
        <StatCard label="本頁已封鎖" value={`${suspendedCount} 位`} />
      </section>

      <section className="panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">帳號清單</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">本頁啟用帳號 {activeCount} 位。搜尋會延後片刻執行，避免重複讀取。</p>
          </div>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">第 {pageNumber} / {totalPages} 頁</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_150px]">
          <input className="input mt-0" value={search} onChange={(event) => { setSearch(event.target.value); setPageNumber(1); }} placeholder="搜尋名稱、Email 或會員編號" />
          <select className="input mt-0" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPageNumber(1); }} aria-label="帳號角色篩選">
            <option value="all">全部角色</option>
            <option value="user">一般使用者</option>
            <option value="admin">管理員</option>
            <option value="super_admin">最高管理員</option>
          </select>
          <select className="input mt-0" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPageNumber(1); }} aria-label="帳號狀態篩選">
            <option value="all">全部狀態</option>
            <option value="active">啟用</option>
            <option value="suspended">已停用</option>
          </select>
        </div>

        {loadError && <div className="mt-4"><InlineNotice tone="warning" message={loadError} /></div>}
        {!loading && !loadError && !capabilities.accountActions && <div className="mt-4"><InlineNotice tone="neutral" message="帳號資料已顯示；封鎖、角色調整與刪除會在雲端資料設定完成後開放。" /></div>}

        {loading ? (
          <div className="mt-5"><InlineNotice tone="neutral" message="正在讀取使用者資料..." /></div>
        ) : loadError ? (
          <div className="mt-5"><EmptyState label="目前無法讀取帳號清單，請重新整理後再試。" /></div>
        ) : users.length === 0 ? (
          <div className="mt-5"><EmptyState label="找不到符合條件的使用者" /></div>
        ) : (
          <>
            <div className="mt-5 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[940px] text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400"><th className="pb-3 font-medium">使用者</th><th className="pb-3 font-medium">帳本</th><th className="pb-3 font-medium">角色</th><th className="pb-3 font-medium">狀態</th><th className="pb-3 font-medium">註冊日期</th><th className="pb-3 font-medium text-right">操作</th></tr></thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.userId} className="border-b border-slate-100 align-top dark:border-slate-800">
                      <td className="py-4 pr-3"><AdminUserIdentity user={user} /></td>
                      <td className="py-4 pr-3 font-semibold text-slate-700 dark:text-slate-200">{capabilities.ledgerCounts ? `${user.ledgerCount} 本` : "-"}</td>
                      <td className="py-4 pr-3"><AdminRoleControl user={user} disabled={user.userId === currentUserId || user.isSuperAdmin || actionDisabled} onChange={(role) => void runAction({ action: "role", targetUserId: user.userId, role })} /></td>
                      <td className="py-4 pr-3"><AdminStatus user={user} /></td>
                      <td className="py-4 pr-3 text-slate-500 dark:text-slate-400">{formatAdminDate(user.createdAt)}</td>
                      <td className="py-4 text-right"><AdminUserActions user={user} disabled={user.userId === currentUserId || user.isSuperAdmin || actionDisabled} pending={actionId?.endsWith(user.userId) ?? false} onAction={runAction} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 space-y-3 md:hidden">
              {users.map((user) => (
                <article key={user.userId} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-3"><AdminUserIdentity user={user} /><AdminStatus user={user} /></div>
                  <div className="mt-3 grid grid-cols-2 gap-2"><Info label="帳本" value={capabilities.ledgerCounts ? `${user.ledgerCount} 本` : "-"} /><Info label="註冊日期" value={formatAdminDate(user.createdAt)} /></div>
                  <div className="mt-3"><AdminRoleControl user={user} disabled={user.userId === currentUserId || user.isSuperAdmin || actionDisabled} onChange={(role) => void runAction({ action: "role", targetUserId: user.userId, role })} /></div>
                  <div className="mt-3"><AdminUserActions user={user} disabled={user.userId === currentUserId || user.isSuperAdmin || actionDisabled} pending={actionId?.endsWith(user.userId) ?? false} onAction={runAction} /></div>
                </article>
              ))}
            </div>
          </>
        )}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <button className="btn-secondary" disabled={loading || pageNumber <= 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>上一頁</button>
          <span className="text-sm text-slate-500 dark:text-slate-400">共 {total} 位使用者</span>
          <button className="btn-secondary" disabled={loading || pageNumber >= totalPages} onClick={() => setPageNumber((value) => Math.min(totalPages, value + 1))}>下一頁</button>
        </div>
      </section>

      <section className="panel">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">近期管理紀錄</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">保留最近的帳號管理操作，方便追查異動。</p></div><ShieldCheck className="text-brand-700 dark:text-brand-100" size={22} /></div>
        <div className="mt-4 space-y-2">
          {!capabilities.auditLogs ? <EmptyState label="管理紀錄會在雲端資料設定完成後顯示" /> : auditLogs.length === 0 ? <EmptyState label="目前尚無管理紀錄" /> : auditLogs.map((log) => <AdminAuditRow key={log.id} log={log} />)}
        </div>
      </section>
    </div>
  );
}

function AdminUserIdentity({ user }: { user: AdminManagedUser }) {
  return <div className="min-w-0"><p className="truncate font-semibold text-slate-950 dark:text-slate-50">{user.displayName || user.email}</p><p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p><p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{user.memberCode || "尚未建立會員編號"}</p>{user.adminNote && <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">備註：{user.adminNote}</p>}</div>;
}

function AdminRoleControl({ user, disabled, onChange }: { user: AdminManagedUser; disabled: boolean; onChange: (role: "user" | "admin") => void }) {
  if (user.isSuperAdmin) return <Badge>最高管理員</Badge>;
  return <select className="input mt-0 min-w-32" value={user.role} disabled={disabled} onChange={(event) => { const role = event.target.value as "user" | "admin"; if (role !== user.role && window.confirm(`確定將 ${user.email} 設為${role === "admin" ? "管理員" : "一般使用者"}？`)) onChange(role); }} aria-label={`${user.email} 的角色`}><option value="user">一般使用者</option><option value="admin">管理員</option></select>;
}

function AdminStatus({ user }: { user: AdminManagedUser }) {
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${user.isActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-100"}`}>{user.isActive ? "啟用" : "已封鎖"}</span>;
}

function AdminUserActions({ user, disabled, pending, onAction }: { user: AdminManagedUser; disabled: boolean; pending: boolean; onAction: (action: Parameters<typeof manageAdminUser>[0], successMessage?: string) => Promise<void> }) {
  const locked = disabled || pending;
  return <div className="flex flex-wrap justify-end gap-2">
    <button className="btn-secondary h-9 px-2" title="管理備註" aria-label="管理備註" disabled={locked} onClick={() => { const note = window.prompt(`設定 ${user.email} 的管理備註`, user.adminNote || ""); if (note !== null && note !== (user.adminNote || "")) void onAction({ action: "note", targetUserId: user.userId, note }, "管理備註已更新"); }}><Pencil size={16} /></button>
    <button className="btn-secondary h-9 px-2" title="寄送重設密碼信" aria-label="寄送重設密碼信" disabled={locked} onClick={() => { if (window.confirm(`確定寄送重設密碼信給 ${user.email}？`)) void onAction({ action: "recovery", targetUserId: user.userId }); }}><KeyRound size={16} /></button>
    <button className="btn-secondary h-9 px-2" title={user.isActive ? "封鎖帳號" : "解除封鎖"} aria-label={user.isActive ? "封鎖帳號" : "解除封鎖"} disabled={locked} onClick={() => { const label = user.isActive ? "封鎖" : "解除封鎖"; if (window.confirm(`確定${label} ${user.email} 的帳號？`)) void onAction({ action: "status", targetUserId: user.userId, isActive: !user.isActive }, `帳號已${label}`); }}>{user.isActive ? <UserX size={16} /> : <UserCheck size={16} />}</button>
    <button className="btn-danger h-9 px-2" title="刪除帳號" aria-label="刪除帳號" disabled={locked} onClick={() => { if (window.confirm(`確定永久刪除 ${user.email}？帳號與資料無法復原。`)) void onAction({ action: "delete", targetUserId: user.userId }); }}><Trash2 size={16} /></button>
  </div>;
}

function AdminAuditRow({ log }: { log: AdminAuditLog }) {
  const labels: Record<AdminAuditLog["action"], string> = { role_updated: "已更新帳號角色", status_updated: "已更新帳號狀態", recovery_sent: "已寄送重設密碼信", account_deleted: "已刪除帳號", note_updated: "已更新管理備註" };
  const email = typeof log.metadata.email === "string" ? log.metadata.email : "指定使用者";
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900"><div><p className="font-semibold text-slate-800 dark:text-slate-100">{labels[log.action]}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{email}</p></div><span className="text-xs text-slate-500 dark:text-slate-400">{formatAdminDate(log.createdAt)}</span></div>;
}

function formatAdminDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function WebPushSettingsCard({ sessionEmail, notify }: { sessionEmail: string | null; notify: (type: ToastType, message: string) => void }) {
  const [state, setState] = useState<WebPushState | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionEmail));
  const [pending, setPending] = useState<"enable" | "disable" | "test" | "install" | null>(null);
  const [installAvailable, setInstallAvailable] = useState(isPwaInstallAvailable);

  useEffect(() => {
    const updateInstallState = () => setInstallAvailable(isPwaInstallAvailable());
    window.addEventListener("ez2save-install-ready", updateInstallState);
    return () => window.removeEventListener("ez2save-install-ready", updateInstallState);
  }, []);

  useEffect(() => {
    let active = true;
    if (!sessionEmail) {
      setLoading(false);
      setState(null);
      return () => { active = false; };
    }
    setLoading(true);
    void getWebPushState().then((nextState) => {
      if (active) setState(nextState);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [sessionEmail]);

  const runAction = async (action: "enable" | "disable" | "test" | "install") => {
    setPending(action);
    try {
      if (action === "enable") {
        setState(await enableWebPush());
        notify("success", "這台裝置已開啟手機通知");
      } else if (action === "disable") {
        setState(await disableWebPush());
        notify("success", "這台裝置已關閉手機通知");
      } else if (action === "test") {
        await sendTestWebPush();
        notify("success", "測試通知已送出");
      } else {
        const installed = await installPwa();
        setInstallAvailable(isPwaInstallAvailable());
        if (installed) notify("success", "Ez2SaveMore 已加入裝置");
      }
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "手機通知設定失敗");
    } finally {
      setPending(null);
    }
  };

  const statusLabel = loading
    ? "正在確認"
    : !sessionEmail
      ? "請先登入"
      : !state?.supported
        ? "此瀏覽器不支援"
        : state.subscribed
          ? "這台裝置已開啟"
          : "尚未開啟";
  const statusTone = state?.subscribed
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
    : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300";

  return (
    <section className="panel lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="icon-button mt-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"><Smartphone size={18} /></span>
          <div><h2 className="text-lg font-semibold">手機通知與安裝</h2><p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">離開網頁後仍可收到到期提醒，通知內容不會顯示金額或金融機構。</p></div>
        </div>
        <span className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${statusTone}`}>{statusLabel}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Info label="這台裝置" value={state?.subscribed ? "通知已開啟" : "通知未開啟"} />
        <Info label="已連接裝置" value={`${state?.devices.length ?? 0} 台`} />
        <Info label="提醒方式" value="依各帳本設定" />
      </div>
      {state?.requiresHomeScreen && <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-3 text-sm leading-6 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">在 iPhone 的 Safari 點選分享，再選「加入主畫面」。從主畫面開啟 Ez2SaveMore 後即可啟用通知。</div>}
      {state?.permission === "denied" && <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">此裝置已封鎖通知，請到瀏覽器或手機設定重新允許。</div>}
      {sessionEmail && state?.supported && !state.backendReady && !loading && <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">手機通知服務尚待完成雲端設定，其他理財功能不受影響。</div>}
      <div className="mt-4 flex flex-wrap gap-2">
        {!state?.subscribed && <button className="btn-primary" type="button" onClick={() => void runAction("enable")} disabled={!sessionEmail || loading || pending !== null || !state?.supported || state.requiresHomeScreen}><Bell size={16} />{pending === "enable" ? "開啟中" : "開啟手機通知"}</button>}
        {state?.subscribed && <button className="btn-secondary" type="button" onClick={() => void runAction("test")} disabled={pending !== null || !state.backendReady}><Send size={16} />{pending === "test" ? "傳送中" : "傳送測試通知"}</button>}
        {state?.subscribed && <button className="btn-secondary" type="button" onClick={() => void runAction("disable")} disabled={pending !== null}><Bell size={16} />{pending === "disable" ? "關閉中" : "關閉這台裝置"}</button>}
        {installAvailable && !state?.isStandalone && <button className="btn-secondary" type="button" onClick={() => void runAction("install")} disabled={pending !== null}><Download size={16} />{pending === "install" ? "安裝中" : "安裝到裝置"}</button>}
      </div>
    </section>
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
  onSignOut,
  onSaveProfile,
  onChangePassword,
  notificationPreferences,
  onSaveNotificationPreferences,
  notify
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
  onSaveProfile: (displayName: string) => Promise<void>;
  onChangePassword: (password: string, confirmation: string) => Promise<void>;
  notificationPreferences: NotificationPreference[];
  onSaveNotificationPreferences: (preferences: NotificationPreference[]) => Promise<void>;
  notify: (type: ToastType, message: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel">
        <h2 className="text-lg font-semibold">個人帳號</h2>
        <div className="mt-4 grid gap-3 text-sm">
          <Info label="登入 Email" value={sessionEmail ?? "尚未登入"} />
          <Info label="帳號角色" value={profile ? getRoleLabel(profile) : "一般使用者"} />
        </div>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleFormSubmit((formData) => void onSaveProfile(String(formData.get("displayName") ?? "")))}>
          <Field label="暱稱"><input className="input mt-0" name="displayName" defaultValue={profile?.displayName ?? ""} required maxLength={80} /></Field>
          <button className="btn-primary shrink-0 self-end" type="submit" disabled={!sessionEmail}>儲存暱稱</button>
        </form>
      </section>
      <section className="panel">
        <h2 className="text-lg font-semibold">資料連線</h2>
        <div className={`mt-4 flex items-center justify-between gap-3 rounded-md border px-3 py-3 text-sm ${supabaseCheck?.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"}`}>
          <span className="inline-flex items-center gap-2 font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${supabaseCheck?.ok ? "bg-emerald-500" : "bg-rose-500"} ${supabaseChecking ? "animate-pulse" : ""}`} />{supabaseChecking ? "連線檢查中" : supabaseCheck?.ok ? "雲端資料已連線" : "雲端資料未連線"}</span>
          <button className="btn-secondary h-9 px-2" onClick={onCheckSupabase} disabled={supabaseChecking} title="重新檢查連線"><RefreshCw size={16} /></button>
        </div>
        {!sessionEmail && <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleFormSubmit((formData) => void onSendSignInLink(String(formData.get("email") ?? "")))}><input className="input mt-0" name="email" type="email" placeholder="輸入 Email" required disabled={!isSupabaseConfigured} /><button className="btn-primary shrink-0" type="submit" disabled={!isSupabaseConfigured}>寄送登入連結</button></form>}
        {dataNotice && !sessionEmail && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{dataNotice}</p>}
      </section>
      <section className="panel">
        <h2 className="text-lg font-semibold">變更密碼</h2>
        <form className="mt-4 grid gap-3" onSubmit={handleFormSubmit((formData) => void onChangePassword(String(formData.get("password") ?? ""), String(formData.get("confirmation") ?? "")))}>
          <Field label="新密碼"><input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
          <Field label="再次輸入新密碼"><input className="input" name="confirmation" type="password" autoComplete="new-password" minLength={10} required /></Field>
          <p className="text-xs text-slate-500 dark:text-slate-400">至少 10 碼，包含英文字母與數字。</p>
          <button className="btn-primary justify-self-start" type="submit" disabled={!sessionEmail}>更新密碼</button>
        </form>
      </section>
      <section className="panel flex flex-col justify-between gap-4">
        <div><h2 className="text-lg font-semibold">登入工作階段</h2><p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">目前裝置上的登入狀態與個人資料會分開管理。</p></div>
        <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={onRefresh}>重新讀取資料</button><button className="btn-danger" onClick={() => void onSignOut()} disabled={!sessionEmail}>登出</button></div>
      </section>
      <WebPushSettingsCard sessionEmail={sessionEmail} notify={notify} />
      <section className="lg:col-span-2">
        <NotificationSettingsPage preferences={notificationPreferences} onSave={onSaveNotificationPreferences} notify={notify} compact />
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

function FormDisclosure({
  title,
  description,
  children,
  defaultOpen = false
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="panel group" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div>
          <h2 className="section-heading">{title}</h2>
          <p className="helper-text">{description}</p>
        </div>
        <span className="icon-button" aria-hidden="true">
          <Plus size={16} />
        </span>
      </summary>
      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">{children}</div>
    </details>
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
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
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
  return <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{children}</span>;
}

function getRoleLabel(profile: UserProfile) {
  if (profile.isSuperAdmin || profile.role === "super_admin") return "最高管理員";
  if (profile.role === "admin") return "管理員";
  return "一般使用者";
}

function formatMemberCode(userId: string) {
  return `M${userId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/70 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
      <div>
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          <FileText size={18} />
        </div>
        {label}
      </div>
    </div>
  );
}
