-- Story 6.3: manage users and their roles. Forward-only (AD-12).

-- Only the seeded system profile may hold the `system` role, so neither Add user
-- nor a role change can assign it (follow-up from the Story 2.3 review).
alter table public.profile
  add constraint profile_system_role_only_seeded
  check (role <> 'system' or id = '00000000-0000-4000-8000-000000000001');

-- The last enabled admin can't lose the role or be disabled. The action checks
-- first and says so; this is the backstop for two admins acting at once (the
-- advisory lock serialises the check across rows).
create function public.profile_keep_last_admin() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if old.role = 'admin' and old.disabled_at is null
     and (new.role <> 'admin' or new.disabled_at is not null) then
    perform pg_advisory_xact_lock(hashtext('profile_keep_last_admin'));
    if not exists (
      select 1 from public.profile
      where role = 'admin' and disabled_at is null and id <> old.id
    ) then
      raise exception 'LAST_ADMIN' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.profile_keep_last_admin() from public, anon, authenticated;

create trigger profile_keep_last_admin
  before update of role, disabled_at on public.profile
  for each row execute function public.profile_keep_last_admin();
