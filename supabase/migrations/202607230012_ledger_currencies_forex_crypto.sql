alter table public.ledger_books
  add column if not exists base_currency text not null default 'TWD';

alter table public.ledger_books
  drop constraint if exists ledger_books_base_currency_check;
alter table public.ledger_books
  add constraint ledger_books_base_currency_check
  check (base_currency in ('TWD','USD','JPY','EUR','GBP','CNY','HKD','SGD'));

alter table public.investment_categories
  drop constraint if exists investment_categories_kind_check;
alter table public.investment_categories
  add constraint investment_categories_kind_check
  check (kind in ('tw_stock','us_stock','etf','mutual_fund','bond_fund','money_market','forex','crypto','other'));

alter table public.investment_categories
  drop constraint if exists investment_categories_market_check;
alter table public.investment_categories
  add constraint investment_categories_market_check
  check (market in ('TW','US','GLOBAL','FX','CRYPTO'));

create table if not exists public.investment_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_id uuid not null references public.ledger_books(id) on delete cascade,
  category_id uuid references public.investment_categories(id) on delete set null,
  asset_type text not null,
  symbol text not null,
  name text not null,
  quantity numeric(28,10) not null default 0,
  quote_currency text not null default 'TWD',
  average_unit_cost numeric(24,8) not null default 0,
  current_unit_price numeric(24,8) not null default 0,
  exchange_rate_to_ledger numeric(24,10) not null default 1,
  platform text,
  acquired_date date,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint investment_assets_type_check check (asset_type in ('forex','crypto')),
  constraint investment_assets_symbol_check check (char_length(trim(symbol)) between 1 and 20),
  constraint investment_assets_name_check check (char_length(trim(name)) between 1 and 100),
  constraint investment_assets_quantity_check check (quantity >= 0 and quantity <= 1000000000000000),
  constraint investment_assets_quote_currency_check check (quote_currency in ('TWD','USD','JPY','EUR','GBP','CNY','HKD','SGD','USDT')),
  constraint investment_assets_average_cost_check check (average_unit_cost >= 0),
  constraint investment_assets_current_price_check check (current_unit_price >= 0),
  constraint investment_assets_exchange_rate_check check (exchange_rate_to_ledger > 0 and exchange_rate_to_ledger <= 1000000)
);

create index if not exists investment_assets_ledger_active_idx
  on public.investment_assets(ledger_id, asset_type, created_at desc)
  where deleted_at is null and is_active;

alter table public.investment_assets enable row level security;

drop policy if exists investment_assets_select_ledger_member on public.investment_assets;
drop policy if exists investment_assets_insert_ledger_writer on public.investment_assets;
drop policy if exists investment_assets_update_ledger_writer on public.investment_assets;
drop policy if exists investment_assets_delete_ledger_writer on public.investment_assets;

create policy investment_assets_select_ledger_member on public.investment_assets
  for select using (public.can_read_ledger(ledger_id));
create policy investment_assets_insert_ledger_writer on public.investment_assets
  for insert with check (auth.uid() = user_id and public.can_write_ledger(ledger_id));
create policy investment_assets_update_ledger_writer on public.investment_assets
  for update using (public.can_write_ledger(ledger_id))
  with check (public.can_write_ledger(ledger_id));
create policy investment_assets_delete_ledger_writer on public.investment_assets
  for delete using (public.can_write_ledger(ledger_id));

drop trigger if exists set_investment_assets_updated_at on public.investment_assets;
create trigger set_investment_assets_updated_at
before update on public.investment_assets
for each row execute function public.set_updated_at();

drop trigger if exists prevent_investment_assets_ledger_move on public.investment_assets;
create trigger prevent_investment_assets_ledger_move
before update on public.investment_assets
for each row execute function public.prevent_finance_ledger_move();

create or replace function public.validate_investment_asset_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category_id is not null and not exists (
    select 1
    from public.investment_categories
    where id = new.category_id
      and ledger_id = new.ledger_id
      and deleted_at is null
  ) then
    raise exception 'investment category must belong to the same ledger';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_investment_asset_category on public.investment_assets;
create trigger validate_investment_asset_category
before insert or update on public.investment_assets
for each row execute function public.validate_investment_asset_category();

