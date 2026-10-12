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
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-one-gated-image-deployable-to-staging.md`
  summary: Story 2.2 part 2 — one Docker image on mcr.microsoft.com/playwright:v1.63.0-noble with pinned ffmpeg (7:6.1.1-3ubuntu5), bundled idle worker (dist/worker.js via esbuild 0.28.2), a CI job that builds and smoke-tests the image, and README deploy docs (supabase db push to staging before the image, forward-only, prod only after staging).
  evidence: Split from the Story 2.2 spec at the user's choice to keep it under the size limit; part 1 ships the basic-auth gate and fail-fast start.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-one-gated-image-deployable-to-staging.md`
  summary: Deploy the image to staging and confirm both processes run behind the basic-auth gate with staging's own Supabase project and private EU bucket.
  evidence: Blocked on IR-HOST (EU container host, due end of Sprint 1); the user chose to close Story 2.2 without this criterion and track it here.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-one-gated-image-deployable-to-staging.md`
  summary: Make the web process refuse to start before it opens the port when the basic-auth vars are missing (part 1 exits right after listening, before serving).
  evidence: Next's standalone server.js listens before register() runs; a custom entry or image-level env check in Story 2.2 part 2 can close the window.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-one-gated-image-deployable-to-staging.md`
  summary: Log (and possibly rate-limit) failed basic-auth attempts on the gated web process.
  evidence: src/proxy.ts returns 401 silently; brute-force attempts on the public URL would leave no trace (medium, unverified need; per-asset 401s need noise control).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-one-gated-image-deployable-to-staging.md`
  summary: Story 2.2 part 2 host constraints — how health probes and the CI image smoke test pass the basic-auth gate, and no shared cache/CDN in front of the web process.
  evidence: The gate has no unauthenticated path, so probes get 401; Next serves /_next/static as public/immutable, which a shared cache could replay unauthenticated.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-one-gated-image-deployable-to-staging.md`
  summary: Check that local next/image optimization still works behind the basic-auth gate.
  evidence: Unverified: the optimizer's internal sub-request may lack credentials and get the 401 body; no next/image use exists yet (Story 2.4+). Settle by serving an optimized local image with the gate on.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-part-2-one-image-with-web-and-worker.md`
  summary: Add an init process (tini, or docker run --init / the host equivalent) once the web or worker process spawns Chromium or ffmpeg.
  evidence: Both processes run as PID 1 and Node does not reap orphaned children; no child processes exist yet.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-part-2-one-image-with-web-and-worker.md`
  summary: Keep the Playwright version in the Dockerfile's FROM lines and package.json in sync with a test.
  evidence: Both say 1.63.0 today, kept in sync by hand; a mismatch only shows up at render time.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-part-2-one-image-with-web-and-worker.md`
  summary: Pin the Playwright base image by digest and give the ffmpeg apt pin an owner and bump process.
  evidence: The tag v1.63.0-noble is mutable, and the exact apt pin skips security updates if noble ever ships one.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-part-2-one-image-with-web-and-worker.md`
  summary: Decide how the worker bundle handles native dependencies (playwright, sharp) before the job loop imports them.
  evidence: build:dist bundles every dependency, and the runtime image only carries the node_modules Next traced for server.js.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-part-2-one-image-with-web-and-worker.md`
  summary: Cache Docker layers in the CI image job.
  evidence: Every PR rebuilds the multi-GB Playwright-based image from scratch.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-app-shell-navigation-tokens-italian-copy-status-badge.md`
  summary: Story 2.4 part 2 — an accessible single-level Dialog (native dialog + showModal, focus trapped and returned to the opener, Esc closes, a second dialog refused) and a lint rule rejecting hard-coded UI strings in src/app (JSX text with letters; aria-label/title/placeholder/alt string literals), with fixtures in test/lint-boundaries.test.ts.
  evidence: Split from the Story 2.4 spec at the user's choice to keep it under the size limit; part 1 ships tokens, dictionary, sidebar, landing redirect and StatusBadge.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-app-shell-navigation-tokens-italian-copy-status-badge.md`
  summary: Test the user menu's toggle (aria-expanded, panel shown) and Escape closing it with focus returned to the button.
  evidence: The repo has no DOM test environment (no jsdom or Testing Library), so removing the focus return passes every test; Story 2.4 part 2's Dialog needs that environment anyway.
