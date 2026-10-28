-- Story 6.1: sign in with a fixed role (owner decision 2026-10-28: open sign-up
-- for @menatcode.it addresses, role chosen from a menu, designers approved by an
-- admin). Forward-only (AD-12). The session is matched to a profile by email.

-- A session email matches a profile case-insensitively, so two profiles may not
-- differ only in letter case (follow-up from the Story 2.3 review).
create unique index profile_email_lower_key on public.profile (lower(email));

-- What the person does in the team, as picked at sign-up ("Designer", "Account",
-- "Commerciale") or typed after "Altro". Shown to the admin; it grants nothing.
alter table public.profile
  add column job_title text null check (job_title is null or char_length(job_title) between 1 and 60);

-- Set when someone signs up as a designer: they read approved cases (account/
-- sales/social) until an admin grants owner/designer and clears it.
alter table public.profile
  add column designer_requested_at timestamptz null;

-- Cutover (AD-11): the seeded dev owner/designer is disabled, never reassigned,
-- and keeps every record it made. Its `.invalid` address can't own a session.
update public.profile
  set disabled_at = now()
  where id = '00000000-0000-4000-8000-000000000002' and disabled_at is null;
