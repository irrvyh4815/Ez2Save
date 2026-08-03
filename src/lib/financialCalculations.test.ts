import { describe, expect, it } from "vitest";
import {
  calculateDebtRatio,
  calculateDebtServiceRatio,
  calculateDeposit,
  calculateFutureCashFlow,
  calculateEmergencyFundMonths,
  calculateEqualPayment,
  calculateFinancialPlan,
  calculateInvestmentAssetValuation,
  calculateInstallmentOpeningBalance,
  calculateLoan,
  calculateLoanProgress,
  inferAnnualRateFromPayment,
  inferLoanTrackingMode,
  calculateMonthlyBalance,
  calculateNetWorth,
  calculateSavingsRate,
  getCreditCardBillingBucket,
  isIncomeExpenseTransaction,
  summarizeCreditCardLimit,
  summarizeCreditCardLimits,
  summarizeExpenseNature,
  summarizeDashboard
} from "./financialCalculations";
import type { CreditCard, CreditCardInstallment, FinancialAccount, Loan, Transaction } from "../types/finance";

const base = {
  userId: "user-1",
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z"
};

describe("loan calculations", () => {
  it("infers annual rate from principal, term, and equal payment", () => {
    const principalCents = 600_000_00;
    const expectedAnnualRate = 0.0275;
    const paymentCents = calculateEqualPayment(principalCents, expectedAnnualRate, 60);
    const inferredRate = inferAnnualRateFromPayment(principalCents, paymentCents, 60);

    expect(inferredRate).not.toBeNull();
    expect(inferredRate ?? 0).toBeCloseTo(expectedAnnualRate, 4);
  });

  it("returns zero for an interest-free payment and rejects insufficient payments", () => {
    expect(inferAnnualRateFromPayment(120_000_00, 10_000_00, 12)).toBe(0);
    expect(inferAnnualRateFromPayment(120_000_00, 9_999_00, 12)).toBeNull();
  });

  it("tracks prepaid-interest loans by reducing principal with every paid period", () => {
    const progress = calculateLoanProgress({
      originalPrincipalCents: 1_090_000_00,
      remainingPrincipalCents: 1_090_000_00,
      annualRate: 0.0215,
      termMonths: 72,
      paidPeriods: 4,
      paymentPerPeriodCents: 15_139_00,
      paidAmountCents: 0,
      trackingMode: "prepaid_interest",
      prepaidInterestCents: 80_000_00
    });

    expect(progress.principalPaidCents).toBe(60_556_00);
    expect(progress.remainingPrincipalCents).toBe(1_029_444_00);
    expect(progress.installmentPaidCents).toBe(60_556_00);
    expect(progress.totalCashPaidCents).toBe(140_556_00);
    expect(progress.progress).toBeCloseTo(60_556 / 1_090_000, 6);
  });

  it("tracks normal amortized payments as principal plus interest", () => {
    const paymentCents = calculateEqualPayment(600_000_00, 0.0275, 60);
    const progress = calculateLoanProgress({
      originalPrincipalCents: 600_000_00,
      remainingPrincipalCents: 600_000_00,
      annualRate: 0.0275,
      termMonths: 60,
      paidPeriods: 4,
      paymentPerPeriodCents: paymentCents,
      paidAmountCents: 0,
      trackingMode: "amortized"
    });

    expect(progress.principalPaidCents).toBeGreaterThan(37_000_00);
    expect(progress.principalPaidCents).toBeLessThan(paymentCents * 4);
    expect(progress.remainingPrincipalCents).toBe(600_000_00 - progress.principalPaidCents);
    expect(progress.totalCashPaidCents).toBe(paymentCents * 4);
  });

  it("keeps manually managed balances unchanged", () => {
    const progress = calculateLoanProgress({
      originalPrincipalCents: 500_000_00,
      remainingPrincipalCents: 420_000_00,
      annualRate: 0.03,
      termMonths: 48,
      paidPeriods: 8,
      paymentPerPeriodCents: 12_000_00,
      paidAmountCents: 96_000_00,
      trackingMode: "manual"
    });

    expect(progress.principalPaidCents).toBe(80_000_00);
    expect(progress.remainingPrincipalCents).toBe(420_000_00);
    expect(progress.totalCashPaidCents).toBe(96_000_00);
  });

  it("recognizes a principal-only payment schedule with a stated rate", () => {
    const loan = {
      originalPrincipalCents: 1_090_000_00,
      annualRate: 0.0215,
      termMonths: 72,
      paymentPerPeriodCents: 15_139_00,
      metadata: {}
    };

    expect(inferLoanTrackingMode(loan)).toBe("prepaid_interest");
  });

  it("calculates equal payment amortization", () => {
    const payment = calculateEqualPayment(1_000_000_00, 0.02, 12);
    expect(payment).toBeGreaterThan(8_400_000);
    expect(payment).toBeLessThan(8_500_000);

    const result = calculateLoan({
      principalCents: 1_000_000_00,
      annualRate: 0.02,
      termMonths: 12,
      method: "equal_payment"
    });

    expect(result.schedule).toHaveLength(12);
    expect(result.totalInterestCents).toBeGreaterThan(1_000_000);
    expect(result.schedule.at(-1)?.remainingPrincipalCents).toBe(0);
  });

  it("calculates equal principal amortization", () => {
    const result = calculateLoan({
      principalCents: 1_200_000_00,
      annualRate: 0.024,
      termMonths: 12,
      method: "equal_principal"
    });

    expect(result.schedule).toHaveLength(12);
    expect(result.schedule[0].principalCents).toBe(10_000_000);
    expect(result.schedule[0].paymentCents).toBeGreaterThan(result.schedule[11].paymentCents);
  });

  it("reduces interest and payoff months with extra monthly repayment", () => {
    const normal = calculateLoan({
      principalCents: 600_000_00,
      annualRate: 0.03,
      termMonths: 36,
      method: "equal_payment"
    });
    const extra = calculateLoan({
      principalCents: 600_000_00,
      annualRate: 0.03,
      termMonths: 36,
      method: "equal_payment",
      extraMonthlyPaymentCents: 5_000_00
    });

    expect(extra.totalInterestCents).toBeLessThan(normal.totalInterestCents);
    expect(extra.payoffMonths).toBeLessThan(normal.payoffMonths);
    expect(extra.monthsShortened).toBeGreaterThan(0);
  });

  it("calculates one-time early payoff savings", () => {
    const result = calculateLoan({
      principalCents: 800_000_00,
      annualRate: 0.025,
      termMonths: 48,
      method: "equal_payment",
      oneTimePrepaymentCents: 200_000_00,
      oneTimePrepaymentMonth: 6
    });

    expect(result.interestSavedCents).toBeGreaterThan(0);
    expect(result.payoffMonths).toBeLessThan(48);
  });
});

