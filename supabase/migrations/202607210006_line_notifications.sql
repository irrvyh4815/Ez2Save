create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  line_enabled boolean not null default false,
  line_user_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notification_preferences_line_user_check check (line_user_id is null or char_length(trim(line_user_id)) between 8 and 256)
);

create table if not exists public.finance_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_key text not null,
  delivery_window text not null,
  channel text not null default 'line',
  status text not null default 'sent',
  sent_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint finance_notification_deliveries_channel_check check (channel in ('line')),
  constraint finance_notification_deliveries_status_check check (status in ('sent','failed')),
  constraint finance_notification_deliveries_unique unique (user_id, notification_key, delivery_window, channel)
);

create index if not exists finance_notification_deliveries_user_sent_idx
  on public.finance_notification_deliveries (user_id, sent_at desc);

drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;
alter table public.finance_notification_deliveries enable row level security;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
drop policy if exists notification_preferences_insert_own on public.notification_preferences;
drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_select_own on public.notification_preferences for select using (auth.uid() = user_id);
create policy notification_preferences_insert_own on public.notification_preferences for insert with check (auth.uid() = user_id);
create policy notification_preferences_update_own on public.notification_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists finance_notification_deliveries_select_own on public.finance_notification_deliveries;
create policy finance_notification_deliveries_select_own on public.finance_notification_deliveries for select using (auth.uid() = user_id);
