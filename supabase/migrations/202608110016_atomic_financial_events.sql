begin;

alter table public.transactions
  add column if not exists investment_asset_id uuid references public.investment_assets(id) on delete restrict;

alter table public.deposits
  add column if not exists account_id uuid references public.financial_accounts(id) on delete restrict;

alter table public.financial_accounts drop constraint if exists financial_accounts_name_unique;
alter table public.financial_accounts drop constraint if exists financial_accounts_ledger_name_unique;
drop index if exists public.financial_accounts_ledger_name_unique;
alter table public.financial_accounts add constraint financial_accounts_ledger_name_unique
  unique (ledger_id, user_id, name);

alter table public.transaction_categories drop constraint if exists transaction_categories_name_unique;
alter table public.transaction_categories drop constraint if exists transaction_categories_ledger_name_unique;
drop index if exists public.transaction_categories_ledger_name_unique;
alter table public.transaction_categories add constraint transaction_categories_ledger_name_unique
  unique (ledger_id, user_id, name, transaction_type);

alter table public.credit_cards drop constraint if exists credit_cards_unique;
alter table public.credit_cards drop constraint if exists credit_cards_ledger_unique;
drop index if exists public.credit_cards_ledger_unique;
alter table public.credit_cards add constraint credit_cards_ledger_unique
  unique (ledger_id, user_id, issuer, last4);

alter table public.transactions drop constraint if exists transactions_import_unique;
alter table public.transactions drop constraint if exists transactions_ledger_import_unique;
drop index if exists public.transactions_ledger_import_unique;
alter table public.transactions add constraint transactions_ledger_import_unique
  unique (ledger_id, user_id, import_fingerprint);

alter table public.budgets drop constraint if exists budgets_unique;
alter table public.budgets drop constraint if exists budgets_ledger_unique;
drop index if exists public.budgets_ledger_unique;
alter table public.budgets add constraint budgets_ledger_unique
  unique (ledger_id, user_id, budget_month, category_id);

alter table public.monthly_financial_summaries drop constraint if exists monthly_financial_summaries_unique;
alter table public.monthly_financial_summaries drop constraint if exists monthly_financial_summaries_ledger_unique;
drop index if exists public.monthly_financial_summaries_ledger_unique;
alter table public.monthly_financial_summaries add constraint monthly_financial_summaries_ledger_unique
  unique (ledger_id, user_id, summary_month);

alter table public.net_worth_snapshots drop constraint if exists net_worth_snapshots_unique;
alter table public.net_worth_snapshots drop constraint if exists net_worth_snapshots_ledger_unique;
drop index if exists public.net_worth_snapshots_ledger_unique;
alter table public.net_worth_snapshots add constraint net_worth_snapshots_ledger_unique
  unique (ledger_id, user_id, snapshot_date);

alter table public.ai_financial_reports drop constraint if exists ai_financial_reports_unique;
alter table public.ai_financial_reports drop constraint if exists ai_financial_reports_ledger_unique;
drop index if exists public.ai_financial_reports_ledger_unique;
alter table public.ai_financial_reports add constraint ai_financial_reports_ledger_unique
  unique (ledger_id, user_id, report_type, summary_hash);

create index if not exists transactions_investment_asset_idx
  on public.transactions(ledger_id, investment_asset_id, transaction_date desc)
  where deleted_at is null and investment_asset_id is not null;

create unique index if not exists deposits_active_account_unique
  on public.deposits(account_id)
  where deleted_at is null and is_active and account_id is not null;

create or replace function public.validate_deposit_account_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_row public.financial_accounts%rowtype;
begin
  if new.account_id is null then return new; end if;

  select * into account_row
  from public.financial_accounts
  where id = new.account_id and deleted_at is null and is_active;
  if not found then raise exception 'linked deposit account is unavailable'; end if;
  if account_row.ledger_id <> new.ledger_id then
    raise exception 'linked deposit account must belong to the same ledger';
  end if;
  if account_row.account_type not in ('time_deposit','savings') then
    raise exception 'linked account must be a savings or time deposit account';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_deposit_account_link on public.deposits;