describe("existing installment opening balances", () => {
  it("derives paid and remaining amounts from paid periods", () => {
    const summary = calculateInstallmentOpeningBalance({
      totalAmountCents: 120_000_00,
      periods: 12,
      paidPeriods: 4
    });
    expect(summary.monthlyPaymentCents).toBe(10_000_00);
    expect(summary.paidAmountCents).toBe(40_000_00);
    expect(summary.remainingAmountCents).toBe(80_000_00);
  });

  it("prioritizes the bank remaining balance over the period estimate", () => {
    const summary = calculateInstallmentOpeningBalance({
      totalAmountCents: 120_000_00,
      periods: 12,
      paidPeriods: 4,
      monthlyPaymentCents: 11_000_00,
      remainingAmountCents: 78_500_00
    });
    expect(summary.remainingAmountCents).toBe(78_500_00);
    expect(summary.paidAmountCents).toBe(41_500_00);
    expect(summary.monthlyPaymentCents).toBe(11_000_00);
  });

  it("preserves actual cash paid when interest makes it differ from principal reduction", () => {
    const summary = calculateInstallmentOpeningBalance({
      totalAmountCents: 120_000_00,
      periods: 12,
      paidPeriods: 4,
      paidAmountCents: 44_000_00,
      remainingAmountCents: 80_000_00
    });
    expect(summary.paidAmountCents).toBe(44_000_00);
    expect(summary.remainingAmountCents).toBe(80_000_00);
    expect(summary.progress).toBeCloseTo(1 / 3, 6);
  });
});

