import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import type {
  AccountType,
  Budget,
  CreditCard,
  CreditCardInstallment,
  Deposit,
  FinancialAccount,
  FinancialPlan,
  FinancialReminder,
  NotificationPreference,
  InsurancePolicy,
  InvestmentAsset,
  InvestmentCategory,
  LedgerBook,
  LedgerInvitation,
  Loan,
  RecurringIncome,
  Transaction,
  UserProfile
} from "../types/finance";

export interface FinanceData {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  creditCards: CreditCard[];
  creditCardInstallments: CreditCardInstallment[];
  loans: Loan[];
  deposits: Deposit[];
  budgets: Budget[];
  reminders: FinancialReminder[];
  insurancePolicies: InsurancePolicy[];
  investmentCategories: InvestmentCategory[];
  investmentAssets: InvestmentAsset[];
  financialPlans: FinancialPlan[];
  recurringIncomes: RecurringIncome[];
  notificationPreferences: NotificationPreference[];
  categories: string[];
}

export interface LoadFinanceResult {
  data: FinanceData;
  session: Session | null;
  profile: UserProfile | null;
}

export interface LedgerNotificationData {
  ledgerId: string;
  creditCards: CreditCard[];
  installments: CreditCardInstallment[];
  loans: Loan[];
  deposits: Deposit[];
  reminders: FinancialReminder[];
  insurancePolicies: InsurancePolicy[];
  preferences: NotificationPreference[];
}

export interface SupabaseConnectionCheck {
  ok: boolean;
  status: "not_configured" | "not_authenticated" | "connected" | "schema_error";
  message: string;
  details: string[];
}

export const emptyFinanceData: FinanceData = {
  accounts: [],
  transactions: [],
  creditCards: [],
  creditCardInstallments: [],
  loans: [],
  deposits: [],
  budgets: [],
  reminders: [],
  insurancePolicies: [],
  investmentCategories: [],
  investmentAssets: [],
  financialPlans: [],
  recurringIncomes: [],
  notificationPreferences: [],
  categories: []
};

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("無法讀取登入狀態");
  return data.session;
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  if (!supabase) return null;
  const session = await getCurrentSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,user_id,email,display_name,locale,currency,timezone,role,is_super_admin,created_at,updated_at")
    .eq("user_id", session.user.id)
    .single();
  if (error) return ensureUserProfile();
  return mapProfile(data);
}

export async function ensureUserProfile(): Promise<UserProfile | null> {
  if (!supabase) return null;
  const session = await getCurrentSession();
  if (!session) return null;
  const existing = await supabase
    .from("profiles")
    .select("id,user_id,email,display_name,locale,currency,timezone,role,is_super_admin,created_at,updated_at")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (existing.data) return mapProfile(existing.data);

  const email = session.user.email ?? "";
  const isSeedSuperAdmin = email.toLowerCase() === "irrvyh4815@gmail.com";
  const { data, error } = await supabase
    .from("profiles")
    .insert(
      {
        id: session.user.id,
        user_id: session.user.id,
        email,
        display_name: session.user.user_metadata?.display_name ?? session.user.user_metadata?.name ?? email.split("@")[0] ?? "使用者",
        role: isSeedSuperAdmin ? "super_admin" : "user",
        is_super_admin: isSeedSuperAdmin,
        admin_granted_at: isSeedSuperAdmin ? new Date().toISOString() : null
      }
    )
    .select("id,user_id,email,display_name,locale,currency,timezone,role,is_super_admin,created_at,updated_at")
    .single();
  if (error) throw new Error("使用者資料建立失敗，請確認 profiles RLS 與 migration");
  return mapProfile(data);
}

export async function checkSupabaseConnection(): Promise<SupabaseConnectionCheck> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      status: "not_configured",
      message: "尚未設定 Supabase 環境變數",
      details: ["請設定 VITE_SUPABASE_URL", "請設定 VITE_SUPABASE_ANON_KEY", "重新啟動本機 dev server 或重新部署 Vercel"]
    };
  }

  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      status: "not_authenticated",
      message: "Supabase client 已建立，但尚未登入",
      details: ["請在設定頁寄送登入連結", "完成 email magic link 登入後，再重新讀取 Supabase 資料"]
    };
  }

  const { error } = await supabase
    .from("financial_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.user.id)
    .is("deleted_at", null);

  if (error) {
    return {
      ok: false,
      status: "schema_error",
      message: "已登入，但資料表或 RLS 尚未通過讀取檢查",
      details: ["請確認 Supabase migration 已執行", "請確認 financial_accounts RLS policy 允許 authenticated user 讀取自己的 user_id 資料"]
    };
  }

  return {
    ok: true,
    status: "connected",
    message: "Supabase 已連線並可讀取個人理財資料表",
    details: [`目前登入：${session.user.email ?? session.user.id}`, "financial_accounts 讀取檢查通過", "資料仍會透過 RLS 依 user_id 隔離"]
  };
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

export async function signInWithPassword(email: string, password: string): Promise<UserProfile | null> {
  if (!supabase) throw new Error("Supabase 尚未設定");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("登入失敗，請確認 Email、密碼或是否已完成信箱認證");
  return ensureUserProfile();
}

export async function signUpWithPassword(email: string, password: string, displayName: string): Promise<{ needsEmailConfirmation: boolean }> {
  if (!supabase) throw new Error("Supabase 尚未設定");
  assertSecurePassword(password);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
      data: {
        display_name: displayName
      }
    }
  });
  if (error) throw new Error("註冊失敗，請確認 Email 格式、密碼長度或 Supabase Auth 設定");
  if (data.session) {
    await ensureUserProfile();
  }
  return { needsEmailConfirmation: !data.session };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("登出失敗");
}

export async function updateOwnProfile(input: { displayName: string; locale?: string; timezone?: string }): Promise<UserProfile> {
  if (!supabase) throw new Error("請先完成雲端設定");
  const session = await getCurrentSession();
  if (!session) throw new Error("請先登入再更新個人設定");
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 80) throw new Error("暱稱請輸入 1 至 80 個字");
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, locale: input.locale ?? "zh-Hant-TW", timezone: input.timezone ?? "Asia/Taipei" })
    .eq("user_id", session.user.id)
    .select("id,user_id,email,display_name,locale,currency,timezone,role,is_super_admin,created_at,updated_at")
    .single();
  if (error) throw new Error("個人設定儲存失敗");
  return mapProfile(data);
}

export async function updateOwnPassword(password: string): Promise<void> {
  if (!supabase) throw new Error("請先完成雲端設定");
  assertSecurePassword(password);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error("密碼更新失敗，請重新登入後再試");
}

function assertSecurePassword(password: string): void {
  if (password.length < 10 || password.length > 128) throw new Error("密碼請使用 10 至 128 碼");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error("密碼需同時包含英文字母與數字");
}

