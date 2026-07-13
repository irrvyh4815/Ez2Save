import type {
  Budget,
  CreditCard,
  Deposit,
  FinancialAccount,
  FinancialReminder,
  Loan,
  Transaction
} from "../types/finance";

const base = {
  userId: "demo-user",
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z"
};

export const mockAccounts: FinancialAccount[] = [
  {
    ...base,
    id: "acc-cash",
    name: "日常現金",
    type: "cash",
    institution: "錢包",
    balanceCents: 12_500_00,
    includeInAvailableCash: true,
    includeInEmergencyFund: false,
    note: "日常零用",
    isActive: true
  },
  {
    ...base,
    id: "acc-bank",
    name: "薪轉活存",
    type: "checking",
    institution: "台灣銀行",
    balanceCents: 186_000_00,
    includeInAvailableCash: true,
    includeInEmergencyFund: true,
    isActive: true
  },
  {
    ...base,
    id: "acc-td",
    name: "一年期定存",
    type: "time_deposit",
    institution: "合作金庫",
    balanceCents: 300_000_00,
    includeInAvailableCash: false,
    includeInEmergencyFund: true,
    isActive: true
  }
];

export const mockCreditCards: CreditCard[] = [
  {
    ...base,
    id: "card-main",
    name: "生活回饋卡",
    issuer: "玉山銀行",
    last4: "2688",
    creditLimitCents: 180_000_00,
    statementDay: 20,
    paymentDueDay: 5,
    unbilledAmountCents: 18_600_00,
    currentStatementAmountCents: 24_200_00,
    minimumPaymentCents: 2_420_00,
    installmentBalanceCents: 12_000_00,
    autoPayAccountId: "acc-bank",
    annualFeeCents: 0,
    annualFeeWaiver: "年度消費滿 12 筆",
    isActive: true,
    recommendedUtilizationRate: 0.3
  }
];

export const mockLoans: Loan[] = [
  {
    ...base,
    id: "loan-personal",
    name: "信貸",
    type: "personal",
    institution: "台新銀行",
    originalPrincipalCents: 600_000_00,
    remainingPrincipalCents: 438_000_00,
    annualRate: 0.0275,
    termMonths: 60,
    paidPeriods: 16,
    monthlyPaymentDay: 12,
    startDate: "2025-03-12",
    expectedPayoffDate: "2030-02-12",
    repaymentMethod: "equal_payment",
    paymentPerPeriodCents: 10_720_00,
    prepaymentPenaltyNote: "綁約期內提前清償需洽銀行確認",
    status: "active"
  }
];

export const mockDeposits: Deposit[] = [
  {
    ...base,
    id: "deposit-1y",
    name: "年度定存",
    institution: "合作金庫",
    principalCents: 300_000_00,
    annualRate: 0.016,
    startDate: "2026-02-01",
    maturityDate: "2027-02-01",
    termMonths: 12,
    interestType: "simple",
    interestPayout: "maturity",
    autoRenew: false,
    maturityInstruction: "transfer_out",
    estimatedInterestCents: 4_800_00,
    estimatedMaturityAmountCents: 304_800_00,
    includeInAvailableCash: false,
    isActive: true
  }
];

export const mockTransactions: Transaction[] = [
  tx("tx-salary", "2026-07-05", "income", 86_000_00, "薪資", "acc-bank", false, true),
  tx("tx-rent", "2026-07-01", "expense", 22_000_00, "房租", "acc-bank", true, true),
  tx("tx-food", "2026-07-07", "credit_card_purchase", 4_280_00, "餐飲", "acc-bank", true, false, "card-main"),
  tx("tx-grocery", "2026-07-08", "expense", 2_680_00, "日用品", "acc-bank", true, false),
  tx("tx-entertain", "2026-07-09", "credit_card_purchase", 1_280_00, "娛樂", "acc-bank", false, false, "card-main"),
  tx("tx-transfer", "2026-07-10", "transfer", 20_000_00, "帳戶轉帳", "acc-bank", false, false),
  tx("tx-card-pay", "2026-07-05", "credit_card_payment", 24_200_00, "信用卡繳款", "acc-bank", false, false, "card-main"),
  tx("tx-loan-pay", "2026-07-12", "loan_payment", 10_720_00, "貸款還款", "acc-bank", true, true),
  tx("tx-jun-salary", "2026-06-05", "income", 86_000_00, "薪資", "acc-bank", false, true),
  tx("tx-jun-exp", "2026-06-15", "expense", 61_500_00, "生活", "acc-bank", true, false),
  tx("tx-may-salary", "2026-05-05", "income", 84_000_00, "薪資", "acc-bank", false, true),
  tx("tx-may-exp", "2026-05-15", "expense", 59_200_00, "生活", "acc-bank", true, false),
  tx("tx-apr-salary", "2026-04-05", "income", 84_000_00, "薪資", "acc-bank", false, true),
  tx("tx-apr-exp", "2026-04-15", "expense", 64_800_00, "生活", "acc-bank", true, false),
  tx("tx-mar-salary", "2026-03-05", "income", 82_000_00, "薪資", "acc-bank", false, true),
  tx("tx-mar-exp", "2026-03-15", "expense", 58_700_00, "生活", "acc-bank", true, false),
  tx("tx-feb-salary", "2026-02-05", "income", 82_000_00, "薪資", "acc-bank", false, true),
  tx("tx-feb-exp", "2026-02-15", "expense", 62_300_00, "生活", "acc-bank", true, false)
];

export const mockBudgets: Budget[] = [
  {
    ...base,
    id: "budget-total",
    month: "2026-07",
    totalBudgetCents: 68_000_00,
    category: "全部",
    budgetCents: 68_000_00,
    thresholds: [0.5, 0.8, 1]
  },
  {
    ...base,
    id: "budget-food",
    month: "2026-07",
    totalBudgetCents: 68_000_00,
    category: "餐飲",
    budgetCents: 14_000_00,
    thresholds: [0.5, 0.8, 1]
  }
];

export const mockReminders: FinancialReminder[] = [
  {
    ...base,
    id: "reminder-rent",
    name: "房租",
    amountCents: 22_000_00,
    frequency: "monthly",
    debitDay: 1,
    accountId: "acc-bank",
    remindDaysBefore: 5,
    autoCreateTransaction: true,
    isNecessary: true,
    startDate: "2026-01-01",
    status: "done"
  },
  {
    ...base,
    id: "reminder-phone",
    name: "電信費",
    amountCents: 899_00,
    frequency: "monthly",
    debitDay: 18,
    accountId: "acc-bank",
    remindDaysBefore: 3,
    autoCreateTransaction: false,
    isNecessary: true,
    startDate: "2026-01-18",
    status: "upcoming"
  }
];

function tx(
  id: string,
  date: string,
  type: Transaction["type"],
  amountCents: number,
  category: string,
  accountId: string,
  isNecessary: boolean,
  isRecurring: boolean,
  creditCardId?: string
): Transaction {
  return {
    ...base,
    id,
    date,
    type,
    amountCents,
    category,
    accountId,
    creditCardId,
    isNecessary,
    isRecurring,
    tags: [],
    source: "manual"
  };
}
