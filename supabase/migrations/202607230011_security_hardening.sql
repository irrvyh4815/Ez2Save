-- This migration only tightens access control and does not modify financial records.

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
  if new.user_id is distinct from old.user_id then
    raise exception 'financial record owner cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_ledger_book_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'ledger owner cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_ledger_member_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ledger_id is distinct from old.ledger_id or new.user_id is distinct from old.user_id then
    raise exception 'ledger membership identity cannot be changed';
  end if;
  if new.role = 'owner' and old.role <> 'owner' then
    raise exception 'owner role cannot be granted by update';
  end if;
  if old.role = 'owner' and new.role <> 'owner' then
    raise exception 'owner role cannot be removed by update';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_ledger_invitation_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ledger_id is distinct from old.ledger_id or new.inviter_user_id is distinct from old.inviter_user_id then
    raise exception 'ledger invitation identity cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_ledger_books_owner_change on public.ledger_books;
create trigger prevent_ledger_books_owner_change
before update on public.ledger_books
for each row execute function public.prevent_ledger_book_identity_change();

drop trigger if exists prevent_ledger_members_identity_change on public.ledger_members;
create trigger prevent_ledger_members_identity_change
before update on public.ledger_members
for each row execute function public.prevent_ledger_member_identity_change();

drop trigger if exists prevent_ledger_invitations_identity_change on public.ledger_invitations;
create trigger prevent_ledger_invitations_identity_change
before update on public.ledger_invitations
for each row execute function public.prevent_ledger_invitation_identity_change();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','ledger_books','ledger_members','ledger_invitations',
    'financial_accounts','transaction_categories','transactions','recurring_transactions','loans',
    'loan_payment_schedules','loan_payments','credit_cards','credit_card_installments','credit_card_payments',
    'deposits','budgets','financial_reminders','monthly_financial_summaries','net_worth_snapshots',
    'ai_financial_reports','ai_usage_logs','insurance_policies','investment_categories','financial_plans',
    'ledger_notification_preferences','admin_audit_logs'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
    end if;
  end loop;
end;
$$;
