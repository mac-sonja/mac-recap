---
title: "Story 4.12b: reorder a client's cases"
type: 'feature'
created: '2026-11-10'
status: 'in-review'
baseline_commit: 'ddb6f2ffff2c2f198e01bd93817e9e58d182c396'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-12a-client-file-configurator.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In the client's file (4.12a), the cases are always newest created first. The owner can't choose the order the client's story is told in. The client pack (B5) needs that order too (owner decision, 2026-10-28: newest first by default; once reordered here, the pack follows).

**Approach:** The **Progetti del cliente** rows become draggable. Dropping a row on another moves that case and its pages in every format, and saves the order for the client at once. The case-study module then lists a client's approved cases in that order, for the file now and for the pack later.

## Boundaries & Constraints

**Owner decision (2026-11-10):** a case approved after the client has a saved order goes at the **end** of the order, after the arranged ones.

**Always:**
- **Storage:** the order is stored once per client in a new forward-only migration, written only through a `security definer` function executable by `service_role`, with RLS as on the other client tables. The function:
  - refuses ids that aren't the client's own non-deleted cases (`INVALID_INPUT`);
  - refuses an unknown or deleted client (`CLIENT_NOT_FOUND`);
  - keeps ids in the order given, and ignores nothing silently.
- **Ordering rule**, used by `case-study` (one function, used by the file and exported for B5):
  - With no saved order, cases are listed newest created first, as today.
  - With a saved order, saved cases come in that order. Any approved case not in it (approved later) follows, newest created first.
  - Ids in the saved order that are no longer approved or no longer exist are skipped.
- **Dragging:** dragging a project row onto another row moves the dragged case to that position.
  - The canvas and the Pagine panel reorder in every format at once.
  - The order is saved through a new action (`reorderClientCases`, `manage clients`).
  - Owner/designer only. A row is not draggable for a role that can't edit.
- **Keyboard:** a focused row also moves with Alt+↑ / Alt+↓, and the move is announced ("{code} spostata in posizione {n} di {total}").
- **Failure:** a failed save puts the previous order back and says "Ordine non salvato. Riprova."
- **Undo:** reordering is a client setting saved at once, not a page edit. ⌘Z does not undo it; dragging back does.
- **No case data changes:** moving cases changes no case or intro revision.

**Never:**
- Reordering pages inside a case from the project rows (4.13 does that).
- Reordering the intro or the closing.
- Building the client pack (B5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Default | 3 approved cases, no saved order | Newest created first | — |
| Drag | Drag the 3rd row onto the 1st | Order 3,1,2 in canvas and Pagine, every format; saved; reload keeps it | — |
| Keyboard | Focus a row, Alt+↑ | Moves up one; announced; saved | — |
| New approval | Saved order A,B; case C approved later | A,B,C | — |
| Gone case | Saved order A,B,C; B deleted or no longer approved | A,C | — |
| Save fails | Action errors | Previous order back; message | "Ordine non salvato. Riprova." |
| Foreign id | Action called with another client's case id | Nothing saved | `INVALID_INPUT` |
| Read-only role | A role that can't edit | Rows not draggable | — |

</frozen-after-approval>

## Code Map

- `supabase/migrations/` -- new `20261110140000_case_study_client_case_order.sql`. Store the order on the client (an ordered uuid array or an order table; pick the simpler with the RLS pattern of `20261019140000_case_study_client_material.sql`). The `set_client_case_order(p_client_id, p_case_ids, p_actor_id)` writer validates the ids against `case_study` (`client_id`, `deleted_at is null`).
- `src/modules/case-study/` -- port, adapter and use case `setClientCaseOrder`, plus `orderClientCases` (the pure ordering rule in `domain/`, unit-tested) and `listClientCasesInOrder(clientId)` (approved cases in that order), exported from `index.ts`.
- `src/app/(wizard)/clients/[clientId]/configurator/file-parts.ts` L112–119 -- replace the newest-first sort with the module's order. `actions.ts` -- `reorderClientCases`.
- `src/app/(wizard)/_components/configurator/right-panel.tsx` (project rows L49–92, L310–330; page drag pattern `PAGE_DRAG_TYPE`) and `use-client-file.tsx` / `client-file.ts` (segment order) -- draggable rows, keyboard moves, optimistic reorder with rollback, the order fed back into `composeParts`.
- `src/shared/i18n/it.ts` -- the move announcement, the failure message, the row's drag label.
- `test/permissions.test.ts` -- the new action.

## Tasks & Acceptance

**Execution:**
- [x] The migration, then `npm run db:types`.
- [x] `src/modules/case-study/**` (+ unit and db tests) -- the ordering rule, the use case, the listing.
- [x] `src/app/(wizard)/clients/[clientId]/configurator/*` (+ tests) -- the order in the file; the action.
- [x] `src/app/(wizard)/_components/configurator/*` (+ tests) -- drag and keyboard reorder, rollback, announcement.
- [x] `src/shared/i18n/it.ts`, `test/permissions.test.ts`.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 4.12 to `review` (4.12a and 4.12b both built).

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given the case configurator and 4.12a's tests, when they run, then they pass unchanged, apart from the order source.

## Implementation Notes

- **Storage.** `client_case_order` (one row per client: `case_ids uuid[]`, `updated_by`, `updated_at`), RLS on with no policies, revoked from anon/authenticated, `select` only for the service role. `set_client_case_order(p_client_id, p_case_ids, p_actor_id)` (security definer, service role only, per-client advisory lock) replaces the row; `INVALID_INPUT` for a null argument, a null, repeated, foreign, unknown or deleted id, or more than 500 ids; `CLIENT_NOT_FOUND` for an unknown or deleted client. No event is written: `client_event` needs an intro, and a client setting is not a case event.
- **Module.** `domain/client-case-order.ts`: `orderClientCases` (pure rule; ids compared case-insensitively, equal creation times keep the list's order) and the input schema. `ports/` + `adapters/supabase/client-case-order-repository.ts`. `application/client-case-order.ts`: `setClientCaseOrder` and `listClientCasesInOrder` (approved cases of the client, ordered). `index.ts` exports both use cases, `orderClientCases` and `ClientCaseOrder` (for B5).
- **Route.** `casePartsOf` reads `listClientCasesInOrder`. New action `reorderClientCases` (`manage clients`). The page passes `file.onReorderCases` only when the actor `can` `manage clients`; the configurator key's fingerprint is now sorted by part key, so a refresh after a reorder saved here doesn't remount the file.
- **Configurator.** `ClientFile.onReorderCases`; `moveKey` in `client-file.ts`. `useClientFile().moveCase(key, to)` reorders the mounted cases (so canvas and Pagine follow in every format), announces "{code} spostata in posizione {n} di {total}", and queues the save (saves run one after another). A failed or thrown save of the latest move puts back the last confirmed order and says "Ordine non salvato. Riprova."; it is never an undo step. `RightPanel.onMoveProject`: rows draggable (own drag type, drop line as for pages), Alt+↑/↓ with `aria-keyshortcuts` and a `title`, focus kept on the moved row. Without `onReorderCases` the rows don't drag or move.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass (local Supabase).
- `npm run build` -- expected: pass.
