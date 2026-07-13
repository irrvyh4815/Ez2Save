import type {
  CreditCard,
  DashboardSummary,
  DepositInterestType,
  FinancialAccount,
  Loan,
  LoanRepaymentMethod,
  Transaction
} from "../types/finance";

export interface AmortizationRow {
  period: number;
  paymentCents: number;
  principalCents: number;
  interestCents: number;
  remainingPrincipalCents: number;
}

export interface LoanCalculationInput {
  principalCents: number;
  annualRate: number;
  termMonths: number;
  method: LoanRepaymentMethod;
  fixedPaymentCents?: number;
  extraMonthlyPaymentCents?: number;
  oneTimePrepaymentCents?: number;
  oneTimePrepaymentMonth?: number;
}

export interface LoanCalculationResult {
  monthlyPaymentCents: number;
  totalInterestCents: number;
  totalPaymentCents: number;
  payoffMonths: number;
  interestSavedCents: number;
  monthsShortened: number;
  schedule: AmortizationRow[];
}

export interface DepositProjectionRow {
  month: number;
  principalCents: number;
  interestCents: number;
  balanceCents: number;
}

export interface DepositCalculationInput {
  principalCents: number;
  annualRate: number;
  months: number;
  interestType: DepositInterestType;
  monthlyContributionCents?: number;
  taxRate?: number;
}

export interface DepositCalculationResult {
  totalInterestCents: number;
  maturityAmountCents: number;
  annualizedReturn: number;
  schedule: DepositProjectionRow[];
}

const cents = (value: number) => Math.round(value);
const safeDivide = (numerator: number, denominator: number) => (denominator === 0 ? 0 : numerator / denominator);

export function calculateEqualPayment(principalCents: number, annualRate: number, termMonths: number): number {
  if (principalCents <= 0 || termMonths <= 0) return 0;
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return cents(principalCents / termMonths);
  const factor = (monthlyRate * (1 + monthlyRate) ** termMonths) / ((1 + monthlyRate) ** termMonths - 1);
  return cents(principalCents * factor);
}

export function calculateLoan(input: LoanCalculationInput): LoanCalculationResult {
  const base = amortize({ ...input, extraMonthlyPaymentCents: 0, oneTimePrepaymentCents: 0 });
  const adjusted = amortize(input);
  return {
    monthlyPaymentCents: adjusted.schedule[0]?.paymentCents ?? 0,
    totalInterestCents: adjusted.totalInterestCents,
    totalPaymentCents: adjusted.totalPaymentCents,
    payoffMonths: adjusted.schedule.length,
    interestSavedCents: Math.max(0, base.totalInterestCents - adjusted.totalInterestCents),
    monthsShortened: Math.max(0, base.schedule.length - adjusted.schedule.length),
    schedule: adjusted.schedule
  };
}

function amortize(input: LoanCalculationInput): Pick<LoanCalculationResult, "schedule" | "totalInterestCents" | "totalPaymentCents"> {
  const schedule: AmortizationRow[] = [];
  let remaining = Math.max(0, cents(input.principalCents));
  const monthlyRate = input.annualRate / 12;
  const baseEqualPayment = calculateEqualPayment(remaining, input.annualRate, input.termMonths);
  const basePrincipal = input.termMonths > 0 ? cents(remaining / input.termMonths) : 0;
  const extra = Math.max(0, cents(input.extraMonthlyPaymentCents ?? 0));
  const oneTime = Math.max(0, cents(input.oneTimePrepaymentCents ?? 0));
  const oneTimeMonth = input.oneTimePrepaymentMonth ?? 1;
  const maxPeriods = Math.max(input.termMonths * 2, input.termMonths + 120, 1);

  for (let period = 1; remaining > 0 && period <= maxPeriods; period += 1) {
    const interest = cents(remaining * monthlyRate);
    let scheduledPayment: number;
    let principal: number;

    if (input.method === "equal_principal") {
      principal = Math.min(remaining, basePrincipal);
      scheduledPayment = principal + interest;
    } else if (input.method === "fixed_payment") {
      scheduledPayment = Math.max(input.fixedPaymentCents ?? 0, interest + 1);
      principal = Math.min(remaining, scheduledPayment - interest);
    } else {
      scheduledPayment = baseEqualPayment;
      principal = Math.min(remaining, scheduledPayment - interest);
    }

    const prepayment = period === oneTimeMonth ? oneTime : 0;
    const totalPrincipal = Math.min(remaining, Math.max(0, principal) + extra + prepayment);
    const payment = totalPrincipal + interest;
    remaining = Math.max(0, remaining - totalPrincipal);

    schedule.push({
      period,
      paymentCents: payment,
      principalCents: totalPrincipal,
      interestCents: interest,
      remainingPrincipalCents: remaining
    });
  }

  const totalInterestCents = schedule.reduce((sum, row) => sum + row.interestCents, 0);
  const totalPaymentCents = schedule.reduce((sum, row) => sum + row.paymentCents, 0);
  return { schedule, totalInterestCents, totalPaymentCents };
}

