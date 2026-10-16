-- Story 2.14, owner decision of 2026-10-16: client info is live. Every case
-- history, draft or approved, shows the client's current logo, name, sector and
-- description; nothing is copied per case or per revision. So a replaced or
-- removed logo is deleted for real (its row here, its object by the case-study
-- adapter). Forward-only (AD-12): `20261016140000_case_study_client_info.sql`
-- is already applied and stays as it is. RLS and the revokes on `client_logo` stay.

-- `client_logo` is no longer append-only.
drop trigger client_logo_reject_update_delete on public.client_logo;
drop trigger client_logo_reject_truncate on public.client_logo;
drop function public.client_logo_reject_change();

-- Deletes one logo row, only when no client points at it. Raises P0001
-- `CLIENT_LOGO_IN_USE` otherwise (nothing is deleted then). Returns false when
-- no row has this id. Takes the client advisory lock, like `update_client`, so a
-- concurrent edit can't link the logo while it is being deleted. Service role only.
create function public.delete_client_logo(p_logo_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.client'));

  if exists (select 1 from public.client where logo_id = p_logo_id) then
    raise exception 'CLIENT_LOGO_IN_USE' using errcode = 'P0001';
  end if;

  delete from public.client_logo where id = p_logo_id;
  return found;
end;
$$;

revoke all on function public.delete_client_logo(uuid) from public, anon, authenticated;
grant execute on function public.delete_client_logo(uuid) to service_role;