describe("credit card limit summaries", () => {
  const card = (id: string, installmentBalanceCents = 0): CreditCard => ({
    ...base,
    id,
    name: id,
    issuer: "銀行",
    last4: "1234",
    creditLimitCents: 100_000_00,
    statementDay: 20,
    paymentDueDay: 5,
    unbilledAmountCents: 5_000_00,
    currentStatementAmountCents: 10_000_00,
    minimumPaymentCents: 1_000_00,
    installmentBalanceCents,
    annualFeeCents: 0,
    isActive: true,
    recommendedUtilizationRate: 0.3
  });
  const installment = (
    id: string,
    creditCardId: string,
    remainingAmountCents: number,
    installmentType: CreditCardInstallment["installmentType"],
    includedInCardBalance: boolean
  ): CreditCardInstallment => ({
    ...base,
    id,
    creditCardId,
    merchant: id,
    installmentType,
    includedInCardBalance,
    totalAmountCents: remainingAmountCents,
    annualRate: 0,
    periods: 12,
    paidPeriods: 0,
    monthlyPaymentCents: Math.round(remainingAmountCents / 12),
    paidAmountCents: 0,
    remainingAmountCents,
    startedOn: "2026-07-01",
    status: "active"
  });

  it("separates billed installment debt from additional limit occupancy", () => {
    const summary = summarizeCreditCardLimit(card("card-1"), [
      installment("statement-plan", "card-1", 20_000_00, "statement", true),
      installment("purchase-plan", "card-1", 30_000_00, "single_purchase", false)
    ]);

    expect(summary.installmentDebtCents).toBe(50_000_00);
    expect(summary.installmentOccupancyCents).toBe(30_000_00);
    expect(summary.usedCreditCents).toBe(45_000_00);
    expect(summary.availableCreditCents).toBe(55_000_00);
    expect(summary.utilizationRate).toBe(0.45);
  });

  it("keeps fallback installment balances for cards without itemized plans", () => {
    const cards = [card("card-1", 20_000_00), card("card-2", 30_000_00)];
    const summary = summarizeCreditCardLimits(cards, [
      installment("purchase-plan", "card-1", 25_000_00, "single_purchase", false)
    ]);

    expect(summary.installmentDebtCents).toBe(55_000_00);
    expect(summary.usedCreditCents).toBe(85_000_00);
    expect(summary.creditLimitCents).toBe(200_000_00);
    expect(summary.utilizationRate).toBe(0.425);
  });
});

describe("future cash flow forecasting", () => {
  it("normalizes recurring income and combines goal funding with obligations", () => {
    const result = calculateFutureCashFlow({
      startMonth: "2026-08",
      months: 3,
      openingBalanceCents: 50_000_00,
      incomes: [
        { amountCents: 60_000_00, frequency: "monthly", startDate: "2026-08-05" },
        { amountCents: 12_000_00, frequency: "quarterly", startDate: "2026-08-01" }
      ],
      fixedExpenses: [{ amountCents: 20_000_00, frequency: "monthly", startDate: "2026-08-01" }],
      debtPayments: [{ amountCents: 10_000_00, frequency: "monthly", startDate: "2026-08-01" }],
      goalContributions: [{ amountCents: 15_000_00, frequency: "monthly", startDate: "2026-08-01" }]
    });

    expect(result.rows[0].incomeCents).toBe(64_000_00);
    expect(result.rows[0].netCashFlowCents).toBe(19_000_00);
    expect(result.endingBalanceCents).toBe(107_000_00);
    expect(result.fundingGapCents).toBe(0);
    expect(result.sustainableGoalContributionCents).toBe(34_000_00);
  });

  it("respects start, end, one-time payments and annual income growth", () => {
    const result = calculateFutureCashFlow({
      startMonth: "2026-08",
      months: 14,
      openingBalanceCents: 0,
      incomes: [{
        amountCents: 50_000_00,
        frequency: "monthly",
        startDate: "2026-09-01",
        endDate: "2027-09-30",
        annualGrowthRate: 0.1
      }],
      fixedExpenses: [{ amountCents: 30_000_00, frequency: "one_time", startDate: "2026-08-01" }],
      debtPayments: [],
      goalContributions: []
    });

    expect(result.rows[0].incomeCents).toBe(0);
    expect(result.rows[0].fixedExpenseCents).toBe(30_000_00);
    expect(result.rows[1].incomeCents).toBe(50_000_00);
    expect(result.rows[13].incomeCents).toBe(55_000_00);
    expect(result.lowestBalanceCents).toBe(-30_000_00);
  });
});

