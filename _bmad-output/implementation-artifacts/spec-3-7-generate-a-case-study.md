---
title: 'Story 3.7a: Generate a case study, backend (test text stands in for the AI)'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
baseline_commit: '3c6fc76887b69473a26c02804a1e7757aa265052'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A draft case with material cannot be generated: there is no `generate` action or job handler. The only way to a draft is the dev-only test-draft script (3.10).

**Approach:** A server action re-checks the gate, enqueues one `generate` job and moves the case to `generating`. The worker handler builds the document with 3.10's `buildCaseDocument`, filled with the 3.10 test text behind a small text-source seam (owner 2026-10-29: Story 3.6 swaps in the AI later; no Anthropic adapter or LLM call here), writes the new working revision and moves the case to `in_review`. The screens (wizard step 3, generating and failure states, live table refresh) are Story 3.7b.

## Boundaries & Constraints

**Always:**
- Gate (NFR6): at least one non-deleted asset (`material.hasMaterial`), checked in the action and again in the worker; client info never enables Generate. Only a `draft` case generates.
- Action order: `authorize(actor, "generate", { status: "draft" })` first, then everything else (authorize-guard rules).
- Double click: a deterministic `inputHash` (case id, `baseHeadVersion`, manifest) makes a second press return the same job; a `generate` transition that finds the case already `generating` with that job live counts as success.
- Manifest = asset ids with size and content type, plus a sha256 of the form-field values, stored on the revision. No migration: a true per-file content hash waits for 3.6.
- The worker reads only the manifest's assets; material added after enqueue is ignored.
- New `working` revision with `generated_doc` = `doc`, head set by compare-and-set on `baseHeadVersion`; `STALE_HEAD` discards the result and returns the case to `draft`.
- Permanent failure (attempts used up, `NO_MATERIAL`, a crash on the last attempt) returns the case to `draft`, material and details untouched; the `job_failed` event already exists.
- The text source keeps 3.10's `[bozza di prova]` marker. A `job_ok` case event is written on success.

**Never:**
- No UI, no `it.ts` copy, no change under `src/app/(wizard)` or the Case table (Story 3.7b).
- No Anthropic adapter, prompt or LLM call; no ready toast (3.8); no migration.
- Do not change `buildCaseDocument`'s output or the 3.10 CLI behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Generate | draft, ≥1 asset | one `generate` job with manifest + `baseHeadVersion`; case `generating` | N/A |
| No material | draft, no asset | `NO_MATERIAL`, no job, no transition | N/A |
| Double click | two calls | one job; both succeed | second transition tolerated |
| Not a draft | `generating`, `in_review`, `approved` | rejected (`STALE_STATUS`) | N/A |
| Success | job runs | new working revision is head, case `in_review`, `job_ok` event | N/A |
| Head moved | head changed after enqueue | result discarded, case `draft` | `generation_failed` |
| Failure | handler errors until attempts end | case `draft`, `job_failed` event | `onPermanentFailure` |
| Late material | asset added after enqueue | not in the document | N/A |
| No permission | account/sales/social | action denied | 403 |

</frozen-after-approval>

## Code Map

- `src/modules/generation/application/test-draft.ts` -- `buildCaseDocument(...)` reused as is; `testDraftTexts` becomes the default of a new `TextSource` in `application/text-source.ts`, the seam 3.6 replaces.
- `src/worker/test-draft.ts` -- template for assets, details form, `createWorkingRevision` and the rollback (re-read `headVersion` when the write result is unclear). Share helpers; do not change its CLI behaviour.
- `src/modules/generation/` -- new `application/generate-case.ts` and a worker-only `worker.ts` exporting the `generate` handler (like `material/worker.ts`; respect `test/web-imports.test.ts`).
- `src/modules/jobs/domain/job.ts`, `application/run-loop.ts` -- optional `onPermanentFailure(job)` on `JobHandler`, called once after the last failed attempt; add a run-loop test.
- `src/worker/run.ts` -- register `generate` in `workerHandlers()`.
- `src/modules/material/index.ts` -- `buildManifest(caseId)` from `listAssets` + `getDetailsForm`.
- `src/app/(tool)/case-studies/actions.ts` -- `generateCaseStudy({ caseId })`: authorize, `caseStudy.get`, `hasMaterial`, `buildManifest`, `jobs.enqueue`, `caseStudy.transition(..., "generate")`. Function literals, no re-exports.