create trigger validate_deposit_account_link
before insert or update of account_id, user_id, ledger_id on public.deposits
for each row execute function public.validate_deposit_account_link();

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (
  transaction_type in (
    'income','expense','transfer','credit_card_purchase','credit_card_payment','loan_payment',
    'deposit_transfer','investment_buy','investment_sell'
  )
);

alter table public.transactions drop constraint if exists transactions_transfer_check;
alter table public.transactions add constraint transactions_transfer_check check (
  transaction_type not in ('transfer','deposit_transfer')
  or (account_id is not null and transfer_account_id is not null and account_id <> transfer_account_id)
);

alter table public.transactions drop constraint if exists transactions_loan_check;
alter table public.transactions add constraint transactions_loan_check check (
  transaction_type <> 'loan_payment' or (loan_id is not null and account_id is not null)
);

alter table public.transactions drop constraint if exists transactions_investment_check;
alter table public.transactions add constraint transactions_investment_check check (
  transaction_type not in ('investment_buy','investment_sell')
  or (investment_asset_id is not null and account_id is not null)
);

alter table public.investment_assets drop constraint if exists investment_assets_type_check;
alter table public.investment_assets add constraint investment_assets_type_check check (
  asset_type in ('stock','etf','fund','bond','forex','crypto')
);

create unique index if not exists credit_card_payments_transaction_unique
  on public.credit_card_payments(transaction_id)
  where transaction_id is not null and deleted_at is null;

create unique index if not exists loan_payments_transaction_unique
  on public.loan_payments(transaction_id)
  where transaction_id is not null and deleted_at is null;

create or replace function public.prevent_nonzero_account_removal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.deleted_at is null and new.deleted_at is not null) or (old.is_active and not new.is_active) then
    if new.balance_cents <> 0 then raise exception 'account balance must be zero before removal'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_unsettled_card_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.deleted_at is null and new.deleted_at is not null) or (old.is_active and not new.is_active) then
    if new.current_statement_amount_cents <> 0 or new.unbilled_amount_cents <> 0 or new.installment_balance_cents <> 0
      or exists (
        select 1 from public.credit_card_installments
        where credit_card_id = old.id and deleted_at is null and status = 'active' and remaining_amount_cents > 0
      )
    then
      raise exception 'credit card balance and installments must be settled before removal';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_unsettled_loan_removal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if ((old.deleted_at is null and new.deleted_at is not null) or (old.status <> 'paid_off' and new.status = 'paid_off'))
    and new.remaining_principal_cents <> 0
  then
    raise exception 'loan principal must be zero before settlement or removal';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_nonzero_investment_removal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if ((old.deleted_at is null and new.deleted_at is not null) or (old.is_active and not new.is_active)) and new.quantity <> 0 then
    raise exception 'investment quantity must be zero before removal';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_nonzero_account_removal on public.financial_accounts;
create trigger prevent_nonzero_account_removal
before update of deleted_at, is_active on public.financial_accounts
for each row execute function public.prevent_nonzero_account_removal();

drop trigger if exists prevent_unsettled_card_removal on public.credit_cards;
create trigger prevent_unsettled_card_removal
before update of deleted_at, is_active on public.credit_cards
for each row execute function public.prevent_unsettled_card_removal();

drop trigger if exists prevent_unsettled_loan_removal on public.loans;
create trigger prevent_unsettled_loan_removal
before update of deleted_at, status on public.loans
for each row execute function public.prevent_unsettled_loan_removal();

drop trigger if exists prevent_nonzero_investment_removal on public.investment_assets;
create trigger prevent_nonzero_investment_removal
before update of deleted_at, is_active on public.investment_assets
for each row execute function public.prevent_nonzero_investment_removal();

