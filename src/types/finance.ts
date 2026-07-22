export type CurrencyCode = "TWD";

export type AccountType =
  | "cash"
  | "checking"
  | "digital"
  | "savings"
  | "time_deposit"
  | "e_wallet"
  | "other_asset";

export type TransactionType =
  | "income"
  | "expense"
  | "transfer"
  | "credit_card_purchase"
  | "credit_card_payment"
  | "loan_payment"
  | "deposit_transfer";

export type LoanType =
  | "personal"
  | "mortgage"
  | "auto"
  | "motorcycle"
  | "student"
  | "family"
  | "other";

export type LoanRepaymentMethod =
  | "equal_payment"
  | "equal_principal"
  | "fixed_payment"
  | "manual";

export type DepositInterestType = "simple" | "compound";
export type ReminderStatus = "pending" | "upcoming" | "due_today" | "overdue" | "done";

export interface BaseEntity {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = "user" | "admin" | "super_admin";

export interface UserProfile extends BaseEntity {
  email?: string;
  displayName?: string;
  locale: string;
  currency: CurrencyCode;
  timezone: string;
  role: UserRole;
  isSuperAdmin: boolean;
}

export interface FinancialAccount extends BaseEntity {
  name: string;
  type: AccountType;
  institution?: string;
  balanceCents: number;
  includeInAvailableCash: boolean;
  includeInEmergencyFund: boolean;
  note?: string;
  isActive: boolean;
}

export interface Transaction extends BaseEntity {
  date: string;
  type: TransactionType;
  amountCents: number;
  category: string;
  subcategory?: string;
  accountId?: string;
  transferAccountId?: string;
  creditCardId?: string;
  loanId?: string;
  merchant?: string;
  note?: string;
  isNecessary: boolean;
  isRecurring: boolean;
  tags: string[];
  source: "manual" | "csv" | "recurring" | "system";
}

export interface CreditCard extends BaseEntity {
  name: string;
  issuer: string;
  last4: string;
  creditLimitCents: number;
  statementDay: number;
  paymentDueDay: number;
  unbilledAmountCents: number;
  currentStatementAmountCents: number;
  minimumPaymentCents: number;
  installmentBalanceCents: number;
  autoPayAccountId?: string;
  annualFeeCents: number;
  annualFeeWaiver?: string;
  note?: string;
  isActive: boolean;
  recommendedUtilizationRate: number;
}

export interface CreditCardInstallment extends BaseEntity {
  creditCardId: string;
  transactionId?: string;
  merchant?: string;
  totalAmountCents: number;
  annualRate: number;
  periods: number;
  paidPeriods: number;
  monthlyPaymentCents: number;
  paidAmountCents: number;
  remainingAmountCents: number;
  startedOn: string;
  nextDueDate?: string;
  status: "active" | "paid_off" | "paused";
  note?: string;
}

export interface Loan extends BaseEntity {
  name: string;
  type: LoanType;
  institution?: string;
  originalPrincipalCents: number;
  remainingPrincipalCents: number;
  annualRate: number;
  termMonths: number;
  paidPeriods: number;
  monthlyPaymentDay: number;
  startDate: string;
  expectedPayoffDate?: string;
  repaymentMethod: LoanRepaymentMethod;
  paymentPerPeriodCents: number;
  prepaymentPenaltyNote?: string;
  note?: string;
  status: "active" | "paid_off" | "paused" | "defaulted";
}

export interface Deposit extends BaseEntity {
  name: string;
  institution?: string;
  principalCents: number;
  annualRate: number;
  startDate: string;
  maturityDate: string;
  termMonths: number;
  interestType: DepositInterestType;
  interestPayout: "monthly" | "maturity" | "annually";
  autoRenew: boolean;
  maturityInstruction: "renew_all" | "renew_principal" | "transfer_out";
  estimatedInterestCents: number;
  estimatedMaturityAmountCents: number;
  includeInAvailableCash: boolean;
  note?: string;
  isActive: boolean;
}

export interface Budget extends BaseEntity {
  month: string;
  totalBudgetCents: number;
  category?: string;
  budgetCents: number;
  thresholds: number[];
}

export interface FinancialReminder extends BaseEntity {
  name: string;
  amountCents: number;
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  debitDay: number;
  accountId?: string;
  remindDaysBefore: number;
  autoCreateTransaction: boolean;
  isNecessary: boolean;
  startDate: string;
  endDate?: string;
  status: ReminderStatus;
}

export interface LedgerBook extends BaseEntity {
  ownerUserId: string;
  name: string;
  purpose: "personal" | "family" | "business" | "investment" | "custom";
  color: "emerald" | "sky" | "violet" | "amber" | "rose";
  note?: string;
  isDefault: boolean;
  isShared: boolean;
}

export interface LedgerInvitation extends BaseEntity {
  ledgerId: string;
  inviteeEmail?: string;
  inviteeMemberCode?: string;
  role: "viewer" | "editor" | "admin";
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
}

export interface InsurancePolicy extends BaseEntity {
  name: string;
  type: "life" | "medical" | "accident" | "car" | "home" | "travel" | "investment" | "other";
  insurer: string;
  policyNumberLast4?: string;
  insuredPerson?: string;
  annualPremiumCents: number;
  coverageAmountCents: number;
  paidClaimAmountCents: number;
  pendingClaimAmountCents: number;
  paymentDay: number;
  renewalDate: string;
  beneficiary?: string;
  note?: string;
  status: "active" | "paused" | "expired";
}

export interface InvestmentCategory extends BaseEntity {
  name: string;
  kind: "tw_stock" | "us_stock" | "etf" | "mutual_fund" | "bond_fund" | "money_market" | "other";
  market: "TW" | "US" | "GLOBAL";
  targetAllocation: number;
  risk: "low" | "medium" | "high";
  note?: string;
  isActive: boolean;
}

export type FinancialPlanGoalType =
  | "emergency_fund"
  | "debt_repayment"
  | "major_purchase"
  | "education"
  | "home"
  | "retirement"
  | "investment"
  | "custom";

export type FinancialPlanHorizon = "short" | "medium" | "long";
export type FinancialPlanRiskProfile = "conservative" | "balanced" | "growth";
export type FinancialPlanStatus = "active" | "paused" | "completed";

export interface FinancialPlan extends BaseEntity {
  name: string;
  goalType: FinancialPlanGoalType;
  horizon: FinancialPlanHorizon;
  targetAmountCents: number;
  currentAmountCents: number;
  monthlyContributionCents: number;
  targetDate: string;
  expectedAnnualReturn: number;
  riskProfile: FinancialPlanRiskProfile;
  priority: number;
  note?: string;
  status: FinancialPlanStatus;
}

export interface DashboardSummary {
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  netWorthCents: number;
  monthlyIncomeCents: number;
  monthlyExpenseCents: number;
  monthlyBalanceCents: number;
  monthlyCreditCardDueCents: number;
  monthlyLoanDueCents: number;
  availableCashCents: number;
  timeDepositTotalCents: number;
  emergencyFundMonths: number;
  debtRatio: number;
}

export interface CategoryTotal {
  category: string;
  amountCents: number;
}

export interface MonthlyTrend {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

export interface AiFinancialReport {
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
}