export function calculateDeposit(input: DepositCalculationInput): DepositCalculationResult {
  const monthlyRate = input.annualRate / 12;
  const taxRate = input.taxRate ?? 0;
  const monthlyContribution = Math.max(0, cents(input.monthlyContributionCents ?? 0));
  let balance = Math.max(0, cents(input.principalCents));
  let accruedSimpleInterest = 0;
  const schedule: DepositProjectionRow[] = [];

  for (let month = 1; month <= input.months; month += 1) {
    const contributionBase = balance + (input.interestType === "simple" ? monthlyContribution * (month - 1) : 0);
    const interestBase = input.interestType === "simple" ? input.principalCents : contributionBase;
    const grossInterest = cents(interestBase * monthlyRate);
    const netInterest = cents(grossInterest * (1 - taxRate));

    if (input.interestType === "compound") {
      balance += monthlyContribution + netInterest;
    } else {
      balance += monthlyContribution;
      accruedSimpleInterest += netInterest;
    }

    schedule.push({
      month,
      principalCents: input.principalCents + monthlyContribution * month,
      interestCents: input.interestType === "compound" ? balance - input.principalCents - monthlyContribution * month : accruedSimpleInterest,
      balanceCents: input.interestType === "compound" ? balance : balance + accruedSimpleInterest
    });
  }

  const maturityAmountCents = schedule.at(-1)?.balanceCents ?? input.principalCents;
  const totalContributed = input.principalCents + monthlyContribution * input.months;
  const totalInterestCents = Math.max(0, maturityAmountCents - totalContributed);
  const years = safeDivide(input.months, 12);
  const annualizedReturn = years > 0 && input.principalCents > 0 ? (maturityAmountCents / totalContributed) ** (1 / years) - 1 : 0;
  return { totalInterestCents, maturityAmountCents, annualizedReturn, schedule };
}

export function calculateNetWorth(totalAssetsCents: number, totalLiabilitiesCents: number): number {
  return cents(totalAssetsCents - totalLiabilitiesCents);
}

export function calculateMonthlyBalance(incomeCents: number, expenseCents: number): number {
  return cents(incomeCents - expenseCents);
}

export function calculateDebtRatio(totalLiabilitiesCents: number, totalAssetsCents: number): number {
  return safeDivide(totalLiabilitiesCents, totalAssetsCents);
}

export function calculateEmergencyFundMonths(availableCashCents: number, averageNecessaryExpenseCents: number): number {
  return safeDivide(availableCashCents, averageNecessaryExpenseCents);
}

export function getCreditCardBillingBucket(transactionDate: string, statementDay: number): "current" | "next" {
  const day = Number(transactionDate.slice(8, 10));
  return day <= statementDay ? "current" : "next";
}

export function isIncomeExpenseTransaction(transaction: Transaction): boolean {
  return transaction.type === "income" || transaction.type === "expense" || transaction.type === "credit_card_purchase";
}

export function summarizeDashboard(args: {
  accounts: FinancialAccount[];
  creditCards: CreditCard[];
  loans: Loan[];
  transactions: Transaction[];
  month: string;
  averageNecessaryExpenseCents: number;
}): DashboardSummary {
  const activeAccounts = args.accounts.filter((account) => account.isActive);
  const totalAssetsCents = activeAccounts.reduce((sum, account) => sum + Math.max(0, account.balanceCents), 0);
  const availableCashCents = activeAccounts
    .filter((account) => account.includeInAvailableCash)
    .reduce((sum, account) => sum + Math.max(0, account.balanceCents), 0);
  const timeDepositTotalCents = activeAccounts
    .filter((account) => account.type === "time_deposit")
    .reduce((sum, account) => sum + Math.max(0, account.balanceCents), 0);
  const monthlyCreditCardDueCents = args.creditCards.reduce((sum, card) => sum + card.currentStatementAmountCents, 0);
  const monthlyLoanDueCents = args.loans
    .filter((loan) => loan.status === "active")
    .reduce((sum, loan) => sum + loan.paymentPerPeriodCents, 0);
  const loanLiabilities = args.loans.reduce((sum, loan) => sum + loan.remainingPrincipalCents, 0);
  const cardLiabilities = args.creditCards.reduce((sum, card) => sum + card.unbilledAmountCents + card.currentStatementAmountCents, 0);
  const totalLiabilitiesCents = loanLiabilities + cardLiabilities;
  const monthlyTransactions = args.transactions.filter((transaction) => transaction.date.startsWith(args.month));
  const monthlyIncomeCents = monthlyTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const monthlyExpenseCents = monthlyTransactions
    .filter((transaction) => transaction.type === "expense" || transaction.type === "credit_card_purchase")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);

  return {
    totalAssetsCents,
    totalLiabilitiesCents,
    netWorthCents: calculateNetWorth(totalAssetsCents, totalLiabilitiesCents),
    monthlyIncomeCents,
    monthlyExpenseCents,
    monthlyBalanceCents: calculateMonthlyBalance(monthlyIncomeCents, monthlyExpenseCents),
    monthlyCreditCardDueCents,
    monthlyLoanDueCents,
    availableCashCents,
    timeDepositTotalCents,
    emergencyFundMonths: calculateEmergencyFundMonths(availableCashCents, args.averageNecessaryExpenseCents),
    debtRatio: calculateDebtRatio(totalLiabilitiesCents, totalAssetsCents)
  };
}
