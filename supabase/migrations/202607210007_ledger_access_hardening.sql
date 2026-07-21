create or replace function public.is_current_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and is_super_admin = true
      and role = 'super_admin'
      and is_active = true
  );
$$;

create or replace function public.prevent_finance_ledger_move()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ledger_id is distinct from old.ledger_id then
    raise exception 'ledger assignment cannot be changed';
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'financial_accounts','transaction_categories','transactions','recurring_transactions','loans',
    'loan_payment_schedules','loan_payments','credit_cards','credit_card_installments','credit_card_payments',
    'deposits','budgets','financial_reminders','monthly_financial_summaries','net_worth_snapshots',
    'ai_financial_reports','ai_usage_logs','insurance_policies'
  ]
  loop
    execute format('drop trigger if exists prevent_%I_ledger_move on public.%I', table_name, table_name);
    execute format('create trigger prevent_%I_ledger_move before update on public.%I for each row execute function public.prevent_finance_ledger_move()', table_name, table_name);
  end loop;
end;
$$;
