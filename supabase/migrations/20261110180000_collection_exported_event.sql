-- Story 5.10b: a collection's export is logged in its own `collection_event` log, owned by the
-- `collection` module. Forward-only (AD-12); runs as one transaction. No applied migration is
-- edited.
--
-- `record_collection_exported`: appends one `collection_exported` event (`data { exportId,
-- format }`) each time a collection's file is handed out, as a client pack's delivery records its
-- export events. An export changes nothing in the collection: the version is not bumped, and the
-- event carries the version it was exported at. Like every collection writer it is a
-- security-definer function executable by the service role only; the log stays append-only.

-- Appends a `collection_exported` event to live collection `p_collection_id` by `p_actor_id`,
-- with `p_export_id` and `p_format` (a format id or `bundle`). Raises P0001 `INVALID_INPUT` or
-- `COLLECTION_NOT_FOUND` (unknown or deleted); nothing is written then.
create function public.record_collection_exported(p_collection_id uuid, p_actor_id uuid, p_export_id uuid, p_format text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_version integer;
begin
  if p_collection_id is null or p_actor_id is null or p_export_id is null
     or p_format is null or p_format !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  select version into current_version from public.collection where id = p_collection_id and deleted_at is null;
  if not found then
    raise exception 'COLLECTION_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.collection_event (collection_id, actor_id, type, version, data)
  values (p_collection_id, p_actor_id, 'collection_exported', current_version,
          jsonb_build_object('exportId', p_export_id, 'format', p_format));
end;
$$;

revoke all on function public.record_collection_exported(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_collection_exported(uuid, uuid, uuid, text) to service_role;