export async function loadFinanceData(ledgerId?: string): Promise<LoadFinanceResult> {
  if (!supabase) return { data: emptyFinanceData, session: null, profile: null };
  const session = await getCurrentSession();
  if (!session) return { data: emptyFinanceData, session: null, profile: null };
  const userId = session.user.id;
  const profile = await ensureUserProfile();

  const scoped = <T>(query: T): T => ledgerId
    ? (query as { eq: (column: string, value: string) => T }).eq("ledger_id", ledgerId)
    : (query as { eq: (column: string, value: string) => T }).eq("user_id", userId);

  const [
    accounts,
    transactions,
    creditCards,
    creditCardInstallments,
    loans,
    deposits,
    budgets,
    reminders,
    categories,
    insurancePolicies,
    investmentCategories,
    investmentAssets,
    financialPlans,
    recurringIncomes,
    notificationPreferences
  ] = await Promise.all([
    scoped(supabase
      .from("financial_accounts")
      .select("id,user_id,name,account_type,institution,balance_cents,include_in_available_cash,include_in_emergency_fund,note,is_active,created_at,updated_at"))
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    scoped(supabase
      .from("transactions")
      .select("id,user_id,transaction_date,transaction_type,amount_cents,category_name,subcategory_name,account_id,transfer_account_id,credit_card_id,loan_id,merchant,note,is_necessary,is_recurring,tags,source,created_at,updated_at"))
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false })
      .limit(500),
    scoped(supabase
      .from("credit_cards")
      .select("id,user_id,name,issuer,last4,credit_limit_cents,statement_day,payment_due_day,unbilled_amount_cents,current_statement_amount_cents,minimum_payment_cents,installment_balance_cents,auto_pay_account_id,annual_fee_cents,annual_fee_waiver,note,is_active,recommended_utilization_rate,created_at,updated_at"))
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    scoped(supabase
      .from("credit_card_installments")
      .select("id,user_id,credit_card_id,transaction_id,merchant,total_amount_cents,annual_rate,periods,paid_periods,monthly_payment_cents,paid_amount_cents,remaining_amount_cents,started_on,next_due_date,status,note,metadata,created_at,updated_at"))
      .is("deleted_at", null)
      .order("next_due_date", { ascending: true }),
    scoped(supabase
      .from("loans")
      .select("id,user_id,name,loan_type,institution,original_principal_cents,remaining_principal_cents,annual_rate,term_months,paid_periods,monthly_payment_day,start_date,expected_payoff_date,repayment_method,payment_per_period_cents,prepayment_penalty_note,note,status,metadata,created_at,updated_at"))
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    scoped(supabase
      .from("deposits")
      .select("id,user_id,name,institution,principal_cents,annual_rate,start_date,maturity_date,term_months,interest_type,interest_payout,auto_renew,maturity_instruction,estimated_interest_cents,estimated_maturity_amount_cents,include_in_available_cash,note,is_active,created_at,updated_at"))
      .is("deleted_at", null)
      .order("maturity_date", { ascending: true }),
    scoped(supabase
      .from("budgets")
      .select("id,user_id,budget_month,total_budget_cents,budget_cents,thresholds,created_at,updated_at,metadata"))
      .is("deleted_at", null)
      .order("budget_month", { ascending: false }),
    scoped(supabase
      .from("financial_reminders")
      .select("id,user_id,name,amount_cents,frequency,debit_day,account_id,remind_days_before,auto_create_transaction,is_necessary,start_date,end_date,status,created_at,updated_at"))
      .is("deleted_at", null)
      .order("debit_day", { ascending: true }),
    scoped(supabase
      .from("transaction_categories")
      .select("name"))
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    scoped(supabase
      .from("insurance_policies")
      .select("id,user_id,name,policy_type,insurer,policy_number_last4,insured_person,annual_premium_cents,coverage_amount_cents,paid_claim_amount_cents,pending_claim_amount_cents,payment_day,renewal_date,beneficiary,note,status,created_at,updated_at"))
      .is("deleted_at", null)
      .order("renewal_date", { ascending: true }),
    scoped(supabase
      .from("investment_categories")
      .select("id,user_id,name,kind,market,target_allocation,risk,note,is_active,created_at,updated_at"))
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    scoped(supabase
      .from("investment_assets")
      .select("id,user_id,category_id,asset_type,symbol,name,quantity,quote_currency,average_unit_cost,current_unit_price,exchange_rate_to_ledger,platform,acquired_date,note,is_active,created_at,updated_at"))
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    scoped(supabase
      .from("financial_plans")
      .select("id,user_id,name,goal_type,horizon,target_amount_cents,current_amount_cents,monthly_contribution_cents,target_date,expected_annual_return,risk_profile,priority,note,status,created_at,updated_at"))
      .is("deleted_at", null)
      .order("priority", { ascending: true })
      .order("target_date", { ascending: true }),
    scoped(supabase
      .from("recurring_transactions")
      .select("id,user_id,name,amount_cents,account_id,frequency,day_of_month,next_run_date,end_date,is_active,metadata,created_at,updated_at"))
      .eq("transaction_type", "income")
      .is("deleted_at", null)
      .order("next_run_date", { ascending: true }),
    scoped(supabase
      .from("ledger_notification_preferences")
      .select("id,user_id,notification_type,is_enabled,remind_days_before,delivery_mode,repeat_hours,created_at,updated_at"))
      .order("notification_type", { ascending: true })
  ]);

  const responses = [accounts, transactions, creditCards, creditCardInstallments, loans, deposits, budgets, reminders, categories];
  const failed = responses.find((response) => response.error);
  if (failed?.error) throw new Error("Supabase 資料讀取失敗，請確認 migration 與 RLS 設定");
  const insuranceTableUnavailable = insurancePolicies.error?.code === "42P01" || insurancePolicies.error?.code === "PGRST205";
  if (insurancePolicies.error && !insuranceTableUnavailable) throw new Error("保險資料讀取失敗");
  const investmentsTableUnavailable = investmentCategories.error?.code === "42P01" || investmentCategories.error?.code === "PGRST205";
  if (investmentCategories.error && !investmentsTableUnavailable) throw new Error("投資資料讀取失敗");
  const investmentAssetsUnavailable = investmentAssets.error?.code === "42P01" || investmentAssets.error?.code === "PGRST205";
  if (investmentAssets.error && !investmentAssetsUnavailable) throw new Error("投資持倉讀取失敗");
  const plansTableUnavailable = financialPlans.error?.code === "42P01" || financialPlans.error?.code === "PGRST205";
  if (financialPlans.error && !plansTableUnavailable) throw new Error("財務計劃讀取失敗");
  if (recurringIncomes.error) throw new Error("固定收入讀取失敗");
  const preferencesTableUnavailable = notificationPreferences.error?.code === "42P01" || notificationPreferences.error?.code === "PGRST205";
  if (notificationPreferences.error && !preferencesTableUnavailable) throw new Error("通知設定讀取失敗");

  return {
    session,
    profile,
    data: {
      accounts: (accounts.data ?? []).map(mapAccount),
      transactions: (transactions.data ?? []).map(mapTransaction),
      creditCards: (creditCards.data ?? []).map(mapCreditCard),
      creditCardInstallments: (creditCardInstallments.data ?? []).map(mapCreditCardInstallment),
      loans: (loans.data ?? []).map(mapLoan),
      deposits: (deposits.data ?? []).map(mapDeposit),
      budgets: (budgets.data ?? []).map(mapBudget),
      reminders: (reminders.data ?? []).map(mapReminder),
      insurancePolicies: (insurancePolicies.data ?? []).map(mapInsurancePolicy),
      investmentCategories: (investmentCategories.data ?? []).map(mapInvestmentCategory),
      investmentAssets: (investmentAssets.data ?? []).map(mapInvestmentAsset),
      financialPlans: (financialPlans.data ?? []).map(mapFinancialPlan),
      recurringIncomes: (recurringIncomes.data ?? []).map(mapRecurringIncome),
      notificationPreferences: (notificationPreferences.data ?? []).map(mapNotificationPreference),
      categories: [...new Set((categories.data ?? []).map((row) => String(row.name)).filter(Boolean))]
    }
  };
}