create table if not exists public.ledger_currency_conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_id uuid not null references public.ledger_books(id) on delete cascade,
  from_currency text not null,
  to_currency text not null,
  conversion_rate numeric(24,10) not null,
  created_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint ledger_currency_conversions_currency_check check (
    from_currency in ('TWD','USD','JPY','EUR','GBP','CNY','HKD','SGD')
    and to_currency in ('TWD','USD','JPY','EUR','GBP','CNY','HKD','SGD')
  ),
  constraint ledger_currency_conversions_rate_check check (conversion_rate > 0 and conversion_rate <= 1000000)
);

create index if not exists ledger_currency_conversions_ledger_idx
  on public.ledger_currency_conversions(ledger_id, created_at desc);

alter table public.ledger_currency_conversions enable row level security;
drop policy if exists ledger_currency_conversions_select_ledger_member on public.ledger_currency_conversions;
create policy ledger_currency_conversions_select_ledger_member on public.ledger_currency_conversions
  for select using (public.can_read_ledger(ledger_id));

create or replace function public.prevent_direct_ledger_currency_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.base_currency is distinct from old.base_currency
     and coalesce(current_setting('app.ledger_currency_conversion', true), '') <> 'on' then
    raise exception 'ledger currency must be changed through conversion';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_direct_ledger_currency_change on public.ledger_books;
create trigger prevent_direct_ledger_currency_change
before update on public.ledger_books
for each row execute function public.prevent_direct_ledger_currency_change();

create or replace function public.convert_ledger_currency(
  p_ledger_id uuid,
  p_to_currency text,
  p_conversion_rate numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_currency text;
  target record;
  allowed_tables text[] := array[
    'financial_accounts','transactions','loans','loan_payment_schedules','loan_payments',
    'credit_cards','credit_card_installments','credit_card_payments','deposits','budgets',
    'financial_reminders','monthly_financial_summaries','net_worth_snapshots',
    'insurance_policies','financial_plans'
  ];
begin
  if not public.can_admin_ledger(p_ledger_id) then
    raise exception 'ledger admin permission required';
  end if;
  if p_to_currency not in ('TWD','USD','JPY','EUR','GBP','CNY','HKD','SGD') then
    raise exception 'unsupported currency';
  end if;
  if p_conversion_rate is null or p_conversion_rate <= 0 or p_conversion_rate > 1000000 then
    raise exception 'invalid conversion rate';
  end if;

  select base_currency into current_currency
  from public.ledger_books
  where id = p_ledger_id and deleted_at is null
  for update;

  if current_currency is null then
    raise exception 'ledger not found';
  end if;
  if current_currency = p_to_currency then
    return;
  end if;

  for target in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = any(allowed_tables)
      and column_name like '%\_cents' escape '\'
  loop
    execute format(
      'update public.%I set %I = round(%I * $1)::bigint where ledger_id = $2',
      target.table_name,
      target.column_name,
      target.column_name
    ) using p_conversion_rate, p_ledger_id;
  end loop;

  update public.investment_assets
  set average_unit_cost = case
        when quote_currency = current_currency then average_unit_cost * p_conversion_rate
        else average_unit_cost
      end,
      current_unit_price = case
        when quote_currency = current_currency then current_unit_price * p_conversion_rate
        else current_unit_price
      end,
      exchange_rate_to_ledger = case
        when quote_currency = current_currency then exchange_rate_to_ledger
        else exchange_rate_to_ledger * p_conversion_rate
      end,
      quote_currency = case
        when quote_currency = current_currency then p_to_currency
        else quote_currency
      end
  where ledger_id = p_ledger_id
    and deleted_at is null;

  perform set_config('app.ledger_currency_conversion', 'on', true);
  update public.ledger_books
  set base_currency = p_to_currency
  where id = p_ledger_id;

  insert into public.ledger_currency_conversions (
    user_id, ledger_id, from_currency, to_currency, conversion_rate
  ) values (
    auth.uid(), p_ledger_id, current_currency, p_to_currency, p_conversion_rate
  );
end;
$$;

revoke all on function public.convert_ledger_currency(uuid, text, numeric) from public;
revoke all on function public.convert_ledger_currency(uuid, text, numeric) from anon;
grant execute on function public.convert_ledger_currency(uuid, text, numeric) to authenticated;
