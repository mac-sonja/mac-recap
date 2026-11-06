---
title: 'Story 3.11: client intro and outro with test text'
type: 'feature'
created: '2026-11-06'
status: 'in-review'
baseline_commit: '44f6fb10c71646ba4dd9dccb4f8a99162b6c371a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-10-test-draft-without-ai.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A client gets no intro or outro: there is no `client_intro` table, no client template, and nothing starts a draft when a client is added. Tracks A and B (4.11, 4.12, 5.9, 5.10, 3.9) all wait on this.

**Approach:** After **Aggiungi** saves a client, its images included, the server checks the client has at least 2 images, creates its `client_intro`, and enqueues the existing `generate` job for it. The worker writes a working revision of kind `client_intro`, with test text marked "[bozza di prova]", laid out from a **placeholder** client template in every format. The intro then moves to Da approvare. No LLM is called. The owner decided on 2026-11-06 to build with a placeholder now; the cover/outro design will later ship as a new template version, and nothing else changes.

## Boundaries & Constraints

**Always:**
- **Migration:**
  - It is forward-only.
  - It adds the `client_intro` table with columns `id`, `client_id` (unique, FK), `status` (the case states), `head_revision_id`, `approved_revision_id`, `head_version` and timestamps.
  - It adds `client_event`, append-only, mirroring `case_event` with `client_intro_id` in place of `case_id`.
  - It adds the FK on `revision.client_intro_id`.
  - It adds SQL functions mirroring `transition_case_study` and `create_working_revision`. The intro versions compare-and-set the same way and write `client_event`.
  - RLS: the same pattern as `case_event` and `revision`. All tables are revoked from anon and authenticated, and writes go only through `security definer` functions executable by `service_role`.
- **Intro lifecycle:**
  - It changes only through a new `case-study.transitionIntro`, with the same events and table as `transition`.
  - `getLiveRevision` and `getEditableRevision` serve `{ kind: "client_intro" }`, so `SUBJECT_NOT_SUPPORTED` goes.
- **Placeholder template** `mac-client@1`, in `rendering/templates/mac-client/v1/`:
  - It reuses mac-case@1's renderer, layouts and text styles.
  - Its own default pages, per format:
    - Intro (role `intro`): first block "01 Cliente", the client's name and sector bound, and the head and body test texts. The intro images are the client's first 3 images in `position` order; `client_asset` has no favourites.
    - Risultati e testimonial (role `outro`): bound to the **client** record, and only when the client has result rows or a testimonial.
    - Carosello only, Chiusura "Al prossimo progetto" (role `outro`).
  - mac-case@1 is not edited, since its hashes are locked. `hashes.json` gains mac-client@1.
- **Test texts:** four texts, intro head and body and outro head and body. Each is marked "[bozza di prova] ".
  - The bodies quote an excerpt of a client field, citing it with a new material ref `{ kind: "client_field", id }`: the intro body uses `description`, and the outro body uses the brief's Contesto.
  - The heads are fixed sentences citing `name`.
  - Name, sector and results stay bindings and are never stored as values.
- **Worker:**
  - The `generate` payload gains `subject: "case" | "client_intro"`, with "case" as the default for jobs already queued.
  - The client branch always uses test text, whether or not `ANTHROPIC_API_KEY` is set.
  - A failure sends `generation_failed`, and the intro returns to Bozza.
- **Start rule:**
  - On the client's save, for a client with no intro, or whose intro is in Bozza, the server starts the draft.
  - A double click enqueues one job, using the existing idempotent enqueue.
  - The client page opens at once, whatever the outcome.

**Owner decisions (2026-11-06):**
- **Seeing the intro's state:**
  - The client page shows a status badge: "Introduzione: In elaborazione / Da approvare / Bozza".
  - The 3.8 ready toast also covers intros and opens the client page.
- **Existing clients:** **Salva** applies the same start rule as **Aggiungi**. A client with no intro, or whose intro is in Bozza, gets a draft. This also retries a failed draft.
- **Size:** the spec is kept whole, at about 2,100 tokens, as one PR.

