import { describe, expect, it } from "vitest";
import { calculateLoanPaymentBreakdown, resolveTransactionPayment } from "./transactionPayments";

describe("transaction payment selection", () => {
  it("keeps an account expense as a regular expense", () => {
    expect(resolveTransactionPayment("expense", "account", "account-1", "card-1")).toEqual({
      type: "expense",
      accountId: "account-1"
    });
  });

  it("converts a card-funded expense into a credit card purchase", () => {
    expect(resolveTransactionPayment("expense", "credit_card", "account-1", "card-1")).toEqual({
      type: "credit_card_purchase",
      creditCardId: "card-1"
    });
  });

  it("requires the selected payment source", () => {
    expect(resolveTransactionPayment("expense", "account", "", "").error).toBe("請選擇付款帳戶");
    expect(resolveTransactionPayment("expense", "credit_card", "", "").error).toBe("請選擇付款信用卡");
  });

  it("requires both sides of a credit card payment", () => {
    expect(resolveTransactionPayment("credit_card_payment", "account", "account-1", "card-1")).toEqual({
      type: "credit_card_payment",
      accountId: "account-1",
      creditCardId: "card-1"
    });
  });

  it("requires an account and a loan for loan payments", () => {
    expect(resolveTransactionPayment("loan_payment", "account", "account-1", "", "loan-1")).toEqual({
      type: "loan_payment",
      accountId: "account-1",
      loanId: "loan-1"
    });
    expect(resolveTransactionPayment("loan_payment", "account", "account-1", "", "").error).toBe("請選擇還款貸款");
  });

  it("requires a receiving account and reserve credit for drawdowns", () => {
    expect(resolveTransactionPayment("loan_drawdown", "account", "account-1", "", "reserve-1")).toEqual({
      type: "loan_drawdown",
      accountId: "account-1",
      loanId: "reserve-1"
    });
    expect(resolveTransactionPayment("loan_drawdown", "account", "", "", "reserve-1").error).toBe("請選擇入帳帳戶");
  });

  it("estimates the principal and interest portions", () => {
    expect(calculateLoanPaymentBreakdown(10_000, 1_000_000, 0.024)).toEqual({
      principalCents: 8_000,
      interestCents: 2_000
    });
  });

  it("allows interest-only or prepaid-interest loan payments", () => {
    expect(calculateLoanPaymentBreakdown(10_000, 1_000_000, 0.024, 0)).toEqual({
      principalCents: 0,
      interestCents: 10_000
    });
  });
});
