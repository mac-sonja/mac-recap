---
title: 'Story 2.8 (backend): Add pasted text as material'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
baseline_commit: '4c7dd7de3424c0ef4e8e2132cb871caa031e4816'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

> **Superseded 2026-10-14** by the [Sprint Change Proposal](../planning-artifacts/sprint-change-proposal-2026-10-14.md). This code is retired by Story 2.8 (Retire pasted text and the taxonomy). Kept as a historical record.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Notes that aren't a file can't be stored with a case study, and nothing answers "does this case have material?", which Story 2.10's **Next: Details** and Epic 3's Generate gate both need.

**Approach:** Add a `text_item` table to the `material` module with add, edit, remove and restore use cases exposed as server actions, and `material.hasMaterial(caseId)`: true only for at least one non-deleted asset or one non-deleted, non-empty text item.

## Boundaries & Constraints

**Always:** Title required (trimmed, 1–200 characters). Body must contain non-whitespace (`TEXT_EMPTY`, 400, else) and is at most 200,000 characters; it is stored as given. Text items never count toward the 20-file cap. Every server action calls `getActor` then `authorize(actor, "upload")` first. The case must exist and not be soft-deleted; any status is accepted. Events through `case-study.recordEvent`: `text_added`, `text_edited`, `text_removed`, `text_restored`, each with `{ textItemId }` (never the title or body). Case status never changes. Removal is a soft delete; restore clears it (no cap). If the event write fails, the use case undoes its row change and returns the error, as in 2.7. Text bodies never appear in logs. `hasMaterial` counts nothing from the details form and works without S3 configured; text use cases also work without S3.

**Decision (editing):** a live text item can be edited in place (title and body, same validation as add); it records `text_edited` and touches `updated_at`. Editing a removed item is `NOT_FOUND`. If the event write fails, the previous title and body are put back.

**Never:** No UI (deferred until the wizard exists). No listing of text items (deferred with the 2.7 asset listing). No hard delete, no write to `case_study`, no `transition` call. No `context_form` (Story 2.10), no tagging (Story 2.9), no `resolveRefs`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add | live case, title "Brief", body "Testo" | text item stored + `text_added`; status unchanged | N/A |
| Empty body | body `""` or `"  \n "` | nothing stored | `TEXT_EMPTY` (400) |
| Bad title | title blank or 201 chars | nothing stored | `INVALID_INPUT` naming `title` |
| Too long | body 200,001 chars | nothing stored | `INVALID_INPUT` naming `body` |
| Edit | live text item, new title/body | updated + `text_edited` | removed/unknown → `NOT_FOUND`; empty body → `TEXT_EMPTY` |
| At file cap | case with 20 live assets | text item stored | N/A |
| Remove | live text item | `deleted_at` set + `text_removed` | unknown/already removed → `NOT_FOUND` |
| Restore | removed text item | `deleted_at` cleared + `text_restored` | live → ok, no event; unknown → `NOT_FOUND` |
| hasMaterial: none | no assets, no text items, details form filled | `false` | N/A |
| hasMaterial: asset | one live asset | `true` | N/A |
| hasMaterial: text | one live, non-empty text item | `true` | N/A |
| hasMaterial: removed only | assets and text items all soft-deleted | `false` | N/A |
| Forbidden | account/sales/social actor | nothing queried | `FORBIDDEN` (403) |
| Deleted case | soft-deleted case id | nothing stored | `NOT_FOUND` (404) |

</frozen-after-approval>

## Code Map

- `src/modules/material/**` -- built in Story 2.7; mirror it. `domain/asset.ts` + `domain/validation.ts` (`parseInput`) → add `domain/text-item.ts` (zod schemas, event names). `ports/asset-repository.ts` → add `ports/text-item-repository.ts`. `adapters/supabase/asset-repository.ts` (+ `.test.ts` with `stubClient`) → add `text-item-repository.ts`. `application/{remove,restore}-asset.ts` (compensation pattern, `deps.ts` `MaterialDeps`) → add `add-text-item.ts`, `edit-text-item.ts`, `remove-text-item.ts`, `restore-text-item.ts`, `has-material.ts`; extend `MaterialDeps` with `texts`. `index.ts` (memoized storage, `deps()`) → export `addTextItem`, `editTextItem`, `removeTextItem`, `restoreTextItem`, `hasMaterial`; text paths must not require storage. `index.test.ts` covers wiring.
- `supabase/migrations/2026101314xxxx_material_text_item.sql` -- `text_item` (uuid id, `case_id` FK `case_study`, `title`, `body`, `created_by` FK `profile`, `created_at`, `updated_at`, `deleted_at`); RLS on + `revoke all … from anon, authenticated`; reject delete/truncate like `asset_reject_delete`; `updated_at` touch trigger like `case_study`'s; a check that `body` has non-whitespace. `has_material(p_case_id uuid) returns boolean` (security invoker, `search_path=''`, service_role only) checking live assets or live text items with non-whitespace bodies. Then `src/shared/db.types.ts` (CI diffs it).
- `src/modules/access/index.ts` -- `httpStatusFor`: add `TEXT_EMPTY` → 400.
- `src/app/(tool)/case-studies/actions.ts` (+ test) -- add `addTextItem`, `editTextItem`, `removeTextItem`, `restoreTextItem`, reusing `ActionResult`/`failure`; `test/authorize-guard.test.ts` enforces authorize-first. `hasMaterial` is module-only (no action yet).
- `test/db/material.db.test.ts` -- extend: RLS lockout for `text_item`, delete rejected, empty-body check, `has_material` truth table, text items don't affect the asset cap. Keep `test/case-status-writes.test.ts` passing.

