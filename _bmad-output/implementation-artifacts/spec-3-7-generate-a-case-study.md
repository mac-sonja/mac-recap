---
title: 'Story 3.7: Generate a case study (test text stands in for the AI)'
type: 'feature'
created: '2026-10-29'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A draft case with material cannot be generated: wizard step 3 is a placeholder, no `generate` action or job handler exists, and the only way to a draft is the dev-only test-draft script (3.10).

**Approach:** Wizard step 3 gets a **Genera** button. A server action re-checks the gate, enqueues one `generate` job and moves the case to `generating`. The worker handler builds the document with 3.10's `buildCaseDocument`, filled with the 3.10 test text behind a small text-source seam (owner 2026-10-29: Story 3.6 swaps in the AI later; no Anthropic adapter or LLM call here), creates the new working revision, and moves the case to `in_review`.

## Boundaries & Constraints

**Always:**
- Gate (NFR6): at least one non-deleted asset (`material.hasMaterial`), checked in the action and again in the worker; client info never enables Generate. Only a `draft` case generates.
- Action order: `authorize(actor, "generate", { status: "draft" })` first, then everything else (authorize-guard rules).
- Double click: the job's `inputHash` is deterministic (case id, `baseHeadVersion`, manifest), so a second press returns the same job; a second `generate` transition that finds the case already `generating` with that job live counts as success.
- Manifest = asset ids with size and content type, plus a sha256 of the form-field values, stored on the revision. No migration: a true per-file content hash waits for 3.6 (owner would see no difference).
- The worker uses only the manifest's assets; material added after enqueue is ignored.
- New working revision with `generated_doc` = `doc`, head set by compare-and-set on `baseHeadVersion`; a moved head (`STALE_HEAD`) discards the result and returns the case to `draft`.
- Permanent failure (attempts used up, `NO_MATERIAL`, a crash on the last attempt) returns the case to `draft` with material and details untouched; the wizard then shows the failure copy and **Riprova**, which runs the same action.
- The text source keeps 3.10's `[bozza di prova]` marker so test text is never mistaken for AI text. A `job_ok` case event is written on success.
- Italian copy through `it.ts`; house UI rules from the mac-recap-ui skill.

**Never:**
- No Anthropic adapter, prompt, or LLM call; no `check` workflow; no ready toast or polling for it (Story 3.8).
- No migration; do not change `buildCaseDocument`'s output shape or 3.10's dev script behaviour.
- No change to configurator files.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Generate | draft case, ≥1 asset | one `generate` job enqueued with manifest + `baseHeadVersion`; case `generating`; wizard shows the generating screen | N/A |
| No material | draft, no asset (details filled or not) | button disabled with reason linked by `aria-describedby`; action returns `NO_MATERIAL`, no job | N/A |
| Double click | two presses | one job; both calls succeed | second transition tolerated |
| Not a draft | case `generating` / `in_review` / `approved` | action rejected (`STALE_STATUS`) | N/A |
| Success | job runs | new `working` revision becomes head, case `in_review`, `job_ok` event | N/A |
| Head moved | head changed after enqueue | result discarded, case back to `draft` | `generation_failed` transition |
| Failure | handler errors until attempts end | case `draft`, wizard shows failure + Riprova | `job_failed` event (exists) |
| Material added late | asset added after enqueue | not in the document | N/A |
| Reload while generating | wizard opened for a `generating` case | generating screen, not a redirect | N/A |
| Table | case moves between statuses | row updates without reload; clicking an In elaborazione row shows "Ancora in elaborazione" | N/A |

</frozen-after-approval>

## Code Map

- `src/modules/generation/application/test-draft.ts` -- `buildCaseDocument({texts, images, resultRows, hasTestimonial, newId})` reuse as is; `testDraftTexts` becomes the default of a new `TextSource` (`application/text-source.ts`), the seam 3.6 replaces.
- `src/worker/test-draft.ts` -- `runTestDraft` is the template for assets, details form, `createWorkingRevision` and rollback (re-read `headVersion` when the write result is unclear). Do not change its CLI behaviour; share helpers rather than copy.
- `src/modules/generation/` -- new `application/generate-case.ts` (gate, manifest check, build, write) and `worker.ts` exporting the `generate` JobHandler (worker-only, like `material/worker.ts`; respect `test/web-imports.test.ts`).
- `src/modules/jobs/domain/job.ts`, `application/run-loop.ts` -- add an optional `onPermanentFailure(job)` to `JobHandler`, called once after the last failed attempt; the generate handler uses it for `generation_failed`. Add a run-loop test.
- `src/worker/run.ts` -- register `generate` in `workerHandlers()`.
- `src/modules/material/index.ts` -- add `buildManifest(caseId)` from `listAssets` + `getDetailsForm` (ids, sizes, types, form-value hash).
- `src/app/(tool)/case-studies/actions.ts` -- `generateCaseStudy({ caseId })`: authorize, `caseStudy.get` (draft, `headVersion`), `hasMaterial`, `buildManifest`, `jobs.enqueue`, `caseStudy.transition(..., "generate")`. No re-exports; function literals only.
- `src/app/(wizard)/case-studies/new/page.tsx` (~l.115) -- replace the step 3 placeholder with a new `_components/generate-step.tsx` (counter "{n} file, {m} di 3 dettagli", disabled reason, generating screen with **Torna ai casi**, failure + **Riprova** from `jobs.getJobsFor`); render the generating screen for a `generating` case instead of redirecting.
- `src/app/(tool)/case-studies/_components/case-studies-table.tsx` -- `router.refresh()` on an interval while any row is `generating`; the click on such a row shows "Ancora in elaborazione" (row `href` logic stays as is).
- `src/shared/i18n/it.ts` -- replace `wizard.generatePlaceholder`; add all new copy.

## Tasks & Acceptance

**Execution:**
- [ ] jobs: `onPermanentFailure` + run-loop test.
- [ ] material: `buildManifest` + test.
- [ ] generation: `TextSource`, `generate-case.ts`, worker handler, `job_ok`; unit tests for every matrix row (success, head moved, failure, late material, no material).
- [ ] `src/worker/run.ts` -- register the handler (+ `run.test.ts`).
- [ ] `actions.ts` -- `generateCaseStudy` (+ action tests incl. double click, `NO_MATERIAL`, not-draft; authorize-guard passes).
- [ ] wizard step 3 + page + `it.ts` (+ component and page tests).
- [ ] case table live refresh and "Ancora in elaborazione" (+ test).
- [ ] DB test for the full path in `test/db/` if the existing helpers allow; otherwise state it was not run.

**Acceptance Criteria:**
- Given a draft with material, when I press Genera and later reopen the wizard, then I still see the generating screen until the case moves.
- Given the permission suite (6.4), when it runs, then `generate` is allowed for owner/designer only.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npx vitest run` -- expected: all pass.
- `npm run test:db` -- expected: pass (CI runs it).

## Implementation Notes

## Spec Change Log

## Review Triage Log