## Tasks & Acceptance

**Execution:**
- [x] jobs: `onPermanentFailure` + run-loop test.
- [x] material: `buildManifest` + test.
- [x] generation: `TextSource`, `generate-case.ts`, worker handler, `job_ok`; unit tests for every matrix row.
- [x] `src/worker/run.ts` + `run.test.ts` -- register the handler.
- [x] `actions.ts` -- `generateCaseStudy` + tests (double click, `NO_MATERIAL`, not-draft, authorize guard).
- [x] `test/db/` -- the full path through the real transition and revision functions if the helpers allow; otherwise say it was not run.

**Acceptance Criteria:**
- Given the permission suite (6.4), when it runs, then `generate` is allowed for owner/designer only.
- Given a worker running against a draft with material, when the action is called, then the case ends in `in_review` with a new head revision, with no UI involved.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npx vitest run` -- expected: all pass.
- `npm run test:db` -- expected: pass (CI runs it).

## Implementation Notes

## Spec Change Log

- 2026-10-29, owner chose to split: screens moved to Story 3.7b (deferred-work).

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence / route |
|---|-------|---------|---------|------------------|
| 1 | blind | A finished job returned by `enqueue` leaves the case stuck in `generating` | false | The dedupe index `job_live_input_key` and the enqueue function cover `queued`/`running` only; a finished job is never returned. |
| 2 | blind | Orphan queued job when the transition fails for another reason | low | The handler retries a case still in `draft`, and a second press reuses the job; rare DB error. Rejected. |
| 3 | blind, edge | Manifest/formHash on the revision can describe material the document did not use | low | Nothing reads the manifest yet; true hashing is 3.6. Rejected. |
| 4 | blind, edge | "Head moved so the write landed" misfires on a foreign writer | false | A `generating` case admits no other revision writer. |
| 5 | blind, edge | `TRANSITION_FAILED` after the write rolls back to draft with an orphan head revision | low | Rare; the next press reads the new `headVersion`. Rejected. |
| 6 | blind | Redundant `hasMaterial` + `buildManifest` | low | Design nit, no wrong result. Rejected. |
| 7 | blind | Manifest schema looser than its types | low | Payload comes from our own action. Rejected. |
| 8 | blind | Favourites missing from manifest | false | IR-OP14: favourites are ignored. |
| 9 | blind | No UI copy / status display | false | Story 3.7b by the owner's split. |
| 10 | blind | Vacuous `toBeDefined` in the seam test | low | The seam is asserted by `toHaveBeenCalledWith`; the extra line is noise. Rejected. |
| 11 | blind | No test for `NO_MATERIAL` → 409; comment says "3.7" | medium | Real gap in a mapping this change added. patch: test row + comment fixed. |
| 12 | blind | `SYSTEM_ACTOR_LOOKUP_THREW` mislabelled | low | Log wording only. Rejected. |
| 13 | blind, edge | `onPermanentFailure` skipped when `recordJobFailed` throws | false | `recordJobFailed` wraps its event write in `safely` and cannot throw. |
| 14 | edge | Stale job's late rollback resets a newer generation | low | Needs a lease expiring on a running job and a second press; rejected. |
| 15 | edge | Form edited after enqueue enters the draft | low | AC protects assets, not form text; rejected. |
| 16 | edge | Abort checked once | low | Rare shutdown race; rejected. |
| 17 | edge, blind | Second sequential press returns `STALE_STATUS` | false | Matrix: not a draft is rejected; only concurrent presses both succeed. |
| 18 | edge | `z.uuid()` rejects valid ids | false | Ids come from `gen_random_uuid()` (v4). |
| 19 | edge | Transition conflict with a terminal job | low | Rare; rejected. |