export async function loadLedgerBooks(): Promise<LedgerBook[]> {
  if (!supabase) return [];
  const result = await supabase
    .from("ledger_books")
    .select("id,owner_user_id,name,purpose,color,base_currency,note,is_default,is_shared,created_at,updated_at")
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (!result.error) return (result.data ?? []).map(mapLedgerBook);
  if (!["42703", "PGRST204"].includes(result.error.code ?? "")) throw new Error("帳本資料讀取失敗，請確認帳本 migration 與 RLS 設定");
  const fallback = await supabase
    .from("ledger_books")
    .select("id,owner_user_id,name,purpose,color,note,is_default,is_shared,created_at,updated_at")
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (fallback.error) throw new Error("帳本資料讀取失敗，請確認帳本 migration 與 RLS 設定");
  return (fallback.data ?? []).map(mapLedgerBook);
}

export async function loadAllLedgerNotificationData(): Promise<LedgerNotificationData[]> {
  if (!supabase || !(await getCurrentSession())) return [];
  const [creditCards, installments, loans, deposits, reminders, insurancePolicies, preferences] = await Promise.all([
    supabase.from("credit_cards").select("ledger_id,id,user_id,name,issuer,last4,credit_limit_cents,statement_day,payment_due_day,unbilled_amount_cents,current_statement_amount_cents,minimum_payment_cents,installment_balance_cents,auto_pay_account_id,annual_fee_cents,annual_fee_waiver,note,is_active,recommended_utilization_rate,created_at,updated_at").is("deleted_at", null).eq("is_active", true),
    supabase.from("credit_card_installments").select("ledger_id,id,user_id,credit_card_id,transaction_id,merchant,total_amount_cents,annual_rate,periods,paid_periods,monthly_payment_cents,paid_amount_cents,remaining_amount_cents,started_on,next_due_date,status,note,created_at,updated_at").is("deleted_at", null).eq("status", "active"),
    supabase.from("loans").select("ledger_id,id,user_id,name,loan_type,institution,original_principal_cents,remaining_principal_cents,annual_rate,term_months,paid_periods,monthly_payment_day,start_date,expected_payoff_date,repayment_method,payment_per_period_cents,prepayment_penalty_note,note,status,created_at,updated_at").is("deleted_at", null).eq("status", "active"),
    supabase.from("deposits").select("ledger_id,id,user_id,name,institution,principal_cents,annual_rate,start_date,maturity_date,term_months,interest_type,interest_payout,auto_renew,maturity_instruction,estimated_interest_cents,estimated_maturity_amount_cents,include_in_available_cash,note,is_active,created_at,updated_at").is("deleted_at", null).eq("is_active", true),
    supabase.from("financial_reminders").select("ledger_id,id,user_id,name,amount_cents,frequency,debit_day,account_id,remind_days_before,auto_create_transaction,is_necessary,start_date,end_date,status,created_at,updated_at").is("deleted_at", null).neq("status", "done"),
    supabase.from("insurance_policies").select("ledger_id,id,user_id,name,policy_type,insurer,policy_number_last4,insured_person,annual_premium_cents,coverage_amount_cents,paid_claim_amount_cents,pending_claim_amount_cents,payment_day,renewal_date,beneficiary,note,status,created_at,updated_at").is("deleted_at", null).eq("status", "active"),
    supabase.from("ledger_notification_preferences").select("ledger_id,id,user_id,notification_type,is_enabled,remind_days_before,delivery_mode,repeat_hours,created_at,updated_at")
  ]);
  const required = [creditCards, installments, loans, deposits, reminders];
  if (required.some((result) => result.error)) throw new Error("跨帳本通知讀取失敗");
  const insuranceUnavailable = insurancePolicies.error?.code === "42P01" || insurancePolicies.error?.code === "PGRST205";
  if (insurancePolicies.error && !insuranceUnavailable) throw new Error("跨帳本保險通知讀取失敗");
  const preferencesUnavailable = preferences.error?.code === "42P01" || preferences.error?.code === "PGRST205";
  if (preferences.error && !preferencesUnavailable) throw new Error("跨帳本通知設定讀取失敗");

  const groups = new Map<string, LedgerNotificationData>();
  const ensureLedger = (ledgerId: string) => {
    const existing = groups.get(ledgerId);
    if (existing) return existing;
    const created: LedgerNotificationData = { ledgerId, creditCards: [], installments: [], loans: [], deposits: [], reminders: [], insurancePolicies: [], preferences: [] };
    groups.set(ledgerId, created);
    return created;
  };
  const append = (rows: Record<string, unknown>[] | null, type: "creditCards" | "installments" | "loans" | "deposits" | "reminders" | "insurancePolicies", map: (row: Record<string, unknown>) => unknown) => {
    (rows ?? []).forEach((row) => {
      const ledgerId = String(row.ledger_id ?? "");
      if (!ledgerId) return;
      const target = ensureLedger(ledgerId)[type] as unknown[];
      target.push(map(row));
    });
  };
  append(creditCards.data as Record<string, unknown>[] | null, "creditCards", mapCreditCard);
  append(installments.data as Record<string, unknown>[] | null, "installments", mapCreditCardInstallment);
  append(loans.data as Record<string, unknown>[] | null, "loans", mapLoan);
  append(deposits.data as Record<string, unknown>[] | null, "deposits", mapDeposit);
  append(reminders.data as Record<string, unknown>[] | null, "reminders", mapReminder);
  append(insurancePolicies.data as Record<string, unknown>[] | null, "insurancePolicies", mapInsurancePolicy);
  ((preferences.data ?? []) as Record<string, unknown>[]).forEach((row) => {
    const ledgerId = String(row.ledger_id ?? "");
    if (ledgerId) ensureLedger(ledgerId).preferences.push(mapNotificationPreference(row));
  });
  return [...groups.values()];
}

