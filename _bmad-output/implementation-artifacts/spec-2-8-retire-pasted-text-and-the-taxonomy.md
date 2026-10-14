---
title: 'Story 2.8: Retire pasted text and the taxonomy'
type: 'chore'
created: '2026-10-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '9ed9310e5f258c9de9a0da8308f3142146cbfa05'
context:
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-14.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The owner retired pasted text, the tag/property/flag taxonomy and the removal undo (Sprint Change Proposal 2026-10-14, C6–C8). Their merged backends (#17 restore, #18, #19) are now dead code. `has_material` still counts text items that no one can create.

**Approach:** A new forward-only migration rewrites `has_material` to count only live assets and drops the text-item, taxonomy and restore SQL. The matching TypeScript slices, actions, error mappings, the `tag` policy action and their tests are removed. `hasMaterial` moves onto the asset repository. `MaterialRef` kinds become `asset | form_field`.

## Boundaries & Constraints

**Always:**
- Migrations are forward-only (AD-12). Never edit or revert an applied migration.
- Soft delete on `asset` stays (AR18).
- `has_material` keeps its name, signature, `security invoker`, `search_path = ''` and grants (service_role only).
- The details form still never counts as material (NFR6).
- Shared validation helpers survive the deletion of `domain/text-item.ts`.
- `removeAsset` still never leaves a removal without its event.
- `db.types.ts` matches what `supabase gen types` would produce.
- The `check`, `db` and `image` CI jobs pass.

**Decision (owner, 2026-10-14):** keep the `restore_asset` SQL function only as `removeAsset`'s internal compensation when the event write fails. No restore use case, action or export; the port method is renamed `undoSoftDelete`. This is a documented deviation from the SCP's "drop `restore_asset`".

**Never:**
- No favourite column or favourite code (Story 2.9).
- No UI.
- No change to `case-study` or the event regex.
- Past `text_*`, `asset_restored` and `terms_set` events are not rewritten.
- No hard delete of assets.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Has material | case with ≥ 1 live asset | `hasMaterial` → true | N/A |
| Only removed files | every asset soft-deleted | false | N/A |
| Form only | details filled, no assets | false | N/A |
| Unknown or deleted case | no live case | false | N/A |
| Ref kind `text` | `resolveRefs` with `{kind:'text'}` | rejected like any unknown kind | existing invalid-input path |
| Remove, event write fails | soft delete succeeded, `recordEvent` fails | the asset is live again via `undoSoftDelete` (`restore_asset`) and the error is returned | compensation |
| Browser role | anon/authenticated calls `has_material` | refused | RLS/grant |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261013140000_material_text_item.sql:65-88` -- current `has_material`; copy its header (signature, security, grants) and drop the `text_item` branch.
- Objects to drop, in order:
  1. `set_material_terms(uuid,text,uuid,text,text[])` and `case_material_terms(uuid)`
  2. `material_term`, then `taxonomy_term`, then `taxonomy_term_reject_delete()` (dropping a table also drops its triggers)
  3. `text_item`, then `text_item_touch_updated_at()` and `text_item_reject_delete()`
- Keep `restore_asset` (decision); update its comment in the new migration (`comment on function`) to say it is compensation only.
- Event types are regex-only, with no closed list.
- New file `supabase/migrations/20261014120000_material_retire_text_taxonomy.sql`, with a header in the style of `…context_form.sql` ("Story 2.8 … Forward-only (AD-12).").
- `src/shared/db.types.ts` -- hand-edit; there is no local Docker. Remove `material_term`, `taxonomy_term`, `text_item`, `case_material_terms`, `set_material_terms` (`restore_asset` stays). If the CI `db` job reports drift, commit its `db-types` artifact (`gh run download <run> -n db-types`).
- `src/modules/material/`:
  - **Delete:**
    - `domain/{text-item,taxonomy}.ts`
    - `ports/{text-item,taxonomy}-repository.ts`
    - `adapters/supabase/{text-item,taxonomy}-repository{,.test}.ts`
    - `application/{add,edit,remove,restore}-text-item.ts`, `restore-asset.ts`, `list-terms.ts`, `set-deliverable-terms.ts`, `get-case-terms.ts`
    - `application/{text,taxonomy}-use-cases.test.ts`
  - **Move:** `withinCodePoints`, `hasNoNul`, `NUL_MESSAGE` and `caseIdSchema` go from `text-item.ts` to `domain/validation.ts`. Re-point `details-form.ts:2` and `has-material.ts:1`.
  - **Edit:**
    - `domain/details-form.ts:78-81`: `MATERIAL_REF_KINDS = ["asset","form_field"]`, plus its tests (`details-form-use-cases.test.ts:6-7, 70-71, 296`).
    - `domain/asset.ts`: remove `ASSET_RESTORED` (57) and fix the comment at 47.
    - `ports/asset-repository.ts`: add `hasMaterial(caseId)`; rename `restore` to `undoSoftDelete` (compensation only).
    - `adapters/supabase/asset-repository.ts`: `hasMaterial` moves here from `text-item-repository.ts:140-147` (calls RPC `has_material`; returns `MATERIAL_LOOKUP_FAILED` on error).
    - `application/has-material.ts` and `deps.ts`: remove `texts` and `taxonomy`.
    - `application/remove-asset.ts`: call `undoSoftDelete` instead of `restore`.
    - `index.ts`: remove the text, taxonomy and restore exports, functions and doc comments; `hasMaterial` uses `assets`.
    - Tests: `index.test.ts`, `application/use-cases.test.ts` (`restoreAsset` block 333-371), `adapters/supabase/asset-repository.test.ts:181-195`.
- `src/app/(tool)/case-studies/actions.ts` -- remove `restoreAsset`, the four text actions, the three taxonomy actions and their type imports. In `actions.test.ts`, remove the matching mocks, the `restoreAsset` row, and the "text item actions" and "taxonomy actions" describes. No UI calls any of them.
- `src/modules/access/domain/policy.ts:15,53` and `policy.test.ts:12` -- remove action `tag`. 2.9 adds its own favourite authorization. In `access/index.ts:46-49` and `index.test.ts:19-20`, remove `TEXT_EMPTY` and `UNKNOWN_TERM`.
- `test/db/material.db.test.ts`:
  - Remove imports 12-13 and lines 527-1117 (text_item, text use cases, text RLS, taxonomy).
  - Keep and rewrite `describe("has_material")` (638-688) for assets only, and drop the text tests at 656 and 671.
  - Move the browser-refused `has_material` test (765) into the RLS lockout block.
  - Restore tests (233-304, 385, ~502, ~516): keep the `restore_asset` SQL tests for lock and cap (the compensation path) and the RLS lockout entries; drop the restore-as-feature flow (e.g. confirm → remove → restore at 385 becomes confirm → remove).
  - Line 1263: point it at `createSupabaseAssetRepository().hasMaterial`.
- Leave alone: the `text_added` sample strings in the case-study tests, and README.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261014120000_material_retire_text_taxonomy.sql` -- rewrite `has_material`, then drop the objects in dependency order -- SCP §4.3
- [x] `src/shared/db.types.ts` -- remove the dropped objects -- the CI drift check
- [x] `src/modules/material/**` -- move the helpers, delete the slices, move `hasMaterial`, fix `removeAsset` compensation, update the unit tests -- dead code
- [x] `src/app/(tool)/case-studies/actions.ts` + test -- remove 8 actions
- [x] `src/modules/access/**` -- remove `tag`, `TEXT_EMPTY`, `UNKNOWN_TERM` and their tests
- [x] `test/db/material.db.test.ts` -- per Code Map; matrix rows as DB tests
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 2.8 → `done` once merged, per the existing flow

**Acceptance Criteria:**
- Given the repo, when you `grep -rn "text_item\|taxonomy\|TextItem\|restoreAsset\|UNKNOWN_TERM\|TEXT_EMPTY" src test`, then nothing matches except comments that explain the retirement, and `restore` survives only as `undoSoftDelete` / `restore_asset` compensation.
- Given the PR, when CI runs, then `check`, `db` (DB tests and db-types diff) and `image` pass.

## Implementation Notes

- Local: lint, typecheck, 45 test files / 1139 tests, build all pass. DB tests and the db-types drift check run only in CI (no local Docker); `db.types.ts` was hand-edited to generator style. Matrix rows Has material, Only removed, Form only, Unknown/deleted case and Browser role are covered by `test/db/material.db.test.ts` and verified in CI; Ref kind `text` and the remove-compensation row also have unit tests (`details-form-use-cases.test.ts:303`, `use-cases.test.ts:308`).
- `restore_asset` kept and commented as compensation only (owner decision); the adapter's undo failure message is now "Could not undo removing the file."

- Review patches applied (triage #5, #7, #11, #13 code; #9, #10, #12 docs). The acceptance grep now also matches the new "retired objects (Story 2.8)" DB test, which asserts those objects are gone; that test is part of explaining the retirement, so it's accepted.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge | `removeAsset` compensation via `restore_asset` can be refused (cap filled by a concurrent upload, or case deleted) after a failed event write, leaving a removal without its event | medium | Real: `restore_asset` re-checks cap and live case under the lock. Pre-existing: baseline `remove-asset.ts` used the same RPC the same way (#17) | defer |
| 2 | edge, blind | `undoSoftDelete` returning `ok(false)` isn't logged in the compensation path | low | Real, but baseline logged only `!undone.ok` too; pre-existing | defer (with #1) |
| 3 | blind | No unit test for "event fails and undo fails" | low | Baseline had none either; pre-existing | defer (with #1) |
| 4 | blind | Adapter's generic `undoSoftDelete` error branch is untested | low | Baseline `restore` tests covered only the refusals; pre-existing | defer (with #1) |
| 5 | edge, blind | `resolve-refs.ts:9` doc still says an `asset` / `text` ref is `UNKNOWN_REF` | low | Real: `text` now fails as `INVALID_INPUT` (`refs.0.kind`) | patch |
| 6 | blind | Migration drops `text_item` / taxonomy rows without a guard | false | Dropping them, data included, is the owner-approved intent (SCP §3, C6–C7); no production DB exists | reject |
| 7 | edge, blind | No DB test asserts the dropped tables and functions are gone | low | Real: only the db-types drift check catches it indirectly | patch |
| 8 | edge | Browser-refused `has_material` test accepts `PGRST202` | false | Same shared assertion as every RPC in the list; `has_material`'s existence is proven by the `describe("has_material")` tests that call it | reject |
| 9 | blind | `epics.md` Story 2.8 AC and the SCP still say `restore_asset` is dropped | low | Real: the owner's keep decision lives only in this spec | patch (docs) |
| 10 | blind | `spec-2-7` note says `restore_asset` is removed | low | Real | patch (docs) |
| 11 | blind | `index.ts` `hasMaterial` builds the asset repo directly instead of `storagelessDeps()` | low | Real: the other storageless paths (details form, refs) use `storagelessDeps()` | patch |
| 12 | blind | sprint-status 2-8 comment names only #18 | low | Real: the story also retires #19 taxonomy and #17 restore | patch (docs) |
| 13 | verification-gap | Stray indentation of `saveDetailsUseCase` in `actions.test.ts` reset list | low | Real, formatting only | patch |
| — | verification-gap | No verification gaps | — | Pre-verified by that layer | — |

## Design Notes

`has_material` after the change:

```sql
create or replace function public.has_material(p_case_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.case_study c where c.id = p_case_id and c.deleted_at is null)
     and exists (select 1 from public.asset a where a.case_id = p_case_id and a.deleted_at is null);
$$;
```

Use `create or replace` so the existing grants survive, and re-state the `revoke`/`grant` lines for clarity. Drop with plain `drop … ;`, not `if exists`, so a missing object fails loudly.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- all pass
- CI `db` job -- DB tests pass and `git diff --exit-code -- src/shared/db.types.ts` is clean
