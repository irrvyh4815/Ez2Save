create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists member_code text;

create or replace function public.assign_profile_member_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.member_code is null or trim(new.member_code) = '' then
    new.member_code := 'M' || upper(substr(replace(new.user_id::text, '-', ''), 1, 10));
  end if;
  return new;
end;
$$;

drop trigger if exists assign_profile_member_code on public.profiles;
create trigger assign_profile_member_code
before insert or update on public.profiles
for each row execute function public.assign_profile_member_code();

update public.profiles
set member_code = 'M' || upper(substr(replace(user_id::text, '-', ''), 1, 10))
where member_code is null;

alter table public.profiles
  alter column member_code set not null;

create unique index if not exists profiles_member_code_unique_idx on public.profiles(member_code);

alter table public.profiles
  drop constraint if exists profiles_member_code_format_check;

alter table public.profiles
  add constraint profiles_member_code_format_check check (member_code ~ '^M[0-9A-Z]{6,16}$');

create table if not exists public.ledger_books (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  purpose text not null default 'personal',
  color text not null default 'emerald',
  note text,
  is_default boolean not null default false,
  is_shared boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint ledger_books_purpose_check check (purpose in ('personal','family','business','investment','custom')),
  constraint ledger_books_color_check check (color in ('emerald','sky','violet','amber','rose')),
  constraint ledger_books_name_length_check check (char_length(trim(name)) between 1 and 80)
);

create unique index if not exists ledger_books_owner_default_unique_idx
  on public.ledger_books(owner_user_id)
  where is_default and deleted_at is null;

create index if not exists ledger_books_owner_idx on public.ledger_books(owner_user_id) where deleted_at is null;

create table if not exists public.ledger_members (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledger_books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  status text not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint ledger_members_role_check check (role in ('owner','admin','editor','viewer')),
  constraint ledger_members_status_check check (status in ('active','pending','revoked')),
  constraint ledger_members_unique unique (ledger_id, user_id)
);

create index if not exists ledger_members_user_idx on public.ledger_members(user_id, status);
create index if not exists ledger_members_ledger_role_idx on public.ledger_members(ledger_id, role, status);

create or replace function public.ensure_ledger_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ledger_members (ledger_id, user_id, role, status)
  values (new.id, new.owner_user_id, 'owner', 'active')
  on conflict (ledger_id, user_id)
  do update set role = 'owner', status = 'active', updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists ensure_ledger_owner_member on public.ledger_books;
create trigger ensure_ledger_owner_member
after insert on public.ledger_books
for each row execute function public.ensure_ledger_owner_member();

create table if not exists public.ledger_invitations (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledger_books(id) on delete cascade,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_email text,
  invitee_member_code text,
  role text not null default 'viewer',
  token_hash text not null default encode(digest(gen_random_uuid()::text || clock_timestamp()::text, 'sha256'), 'hex'),
  status text not null default 'pending',
  expires_at timestamptz not null default timezone('utc', now()) + interval '14 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint ledger_invitations_role_check check (role in ('admin','editor','viewer')),
  constraint ledger_invitations_status_check check (status in ('pending','accepted','revoked','expired')),
  constraint ledger_invitations_target_check check (invitee_email is not null or invitee_member_code is not null)
);

create index if not exists ledger_invitations_ledger_status_idx on public.ledger_invitations(ledger_id, status, expires_at);
create index if not exists ledger_invitations_email_idx on public.ledger_invitations(lower(invitee_email)) where invitee_email is not null;
create index if not exists ledger_invitations_member_code_idx on public.ledger_invitations(upper(invitee_member_code)) where invitee_member_code is not null;

create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_id uuid references public.ledger_books(id) on delete cascade,
  name text not null,
  policy_type text not null,
  insurer text not null,
  policy_number_last4 text,
  insured_person text,
  annual_premium_cents bigint not null,
  coverage_amount_cents bigint not null,
  paid_claim_amount_cents bigint not null default 0,
  pending_claim_amount_cents bigint not null default 0,
  payment_day integer not null default 1,
  renewal_date date not null,
  beneficiary text,
  note text,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint insurance_policy_type_check check (policy_type in ('life','medical','accident','car','home','travel','investment','other')),
  constraint insurance_policy_amount_check check (
    annual_premium_cents >= 0
    and coverage_amount_cents >= 0
    and paid_claim_amount_cents >= 0
    and pending_claim_amount_cents >= 0
  ),
  constraint insurance_payment_day_check check (payment_day between 1 and 31),
  constraint insurance_status_check check (status in ('active','paused','expired'))
);

