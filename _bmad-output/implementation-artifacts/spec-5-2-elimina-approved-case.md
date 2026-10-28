---
title: 'Story 5.2 (part): approved case page in the tool shell, with Raccolte and Elimina'
type: 'feature'
created: '2026-10-28'
status: 'in-progress'
baseline_commit: '621af054fa028ee5e6e938ee082b6c5b81d7d7a3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no way to delete an approved case: `delete case` and `delete_case_study` allow only a draft (AR3). The owner decided on 2026-10-28 that **Elimina** belongs on the approved case's detail page. Also, the detail page from #120 currently looks like the configurator, a full-screen frame. The owner says it is a detail page and should work like the client detail page.

**Approach:** Move `/case-studies/{id}` into the tool shell, so the sidebar shows and the layout matches the client page. It gets a back link, a header with the name, code and badge, and **Scarica** and **Modifica** on the right. The format switch and the read-only preview come next, then a **Raccolte** section listing the collections the case appears in. Collections don't exist until Story 5.10, so for now it always shows the empty line. **Elimina** sits bottom left of the page, as **Elimina bozza** does in the draft, and only Owner and Amministratore see it. Elimina asks for the same typed *elimina* confirmation. The delete is soft and is recorded with reason `approved_deleted`; afterwards the browser goes to Case studies. The caller states the status it is deleting (`draft` or `approved`). The policy and SQL both check that status, so **Elimina bozza** can never delete an approved case, and **Elimina** can never delete a draft.

**Decisions (owner, 2026-10-28):** Elimina sits bottom left, as in the draft. The page is conceptually a detail page like the client page, not the configurator. The reshape and Elimina ship together. The Raccolte section ships now, empty. The case's activity log is the next spec, right after this one.

## Boundaries & Constraints

**Always:** Permissions live only in `access/domain/policy.ts`. The action authorizes `delete case` with the stated status. SQL refuses with `CASE_NOT_DELETABLE` and writes nothing when the case's current status differs from the stated one. The migration is forward-only: drop `delete_case_study(uuid, uuid)` and create `delete_case_study(uuid, uuid, text)`, service role only. Keep everything else #120 built: the access rules and redirects, the live revision, the Anteprima canvas, slideshow ← → keys, the Instagram overlay, the *Bozza di prova* fallback, and the narrow-screen message. Italian copy comes from `it.ts` only. Follow the house rules in mac-recap-ui.

