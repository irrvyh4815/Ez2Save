begin;

alter table public.loans
  add column if not exists credit_limit_cents bigint;

alter table public.loans drop constraint if exists loans_type_check;
alter table public.loans add constraint loans_type_check check (
  loan_type in ('personal','mortgage','auto','motorcycle','student','family','other','reserve_credit')
);

alter table public.loans drop constraint if exists loans_amount_check;
alter table public.loans add constraint loans_amount_check check (
  payment_per_period_cents >= 0 and (
    (
      loan_type = 'reserve_credit'
      and credit_limit_cents is not null
      and credit_limit_cents > 0
      and original_principal_cents >= 0
      and remaining_principal_cents >= 0
      and remaining_principal_cents <= credit_limit_cents
    )
    or (
      loan_type <> 'reserve_credit'
      and original_principal_cents > 0
      and remaining_principal_cents >= 0
    )
  )
);

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (
  transaction_type in (
    'income','expense','transfer','credit_card_purchase','credit_card_payment','loan_payment',
    'loan_drawdown','deposit_transfer','investment_buy','investment_sell'
  )
);

alter table public.transactions drop constraint if exists transactions_loan_check;
alter table public.transactions add constraint transactions_loan_check check (
  transaction_type not in ('loan_payment','loan_drawdown') or (loan_id is not null and account_id is not null)
);

create or replace function public.prepare_reserve_credit_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loan_row public.loans%rowtype;
begin
  if new.transaction_type not in ('loan_payment','loan_drawdown') then return new; end if;
  if auth.uid() is null or new.user_id <> auth.uid() or new.ledger_id is null or not public.can_write_ledger(new.ledger_id) then
    raise exception 'ledger write permission required';
  end if;
  if coalesce((new.metadata ->> 'ledger_effect_version')::integer, 0) <> 1 then
    raise exception 'atomic ledger transaction is required';
  end if;

  select * into loan_row
  from public.loans
  where id = new.loan_id and ledger_id = new.ledger_id and deleted_at is null and status <> 'paid_off'
  for update;
  if not found then raise exception 'linked loan is unavailable'; end if;

  if new.transaction_type = 'loan_drawdown' then
    if loan_row.loan_type <> 'reserve_credit' then raise exception 'only reserve credit can be drawn'; end if;
    if new.amount_cents > coalesce(loan_row.credit_limit_cents, 0) - loan_row.remaining_principal_cents then
      raise exception 'reserve credit draw exceeds available limit';
    end if;
  elsif not coalesce((new.metadata ->> 'advance_loan_period')::boolean, true) then
    new.metadata := new.metadata || jsonb_build_object('loan_paid_periods_before', loan_row.paid_periods);
  end if;

  return new;
end;
$$;

create or replace function public.apply_reserve_credit_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((new.metadata ->> 'ledger_effect_version')::integer, 0) <> 1 then return new; end if;

  if new.transaction_type = 'loan_drawdown' then
    update public.financial_accounts
    set balance_cents = balance_cents + new.amount_cents
    where id = new.account_id;

    update public.loans
    set original_principal_cents = original_principal_cents + new.amount_cents,
        remaining_principal_cents = remaining_principal_cents + new.amount_cents,
        status = 'active'
    where id = new.loan_id;
  elsif new.transaction_type = 'loan_payment'
    and not coalesce((new.metadata ->> 'advance_loan_period')::boolean, true)
  then
    update public.loans
    set paid_periods = coalesce((new.metadata ->> 'loan_paid_periods_before')::integer, paid_periods)
    where id = new.loan_id;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_out_of_order_loan_transaction_reversal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is not null or new.deleted_at is null or old.transaction_type not in ('loan_payment','loan_drawdown') then
    return new;
  end if;

  if exists (
    select 1
    from public.transactions
    where loan_id = old.loan_id
      and deleted_at is null
      and coalesce((metadata ->> 'ledger_effect_version')::integer, 0) = 1
      and created_at > old.created_at
  ) then
    raise exception 'reverse newer loan transactions first';
  end if;

  return new;
end;
$$;

create or replace function public.reverse_reserve_credit_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance bigint;
  current_principal bigint;
begin
  if old.deleted_at is not null or new.deleted_at is null then return new; end if;
  if coalesce((old.metadata ->> 'ledger_effect_version')::integer, 0) <> 1 then return new; end if;

  if old.transaction_type = 'loan_drawdown' then
    select balance_cents into current_balance
    from public.financial_accounts
    where id = old.account_id
    for update;
    if current_balance < old.amount_cents then
      raise exception 'account balance is too low to reverse this reserve credit draw';
    end if;

    select remaining_principal_cents into current_principal
    from public.loans
    where id = old.loan_id
    for update;
    if current_principal < old.amount_cents then
      raise exception 'repayments must be reversed before this reserve credit draw';
    end if;

    update public.financial_accounts
    set balance_cents = balance_cents - old.amount_cents
    where id = old.account_id;

    update public.loans
    set original_principal_cents = greatest(0, original_principal_cents - old.amount_cents),
        remaining_principal_cents = remaining_principal_cents - old.amount_cents
    where id = old.loan_id;
  elsif old.transaction_type = 'loan_payment'
    and not coalesce((old.metadata ->> 'advance_loan_period')::boolean, true)
  then
    update public.loans
    set paid_periods = coalesce((old.metadata ->> 'loan_paid_periods_before')::integer, paid_periods)
    where id = old.loan_id;
  end if;

  return new;
end;
$$;

drop trigger if exists zz_prepare_reserve_credit_transaction on public.transactions;
create trigger zz_prepare_reserve_credit_transaction
before insert on public.transactions
for each row execute function public.prepare_reserve_credit_transaction();

drop trigger if exists zz_apply_reserve_credit_transaction on public.transactions;
create trigger zz_apply_reserve_credit_transaction
after insert on public.transactions
for each row execute function public.apply_reserve_credit_transaction();

drop trigger if exists zz_prevent_out_of_order_loan_transaction_reversal on public.transactions;
create trigger zz_prevent_out_of_order_loan_transaction_reversal
before update of deleted_at on public.transactions
for each row execute function public.prevent_out_of_order_loan_transaction_reversal();

drop trigger if exists zz_reverse_reserve_credit_transaction on public.transactions;
create trigger zz_reverse_reserve_credit_transaction
after update of deleted_at on public.transactions
for each row execute function public.reverse_reserve_credit_transaction();

revoke all on function public.prepare_reserve_credit_transaction() from public, anon, authenticated;
revoke all on function public.apply_reserve_credit_transaction() from public, anon, authenticated;
revoke all on function public.prevent_out_of_order_loan_transaction_reversal() from public, anon, authenticated;
revoke all on function public.reverse_reserve_credit_transaction() from public, anon, authenticated;

commit;
