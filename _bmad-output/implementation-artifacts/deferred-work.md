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
  summary: Resolved by Story 6.3 (`profile_system_role_only_seeded` ties the system role to SYSTEM_ACTOR_ID; Users actions accept only ASSIGNABLE_ROLES). Was: the profile table lets any row hold the system role.
  evidence: The role check allows 'system' on every row; Story 6.3 manage users must not assign it (add a constraint tying system to SYSTEM_ACTOR_ID).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-actor-and-policy-seam-with-a-dev-owner-designer.md`
  summary: Resolved by Story 6.1 (`profile_email_lower_key` on lower(email); getActor matches the session email case-insensitively). Was: profile.email uniqueness is case-sensitive.
  evidence: email text unique allows A@x and a@x; Epic 6 matches session emails to profiles, so use citext or a lower(email) unique index then.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-actor-and-policy-seam-with-a-dev-owner-designer.md`
  summary: Resolved by Story 3.1 (`access.getSystemActor()` resolves the seeded system profile; the worker calls it at start and `SYSTEM_ACTOR_ID` stays inside `access`, checked by `test/system-actor.test.ts`). Was: the worker has no way to obtain the system actor from @/modules/access.
  evidence: The index exported no system-actor resolver or SYSTEM_ACTOR_ID; the job loop needs one to authorize job work.
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
- source_spec: none
  summary: Story 2.4 part 3 — a lint rule rejecting hard-coded UI strings in src/app (JSX text with letters; aria-label/title/placeholder/alt string literals), with pass/fail fixtures in test/lint-boundaries.test.ts.
  evidence: Split from Story 2.4 part 2 at the user's choice; the Dialog ships first because the confirm dialogs in Epics 2–4 depend on it, and the lint rule has no dependency on it.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-part-2-accessible-dialog.md`
  summary: Check the Dialog in a real browser (Playwright): the page is inert while it is open, Esc fires cancel and calls onClose, a backdrop click does not close it, and focus returns to the opener.
  evidence: happy-dom has no top layer, inertness or light-dismiss, so the unit tests simulate cancel and can't observe modality; Playwright is already a dependency.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-part-3-no-hard-coded-ui-strings.md`
  summary: Make the UI-string lint rule catch template literals that mix literal text with expressions (e.g. `Ciao ${name}`), once the dictionary has a parameterised accessor such as t(key, params).
  evidence: The rule exempts every template with an expression, so hard-coded words around an interpolation pass; enforcing it today would leave no compliant way to build such copy.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-part-3-no-hard-coded-ui-strings.md`
  summary: Widen the UI-string lint rule's attribute list beyond aria-label/title/placeholder/alt (aria-description, aria-roledescription, aria-valuetext, and text props of our own components such as label or description).
  evidence: `<Foo label="Salva" />` and the other text-bearing aria attributes pass today; no such props exist yet, so add them when the first component that takes one lands.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-create-a-case-study-backend.md`
  summary: Story 2.5 backend part 2 — `case-study.transition(caseId, event, actor)` with the AD-3 transition table in domain, a Postgres function doing compare-and-set on status plus a `transition` event ({event, from, to}) in one transaction (`INVALID_TRANSITION`, `STALE_STATUS`), a trigger rejecting any status change outside that function, and a static test that nothing else writes `case_study.status`.
  evidence: Split from the Story 2.5 backend spec at the user's choice to keep it under the size limit; part 1 has no code path that writes status.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-create-a-case-study-backend.md`
  summary: Story 2.5 UI part — wizard step 0 (name and client required, year prefilled, narrative-language select defaulting to Italiano), ID in mono and the Bozza badge in the header, field-level missing-field messages, and reopening loses nothing.
  evidence: The user chose backend first while UI guidelines are pending; depends on Story 2.4 (app shell).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-find-and-reopen-case-studies-in-the-table.md`
  summary: Add an app-wide Italian `error.tsx` (and `global-error.tsx`) so failed loads such as the Case studies list show dictionary copy and a retry instead of Next's default English error screen.
  evidence: No `error.tsx` or `global-error.tsx` exists under `src/app`; `/case-studies` throws on a failed `list` by design.
- source_spec: none
  summary: Story 2.7 UI part — wizard step 1 (Material) dropzone and browse, parallel direct-to-storage uploads (Supabase Storage after Story 2.11) with per-file progress announced to screen readers, inline per-file rejections (over 100 MB, unsupported type, 20-file limit), rows with thumbnail (signed GET ≤ 15 min, scaled by the browser) or type icon plus name and size, and Remove (immediate, no undo).
  evidence: Split from Story 2.7 at the user's choice; depends on the Story 2.5 wizard UI, which is not built yet, and on the backend part's presign/confirm/remove contract.
- source_spec: none
  summary: Resolved by Story 2.11 (Supabase Storage bucket created by migration; [storage proposal](../planning-artifacts/sprint-change-proposal-2026-10-14-storage.md)). Was: Story 2.7 infrastructure — one private S3 bucket per environment in the EU with Block Public Access and versioning on, and CORS allowing only the app origin for POST and GET.
  evidence: Split from Story 2.7 at the user's choice; the repo has no infrastructure-as-code, so this is either manual AWS setup or a new IaC decision, separate from the app code.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-7-upload-project-files-backend.md`
  summary: Story 2.7 asset listing — a `listAssets` server action returning a case's non-deleted assets oldest first, with a presigned GET (valid ≤ 15 minutes) for image thumbnails, built in the `material` S3 adapter.
  evidence: Split from the Story 2.7 backend spec at the user's choice to bring it nearer the size guideline; only the deferred Material step UI consumes it.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-7-upload-project-files-backend.md`
  summary: Story 2.7 orphaned uploads cleanup — remove objects under `cases/*/assets/*` that never became an asset row. Re-scoped 2026-10-14 ([storage proposal](../planning-artifacts/sprint-change-proposal-2026-10-14-storage.md)): with Supabase Storage (Story 2.11) the `s3:ListBucket` grant, the S3 lifecycle rule and noncurrent versions no longer apply.
  evidence: Review of the 2.7 backend: rejected, abandoned and compensated uploads leave objects with no row. AD-8 says the app never deletes objects, so the cleanup needs a decision on who removes orphans and when.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-7-upload-project-files-backend.md`
  summary: Story 2.7 UI follow-ups — declare a normalized content type per file (browsers report `""`, `text/x-markdown` or `text/plain` for .md), re-presign and re-upload when confirm fails (a failed confirm can't be retried with the same assetId), and don't presign more files than the remaining slots.
  evidence: Review of the 2.7 backend: the allowlist is exact, confirm failures leave the assetId used, and the cap is only enforced at confirm.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-8-add-pasted-text-as-material-backend.md`
  summary: When Story 2.10 adds `context_form`, test that `hasMaterial(caseId)` stays false for a case whose details form is filled in but which has no assets or text items.
  evidence: The 2.8 matrix row "details form filled → false" can only be checked once the form table exists.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-10-fill-in-the-details-form-backend.md`
  summary: Story 2.10 UI part — wizard step 2 Details (Context, Solution and Results textareas with the one-line prompt as placeholder, a "{n} di 3 compilati" counter in the footer, Avanti active from the start, save on pause or blur) and the Case studies table's Bozza row opening the wizard at its first incomplete step (derived from `hasMaterial`).
  evidence: Built backend-only; the UI depends on the Story 2.5 wizard.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-10-fill-in-the-details-form-backend.md`
  summary: Add a DB test firing two concurrent first saves of different details-form fields on a case with no row, asserting both succeed, one row holds both fields and two `details_saved` events are recorded (guards the per-case advisory lock in `save_context_field`).
  evidence: Review of the 2.10 backend: every DB test saves sequentially, so removing the lock would ship lost first saves; most relevant once the autosave UI lands.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-8-retire-pasted-text-and-the-taxonomy.md`
  summary: Harden `removeAsset`'s compensation — a cap-free / case-agnostic undo path (or a single-transaction remove+event), log the `ok(false)` no-op, and test the "event fails and undo fails" branch plus the adapter's generic undo error.
  evidence: Review of Story 2.8 (triage #1–#4): `restore_asset` re-checks the 20-file cap and the live case, so a concurrent upload filling the freed slot (or a case delete) between `softDelete` and a failed `recordEvent` leaves a removal without its event, with only a log line. Pre-existing since #17; medium, rare (needs an event-write failure plus a concurrent upload or delete).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-part-4-design-identity-tokens.md`
  summary: Decide what brand mark the collapsed (64px, 1024–1279px) sidebar shows; today the wordmark is hidden there, as the text title was.
  evidence: DESIGN.md places the white wordmark at the sidebar top but says nothing about the collapsed sidebar; the narrow-sidebar question raised in the 2026-10-13 UX session was never answered.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-wizard-shell-and-name-step.md`
  summary: Make case creation idempotent (client request key) so a retry after a lost `createCaseStudy` response doesn't create a second Bozza case.
  evidence: Review of the Story 2.5 UI (triage #2): if the server creates the case but the response is lost, the generic error invites "riprova" and a second create runs; create is not idempotent (spec-2-5-create-a-case-study-backend row 12).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-11-store-project-files-in-supabase-storage.md`
  summary: Decide and implement cleanup for orphaned storage objects (rejected confirms, abandoned 2 h signed uploads, soft-deleted assets), or record storage-quota monitoring, since AD-8 says the app never deletes objects.
  evidence: Review of Story 2.11 (triage #12): nothing ever removes objects from the `material` bucket; storage is billed against the Supabase plan.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-10-details-step-ui.md`
  summary: Keep the wizard stepper's Dettagli/Genera links in sync with client-side uploads and removals on step 1 (today `reachable` comes from one server-side `hasMaterial` check per page load).
  evidence: After the first upload on step 1 the stepper shows Dettagli and Genera as plain segments until a reload; after removing the last file they stay links that redirect back to step 1. A plain `router.refresh()` would redirect a no-step URL to step 2 mid-upload, so the fix needs a design choice.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-12-clients-and-readable-case-history-codes.md`
  summary: Before any feature lets people change a case history's client or year, decide how the fixed code coexists with the unique key `(client_id, year, number)` and the per-pair counter.
  evidence: A moved case keeps its number, so moving it into a pair that already has (or will reach) that number fails on the unique key or makes later creates for that pair fail. No edit path exists today (owner answer 4 in SCP 2026-10-15).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-background-job-queue-and-worker-loop.md`
  summary: Make the `job_failed` case event durable — today a job reaches `failed` (via `jobs_fail` or the LEASE_EXPIRED path in `jobs_claim`) before the event is written in a separate call, so a worker crash or a `recordEvent` error in between loses the event for good.
  evidence: Story 3.1 registers no handlers, so no case depends on it yet; Story 3.7 (case status back to Bozza on failure) must not rely on a lost event — e.g. a `failure_reported_at` column set only after the event is written and re-reported by the next claim, or write the event in the same transaction.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-background-job-queue-and-worker-loop.md`
  summary: Add retention for finished (`succeeded` / `failed`) job rows.
  evidence: Rows are never pruned; the partial indexes keep claims fast, but the table and per-subject history grow without bound.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-14-client-info-description-sector-logo.md`
  summary: Record who last changed a client's info and when (`update_client` takes `p_actor_id` but stores nothing), and consider a composite FK so `client.logo_id` can only point at the same client's logo.
  evidence: Approved case histories will read client info (3.3/3.7); today only `update_client` enforces the same-client rule and there is no edit trail. Needs a new forward migration (the 2.14 one is applied to mac-recap-dev).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-14-client-info-description-sector-logo.md`
  summary: Resolved by the Sprint Change Proposal 2026-10-16 (client intro and collections): Story 5.3 keys exports by a content hash (`exports/{contentHash}/{format}.{ext}`), which includes each part's client info. Was: Story 5.1 must settle where an export is stored now that client info is live — the AD-8 address `…/exports/{format}.{ext}` would let a new export after a client edit land on the old file's address (e.g. add the client-info hash to the key).
  evidence: Owner decision 2026-10-16 (client info is live, approved case histories show current info); AD-9 and Story 5.1 now reuse an export only if it was made with the current client info.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-14-client-info-description-sector-logo.md`
  summary: Decide whether a client edit should un-tick claims that cite the client's description (`client_field` refs), since they are now checked against the current text, and whether owners should be warned that a client edit changes approved case histories too.
  evidence: Owner decision 2026-10-16; AD-18 resolves `client_field` refs against current values, so a reviewed claim can drift after a client edit.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-14-client-info-description-sector-logo.md`
  summary: Clean up logos that were confirmed but never linked (a failed link the user then abandons).
  evidence: Such `client_logo` rows and objects stay forever; replace/remove now deletes linked old logos only.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-15-client-wizard-and-details-step.md`
  summary: Confirmed client logos that never get linked (link refused, a different file picked, or the wizard abandoned) stay as orphan `client_logo` rows and storage objects.
  evidence: Story 2.15 review findings 8 (blind, edge-case); `use-client-logo.ts` replaces `confirmed` without deleting it, the same behaviour as the 2.14 dialog. Needs a decision on a cleanup (on replace, or a sweep).

- source_spec: `_bmad-output/implementation-artifacts/spec-2-16-client-material-step.md`
  summary: Clients table: the code column is headed "ID" and every row opens the client page (never the wizard); an unfinished client is completed through Modifica cliente (owner, 2026-10-19).
  evidence: Split from Story 2.16 at the owner's request; shipped first as mac-sonja/mac-recap#55 (merged 2026-10-19).

- source_spec: `_bmad-output/implementation-artifacts/spec-2-16-client-material-step.md`
  summary: Client material uploads that are refused at confirm, hit the 3-file limit late, or are abandoned leave orphan objects under `clients/*/material/` with no `client_asset` row; a failed object delete on removal does the same.
  evidence: Story 2.16 review finding 9 (blind, edge-case); same pattern as the client-logo orphans deferred from 2.15. Needs a decision on cleanup (best-effort remove on refusal, or a periodic sweep).

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-display-renditions-for-uploaded-media.md`
  summary: `material.getRendition(assetId, spec)` doesn't check which case the asset belongs to; settle the signature (take `caseId`, require a match) when the first caller lands in Story 3.5.
  evidence: Story 3.2 review finding 14; the asset lookup has no case filter.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-display-renditions-for-uploaded-media.md`
  summary: Video renditions of 10-bit HEVC/HDR (iPhone) clips may look washed out; .mov, portrait-rotation and HDR inputs are untested.
  evidence: Story 3.2 review finding 15; `video-processor.ts` forces yuv420p/libx264 with no tone mapping. Check with the owner's real footage on dev, then add tone mapping and fixtures.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-display-renditions-for-uploaded-media.md`
  summary: Add a real-ffmpeg test for the poster's fallback to the first frame when seeking to 1 s yields no frame.
  evidence: Story 3.2 review finding 16; no fixture reaches `video-processor.ts` line 146.

- source_spec: none
  summary: Client Settore becomes single-select with a text field that adds a new sector to a shared list (sectors table replaces the fixed CLIENT_INDUSTRIES check; existing multi-sector clients keep one).
  evidence: Split from the client side-panel intent (owner 2026-10-21) as its own PR with its own migration; owner chose new sectors go to a shared list.
- source_spec: none
  summary: Client Racconto gains structured Risultati (up to 3 label + value rows, optional) and Testimonial (quote + author, optional); the old free-text results column and its data are dropped.
  evidence: Split from the client side-panel intent (owner 2026-10-21) as its own PR with its own migration; owner chose drop old results, both sections optional, no "Del progetto / Di un deliverable" toggle.
- source_spec: `_bmad-output/implementation-artifacts/spec-client-side-panel.md`
  summary: In the client edit panel, removing stored images happens at once and can leave a client below the 2-image minimum with no warning on close.
  evidence: Review finding 1; same as the old Materiale step. Fix by warning when the count drops below minImages or deferring removals to Salva.
- source_spec: `_bmad-output/implementation-artifacts/spec-client-side-panel.md`
  summary: A logo picked in the edit panel and then cancelled (or replaced by a second pick) stays in storage unlinked.
  evidence: Review finding 6; the wizard behaved the same. Needs a cleanup job or a delete-on-cancel.
- source_spec: `_bmad-output/implementation-artifacts/spec-client-results-testimonial.md`
  summary: Add a migration test that seeds a client_brief row with the old text results, applies the results/testimonial migration and checks Risultati reads back as [].
  evidence: Review finding 8 (unverified, medium); the db suite runs on an already-migrated schema and has no harness for one migration step against older data. The owner's manual dev check covers it for now.

- source_spec: `spec-2-21-case-results-and-testimonial.md`
  summary: Results/testimonial autosave keys are computed at change time, so a half row or lone author typed while a save is in flight can send the stale saved value (client panel and case step).
  evidence: `resultsKey`/`testimonialKey` use `savedRows.current` before the in-flight save updates it (client-panel.tsx, case-details-step.tsx); unverified in practice; would settle with a test that delays the first save.
- source_spec: `spec-2-21-case-results-and-testimonial.md`
  summary: Event-failure compensation in the details/results/testimonial saves can overwrite a newer concurrent save with the older value.
  evidence: compensation re-saves `previous` unconditionally (save-details-field.ts since 2.10, save-case-results.ts, save-case-testimonial.ts); a compare-and-set would settle it.
- source_spec: `spec-2-21-case-results-and-testimonial.md`
  summary: Decide how generation (3.4 outro, 3.6) reads case Risultati and Testimonial, since `resolveRefs` no longer resolves `form_field:results`.
  evidence: resolve-refs.ts returns UNKNOWN_REF for `results`; nothing resolves the new structured fields.
- source_spec: `spec-2-21-case-results-and-testimonial.md`
  summary: Testimonial DB checks accept untrimmed text while results require trimmed text (client_brief and context_form).
  evidence: `*_testimonial_*_check` measure btrim length only; the use cases trim, so only a direct service-role call can store padding.
- source_spec: `spec-2-21-case-results-and-testimonial.md`
  summary: The case page's mapping of the client limits onto `storyLimits` has no test against the real constants.
  evidence: page.test.tsx mocks the constants and asserts no limit-driven output.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-v2-document-model-and-format-registry.md`
  summary: Decide how static formats (Presentazione PDF, Carosello PNG) draw `video` and `animation` elements (poster frame, first frame or not allowed), in Story 3.5.
  evidence: Schema v2 allows them in every format; the registry's `motion` flag isn't checked against element types (review, unverified medium).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-v2-document-model-and-format-registry.md`
  summary: Remove the remaining `rendering.relayout` and "Deck 16:9 and PDF A4" mentions from ARCHITECTURE-SPINE.md (L55, L132, L210, L401).
  evidence: SCP 2026-10-28 retired relayout and those formats; the spine still names them.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-templates-pages-layouts-and-default-pages.md`
  summary: Story 3.5's renderers must honour every field Story 3.4 added to schema v2 (`row`, text `bindings` joined by " · ", `#rrggbbaa` colours, `divider.colour`, block `padding`/`paddingTop`/`ink`, page `margin`/`decoration: star`) and the top Testi group that grows like the mockup's spacer.
  evidence: Nothing outside the domain and the templates reads these shapes yet; the spacer rule is written only in the 3.4 spec's Implementation Notes (review, 2026-10-28).
- source_spec: none
  summary: Story 3.5's `composeParts` (client file order: client intro, each case's pages without its own intro and Carosello Chiusura, Risultati e testimonial kept, then the client's closing; case pages read from the case's revision, never copied).
  evidence: Split from Story 3.5 by the owner (2026-10-28): the renderers ship first; composeParts is an independent pure function, built right after.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-compose-parts-client-file.md`
  summary: Decide in Story 4.13 how `composeParts` recognises a case's Carosello Chiusura if pages can be duplicated or re-keyed; it now matches `pageKey === "closing"`.
  evidence: Review (maybe-false, medium if true): a second or renamed Chiusura would stay in the client file; today default pages restore only lost pages and keep their key, so it can't happen yet.
