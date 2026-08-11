begin;

alter table public.transactions
  add column if not exists investment_asset_id uuid references public.investment_assets(id) on delete restrict;

alter table public.deposits
  add column if not exists account_id uuid references public.financial_accounts(id) on delete restrict;

create index if not exists transactions_investment_asset_idx
  on public.transactions(ledger_id, investment_asset_id, transaction_date desc)
  where deleted_at is null and investment_asset_id is not null;

create unique index if not exists deposits_active_account_unique
  on public.deposits(account_id)
  where deleted_at is null and is_active and account_id is not null;

commit;