create index if not exists insurance_policies_ledger_status_idx on public.insurance_policies(ledger_id, status) where deleted_at is null;
create index if not exists insurance_policies_user_renewal_idx on public.insurance_policies(user_id, renewal_date) where deleted_at is null;

insert into public.ledger_books (owner_user_id, name, purpose, color, note, is_default, is_shared)
select profiles.user_id, '個人主帳本', 'personal', 'emerald', '由既有個人資料自動建立', true, false
from public.profiles
where not exists (
  select 1
  from public.ledger_books
  where ledger_books.owner_user_id = profiles.user_id
    and ledger_books.is_default
    and ledger_books.deleted_at is null
);

insert into public.ledger_members (ledger_id, user_id, role, status)
select ledger_books.id, ledger_books.owner_user_id, 'owner', 'active'
from public.ledger_books
where not exists (
  select 1
  from public.ledger_members
  where ledger_members.ledger_id = ledger_books.id
    and ledger_members.user_id = ledger_books.owner_user_id
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'financial_accounts','transaction_categories','transactions','recurring_transactions','loans',
    'loan_payment_schedules','loan_payments','credit_cards','credit_card_installments','credit_card_payments',
    'deposits','budgets','financial_reminders','monthly_financial_summaries','net_worth_snapshots',
    'ai_financial_reports','ai_usage_logs'
  ]
  loop
    execute format('alter table public.%I add column if not exists ledger_id uuid references public.ledger_books(id) on delete cascade', table_name);
    execute format(
      'update public.%I target set ledger_id = ledger_books.id from public.ledger_books where target.ledger_id is null and ledger_books.owner_user_id = target.user_id and ledger_books.is_default and ledger_books.deleted_at is null',
      table_name
    );
    execute format('create index if not exists %I on public.%I(ledger_id)', table_name || '_ledger_idx', table_name);
  end loop;
end;
$$;

create or replace function public.current_user_member_code()
returns text
language sql
security definer
set search_path = public
as $$
  select member_code
  from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_read_ledger(target_ledger_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ledger_members
    where ledger_id = target_ledger_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner','admin','editor','viewer')
  );
$$;

create or replace function public.can_write_ledger(target_ledger_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ledger_members
    where ledger_id = target_ledger_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner','admin','editor')
  );
$$;

create or replace function public.can_admin_ledger(target_ledger_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ledger_members
    where ledger_id = target_ledger_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner','admin')
  );
$$;

create or replace function public.assign_default_ledger_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ledger_id is null then
    select id into new.ledger_id
    from public.ledger_books
    where owner_user_id = new.user_id
      and is_default
      and deleted_at is null
    limit 1;
  end if;
  return new;
end;
$$;

