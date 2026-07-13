create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'zh-Hant-TW',
  currency text not null default 'TWD',
  timezone text not null default 'Asia/Taipei',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint profiles_currency_check check (currency = 'TWD')
);

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  account_type text not null,
  institution text,
  balance_cents bigint not null default 0,
  include_in_available_cash boolean not null default true,
  include_in_emergency_fund boolean not null default true,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint financial_accounts_type_check check (account_type in ('cash','checking','digital','savings','time_deposit','e_wallet','other_asset')),
  constraint financial_accounts_balance_check check (balance_cents >= 0),
  constraint financial_accounts_name_unique unique (user_id, name)
);

create table if not exists public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.transaction_categories(id) on delete set null,
  transaction_type text not null,
  is_necessary_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint transaction_categories_type_check check (transaction_type in ('income','expense')),
  constraint transaction_categories_name_unique unique (user_id, name, transaction_type)
);

create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  issuer text not null,
  last4 text not null,
  credit_limit_cents bigint not null default 0,
  statement_day smallint not null,
  payment_due_day smallint not null,
  unbilled_amount_cents bigint not null default 0,
  current_statement_amount_cents bigint not null default 0,
  minimum_payment_cents bigint not null default 0,
  installment_balance_cents bigint not null default 0,
  auto_pay_account_id uuid references public.financial_accounts(id) on delete set null,
  annual_fee_cents bigint not null default 0,
  annual_fee_waiver text,
  recommended_utilization_rate numeric(5,4) not null default 0.3,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint credit_cards_last4_check check (last4 ~ '^[0-9]{4}$'),
  constraint credit_cards_day_check check (statement_day between 1 and 31 and payment_due_day between 1 and 31),
  constraint credit_cards_amount_check check (
    credit_limit_cents >= 0 and unbilled_amount_cents >= 0 and current_statement_amount_cents >= 0 and
    minimum_payment_cents >= 0 and installment_balance_cents >= 0 and annual_fee_cents >= 0
  ),
  constraint credit_cards_utilization_check check (recommended_utilization_rate >= 0 and recommended_utilization_rate <= 1),
  constraint credit_cards_unique unique (user_id, issuer, last4)
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  loan_type text not null,
  institution text,
  original_principal_cents bigint not null,
  remaining_principal_cents bigint not null,
  annual_rate numeric(9,6) not null,
  term_months integer not null,
  paid_periods integer not null default 0,
  monthly_payment_day smallint not null,
  start_date date not null,
  expected_payoff_date date,
  repayment_method text not null,
  payment_per_period_cents bigint not null,
  prepayment_penalty_note text,
  note text,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint loans_type_check check (loan_type in ('personal','mortgage','auto','motorcycle','student','family','other')),
  constraint loans_method_check check (repayment_method in ('equal_payment','equal_principal','fixed_payment','manual')),
  constraint loans_status_check check (status in ('active','paid_off','paused','defaulted')),
  constraint loans_day_check check (monthly_payment_day between 1 and 31),
  constraint loans_amount_check check (
    original_principal_cents > 0 and remaining_principal_cents >= 0 and payment_per_period_cents >= 0
  ),
  constraint loans_rate_check check (annual_rate >= 0 and annual_rate <= 1),
  constraint loans_term_check check (term_months > 0 and paid_periods >= 0 and paid_periods <= term_months)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_date date not null,
  transaction_type text not null,
  amount_cents bigint not null,
  category_id uuid references public.transaction_categories(id) on delete set null,
  category_name text,
  subcategory_name text,
  account_id uuid references public.financial_accounts(id) on delete restrict,
  transfer_account_id uuid references public.financial_accounts(id) on delete restrict,
  credit_card_id uuid references public.credit_cards(id) on delete set null,
  loan_id uuid references public.loans(id) on delete set null,
  merchant text,
  note text,
  is_necessary boolean not null default false,
  is_recurring boolean not null default false,
  tags text[] not null default '{}',
  source text not null default 'manual',
  import_fingerprint text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint transactions_type_check check (transaction_type in ('income','expense','transfer','credit_card_purchase','credit_card_payment','loan_payment','deposit_transfer')),
  constraint transactions_amount_check check (amount_cents > 0),
  constraint transactions_source_check check (source in ('manual','csv','recurring','system')),
  constraint transactions_transfer_check check (
    (transaction_type <> 'transfer') or (account_id is not null and transfer_account_id is not null and account_id <> transfer_account_id)
  ),
  constraint transactions_credit_card_check check (
    (transaction_type not in ('credit_card_purchase','credit_card_payment')) or credit_card_id is not null
  ),
  constraint transactions_import_unique unique (user_id, import_fingerprint)
);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  transaction_type text not null,
  amount_cents bigint not null,
  category_id uuid references public.transaction_categories(id) on delete set null,
  account_id uuid references public.financial_accounts(id) on delete set null,
  frequency text not null,
  day_of_month smallint,
  next_run_date date not null,
  end_date date,
  is_necessary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint recurring_transactions_amount_check check (amount_cents > 0),
  constraint recurring_transactions_frequency_check check (frequency in ('weekly','monthly','quarterly','yearly')),
  constraint recurring_transactions_type_check check (transaction_type in ('income','expense','transfer','credit_card_purchase','loan_payment','deposit_transfer')),
  constraint recurring_transactions_date_check check (end_date is null or end_date >= next_run_date)
);

