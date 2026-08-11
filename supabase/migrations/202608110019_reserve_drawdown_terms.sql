begin;

create or replace function public.prepare_reserve_credit_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loan_row public.loans%rowtype;
  installment_months integer;
  billing_days integer;
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
    begin
      installment_months := (new.metadata ->> 'reserve_installment_months')::integer;
      billing_days := coalesce((loan_row.metadata ->> 'reserve_billing_days')::integer, 30);
    exception when invalid_text_representation then
      raise exception 'invalid reserve credit installment settings';
    end;
    if installment_months is null or installment_months < 1 or installment_months > 120 then
      raise exception 'reserve credit installment months must be between 1 and 120';
    end if;
    billing_days := greatest(1, least(366, billing_days));
    new.metadata := new.metadata || jsonb_build_object(
      'reserve_installment_months', installment_months,
      'reserve_billing_days', billing_days,
      'reserve_annual_rate', loan_row.annual_rate,
      'reserve_drawdown_principal_cents', new.amount_cents
    );
  elsif not coalesce((new.metadata ->> 'advance_loan_period')::boolean, true) then
    new.metadata := new.metadata || jsonb_build_object('loan_paid_periods_before', loan_row.paid_periods);
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_reserve_credit_transaction() from public, anon, authenticated;

commit;