**Never:** No LLM call, no edit to mac-case@1, no intro configurator (4.11), no client file (4.12), no approve for intros, no change to case generation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Happy | New client, 3 images | intro `generating` → working revision in 3 formats → `in_review`; 4 `client_event` rows | — |
| Few images | Client with 1 image (server-side) | No intro row, no job | `NO_CLIENT_IMAGES`; client still saved, page opens |
| Already drafted | Intro `in_review` or `approved`, Salva again | Nothing starts | ok, no-op |
| Worker fails | Revision write fails | intro back to `draft`, `generation_failed` event | job retries per queue rules |
| No results | Client without result rows and testimonial | No Risultati e testimonial page; Carosello still ends with Chiusura | — |
| AI key set | `ANTHROPIC_API_KEY` present | Still test text, no SDK call | — |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261009140000_case_study.sql:28-117` -- `case_event` table, RLS and append-only triggers to mirror for `client_event`.
- `supabase/migrations/20261020160000_case_study_revision.sql` -- `client_intro_id` column (:20, no FK), subject check (:36), `create_working_revision` (:137-236) to mirror for intros.
- `supabase/migrations/20261012120000_case_study_transition.sql:24-84` -- `transition_case_study` (status compare-and-set, GUC guard) to mirror.
- `src/modules/case-study/domain/transition.ts` -- `TRANSITIONS`, `nextStatus`; reuse for intros.
- `src/modules/case-study/application/revisions.ts:48,76` -- `makeCreateWorkingRevision` (case-only input), `makeSubjectRead` (`SUBJECT_NOT_SUPPORTED`; tests at `revisions.test.ts:265`, `test/db/revision.db.test.ts:636`).
- `src/modules/case-study/index.ts:565-666` -- `transition`, `createWorkingRevision`, subject reads; add intro equivalents and `startClientIntro`.
- `src/modules/case-study/domain/client-material.ts:33,86` -- `CLIENT_MATERIAL_MIN_IMAGES`, `clientImageCount`; `client-repository.ts:505` `listAssets` (position order).
- `src/modules/generation/domain/document.ts:36,92-125` -- `MATERIAL_REF_KINDS` (add `client_field`), client binding fields.
- `src/modules/generation/application/test-draft.ts` -- `marked`, `excerpt`, `cite`, `buildCaseDocument`: reuse the shape for `buildClientIntroTestDraft`.
- `src/modules/generation/application/generate-case.ts:22,109,125` + `worker.ts:21,46` -- payload, handler (subjectId as caseId), text-source seam.
- `src/modules/rendering/templates/index.ts:13-46` -- registry and `starterPages` (`[]` for client_intro; test `templates.test.ts:316,325`); `mac-case/v1/pages.ts` -- builders to adapt; `types.ts:26-48` text keys and `TemplateContext`.
- `src/modules/rendering/compose.tsx:72,103` -- already places intro and outro pages; don't change.
- `src/app/(tool)/clients/actions.ts`, `_components/client-panel.tsx:725-814` -- the save sequence (create → logo → brief → `images.uploadAll` → navigate); permission test auto-covers new exports in `actions.ts`.
- `test/case-status-writes.test.ts`, `test/authorize-guard.test.ts`, `test/lint-boundaries.test.ts`, `test/web-imports.test.ts` -- guards the new code must pass.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261106120000_case_study_client_intro.sql` -- tables, FK, RLS, `create_client_intro`, `transition_client_intro`, `create_working_revision_for_client_intro`; then `npm run db:types`.
- [x] `src/modules/case-study/**` -- intro repository, `transitionIntro`, intro working revision, subject reads for intros, `startClientIntro(actor, clientId)` (image gate, get-or-create, start rule, enqueue via jobs index as case generation does). Unit and db tests, updating the two pinned `SUBJECT_NOT_SUPPORTED` tests.
- [x] `src/modules/generation/domain/document.ts` -- `client_field` material ref.
- [x] `src/modules/rendering/templates/mac-client/v1/*`, `index.ts`, `types.ts`, `hashes.json`, `templates.test.ts` -- the placeholder template, `CLIENT_TEMPLATE`, `starterPages` for `client_intro`, client text keys.
- [x] `src/modules/generation/application/client-intro-draft.ts` (+ test) -- `buildClientIntroTestDraft`; the result passes `validateNewDocument`.
- [x] `src/modules/generation/application/generate-case.ts`, `worker.ts` (+ tests) -- `subject` in the payload, the client branch, always test text.
- [x] `src/app/(tool)/clients/actions.ts`, `client-panel.tsx` (+ tests) -- `startClientIntro` action after the images upload on Aggiungi and after Salva, without blocking navigation.
- [x] `src/app/(tool)/clients/[clientId]/page.tsx` (+ test), `src/shared/i18n/it.ts` -- the intro status badge (reuse the case status badge's hues).
- [x] `case-study` `listReadyDrafts` / `domain/ready-draft.ts`, `src/app/_lib/draft-ready-actions.ts`, `src/app/_components/draft-ready-notifier.tsx` (+ tests) -- ready intros from `client_event`, toast opens the client page.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.11 to review.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given the built web bundle, when it is searched for `@anthropic-ai/sdk`, then there is no match.

## Implementation Notes

- **Subject ids.** `{ kind: "client_intro", id }` takes the intro's own id (`client_intro.id`); `getClientIntro(clientId)` reads it by client. The generate job's subject is the intro id, and `caseIdOf` is `null` for it (its `job_failed` has no case; the intro's own rollback is `generation_failed`).
- **No import cycle.** `jobs` imports `case-study`, so `startClientIntro(actor, input, enqueue)` takes `jobs.enqueue` from the action; the job itself (`clientIntroGenerateJob`: payload `{ subject: "client_intro", baseHeadVersion }`, hash of the intro id and head version) comes from `generation`.
- **Start rule order.** An intro not in Bozza returns `unchanged` before the image gate, so saving a drafted client never fails; otherwise the gate runs before any intro row or job.
- **Placeholder layout** (`mac-client@1`, on mac-case@1's layouts): Presentazione Intro on `content_3` (Cliente block, then 3 images); Carosello Copertina (`one`) plus Immagini (`three_a`); Video Intro (`intro`: Cliente block, carousel_04 of the 3 images). The outro texts open Risultati e testimonial in Presentazione and Video, and sit on the Carosello Chiusura under "Al prossimo progetto" (so Carosello always shows them).
- **Ready toast.** `ReadyDraft` gains `kind` (`case` | `client_intro`); an intro's `id` and `name` are its client's, and **Apri** opens the client page.
- **Client badge.** `IntroStatus` refreshes the client page every `GENERATING_REFRESH_MS` while the intro is In elaborazione.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Badge auto-refresh never run by a test (gap) | medium | `page.test.tsx` renders statically, so `useEffect` never runs; no `intro-status` test exists | patch |
| 2 | Page renders before the fire-and-forget start moves the intro (edge) | medium | `client-panel.tsx` step 5 calls `router.replace` right after firing the action, so the RSC read can come first and the badge never polls | patch (await the start, then navigate whatever the outcome) |
| 3 | Navigation not proven unblocked; start errors dropped (blind) | low | Same root as 2: awaiting the start makes the order explicit; errors stay silent by design (spec: page opens whatever the outcome) | patch (with 2) |
| 4 | Intro read failure hides ready-case toasts (blind, edge) | medium | `list-ready-drafts.ts` returns `ofIntros` error for the whole poll | patch |
| 5 | `MIN_CLIENT_IMAGES` duplicated, no sync test (blind) | low | `generate-case.ts` hard-codes 2; a one-line assertion like `MATERIAL_REF_KINDS`'s | patch |
| 6 | DB retry test returns the old queued job (blind) | low | Job dedup is on live jobs (`job_live_input_key`); the old job is still `queued`, same hash | patch |
| 7 | No live region for the status change (blind) | low | `<p>` has no `role="status"`; direct one-attribute fix, WCAG 2.2 AA | patch |
| 8 | Endless refresh if stuck in generating (edge, blind) | low | Only after a failed rollback (already logged as an error); a cap adds a branch; case screens poll the same way | reject |
| 9 | Orphan queued job when the transition fails for a non-race reason (edge, blind) | low | Needs a DB write failure or client deletion between enqueue and transition; the job then fails out harmlessly (`onPermanentFailure` leaves a non-generating intro alone); cancelling adds surface | reject |
| 10 | STALE_HEAD rollback while another job holds generating (edge) | false | Only one live job per intro: enqueue happens only from Bozza and failed jobs end before the intro returns to Bozza | reject |
| 11 | Unclear write success misattributed to another writer (edge) | false | No other intro writer exists in this story (no intro editing until 4.11) | reject |
| 12 | `generate` events query without limit (edge) | low | Mirrors the case query in `case-study-repository.ts:377`; needs over 1000 starts on one intro | reject |
| 13 | Page throws when the intro read fails (blind) | low | Every other read on the page throws the same way; consistent, a rare DB failure | reject |
| 14 | Failed draft looks like Bozza; retry only via Salva (blind) | false | Owner decision 2026-11-06: badge states In elaborazione / Da approvare / Bozza, Salva retries | reject |
| 15 | Toast opens a page with only a badge (blind) | false | Owner decision: the toast opens the client page until 4.11 | reject |
| 16 | Intro text goes stale after client edits (blind) | low | Name, sector, results and images stay bindings or live reads; text excerpts are test text that 3.9 and 4.11 replace | reject |
| 17 | No `job_failed` client event for intro jobs (blind) | low | The intro still gets its `generation_failed` transition; a new event kind adds surface | reject |
| 18 | `client_field` refs accepted in case documents (blind) | low | Nothing resolves refs by kind yet; a per-kind check adds schema logic for an unreached path | reject |
| 19 | Client page reads run one after another (blind) | low | One extra round trip; the page's existing reads are sequential the same way | reject |

## Design Notes

The template id is new (`mac-client`), not `mac-case@2`, so a case keeps `CASE_TEMPLATE` and the design team's cover/outro becomes `mac-client@2`. Existing placeholder drafts stay readable on v1.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass (local Supabase), including the new intro tests.
- `npm run build` -- expected: pass.