create or replace function public.prepare_linked_financial_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_balance bigint;
  destination_balance bigint;
  card_row public.credit_cards%rowtype;
  loan_row public.loans%rowtype;
  asset_row public.investment_assets%rowtype;
  principal_cents bigint;
  statement_applied bigint;
  unbilled_applied bigint;
  investment_quantity numeric;
  installment_id uuid;
  installment_row public.credit_card_installments%rowtype;
  installment_applied bigint;
  installment_total bigint := 0;
  installment_allocations jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or new.user_id <> auth.uid() or new.ledger_id is null or not public.can_write_ledger(new.ledger_id) then
    raise exception 'ledger write permission required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.ledger_id::text, 0));

  new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'ledger_effect_version';

  if new.account_id is not null then
    select balance_cents into source_balance
    from public.financial_accounts
    where id = new.account_id and ledger_id = new.ledger_id and deleted_at is null and is_active
    for update;
    if not found then raise exception 'linked account is unavailable'; end if;
  end if;

  if new.transaction_type in ('expense','credit_card_payment','loan_payment','investment_buy') then
    if new.account_id is null then raise exception 'payment account is required'; end if;
    if source_balance < new.amount_cents then raise exception 'insufficient account balance'; end if;
  end if;

  if new.transaction_type = 'income' and new.account_id is null then
    return new;
  end if;

  if new.transaction_type = 'expense' and new.account_id is null then
    return new;
  end if;

  if new.transaction_type in ('transfer','deposit_transfer') then
    if new.account_id is null or new.transfer_account_id is null or new.account_id = new.transfer_account_id then
      raise exception 'valid source and destination accounts are required';
    end if;
    select balance_cents into destination_balance
    from public.financial_accounts
    where id = new.transfer_account_id and ledger_id = new.ledger_id and deleted_at is null and is_active
    for update;
    if not found then raise exception 'destination account is unavailable'; end if;
    if source_balance < new.amount_cents then raise exception 'insufficient account balance'; end if;
  end if;

  if new.transaction_type in ('credit_card_purchase','credit_card_payment') then
    select * into card_row
    from public.credit_cards
    where id = new.credit_card_id and ledger_id = new.ledger_id and deleted_at is null and is_active
    for update;
    if not found then raise exception 'linked credit card is unavailable'; end if;

    if new.transaction_type = 'credit_card_payment' then
      if new.amount_cents > card_row.current_statement_amount_cents + card_row.unbilled_amount_cents then
        raise exception 'credit card payment exceeds outstanding balance';
      end if;
      statement_applied := least(new.amount_cents, card_row.current_statement_amount_cents);
      unbilled_applied := least(new.amount_cents - statement_applied, card_row.unbilled_amount_cents);
      new.metadata := new.metadata || jsonb_build_object(
        'card_statement_applied_cents', statement_applied,
        'card_unbilled_applied_cents', unbilled_applied
      );

      if jsonb_typeof(coalesce(new.metadata -> 'credit_card_installment_ids', '[]'::jsonb)) <> 'array' then
        raise exception 'credit card installment selection must be an array';
      end if;
      for installment_id in
        select distinct item.value::uuid
        from jsonb_array_elements_text(coalesce(new.metadata -> 'credit_card_installment_ids', '[]'::jsonb)) as item(value)
      loop
        select * into installment_row
        from public.credit_card_installments
        where id = installment_id
          and credit_card_id = new.credit_card_id
          and ledger_id = new.ledger_id
          and deleted_at is null
          and status = 'active'
          and remaining_amount_cents > 0
        for update;
        if not found then raise exception 'linked credit card installment is unavailable'; end if;
        installment_applied := least(installment_row.monthly_payment_cents, installment_row.remaining_amount_cents);
        installment_total := installment_total + installment_applied;
        installment_allocations := installment_allocations || jsonb_build_array(jsonb_build_object(
          'id', installment_row.id,
          'amount_cents', installment_applied,
          'previous_next_due_date', installment_row.next_due_date,
          'previous_status', installment_row.status
        ));
      end loop;
      if installment_total > new.amount_cents then
        raise exception 'installment allocation exceeds credit card payment';
      end if;
      new.metadata := new.metadata || jsonb_build_object('card_installment_allocations', installment_allocations);
    end if;
  end if;

  if new.transaction_type = 'loan_payment' then
    select * into loan_row
    from public.loans
    where id = new.loan_id and ledger_id = new.ledger_id and deleted_at is null and status <> 'paid_off'
    for update;
    if not found then raise exception 'linked loan is unavailable'; end if;
    principal_cents := coalesce((new.metadata ->> 'loan_principal_cents')::bigint, 0);
    if principal_cents < 0 or principal_cents > new.amount_cents or principal_cents > loan_row.remaining_principal_cents then
      raise exception 'invalid loan principal amount';
    end if;
    new.metadata := new.metadata || jsonb_build_object(
      'loan_principal_cents', principal_cents,
      'loan_interest_cents', new.amount_cents - principal_cents
    );
  end if;

  if new.transaction_type in ('investment_buy','investment_sell') then
    select * into asset_row
    from public.investment_assets
    where id = new.investment_asset_id and ledger_id = new.ledger_id and deleted_at is null and is_active
    for update;
    if not found then raise exception 'linked investment asset is unavailable'; end if;
    investment_quantity := (new.metadata ->> 'investment_quantity')::numeric;
    if investment_quantity is null or investment_quantity <= 0 then
      raise exception 'investment quantity must be positive';
    end if;
    if new.transaction_type = 'investment_sell' and investment_quantity > asset_row.quantity then
      raise exception 'investment sale exceeds current holding';
    end if;
  end if;

  new.metadata := new.metadata || jsonb_build_object('ledger_effect_version', 1);
  return new;
