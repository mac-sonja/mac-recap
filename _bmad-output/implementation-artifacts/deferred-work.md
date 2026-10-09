# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-scaffold-the-app-from-the-starter-and-pin-the-stack.md`
  summary: Decide whether `src/shared/db.types.ts` is committed (with a CI drift check) or generated in CI.
  evidence: CI has no Docker/Supabase, so once an adapter imports the generated types (Story 2.3) CI typecheck fails unless the file is committed.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-actor-and-policy-seam-with-a-dev-owner-designer.md`
  summary: The authorize guard checks call order only; an ignored or conditional authorize decision, module calls through local helpers or dynamic import still pass.
  evidence: test/helpers/authorize-guard.ts orders imported @/modules/* calls; nothing checks that the decision's .ok gates the next call (medium, unverified how often it would bite).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-actor-and-policy-seam-with-a-dev-owner-designer.md`
  summary: The service-role client in access/adapters/supabase/admin.ts has no server-only import guard.
  evidence: server-only is not a dependency; only the post-build .next/static scan catches a client import. Needs a decision to add the package.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-actor-and-policy-seam-with-a-dev-owner-designer.md`
  summary: The profile table lets any row hold the system role.
  evidence: The role check allows 'system' on every row; Story 6.3 manage users must not assign it (add a constraint tying system to SYSTEM_ACTOR_ID).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-actor-and-policy-seam-with-a-dev-owner-designer.md`
  summary: profile.email uniqueness is case-sensitive.
  evidence: email text unique allows A@x and a@x; Epic 6 matches session emails to profiles, so use citext or a lower(email) unique index then.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-actor-and-policy-seam-with-a-dev-owner-designer.md`
  summary: The worker has no way to obtain the system actor from @/modules/access.
  evidence: The index exports no system-actor resolver or SYSTEM_ACTOR_ID; the job loop needs one to authorize job work.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-actor-and-policy-seam-with-a-dev-owner-designer.md`
  summary: The list cases approved-only scope for account_sales_social is not tied to what the list query returns.
  evidence: authorize accepts { status: 'approved' } as the scope, but the Story 2.6 use case must filter by that same scope or the check is moot.
