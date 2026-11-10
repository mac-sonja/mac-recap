---
title: 'Story 4.11b: edit an approved client intro'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: 'adaf0e433dd648936069dcf7e475853debbebcdd'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-9-edit-approved-case.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-11a-client-intro-in-the-configurator.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An approved client intro opens read-only (4.11a), so a typo or wrong image on a client's intro or closing can't be fixed without changing what's already approved.

**Approach:** Give approved intros Story 4.9's flow, exactly as cases have it. An Approvato intro opens editable under the same banner. The first edit forks a `working` copy, while live reads keep the approved version. **Aggiorna la versione approvata** applies 4.8's rules and swaps the copy in. **Scarta le modifiche**, after a confirmation, drops the copy. The intro never leaves Approvato.

## Boundaries & Constraints

**Always:**
- Same behaviour, copy and dialogs as 4.9's case flow:
  - the banner;
  - **Aggiorna** disabled with its reason;
  - the confirm dialogs;
  - the stale-version reload;
  - the copy reopened with its edits kept.
  - Where the text names the case, use the intro wording from 4.11a's `clientMode` strings.
- `forkIntroHead(clientIntroId, expectedHeadVersion)` is idempotent: it creates one `working` copy of the approved revision, or returns the existing one. The first document save forks; field edits never do.
- **Update:**
  - The server repeats 4.8's checks: no overflow, no missing material, with the 4.11a allowed set (the client's files plus the live files of its cases).
  - The copy becomes the approved revision and the old approved revision becomes `superseded`.
- **Discard:** the copy becomes `superseded`, and the head goes back to the approved revision.
- **Records:** fork, update and discard are each one transaction with a `client_event`, never a `case_event`. The intro's status stays `approved` throughout.
- **Live reads:** `getLiveRevision({ kind: "client_intro" })` returns the approved revision until an update.
- **Client fields:** they stay read-only on an approved intro, as on an approved case (owner decision 2026-11-04 for 4.9).
- The client page keeps showing Approvato, and **Apri** opens the editable configurator.

**Never:**
- Staging client fields.
- A path back to Da approvare.
- Any change to the case flow or to Da approvare intros.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Open | Approvato intro, head = approved | Editable, banner, no Aggiorna/Scarta yet | — |
| First edit | Type a text | Fork, then save to the copy; live read still the old text | `STALE_HEAD` → reload |
| Later edits | More edits | Same copy, no new fork | autosave rules |
| Update | Copy clean; confirm | Copy approved, old superseded; buttons gone | `OVERFLOW_NOT_CLEARED` / `MATERIAL_MISSING` / stale → message, nothing changes |
| Discard | Scarta, confirm | Copy superseded; approved version shown | stale → reload |
| Discard cancelled | Annulla | Nothing changes | — |
| Fields | Double-click client name | Not editable, existing message | — |
| Reopen | Copy pending, reopen | Copy shown with Aggiorna and Scarta | — |
| Cases | Any case | Unchanged | — |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261105160000_case_study_edit_approved.sql` -- `fork_head` (L28), `update_approved_revision` (L215), `discard_head` (L311): case-only templates to mirror. Each locks the subject, compare-and-sets `head_version`, writes the event, and runs status changes under the GUC guard.
- `supabase/migrations/20261107120000_case_study_intro_edit_approve.sql` -- `save_intro_revision_doc` refuses unless `in_review`. Extend it, with `create or replace` in the new migration, to accept an `approved` intro whose head is a `working` revision other than `approved_revision_id`, as 4.9 did for `save_revision_doc` (`edit_approved.sql` L126–180). Mirror `approve_client_intro` for the update.
- `src/modules/case-study/application/revisions.ts` -- `makeApprove` picks update vs approve by status (L276), `makeForkHead` (L290), `makeDiscardHead` (L307); the 4.11a intro save and approve use cases next to them. Add `forkIntroHead`, `discardIntroHead`, and update-approved for intros (extend `approveIntro` the same way); repository, port and `index.ts` exports.
- `src/app/(wizard)/case-studies/[caseId]/configurator/page.tsx` L117–151 -- how `fork`, `pendingCopy` and `editable` are derived and the handlers passed. Do the same in `src/app/(wizard)/clients/[clientId]/configurator/page.tsx` and its `actions.ts` (new: fork, update-approved, discard).
- `src/app/(wizard)/_components/configurator/use-document.ts` (L21–105: `fork`, `ForkInput`, `subjectKey` L36; the fork is case-only today) and `configurator.tsx` (`onUpdateApproved`/`onDiscard` send `caseId: subject.id`) -- send `subjectKey(subject)` for both kinds.
- `src/shared/i18n/it.ts` -- 4.9's banner and dialog strings, plus intro variants under `configurator.clientMode` where they name the case.
- `test/permissions.test.ts` -- the new actions (manual entries and count), as 4.11a did.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261110120000_case_study_intro_edit_approved.sql` -- `fork_intro_head`, `update_approved_intro_revision`, `discard_intro_head`; `save_intro_revision_doc` replaced to accept an approved intro's working copy; then `npm run db:types`.
- [x] `src/modules/case-study/**` (+ unit and db tests) -- the intro use cases and exports.
- [x] `src/app/(wizard)/clients/[clientId]/configurator/page.tsx`, `actions.ts` (+ tests) -- the approved-intro path and handlers.
- [x] `src/app/(wizard)/_components/configurator/*` (+ tests) -- fork, update and discard keyed by subject; intro wording.
- [x] `src/shared/i18n/it.ts`, `test/permissions.test.ts`.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 4.11 to `review` (4.11a and 4.11b both built).

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given the case configurator's existing tests, when they run, then they pass unchanged.