end;
$$;

create or replace function public.apply_linked_financial_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  principal_cents bigint;
  statement_applied bigint;
  unbilled_applied bigint;
  investment_quantity numeric;
  asset_row public.investment_assets%rowtype;
  added_cost_quote numeric;
  next_quantity numeric;
  installment_allocation record;
begin
  if coalesce((new.metadata ->> 'ledger_effect_version')::integer, 0) <> 1 then return new; end if;

  case new.transaction_type
    when 'income' then
      update public.financial_accounts set balance_cents = balance_cents + new.amount_cents where id = new.account_id;
    when 'expense' then
      update public.financial_accounts set balance_cents = balance_cents - new.amount_cents where id = new.account_id;
    when 'transfer' then
      update public.financial_accounts set balance_cents = balance_cents - new.amount_cents where id = new.account_id;
      update public.financial_accounts set balance_cents = balance_cents + new.amount_cents where id = new.transfer_account_id;
    when 'deposit_transfer' then
      update public.financial_accounts set balance_cents = balance_cents - new.amount_cents where id = new.account_id;
      update public.financial_accounts set balance_cents = balance_cents + new.amount_cents where id = new.transfer_account_id;
    when 'credit_card_purchase' then
      update public.credit_cards set unbilled_amount_cents = unbilled_amount_cents + new.amount_cents where id = new.credit_card_id;
    when 'credit_card_payment' then
      statement_applied := (new.metadata ->> 'card_statement_applied_cents')::bigint;
      unbilled_applied := (new.metadata ->> 'card_unbilled_applied_cents')::bigint;
      update public.financial_accounts set balance_cents = balance_cents - new.amount_cents where id = new.account_id;
      update public.credit_cards
      set current_statement_amount_cents = current_statement_amount_cents - statement_applied,
          unbilled_amount_cents = unbilled_amount_cents - unbilled_applied
      where id = new.credit_card_id;
      insert into public.credit_card_payments (
        user_id, ledger_id, credit_card_id, account_id, transaction_id, paid_date, amount_cents, metadata
      ) values (
        new.user_id, new.ledger_id, new.credit_card_id, new.account_id, new.id, new.transaction_date, new.amount_cents,
        jsonb_build_object('created_by_ledger_effect', true)
      );
      for installment_allocation in
        select * from jsonb_to_recordset(coalesce(new.metadata -> 'card_installment_allocations', '[]'::jsonb))
          as allocation(id uuid, amount_cents bigint, previous_next_due_date date, previous_status text)
      loop
        update public.credit_card_installments
        set paid_periods = least(periods, paid_periods + 1),
            paid_amount_cents = least(total_amount_cents, paid_amount_cents + installment_allocation.amount_cents),
            remaining_amount_cents = greatest(0, remaining_amount_cents - installment_allocation.amount_cents),
            next_due_date = case
              when remaining_amount_cents - installment_allocation.amount_cents <= 0 then next_due_date
              else (next_due_date + interval '1 month')::date
            end,
            status = case
              when remaining_amount_cents - installment_allocation.amount_cents <= 0 then 'paid_off'
              else status
            end
        where id = installment_allocation.id;
      end loop;
    when 'loan_payment' then
      principal_cents := (new.metadata ->> 'loan_principal_cents')::bigint;
      update public.financial_accounts set balance_cents = balance_cents - new.amount_cents where id = new.account_id;
      update public.loans
      set remaining_principal_cents = greatest(0, remaining_principal_cents - principal_cents),
          paid_periods = least(term_months, paid_periods + 1),
          status = case when remaining_principal_cents - principal_cents <= 0 then 'paid_off' else status end,
          metadata = jsonb_set(
            coalesce(metadata, '{}'::jsonb),
            '{paid_amount_cents}',
            to_jsonb(coalesce((metadata ->> 'paid_amount_cents')::bigint, 0) + new.amount_cents),
            true
          )
      where id = new.loan_id;
      insert into public.loan_payments (
        user_id, ledger_id, loan_id, transaction_id, paid_date, payment_cents, principal_cents, interest_cents,
        extra_principal_cents, metadata
      ) values (
        new.user_id, new.ledger_id, new.loan_id, new.id, new.transaction_date, new.amount_cents, principal_cents,
        (new.metadata ->> 'loan_interest_cents')::bigint, 0, jsonb_build_object('created_by_ledger_effect', true)
      );
    when 'investment_buy' then
      investment_quantity := (new.metadata ->> 'investment_quantity')::numeric;
      select * into asset_row from public.investment_assets where id = new.investment_asset_id for update;
      added_cost_quote := (new.amount_cents::numeric / 100) / asset_row.exchange_rate_to_ledger;
      next_quantity := asset_row.quantity + investment_quantity;
      update public.financial_accounts set balance_cents = balance_cents - new.amount_cents where id = new.account_id;
      update public.investment_assets
      set quantity = next_quantity,
          average_unit_cost = case when next_quantity = 0 then average_unit_cost
            else ((asset_row.quantity * asset_row.average_unit_cost) + added_cost_quote) / next_quantity end
      where id = new.investment_asset_id;
    when 'investment_sell' then
      investment_quantity := (new.metadata ->> 'investment_quantity')::numeric;
      update public.financial_accounts set balance_cents = balance_cents + new.amount_cents where id = new.account_id;
      update public.investment_assets set quantity = quantity - investment_quantity where id = new.investment_asset_id;
    else null;
  end case;
  return new;