create table if not exists public.loan_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_id uuid not null references public.loans(id) on delete cascade,
  period_number integer not null,
  due_date date not null,
  payment_cents bigint not null,
  principal_cents bigint not null,
  interest_cents bigint not null,
  remaining_principal_cents bigint not null,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint loan_payment_schedules_amount_check check (
    payment_cents >= 0 and principal_cents >= 0 and interest_cents >= 0 and remaining_principal_cents >= 0
  ),
  constraint loan_payment_schedules_status_check check (status in ('pending','paid','skipped','adjusted')),
  constraint loan_payment_schedules_unique unique (loan_id, period_number)
);

create table if not exists public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_id uuid not null references public.loans(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  paid_date date not null,
  payment_cents bigint not null,
  principal_cents bigint not null,
  interest_cents bigint not null,
  extra_principal_cents bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint loan_payments_amount_check check (
    payment_cents > 0 and principal_cents >= 0 and interest_cents >= 0 and extra_principal_cents >= 0
  )
);

create table if not exists public.credit_card_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  merchant text,
  total_amount_cents bigint not null,
  periods integer not null,
  paid_periods integer not null default 0,
  started_on date not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint credit_card_installments_amount_check check (total_amount_cents > 0),
  constraint credit_card_installments_period_check check (periods > 0 and paid_periods >= 0 and paid_periods <= periods)
);

create table if not exists public.credit_card_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards(id) on delete cascade,
  account_id uuid references public.financial_accounts(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  paid_date date not null,
  amount_cents bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint credit_card_payments_amount_check check (amount_cents > 0)
);

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution text,
  principal_cents bigint not null,
  annual_rate numeric(9,6) not null,
  start_date date not null,
  maturity_date date not null,
  term_months integer not null,
  interest_type text not null,
  interest_payout text not null,
  auto_renew boolean not null default false,
  maturity_instruction text not null default 'transfer_out',
  estimated_interest_cents bigint not null default 0,
  estimated_maturity_amount_cents bigint not null default 0,
  include_in_available_cash boolean not null default false,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint deposits_amount_check check (principal_cents > 0 and estimated_interest_cents >= 0 and estimated_maturity_amount_cents >= 0),
  constraint deposits_rate_check check (annual_rate >= 0 and annual_rate <= 1),
  constraint deposits_term_check check (term_months > 0 and maturity_date >= start_date),
  constraint deposits_interest_type_check check (interest_type in ('simple','compound')),
  constraint deposits_payout_check check (interest_payout in ('monthly','maturity','annually')),
  constraint deposits_maturity_instruction_check check (maturity_instruction in ('renew_all','renew_principal','transfer_out'))
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_month date not null,
  total_budget_cents bigint not null default 0,
  category_id uuid references public.transaction_categories(id) on delete set null,
  budget_cents bigint not null,
  thresholds numeric[] not null default array[0.5,0.8,1.0],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint budgets_amount_check check (total_budget_cents >= 0 and budget_cents >= 0),
  constraint budgets_unique unique (user_id, budget_month, category_id)
);

