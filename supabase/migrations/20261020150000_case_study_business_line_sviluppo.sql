-- Story 2.18 review (owner, 2026-10-20): a seventh business line, `sviluppo`
-- ("Sviluppo"), shown last. Owned by the `case-study` module (AD-11). Forward-only
-- (AD-12): `20261020140000_case_study_business_line.sql` is already applied, so this
-- replaces its check rather than editing it.
--
-- The list must stay exactly BUSINESS_LINES in case-study/domain/case-study.ts. The
-- check keeps its name (the adapter maps `case_study_business_line_check` to
-- INVALID_INPUT) and stays `NOT VALID`, accepting null for legacy cases.
-- `create_case_study` and `update_case_study_details` don't list the values (they
-- only refuse null), so they need no change.

alter table public.case_study drop constraint case_study_business_line_check;

alter table public.case_study
  add constraint case_study_business_line_check
  check (business_line in ('branding', 'social_media', 'video', 'web_design', 'advertising', 'eventi', 'sviluppo'))
  not valid;