end;
$$;

create or replace function public.prevent_linked_financial_transaction_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((old.metadata ->> 'ledger_effect_version')::integer, 0) = 1 and (
    new.transaction_date is distinct from old.transaction_date
    or new.transaction_type is distinct from old.transaction_type
    or new.amount_cents is distinct from old.amount_cents
    or new.account_id is distinct from old.account_id
    or new.transfer_account_id is distinct from old.transfer_account_id
    or new.credit_card_id is distinct from old.credit_card_id
    or new.loan_id is distinct from old.loan_id
    or new.investment_asset_id is distinct from old.investment_asset_id
    or new.ledger_id is distinct from old.ledger_id
    or new.user_id is distinct from old.user_id
    or new.metadata is distinct from old.metadata
  ) then
    raise exception 'posted financial transaction fields are immutable; reverse and recreate it instead';
  end if;
  return new;
end;
$$;

create or replace function public.reverse_linked_financial_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  principal_cents bigint;
  statement_applied bigint;
  unbilled_applied bigint;
  investment_quantity numeric;
  current_balance bigint;
  asset_row public.investment_assets%rowtype;
  removed_cost_quote numeric;
  next_quantity numeric;
  unbilled_reversal bigint;
  statement_reversal bigint;
  has_later_investment_effect boolean;
  installment_allocation record;
