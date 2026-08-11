import type { TransactionType } from "../types/finance";

export type ExpensePaymentMethod = "account" | "credit_card";

export interface TransactionPaymentSelection {
  type: TransactionType;
  accountId?: string;
  creditCardId?: string;
  loanId?: string;
  error?: string;
}

export function resolveTransactionPayment(
  requestedType: TransactionType,
  paymentMethod: ExpensePaymentMethod,
  accountId: string,
  creditCardId: string,
  loanId = ""
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

  if (requestedType === "loan_payment") {
    if (!accountId) return { type: requestedType, error: "請選擇扣款帳戶" };
    if (!loanId) return { type: requestedType, accountId, error: "請選擇還款貸款" };
    return { type: requestedType, accountId, loanId };
  }

  if (requestedType === "loan_drawdown") {
    if (!accountId) return { type: requestedType, error: "請選擇入帳帳戶" };
    if (!loanId) return { type: requestedType, accountId, error: "請選擇備用金" };
    return { type: requestedType, accountId, loanId };
  }

  return {
    type: requestedType,
    accountId: accountId || undefined,
    creditCardId: requestedType === "credit_card_purchase" ? creditCardId || undefined : undefined
  };
}

export interface LoanPaymentBreakdown {
  principalCents: number;
  interestCents: number;
}

export function calculateLoanPaymentBreakdown(
  paymentCents: number,
  remainingPrincipalCents: number,
  annualRate: number,
  explicitPrincipalCents?: number
): LoanPaymentBreakdown {
  if (explicitPrincipalCents !== undefined) {
    const principalCents = Math.min(paymentCents, remainingPrincipalCents, Math.max(0, explicitPrincipalCents));
    return { principalCents, interestCents: Math.max(0, paymentCents - principalCents) };
  }

  const estimatedInterestCents = Math.min(
    paymentCents,
    Math.max(0, Math.round(remainingPrincipalCents * Math.max(0, annualRate) / 12))
  );
  const principalCents = Math.min(remainingPrincipalCents, Math.max(0, paymentCents - estimatedInterestCents));
  return { principalCents, interestCents: Math.max(0, paymentCents - principalCents) };
}
