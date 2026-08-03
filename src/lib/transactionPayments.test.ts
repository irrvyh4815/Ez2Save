import { describe, expect, it } from "vitest";
import { resolveTransactionPayment } from "./transactionPayments";

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
});
