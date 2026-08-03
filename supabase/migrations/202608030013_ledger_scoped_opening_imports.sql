begin;

alter table public.financial_accounts
  drop constraint if exists financial_accounts_name_unique;

drop index if exists public.financial_accounts_ledger_name_unique;
create unique index financial_accounts_ledger_name_unique
  on public.financial_accounts (
    user_id,
    coalesce(ledger_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  where deleted_at is null;

alter table public.credit_cards
  drop constraint if exists credit_cards_unique;

drop index if exists public.credit_cards_ledger_identity_unique;
create unique index credit_cards_ledger_identity_unique
  on public.credit_cards (
    user_id,
    coalesce(ledger_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(issuer),
    last4
  )
  where deleted_at is null;

commit;