**Never:** No Delete on table rows, on Home or in the configurator. No hard delete. Generating and Da approvare cases stay undeletable. No pager, zoom or full screen (they stay in deferred-work). No activity log (next spec). No collection data or reads: the Raccolte section takes no data until 5.10. No changes to links, client packs or collections, which don't exist yet; they only get planning notes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Delete approved | Owner or Amministratore types *elimina* (`{ caseId, status: "approved" }`) | `deleted_at` is set and one `case_deleted` event `{ reason: "approved_deleted", … }` is written. The browser goes to `/case-studies`, and the case is gone from every list | N/A |
| Editor role | account/sales/social | The page shows no Elimina, and the action returns 403 `FORBIDDEN` | N/A |
| Status mismatch | The caller states one status, but the case is in another | `CASE_NOT_DELETABLE`, nothing written | The dialog says the case's status has changed and refreshes the page |
| Already gone | The case was deleted elsewhere | Treated as done: the browser goes to `/case-studies` | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(tool)/clients/[clientId]/page.tsx` -- the layout to mirror: back link (`ChevronLeft`, muted label), then the header row (`h1` in heading style, mono code, actions on the right), with `gap-8` between sections.
- `src/app/(wizard)/case-studies/[caseId]/page.tsx` -- move it, with its test, to `src/app/(tool)/case-studies/[caseId]/page.tsx`. Keep the loader and redirects. Import the configurator helpers via `@/app/(wizard)/_lib/configurator-data`. Add `canDelete = can(actor, "delete case", { status: "approved" })`. Next allows `(wizard)/case-studies/[caseId]/configurator` to stay where it is.
- `src/app/(wizard)/_components/case-view/case-view.tsx` -- move it, with its test, to `src/app/(tool)/case-studies/_components/case-view.tsx`. Replace the full-screen frame (`h-dvh`, top bar, own `<main>`; the tool layout already has the `<main>`) with the client-page layout. Under the header goes `FormatSwitch`, then the `Canvas` (`h-full overflow-auto`) inside a bordered, rounded panel of fixed height. A viewport-based height (e.g. `h-[calc(100dvh-…)]`, min ~560 px) keeps one slide in view. Then the **Raccolte** section (an `h2` and the empty line), then the bottom-left Elimina. Keep the props, keys, reduced motion and narrow message. `DocumentHeading` won't fit here, so build the header inline. Keep the badge component that `DocumentHeading` uses.
- `src/app/(tool)/case-studies/_components/delete-case-button.tsx` -- add `status: "draft" | "approved"` and send it. The `bar` variant (the draft footer) stays as it is. Approved copy: title "Eliminare {name}?", description, and button **Elimina**. Its done path goes to `/case-studies`, like `bar`. `CASE_NOT_DELETABLE` shows `notDraft` for a draft and a new `statusChanged` message for approved.
- `src/app/(wizard)/case-studies/new/page.tsx:75` -- pass `status="draft"`.
- `src/app/(tool)/case-studies/actions.ts:57` -- parse `{ caseId, status }` with the domain schema, then call `authorize(actor, "delete case", { status })`.
- `src/modules/access/domain/policy.ts:70` -- `"delete case"` becomes owners(draft or approved). Update `policy.test.ts:19` and `authorize.test.ts:30`.
- `src/modules/case-study/domain/case-study.ts:491` -- add `status: z.enum(["draft","approved"])` to the schema. Port, adapter (`softDelete(caseId, status, actorId)`, `p_status`, and the `CASE_NOT_DELETABLE` message), use case, `index.ts:189` docs, and the fake at `use-cases.test.ts:171`.
- `supabase/migrations/20261021170000_case_study_delete.sql` -- the function to supersede (don't edit it). Add a new `20261028220000_case_study_delete_approved.sql`: check `p_status in ('draft','approved')` and `existing.status = p_status`, set the reason to `p_status || '_deleted'`, and keep the same revoke/grant. Run `npm run db:types` (or edit the `delete_case_study` Args by hand if no local Supabase).
- `test/db/case-study.db.test.ts:2952-3015` -- the delete suite: three arguments, approved deletes, mismatches refused, grants. `test/authorize-guard.test.ts:67` still passes.

## Tasks & Acceptance

**Execution:**
- [ ] Migration and `db.types.ts`.
- [ ] Policy and its tests.
- [ ] case-study module (schema → port → adapter → use case → index) and its tests.
- [ ] `actions.ts` and `actions.test.ts`: approved ok, editor 403, missing or other status `INVALID_INPUT`.
- [ ] `delete-case-button.tsx` and its test: approved copy and redirect, the mismatch message, draft path unchanged.
- [ ] Move the page and `CaseView` with their tests, reshape to the client-page layout, add the empty Raccolte section and bottom-left Elimina.
- [ ] `it.ts`: `caseView.collections` heading "Raccolte" and empty line "Non è in nessuna raccolta."; approved description "La case history approvata sparisce da ogni elenco, insieme al materiale caricato. Non si torna indietro."; `statusChanged` "Nel frattempo il suo stato è cambiato, quindi non si può eliminare."
- [ ] DB tests as in the Code Map.
- [ ] Planning: in `epics.md`, amend AR3 (delete in `draft` or `approved`, soft; owner 2026-10-28) and update the 5.2 note (tool shell page, Elimina built; pager/zoom/full screen and narrow viewports still backlog). Add notes on 5.5/5.7 (a deleted case's links stop working) and on 5.9/5.10 (it leaves client packs and collections; 5.10 fills the case page's Raccolte section with the collections it appears in, each linking to it). In `deferred-work.md`, mark the Elimina entry resolved.

**Acceptance Criteria:**
- Given an Approvato row, when I open it, then the page shows inside the tool shell with the sidebar, laid out like the client page, and switching format still shows the read-only preview.
- Given an approved case, when its page loads, then a **Raccolte** section reads "Non è in nessuna raccolta."
- Given an approved case deleted from its page, when anyone opens its URL, then they are sent to `/case-studies`, and it is gone from the table, Home and the counts.
- Given an open draft, when **Elimina bozza** is confirmed, then it behaves exactly as before.

## Design Notes

The status the person confirmed is what gets checked, not the status read at click time. So a page loaded as Bozza can't delete a case that has meanwhile become Approvato.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: all pass
- `npm run test:db` -- expected: the delete suite passes (needs local Supabase; if unavailable, say so)

**Manual checks:**
- Open an approved case in a browser and compare it against the client page.