begin
  if old.deleted_at is not null or new.deleted_at is null then return new; end if;
  if coalesce((old.metadata ->> 'ledger_effect_version')::integer, 0) <> 1 then return new; end if;

  if old.transaction_type in ('investment_buy','investment_sell') then
    select exists (
      select 1
      from public.transactions
      where investment_asset_id = old.investment_asset_id
        and deleted_at is null
        and coalesce((metadata ->> 'ledger_effect_version')::integer, 0) = 1
        and created_at > old.created_at
    ) into has_later_investment_effect;
    if has_later_investment_effect then
      raise exception 'reverse newer investment transactions first';
    end if;
  end if;

  case old.transaction_type
    when 'income' then
      select balance_cents into current_balance from public.financial_accounts where id = old.account_id for update;
      if current_balance < old.amount_cents then raise exception 'account balance is too low to reverse this income'; end if;
      update public.financial_accounts set balance_cents = balance_cents - old.amount_cents where id = old.account_id;
    when 'expense' then
      update public.financial_accounts set balance_cents = balance_cents + old.amount_cents where id = old.account_id;
    when 'transfer' then
      select balance_cents into current_balance from public.financial_accounts where id = old.transfer_account_id for update;
      if current_balance < old.amount_cents then raise exception 'destination account balance is too low to reverse this transfer'; end if;
      update public.financial_accounts set balance_cents = balance_cents - old.amount_cents where id = old.transfer_account_id;
      update public.financial_accounts set balance_cents = balance_cents + old.amount_cents where id = old.account_id;
    when 'deposit_transfer' then
      select balance_cents into current_balance from public.financial_accounts where id = old.transfer_account_id for update;
      if current_balance < old.amount_cents then raise exception 'destination account balance is too low to reverse this transfer'; end if;
      update public.financial_accounts set balance_cents = balance_cents - old.amount_cents where id = old.transfer_account_id;
      update public.financial_accounts set balance_cents = balance_cents + old.amount_cents where id = old.account_id;
    when 'credit_card_purchase' then
      select unbilled_amount_cents, current_statement_amount_cents
      into unbilled_reversal, statement_reversal
      from public.credit_cards
      where id = old.credit_card_id
      for update;
      if unbilled_reversal + statement_reversal < old.amount_cents then
        raise exception 'credit card balance is too low to reverse this purchase';
      end if;
      unbilled_reversal := least(unbilled_reversal, old.amount_cents);
      statement_reversal := old.amount_cents - unbilled_reversal;
      update public.credit_cards
      set unbilled_amount_cents = unbilled_amount_cents - unbilled_reversal,
          current_statement_amount_cents = current_statement_amount_cents - statement_reversal
      where id = old.credit_card_id;
    when 'credit_card_payment' then
      statement_applied := (old.metadata ->> 'card_statement_applied_cents')::bigint;
      unbilled_applied := (old.metadata ->> 'card_unbilled_applied_cents')::bigint;
      update public.financial_accounts set balance_cents = balance_cents + old.amount_cents where id = old.account_id;
      update public.credit_cards
      set current_statement_amount_cents = current_statement_amount_cents + statement_applied,
          unbilled_amount_cents = unbilled_amount_cents + unbilled_applied
      where id = old.credit_card_id;
      update public.credit_card_payments set deleted_at = timezone('utc', now())
      where transaction_id = old.id and deleted_at is null;
      for installment_allocation in
        select * from jsonb_to_recordset(coalesce(old.metadata -> 'card_installment_allocations', '[]'::jsonb))
          as allocation(id uuid, amount_cents bigint, previous_next_due_date date, previous_status text)
      loop
        update public.credit_card_installments
        set paid_periods = greatest(0, paid_periods - 1),
            paid_amount_cents = greatest(0, paid_amount_cents - installment_allocation.amount_cents),
            remaining_amount_cents = least(total_amount_cents, remaining_amount_cents + installment_allocation.amount_cents),
            next_due_date = installment_allocation.previous_next_due_date,
            status = installment_allocation.previous_status
        where id = installment_allocation.id;
      end loop;
    when 'loan_payment' then
      principal_cents := (old.metadata ->> 'loan_principal_cents')::bigint;
      update public.financial_accounts set balance_cents = balance_cents + old.amount_cents where id = old.account_id;
      update public.loans
      set remaining_principal_cents = least(original_principal_cents, remaining_principal_cents + principal_cents),
          paid_periods = greatest(0, paid_periods - 1),
          status = 'active',
          metadata = jsonb_set(
            coalesce(metadata, '{}'::jsonb),
            '{paid_amount_cents}',
            to_jsonb(greatest(0, coalesce((metadata ->> 'paid_amount_cents')::bigint, 0) - old.amount_cents)),
            true
          )
      where id = old.loan_id;
      update public.loan_payments set deleted_at = timezone('utc', now())
      where transaction_id = old.id and deleted_at is null;
    when 'investment_buy' then
      investment_quantity := (old.metadata ->> 'investment_quantity')::numeric;
      select * into asset_row from public.investment_assets where id = old.investment_asset_id for update;
      if asset_row.quantity < investment_quantity then raise exception 'later investment sales must be reversed first'; end if;
      removed_cost_quote := (old.amount_cents::numeric / 100) / asset_row.exchange_rate_to_ledger;
      next_quantity := asset_row.quantity - investment_quantity;
      update public.financial_accounts set balance_cents = balance_cents + old.amount_cents where id = old.account_id;
      update public.investment_assets
      set quantity = next_quantity,
          average_unit_cost = case when next_quantity = 0 then average_unit_cost
            else greatest(0, ((asset_row.quantity * asset_row.average_unit_cost) - removed_cost_quote) / next_quantity) end
      where id = old.investment_asset_id;
    when 'investment_sell' then
      select balance_cents into current_balance from public.financial_accounts where id = old.account_id for update;
      if current_balance < old.amount_cents then raise exception 'account balance is too low to reverse this investment sale'; end if;
      investment_quantity := (old.metadata ->> 'investment_quantity')::numeric;
      update public.financial_accounts set balance_cents = balance_cents - old.amount_cents where id = old.account_id;
      update public.investment_assets set quantity = quantity + investment_quantity where id = old.investment_asset_id;
    else null;
  end case;
  return new;
