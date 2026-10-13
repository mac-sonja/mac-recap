---
title: 'Story 2.10 (backend): Fill in the details form'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
baseline_commit: '0a876716edc18b75e41f3c457da319956c8e8e2d'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A case study has nowhere to keep the owner/designer's short answers on context, solution and results, so the narrative can't use what isn't in the files and claims can't cite those answers.

**Approach:** Add a `context_form` table (one row per case) to the `material` module, with use cases and server actions to save one field and read the form, plus `material.resolveRefs(caseId, refs)` resolving `form_field` refs by stable key. The form never counts as material.

## Boundaries & Constraints

**Always:** Field keys are exactly `context`, `solution`, `results`; any other key is `UNKNOWN_FIELD` (400). Each field is optional plain text, stored as given, at most 5,000 characters (code points); saving `""` clears it. Saving one field leaves the others untouched and creates the row on first save, all in one Postgres function that checks the case is live and returns the field's previous text. A save whose text equals the stored text changes nothing and records no event. Otherwise it records `details_saved` through `case-study.recordEvent` with `{ field }` only — never the text; if the event write fails, the previous text is put back (as in 2.7–2.9). Reading a case with no row returns all three fields as `""`. `resolveRefs` accepts `MaterialRef { kind: 'form_field', id: <key> }` and returns each field's current text; an unknown key is rejected as `UNKNOWN_REF` (400), naming it. Every server action calls `getActor` then `authorize(actor, "fill details")` first (owner_designer, any case; the dedicated action in `access/domain/policy.ts` and ARCHITECTURE-SPINE.md:223). Any case status; status never changes. Works without S3. Field text never appears in logs. `hasMaterial` stays false for a case whose form is filled but which has no live asset or non-empty text item (closes the 2.8 deferred note).

**Never:** No UI (deferred until the wizard exists, including the "first incomplete step" routing, which the UI derives from `hasMaterial`). No `asset` or `text` refs in `resolveRefs` yet (added by the first Epic 3/4 story that needs them). No change to `has_material`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First save | no row; save `context` = "Bando PNRR" | row created; context set, others `""`; `details_saved {field: context}` | N/A |
| Next save | row exists; save `results` | results set; context untouched; event | N/A |
| Unchanged | save the stored text again | nothing written, no event | N/A |
| Clear | save `""` | field becomes `""`; event | N/A |
| Unknown field | key `budget` | nothing written | `UNKNOWN_FIELD` (400) |
| Too long | 5,001 characters | nothing written | `INVALID_INPUT` naming `text` |
| Read empty | case with no row | `{ context: "", solution: "", results: "" }` | N/A |
| Read | row with two fields set | those two, third `""` | N/A |
| Resolve | refs `context`, `results` | each ref with its current text | N/A |
| Resolve unknown | ref key `budget` | nothing resolved | `UNKNOWN_REF` (400) naming `budget` |
| Form is not material | form filled, no assets, no text items | `hasMaterial` → false | N/A |
| Event fails | recordEvent errors | previous text restored | event error returned |
| Forbidden | account/sales/social actor | nothing queried | `FORBIDDEN` (403) |
| Deleted case | soft-deleted case id | nothing written or read | `NOT_FOUND` (404) |

</frozen-after-approval>

## Code Map

- `src/modules/material/**` -- mirror Stories 2.8/2.9: `domain/details-form.ts` (`FORM_FIELDS = ["context","solution","results"]`, 5,000 code-point limit reusing the code-point helper in `domain/taxonomy.ts`/`domain/text-item.ts`, schemas, `DETAILS_SAVED`, `MaterialRef` type and schema), `ports/details-form-repository.ts`, `adapters/supabase/details-form-repository.ts` (+ `stubClient` test), `application/{save-details-field,get-details-form,resolve-refs}.ts` with the compensation pattern of `application/set-deliverable-terms.ts`, `deps.ts` (`MaterialDeps.form`), `index.ts` exports `saveDetailsField`, `getDetailsForm`, `resolveRefs`, `MaterialRef` via `storagelessDeps`, `index.test.ts` wiring.
- `supabase/migrations/2026101318xxxx_material_context_form.sql` -- `context_form` (`case_id` uuid primary key FK `case_study`, `context`/`solution`/`results` text not null default `''` with ≤ 5,000 `char_length` checks, `updated_by` FK `profile`, `created_at`, `updated_at` + touch trigger); RLS on + `revoke all … from anon, authenticated`; reject delete/truncate; `save_context_field(p_case_id, p_field, p_text, p_actor_id) returns text` (security invoker, `search_path=''`, service_role only, row lock / upsert, raises P0001 `NOT_FOUND` / `UNKNOWN_FIELD`, returns previous text). Then `src/shared/db.types.ts` — take CI's generated file if the drift check disagrees (array types render as `(string)[]`).
- `src/modules/access` -- `"fill details"` is `{ owner_designer: true }` in `domain/policy.ts`; add `UNKNOWN_FIELD`, `UNKNOWN_REF` → 400 in `httpStatusFor`.
- `src/app/(tool)/case-studies/actions.ts` (+ test) -- `saveDetailsField`, `getDetailsForm`; `resolveRefs` stays module-only. `test/authorize-guard.test.ts` enforces authorize-first.
- `test/db/material.db.test.ts` -- RLS lockout, delete rejected, first save/next save/unchanged/clear, length check, deleted case, and `has_material` false with a filled form and no material.