export async function loadLedgerInvitations(): Promise<LedgerInvitation[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("ledger_invitations")
    .select("id,ledger_id,invitee_email,invitee_member_code,role,status,expires_at,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error("帳本邀請讀取失敗");
  return (data ?? []).map(mapLedgerInvitation);
}

export async function createLedgerBook(ledger: Omit<LedgerBook, "id" | "createdAt" | "updatedAt">): Promise<LedgerBook> {
  if (!supabase) throw new Error("請先登入再建立帳本");
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再建立帳本");
  const response = await fetch("/api/ledgers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session.access_token}`
    },
    body: JSON.stringify({
      name: ledger.name,
      purpose: ledger.purpose,
      color: ledger.color,
      currency: ledger.currency,
      note: ledger.note,
      isShared: ledger.isShared
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (response.ok && payload.ledger) return mapLedgerBook(payload.ledger as Record<string, unknown>);
  if (response.status !== 404) throw new Error(String(payload.error || "帳本建立失敗"));

  const { data, error } = await supabase
    .from("ledger_books")
    .insert({ owner_user_id: sessionData.session.user.id, name: ledger.name, purpose: ledger.purpose, color: ledger.color, base_currency: ledger.currency, note: ledger.note || null, is_default: ledger.isDefault, is_shared: ledger.isShared })
    .select("id,owner_user_id,name,purpose,color,base_currency,note,is_default,is_shared,created_at,updated_at")
    .single();
  if (error) throw new Error("帳本建立失敗");
  return mapLedgerBook(data);
}

export async function updateLedgerBook(ledger: LedgerBook): Promise<LedgerBook> {
  if (!supabase) throw new Error("請先登入再更新帳本");
  const result = await supabase
    .from("ledger_books")
    .update({ name: ledger.name, purpose: ledger.purpose, color: ledger.color, note: ledger.note || null, is_shared: ledger.isShared })
    .eq("id", ledger.id)
    .select("id,owner_user_id,name,purpose,color,base_currency,note,is_default,is_shared,created_at,updated_at")
    .single();
  if (!result.error) return mapLedgerBook(result.data);
  if (!["42703", "PGRST204"].includes(result.error.code ?? "")) throw new Error("帳本更新失敗");
  const fallback = await supabase
    .from("ledger_books")
    .update({ name: ledger.name, purpose: ledger.purpose, color: ledger.color, note: ledger.note || null, is_shared: ledger.isShared })
    .eq("id", ledger.id)
    .select("id,owner_user_id,name,purpose,color,note,is_default,is_shared,created_at,updated_at")
    .single();
  if (fallback.error) throw new Error("帳本更新失敗");
  return mapLedgerBook(fallback.data);
}

export async function convertLedgerCurrency(ledgerId: string, targetCurrency: LedgerBook["currency"], conversionRate: number): Promise<void> {
  if (!supabase) throw new Error("請先登入再轉換帳本幣別");
  if (!Number.isFinite(conversionRate) || conversionRate <= 0 || conversionRate > 1_000_000) throw new Error("請輸入有效的幣別轉換匯率");
  const { error } = await supabase.rpc("convert_ledger_currency", {
    p_ledger_id: ledgerId,
    p_to_currency: targetCurrency,
    p_conversion_rate: conversionRate
  });
  if (error?.code === "42883" || error?.code === "PGRST202") throw new Error("幣別轉換功能尚未完成雲端初始化");
  if (error) throw new Error("帳本幣別轉換失敗，資料未變更");
}

export async function deleteLedgerBook(id: string): Promise<void> {
  if (!supabase) throw new Error("請先登入再刪除帳本");
  const { error } = await supabase.from("ledger_books").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("帳本刪除失敗");
}

export async function createLedgerInvitation(invitation: Omit<LedgerInvitation, "id" | "userId" | "createdAt" | "updatedAt">): Promise<LedgerInvitation> {
  if (!supabase) throw new Error("請先登入再邀請成員");
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再邀請成員");
  const { data, error } = await supabase
    .from("ledger_invitations")
    .insert({ ledger_id: invitation.ledgerId, inviter_user_id: sessionData.session.user.id, invitee_email: invitation.inviteeEmail || null, invitee_member_code: invitation.inviteeMemberCode || null, role: invitation.role })
    .select("id,ledger_id,invitee_email,invitee_member_code,role,status,expires_at,created_at,updated_at")
    .single();
  if (error) throw new Error("帳本邀請建立失敗");
  return mapLedgerInvitation(data);
}

function mapProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    email: nullableString(row.email),
    displayName: nullableString(row.display_name),
    locale: String(row.locale ?? "zh-Hant-TW"),
    currency: "TWD",
    timezone: String(row.timezone ?? "Asia/Taipei"),
    role: String(row.role ?? "user") as UserProfile["role"],
    isSuperAdmin: Boolean(row.is_super_admin),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export async function createFinancialAccount(account: FinancialAccount, ledgerId?: string): Promise<FinancialAccount> {
  if (!supabase) return account;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再新增帳戶");
  const userId = sessionData.session.user.id;
  const { data, error } = await supabase
    .from("financial_accounts")
    .insert({
      user_id: userId,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
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

export async function updateFinancialAccount(account: FinancialAccount): Promise<FinancialAccount> {
  if (!supabase) return { ...account, updatedAt: new Date().toISOString() };
  const { data, error } = await supabase
    .from("financial_accounts")
    .update({
      name: account.name,
      account_type: account.type,
      institution: account.institution || null,
      balance_cents: account.balanceCents,
      include_in_available_cash: account.includeInAvailableCash,
      include_in_emergency_fund: account.includeInEmergencyFund,
      note: account.note || null,
      is_active: account.isActive
    })
    .eq("id", account.id)
    .select("id,user_id,name,account_type,institution,balance_cents,include_in_available_cash,include_in_emergency_fund,note,is_active,created_at,updated_at")
    .single();
  if (error) throw new Error("帳戶更新失敗");
  return mapAccount(data);
}

export async function deleteFinancialAccount(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("financial_accounts").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", id);
  if (error) throw new Error("帳戶刪除失敗");
}

export async function createCreditCard(card: CreditCard, ledgerId?: string): Promise<CreditCard> {
  if (!supabase) return card;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再新增信用卡");
  const { data, error } = await supabase
    .from("credit_cards")
    .insert({
      user_id: sessionData.session.user.id,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
      name: card.name,
      issuer: card.issuer,
      last4: card.last4,
      credit_limit_cents: card.creditLimitCents,
      statement_day: card.statementDay,
      payment_due_day: card.paymentDueDay,
      unbilled_amount_cents: card.unbilledAmountCents,
      current_statement_amount_cents: card.currentStatementAmountCents,
      minimum_payment_cents: card.minimumPaymentCents,
      installment_balance_cents: card.installmentBalanceCents,
      auto_pay_account_id: card.autoPayAccountId || null,
      annual_fee_cents: card.annualFeeCents,
      annual_fee_waiver: card.annualFeeWaiver || null,
      note: card.note || null,
      is_active: card.isActive,
      recommended_utilization_rate: card.recommendedUtilizationRate
    })
    .select("id,user_id,name,issuer,last4,credit_limit_cents,statement_day,payment_due_day,unbilled_amount_cents,current_statement_amount_cents,minimum_payment_cents,installment_balance_cents,auto_pay_account_id,annual_fee_cents,annual_fee_waiver,note,is_active,recommended_utilization_rate,created_at,updated_at")
    .single();
  if (error) throw new Error("信用卡儲存失敗");
  return mapCreditCard(data);
}

export async function updateCreditCard(card: CreditCard): Promise<CreditCard> {
  if (!supabase) return { ...card, updatedAt: new Date().toISOString() };
  const { data, error } = await supabase
    .from("credit_cards")
    .update({
      name: card.name,
      issuer: card.issuer,
      last4: card.last4,
      credit_limit_cents: card.creditLimitCents,
      statement_day: card.statementDay,
      payment_due_day: card.paymentDueDay,
      unbilled_amount_cents: card.unbilledAmountCents,
      current_statement_amount_cents: card.currentStatementAmountCents,
      minimum_payment_cents: card.minimumPaymentCents,
      installment_balance_cents: card.installmentBalanceCents,
      auto_pay_account_id: card.autoPayAccountId || null,
      annual_fee_cents: card.annualFeeCents,
      annual_fee_waiver: card.annualFeeWaiver || null,
      note: card.note || null,
      is_active: card.isActive,
      recommended_utilization_rate: card.recommendedUtilizationRate
    })
    .eq("id", card.id)
    .select("id,user_id,name,issuer,last4,credit_limit_cents,statement_day,payment_due_day,unbilled_amount_cents,current_statement_amount_cents,minimum_payment_cents,installment_balance_cents,auto_pay_account_id,annual_fee_cents,annual_fee_waiver,note,is_active,recommended_utilization_rate,created_at,updated_at")
    .single();
  if (error) throw new Error("信用卡更新失敗");
  return mapCreditCard(data);
}

export async function deleteCreditCard(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("credit_cards").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", id);
  if (error) throw new Error("信用卡刪除失敗");
}

export async function createLoan(loan: Loan, ledgerId?: string): Promise<Loan> {
  if (!supabase) return loan;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再新增貸款");
  const { data, error } = await supabase
    .from("loans")
    .insert({
      user_id: sessionData.session.user.id,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
      name: loan.name,
      loan_type: loan.type,
      institution: loan.institution || null,
      original_principal_cents: loan.originalPrincipalCents,
      remaining_principal_cents: loan.remainingPrincipalCents,
      annual_rate: loan.annualRate,
      term_months: loan.termMonths,
      paid_periods: loan.paidPeriods,
      metadata: { ...(loan.metadata ?? {}), paid_amount_cents: loan.paidAmountCents },
      monthly_payment_day: loan.monthlyPaymentDay,
      start_date: loan.startDate,
      expected_payoff_date: loan.expectedPayoffDate || null,
      repayment_method: loan.repaymentMethod,
      payment_per_period_cents: loan.paymentPerPeriodCents,
      prepayment_penalty_note: loan.prepaymentPenaltyNote || null,
      note: loan.note || null,
      status: loan.status
    })
    .select("id,user_id,name,loan_type,institution,original_principal_cents,remaining_principal_cents,annual_rate,term_months,paid_periods,monthly_payment_day,start_date,expected_payoff_date,repayment_method,payment_per_period_cents,prepayment_penalty_note,note,status,metadata,created_at,updated_at")
    .single();
  if (error) throw new Error("貸款儲存失敗");
  return mapLoan(data);
}

export async function updateLoan(loan: Loan): Promise<Loan> {
  if (!supabase) return { ...loan, updatedAt: new Date().toISOString() };
  const { data, error } = await supabase
    .from("loans")
    .update({
      name: loan.name,
      loan_type: loan.type,
      institution: loan.institution || null,
      original_principal_cents: loan.originalPrincipalCents,
      remaining_principal_cents: loan.remainingPrincipalCents,
      annual_rate: loan.annualRate,
      term_months: loan.termMonths,
      paid_periods: loan.paidPeriods,
      metadata: { ...(loan.metadata ?? {}), paid_amount_cents: loan.paidAmountCents },
      monthly_payment_day: loan.monthlyPaymentDay,
      start_date: loan.startDate,
      expected_payoff_date: loan.expectedPayoffDate || null,
      repayment_method: loan.repaymentMethod,
      payment_per_period_cents: loan.paymentPerPeriodCents,
      prepayment_penalty_note: loan.prepaymentPenaltyNote || null,
      note: loan.note || null,
      status: loan.status
    })
    .eq("id", loan.id)
    .select("id,user_id,name,loan_type,institution,original_principal_cents,remaining_principal_cents,annual_rate,term_months,paid_periods,monthly_payment_day,start_date,expected_payoff_date,repayment_method,payment_per_period_cents,prepayment_penalty_note,note,status,metadata,created_at,updated_at")
    .single();
  if (error) throw new Error("貸款更新失敗");
  return mapLoan(data);
}

export async function deleteLoan(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("loans").update({ deleted_at: new Date().toISOString(), status: "paid_off" }).eq("id", id);
  if (error) throw new Error("貸款刪除失敗");
}

export async function createDeposit(deposit: Deposit, ledgerId?: string): Promise<Deposit> {
  if (!supabase) return deposit;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再新增存款");
  const { data, error } = await supabase
    .from("deposits")
    .insert({
      user_id: sessionData.session.user.id,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
      name: deposit.name,
      institution: deposit.institution || null,
      principal_cents: deposit.principalCents,
      annual_rate: deposit.annualRate,
      start_date: deposit.startDate,
      maturity_date: deposit.maturityDate,
      term_months: deposit.termMonths,
      interest_type: deposit.interestType,
      interest_payout: deposit.interestPayout,
      auto_renew: deposit.autoRenew,
      maturity_instruction: deposit.maturityInstruction,
      estimated_interest_cents: deposit.estimatedInterestCents,
      estimated_maturity_amount_cents: deposit.estimatedMaturityAmountCents,
      include_in_available_cash: deposit.includeInAvailableCash,
      note: deposit.note || null,
      is_active: deposit.isActive
    })
    .select("id,user_id,name,institution,principal_cents,annual_rate,start_date,maturity_date,term_months,interest_type,interest_payout,auto_renew,maturity_instruction,estimated_interest_cents,estimated_maturity_amount_cents,include_in_available_cash,note,is_active,created_at,updated_at")
    .single();
  if (error) throw new Error("存款儲存失敗");
  return mapDeposit(data);
}

export async function deleteDeposit(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("deposits").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", id);
  if (error) throw new Error("存款刪除失敗");
}

export async function createBudget(budget: Budget, ledgerId?: string): Promise<Budget> {
  if (!supabase) return budget;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再新增預算");
  const { data, error } = await supabase
    .from("budgets")
    .insert({
      user_id: sessionData.session.user.id,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
      budget_month: `${budget.month}-01`,
      total_budget_cents: budget.totalBudgetCents,
      budget_cents: budget.budgetCents,
      thresholds: budget.thresholds,
      metadata: { category: budget.category || "全部" }
    })
    .select("id,user_id,budget_month,total_budget_cents,budget_cents,thresholds,created_at,updated_at,metadata")
    .single();
  if (error) throw new Error("預算儲存失敗");
  return mapBudget(data);
}

export async function updateBudget(budget: Budget): Promise<Budget> {
  if (!supabase) return { ...budget, updatedAt: new Date().toISOString() };
  const { data, error } = await supabase
    .from("budgets")
    .update({
      total_budget_cents: budget.totalBudgetCents,
      budget_cents: budget.budgetCents,
      thresholds: budget.thresholds,
      metadata: { category: budget.category || "全部" }
    })
    .eq("id", budget.id)
    .select("id,user_id,budget_month,total_budget_cents,budget_cents,thresholds,created_at,updated_at,metadata")
    .single();
  if (error) throw new Error("預算更新失敗");
  return mapBudget(data);
}

export async function deleteBudget(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("budgets").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("預算刪除失敗");
}

export async function createFinancialReminder(reminder: FinancialReminder, ledgerId?: string): Promise<FinancialReminder> {
  if (!supabase) return reminder;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再新增提醒");
  const { data, error } = await supabase
    .from("financial_reminders")
    .insert({
      user_id: sessionData.session.user.id,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
      name: reminder.name,
      amount_cents: reminder.amountCents,
      frequency: reminder.frequency,
      debit_day: reminder.debitDay,
      account_id: reminder.accountId || null,
      remind_days_before: reminder.remindDaysBefore,
      auto_create_transaction: reminder.autoCreateTransaction,
      is_necessary: reminder.isNecessary,
      start_date: reminder.startDate,
      end_date: reminder.endDate || null,
      status: reminder.status
    })
    .select("id,user_id,name,amount_cents,frequency,debit_day,account_id,remind_days_before,auto_create_transaction,is_necessary,start_date,end_date,status,created_at,updated_at")
    .single();
  if (error) throw new Error("提醒儲存失敗");
  return mapReminder(data);
}

export async function deleteFinancialReminder(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("financial_reminders").update({ deleted_at: new Date().toISOString(), status: "done" }).eq("id", id);
  if (error) throw new Error("提醒刪除失敗");
}

export async function createInsurancePolicy(policy: InsurancePolicy, ledgerId?: string): Promise<InsurancePolicy> {
  if (!supabase) return policy;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再新增保單");
  const { data, error } = await supabase
    .from("insurance_policies")
    .insert({
      user_id: sessionData.session.user.id,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
      name: policy.name,
      policy_type: policy.type,
      insurer: policy.insurer,
      policy_number_last4: policy.policyNumberLast4 || null,
      insured_person: policy.insuredPerson || null,
      annual_premium_cents: policy.annualPremiumCents,
      coverage_amount_cents: policy.coverageAmountCents,
      paid_claim_amount_cents: policy.paidClaimAmountCents,
      pending_claim_amount_cents: policy.pendingClaimAmountCents,
      payment_day: policy.paymentDay,
      renewal_date: policy.renewalDate,
      beneficiary: policy.beneficiary || null,
      note: policy.note || null,
      status: policy.status
    })
    .select("id,user_id,name,policy_type,insurer,policy_number_last4,insured_person,annual_premium_cents,coverage_amount_cents,paid_claim_amount_cents,pending_claim_amount_cents,payment_day,renewal_date,beneficiary,note,status,created_at,updated_at")
    .single();
  if (error) throw new Error("保單儲存失敗");
  return mapInsurancePolicy(data);
}

export async function deleteInsurancePolicy(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("insurance_policies").update({ deleted_at: new Date().toISOString(), status: "expired" }).eq("id", id);
  if (error) throw new Error("保單刪除失敗");
}

export async function createInvestmentCategory(category: InvestmentCategory, ledgerId?: string): Promise<InvestmentCategory> {
  if (!supabase) return category;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再新增投資分類");
  const { data, error } = await supabase
    .from("investment_categories")
    .insert({
      user_id: sessionData.session.user.id,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
      name: category.name,
      kind: category.kind,
      market: category.market,
      target_allocation: category.targetAllocation,
      risk: category.risk,
      note: category.note || null,
      is_active: category.isActive
    })
    .select("id,user_id,name,kind,market,target_allocation,risk,note,is_active,created_at,updated_at")
    .single();
  if (error?.code === "42P01" || error?.code === "PGRST205") throw new Error("投資資料功能尚未完成雲端初始化");
  if (error) throw new Error("投資分類儲存失敗");
  return mapInvestmentCategory(data);
}

export async function deleteInvestmentCategory(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("investment_categories").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", id);
  if (error) throw new Error("投資分類刪除失敗");
}

export async function createInvestmentAsset(asset: InvestmentAsset, ledgerId?: string): Promise<InvestmentAsset> {
  if (!supabase) return asset;
  const session = await getCurrentSession();
  if (!session || !ledgerId) throw new Error("請先登入並選擇帳本");
  const { data, error } = await supabase
    .from("investment_assets")
    .insert({
      user_id: session.user.id,
      ledger_id: ledgerId,
      category_id: asset.categoryId || null,
      asset_type: asset.assetType,
      symbol: asset.symbol,
      name: asset.name,
      quantity: asset.quantity,
      quote_currency: asset.quoteCurrency,
      average_unit_cost: asset.averageUnitCost,
      current_unit_price: asset.currentUnitPrice,
      exchange_rate_to_ledger: asset.exchangeRateToLedger,
      platform: asset.platform || null,
      acquired_date: asset.acquiredDate || null,
      note: asset.note || null,
      is_active: asset.isActive
    })
    .select("id,user_id,category_id,asset_type,symbol,name,quantity,quote_currency,average_unit_cost,current_unit_price,exchange_rate_to_ledger,platform,acquired_date,note,is_active,created_at,updated_at")
    .single();
  if (error?.code === "42P01" || error?.code === "PGRST205") throw new Error("外匯與加密貨幣功能尚未完成雲端初始化");
  if (error) throw new Error("投資持倉儲存失敗");
  return mapInvestmentAsset(data);
}

export async function updateInvestmentAsset(asset: InvestmentAsset): Promise<InvestmentAsset> {
  if (!supabase) return asset;
  const { data, error } = await supabase
    .from("investment_assets")
    .update({
      category_id: asset.categoryId || null,
      symbol: asset.symbol,
      name: asset.name,
      quantity: asset.quantity,
      quote_currency: asset.quoteCurrency,
      average_unit_cost: asset.averageUnitCost,
      current_unit_price: asset.currentUnitPrice,
      exchange_rate_to_ledger: asset.exchangeRateToLedger,
      platform: asset.platform || null,
      acquired_date: asset.acquiredDate || null,
      note: asset.note || null,
      is_active: asset.isActive
    })
    .eq("id", asset.id)
    .select("id,user_id,category_id,asset_type,symbol,name,quantity,quote_currency,average_unit_cost,current_unit_price,exchange_rate_to_ledger,platform,acquired_date,note,is_active,created_at,updated_at")
    .single();
  if (error) throw new Error("投資持倉更新失敗");
  return mapInvestmentAsset(data);
}

export async function deleteInvestmentAsset(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("investment_assets")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id);
  if (error) throw new Error("投資持倉刪除失敗");
}

export async function createFinancialPlan(plan: FinancialPlan, ledgerId?: string): Promise<FinancialPlan> {
  if (!supabase) return plan;
  const session = await getCurrentSession();
  if (!session) throw new Error("請先登入再新增財務計劃");
  const { data, error } = await supabase
    .from("financial_plans")
    .insert({
      user_id: session.user.id,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
      name: plan.name,
      goal_type: plan.goalType,
      horizon: plan.horizon,
      target_amount_cents: plan.targetAmountCents,
      current_amount_cents: plan.currentAmountCents,
      monthly_contribution_cents: plan.monthlyContributionCents,
      target_date: plan.targetDate,
      expected_annual_return: plan.expectedAnnualReturn,
      risk_profile: plan.riskProfile,
      priority: plan.priority,
      note: plan.note || null,
      status: plan.status
    })
    .select("id,user_id,name,goal_type,horizon,target_amount_cents,current_amount_cents,monthly_contribution_cents,target_date,expected_annual_return,risk_profile,priority,note,status,created_at,updated_at")
    .single();
  if (error?.code === "42P01" || error?.code === "PGRST205") throw new Error("財務計劃功能尚未完成雲端初始化");
  if (error) throw new Error("財務計劃儲存失敗");
  return mapFinancialPlan(data);
}

export async function updateFinancialPlan(plan: FinancialPlan): Promise<FinancialPlan> {
  if (!supabase) return plan;
  const { data, error } = await supabase
    .from("financial_plans")
    .update({
      name: plan.name,
      goal_type: plan.goalType,
      horizon: plan.horizon,
      target_amount_cents: plan.targetAmountCents,
      current_amount_cents: plan.currentAmountCents,
      monthly_contribution_cents: plan.monthlyContributionCents,
      target_date: plan.targetDate,
      expected_annual_return: plan.expectedAnnualReturn,
      risk_profile: plan.riskProfile,
      priority: plan.priority,
      note: plan.note || null,
      status: plan.status
    })
    .eq("id", plan.id)
    .select("id,user_id,name,goal_type,horizon,target_amount_cents,current_amount_cents,monthly_contribution_cents,target_date,expected_annual_return,risk_profile,priority,note,status,created_at,updated_at")
    .single();
  if (error) throw new Error("財務計劃更新失敗");
  return mapFinancialPlan(data);
}

export async function deleteFinancialPlan(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("financial_plans").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("財務計劃刪除失敗");
}

export async function createRecurringIncome(income: RecurringIncome, ledgerId?: string): Promise<RecurringIncome> {
  if (!supabase) return income;
  const session = await getCurrentSession();
  if (!session) throw new Error("請先登入再新增固定收入");
  const { data, error } = await supabase
    .from("recurring_transactions")
    .insert({
      user_id: session.user.id,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
      name: income.name,
      transaction_type: "income",
      amount_cents: income.amountCents,
      account_id: income.accountId || null,
      frequency: income.frequency,
      day_of_month: income.dayOfMonth || null,
      next_run_date: income.startDate,
      end_date: income.endDate || null,
      is_necessary: false,
      is_active: income.isActive,
      metadata: recurringIncomeMetadata(income)
    })
    .select("id,user_id,name,amount_cents,account_id,frequency,day_of_month,next_run_date,end_date,is_active,metadata,created_at,updated_at")
    .single();
  if (error) throw new Error("固定收入儲存失敗");
  return mapRecurringIncome(data);
}

export async function updateRecurringIncome(income: RecurringIncome): Promise<RecurringIncome> {
  if (!supabase) return income;
  const { data, error } = await supabase
    .from("recurring_transactions")
    .update({
      name: income.name,
      amount_cents: income.amountCents,
      account_id: income.accountId || null,
      frequency: income.frequency,
      day_of_month: income.dayOfMonth || null,
      next_run_date: income.startDate,
      end_date: income.endDate || null,
      is_active: income.isActive,
      metadata: recurringIncomeMetadata(income)
    })
    .eq("id", income.id)
    .eq("transaction_type", "income")
    .select("id,user_id,name,amount_cents,account_id,frequency,day_of_month,next_run_date,end_date,is_active,metadata,created_at,updated_at")
    .single();
  if (error) throw new Error("固定收入更新失敗");
  return mapRecurringIncome(data);
}

export async function deleteRecurringIncome(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("recurring_transactions")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id)
    .eq("transaction_type", "income");
  if (error) throw new Error("固定收入刪除失敗");
}

export async function saveNotificationPreferences(preferences: NotificationPreference[], ledgerId?: string): Promise<NotificationPreference[]> {
  if (!supabase) return preferences;
  const session = await getCurrentSession();
  if (!session || !ledgerId) throw new Error("請先進入已儲存的帳本再更新通知設定");
  const { data, error } = await supabase
    .from("ledger_notification_preferences")
    .upsert(
      preferences.map((preference) => ({
        user_id: session.user.id,
        ledger_id: ledgerId,
        notification_type: preference.type,
        is_enabled: preference.isEnabled,
        remind_days_before: preference.remindDaysBefore,
        delivery_mode: preference.deliveryMode,
        repeat_hours: preference.repeatHours
      })),
      { onConflict: "ledger_id,user_id,notification_type" }
    )
    .select("id,user_id,notification_type,is_enabled,remind_days_before,delivery_mode,repeat_hours,created_at,updated_at");
  if (error?.code === "42P01" || error?.code === "PGRST205") throw new Error("通知設定功能尚未完成雲端初始化");
  if (error) throw new Error("通知設定儲存失敗");
  return (data ?? []).map(mapNotificationPreference);
}

export async function createTransactionWithCategory(transaction: Transaction, ledgerId?: string): Promise<Transaction> {
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
        ...(ledgerId ? { ledger_id: ledgerId } : {}),
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
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
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

export async function createCreditCardInstallment(installment: CreditCardInstallment, ledgerId?: string): Promise<CreditCardInstallment> {
  if (!supabase) return installment;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("請先登入再新增分期");
  const userId = sessionData.session.user.id;
  const { data, error } = await supabase
    .from("credit_card_installments")
    .insert({
      user_id: userId,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
      credit_card_id: installment.creditCardId,
      transaction_id: installment.transactionId || null,
      merchant: installment.merchant || null,
      total_amount_cents: installment.totalAmountCents,
      annual_rate: installment.annualRate,
      periods: installment.periods,
      paid_periods: installment.paidPeriods,
      monthly_payment_cents: installment.monthlyPaymentCents,
      paid_amount_cents: installment.paidAmountCents,
      remaining_amount_cents: installment.remainingAmountCents,
      metadata: {
        ...(installment.metadata ?? {}),
        installment_type: installment.installmentType,
        included_in_card_balance: installment.includedInCardBalance
      },
      started_on: installment.startedOn,
      next_due_date: installment.nextDueDate || null,
      status: installment.status,
      note: installment.note || null
    })
    .select("id,user_id,credit_card_id,transaction_id,merchant,total_amount_cents,annual_rate,periods,paid_periods,monthly_payment_cents,paid_amount_cents,remaining_amount_cents,started_on,next_due_date,status,note,metadata,created_at,updated_at")
    .single();
  if (error) throw new Error("信用卡分期儲存失敗");
  return mapCreditCardInstallment(data);
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

function mapCreditCardInstallment(row: Record<string, unknown>): CreditCardInstallment {
  const totalAmountCents = toNumber(row.total_amount_cents);
  const paidAmountCents = toNumber(row.paid_amount_cents);
  const remainingAmountCents = toNumber(row.remaining_amount_cents) || Math.max(0, totalAmountCents - paidAmountCents);
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  return {
    id: String(row.id),
    userId: String(row.user_id),
    creditCardId: String(row.credit_card_id),
    transactionId: nullableString(row.transaction_id),
    merchant: nullableString(row.merchant),
    installmentType: metadata.installment_type === "statement" ? "statement" : "single_purchase",
    includedInCardBalance: metadata.included_in_card_balance === true,
    totalAmountCents,
    annualRate: Number(row.annual_rate ?? 0),
    periods: toNumber(row.periods),
    paidPeriods: toNumber(row.paid_periods),
    monthlyPaymentCents: toNumber(row.monthly_payment_cents),
    paidAmountCents,
    remainingAmountCents,
    startedOn: String(row.started_on),
    nextDueDate: nullableString(row.next_due_date),
    status: String(row.status ?? "active") as CreditCardInstallment["status"],
    note: nullableString(row.note),
    metadata,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapLoan(row: Record<string, unknown>): Loan {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
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
    paidAmountCents: toNumber(metadata.paid_amount_cents),
    monthlyPaymentDay: toNumber(row.monthly_payment_day),
    startDate: String(row.start_date),
    expectedPayoffDate: nullableString(row.expected_payoff_date),
    repaymentMethod: String(row.repayment_method) as Loan["repaymentMethod"],
    paymentPerPeriodCents: toNumber(row.payment_per_period_cents),
    prepaymentPenaltyNote: nullableString(row.prepayment_penalty_note),
    note: nullableString(row.note),
    metadata,
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

function mapInsurancePolicy(row: Record<string, unknown>): InsurancePolicy {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    type: String(row.policy_type) as InsurancePolicy["type"],
    insurer: String(row.insurer),
    policyNumberLast4: nullableString(row.policy_number_last4),
    insuredPerson: nullableString(row.insured_person),
    annualPremiumCents: toNumber(row.annual_premium_cents),
    coverageAmountCents: toNumber(row.coverage_amount_cents),
    paidClaimAmountCents: toNumber(row.paid_claim_amount_cents),
    pendingClaimAmountCents: toNumber(row.pending_claim_amount_cents),
    paymentDay: toNumber(row.payment_day),
    renewalDate: String(row.renewal_date),
    beneficiary: nullableString(row.beneficiary),
    note: nullableString(row.note),
    status: String(row.status) as InsurancePolicy["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapInvestmentCategory(row: Record<string, unknown>): InvestmentCategory {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    kind: String(row.kind) as InvestmentCategory["kind"],
    market: String(row.market) as InvestmentCategory["market"],
    targetAllocation: Number(row.target_allocation ?? 0),
    risk: String(row.risk) as InvestmentCategory["risk"],
    note: nullableString(row.note),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapInvestmentAsset(row: Record<string, unknown>): InvestmentAsset {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    categoryId: nullableString(row.category_id),
    assetType: String(row.asset_type) as InvestmentAsset["assetType"],
    symbol: String(row.symbol),
    name: String(row.name),
    quantity: Number(row.quantity ?? 0),
    quoteCurrency: String(row.quote_currency) as InvestmentAsset["quoteCurrency"],
    averageUnitCost: Number(row.average_unit_cost ?? 0),
    currentUnitPrice: Number(row.current_unit_price ?? 0),
    exchangeRateToLedger: Number(row.exchange_rate_to_ledger ?? 1),
    platform: nullableString(row.platform),
    acquiredDate: nullableString(row.acquired_date),
    note: nullableString(row.note),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapFinancialPlan(row: Record<string, unknown>): FinancialPlan {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    goalType: String(row.goal_type) as FinancialPlan["goalType"],
    horizon: String(row.horizon) as FinancialPlan["horizon"],
    targetAmountCents: toNumber(row.target_amount_cents),
    currentAmountCents: toNumber(row.current_amount_cents),
    monthlyContributionCents: toNumber(row.monthly_contribution_cents),
    targetDate: String(row.target_date),
    expectedAnnualReturn: Number(row.expected_annual_return ?? 0),
    riskProfile: String(row.risk_profile) as FinancialPlan["riskProfile"],
    priority: toNumber(row.priority),
    note: nullableString(row.note),
    status: String(row.status) as FinancialPlan["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapRecurringIncome(row: Record<string, unknown>): RecurringIncome {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const incomeType = String(metadata.income_type ?? "salary");
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    incomeType: ["salary", "bonus", "rental", "pension", "side_business", "other"].includes(incomeType)
      ? incomeType as RecurringIncome["incomeType"]
      : "other",
    payer: nullableString(metadata.payer),
    amountCents: toNumber(row.amount_cents),
    frequency: String(row.frequency ?? "monthly") as RecurringIncome["frequency"],
    dayOfMonth: row.day_of_month == null ? undefined : toNumber(row.day_of_month),
    accountId: nullableString(row.account_id),
    startDate: String(metadata.start_date ?? row.next_run_date),
    endDate: nullableString(row.end_date),
    annualGrowthRate: Number(metadata.annual_growth_rate ?? 0),
    note: nullableString(metadata.note),
    isActive: Boolean(row.is_active),
    metadata,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function recurringIncomeMetadata(income: RecurringIncome): Record<string, unknown> {
  return {
    ...(income.metadata ?? {}),
    income_type: income.incomeType,
    payer: income.payer || null,
    start_date: income.startDate,
    annual_growth_rate: income.annualGrowthRate,
    note: income.note || null
  };
}

function mapNotificationPreference(row: Record<string, unknown>): NotificationPreference {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: String(row.notification_type) as NotificationPreference["type"],
    isEnabled: Boolean(row.is_enabled),
    remindDaysBefore: toNumber(row.remind_days_before),
    deliveryMode: String(row.delivery_mode) as NotificationPreference["deliveryMode"],
    repeatHours: toNumber(row.repeat_hours),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapLedgerBook(row: Record<string, unknown>): LedgerBook {
  return {
    id: String(row.id),
    userId: String(row.owner_user_id),
    ownerUserId: String(row.owner_user_id),
    name: String(row.name),
    purpose: String(row.purpose) as LedgerBook["purpose"],
    color: String(row.color) as LedgerBook["color"],
    currency: String(row.base_currency || "TWD") as LedgerBook["currency"],
    note: nullableString(row.note),
    isDefault: Boolean(row.is_default),
    isShared: Boolean(row.is_shared),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapLedgerInvitation(row: Record<string, unknown>): LedgerInvitation {
  return {
    id: String(row.id),
    userId: "",
    ledgerId: String(row.ledger_id),
    inviteeEmail: nullableString(row.invitee_email),
    inviteeMemberCode: nullableString(row.invitee_member_code),
    role: String(row.role) as LedgerInvitation["role"],
    status: String(row.status) as LedgerInvitation["status"],
    expiresAt: String(row.expires_at),
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
