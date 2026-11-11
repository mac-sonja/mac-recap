-- Story 5.11a: a collection's own edits, owned by the `collection` module. Forward-only
-- (AD-12); runs as one transaction. No applied migration is edited.
--
-- A collection can change, for itself only, the words of a page's free texts, hide pages and put
-- a part's pages in another order. A part is one of its cases (`part_kind` 'case', `part_id` the
-- case) or a client's intro document (`part_kind` 'client_intro', `part_id` the client). Edits are
-- per format, as pages are.
--
-- `collection_text_edit`: the collection's words for one free text (`element_id`) of one page,
-- with the sha256 (hex) of the original words when the edit was saved, so a later change to the
-- original shows instead of being merged silently. `collection_hidden_page`: a page left out.
-- `collection_page_order`: a part's page keys in the collection's order.
--
-- Nothing here ever writes a revision, a client or a client intro: the originals stay as they
-- are. Same pattern as 20261110160000_collection.sql: RLS on with no policies, every table
-- revoked from anon and authenticated, the service role may only read, and every write goes
-- through a security-definer function executable by the service role only, a compare-and-set on
-- `collection.version` (`STALE_COLLECTION`) that logs one `collection_event`.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.collection_text_edit (
  collection_id uuid not null constraint collection_text_edit_collection_id_fkey references public.collection (id),
  part_kind text not null constraint collection_text_edit_part_kind_check check (part_kind in ('case', 'client_intro')),
  part_id uuid not null,
  format text not null constraint collection_text_edit_format_check check (format ~ '^[a-z0-9_]{1,64}$'),
  page_key text not null constraint collection_text_edit_page_key_check check (page_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  element_id uuid not null,
  -- The document's text limit (`MAX_TEXT_CHARS` in generation/domain/document.ts).
  text text not null constraint collection_text_edit_text_check check (char_length(text) <= 5000),
  original_hash text not null constraint collection_text_edit_original_hash_check check (original_hash ~ '^[0-9a-f]{64}$'),
  updated_by uuid not null constraint collection_text_edit_updated_by_fkey references public.profile (id),
  updated_at timestamptz not null default now(),
  constraint collection_text_edit_pkey primary key (collection_id, part_kind, part_id, format, page_key, element_id)
);

create table public.collection_hidden_page (
  collection_id uuid not null constraint collection_hidden_page_collection_id_fkey references public.collection (id),
  part_kind text not null constraint collection_hidden_page_part_kind_check check (part_kind in ('case', 'client_intro')),
  part_id uuid not null,
  format text not null constraint collection_hidden_page_format_check check (format ~ '^[a-z0-9_]{1,64}$'),
  page_key text not null constraint collection_hidden_page_page_key_check check (page_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint collection_hidden_page_pkey primary key (collection_id, part_kind, part_id, format, page_key)
);

create table public.collection_page_order (
  collection_id uuid not null constraint collection_page_order_collection_id_fkey references public.collection (id),
  part_kind text not null constraint collection_page_order_part_kind_check check (part_kind in ('case', 'client_intro')),
  part_id uuid not null,
  format text not null constraint collection_page_order_format_check check (format ~ '^[a-z0-9_]{1,64}$'),
  -- 1–50 page keys (`MAX_PAGES_PER_FORMAT`), each once; checked by the writer.
  page_keys text[] not null constraint collection_page_order_page_keys_check check (cardinality(page_keys) between 1 and 50),
  constraint collection_page_order_pkey primary key (collection_id, part_kind, part_id, format)
);

-- Backstop: RLS on with no policies denies anon and authenticated. The service role may only read.
alter table public.collection_text_edit enable row level security;
alter table public.collection_hidden_page enable row level security;
alter table public.collection_page_order enable row level security;
revoke all on table public.collection_text_edit from public, anon, authenticated, service_role;
revoke all on table public.collection_hidden_page from public, anon, authenticated, service_role;
revoke all on table public.collection_page_order from public, anon, authenticated, service_role;
grant select on table public.collection_text_edit to service_role;
grant select on table public.collection_hidden_page to service_role;
grant select on table public.collection_page_order to service_role;

-- ---------------------------------------------------------------------------
-- Helpers (not executable by anyone but the writers below)
-- ---------------------------------------------------------------------------

-- Checks a part of collection `p_collection_id` and one of its formats: a case in it, or a client
-- with a case in it; a well-formed format. Raises P0001 `INVALID_INPUT` (detail `part`) otherwise.
create function public.collection_check_part(p_collection_id uuid, p_part_kind text, p_part_id uuid, p_format text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_part_kind is null or p_part_id is null or p_format is null or p_format !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'part';
  end if;
  if p_part_kind = 'case' then
    if not exists (select 1 from public.collection_item where collection_id = p_collection_id and case_id = p_part_id) then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'part';
    end if;
  elsif p_part_kind = 'client_intro' then
    if not exists (
      select 1 from public.collection_item item join public.case_study c on c.id = item.case_id
       where item.collection_id = p_collection_id and c.client_id = p_part_id
    ) then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'part';
    end if;
  else
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'part';
  end if;
end;
$$;

revoke all on function public.collection_check_part(uuid, text, uuid, text) from public, anon, authenticated, service_role;

-- Bumps live collection `p_collection_id`'s version (already locked by `collection_lock`) and logs
-- `p_type` with `p_data` at the new version. Returns the new version.
create function public.collection_bump(p_collection_id uuid, p_actor_id uuid, p_type text, p_data jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  next_version integer;
begin
  update public.collection set version = version + 1, updated_at = now() where id = p_collection_id returning version into next_version;
  insert into public.collection_event (collection_id, actor_id, type, version, data) values (p_collection_id, p_actor_id, p_type, next_version, p_data);
  return next_version;
end;
$$;

revoke all on function public.collection_bump(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Writers (service role only)
-- ---------------------------------------------------------------------------

-- Sets the collection's words `p_text` for free text `p_element_id` of page `p_page_key` of a
-- part in format `p_format`, with `p_original_hash` (the sha256 of the original words, worked out
-- by the module from the live approved revision), if the collection's version is still
-- `p_expected_version`. Logs `collection_text_edited`. Returns the new version. Raises P0001
-- `INVALID_INPUT`, `COLLECTION_NOT_FOUND` or `STALE_COLLECTION`; nothing is written then.
create function public.set_collection_text_edit(
  p_collection_id uuid,
  p_expected_version integer,
  p_part_kind text,
  p_part_id uuid,
  p_format text,
  p_page_key text,
  p_element_id uuid,
  p_text text,
  p_original_hash text,
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or p_element_id is null
     or p_page_key is null or p_page_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
     or p_text is null or char_length(p_text) > 5000
     or p_original_hash is null or p_original_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  perform public.collection_lock(p_collection_id, p_expected_version);
  perform public.collection_check_part(p_collection_id, p_part_kind, p_part_id, p_format);
  insert into public.collection_text_edit (collection_id, part_kind, part_id, format, page_key, element_id, text, original_hash, updated_by)
  values (p_collection_id, p_part_kind, p_part_id, p_format, p_page_key, p_element_id, p_text, p_original_hash, p_actor_id)
  on conflict (collection_id, part_kind, part_id, format, page_key, element_id)
  do update set text = excluded.text, original_hash = excluded.original_hash, updated_by = excluded.updated_by, updated_at = now();
  return public.collection_bump(p_collection_id, p_actor_id, 'collection_text_edited', jsonb_build_object(
    'part', jsonb_build_object('kind', p_part_kind, 'id', p_part_id),
    'format', p_format, 'pageKey', p_page_key, 'elementId', p_element_id, 'text', p_text
  ));
end;
$$;

-- Removes the collection's words for a free text (**Ripristina testo originale**, **Usa
-- originale**), if the version is still `p_expected_version`: the original shows again. Logs
-- `collection_text_restored` (also when there was no edit). Returns the new version. Raises P0001
-- `INVALID_INPUT`, `COLLECTION_NOT_FOUND` or `STALE_COLLECTION`; nothing is written then.
create function public.delete_collection_text_edit(
  p_collection_id uuid,
  p_expected_version integer,
  p_part_kind text,
  p_part_id uuid,
  p_format text,
  p_page_key text,
  p_element_id uuid,
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or p_element_id is null or p_page_key is null or p_page_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  perform public.collection_lock(p_collection_id, p_expected_version);
  perform public.collection_check_part(p_collection_id, p_part_kind, p_part_id, p_format);
  delete from public.collection_text_edit
   where collection_id = p_collection_id and part_kind = p_part_kind and part_id = p_part_id
     and format = p_format and page_key = p_page_key and element_id = p_element_id;
  return public.collection_bump(p_collection_id, p_actor_id, 'collection_text_restored', jsonb_build_object(
    'part', jsonb_build_object('kind', p_part_kind, 'id', p_part_id),
    'format', p_format, 'pageKey', p_page_key, 'elementId', p_element_id
  ));
end;
$$;

-- Hides (**Elimina dalla raccolta**) or shows again (**Ripristina**) page `p_page_key` of a part
-- in format `p_format`, if the version is still `p_expected_version`. A part keeps at least one
-- page: the module checks it against the live revision before calling. Logs
-- `collection_page_hidden` or `collection_page_restored`. Returns the new version. Raises P0001
-- `INVALID_INPUT`, `COLLECTION_NOT_FOUND` or `STALE_COLLECTION`; nothing is written then.
create function public.set_collection_page_hidden(
  p_collection_id uuid,
  p_expected_version integer,
  p_part_kind text,
  p_part_id uuid,
  p_format text,
  p_page_key text,
  p_hidden boolean,
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or p_hidden is null or p_page_key is null or p_page_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  perform public.collection_lock(p_collection_id, p_expected_version);
  perform public.collection_check_part(p_collection_id, p_part_kind, p_part_id, p_format);
  if p_hidden then
    insert into public.collection_hidden_page (collection_id, part_kind, part_id, format, page_key)
    values (p_collection_id, p_part_kind, p_part_id, p_format, p_page_key)
    on conflict do nothing;
  else
    delete from public.collection_hidden_page
     where collection_id = p_collection_id and part_kind = p_part_kind and part_id = p_part_id
       and format = p_format and page_key = p_page_key;
  end if;
  return public.collection_bump(p_collection_id, p_actor_id, case when p_hidden then 'collection_page_hidden' else 'collection_page_restored' end,
    jsonb_build_object('part', jsonb_build_object('kind', p_part_kind, 'id', p_part_id), 'format', p_format, 'pageKey', p_page_key));
end;
$$;

-- Sets a part's page order in format `p_format` (1–50 page keys, each once), if the version is
-- still `p_expected_version`. Logs `collection_pages_moved`. Returns the new version. Raises P0001
-- `INVALID_INPUT`, `COLLECTION_NOT_FOUND` or `STALE_COLLECTION`; nothing is written then.
create function public.set_collection_page_order(
  p_collection_id uuid,
  p_expected_version integer,
  p_part_kind text,
  p_part_id uuid,
  p_format text,
  p_page_keys text[],
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or p_page_keys is null
     or coalesce(array_ndims(p_page_keys), 1) <> 1
     or cardinality(p_page_keys) < 1 or cardinality(p_page_keys) > 50
     or array_position(p_page_keys, null) is not null
     or cardinality(p_page_keys) <> (select count(distinct k) from unnest(p_page_keys) as k)
     or exists (select 1 from unnest(p_page_keys) as k where k !~ '^[a-z0-9][a-z0-9_-]{0,63}$') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'pageKeys';
  end if;
  perform public.collection_lock(p_collection_id, p_expected_version);
  perform public.collection_check_part(p_collection_id, p_part_kind, p_part_id, p_format);
  insert into public.collection_page_order (collection_id, part_kind, part_id, format, page_keys)
  values (p_collection_id, p_part_kind, p_part_id, p_format, p_page_keys)
  on conflict (collection_id, part_kind, part_id, format) do update set page_keys = excluded.page_keys;
  return public.collection_bump(p_collection_id, p_actor_id, 'collection_pages_moved',
    jsonb_build_object('part', jsonb_build_object('kind', p_part_kind, 'id', p_part_id), 'format', p_format, 'pageKeys', to_jsonb(p_page_keys)));
end;
$$;

revoke all on function public.set_collection_text_edit(uuid, integer, text, uuid, text, text, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_collection_text_edit(uuid, integer, text, uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_collection_page_hidden(uuid, integer, text, uuid, text, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.set_collection_page_order(uuid, integer, text, uuid, text, text[], uuid) from public, anon, authenticated;
grant execute on function public.set_collection_text_edit(uuid, integer, text, uuid, text, text, uuid, text, text, uuid) to service_role;
grant execute on function public.delete_collection_text_edit(uuid, integer, text, uuid, text, text, uuid, uuid) to service_role;
grant execute on function public.set_collection_page_hidden(uuid, integer, text, uuid, text, text, boolean, uuid) to service_role;
grant execute on function public.set_collection_page_order(uuid, integer, text, uuid, text, text[], uuid) to service_role;