create or replace function public.accept_ledger_invitation(target_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation record;
  current_email text;
  current_member_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select email, member_code
    into current_email, current_member_code
  from public.profiles
  where user_id = auth.uid();

  select *
    into invitation
  from public.ledger_invitations
  where id = target_invitation_id
    and status = 'pending'
    and expires_at > timezone('utc', now());

  if invitation.id is null then
    raise exception 'invitation not found or expired';
  end if;

  if not (
    lower(coalesce(invitation.invitee_email, '')) = lower(coalesce(current_email, ''))
    or upper(coalesce(invitation.invitee_member_code, '')) = upper(coalesce(current_member_code, ''))
  ) then
    raise exception 'invitation target mismatch';
  end if;

  insert into public.ledger_members (ledger_id, user_id, role, status, invited_by)
  values (invitation.ledger_id, auth.uid(), invitation.role, 'active', invitation.inviter_user_id)
  on conflict (ledger_id, user_id)
  do update set role = excluded.role, status = 'active', invited_by = excluded.invited_by, updated_at = timezone('utc', now());

  update public.ledger_invitations
  set status = 'accepted', accepted_at = timezone('utc', now())
  where id = target_invitation_id;

  return invitation.ledger_id;
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
    execute format('drop trigger if exists assign_%I_default_ledger_id on public.%I', table_name, table_name);
    execute format('create trigger assign_%I_default_ledger_id before insert on public.%I for each row execute function public.assign_default_ledger_id()', table_name, table_name);
  end loop;
end;
$$;

drop trigger if exists set_ledger_books_updated_at on public.ledger_books;
create trigger set_ledger_books_updated_at before update on public.ledger_books for each row execute function public.set_updated_at();
drop trigger if exists set_ledger_members_updated_at on public.ledger_members;
create trigger set_ledger_members_updated_at before update on public.ledger_members for each row execute function public.set_updated_at();
drop trigger if exists set_ledger_invitations_updated_at on public.ledger_invitations;
create trigger set_ledger_invitations_updated_at before update on public.ledger_invitations for each row execute function public.set_updated_at();
drop trigger if exists set_insurance_policies_updated_at on public.insurance_policies;
create trigger set_insurance_policies_updated_at before update on public.insurance_policies for each row execute function public.set_updated_at();

alter table public.ledger_books enable row level security;
alter table public.ledger_members enable row level security;
alter table public.ledger_invitations enable row level security;
alter table public.insurance_policies enable row level security;

drop policy if exists ledger_books_select_member on public.ledger_books;
drop policy if exists ledger_books_insert_owner on public.ledger_books;
drop policy if exists ledger_books_update_admin on public.ledger_books;
drop policy if exists ledger_books_delete_owner on public.ledger_books;
create policy ledger_books_select_member on public.ledger_books for select using (public.can_read_ledger(id));
create policy ledger_books_insert_owner on public.ledger_books for insert with check (auth.uid() = owner_user_id);
create policy ledger_books_update_admin on public.ledger_books for update using (public.can_admin_ledger(id)) with check (public.can_admin_ledger(id));
create policy ledger_books_delete_owner on public.ledger_books for delete using (
  exists (
    select 1 from public.ledger_members
    where ledger_id = ledger_books.id
      and user_id = auth.uid()
      and role = 'owner'
      and status = 'active'
  )
);

drop policy if exists ledger_members_select_member on public.ledger_members;
drop policy if exists ledger_members_insert_admin on public.ledger_members;
drop policy if exists ledger_members_update_admin on public.ledger_members;
drop policy if exists ledger_members_delete_admin_or_self on public.ledger_members;
create policy ledger_members_select_member on public.ledger_members for select using (public.can_read_ledger(ledger_id));
create policy ledger_members_insert_admin on public.ledger_members for insert with check (public.can_admin_ledger(ledger_id));
create policy ledger_members_update_admin on public.ledger_members for update using (public.can_admin_ledger(ledger_id)) with check (public.can_admin_ledger(ledger_id));
create policy ledger_members_delete_admin_or_self on public.ledger_members for delete using (public.can_admin_ledger(ledger_id) or auth.uid() = user_id);

drop policy if exists ledger_invitations_select_related on public.ledger_invitations;
drop policy if exists ledger_invitations_insert_admin on public.ledger_invitations;
drop policy if exists ledger_invitations_update_related on public.ledger_invitations;
drop policy if exists ledger_invitations_delete_admin on public.ledger_invitations;
create policy ledger_invitations_select_related on public.ledger_invitations for select using (
  public.can_admin_ledger(ledger_id)
  or inviter_user_id = auth.uid()
  or lower(invitee_email) = lower(coalesce((select email from public.profiles where user_id = auth.uid()), ''))
  or upper(invitee_member_code) = upper(coalesce(public.current_user_member_code(), ''))
);
create policy ledger_invitations_insert_admin on public.ledger_invitations for insert with check (
  public.can_admin_ledger(ledger_id)
  and inviter_user_id = auth.uid()
);
create policy ledger_invitations_update_related on public.ledger_invitations for update using (
  public.can_admin_ledger(ledger_id)
  or lower(invitee_email) = lower(coalesce((select email from public.profiles where user_id = auth.uid()), ''))
  or upper(invitee_member_code) = upper(coalesce(public.current_user_member_code(), ''))
) with check (
  public.can_admin_ledger(ledger_id)
  or lower(invitee_email) = lower(coalesce((select email from public.profiles where user_id = auth.uid()), ''))
  or upper(invitee_member_code) = upper(coalesce(public.current_user_member_code(), ''))
);
create policy ledger_invitations_delete_admin on public.ledger_invitations for delete using (public.can_admin_ledger(ledger_id));

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
    execute format('drop policy if exists "%I_select_own" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%I_insert_own" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%I_update_own" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%I_delete_own" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%I_select_ledger_member" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%I_insert_ledger_writer" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%I_update_ledger_writer" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%I_delete_ledger_writer" on public.%I', table_name, table_name);
    execute format('create policy "%I_select_ledger_member" on public.%I for select using (public.can_read_ledger(ledger_id))', table_name, table_name);
    execute format('create policy "%I_insert_ledger_writer" on public.%I for insert with check (auth.uid() = user_id and public.can_write_ledger(ledger_id))', table_name, table_name);
    execute format('create policy "%I_update_ledger_writer" on public.%I for update using (public.can_write_ledger(ledger_id)) with check (public.can_write_ledger(ledger_id))', table_name, table_name);
    execute format('create policy "%I_delete_ledger_writer" on public.%I for delete using (public.can_write_ledger(ledger_id))', table_name, table_name);
  end loop;
end;
$$;