## Tasks & Acceptance

**Execution:**
- [x] migration + `src/shared/db.types.ts` -- `context_form`, triggers, `save_context_field`
- [x] `src/modules/material/**` + unit tests -- every matrix row with fakes
- [x] `src/modules/access` + test -- new codes
- [x] `src/app/(tool)/case-studies/actions.ts` + test -- two actions, authorize first
- [x] `test/db/material.db.test.ts` -- DB rows above
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 2.10 stays `in-progress` (UI part open)

**Acceptance Criteria:**
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.
- Given the PR, when the CI `db` job runs, then the new DB tests and the db-types diff pass.

## Implementation Notes

## Spec Change Log

- **2026-10-13, human-approved amendment to the frozen block.** Trigger: the implementer noticed the policy's dedicated `"fill details"` action was unused while the spec said `authorize(actor, "edit")`. Amended: the Always rule now authorizes `"fill details"`, matching ARCHITECTURE-SPINE.md:223 and the epics. Avoids: two permissions for one surface drifting apart when Epic 6 changes roles. Code change is the action name in the two server actions and their tests; behaviour is unchanged today (both grant owner_designer on any case).

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | gap, blind, edge | `material/index.ts` docs still say authorize `edit` | low | patch | Stale after the approved `fill details` amendment; a future caller could follow them. |
| 2 | blind | "Form is not material" unit test can't fail | low | patch | `makeHasMaterial` never receives `form`; the DB test is the real proof. |
| 3 | blind | `getDetailsForm` action error mapping untested | low | patch | Only `saveDetailsField` has mapping tests. |
| 4 | blind | Two messages for the 5,000-character limit | low | patch | Adapter says "Too long."; domain message differs. |
| 5 | blind | `field` and ref `id` unbounded | low | patch | Plain `z.string()`; cap at 64. |
| 6 | edge | Lone surrogates pass validation | low | patch | Stored text then differs from input; `isWellFormed` refine. |
| 7 | edge | Echoed key truncated by UTF-16 index | low | patch | Can split a surrogate pair; truncate by code points. |
| 8 | edge | Log prints `failed: undefined` without a code | low | patch | Transport errors carry no Postgres code. |
| 9 | verification-gap | No DB test of concurrent first saves (per-case lock) | medium | defer | Pre-verified, filed as defer: lock correct today; add with the autosave UI. |
| 10 | blind, edge | Undo can overwrite a concurrent save | low | reject | Needs an event-write failure plus a concurrent save; same trade-off as 2.7–2.9. |
| 11 | blind, edge | NULL `p_text`/`p_actor_id` via direct RPC → 500 | low | reject | Only the adapter calls it, with validated non-null values. |
| 12 | blind | Error precedence differs between use case and SQL | low | reject | Every matrix row behaves as specified; only combined-error inputs differ. |
| 13 | blind | Form rows can't be purged with a hard case delete | low | reject | Same no-delete rule as every material table; no purge exists. |
| 14 | blind | Dead `""` fallback in `resolveRefs` | low | reject | Cosmetic; behaviour correct. |
| 15 | blind | Browser-key RPC test accepts PGRST202 | false | reject | PostgREST hides functions the role can't execute (as 2.8 #16). |
| 16 | blind | Redundant `cases.get` before the save RPC | low | reject | Consistent with 2.7–2.9: fails fast before any write. |
| 17 | blind | No DB test of compensation / `updated_at` advancing | low | reject | Unit tests cover compensation; the touch trigger matches 2.8's tested one. |
| 18 | blind | 2.8 deferred note not marked closed | false | reject | `deferred-work.md` is append-only; this spec records the closure. |
| 19 | edge | Case soft-deleted mid-transaction | low | reject | Needs a delete inside the same instant; same as 2.7–2.9. |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0