create table if not exists public.financial_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount_cents bigint not null,
  frequency text not null,
  debit_day smallint not null,
  account_id uuid references public.financial_accounts(id) on delete set null,
  remind_days_before integer not null default 3,
  auto_create_transaction boolean not null default false,
  is_necessary boolean not null default true,
  start_date date not null,
  end_date date,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint financial_reminders_amount_check check (amount_cents >= 0),
  constraint financial_reminders_frequency_check check (frequency in ('weekly','monthly','quarterly','yearly')),
  constraint financial_reminders_day_check check (debit_day between 1 and 31),
  constraint financial_reminders_status_check check (status in ('pending','upcoming','due_today','overdue','done')),
  constraint financial_reminders_date_check check (end_date is null or end_date >= start_date)
);

create table if not exists public.monthly_financial_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary_month date not null,
  income_cents bigint not null default 0,
  expense_cents bigint not null default 0,
  necessary_expense_cents bigint not null default 0,
  fixed_expense_cents bigint not null default 0,
  credit_card_due_cents bigint not null default 0,
  loan_due_cents bigint not null default 0,
  category_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint monthly_financial_summaries_amount_check check (
    income_cents >= 0 and expense_cents >= 0 and necessary_expense_cents >= 0 and fixed_expense_cents >= 0
  ),
  constraint monthly_financial_summaries_unique unique (user_id, summary_month)
);

create table if not exists public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  total_assets_cents bigint not null default 0,
  total_liabilities_cents bigint not null default 0,
  net_worth_cents bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint net_worth_snapshots_unique unique (user_id, snapshot_date)
);

create table if not exists public.ai_financial_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null default 'financial_health',
  summary_hash text not null,
  input_summary jsonb not null,
  response jsonb not null,
  model text not null,
  generated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '1 day',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint ai_financial_reports_unique unique (user_id, report_type, summary_hash)
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.ai_financial_reports(id) on delete set null,
  feature text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cached boolean not null default false,
  status text not null,
  error_code text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint ai_usage_logs_status_check check (status in ('success','cached','error','rate_limited','disabled'))
);

