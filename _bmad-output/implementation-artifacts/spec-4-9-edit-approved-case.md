---
title: 'Story 4.9: edit an approved case and update the approved version'
type: 'feature'
created: '2026-11-04'
status: 'done'
baseline_commit: 'a8e082efb3ef01886ccd9ca0d4891b3d697f9cbb'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An approved case opens read-only in the configurator. A typo or a wrong image can't be fixed without touching what people already see.

**Approach:** An Approvato case's configurator is editable, under a banner. The first edit forks a `working` copy of the approved revision, and every edit stages there while live reads keep returning the approved revision. **Aggiorna la versione approvata** runs Story 4.8's approval rules on the copy: it becomes the approved revision, and the old one becomes `superseded`. **Scarta le modifiche** drops the copy and returns to the live version. The case never leaves Approvato.

**Decisions (owner, 2026-11-04):**
- Client and case fields (4.3d: name, sector, logo, year, services, Risultati, Testimonial) stay read-only on an approved case, because they live on the records and can't be staged. A double-click says they can't be edited here, as today.
- **Scarta le modifiche** asks for confirmation first («Scartare le modifiche? Torni alla versione approvata.», **Scarta** / **Annulla**), because it can't be undone.

## Boundaries & Constraints

**Always:**
- `forkHead(caseId, expectedHeadVersion)` is idempotent. It creates one `working` revision copied from `approved_revision_id` (both `doc` and `generated_doc`), or returns the existing one.
- The fork happens on the first document save, inside the autosave path (4.3a). Field edits never fork.
- **Aggiorna la versione approvata** is enabled only when the head differs from the approved revision, no format overflows and no referenced material is deleted. Disabled, it names what's left, as **Approva** does (4.8). It confirms with a dialog, and on the server it reuses 4.8's checks: `OVERFLOW_NOT_CLEARED`, `MATERIAL_MISSING`, `STALE_REVISION`, `STALE_HEAD`.
- Updating sets the head to `approved` and `approved_revision_id` to the head, and the previous approved revision becomes `superseded`. Discarding sets the head to `superseded` and `head_revision_id` back to `approved_revision_id`. Both are one transaction with a `case_event` carrying the actor.
- The case status stays `approved` throughout, and there is no path back to Da approvare or Bozza.
- Every live read (`getLiveRevision`: case page, library, exports) returns the approved revision until an update.
- Italian copy from `it.ts`, house voice.

**Never:**
- Staging client or case fields.
- The live-link count in the banner (5.5).
- A per-block check.
- Approving several cases at once.
- Changes to Da approvare behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | Approvato case, head = approved | Editable canvas; banner «Approvata. Le modifiche vanno online quando aggiorni la versione approvata.»; no Aggiorna or Scarta in the top bar | N/A |
| First edit | Type in a text | `forkHead` creates the working copy; the edit saves there; the case page still shows the old text | `STALE_HEAD` → reload, as autosave does |
| Later edits | More edits, undo | Saved to the same copy, no new fork | Autosave rules (4.3a) |
| Update | Copy without overflow or missing files; confirm | The copy becomes the approved revision; the case page, library and exports show it; Aggiorna and Scarta disappear | `OVERFLOW_NOT_CLEARED` / `MATERIAL_MISSING` / stale → message, nothing changes |
| Update blocked | Overflow on Carosello p. 3 | Aggiorna disabled, naming "Carosello, pagina 3" | N/A |
| Discard | Scarta, then confirm | Copy superseded; the canvas shows the approved version; buttons disappear | Stale → reload |
| Discard cancelled | Annulla in the dialog | Nothing changes | N/A |
| Fields | Double-click the client name on an approved case | Not editable; the existing message | N/A |
| Reopen later | Copy pending, configurator reopened | The copy is shown (edits kept), with Aggiorna and Scarta | N/A |
| Da approvare | Any Da approvare case | Behaviour unchanged | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261020160000_case_study_revision.sql` -- `revision.status` transitions (working → approved | superseded, approved → superseded), the head and approved pointers and `head_version`, and the fork-like insert in the generate path (around lines 140–230), as a pattern.
- `supabase/migrations/20261029120000_case_study_save_revision_doc.sql` -- refuses unless the case is `in_review` (`CASE_NOT_EDITABLE`). It must also accept an `approved` case whose head is a `working` revision other than `approved_revision_id`.
- `supabase/migrations/20261103120000_case_study_approve.sql` -- `approve_revision` refuses unless `in_review` (`CASE_NOT_APPROVABLE`). Add the update path for an approved case, or a sibling `update_approved_revision` with the same checks.
- `src/modules/case-study` -- `revisions.ts` (save, approve, `allowedAssetIds`), `transition.ts`, `index.ts`. Add `forkHead`, `updateApproved` (or extend `approve`) and `discardHead`, with ports and adapters.
- `src/app/(wizard)/case-studies/[caseId]/configurator/page.tsx` (line 101: `editable` requires `in_review`) and `actions.ts` (`saveRevisionDoc`, `approveCase`) -- the approved-case path: editable, the fork-on-first-save action, update and discard.
- `src/app/(wizard)/_components/configurator/use-document.ts` (autosave) -- the first save on an approved head calls the fork first, then saves to the returned revision id and version.
- `configurator.tsx`, `top-bar.tsx`, `overflow-report.tsx` -- reuse 4.8's overflow report and disabled-reason for Aggiorna. Field edits (4.3d) are off when the case is approved (`fieldsOn`).
- `src/app/_components/dialog.tsx` -- the confirm dialogs.
- `src/shared/i18n/it.ts` -- the banner, buttons, dialogs and messages.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261105160000_case_study_edit_approved.sql` + `db.types.ts`:
  - `fork_head` (idempotent);
  - `save_revision_doc` accepting an approved case's working fork;
  - the update path (same checks as `approve_revision`; previous approved → `superseded`; status stays approved);
  - `discard_head`;
  - events, service role only.