end;
$$;

drop trigger if exists prepare_linked_financial_transaction on public.transactions;
create trigger prepare_linked_financial_transaction
before insert on public.transactions
for each row execute function public.prepare_linked_financial_transaction();

drop trigger if exists prevent_linked_financial_transaction_mutation on public.transactions;
create trigger prevent_linked_financial_transaction_mutation
before update on public.transactions
for each row execute function public.prevent_linked_financial_transaction_mutation();

drop trigger if exists apply_linked_financial_transaction on public.transactions;
create trigger apply_linked_financial_transaction
after insert on public.transactions
for each row execute function public.apply_linked_financial_transaction();

drop trigger if exists reverse_linked_financial_transaction on public.transactions;
create trigger reverse_linked_financial_transaction
after update of deleted_at on public.transactions
for each row execute function public.reverse_linked_financial_transaction();

revoke all on function public.prepare_linked_financial_transaction() from public, anon, authenticated;
revoke all on function public.apply_linked_financial_transaction() from public, anon, authenticated;
revoke all on function public.prevent_linked_financial_transaction_mutation() from public, anon, authenticated;
revoke all on function public.reverse_linked_financial_transaction() from public, anon, authenticated;
revoke all on function public.validate_deposit_account_link() from public, anon, authenticated;
revoke all on function public.prevent_nonzero_account_removal() from public, anon, authenticated;
revoke all on function public.prevent_unsettled_card_removal() from public, anon, authenticated;
revoke all on function public.prevent_unsettled_loan_removal() from public, anon, authenticated;
revoke all on function public.prevent_nonzero_investment_removal() from public, anon, authenticated;

commit;
