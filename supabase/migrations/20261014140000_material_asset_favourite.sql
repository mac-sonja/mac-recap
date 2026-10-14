-- Story 2.9: mark images and videos as favourite (Sprint Change Proposal
-- 2026-10-14, AD-14, AR14), owned by the `material` module (AD-11). Forward-only (AD-12).
--
-- Favourites replace the retired taxonomy: the owner/designer marks the key
-- visuals of a case. Any number of favourites per case, none required. Only
-- image and video assets can be favourites. Setting or clearing the flag never
-- changes case status, and generation ignores it (IR-OP14).
--
-- There is no update trigger on `asset`; the service role updates it directly
-- (`softDelete`, `setFavourite`). anon/authenticated already have no privileges
-- on the table, so they cannot touch the new column either.

alter table public.asset
  add column is_favourite boolean not null default false;

alter table public.asset
  add constraint asset_favourite_kind_check check (not is_favourite or kind in ('image', 'video'));
