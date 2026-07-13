import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import type {
  AccountType,
  Budget,
  CreditCard,
  Deposit,
  FinancialAccount,
  FinancialReminder,
  Loan,
  Transaction
} from "../types/finance";

export interface FinanceData {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  creditCards: CreditCard[];
  loans: Loan[];
  deposits: Deposit[];
  budgets: Budget[];
  reminders: FinancialReminder[];
  categories: string[];
}

export interface LoadFinanceResult {
  data: FinanceData;
  session: Session | null;
}

export const emptyFinanceData: FinanceData = {
  accounts: [],
  transactions: [],
  creditCards: [],
  loans: [],
  deposits: [],
  budgets: [],
  reminders: [],
  categories: []
};

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("無法讀取登入狀態");
  return data.session;
}

export async function sendSignInLink(email: string): Promise<void> {
  if (!supabase) throw new Error("Supabase 尚未設定");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin
    }
  });
  if (error) throw new Error("登入連結寄送失敗");
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("登出失敗");
}

export async function loadFinanceData(): Promise<LoadFinanceResult> {
  if (!supabase) return { data: emptyFinanceData, session: null };
  const session = await getCurrentSession();
  if (!session) return { data: emptyFinanceData, session: null };
  const userId = session.user.id;

  const [
    accounts,
    transactions,
    creditCards,
    loans,
    deposits,
    budgets,
    reminders,
    categories
  ] = await Promise.all([
    supabase
      .from("financial_accounts")
      .select("id,user_id,name,account_type,institution,balance_cents,include_in_available_cash,include_in_emergency_fund,note,is_active,created_at,updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("transactions")
      .select("id,user_id,transaction_date,transaction_type,amount_cents,category_name,subcategory_name,account_id,transfer_account_id,credit_card_id,loan_id,merchant,note,is_necessary,is_recurring,tags,source,created_at,updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false })
      .limit(500),
    supabase
      .from("credit_cards")
      .select("id,user_id,name,issuer,last4,credit_limit_cents,statement_day,payment_due_day,unbilled_amount_cents,current_statement_amount_cents,minimum_payment_cents,installment_balance_cents,auto_pay_account_id,annual_fee_cents,annual_fee_waiver,note,is_active,recommended_utilization_rate,created_at,updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("loans")
      .select("id,user_id,name,loan_type,institution,original_principal_cents,remaining_principal_cents,annual_rate,term_months,paid_periods,monthly_payment_day,start_date,expected_payoff_date,repayment_method,payment_per_period_cents,prepayment_penalty_note,note,status,created_at,updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("deposits")
      .select("id,user_id,name,institution,principal_cents,annual_rate,start_date,maturity_date,term_months,interest_type,interest_payout,auto_renew,maturity_instruction,estimated_interest_cents,estimated_maturity_amount_cents,include_in_available_cash,note,is_active,created_at,updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("maturity_date", { ascending: true }),
    supabase
      .from("budgets")
      .select("id,user_id,budget_month,total_budget_cents,budget_cents,thresholds,created_at,updated_at,metadata")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("budget_month", { ascending: false }),
    supabase
      .from("financial_reminders")
      .select("id,user_id,name,amount_cents,frequency,debit_day,account_id,remind_days_before,auto_create_transaction,is_necessary,start_date,end_date,status,created_at,updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("debit_day", { ascending: true }),
    supabase
      .from("transaction_categories")
      .select("name")
      .eq("user_id", userId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name", { ascending: true })
  ]);

  const responses = [accounts, transactions, creditCards, loans, deposits, budgets, reminders, categories];
  const failed = responses.find((response) => response.error);
  if (failed?.error) throw new Error("Supabase 資料讀取失敗，請確認 migration 與 RLS 設定");

  return {
    session,
    data: {
      accounts: (accounts.data ?? []).map(mapAccount),
      transactions: (transactions.data ?? []).map(mapTransaction),
      creditCards: (creditCards.data ?? []).map(mapCreditCard),
      loans: (loans.data ?? []).map(mapLoan),
      deposits: (deposits.data ?? []).map(mapDeposit),
      budgets: (budgets.data ?? []).map(mapBudget),
      reminders: (reminders.data ?? []).map(mapReminder),
      categories: [...new Set((categories.data ?? []).map((row) => String(row.name)).filter(Boolean))]
    }
  };
}

export async function createFinancialAccount(account: FinancialAccount): Promise<FinancialAccount> {
  if (!supabase) return account;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再新增帳戶");
  const userId = sessionData.session.user.id;
  const { data, error } = await supabase
    .from("financial_accounts")
    .insert({
      user_id: userId,
      name: account.name,
      account_type: account.type,
      institution: account.institution || null,
      balance_cents: account.balanceCents,
      include_in_available_cash: account.includeInAvailableCash,
      include_in_emergency_fund: account.includeInEmergencyFund,
      note: account.note || null,
      is_active: account.isActive
    })
    .select("id,user_id,name,account_type,institution,balance_cents,include_in_available_cash,include_in_emergency_fund,note,is_active,created_at,updated_at")
    .single();
  if (error) throw new Error("帳戶儲存失敗");
  return mapAccount(data);
}

export async function createTransactionWithCategory(transaction: Transaction): Promise<Transaction> {
  if (!supabase) return transaction;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再新增交易");
  const userId = sessionData.session.user.id;
  const normalizedCategory = normalizeCategoryName(transaction.category);
  const categoryType = transaction.type === "income" ? "income" : "expense";

  const { data: category, error: categoryError } = await supabase
    .from("transaction_categories")
    .upsert(
      {
        user_id: userId,
        name: normalizedCategory,
        transaction_type: categoryType,
        is_necessary_default: transaction.isNecessary,
        is_active: true
      },
      { onConflict: "user_id,name,transaction_type" }
    )
    .select("id")
    .single();
  if (categoryError) throw new Error("分類記憶儲存失敗");

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      transaction_date: transaction.date,
      transaction_type: transaction.type,
      amount_cents: transaction.amountCents,
      category_id: category.id,
      category_name: normalizedCategory,
      subcategory_name: transaction.subcategory || null,
      account_id: transaction.accountId || null,
      transfer_account_id: transaction.transferAccountId || null,
      credit_card_id: transaction.creditCardId || null,
      loan_id: transaction.loanId || null,
      merchant: transaction.merchant || null,
      note: transaction.note || null,
      is_necessary: transaction.isNecessary,
      is_recurring: transaction.isRecurring,
      tags: transaction.tags,
      source: transaction.source
    })
    .select("id,user_id,transaction_date,transaction_type,amount_cents,category_name,subcategory_name,account_id,transfer_account_id,credit_card_id,loan_id,merchant,note,is_necessary,is_recurring,tags,source,created_at,updated_at")
    .single();
  if (error) throw new Error("交易儲存失敗");
  return mapTransaction(data);
}

export async function deleteTransaction(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error("交易刪除失敗");
}

export function normalizeCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, " ") || "未分類";
}

function mapAccount(row: Record<string, unknown>): FinancialAccount {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    type: String(row.account_type) as AccountType,
    institution: nullableString(row.institution),
    balanceCents: toNumber(row.balance_cents),
    includeInAvailableCash: Boolean(row.include_in_available_cash),
    includeInEmergencyFund: Boolean(row.include_in_emergency_fund),
    note: nullableString(row.note),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    date: String(row.transaction_date),
    type: String(row.transaction_type) as Transaction["type"],
    amountCents: toNumber(row.amount_cents),
    category: nullableString(row.category_name) ?? "未分類",
    subcategory: nullableString(row.subcategory_name),
    accountId: nullableString(row.account_id),
    transferAccountId: nullableString(row.transfer_account_id),
    creditCardId: nullableString(row.credit_card_id),
    loanId: nullableString(row.loan_id),
    merchant: nullableString(row.merchant),
    note: nullableString(row.note),
    isNecessary: Boolean(row.is_necessary),
    isRecurring: Boolean(row.is_recurring),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    source: String(row.source) as Transaction["source"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapCreditCard(row: Record<string, unknown>): CreditCard {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    issuer: String(row.issuer),
    last4: String(row.last4),
    creditLimitCents: toNumber(row.credit_limit_cents),
    statementDay: toNumber(row.statement_day),
    paymentDueDay: toNumber(row.payment_due_day),
    unbilledAmountCents: toNumber(row.unbilled_amount_cents),
    currentStatementAmountCents: toNumber(row.current_statement_amount_cents),
    minimumPaymentCents: toNumber(row.minimum_payment_cents),
    installmentBalanceCents: toNumber(row.installment_balance_cents),
    autoPayAccountId: nullableString(row.auto_pay_account_id),
    annualFeeCents: toNumber(row.annual_fee_cents),
    annualFeeWaiver: nullableString(row.annual_fee_waiver),
    note: nullableString(row.note),
    isActive: Boolean(row.is_active),
    recommendedUtilizationRate: Number(row.recommended_utilization_rate ?? 0.3),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapLoan(row: Record<string, unknown>): Loan {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    type: String(row.loan_type) as Loan["type"],
    institution: nullableString(row.institution),
    originalPrincipalCents: toNumber(row.original_principal_cents),
    remainingPrincipalCents: toNumber(row.remaining_principal_cents),
    annualRate: Number(row.annual_rate ?? 0),
    termMonths: toNumber(row.term_months),
    paidPeriods: toNumber(row.paid_periods),
    monthlyPaymentDay: toNumber(row.monthly_payment_day),
    startDate: String(row.start_date),
    expectedPayoffDate: nullableString(row.expected_payoff_date),
    repaymentMethod: String(row.repayment_method) as Loan["repaymentMethod"],
    paymentPerPeriodCents: toNumber(row.payment_per_period_cents),
    prepaymentPenaltyNote: nullableString(row.prepayment_penalty_note),
    note: nullableString(row.note),
    status: String(row.status) as Loan["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapDeposit(row: Record<string, unknown>): Deposit {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    institution: nullableString(row.institution),
    principalCents: toNumber(row.principal_cents),
    annualRate: Number(row.annual_rate ?? 0),
    startDate: String(row.start_date),
    maturityDate: String(row.maturity_date),
    termMonths: toNumber(row.term_months),
    interestType: String(row.interest_type) as Deposit["interestType"],
    interestPayout: String(row.interest_payout) as Deposit["interestPayout"],
    autoRenew: Boolean(row.auto_renew),
    maturityInstruction: String(row.maturity_instruction) as Deposit["maturityInstruction"],
    estimatedInterestCents: toNumber(row.estimated_interest_cents),
    estimatedMaturityAmountCents: toNumber(row.estimated_maturity_amount_cents),
    includeInAvailableCash: Boolean(row.include_in_available_cash),
    note: nullableString(row.note),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapBudget(row: Record<string, unknown>): Budget {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  return {
    id: String(row.id),
    userId: String(row.user_id),
    month: String(row.budget_month).slice(0, 7),
    totalBudgetCents: toNumber(row.total_budget_cents),
    category: nullableString(metadata.category) ?? "全部",
    budgetCents: toNumber(row.budget_cents),
    thresholds: Array.isArray(row.thresholds) ? row.thresholds.map(Number) : [0.5, 0.8, 1],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapReminder(row: Record<string, unknown>): FinancialReminder {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    amountCents: toNumber(row.amount_cents),
    frequency: String(row.frequency) as FinancialReminder["frequency"],
    debitDay: toNumber(row.debit_day),
    accountId: nullableString(row.account_id),
    remindDaysBefore: toNumber(row.remind_days_before),
    autoCreateTransaction: Boolean(row.auto_create_transaction),
    isNecessary: Boolean(row.is_necessary),
    startDate: String(row.start_date),
    endDate: nullableString(row.end_date),
    status: String(row.status) as FinancialReminder["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableString(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
