---
title: 'Story 4.9: edit an approved case and update the approved version'
type: 'feature'
created: '2026-11-04'
status: 'in-progress'
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
- [ ] `supabase/migrations/20261105160000_case_study_edit_approved.sql` + `db.types.ts`:
  - `fork_head` (idempotent);
  - `save_revision_doc` accepting an approved case's working fork;
  - the update path (same checks as `approve_revision`; previous approved → `superseded`; status stays approved);
  - `discard_head`;
  - events, service role only.
- [ ] `src/modules/case-study` use cases, ports and adapters, with unit tests: fork idempotent, update supersedes, discard returns, live read unchanged until update, stale errors.
- [ ] Configurator page, actions and autosave fork path; top bar Aggiorna/Scarta with the confirm dialogs; the banner; fields off when approved. Tests for every matrix row.
- [ ] `src/shared/i18n/it.ts` + `it.test.ts`; `test/permissions.test.ts` rows; `test/db/revision.db.test.ts`: fork, save on the fork, update, discard, and `getLiveRevision` before and after.
- [ ] A guardrail test: no path from Approvato back to Da approvare or Bozza.

**Acceptance Criteria:**
- Given a pending copy, when a person opens the approved case's page or the library, then they see the approved version, not the copy.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` (Node 24) -- expected: all green
- `npm run test:db` (CI) -- expected: green, including the new migration

**Manual checks:**
- On mac-recap-dev, once the migration is applied: edit an approved case, check the case page is unchanged, update, and check the case page shows the edit; then edit again and discard.
