---
title: 'Delete a client'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_commit: '4c05b53835309baeca450c5d89c75fa6ff25bdbf'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Clients can't be deleted (Story 2.13), so a test or mistaken client stays forever. The owner asked (2026-10-19) for an **Elimina cliente** button in **Modifica cliente**. It deletes the client and all its case histories, approved ones included, after a warning in which the user types the client's name.

**Approach:** Soft-delete the client and every one of its cases in one database function. Nothing is hard-deleted, so the events stay. A deleted client disappears from every read, and its code is never given to another client.

## Boundaries & Constraints

**Always:**
- **The button.** **Elimina cliente** shows only in the client wizard's edit mode (`?clientId=`, step 1), below the form, in danger style. It is owner/designer only (`manage clients`) and hidden below 1024 px.
- **The dialog** (`src/app/_components/dialog.tsx`):
  - title "Eliminare {nome}?";
  - text "Verranno eliminate anche le sue {n} case history, comprese quelle approvate. L'operazione non si può annullare.", where {n} is the client's non-deleted case count (with 0 the sentence becomes "Il cliente non ha case history.");
  - a field "Scrivi il nome del cliente per confermare";
  - **Annulla** and **Elimina**. **Elimina** stays inactive until the typed text, trimmed with inner whitespace collapsed, equals the client's name exactly.
- **The database function.** `delete_client(p_client_id, p_confirm_name, p_actor_id)`, in one transaction and under the client advisory lock:
  - it refuses an unknown or already deleted client (`CLIENT_NOT_FOUND`) and a confirm name that doesn't match after the same normalisation (`CLIENT_DELETE_NAME_MISMATCH`);
  - it sets `deleted_at` on the client and on every non-deleted case of the client, whatever its status;
  - it writes one `case_event` of type `deleted`, with the actor, per case;
  - it returns the number of cases deleted.
- **After deleting:** the browser goes to `/clients`.
- **A deleted client is invisible everywhere:**
  - the Clients table and its search;
  - the client page and the wizard (both answer not found and go back to `/clients`);
  - the case wizard's client picker;
  - every client write action and RPC (`update_client`, `save_client_brief_field`, logo and material presign, confirm and remove, all answering `CLIENT_NOT_FOUND`).
- **Names and codes:** a deleted client's name can be used by a new client. Its code is never reused.
- **Its cases** disappear from the Case history table and from every case read, as soft-deleted cases already do.

