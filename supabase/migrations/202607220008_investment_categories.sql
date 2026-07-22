create table if not exists public.investment_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_id uuid references public.ledger_books(id) on delete cascade,
  name text not null,
  kind text not null,
  market text not null,
  target_allocation numeric(5,2) not null default 0,
  risk text not null,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint investment_categories_name_check check (char_length(trim(name)) between 1 and 100),
  constraint investment_categories_kind_check check (kind in ('tw_stock','us_stock','etf','mutual_fund','bond_fund','money_market','other')),
  constraint investment_categories_market_check check (market in ('TW','US','GLOBAL')),
  constraint investment_categories_allocation_check check (target_allocation between 0 and 100),
  constraint investment_categories_risk_check check (risk in ('low','medium','high'))
);

create index if not exists investment_categories_ledger_active_idx
  on public.investment_categories(ledger_id, created_at desc)
  where deleted_at is null and is_active;

alter table public.investment_categories enable row level security;

drop policy if exists investment_categories_select_ledger_member on public.investment_categories;
drop policy if exists investment_categories_insert_ledger_writer on public.investment_categories;
drop policy if exists investment_categories_update_ledger_writer on public.investment_categories;
drop policy if exists investment_categories_delete_ledger_writer on public.investment_categories;

create policy investment_categories_select_ledger_member on public.investment_categories
  for select using (public.can_read_ledger(ledger_id));

create policy investment_categories_insert_ledger_writer on public.investment_categories
  for insert with check (auth.uid() = user_id and public.can_write_ledger(ledger_id));

create policy investment_categories_update_ledger_writer on public.investment_categories
  for update using (public.can_write_ledger(ledger_id))
  with check (public.can_write_ledger(ledger_id));

create policy investment_categories_delete_ledger_writer on public.investment_categories
  for delete using (public.can_write_ledger(ledger_id));

drop trigger if exists set_investment_categories_updated_at on public.investment_categories;
create trigger set_investment_categories_updated_at
before update on public.investment_categories
for each row execute function public.set_updated_at();

drop trigger if exists prevent_investment_categories_ledger_move on public.investment_categories;
create trigger prevent_investment_categories_ledger_move
before update on public.investment_categories
for each row execute function public.prevent_finance_ledger_move();
