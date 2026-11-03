---
title: 'Story 4.8: Approva'
type: 'feature'
created: '2026-11-03'
status: 'in-review'
baseline_commit: '11b4134b34f3f5d376f36ce17b1df7d1f4c26d55'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The configurator's **Approva** is an inactive "Arriva presto": a case in Da approvare can't become Approvato, so nothing reaches the library, exports or links.

**Approach:** Approval as Story 4.8 (C39, demo rules): **Approva** is enabled only when no page of any format (Presentazione, Carosello, Video) overflows, measured in the browser with the shared renderer, and no file the pages show is missing; otherwise it is disabled and names what's left (`aria-describedby`). Pressing it asks "Approvare {name}? Una volta approvata, si può esportare e condividere." (**Approva** / **Annulla**). Confirming calls `approve(caseId, revisionId, expectedRevisionVersion, expectedHeadVersion, overflow)`: the server checks the overflow result covers every format of the revision and is clear, checks no file the revision references is deleted, and in one transaction sets the revision `approved`, `approved_revision_id`, the case `approved` (`transition` event) and an approval event with the actor. Then the person goes to Da approvare if other cases wait, else to Case studies, with "Approvata. Ora è in libreria." No per-block check, no bulk or automatic approval.

## Boundaries & Constraints

**Always:** AD-3 transition `approve` (in_review → approved) through the status-transition flag, as `transition_case_study`; compare-and-set on `revision.version` and `case_study.head_version`; `access.getActor()` + `authorize(actor, "approve")`; errors `OVERFLOW_NOT_CLEARED`, `MATERIAL_MISSING` (with `assetIds`), `STALE_REVISION`, `STALE_HEAD`, `CASE_NOT_APPROVABLE` (case not in_review), `NOT_FOUND`; nothing written on any error. The material check reuses 4.5a's rule (`allowedAssetIds`: the case's live files and its client's files) on every ref of the revision's `doc` (`referencedAssetIds`). The overflow measure for formats not in view renders each format's pages off screen (inert, hidden), Video with texts still. Approve waits for pending autosaves (flush) and uses the version the last save returned. A guardrail test proves `approve` is the only way to `approved`, needs a person's actor and a clear overflow result, and that no bulk or auto approve exists.