describe("deposit calculations", () => {
  it("calculates simple interest", () => {
    const result = calculateDeposit({
      principalCents: 100_000_00,
      annualRate: 0.012,
      months: 12,
      interestType: "simple"
    });

    expect(result.totalInterestCents).toBe(120_000);
    expect(result.maturityAmountCents).toBe(10_120_000);
  });

  it("calculates compound interest", () => {
    const result = calculateDeposit({
      principalCents: 100_000_00,
      annualRate: 0.012,
      months: 12,
      interestType: "compound"
    });

    expect(result.totalInterestCents).toBeGreaterThan(120_000);
    expect(result.maturityAmountCents).toBeGreaterThan(10_120_000);
  });

  it("calculates recurring contributions", () => {
    const result = calculateDeposit({
      principalCents: 10_000_00,
      annualRate: 0.01,
      months: 12,
      interestType: "compound",
      monthlyContributionCents: 5_000_00
    });

    expect(result.maturityAmountCents).toBeGreaterThan(70_000_00);
    expect(result.schedule).toHaveLength(12);
  });
});

describe("financial plan calculations", () => {
  it("calculates the required monthly amount without an assumed return", () => {
    const result = calculateFinancialPlan({
      targetAmountCents: 120_000_00,
      currentAmountCents: 0,
      monthlyContributionCents: 8_000_00,
      expectedAnnualReturn: 0,
      monthsToTarget: 12
    });

    expect(result.requiredMonthlyContributionCents).toBe(10_000_00);
    expect(result.projectedAmountCents).toBe(96_000_00);
    expect(result.projectedShortfallCents).toBe(24_000_00);
    expect(result.schedule).toHaveLength(12);
  });

  it("reduces required monthly contribution when a positive return is used", () => {
    const withoutReturn = calculateFinancialPlan({
      targetAmountCents: 240_000_00,
      currentAmountCents: 20_000_00,
      monthlyContributionCents: 0,
      expectedAnnualReturn: 0,
      monthsToTarget: 24
    });
    const withReturn = calculateFinancialPlan({
      targetAmountCents: 240_000_00,
      currentAmountCents: 20_000_00,
      monthlyContributionCents: 0,
      expectedAnnualReturn: 0.06,
      monthsToTarget: 24
    });

    expect(withReturn.requiredMonthlyContributionCents).toBeLessThan(withoutReturn.requiredMonthlyContributionCents);
  });

  it("handles a reached target and zero contribution safely", () => {
    const result = calculateFinancialPlan({
      targetAmountCents: 100_000_00,
      currentAmountCents: 120_000_00,
      monthlyContributionCents: 0,
      expectedAnnualReturn: 0,
      monthsToTarget: 12
    });

    expect(result.requiredMonthlyContributionCents).toBe(0);
    expect(result.monthsToGoal).toBe(0);
    expect(result.progress).toBe(1);
    expect(Number.isFinite(result.projectedAmountCents)).toBe(true);
  });
});

describe("summary calculations", () => {
  it("calculates net worth, monthly balance, debt ratio, and emergency fund months safely", () => {
    expect(calculateNetWorth(1_000_00, 400_00)).toBe(600_00);
    expect(calculateMonthlyBalance(80_000_00, 65_000_00)).toBe(15_000_00);
    expect(calculateDebtRatio(50_000_00, 100_000_00)).toBe(0.5);
    expect(calculateDebtRatio(50_000_00, 0)).toBe(0);
    expect(calculateEmergencyFundMonths(300_000_00, 100_000_00)).toBe(3);
    expect(calculateEmergencyFundMonths(300_000_00, 0)).toBe(0);
  });

  it("does not count transfers and credit-card payments as income or expense", () => {
    const transfer = transaction("tx-transfer", "transfer", 10_000_00);
    const cardPayment = transaction("tx-card-payment", "credit_card_payment", 10_000_00);
    const expense = transaction("tx-expense", "expense", 10_000_00);

    expect(isIncomeExpenseTransaction(transfer)).toBe(false);
    expect(isIncomeExpenseTransaction(cardPayment)).toBe(false);
    expect(isIncomeExpenseTransaction(expense)).toBe(true);
  });

  it("summarizes dashboard without NaN or Infinity", () => {
    const accounts: FinancialAccount[] = [
      {
        ...base,
        id: "acc-1",
        name: "活存",
        type: "checking",
        balanceCents: 120_000_00,
        includeInAvailableCash: true,
        includeInEmergencyFund: true,
        isActive: true
      }
    ];
    const cards: CreditCard[] = [
      {
        ...base,
        id: "card-1",
        name: "日常卡",
        issuer: "銀行",
        last4: "1234",
        creditLimitCents: 200_000_00,
        statementDay: 20,
        paymentDueDay: 5,
        unbilledAmountCents: 8_000_00,
        currentStatementAmountCents: 12_000_00,
        minimumPaymentCents: 1_000_00,
        installmentBalanceCents: 0,
        annualFeeCents: 0,
        isActive: true,
        recommendedUtilizationRate: 0.3
      }
    ];
    const loans: Loan[] = [
      {
        ...base,
        id: "loan-1",
        name: "信貸",
        type: "personal",
        originalPrincipalCents: 300_000_00,
        remainingPrincipalCents: 250_000_00,
        annualRate: 0.025,
        termMonths: 60,
        paidPeriods: 10,
        paidAmountCents: 60_000_00,
        monthlyPaymentDay: 10,
        startDate: "2025-09-01",
        repaymentMethod: "equal_payment",
        paymentPerPeriodCents: 6_000_00,
        status: "active"
      }
    ];
    const transactions = [
      transaction("tx-1", "income", 80_000_00),
      transaction("tx-2", "expense", 20_000_00),
      transaction("tx-3", "credit_card_purchase", 5_000_00),
      transaction("tx-4", "transfer", 50_000_00),
      transaction("tx-5", "credit_card_payment", 12_000_00)
    ];

    const summary = summarizeDashboard({
      accounts,
      creditCards: cards,
      loans,
      transactions,
      month: "2026-07",
      averageNecessaryExpenseCents: 40_000_00
    });

    expect(summary.monthlyIncomeCents).toBe(80_000_00);
    expect(summary.monthlyExpenseCents).toBe(25_000_00);
    expect(summary.monthlyBalanceCents).toBe(55_000_00);
    expect(Number.isFinite(summary.debtRatio)).toBe(true);
    expect(summary.emergencyFundMonths).toBe(3);
  });
});

