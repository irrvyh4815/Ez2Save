import type {
  CreditCard,
  CreditCardInstallment,
  DashboardSummary,
  Deposit,
  DepositInterestType,
  FinancialPlanRiskProfile,
  FinancialAccount,
  InvestmentAsset,
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

export type LoanTrackingMode = "amortized" | "prepaid_interest" | "manual";

export interface LoanProgressInput {
  originalPrincipalCents: number;
  remainingPrincipalCents: number;
  annualRate: number;
  termMonths: number;
  paidPeriods: number;
  paymentPerPeriodCents: number;
  paidAmountCents: number;
  trackingMode: LoanTrackingMode;
  prepaidInterestCents?: number;
  autoCalculate?: boolean;
}

export interface LoanProgressSummary {
  trackingMode: LoanTrackingMode;
  principalPaidCents: number;
  remainingPrincipalCents: number;
  installmentPaidCents: number;
  prepaidInterestCents: number;
  totalCashPaidCents: number;
  progress: number;
}

export interface CreditCardLimitSummary {
  creditLimitCents: number;
  currentStatementCents: number;
  unbilledCents: number;
  installmentDebtCents: number;
  installmentOccupancyCents: number;
  paidInstallmentCents: number;
  usedCreditCents: number;
  availableCreditCents: number;
  overLimitCents: number;
  utilizationRate: number;
  activeInstallmentCount: number;
  statementInstallmentCents: number;
  singlePurchaseInstallmentCents: number;
}

export interface InstallmentOpeningBalanceInput {
  totalAmountCents: number;
  periods: number;
  paidPeriods: number;
  monthlyPaymentCents?: number;
  paidAmountCents?: number;
  remainingAmountCents?: number;
}

export interface InstallmentOpeningBalanceSummary {
  monthlyPaymentCents: number;
  paidAmountCents: number;
  remainingAmountCents: number;
  progress: number;
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

export interface FinancialPlanCalculationInput {
  targetAmountCents: number;
  currentAmountCents: number;
  monthlyContributionCents: number;
  expectedAnnualReturn: number;
  monthsToTarget: number;
}

export interface FinancialPlanProjectionRow {
  month: number;
  balanceCents: number;
}

export interface FinancialPlanCalculationResult {
  targetAmountCents: number;
  currentAmountCents: number;
  gapCents: number;
  requiredMonthlyContributionCents: number;
  projectedAmountCents: number;
  projectedShortfallCents: number;
  monthsToGoal: number | null;
  progress: number;
  schedule: FinancialPlanProjectionRow[];
}

export interface FinancialPlanAllocation {
  cash: number;
  fixedIncome: number;
  diversifiedEquity: number;
  label: string;
}

export interface CashFlowForecastStream {
  amountCents: number;
  frequency: "one_time" | "weekly" | "monthly" | "quarterly" | "yearly";
  startDate: string;
  endDate?: string;
  annualGrowthRate?: number;
}

export interface FutureCashFlowInput {
  startMonth: string;
  months: number;
  openingBalanceCents: number;
  incomes: CashFlowForecastStream[];
  fixedExpenses: CashFlowForecastStream[];
  debtPayments: CashFlowForecastStream[];
  goalContributions: CashFlowForecastStream[];
}

export interface FutureCashFlowRow {
  month: string;
  incomeCents: number;
  fixedExpenseCents: number;
  debtPaymentCents: number;
  goalContributionCents: number;
  totalOutflowCents: number;
  availableForGoalsCents: number;
  netCashFlowCents: number;
  projectedBalanceCents: number;
}

export interface FutureCashFlowResult {
  rows: FutureCashFlowRow[];
  totalIncomeCents: number;
  totalOutflowCents: number;
  totalGoalContributionCents: number;
  endingBalanceCents: number;
  lowestBalanceCents: number;
  fundingGapCents: number;
  sustainableGoalContributionCents: number;
}

export interface InvestmentAssetValuation {
  costCents: number;
  currentValueCents: number;
  profitLossCents: number;
  returnRate: number;
}

const cents = (value: number) => Math.round(value);
const safeDivide = (numerator: number, denominator: number) => (denominator === 0 ? 0 : numerator / denominator);

export function calculateInstallmentOpeningBalance(input: InstallmentOpeningBalanceInput): InstallmentOpeningBalanceSummary {
  const totalAmountCents = Math.max(0, cents(input.totalAmountCents));
  const periods = Math.max(1, Math.round(input.periods));
  const paidPeriods = Math.min(periods, Math.max(0, Math.round(input.paidPeriods)));
  const monthlyPaymentCents = Math.max(0, cents(input.monthlyPaymentCents ?? 0)) || Math.ceil(totalAmountCents / periods);
  const hasRemaining = input.remainingAmountCents !== undefined && Number.isFinite(input.remainingAmountCents);
  const hasPaid = input.paidAmountCents !== undefined && Number.isFinite(input.paidAmountCents);

  let remainingAmountCents: number;
  let paidAmountCents: number;
  if (hasRemaining && hasPaid) {
    remainingAmountCents = Math.min(totalAmountCents, Math.max(0, cents(input.remainingAmountCents ?? 0)));
    paidAmountCents = Math.max(0, cents(input.paidAmountCents ?? 0));
  } else if (hasRemaining) {
    remainingAmountCents = Math.min(totalAmountCents, Math.max(0, cents(input.remainingAmountCents ?? 0)));
    paidAmountCents = Math.max(0, totalAmountCents - remainingAmountCents);
  } else if (hasPaid) {
    paidAmountCents = Math.min(totalAmountCents, Math.max(0, cents(input.paidAmountCents ?? 0)));
    remainingAmountCents = Math.max(0, totalAmountCents - paidAmountCents);
  } else {
    paidAmountCents = Math.min(totalAmountCents, monthlyPaymentCents * paidPeriods);
    remainingAmountCents = Math.max(0, totalAmountCents - paidAmountCents);
  }

  return {
    monthlyPaymentCents,
    paidAmountCents,
    remainingAmountCents,
    progress: safeDivide(totalAmountCents - remainingAmountCents, totalAmountCents)
  };
}

export function calculateInvestmentAssetValuation(asset: Pick<InvestmentAsset, "quantity" | "averageUnitCost" | "currentUnitPrice" | "exchangeRateToLedger">): InvestmentAssetValuation {
  const quantity = Math.max(0, Number.isFinite(asset.quantity) ? asset.quantity : 0);
  const averageUnitCost = Math.max(0, Number.isFinite(asset.averageUnitCost) ? asset.averageUnitCost : 0);
  const currentUnitPrice = Math.max(0, Number.isFinite(asset.currentUnitPrice) ? asset.currentUnitPrice : 0);
  const exchangeRate = Math.max(0, Number.isFinite(asset.exchangeRateToLedger) ? asset.exchangeRateToLedger : 0);
  const costCents = cents(quantity * averageUnitCost * exchangeRate * 100);
  const currentValueCents = cents(quantity * currentUnitPrice * exchangeRate * 100);
  const profitLossCents = currentValueCents - costCents;
  return {
    costCents,
    currentValueCents,
    profitLossCents,
    returnRate: safeDivide(profitLossCents, costCents)
  };
}

export function summarizeCreditCardLimit(card: CreditCard, installments: CreditCardInstallment[]): CreditCardLimitSummary {
  const activeInstallments = installments.filter((installment) => installment.creditCardId === card.id && installment.status === "active");
  const hasItemizedInstallments = activeInstallments.length > 0;
  const installmentDebtCents = hasItemizedInstallments
    ? activeInstallments.reduce((sum, installment) => sum + Math.max(0, installment.remainingAmountCents), 0)
    : Math.max(0, card.installmentBalanceCents);
  const installmentOccupancyCents = hasItemizedInstallments
    ? activeInstallments
        .filter((installment) => !installment.includedInCardBalance)
        .reduce((sum, installment) => sum + Math.max(0, installment.remainingAmountCents), 0)
    : Math.max(0, card.installmentBalanceCents);
  const currentStatementCents = Math.max(0, card.currentStatementAmountCents);
  const unbilledCents = Math.max(0, card.unbilledAmountCents);
  const usedCreditCents = currentStatementCents + unbilledCents + installmentOccupancyCents;
  const creditLimitCents = Math.max(0, card.creditLimitCents);
  return {
    creditLimitCents,
    currentStatementCents,
    unbilledCents,
    installmentDebtCents,
    installmentOccupancyCents,
    paidInstallmentCents: activeInstallments.reduce((sum, installment) => sum + Math.max(0, installment.paidAmountCents), 0),
    usedCreditCents,
    availableCreditCents: Math.max(0, creditLimitCents - usedCreditCents),
    overLimitCents: Math.max(0, usedCreditCents - creditLimitCents),
    utilizationRate: safeDivide(usedCreditCents, creditLimitCents),
    activeInstallmentCount: activeInstallments.length,
    statementInstallmentCents: activeInstallments
      .filter((installment) => installment.installmentType === "statement")
      .reduce((sum, installment) => sum + Math.max(0, installment.remainingAmountCents), 0),
    singlePurchaseInstallmentCents: activeInstallments
      .filter((installment) => installment.installmentType === "single_purchase")
      .reduce((sum, installment) => sum + Math.max(0, installment.remainingAmountCents), 0)
  };
}

export function summarizeCreditCardLimits(cards: CreditCard[], installments: CreditCardInstallment[]): CreditCardLimitSummary {
  const summary = cards
    .filter((card) => card.isActive)
    .map((card) => summarizeCreditCardLimit(card, installments))
    .reduce<CreditCardLimitSummary>((summary, card) => ({
      creditLimitCents: summary.creditLimitCents + card.creditLimitCents,
      currentStatementCents: summary.currentStatementCents + card.currentStatementCents,
      unbilledCents: summary.unbilledCents + card.unbilledCents,
      installmentDebtCents: summary.installmentDebtCents + card.installmentDebtCents,
      installmentOccupancyCents: summary.installmentOccupancyCents + card.installmentOccupancyCents,
      paidInstallmentCents: summary.paidInstallmentCents + card.paidInstallmentCents,
      usedCreditCents: summary.usedCreditCents + card.usedCreditCents,
      availableCreditCents: summary.availableCreditCents + card.availableCreditCents,
      overLimitCents: summary.overLimitCents + card.overLimitCents,
      utilizationRate: 0,
      activeInstallmentCount: summary.activeInstallmentCount + card.activeInstallmentCount,
      statementInstallmentCents: summary.statementInstallmentCents + card.statementInstallmentCents,
      singlePurchaseInstallmentCents: summary.singlePurchaseInstallmentCents + card.singlePurchaseInstallmentCents
    }), {
      creditLimitCents: 0,
      currentStatementCents: 0,
      unbilledCents: 0,
      installmentDebtCents: 0,
      installmentOccupancyCents: 0,
      paidInstallmentCents: 0,
      usedCreditCents: 0,
      availableCreditCents: 0,
      overLimitCents: 0,
      utilizationRate: 0,
      activeInstallmentCount: 0,
      statementInstallmentCents: 0,
      singlePurchaseInstallmentCents: 0
    });
  return {
    ...summary,
    utilizationRate: safeDivide(summary.usedCreditCents, summary.creditLimitCents)
  };
}

export function calculateFutureCashFlow(input: FutureCashFlowInput): FutureCashFlowResult {
  const months = Math.max(1, Math.min(120, Math.round(input.months)));
  let projectedBalanceCents = cents(input.openingBalanceCents);
  let lowestBalanceCents = projectedBalanceCents;
  let fundingGapCents = 0;
  const rows = Array.from({ length: months }, (_, index) => {
    const month = addMonthsToMonthKey(input.startMonth, index);
    const incomeCents = sumForecastStreams(input.incomes, month);
    const fixedExpenseCents = sumForecastStreams(input.fixedExpenses, month);
    const debtPaymentCents = sumForecastStreams(input.debtPayments, month);
    const goalContributionCents = sumForecastStreams(input.goalContributions, month);
    const totalOutflowCents = fixedExpenseCents + debtPaymentCents + goalContributionCents;
    const availableForGoalsCents = Math.max(0, incomeCents - fixedExpenseCents - debtPaymentCents);
    const netCashFlowCents = incomeCents - totalOutflowCents;
    projectedBalanceCents += netCashFlowCents;
    lowestBalanceCents = Math.min(lowestBalanceCents, projectedBalanceCents);
    fundingGapCents += Math.max(0, goalContributionCents - availableForGoalsCents);
    return {
      month,
      incomeCents,
      fixedExpenseCents,
      debtPaymentCents,
      goalContributionCents,
      totalOutflowCents,
      availableForGoalsCents,
      netCashFlowCents,
      projectedBalanceCents
    };
  });
  const totalIncomeCents = rows.reduce((sum, row) => sum + row.incomeCents, 0);
  const totalOutflowCents = rows.reduce((sum, row) => sum + row.totalOutflowCents, 0);
  const totalGoalContributionCents = rows.reduce((sum, row) => sum + row.goalContributionCents, 0);
  const sustainableGoalContributionCents = rows.length === 0
    ? 0
    : Math.max(0, Math.min(...rows.map((row) => row.availableForGoalsCents)));
  return {
    rows,
    totalIncomeCents,
    totalOutflowCents,
    totalGoalContributionCents,
    endingBalanceCents: projectedBalanceCents,
    lowestBalanceCents,
    fundingGapCents,
    sustainableGoalContributionCents
  };
}

function sumForecastStreams(streams: CashFlowForecastStream[], month: string): number {
  return streams.reduce((sum, stream) => {
    const startMonth = stream.startDate.slice(0, 7);
    const endMonth = stream.endDate?.slice(0, 7);
    if (month < startMonth || (endMonth && month > endMonth)) return sum;
    if (stream.frequency === "one_time" && month !== startMonth) return sum;
    const elapsedYears = Math.max(0, Math.floor(monthDistance(startMonth, month) / 12));
    const growthFactor = (1 + Math.max(-0.99, stream.annualGrowthRate ?? 0)) ** elapsedYears;
    return sum + cents(monthlyEquivalent(stream.amountCents, stream.frequency) * growthFactor);
  }, 0);
}

function monthlyEquivalent(amountCents: number, frequency: CashFlowForecastStream["frequency"]): number {
  const amount = Math.max(0, cents(amountCents));
  if (frequency === "weekly") return amount * 52 / 12;
  if (frequency === "quarterly") return amount / 3;
  if (frequency === "yearly") return amount / 12;
  return amount;
}

function addMonthsToMonthKey(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthDistance(startMonth: string, endMonth: string): number {
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
  return (endYear - startYear) * 12 + endMonthNumber - startMonthNumber;
}

export function calculateFinancialPlan(input: FinancialPlanCalculationInput): FinancialPlanCalculationResult {
  const targetAmountCents = Math.max(0, cents(input.targetAmountCents));
  const currentAmountCents = Math.max(0, cents(input.currentAmountCents));
  const monthlyContributionCents = Math.max(0, cents(input.monthlyContributionCents));
  const monthsToTarget = Math.max(1, Math.min(1200, Math.round(input.monthsToTarget)));
  const annualRate = Math.max(0, Math.min(input.expectedAnnualReturn, 1));
  const monthlyRate = annualRate / 12;
  const gapCents = Math.max(0, targetAmountCents - currentAmountCents);
  const factor = monthlyRate === 0 ? 1 : (1 + monthlyRate) ** monthsToTarget;
  const annuityFactor = monthlyRate === 0
    ? monthsToTarget
    : (factor - 1) / monthlyRate;
  const requiredMonthlyContributionCents = gapCents === 0
    ? 0
    : Math.max(0, cents((targetAmountCents - currentAmountCents * factor) / Math.max(annuityFactor, 1)));

  const schedule: FinancialPlanProjectionRow[] = [];
  let balanceCents = currentAmountCents;
  for (let month = 1; month <= monthsToTarget; month += 1) {
    balanceCents = cents(balanceCents * (1 + monthlyRate) + monthlyContributionCents);
    schedule.push({ month, balanceCents });
  }

  let monthsToGoal: number | null = currentAmountCents >= targetAmountCents ? 0 : null;
  if (monthsToGoal === null && monthlyContributionCents > 0) {
    let projectedBalanceCents = currentAmountCents;
    for (let month = 1; month <= 1200; month += 1) {
      projectedBalanceCents = cents(projectedBalanceCents * (1 + monthlyRate) + monthlyContributionCents);
      if (projectedBalanceCents >= targetAmountCents) {
        monthsToGoal = month;
        break;
      }
    }
  }

  const projectedAmountCents = schedule.at(-1)?.balanceCents ?? currentAmountCents;
  return {
    targetAmountCents,
    currentAmountCents,
    gapCents,
    requiredMonthlyContributionCents,
    projectedAmountCents,
    projectedShortfallCents: Math.max(0, targetAmountCents - projectedAmountCents),
    monthsToGoal,
    progress: targetAmountCents > 0 ? Math.min(1, currentAmountCents / targetAmountCents) : 0,
    schedule
  };
}

export function getFinancialPlanAllocation(profile: FinancialPlanRiskProfile): FinancialPlanAllocation {
  if (profile === "conservative") {
    return { cash: 60, fixedIncome: 30, diversifiedEquity: 10, label: "保守配置" };
  }
  if (profile === "growth") {
    return { cash: 10, fixedIncome: 20, diversifiedEquity: 70, label: "成長配置" };
  }
  return { cash: 20, fixedIncome: 40, diversifiedEquity: 40, label: "平衡配置" };
}

export function calculateEqualPayment(principalCents: number, annualRate: number, termMonths: number): number {
  if (principalCents <= 0 || termMonths <= 0) return 0;
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return cents(principalCents / termMonths);
  const factor = (monthlyRate * (1 + monthlyRate) ** termMonths) / ((1 + monthlyRate) ** termMonths - 1);
  return cents(principalCents * factor);
}

export function inferAnnualRateFromPayment(principalCents: number, paymentCents: number, termMonths: number): number | null {
  if (!Number.isFinite(principalCents) || !Number.isFinite(paymentCents) || !Number.isFinite(termMonths)) return null;
  if (principalCents <= 0 || paymentCents <= 0 || termMonths <= 0) return null;

  const normalizedPrincipal = cents(principalCents);
  const normalizedPayment = cents(paymentCents);
  const normalizedTerm = Math.round(termMonths);
  const zeroRatePayment = calculateEqualPayment(normalizedPrincipal, 0, normalizedTerm);
  if (normalizedPayment < zeroRatePayment) return null;
  if (normalizedPayment === zeroRatePayment) return 0;

  let low = 0;
  let high = 1;
  if (calculateEqualPayment(normalizedPrincipal, high, normalizedTerm) < normalizedPayment) return null;

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const candidate = (low + high) / 2;
    const candidatePayment = calculateEqualPayment(normalizedPrincipal, candidate, normalizedTerm);
    if (candidatePayment < normalizedPayment) {
      low = candidate;
    } else {
      high = candidate;
    }
  }
  return (low + high) / 2;
}

export function inferLoanTrackingMode(loan: Pick<Loan, "originalPrincipalCents" | "annualRate" | "termMonths" | "paymentPerPeriodCents" | "metadata">): LoanTrackingMode {
  const storedMode = loan.metadata?.loan_tracking_mode;
  if (storedMode === "amortized" || storedMode === "prepaid_interest" || storedMode === "manual") return storedMode;

  const scheduledPrincipalCents = Math.max(0, cents(loan.paymentPerPeriodCents)) * Math.max(0, Math.round(loan.termMonths));
  const toleranceCents = Math.max(100, cents(loan.originalPrincipalCents * 0.005));
  if (
    loan.annualRate > 0
    && loan.originalPrincipalCents > 0
    && scheduledPrincipalCents > 0
    && Math.abs(scheduledPrincipalCents - loan.originalPrincipalCents) <= toleranceCents
  ) {
    return "prepaid_interest";
  }
  return "amortized";
}

export function calculateLoanProgress(input: LoanProgressInput): LoanProgressSummary {
  const originalPrincipalCents = Math.max(0, cents(input.originalPrincipalCents));
  const storedRemainingPrincipalCents = Math.min(originalPrincipalCents, Math.max(0, cents(input.remainingPrincipalCents)));
  const termMonths = Math.max(0, Math.round(input.termMonths));
  const paidPeriods = Math.min(termMonths, Math.max(0, Math.round(input.paidPeriods)));
  const paymentPerPeriodCents = Math.max(0, cents(input.paymentPerPeriodCents));
  const prepaidInterestCents = input.trackingMode === "prepaid_interest"
    ? Math.max(0, cents(input.prepaidInterestCents ?? 0))
    : 0;
  const autoCalculate = input.autoCalculate !== false && input.trackingMode !== "manual";

  if (!autoCalculate) {
    const principalPaidCents = Math.max(0, originalPrincipalCents - storedRemainingPrincipalCents);
    const totalCashPaidCents = Math.max(0, cents(input.paidAmountCents));
    return {
      trackingMode: input.trackingMode,
      principalPaidCents,
      remainingPrincipalCents: storedRemainingPrincipalCents,
      installmentPaidCents: Math.max(0, totalCashPaidCents - prepaidInterestCents),
      prepaidInterestCents,
      totalCashPaidCents,
      progress: safeDivide(principalPaidCents, originalPrincipalCents)
    };
  }

  if (input.trackingMode === "prepaid_interest") {
    const installmentPaidCents = paymentPerPeriodCents * paidPeriods;
    const principalPaidCents = Math.min(originalPrincipalCents, installmentPaidCents);
    return {
      trackingMode: input.trackingMode,
      principalPaidCents,
      remainingPrincipalCents: Math.max(0, originalPrincipalCents - principalPaidCents),
      installmentPaidCents,
      prepaidInterestCents,
      totalCashPaidCents: installmentPaidCents + prepaidInterestCents,
      progress: safeDivide(principalPaidCents, originalPrincipalCents)
    };
  }

  const monthlyRate = Math.max(0, input.annualRate) / 12;
  const effectivePaymentCents = paymentPerPeriodCents > 0
    ? paymentPerPeriodCents
    : calculateEqualPayment(originalPrincipalCents, Math.max(0, input.annualRate), termMonths);
  let remainingPrincipalCents = originalPrincipalCents;
  let installmentPaidCents = 0;
  for (let period = 0; period < paidPeriods && remainingPrincipalCents > 0; period += 1) {
    const interestCents = cents(remainingPrincipalCents * monthlyRate);
    const principalCents = Math.min(remainingPrincipalCents, Math.max(0, effectivePaymentCents - interestCents));
    if (principalCents <= 0) break;
    installmentPaidCents += principalCents + interestCents;
    remainingPrincipalCents -= principalCents;
  }
  const principalPaidCents = Math.max(0, originalPrincipalCents - remainingPrincipalCents);
  return {
    trackingMode: input.trackingMode,
    principalPaidCents,
    remainingPrincipalCents,
    installmentPaidCents,
    prepaidInterestCents: 0,
    totalCashPaidCents: installmentPaidCents,
    progress: safeDivide(principalPaidCents, originalPrincipalCents)
  };
}

export function summarizeLoanProgress(loan: Loan): LoanProgressSummary {
  const trackingMode = inferLoanTrackingMode(loan);
  const prepaidInterest = loan.metadata?.prepaid_interest_cents;
  const autoCalculate = loan.metadata?.auto_calculate_progress;
  return calculateLoanProgress({
    originalPrincipalCents: loan.originalPrincipalCents,
    remainingPrincipalCents: loan.remainingPrincipalCents,
    annualRate: loan.annualRate,
    termMonths: loan.termMonths,
    paidPeriods: loan.paidPeriods,
    paymentPerPeriodCents: loan.paymentPerPeriodCents,
    paidAmountCents: loan.paidAmountCents,
    trackingMode,
    prepaidInterestCents: typeof prepaidInterest === "number" ? prepaidInterest : 0,
    autoCalculate: typeof autoCalculate === "boolean" ? autoCalculate : true
  });
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

export function calculateSavingsRate(incomeCents: number, expenseCents: number): number {
  return incomeCents > 0 ? safeDivide(incomeCents - expenseCents, incomeCents) : 0;
}

export function calculateDebtServiceRatio(monthlyDebtPaymentCents: number, monthlyIncomeCents: number): number {
  return monthlyIncomeCents > 0 ? safeDivide(Math.max(0, monthlyDebtPaymentCents), monthlyIncomeCents) : 0;
}

export function summarizeExpenseNature(transactions: Transaction[]): {
  necessaryCents: number;
  flexibleCents: number;
  recurringCents: number;
  totalCents: number;
} {
  const expenses = transactions.filter(
    (transaction) => transaction.type === "expense" || transaction.type === "credit_card_purchase"
  );
  const totalCents = expenses.reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const necessaryCents = expenses
    .filter((transaction) => transaction.isNecessary)
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const recurringCents = expenses
    .filter((transaction) => transaction.isRecurring)
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);

  return {
    necessaryCents,
    flexibleCents: Math.max(0, totalCents - necessaryCents),
    recurringCents,
    totalCents
  };
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
  creditCardInstallments?: CreditCardInstallment[];
  loans: Loan[];
  deposits?: Deposit[];
  investmentAssets?: InvestmentAsset[];
  transactions: Transaction[];
  month: string;
  dateRange?: { startDate: string; endDate: string };
  averageNecessaryExpenseCents: number;
}): DashboardSummary {
  const activeAccounts = args.accounts.filter((account) => account.isActive);
  const activeDeposits = (args.deposits ?? []).filter((deposit) => deposit.isActive);
  const activeInvestmentAssets = (args.investmentAssets ?? []).filter((asset) => asset.isActive);
  const activeAccountIds = new Set(activeAccounts.map((account) => account.id));
  const standaloneDeposits = activeDeposits.filter(
    (deposit) => !deposit.accountId || !activeAccountIds.has(deposit.accountId)
  );
  const accountAssetsCents = activeAccounts.reduce((sum, account) => sum + Math.max(0, account.balanceCents), 0);
  const depositAssetsCents = standaloneDeposits.reduce((sum, deposit) => sum + Math.max(0, deposit.principalCents), 0);
  const investmentAssetsCents = activeInvestmentAssets.reduce(
    (sum, asset) => sum + Math.max(0, calculateInvestmentAssetValuation(asset).currentValueCents),
    0
  );
  const totalAssetsCents = accountAssetsCents + depositAssetsCents + investmentAssetsCents;
  const availableCashCents = activeAccounts
    .filter((account) => account.includeInAvailableCash)
    .reduce((sum, account) => sum + Math.max(0, account.balanceCents), 0)
    + standaloneDeposits
      .filter((deposit) => deposit.includeInAvailableCash)
      .reduce((sum, deposit) => sum + Math.max(0, deposit.principalCents), 0);
  const timeDepositAccountTotalCents = activeAccounts
    .filter((account) => account.type === "time_deposit")
    .reduce((sum, account) => sum + Math.max(0, account.balanceCents), 0);
  const timeDepositTotalCents = timeDepositAccountTotalCents + depositAssetsCents;
  const activeCreditCards = args.creditCards.filter((card) => card.isActive);
  const monthlyCreditCardDueCents = activeCreditCards.reduce((sum, card) => sum + card.currentStatementAmountCents, 0);
  const monthlyLoanDueCents = args.loans
    .filter((loan) => loan.status === "active")
    .reduce((sum, loan) => sum + loan.paymentPerPeriodCents, 0);
  const loanLiabilities = args.loans.reduce((sum, loan) => sum + summarizeLoanProgress(loan).remainingPrincipalCents, 0);
  const cardLiabilities = summarizeCreditCardLimits(activeCreditCards, args.creditCardInstallments ?? []).usedCreditCents;
  const totalLiabilitiesCents = loanLiabilities + cardLiabilities;
  const monthlyTransactions = args.dateRange
    ? args.transactions.filter((transaction) => transaction.date >= args.dateRange!.startDate && transaction.date <= args.dateRange!.endDate)
    : args.transactions.filter((transaction) => transaction.date.startsWith(args.month));
  const monthlyIncomeCents = monthlyTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const monthlyExpenseCents = monthlyTransactions
    .filter((transaction) => transaction.type === "expense" || transaction.type === "credit_card_purchase")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);

  return {
    totalAssetsCents,
    accountAssetsCents,
    depositAssetsCents,
    investmentAssetsCents,
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
