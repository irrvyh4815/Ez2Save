alter table public.credit_card_installments
  add column if not exists annual_rate numeric(9,6) not null default 0,
  add column if not exists monthly_payment_cents bigint not null default 0,
  add column if not exists paid_amount_cents bigint not null default 0,
  add column if not exists remaining_amount_cents bigint not null default 0,
  add column if not exists next_due_date date,
  add column if not exists status text not null default 'active',
  add column if not exists note text;

update public.credit_card_installments
set
  paid_amount_cents = greatest(paid_amount_cents, round((total_amount_cents::numeric / periods) * paid_periods)::bigint),
  remaining_amount_cents = greatest(remaining_amount_cents, total_amount_cents - greatest(paid_amount_cents, round((total_amount_cents::numeric / periods) * paid_periods)::bigint)),
  monthly_payment_cents = greatest(monthly_payment_cents, ceil(total_amount_cents::numeric / periods)::bigint)
where periods > 0;

alter table public.credit_card_installments
  drop constraint if exists credit_card_installments_debt_amount_check,
  add constraint credit_card_installments_debt_amount_check check (
    annual_rate >= 0 and annual_rate <= 1
    and monthly_payment_cents >= 0
    and paid_amount_cents >= 0
    and remaining_amount_cents >= 0
    and remaining_amount_cents <= total_amount_cents
  );

alter table public.credit_card_installments
  drop constraint if exists credit_card_installments_status_check,
  add constraint credit_card_installments_status_check check (status in ('active','paid_off','paused'));

create index if not exists credit_card_installments_user_status_idx
  on public.credit_card_installments (user_id, status)
  where deleted_at is null;

create index if not exists credit_card_installments_due_idx
  on public.credit_card_installments (user_id, next_due_date)
  where deleted_at is null and status = 'active';
