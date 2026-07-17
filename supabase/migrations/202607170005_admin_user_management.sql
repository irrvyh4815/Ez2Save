alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists suspended_at timestamptz,
  add column if not exists admin_note text;

create index if not exists profiles_active_role_idx on public.profiles(is_active, role, created_at desc);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint admin_audit_logs_action_check check (action in ('role_updated', 'status_updated', 'recovery_sent', 'account_deleted', 'note_updated'))
);

create index if not exists admin_audit_logs_target_created_idx on public.admin_audit_logs(target_user_id, created_at desc);
create index if not exists admin_audit_logs_actor_created_idx on public.admin_audit_logs(actor_user_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

drop policy if exists admin_audit_logs_select_super_admin on public.admin_audit_logs;
create policy admin_audit_logs_select_super_admin on public.admin_audit_logs
  for select using (public.is_current_super_admin());

create or replace function public.is_admin_actor_context()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = nullif(current_setting('app.admin_actor_user_id', true), '')::uuid
      and role = 'super_admin'
      and is_super_admin = true
      and is_active = true
  );
$$;

create or replace function public.protect_profile_role_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.role is distinct from old.role
    or new.is_super_admin is distinct from old.is_super_admin
    or new.admin_granted_at is distinct from old.admin_granted_at
    or new.admin_granted_by is distinct from old.admin_granted_by
    or new.is_active is distinct from old.is_active
    or new.suspended_at is distinct from old.suspended_at
    or new.admin_note is distinct from old.admin_note
  ) and not (public.is_current_super_admin() or public.is_admin_actor_context()) then
    raise exception 'profile management fields are protected';
  end if;

  if new.is_super_admin and new.role <> 'super_admin' then
    raise exception 'super admin profile must use super_admin role';
  end if;

  if public.is_seed_super_admin_email(old.email)
    and (new.role <> 'super_admin' or new.is_super_admin is not true or new.is_active is not true) then
    raise exception 'seed super admin cannot be changed';
  end if;

  return new;
end;
$$;

create or replace function public.admin_manage_user_profile(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_role text default null,
  p_is_active boolean default null,
  p_note text default null
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  member_code text,
  role text,
  is_super_admin boolean,
  is_active boolean,
  suspended_at timestamptz,
  admin_note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_is_super_admin boolean;
  target_email text;
  audit_action text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'admin management is server only';
  end if;

  if p_actor_user_id is null or p_target_user_id is null then
    raise exception 'actor and target are required';
  end if;

  if p_actor_user_id = p_target_user_id then
    raise exception 'administrators cannot change their own access here';
  end if;

  if not exists (
    select 1 from public.profiles
    where user_id = p_actor_user_id
      and role = 'super_admin'
      and is_super_admin = true
      and is_active = true
  ) then
    raise exception 'administrator permission required';
  end if;

  select is_super_admin, email
  into target_is_super_admin, target_email
  from public.profiles
  where user_id = p_target_user_id;

  if not found then
    raise exception 'target user not found';
  end if;

  if target_is_super_admin then
    raise exception 'super administrator accounts cannot be changed here';
  end if;

  perform set_config('app.admin_actor_user_id', p_actor_user_id::text, true);

  if p_action = 'role' then
    if p_role not in ('user', 'admin') then
      raise exception 'invalid role';
    end if;

    update public.profiles
    set role = p_role,
        is_super_admin = false,
        admin_granted_at = case when p_role = 'admin' then timezone('utc', now()) else null end,
        admin_granted_by = case when p_role = 'admin' then p_actor_user_id else null end,
        updated_at = timezone('utc', now())
    where profiles.user_id = p_target_user_id;
    audit_action := 'role_updated';
  elsif p_action = 'status' then
    if p_is_active is null then
      raise exception 'active status is required';
    end if;

    update public.profiles
    set is_active = p_is_active,
        suspended_at = case when p_is_active then null else timezone('utc', now()) end,
        updated_at = timezone('utc', now())
    where profiles.user_id = p_target_user_id;
    audit_action := 'status_updated';
  elsif p_action = 'note' then
    update public.profiles
    set admin_note = nullif(left(trim(coalesce(p_note, '')), 500), ''),
        updated_at = timezone('utc', now())
    where profiles.user_id = p_target_user_id;
    audit_action := 'note_updated';
  else
    raise exception 'invalid management action';
  end if;

  insert into public.admin_audit_logs (user_id, actor_user_id, target_user_id, action, metadata)
  values (
    p_target_user_id,
    p_actor_user_id,
    p_target_user_id,
    audit_action,
    jsonb_build_object('email', target_email, 'role', p_role, 'is_active', p_is_active)
  );

  return query
  select
    profiles.user_id,
    profiles.email,
    profiles.display_name,
    profiles.member_code,
    profiles.role,
    profiles.is_super_admin,
    profiles.is_active,
    profiles.suspended_at,
    profiles.admin_note,
    profiles.created_at,
    profiles.updated_at
  from public.profiles
  where profiles.user_id = p_target_user_id;
end;
$$;

revoke all on function public.admin_manage_user_profile(uuid, uuid, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_manage_user_profile(uuid, uuid, text, text, boolean, text) to service_role;

create or replace function public.set_admin_audit_logs_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_admin_audit_logs_updated_at on public.admin_audit_logs;
create trigger set_admin_audit_logs_updated_at
before update on public.admin_audit_logs
for each row execute function public.set_admin_audit_logs_updated_at();
