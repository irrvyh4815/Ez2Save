create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  endpoint_hash text not null,
  p256dh_key text not null,
  auth_key text not null,
  expiration_time timestamptz,
  device_label text not null default '此裝置',
  platform text not null default 'other',
  is_active boolean not null default true,
  failure_count integer not null default 0,
  last_seen_at timestamptz not null default timezone('utc', now()),
  last_error_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint web_push_subscriptions_endpoint_hash_unique unique (endpoint_hash),
  constraint web_push_subscriptions_endpoint_hash_check check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  constraint web_push_subscriptions_endpoint_length_check check (char_length(endpoint) between 20 and 2048),
  constraint web_push_subscriptions_key_length_check check (
    char_length(p256dh_key) between 40 and 200 and char_length(auth_key) between 8 and 100
  ),
  constraint web_push_subscriptions_device_label_check check (char_length(trim(device_label)) between 1 and 80),
  constraint web_push_subscriptions_platform_check check (platform in ('ios','android','macos','windows','linux','other')),
  constraint web_push_subscriptions_failure_count_check check (failure_count between 0 and 1000)
);

create index if not exists web_push_subscriptions_user_active_idx
  on public.web_push_subscriptions(user_id, is_active, last_seen_at desc);

create table if not exists public.web_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.web_push_subscriptions(id) on delete cascade,
  ledger_id uuid references public.ledger_books(id) on delete cascade,
  notification_key text not null,
  notification_type text not null,
  due_date date not null,
  delivery_mode text not null default 'single',
  repeat_hours smallint not null default 24,
  status text not null default 'sent',
  attempt_count integer not null default 1,
  last_attempted_at timestamptz not null default timezone('utc', now()),
  last_sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint web_push_deliveries_subscription_key_unique unique (subscription_id, notification_key),
  constraint web_push_deliveries_key_length_check check (char_length(notification_key) between 8 and 180),
  constraint web_push_deliveries_type_check check (notification_type in ('credit_card','installment','loan','reminder','deposit','insurance')),
  constraint web_push_deliveries_mode_check check (delivery_mode in ('single','repeat')),
  constraint web_push_deliveries_repeat_check check (repeat_hours between 1 and 168),
  constraint web_push_deliveries_status_check check (status in ('sent','failed')),
  constraint web_push_deliveries_attempt_check check (attempt_count between 1 and 10000),
  constraint web_push_deliveries_error_length_check check (last_error_code is null or char_length(last_error_code) <= 40)
);

create index if not exists web_push_deliveries_due_idx
  on public.web_push_deliveries(user_id, due_date desc, last_attempted_at desc);

alter table public.web_push_subscriptions enable row level security;
alter table public.web_push_deliveries enable row level security;

drop policy if exists web_push_subscriptions_select_own on public.web_push_subscriptions;
drop policy if exists web_push_subscriptions_insert_own on public.web_push_subscriptions;
drop policy if exists web_push_subscriptions_update_own on public.web_push_subscriptions;
drop policy if exists web_push_subscriptions_delete_own on public.web_push_subscriptions;

create policy web_push_subscriptions_select_own on public.web_push_subscriptions
  for select using (auth.uid() = user_id);
create policy web_push_subscriptions_insert_own on public.web_push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy web_push_subscriptions_update_own on public.web_push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy web_push_subscriptions_delete_own on public.web_push_subscriptions
  for delete using (auth.uid() = user_id);

drop policy if exists web_push_deliveries_select_own on public.web_push_deliveries;
create policy web_push_deliveries_select_own on public.web_push_deliveries
  for select using (auth.uid() = user_id);

revoke all on public.web_push_subscriptions from anon;
revoke all on public.web_push_deliveries from anon;
revoke all on public.web_push_subscriptions from authenticated;
grant select on public.web_push_deliveries to authenticated;

drop trigger if exists set_web_push_subscriptions_updated_at on public.web_push_subscriptions;
create trigger set_web_push_subscriptions_updated_at
before update on public.web_push_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists set_web_push_deliveries_updated_at on public.web_push_deliveries;
create trigger set_web_push_deliveries_updated_at
before update on public.web_push_deliveries
for each row execute function public.set_updated_at();