**Never:**
- Hard-deleting any row or storage object.
- Editing an applied migration, or running `supabase db push`.
- An undo or restore UI.
- Deleting a single case history (that is Story 4.x).
- A delete action for any other role.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Delete with cases | Client with 2 cases (1 approved); name typed | Client and both cases get `deleted_at`; 2 `deleted` events; redirect to `/clients`, client gone | N/A |
| No cases | Client with 0 cases | Text says it has no case histories; delete works | N/A |
| Wrong name | Typed "Lumen" for "Lumen S.r.l." | **Elimina** inactive | Direct call → `CLIENT_DELETE_NAME_MISMATCH`, nothing written |
| Spaces | "  Lumen   S.r.l. " | Accepted | N/A |
| Already deleted | Second call, or stale tab | Nothing changes | `CLIENT_NOT_FOUND` |
| Reuse name | New client named like the deleted one | Created, with a new code | N/A |
| Edit after delete | Stale wizard tab saves | Refused | `CLIENT_NOT_FOUND` |
| Other role | account/sales/social or admin | Fails | `FORBIDDEN`, nothing written |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261015120000_case_study_clients_and_codes.sql`:
  - L26 `client_name_key_key` (a plain unique constraint): drop it and replace it with a partial unique index `where deleted_at is null`;
  - L28 `client_code_key`: keep it;
  - L421–436 the delete and truncate triggers: keep them (soft delete is an UPDATE, which they don't block).
- `supabase/migrations/20261019120000_case_study_client_wizard.sql`:
  - `create_client` L102–103: the name check needs `and deleted_at is null`. The code pick at L119 already scans all rows, so codes are never reused; keep it.
  - `update_client` (~L167–173) and `save_client_brief_field` (L224): exclude deleted clients.
- Also exclude deleted clients in `insert_client_asset` and `delete_client_asset` (`20261019140000`), and in `delete_client_logo` (`20261016160000` L17). Each must be recreated in the new migration, `20261019180000_case_study_client_delete.sql`, since applied migrations are never edited.
- `supabase/migrations/20261009140000_case_study.sql` L28–39: `case_event.type` is snake_case free text, so the new type is `deleted`.
- `src/modules/case-study/domain/case-event.ts` L4–7: add a `CASE_DELETED` constant.
- `src/modules/case-study/adapters/supabase/client-repository.ts`:
  - `list` L221, `listWithCaseCounts` L241 and `findById` L261 add `.is("deleted_at", null)`;
  - add `deleteClient`, mapping P0001 codes to errors;
  - `client-repository.test.ts` L97–114 asserts exactly one `.is` call and must be updated.
- `src/modules/case-study/application/`: add a new `delete-client.ts` use case, plus `index.ts` exports.
- The logo and material use cases rely on the RPCs, and `findById` now filters deleted clients, so they inherit `CLIENT_NOT_FOUND`.
- `src/modules/access/index.ts` L42–75: add `CLIENT_DELETE_NAME_MISMATCH` → 400. In `policy.ts` L57, fix the comment; the rule stays `manage clients`.
- `src/app/(tool)/clients/actions.ts`: add `deleteClient`.
- `src/app/(wizard)/clients/new/page.tsx` (edit branch) passes the case count. Add a new `_components/delete-client-button.tsx` using `Dialog`. Add a `DANGER_ACTION` style in `button-styles.ts` (tokens `--color-danger`, `--color-danger-foreground`).
- `src/app/(tool)/clients/page.test.tsx` L72 "has no delete control": the list page still has none; keep the test and narrow its name.
- Docs to change:
  - `epics.md`: L128 UX-DR35 "No delete.", L747–749 (the 2.13 no-delete AC), L122 UX-DR28 (add "Elimina cliente");
  - `ARCHITECTURE-SPINE.md` L360 (AD-21 rule 3) and L362;
  - `EXPERIENCE.md` L313 and L507 (C11).

  Each note reads "owner, 2026-10-19: clients can be deleted (soft), with their cases".

## Tasks & Acceptance

**Execution:**
- [x] The migration:
  - add `client.deleted_at timestamptz null`;
  - replace the name unique constraint with a partial unique index;
  - recreate `create_client`, `update_client`, `save_client_brief_field`, `insert_client_asset`, `delete_client_asset` and `delete_client_logo` with the deleted filter;
  - add `delete_client`;
  - grants to service_role only.
- [x] The case-study module and the action, with use-case, repository and action tests (`FORBIDDEN`, mismatch, not found).
- [x] The UI button and dialog, with component tests:
  - **Elimina** is inactive until the name matches;
  - the count text, including 0;
  - the redirect;
  - the button is hidden in add mode.
- [x] DB tests in `test/db/case-study.db.test.ts`, one per matrix row, plus:
  - deleted clients are absent from `list`, `listWithCaseCounts`, `findById` and the picker;
  - writes on a deleted client are refused;
  - the code is not reused.
- [x] The doc notes from the Code Map.

**Acceptance Criteria:**
- Given a deleted client's case, when any case read runs (the table, `findById`, `getClientInfoForCase`), then it is not found, as for any soft-deleted case.
- Given CI, when `check`, `db` and `image` run, then they pass and `db.types.ts` matches.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all pass.
- `npm run test:db` -- runs in CI only.

**Manual checks:**
- After the owner applies the change to dev, delete the "test" client and check that it is gone from Clienti and that its case histories are gone from Case history.

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | edge-case | A thrown action (network drop) leaves the dialog pending forever; Annulla and Esc do nothing | medium | patch | `confirm()` has no try/finally around `deleteClient`. |
| 2 | blind, edge-case | `CLIENT_DELETE_NAME_MISMATCH` from a stale name (renamed elsewhere) shows the generic "Riprova", which can never succeed | low | patch | Falls into the generic branch; a refresh and a specific message fix it. |
| 3 | blind, edge-case | The browser's `\s`/`trim()` normalisation differs from the SQL one (NBSP and other Unicode spaces) | low | patch | The component and SQL rules disagree; the domain helper is unused. |
| 4 | blind | No record of who deleted a client (a client with 0 cases leaves no trace) | medium | patch | `delete_client` writes the actor only into case events; the migration is unapplied, so a `deleted_by` column is cheap. |
| 5 | blind, verification-gap | Event type `deleted` is inconsistent with `case_created`, and `CASE_DELETED` is unused | low | patch | Rename to `case_deleted` in the SQL and the constant, and assert it in a DB test. |
| 6 | blind | Inactive **Elimina** has no linked reason | low | patch | Convention for inactive actions is `aria-describedby`. |
| 7 | blind | An empty `confirmName` makes a DB round trip | low | patch | `.trim().min(1)` in the schema is a direct correction. |
| 8 | verification-gap | Nothing tests `delete_client` against a concurrent `create_case_study` | medium | patch | The `for share`/`for update` locking has no blocked-connection test; helpers exist. |
| 9 | verification-gap | The page test never checks the count in the dialog text | low | patch | One `toContain` assertion. |
| 10 | blind | The 0-case copy keeps "L'operazione non si può annullare." | false | reject | "The sentence becomes" replaces the first sentence; the irreversibility warning stays. |
| 11 | blind | Case count loads full case rows; button gated on `list cases` | low | reject | A handful of cases per client; owner/designer holds both actions. |
| 12 | blind | No success toast after delete | low | reject | The spec defines a redirect only; the row is gone from the list. |
| 13 | blind | Page-level redirect tests for a deleted client are missing | low | reject | `getClient` → `CLIENT_NOT_FOUND` is tested and both pages already redirect on it. |
| 14 | blind | `create_case_study` change not in the spec task list; no sprint entry | low | reject | The fix edits this build's spec; it's an owner-request change, not a story. |
| 15 | blind | Deleted clients' logos and material stay in storage | low | reject | Intended by the spec (no hard delete); orphan cleanup already deferred. |
| 16 | blind | The page test's `indexOf` placement check is brittle | low | reject | Test-only fragility. |
| 17 | blind | Missing rename-to-deleted-name and `data.*` DB checks | low | reject | Same partial index as create; event data is informational. |
| 18 | edge-case | A logo confirm racing a delete can insert a `client_logo` row for a deleted client | low | reject | Sub-second window; the row is harmless and invisible. |
| 19 | edge-case | The browser closing the native dialog while pending desyncs `open` | low | reject | `Dialog` blocks backdrop close; only Esc closes, and it's handled. |
