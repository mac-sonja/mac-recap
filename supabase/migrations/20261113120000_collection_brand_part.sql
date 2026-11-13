-- MAC's own intro and outro of every Presentazione file as a collection part, owned by the
-- `collection` module. Forward-only (AD-12); runs as one transaction. No applied migration is
-- edited.
--
-- The renderer adds two fixed brand pages around every Presentazione file ("Our projects" and
-- the company details). They are code constants, never stored in a document or a revision. A
-- collection may change the "Our projects" title's words and hide either page, like any part:
-- `part_kind` 'brand' with the fixed sentinel `part_id`
-- '4d414300-0000-4000-8000-000000000000' ("MAC" in hex; `BRAND_PART_ID` in
-- src/modules/rendering/brand/pages.ts). Every collection has it; the module checks the pages and
-- the format (Presentazione only) before calling a writer.

-- ---------------------------------------------------------------------------
-- The part kind CHECKs take 'brand'
-- ---------------------------------------------------------------------------

alter table public.collection_text_edit drop constraint collection_text_edit_part_kind_check;
alter table public.collection_text_edit add constraint collection_text_edit_part_kind_check
  check (part_kind in ('case', 'client_intro', 'brand'));

alter table public.collection_hidden_page drop constraint collection_hidden_page_part_kind_check;
alter table public.collection_hidden_page add constraint collection_hidden_page_part_kind_check
  check (part_kind in ('case', 'client_intro', 'brand'));

alter table public.collection_page_order drop constraint collection_page_order_part_kind_check;
alter table public.collection_page_order add constraint collection_page_order_part_kind_check
  check (part_kind in ('case', 'client_intro', 'brand'));

-- MAC's part has exactly one id: the sentinel.
alter table public.collection_text_edit add constraint collection_text_edit_brand_part_id_check
  check (part_kind <> 'brand' or part_id = '4d414300-0000-4000-8000-000000000000'::uuid);
alter table public.collection_hidden_page add constraint collection_hidden_page_brand_part_id_check
  check (part_kind <> 'brand' or part_id = '4d414300-0000-4000-8000-000000000000'::uuid);
alter table public.collection_page_order add constraint collection_page_order_brand_part_id_check
  check (part_kind <> 'brand' or part_id = '4d414300-0000-4000-8000-000000000000'::uuid);

-- ---------------------------------------------------------------------------
-- The writers' part check takes MAC's part
-- ---------------------------------------------------------------------------

-- Checks a part of collection `p_collection_id` and one of its formats: a case in it, a client
-- with a case in it, or MAC's part (the sentinel id) of a live collection; a well-formed format.
-- Raises P0001 `INVALID_INPUT` (detail `part`) otherwise. Same signature and grants as before.
create or replace function public.collection_check_part(p_collection_id uuid, p_part_kind text, p_part_id uuid, p_format text)
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
  elsif p_part_kind = 'brand' then
    if p_part_id <> '4d414300-0000-4000-8000-000000000000'::uuid then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'part';
    end if;
  else
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'part';
  end if;
end;
$$;

revoke all on function public.collection_check_part(uuid, text, uuid, text) from public, anon, authenticated, service_role;
