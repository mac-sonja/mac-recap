-- Story 2.9 (backend): the fixed taxonomy and its links to deliverables, owned by
-- the `material` module (AD-11). Forward-only (AD-12).
--
-- `taxonomy_term` is reference data: only migrations write it (no API creates,
-- renames or deletes a term, and no API role may write it). Code refers to a
-- term only by its stable `key`; `label` is display-only and may be renamed by
-- a later migration. No seed rows here: the OP 3 values arrive by a later seed
-- migration.
--
-- `material_term` links a deliverable (a live asset or live text item) to terms.
-- A deliverable can have several terms of every kind. A removed deliverable
-- keeps its links, so restoring it brings them back.

create table public.taxonomy_term (
  id uuid primary key default gen_random_uuid(),
  -- Must list exactly TERM_KINDS in material/domain/taxonomy.ts.
  kind text not null constraint taxonomy_term_kind_check check (kind in ('tag', 'property', 'flag')),
  -- TERM_KEY_PATTERN / MAX_TERM_KEY_CHARS in material/domain/taxonomy.ts.
  key text not null
    constraint taxonomy_term_key_key unique
    constraint taxonomy_term_key_check check (key ~ '^[a-z][a-z0-9_]*$' and char_length(key) <= 64),
  label text not null constraint taxonomy_term_label_check check (btrim(label) <> '' and char_length(label) <= 200)
);

-- Backstop: the browser never queries tables. RLS on with no policies denies
-- anon and authenticated. The server's service role may read terms but never
-- write them: only migrations (run as the table owner) do.
alter table public.taxonomy_term enable row level security;
revoke all on table public.taxonomy_term from anon, authenticated;
revoke all on table public.taxonomy_term from service_role;
grant select on table public.taxonomy_term to service_role;

-- Terms are never deleted (links reference them); a migration renames a label instead.
create function public.taxonomy_term_reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'taxonomy_term rows are never deleted (%)', tg_op using errcode = 'P0001';
end;
$$;

create trigger taxonomy_term_reject_delete
  before delete on public.taxonomy_term
  for each row execute function public.taxonomy_term_reject_delete();

create trigger taxonomy_term_reject_truncate
  before truncate on public.taxonomy_term
  for each statement execute function public.taxonomy_term_reject_delete();

revoke all on function public.taxonomy_term_reject_delete() from public, anon, authenticated;

create table public.material_term (
  id uuid primary key default gen_random_uuid(),
  -- Must list exactly DELIVERABLE_KINDS in material/domain/taxonomy.ts.
  ref_kind text not null constraint material_term_ref_kind_check check (ref_kind in ('asset', 'text')),
  -- An `asset.id` (ref_kind asset) or a `text_item.id` (ref_kind text).
  ref_id uuid not null,
  term_id uuid not null constraint material_term_term_id_fkey references public.taxonomy_term (id),
  created_at timestamptz not null default now(),
  constraint material_term_ref_term_key unique (ref_kind, ref_id, term_id)
);

create index material_term_term_id_idx on public.material_term (term_id);

alter table public.material_term enable row level security;
revoke all on table public.material_term from anon, authenticated;

-- Replaces the terms of one kind on one live deliverable of a live case with
-- `p_keys` (duplicates ignored; an empty array clears that kind). Terms of the
-- other kinds are untouched. Serialized per deliverable. Returns the keys of
-- that kind the deliverable had before (sorted bytewise, like the app), so the caller can put them
-- back. Raises P0001 `NOT_FOUND` (unknown or soft-deleted case, or no live
-- deliverable of that kind in the case) or `UNKNOWN_TERM` (a key that is not a
-- term of `p_kind`; the key is in the error detail); nothing is written then.
-- Service role only.
create function public.set_material_terms(
  p_case_id uuid,
  p_ref_kind text,
  p_ref_id uuid,
  p_kind text,
  p_keys text[]
)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  keys text[] := coalesce(p_keys, '{}'::text[]);
  missing text;
  previous text[];
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('material_term:' || coalesce(p_ref_kind, '') || ':' || coalesce(p_ref_id::text, ''), 0)
  );

  perform 1 from public.case_study where id = p_case_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_ref_kind = 'asset' then
    perform 1 from public.asset where id = p_ref_id and case_id = p_case_id and deleted_at is null;
  elsif p_ref_kind = 'text' then
    perform 1 from public.text_item where id = p_ref_id and case_id = p_case_id and deleted_at is null;
  else
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_kind is null or p_kind not in ('tag', 'property', 'flag') then
    raise exception 'UNKNOWN_TERM' using errcode = 'P0001', detail = '';
  end if;

  select u.k into missing
  from unnest(keys) with ordinality as u (k, n)
  where not exists (select 1 from public.taxonomy_term t where t.key = u.k and t.kind = p_kind)
  order by u.n
  limit 1;
  if found then
    raise exception 'UNKNOWN_TERM' using errcode = 'P0001', detail = coalesce(missing, '');
  end if;

  select coalesce(array_agg(t.key order by t.key collate "C"), '{}'::text[]) into previous
  from public.material_term mt
  join public.taxonomy_term t on t.id = mt.term_id
  where mt.ref_kind = p_ref_kind and mt.ref_id = p_ref_id and t.kind = p_kind;

  delete from public.material_term mt
  using public.taxonomy_term t
  where t.id = mt.term_id and mt.ref_kind = p_ref_kind and mt.ref_id = p_ref_id and t.kind = p_kind;

  insert into public.material_term (ref_kind, ref_id, term_id)
  select p_ref_kind, p_ref_id, t.id
  from public.taxonomy_term t
  where t.kind = p_kind and t.key = any (keys);

  return previous;
end;
$$;

revoke all on function public.set_material_terms(uuid, text, uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.set_material_terms(uuid, text, uuid, text, text[]) to service_role;

-- The terms of every live deliverable of a live case, as a JSON array of
-- `{ refKind, refId, terms: [{ kind, key }] }` (deliverables oldest first, terms
-- by label then key; an untagged deliverable has `terms: []`). Removed
-- deliverables are left out (their links stay). An unknown or soft-deleted case
-- gives `[]`. Service role only.
create function public.case_material_terms(p_case_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with deliverable as (
    select 'asset'::text as ref_kind, a.id as ref_id, a.created_at
    from public.asset a
    join public.case_study c on c.id = a.case_id and c.deleted_at is null
    where a.case_id = p_case_id and a.deleted_at is null
    union all
    select 'text'::text, ti.id, ti.created_at
    from public.text_item ti
    join public.case_study c on c.id = ti.case_id and c.deleted_at is null
    where ti.case_id = p_case_id and ti.deleted_at is null
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'refKind', d.ref_kind,
        'refId', d.ref_id,
        'terms', coalesce(
          (
            select jsonb_agg(jsonb_build_object('kind', t.kind, 'key', t.key) order by t.label, t.key)
            from public.material_term mt
            join public.taxonomy_term t on t.id = mt.term_id
            where mt.ref_kind = d.ref_kind and mt.ref_id = d.ref_id
          ),
          '[]'::jsonb
        )
      )
      order by d.created_at, d.ref_kind, d.ref_id
    ),
    '[]'::jsonb
  )
  from deliverable d;
$$;

revoke all on function public.case_material_terms(uuid) from public, anon, authenticated;
grant execute on function public.case_material_terms(uuid) to service_role;