create index if not exists financial_accounts_user_active_idx on public.financial_accounts (user_id, is_active) where deleted_at is null;
create index if not exists transaction_categories_user_idx on public.transaction_categories (user_id, transaction_type, is_active) where deleted_at is null;
create index if not exists transactions_user_date_idx on public.transactions (user_id, transaction_date desc) where deleted_at is null;
create index if not exists transactions_account_idx on public.transactions (account_id) where deleted_at is null;
create index if not exists recurring_transactions_next_run_idx on public.recurring_transactions (user_id, next_run_date, is_active) where deleted_at is null;
create index if not exists loans_user_status_idx on public.loans (user_id, status) where deleted_at is null;
create index if not exists loan_payment_schedules_due_idx on public.loan_payment_schedules (user_id, due_date, status);
create index if not exists credit_cards_user_active_idx on public.credit_cards (user_id, is_active) where deleted_at is null;
create index if not exists deposits_user_maturity_idx on public.deposits (user_id, maturity_date, is_active) where deleted_at is null;
create index if not exists budgets_user_month_idx on public.budgets (user_id, budget_month) where deleted_at is null;
create index if not exists financial_reminders_due_idx on public.financial_reminders (user_id, start_date, status) where deleted_at is null;
create index if not exists monthly_financial_summaries_user_month_idx on public.monthly_financial_summaries (user_id, summary_month);
create index if not exists net_worth_snapshots_user_date_idx on public.net_worth_snapshots (user_id, snapshot_date);
create index if not exists ai_reports_cache_idx on public.ai_financial_reports (user_id, report_type, summary_hash, expires_at);
create index if not exists ai_usage_user_created_idx on public.ai_usage_logs (user_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','financial_accounts','transaction_categories','transactions','recurring_transactions','loans',
    'loan_payment_schedules','loan_payments','credit_cards','credit_card_installments','credit_card_payments',
    'deposits','budgets','financial_reminders','monthly_financial_summaries','net_worth_snapshots',
    'ai_financial_reports','ai_usage_logs'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end;
$$;

create or replace function public.current_user_ai_calls_last_hour()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.ai_usage_logs
  where user_id = auth.uid()
    and created_at >= timezone('utc', now()) - interval '1 hour'
    and status in ('success','cached');
$$;

create or replace function public.get_monthly_summary(target_month date)
returns table (
  income_cents bigint,
  expense_cents bigint,
  necessary_expense_cents bigint,
  fixed_expense_cents bigint
)
language sql
security invoker
as $$
  select
    coalesce(sum(amount_cents) filter (where transaction_type = 'income'), 0)::bigint as income_cents,
    coalesce(sum(amount_cents) filter (where transaction_type in ('expense','credit_card_purchase')), 0)::bigint as expense_cents,
    coalesce(sum(amount_cents) filter (where transaction_type in ('expense','credit_card_purchase') and is_necessary), 0)::bigint as necessary_expense_cents,
    coalesce(sum(amount_cents) filter (where transaction_type in ('expense','credit_card_purchase') and is_recurring), 0)::bigint as fixed_expense_cents
  from public.transactions
  where user_id = auth.uid()
    and deleted_at is null
    and transaction_date >= date_trunc('month', target_month)
    and transaction_date < date_trunc('month', target_month) + interval '1 month';
$$;

alter table public.profiles enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.transaction_categories enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.loans enable row level security;
alter table public.loan_payment_schedules enable row level security;
alter table public.loan_payments enable row level security;
alter table public.credit_cards enable row level security;
alter table public.credit_card_installments enable row level security;
alter table public.credit_card_payments enable row level security;
alter table public.deposits enable row level security;
alter table public.budgets enable row level security;
alter table public.financial_reminders enable row level security;
alter table public.monthly_financial_summaries enable row level security;
alter table public.net_worth_snapshots enable row level security;
alter table public.ai_financial_reports enable row level security;
alter table public.ai_usage_logs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'financial_accounts','transaction_categories','transactions','recurring_transactions','loans',
    'loan_payment_schedules','loan_payments','credit_cards','credit_card_installments','credit_card_payments',
    'deposits','budgets','financial_reminders','monthly_financial_summaries','net_worth_snapshots',
    'ai_financial_reports','ai_usage_logs'
  ]
  loop
    execute format('drop policy if exists "%I_select_own" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%I_insert_own" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%I_update_own" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%I_delete_own" on public.%I', table_name, table_name);
    execute format('create policy "%I_select_own" on public.%I for select using (auth.uid() = user_id)', table_name, table_name);
    execute format('create policy "%I_insert_own" on public.%I for insert with check (auth.uid() = user_id)', table_name, table_name);
    execute format('create policy "%I_update_own" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name, table_name);
    execute format('create policy "%I_delete_own" on public.%I for delete using (auth.uid() = user_id)', table_name, table_name);
  end loop;
end;
$$;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = user_id);
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = user_id and id = auth.uid());
create policy profiles_update_own on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id and id = auth.uid());