describe("credit card billing", () => {
  it("splits current and next statement by statement day", () => {
    expect(getCreditCardBillingBucket("2026-07-20", 20)).toBe("current");
    expect(getCreditCardBillingBucket("2026-07-21", 20)).toBe("next");
  });
});

describe("financial insight calculations", () => {
  it("calculates savings and debt service ratios safely", () => {
    expect(calculateSavingsRate(100_000_00, 65_000_00)).toBeCloseTo(0.35);
    expect(calculateSavingsRate(0, 20_000_00)).toBe(0);
    expect(calculateDebtServiceRatio(24_000_00, 80_000_00)).toBeCloseTo(0.3);
    expect(calculateDebtServiceRatio(24_000_00, 0)).toBe(0);
  });

  it("separates necessary, flexible, and recurring expenses without counting transfers", () => {
    const necessary = transaction("necessary", "expense", 20_000_00);
    necessary.isNecessary = true;
    necessary.isRecurring = true;
    const flexible = transaction("flexible", "credit_card_purchase", 8_000_00);
    flexible.isNecessary = false;
    const transfer = transaction("transfer", "transfer", 50_000_00);

    expect(summarizeExpenseNature([necessary, flexible, transfer])).toEqual({
      necessaryCents: 20_000_00,
      flexibleCents: 8_000_00,
      recurringCents: 20_000_00,
      totalCents: 28_000_00
    });
  });
});

describe("investment asset valuation", () => {
  it("calculates foreign currency value in the ledger currency", () => {
    const result = calculateInvestmentAssetValuation({
      quantity: 1_000,
      averageUnitCost: 31,
      currentUnitPrice: 32.5,
      exchangeRateToLedger: 1
    });

    expect(result.costCents).toBe(3_100_000);
    expect(result.currentValueCents).toBe(3_250_000);
    expect(result.profitLossCents).toBe(150_000);
    expect(result.returnRate).toBeCloseTo(0.048387, 5);
  });

  it("converts crypto quoted in USD into TWD", () => {
    const result = calculateInvestmentAssetValuation({
      quantity: 0.5,
      averageUnitCost: 50_000,
      currentUnitPrice: 60_000,
      exchangeRateToLedger: 32
    });

    expect(result.costCents).toBe(80_000_000);
    expect(result.currentValueCents).toBe(96_000_000);
    expect(result.returnRate).toBeCloseTo(0.2);
  });
});

function transaction(id: string, type: Transaction["type"], amountCents: number): Transaction {
  return {
    ...base,
    id,
    date: "2026-07-10",
    type,
    amountCents,
    category: type === "income" ? "薪資" : "生活",
    accountId: "acc-1",
    isNecessary: type !== "income",
    isRecurring: false,
    tags: [],
    source: "manual"
  };
}
