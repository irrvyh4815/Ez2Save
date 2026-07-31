import { describe, expect, it } from "vitest";
import {
  calculateDebtRatio,
  calculateDebtServiceRatio,
  calculateDeposit,
  calculateEmergencyFundMonths,
  calculateEqualPayment,
  calculateFinancialPlan,
  calculateInvestmentAssetValuation,
  calculateLoan,
  inferAnnualRateFromPayment,
  calculateMonthlyBalance,
  calculateNetWorth,
  calculateSavingsRate,
  getCreditCardBillingBucket,
  isIncomeExpenseTransaction,
  summarizeExpenseNature,
  summarizeDashboard
} from "./financialCalculations";
import type { CreditCard, FinancialAccount, Loan, Transaction } from "../types/finance";

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