## Tasks & Acceptance

**Execution:**
- [x] migration + `src/shared/db.types.ts` -- `text_item`, triggers, `has_material`
- [x] `src/modules/material/**` + unit tests -- domain, port, adapter, use cases and `hasMaterial`, every matrix row with fakes
- [x] `src/modules/access/index.ts` + test -- `TEXT_EMPTY`
- [x] `src/app/(tool)/case-studies/actions.ts` + test -- four actions, authorize first
- [x] `test/db/material.db.test.ts` -- DB rows above
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 2.8 stays `in-progress` (UI part open)

**Acceptance Criteria:**
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.
- Given the PR, when the CI `db` job runs, then the new DB tests and the db-types diff pass.

## Implementation Notes

- `hasMaterial` lives on `TextItemRepository` (calls `has_material`); an unknown case is `false`, a malformed id is `INVALID_INPUT`.
- Body length counts code points (matches Postgres `char_length`); the whitespace check is JS `/\S/` and SQL `body ~ '\S'`. If the DB check still fires, the adapter maps `text_item_body_check` to `TEXT_EMPTY`.
- Edit reads the live row first (`getLive`) so compensation can put the previous title/body back.
- Text paths build deps with `storage: null` and never call `getStorageConfig`.
- `src/shared/db.types.ts` was edited by hand (no Supabase CLI locally); regenerate with `npm run db:types` if the CI diff disagrees.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | verification-gap | No verification gaps | — | — | Reviewer found every behaviour covered. |
| 2 | blind, edge | `has_material` true for a soft-deleted case | medium | patch | Function filters material only; Epic 3's gate would pass a deleted case. |
| 3 | edge | NUL in title/body → 500 | low | patch | Postgres rejects U+0000 (22P05); direct schema refinement. |
| 4 | blind | Title limit counts UTF-16, DB counts code points | low | patch | zod `.max(200)` vs `char_length`; body already uses code points. |
| 5 | blind, edge | Every 23503 mapped to "No such case study" | low | patch | `text_item_created_by_fkey` raises the same code; check the constraint name. |
| 6 | edge | Remove's undo logs only on `!undone.ok` | low | patch | Add and restore also log when the undo changed nothing. |
| 7 | blind | Undo-failure logs and `TEXT_LOOKUP_FAILED` untested | low | patch | Direct test additions. |
| 8 | blind, edge | Case deleted between `get` and the text write | low | reject | Needs a delete mid-request; same trade-off accepted in 2.7. |
| 9 | blind | Restore is two non-atomic queries | low | reject | A race only misreports "already live"; an RPC adds surface for a rare case. |
| 10 | blind, edge | Edit undo can overwrite a concurrent edit | low | reject | Needs an event-write failure plus a concurrent edit. |
| 11 | blind | Edit undo leaves `updated_at` moved | low | reject | Cosmetic; title and body are restored as the Decision says. |
| 12 | blind | No-op edit records `text_edited` | low | reject | Harmless; a guard adds a branch for no user-visible gain. |
| 13 | blind, edge | JS vs Postgres whitespace / zero-width-only bodies | low | reject | Only reachable with invisible-only text or direct DB writes. |
| 14 | blind | Failed add leaves a restorable item | low | reject | Reachable only by restoring an id add reported as failed (as 2.7 #3). |
| 15 | edge | `toTextItem` fails after insert/update | false | reject | Domain schema is plain strings/uuids; DB checks are stricter. |
| 16 | blind | `has_material` lockout test accepts PGRST202 | false | reject | PostgREST hides functions the role can't execute; the `inRolledBackTx` check is authoritative. |
| 17 | blind | Event order in DB test ties on `type` | false | reject | Each event is written in its own awaited transaction with a later `now()`. |
| 18 | blind | `hasMaterial` lives on the text repository | low | reject | Layout only; no caller diverges. |
| 19 | blind | `db.types.ts` hand-edited | false | reject | The CI `db` job diffs it against generated types. |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0