- [x] `src/modules/case-study` use cases, ports and adapters, with unit tests: fork idempotent, update supersedes, discard returns, live read unchanged until update, stale errors.
- [x] Configurator page, actions and autosave fork path; top bar Aggiorna/Scarta with the confirm dialogs; the banner; fields off when approved. Tests for every matrix row.
- [x] `src/shared/i18n/it.ts` + `it.test.ts`; `test/permissions.test.ts` rows; `test/db/revision.db.test.ts`: fork, save on the fork, update, discard, and `getLiveRevision` before and after.
- [x] A guardrail test: no path from Approvato back to Da approvare or Bozza.

**Acceptance Criteria:**
- Given a pending copy, when a person opens the approved case's page or the library, then they see the approved version, not the copy.

## Implementation Notes

- **Update path.** A sibling SQL function `update_approved_revision` (4.8's `approve_revision` is untouched and still refuses an approved case). The `approve` use case runs the same checks (stale version, overflow, material) and then calls `updateApproved` when the case is `approved`, `approve` otherwise, so the module still exports a single `approve` (the 4.8 guardrail). Server actions: `updateApprovedVersion` (`update approved version`, refuses a case that isn't approved) and `approveCase` now refuses an approved case, so neither path crosses into the other.
- **Fork.** `fork_head(case, expectedHeadVersion, actor)` returns `{ revision, headVersion }` as JSON; idempotent: an existing working copy is returned with nothing written, whatever the expected head version (a retry after a lost response, or a second tab, lands on the same copy; its stale `version` then reloads). It bumps `head_version`; update leaves it as approval does; discard bumps it.
- **Events.** `revision_forked`, `approved_version_updated`, `revision_discarded` (all with the actor). No `transition` event: the status never changes.
- **Autosave.** `useDocument` forks on the first save when `revision.fork` (head = approved revision), then saves to the copy's id and version; a failed fork retries like a save, a stale one reloads. After **Aggiorna** the hook re-arms the fork; the configurator stays mounted (same key) and says "Versione approvata aggiornata. Ora è online.". **Scarta** settles pending saves, discards, and refreshes: the head changes, so the configurator remounts on the approved version.
- **Top bar.** With a copy pending, the right column grows to fit **Scarta le modifiche** and **Aggiorna la versione approvata**; the name truncates instead. "Aggiorna la versione approvata" is four words, allowed in the CTA test as the spec's own wording.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | blind, edge | A second tab's first save overwrites the first tab's edits on the copy | high | `fork_head` returns the existing copy's current version; `useDocument` adopts it, so compare-and-set passes | patch |
| 2 | blind, edge | `save_revision_doc` and `update_approved_revision` accept an approved case with no approved revision | medium | The guard is true when `approved_revision_id` is null; pre-4.8 approved cases exist (5.2's interim) | patch |
| 3 | blind | `head.current` never follows the prop, so Aggiorna, Scarta and fork stay stale after a refresh with the same key | medium | `useRef(headVersion)` set once | patch |
| 4 | blind, edge | Scarta ignores whether the pending save landed, and edits after a discard (before the remount) write to the discarded copy | medium | `discardCopy` ignores `settle()`; the document isn't stopped | patch |
| 5 | blind, edge | `approveCase` carries on when the case read fails, so an Approva click can run the update path | medium | `if (!found.ok)` is missing | patch |
| 6 | blind, edge | Some Aggiorna failures give no feedback; `REVISION_WRITE_FAILED` shows as "changed" | low | Early returns with no message; direct correction | patch |
| 7 | blind | The top bar's grid changes on the first fork, so the switch jumps off centre | low | A visible jump mid-edit; reserve the column on an approved case | patch |
| 8 | blind | `APPROVED_VERSION_UPDATED` not re-exported from `index.ts` | low | Direct correction | patch |
| 9 | blind | New events don't appear in Attività | low | Not in the spec; worth adding | defer |
| 10 | blind | A pending copy is invisible outside the configurator | low | Not in the spec; a marker is new UI | defer |
| 11 | blind | Aggiorna offered when the copy's content equals the approved one | low | "Differs" is by revision id; an identical update is harmless | rejected |
| 12 | blind | Superseded copies accumulate with no retention | low | Same as every revision since 3.3 | defer |
| 13 | gap | No test: an unsent edit at unmount forks, then saves to the copy | gap | Pre-verified | patch (test) |
| 14 | gap | No test: Aggiorna waits for the save and stops on `notSaved` | gap | Pre-verified | patch (test) |
| 15 | blind | Missing `it.test.ts` checks for several new strings; guardrail is a regex over SQL | low | Direct additions | patch (test) |
| 16 | blind | Spec status vs sprint status | false | The workflow syncs them at finalize | rejected |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` (Node 24) -- expected: all green
- `npm run test:db` (CI) -- expected: green, including the new migration

**Manual checks:**
- On mac-recap-dev, once the migration is applied: edit an approved case, check the case page is unchanged, update, and check the case page shows the edit; then edit again and discard.
