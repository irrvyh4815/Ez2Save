alter table public.profiles
  add column if not exists email text,
  add column if not exists role text not null default 'user',
  add column if not exists is_super_admin boolean not null default false,
  add column if not exists admin_granted_at timestamptz,
  add column if not exists admin_granted_by uuid references auth.users(id) on delete set null;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'admin', 'super_admin'));

create index if not exists profiles_role_idx on public.profiles(role);
create unique index if not exists profiles_email_lower_unique_idx on public.profiles(lower(email)) where email is not null;

create or replace function public.is_seed_super_admin_email(candidate_email text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(candidate_email, '')) = 'irrvyh4815@gmail.com';
$$;

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
  )
  or public.is_seed_super_admin_email(auth.jwt() ->> 'email');
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  should_be_super_admin boolean;
begin
  should_be_super_admin := public.is_seed_super_admin_email(new.email);

  insert into public.profiles (
    id,
    user_id,
    email,
    display_name,
    role,
    is_super_admin,
    admin_granted_at,
    metadata
  )
  values (
    new.id,
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case when should_be_super_admin then 'super_admin' else 'user' end,
    should_be_super_admin,
    case when should_be_super_admin then timezone('utc', now()) else null end,
    jsonb_build_object('auth_provider', coalesce(new.app_metadata ->> 'provider', 'email'))
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        role = case when should_be_super_admin then 'super_admin' else public.profiles.role end,
        is_super_admin = case when should_be_super_admin then true else public.profiles.is_super_admin end,
        admin_granted_at = case when should_be_super_admin then coalesce(public.profiles.admin_granted_at, timezone('utc', now())) else public.profiles.admin_granted_at end,
        updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

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
  ) and not public.is_current_super_admin() then
    raise exception 'profile role fields are protected';
  end if;

  if new.is_super_admin and new.role <> 'super_admin' then
    raise exception 'super admin profile must use super_admin role';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_role_update on public.profiles;
create trigger protect_profile_role_update
before update on public.profiles
for each row execute function public.protect_profile_role_update();

insert into public.profiles (
  id,
  user_id,
  email,
  display_name,
  role,
  is_super_admin,
  admin_granted_at,
  metadata
)
select
  users.id,
  users.id,
  users.email,
  coalesce(users.raw_user_meta_data ->> 'display_name', users.raw_user_meta_data ->> 'name', split_part(users.email, '@', 1)),
  case when public.is_seed_super_admin_email(users.email) then 'super_admin' else 'user' end,
  public.is_seed_super_admin_email(users.email),
  case when public.is_seed_super_admin_email(users.email) then timezone('utc', now()) else null end,
  jsonb_build_object('auth_provider', coalesce(users.app_metadata ->> 'provider', 'email'))
from auth.users
where users.email is not null
on conflict (id) do update
  set email = excluded.email,
      role = case when public.is_seed_super_admin_email(excluded.email) then 'super_admin' else public.profiles.role end,
      is_super_admin = case when public.is_seed_super_admin_email(excluded.email) then true else public.profiles.is_super_admin end,
      admin_granted_at = case when public.is_seed_super_admin_email(excluded.email) then coalesce(public.profiles.admin_granted_at, timezone('utc', now())) else public.profiles.admin_granted_at end,
      updated_at = timezone('utc', now());

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_super_admin on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_update_super_admin on public.profiles;

create policy profiles_select_own on public.profiles
  for select using (auth.uid() = user_id);

create policy profiles_select_super_admin on public.profiles
  for select using (public.is_current_super_admin());

create policy profiles_insert_own on public.profiles
  for insert with check (
    auth.uid() = user_id
    and id = auth.uid()
    and role = case when public.is_seed_super_admin_email(auth.jwt() ->> 'email') then 'super_admin' else 'user' end
    and is_super_admin = public.is_seed_super_admin_email(auth.jwt() ->> 'email')
  );

create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and id = auth.uid());

create policy profiles_update_super_admin on public.profiles
  for update using (public.is_current_super_admin())
  with check (public.is_current_super_admin());
