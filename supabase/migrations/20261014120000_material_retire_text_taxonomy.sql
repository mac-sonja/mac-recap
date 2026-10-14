-- Story 2.8: retire pasted text and the taxonomy (Sprint Change Proposal
-- 2026-10-14, C6–C8), owned by the `material` module (AD-11). Forward-only (AD-12).
--
-- Material is now uploaded files only: `has_material` counts live assets and
-- nothing else (the details form still never counts, NFR6). The taxonomy
-- (`taxonomy_term`, `material_term` and their functions) and `text_item` are
-- dropped. Past `text_*`, `asset_restored` and `terms_set` events stay as written.
--
-- `restore_asset` stays, but only as `removeAsset`'s compensation when the
-- `asset_removed` event write fails (owner decision, 2026-10-14). No feature
-- restores a removed file.

-- True when the case exists, is not soft-deleted and has at least one
-- non-deleted asset. The details form never counts. Service role only.
-- `create or replace` keeps the existing grants; they are re-stated below.
create or replace function public.has_material(p_case_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.case_study c where c.id = p_case_id and c.deleted_at is null
  ) and exists (
    select 1 from public.asset a where a.case_id = p_case_id and a.deleted_at is null
  );
$$;

revoke all on function public.has_material(uuid) from public, anon, authenticated;
grant execute on function public.has_material(uuid) to service_role;

-- The taxonomy: functions first, then the link table, then the terms (dropping
-- a table also drops its triggers), then the trigger function.
drop function public.set_material_terms(uuid, text, uuid, text, text[]);
drop function public.case_material_terms(uuid);
drop table public.material_term;
drop table public.taxonomy_term;
drop function public.taxonomy_term_reject_delete();

-- Pasted text: the table (and its triggers), then its trigger functions.
drop table public.text_item;
drop function public.text_item_touch_updated_at();
drop function public.text_item_reject_delete();

comment on function public.restore_asset(uuid, uuid) is
  'Compensation only: removeAsset calls it (undoSoftDelete) when the asset_removed event write fails. No feature restores a removed file (Story 2.8).';
