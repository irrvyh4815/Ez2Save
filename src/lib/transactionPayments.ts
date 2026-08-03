import type { TransactionType } from "../types/finance";

export type ExpensePaymentMethod = "account" | "credit_card";

export interface TransactionPaymentSelection {
  type: TransactionType;
  accountId?: string;
  creditCardId?: string;
  error?: string;
}

export function resolveTransactionPayment(
  requestedType: TransactionType,
  paymentMethod: ExpensePaymentMethod,
  accountId: string,
  creditCardId: string
): TransactionPaymentSelection {
  if (requestedType === "expense") {
    if (paymentMethod === "credit_card") {
      return creditCardId
        ? { type: "credit_card_purchase", creditCardId }
        : { type: "credit_card_purchase", error: "請選擇付款信用卡" };
    }
    return accountId
      ? { type: "expense", accountId }
      : { type: "expense", error: "請選擇付款帳戶" };
  }

  if (requestedType === "credit_card_payment") {
    if (!accountId) return { type: requestedType, error: "請選擇扣款帳戶" };
    if (!creditCardId) return { type: requestedType, accountId, error: "請選擇繳款信用卡" };
    return { type: requestedType, accountId, creditCardId };
  }

  return {
    type: requestedType,
    accountId: accountId || undefined,
    creditCardId: requestedType === "credit_card_purchase" ? creditCardId || undefined : undefined
  };
}