## Implementation Notes

- **Server.** Migration `20261110120000_case_study_intro_edit_approved.sql`: `fork_intro_head`, `update_approved_intro_revision`, `discard_intro_head` (mirrors of 4.9's `fork_head`, `update_approved_revision`, `discard_head`, with the intro row locked through its live client and `client_event` in place of `case_event`), and `save_intro_revision_doc` replaced to accept an approved intro whose head is a working copy other than `approved_revision_id`. No function touches `client_intro.status` or the `intro_transition` flag. `db.types.ts` regenerated with `npm run db:types`.
- **Module.** `ClientIntroRepository` gains `updateApproved`, `forkHead`, `discardHead`; `makeApproveIntro` picks `updateApproved` when the intro is approved, after the same overflow and material checks (so the module still exports one `approveIntro`); new `makeForkIntroHead` / `makeDiscardIntroHead`, exported as `forkIntroHead` / `discardIntroHead`.
- **Actions.** `forkIntroHead` (`edit`), `updateApprovedIntroVersion` (`update approved version`, refuses an intro that isn't approved) and `discardIntroChanges` (`discard`); `approveIntro` now refuses an approved intro, so neither path crosses into the other.
- **Configurator.** `ForkInput` is `SubjectKey & { expectedHeadVersion }`; the fork, Aggiorna and Scarta send `subjectKey(subject)`. In client mode the Aggiorna dialog reads `clientMode.updateDescription` and stale update/discard messages read `clientMode.stale`; the banner, buttons and other dialogs are 4.9's. The client page derives `fork` / `pendingCopy` / `editable` as the case page does.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Adapter refusal maps never tested through the adapter (gap, blind) | medium | db tests use raw SQL; use-case and action tests inject codes; the 4.9 case flow tests them (`revision.db.test.ts:1170`) | patch |
| 2 | `CASE_NOT_EDITABLE` before the fork on an approved intro untested (blind) | low | The only approved save test runs after a fork | patch |
| 3 | Re-fork after Aggiorna untested (blind) | medium | The page key may not change after update; nothing shows the next edit forks again | patch |
| 4 | Fragile early returns in the end-to-end db test (blind) | low | `if (!x.ok) return;` can turn the test into a no-op | patch |
| 5 | Missing ids in update and discard failure logs (blind) | low | `forkHead` logs ids, the other two only `actorId` | patch |
| 6 | Action docs promise 400 for a malformed id; 404 is returned (gap) | low | The pre-check runs `getClientIntroById` first | patch |
| 7 | Doc comments mention cases only (blind) | low | `use-document.ts`, `configurator.tsx`, `it.ts` comments | patch |
| 8 | Contradictory sprint-status comment (blind) | low | It says 4.11b deferred and built | patch |
| 9 | Two status reads can race between approve and update (blind) | low | The SQL still refuses (`STALE_HEAD` / `REVISION_NOT_WRITABLE`), as the edge-case trace confirmed; it needs two people approving the same intro within milliseconds | reject |
| 10 | More SQL refusal paths untested (deleted client, other intro's revision, unknown id) (blind) | low | Line-for-line mirrors of the tested case functions | reject |
| 11 | `discard_intro_head` returns the approved revision unchecked (blind) | false | `approved_revision_id` always points at an `approved` row: only the approve and update functions set it, in the same transaction that approves the row | reject |
| 12 | "Si potrà modificare presto" on the client name of an approved intro (blind) | false | The spec keeps the existing message, as 4.9 does for approved cases (owner, 2026-11-04) | reject |
| 13 | Client-mode refusal UI paths untested (`MATERIAL_MISSING`, `OVERFLOW_NOT_CLEARED`, failures) (blind) | low | The same configurator code is tested in case mode | reject |
| 14 | Permission rows mock every intro as `in_review` (blind) | low | Role checks run before the status pre-check; the rows test what they claim | reject |
| 15 | Edge-case trace (edge) | false | Every branch traced; no unhandled path | reject |

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass (local Supabase), including the intro fork, update and discard tests.
- `npm run build` -- expected: pass.
