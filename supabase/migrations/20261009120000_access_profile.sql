-- Story 2.3 / AD-11: the `profile` table owned by the `access` module.
-- Forward-only (AD-12). The permission matrix is code (access/domain/policy.ts),
-- never data: this table stores only who someone is and their role.

create table public.profile (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('owner_designer', 'account_sales_social', 'admin', 'system')),
  created_at timestamptz not null default now(),
  disabled_at timestamptz null
);

-- Backstop: the browser never queries tables. RLS on with no policies denies
-- anon and authenticated; only the server's secret (service-role) key reads it.
alter table public.profile enable row level security;
revoke all on table public.profile from anon, authenticated;

-- Fixed ids must match SYSTEM_ACTOR_ID and DEV_ACTOR_ID in access/domain/actor.ts.
-- `system` is the worker's actor; the dev owner/designer is what getActor()
-- resolves until Epic 6, which disables it at cutover (never reassigns it).
insert into public.profile (id, email, display_name, role) values
  ('00000000-0000-4000-8000-000000000001', 'system@mac-recap.invalid', 'System', 'system'),
  ('00000000-0000-4000-8000-000000000002', 'dev-owner-designer@mac-recap.invalid', 'Dev owner/designer', 'owner_designer');
