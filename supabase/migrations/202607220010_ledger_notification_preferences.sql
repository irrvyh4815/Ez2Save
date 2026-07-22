create table if not exists public.ledger_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_id uuid not null references public.ledger_books(id) on delete cascade,
  notification_type text not null,
  is_enabled boolean not null default true,
  remind_days_before smallint not null default 7,
  delivery_mode text not null default 'repeat',
  repeat_hours smallint not null default 12,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint ledger_notification_preferences_type_check check (notification_type in ('credit_card','installment','loan','reminder','deposit','insurance')),
  constraint ledger_notification_preferences_days_check check (remind_days_before between 0 and 90),
  constraint ledger_notification_preferences_delivery_check check (delivery_mode in ('single','repeat')),
  constraint ledger_notification_preferences_repeat_check check (repeat_hours between 1 and 168),
  constraint ledger_notification_preferences_unique unique (ledger_id, user_id, notification_type)
);

create index if not exists ledger_notification_preferences_ledger_idx
  on public.ledger_notification_preferences(ledger_id, user_id);

alter table public.ledger_notification_preferences enable row level security;

drop policy if exists ledger_notification_preferences_select_ledger_member on public.ledger_notification_preferences;
drop policy if exists ledger_notification_preferences_insert_ledger_writer on public.ledger_notification_preferences;
drop policy if exists ledger_notification_preferences_update_ledger_writer on public.ledger_notification_preferences;
drop policy if exists ledger_notification_preferences_delete_ledger_writer on public.ledger_notification_preferences;

create policy ledger_notification_preferences_select_ledger_member on public.ledger_notification_preferences
  for select using (public.can_read_ledger(ledger_id));

create policy ledger_notification_preferences_insert_ledger_writer on public.ledger_notification_preferences
  for insert with check (auth.uid() = user_id and public.can_write_ledger(ledger_id));

create policy ledger_notification_preferences_update_ledger_writer on public.ledger_notification_preferences
  for update using (public.can_write_ledger(ledger_id))
  with check (auth.uid() = user_id and public.can_write_ledger(ledger_id));

create policy ledger_notification_preferences_delete_ledger_writer on public.ledger_notification_preferences
  for delete using (public.can_write_ledger(ledger_id));

drop trigger if exists set_ledger_notification_preferences_updated_at on public.ledger_notification_preferences;
create trigger set_ledger_notification_preferences_updated_at
before update on public.ledger_notification_preferences
for each row execute function public.set_updated_at();

drop trigger if exists prevent_ledger_notification_preferences_ledger_move on public.ledger_notification_preferences;
create trigger prevent_ledger_notification_preferences_ledger_move
before update on public.ledger_notification_preferences
for each row execute function public.prevent_finance_ledger_move();
