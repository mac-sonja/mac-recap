# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-scaffold-the-app-from-the-starter-and-pin-the-stack.md`
  summary: Decide whether `src/shared/db.types.ts` is committed (with a CI drift check) or generated in CI.
  evidence: CI has no Docker/Supabase, so once an adapter imports the generated types (Story 2.3) CI typecheck fails unless the file is committed.
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
