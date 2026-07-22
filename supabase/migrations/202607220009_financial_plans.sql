create table if not exists public.financial_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_id uuid references public.ledger_books(id) on delete cascade,
  name text not null,
  goal_type text not null,
  horizon text not null,
  target_amount_cents bigint not null,
  current_amount_cents bigint not null default 0,
  monthly_contribution_cents bigint not null default 0,
  target_date date not null,
  expected_annual_return numeric(9,6) not null default 0,
  risk_profile text not null default 'balanced',
  priority smallint not null default 3,
  note text,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint financial_plans_name_check check (char_length(trim(name)) between 1 and 100),
  constraint financial_plans_amount_check check (target_amount_cents > 0 and current_amount_cents >= 0 and monthly_contribution_cents >= 0),
  constraint financial_plans_goal_type_check check (goal_type in ('emergency_fund','debt_repayment','major_purchase','education','home','retirement','investment','custom')),
  constraint financial_plans_horizon_check check (horizon in ('short','medium','long')),
  constraint financial_plans_return_check check (expected_annual_return between 0 and 1),
  constraint financial_plans_risk_check check (risk_profile in ('conservative','balanced','growth')),
  constraint financial_plans_priority_check check (priority between 1 and 5),
  constraint financial_plans_status_check check (status in ('active','paused','completed'))
);

create index if not exists financial_plans_ledger_status_target_idx
  on public.financial_plans(ledger_id, status, target_date)
  where deleted_at is null;

alter table public.financial_plans enable row level security;

drop policy if exists financial_plans_select_ledger_member on public.financial_plans;
drop policy if exists financial_plans_insert_ledger_writer on public.financial_plans;
drop policy if exists financial_plans_update_ledger_writer on public.financial_plans;
drop policy if exists financial_plans_delete_ledger_writer on public.financial_plans;

create policy financial_plans_select_ledger_member on public.financial_plans
  for select using (public.can_read_ledger(ledger_id));

create policy financial_plans_insert_ledger_writer on public.financial_plans
  for insert with check (auth.uid() = user_id and public.can_write_ledger(ledger_id));

create policy financial_plans_update_ledger_writer on public.financial_plans
  for update using (public.can_write_ledger(ledger_id))
  with check (public.can_write_ledger(ledger_id));

create policy financial_plans_delete_ledger_writer on public.financial_plans
  for delete using (public.can_write_ledger(ledger_id));

drop trigger if exists set_financial_plans_updated_at on public.financial_plans;
create trigger set_financial_plans_updated_at
before update on public.financial_plans
for each row execute function public.set_updated_at();

drop trigger if exists prevent_financial_plans_ledger_move on public.financial_plans;
create trigger prevent_financial_plans_ledger_move
before update on public.financial_plans
for each row execute function public.prevent_finance_ledger_move();