**Never:** No per-block check, no `BLOCKS_UNCHECKED`; no approval of an `approved` head (4.9); no client intro approval (4.11); no server-side re-measure of overflow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Overflow | a page of Carosello overflows | Approva disabled: "Testo che non entra: Carosello, pagina {n}" | N/A |
| Missing file | a page shows a file no longer listed (case or client) | disabled: "File mancante: {name or 'un file'}" | N/A |
| Approve | all clear, confirm | revision approved, case approved, events; redirect | N/A |
| Server overflow | overflow map missing a format, or any `true` | nothing written | `OVERFLOW_NOT_CLEARED` |
| Server material | a ref (texts' sources included) deleted | nothing written | `MATERIAL_MISSING` + ids: the configurator says which file and keeps Approva disabled |
| Stale | revision or head moved | nothing written | `STALE_REVISION`/`STALE_HEAD`: reload (as autosave) |
| Not editable | trial pages, approved case | Approva inactive as today | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261103120000_case_study_approve.sql` -- `approve_revision(p_case_id, p_revision_id, p_expected_revision_version, p_expected_head_version, p_actor_id)` security definer, service role only, modelled on `save_revision_doc` + `transition_case_study`: lock case (`NOT_FOUND`), head/`head_version` (`STALE_HEAD`), status in_review (`CASE_NOT_APPROVABLE`), revision `working` + version (`REVISION_NOT_WRITABLE`, `STALE_REVISION`); then revision → approved, case → approved + `approved_revision_id` under `mac_recap.status_transition`, `transition` event `{event:"approve", from, to}` and `revision_approved` `{ revisionId, version }`.
- `case-study/ports/revision-repository.ts`, `adapters/supabase/revision-repository.ts` -- `approve(...)` calling it, error map.
- `case-study/application/approve.ts` (new) + test -- `makeApprove(deps)`: parse input (`overflow: Record<FormatId, boolean>`), load revision (`NOT_FOUND`), every format of `doc.formats` present and `false` (`OVERFLOW_NOT_CLEARED` with the formats), `referencedAssetIds(doc)` ⊆ `allowedAssetIds` (`MATERIAL_MISSING`, up to 10 ids), then the repository. `domain/transition.ts` already has `approve`.
- `case-study/index.ts` -- `approve(actor, input, caseAssetIds)` wiring as `saveRevisionDoc`.
- `src/app/(wizard)/case-studies/[caseId]/configurator/actions.ts` (+ test) -- `approveCase(input)`: actor, `authorize(…, "approve", { status })`, `caseStudy.approve(…, material.liveAssetIds)`, then whether other cases are in_review (`caseStudy.list({ status: "in_review" })`) → `{ waiting: boolean }`; `failure` passes `assetIds` for `MATERIAL_MISSING` too.
- `page.tsx` -- pass `onApprove={approveCase}`, `headVersion` (case `head_version`), `clientAssetIds` (client's file ids) to the configurator.
- `configurator/overflow-report.tsx` (new) -- off-screen render of every format's pages (`RenderedPage`, still) + `measureOverflow`, re-measured on change/resize/fonts; returns `{ formatId, page } | null` first overflow per format and the full map.
- `configurator.tsx`, `top-bar.tsx` -- Approva enabled/disabled with reason (`aria-describedby`), confirm `Dialog`, approve flow (flush, call, stale → refresh, `MATERIAL_MISSING` → message), on success `router.push` to `/case-studies?stato=in_review&approvata=1` or `/case-studies?approvata=1`.
- `src/app/(tool)/case-studies/page.tsx` (+ component) -- `approvata=1` shows "Approvata. Ora è in libreria." in a status line.
- `it.ts` -- `configurator.approval` copy; `test/approval-guardrail.test.ts` (new) -- the guardrail.

## Tasks & Acceptance

**Execution:**
- [x] Migration + repository + `approve.ts` (+ tests) + `index.ts` -- server side.
- [x] `actions.ts` (+ test), `action-result.ts` -- the action.
- [x] `overflow-report.tsx`, `configurator.tsx`, `top-bar.tsx`, `page.tsx`, `it.ts` -- the UI.
- [x] `case-studies` page -- the approved message.
- [x] `configurator.test.tsx`, `test/approval-guardrail.test.ts`, `test/db/*` (approve_revision against local Supabase, as other `*.db.test.ts`).

**Acceptance Criteria:**
- Given a case in Da approvare with nothing overflowing and no missing file, when I press Approva and confirm, then it becomes Approvato with `approved_revision_id` set and the events recorded, and I land on Da approvare (others waiting) or Case studies with the message.

## Implementation Notes

- Implemented directly in the session. Server: migration `20261103120000_case_study_approve.sql` (`approve_revision`), `db.types.ts` entry written by hand in the generator's format (CI's drift check confirms), repository `approve`, `makeApprove` in `revisions.ts` (reuses `allowedAssetIds` and `referencedAssetIds`), `caseStudy.approve`, `approveCase` action, `httpStatusFor` codes (`OVERFLOW_NOT_CLEARED`, `MATERIAL_MISSING` 400, `CASE_NOT_APPROVABLE` 409), `failure` passes `assetIds` for `MATERIAL_MISSING`.
- `test/case-status-writes.test.ts` now sanctions `approve_revision` as the second status writer (AD-3), beside `transition_case_study`.
- UI: `overflow-report.tsx` (every format off screen, still, measured with `measureOverflow`); `useDocument.settle()` and `version()` so approval saves what's pending and approves that exact version; Approva in the top bar with its reason (`aria-describedby`, title); the confirm `Dialog`; redirect with `?approvata=1`, shown on Case studies.
- The browser checks the files the pages show against the case's and client's files; the server also checks texts' sources, and its `MATERIAL_MISSING` names the file until the next edit.
- DB tests (`test/db/revision.db.test.ts`) not run here (no Docker daemon): CI's `db` job runs them.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck`, `npm run lint`, `npm test` -- pass
- DB tests run in CI's `db` job (local Supabase)
