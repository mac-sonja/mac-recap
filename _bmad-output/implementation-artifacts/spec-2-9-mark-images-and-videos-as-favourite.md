---
title: 'Story 2.9: Mark images and videos as favourite'
type: 'feature'
created: '2026-10-14'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The owner/designer has no way to mark the key visuals of a case. Favourites replace the retired taxonomy: Sprint Change Proposal 2026-10-14, AD-14 and AR14.

**Approach:** Add `asset.is_favourite` (default false) through a forward migration. A DB constraint allows it only on image and video assets. Add one `setFavourite` use case plus a server action that sets or clears the flag, records an event and leaves case status alone. Expose `isFavourite` in the asset listing so the 2.7 UI can show the **Preferito** toggle. This story is backend only.

## Boundaries & Constraints

**Always:**
- Forward-only migration (AD-12).
- Only `image` and `video` assets can be favourites, enforced by a DB CHECK and in the use case.
- Any number of favourites per case; none required.
- Case status never changes, in any status.
- Works without S3 (`storagelessDeps()`).
- Authorize before the use case (`test/authorize-guard.test.ts`).
- A changed flag records exactly one event. If the event write fails, the flag is reverted and the error returned.
- Generation ignores the flag (IR-OP14). `db.types.ts` matches the generator.

**Never:**
- No UI.
- No manifest or generation changes (Epic 3).
- No RPC or advisory lock: a single conditional update is enough.
- No change to `case-study`.
- No edit to an applied migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mark | live image, `isFavourite: true` | flag true; `asset_favourited {assetId}` recorded; status unchanged | N/A |
| Unmark | live favourite video, `false` | flag false; `asset_unfavourited {assetId}` | N/A |
| No change | already true, set true | ok, no write, no event | N/A |
| Wrong kind | PDF / document / text asset, `true` | unchanged, no event | `NOT_FAVOURITABLE` (400) |
| Clear on wrong kind | document, `false` | ok, no event (already false) | N/A |
| Unknown or removed asset | soft-deleted or other case's asset | no write | `NOT_FOUND` |
| Unknown or deleted case | — | no write | `NOT_FOUND` (via `cases.get`) |
| Malformed input | bad uuid, non-boolean | — | `INVALID_INPUT` with `fields` |
| Event write fails | flag changed, `recordEvent` fails | flag back to previous value; error returned | compensation |
| Direct SQL | `update asset set is_favourite = true` on a document | rejected | CHECK violation 23514 |
| Browser role | anon/authenticated update of `is_favourite` | refused | RLS/revoke |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261014140000_material_asset_favourite.sql` (new). Header in the style of `…retire_text_taxonomy.sql` ("Story 2.9 … Forward-only (AD-12)."). Contents:
  - `alter table public.asset add column is_favourite boolean not null default false`
  - `add constraint asset_favourite_kind_check check (not is_favourite or kind in ('image','video'))`
  - This CHECK mentions `kind`, so the schema-guard test needs the fix noted under Tests.
  - There is no update trigger on `asset`, and service_role already updates it directly (`softDelete`).
- `src/shared/db.types.ts:26-50`: add `is_favourite` alphabetically between `id` and `kind` in Row (`boolean`), Insert (`?`) and Update (`?`). Also add it to the `create_asset` Returns block (~144-162), because the function returns the row type. If CI's `db` job reports drift, commit its `db-types` artifact.
- `src/modules/material/domain/asset.ts`:
  - add `isFavourite: z.boolean()` to `assetSchema` and to the `ListedAsset` Pick
  - add `ASSET_FAVOURITED = "asset_favourited"` and `ASSET_UNFAVOURITED = "asset_unfavourited"` next to `ASSET_REMOVED`
  - add `favouriteInputSchema = assetRefInputSchema.extend({ isFavourite: z.boolean() })`
  - add `FAVOURITABLE_KINDS = ["image","video"]` (kinds come from `files.ts:10`)
- `src/modules/material/ports/asset-repository.ts`: add `get(caseId, assetId): Result<Asset | null>` (live only) and `setFavourite(caseId, assetId, value): Result<boolean>` (true if a row changed).
- `src/modules/material/adapters/supabase/asset-repository.ts`:
  - add `is_favourite` to `ASSET_COLUMNS` (L17) and to `toAsset`
  - implement `get` with a direct select
  - implement `setFavourite` like `softDelete` (L117-130): `.update({ is_favourite }).eq id/case_id .is deleted_at null .select("id")`
  - map errors to `ASSET_WRITE_FAILED` / `ASSET_LOOKUP_FAILED`
- `src/modules/material/application/set-favourite.ts` (new). Mirror `remove-asset.ts`, with `Pick<MaterialDeps,"assets"|"cases">` and no storage check:
  1. `parseInput`
  2. `cases.get`
  3. `assets.get`; null → `NOT_FOUND`
  4. a value equal to the current one → ok, no event
  5. a non-favouritable kind with `true` → `NOT_FAVOURITABLE`
  6. `setFavourite`
  7. `recordEvent` with `{ assetId }`; on failure, `setFavourite(previous)`, log a failed compensation like `remove-asset.ts:33`, and return the event error
- `src/modules/material/application/list-assets.ts:37-38`: pass `isFavourite` through.
- `src/modules/material/index.ts`:
  - `setFavourite(actor, input)` wired with `storagelessDeps()` (L67)
  - re-export the two event constants
  - update the doc comment (owned tables are unchanged)
- `src/modules/access/domain/policy.ts` (ACTIONS L11-30, MATRIX L48-71) and `policy.test.ts` (`EXPECTED`): add the action `"mark favourites"` with `{ owner_designer: true }`. This follows the AD-11 row and the precedent of the retired separate `tag` action.
- `src/modules/access/index.ts:31-49` and `index.test.ts`: add `NOT_FAVOURITABLE: 400`.
- `src/app/(tool)/case-studies/actions.ts`: add `setAssetFavourite(input)`, shaped like `removeAsset` (L88-95), with `authorize(actor, "mark favourites")`. Add tests in `actions.test.ts` (authorize first, forbidden, pass-through).
- Tests:
  - `application/use-cases.test.ts`: a `describe("setFavourite")` with fakes covering every matrix row up to "Event write fails"
  - `adapters/supabase/asset-repository.test.ts`: `get` and `setFavourite` with stub client, success and error
  - `index.test.ts`: wiring
  - `test/db/material.db.test.ts`:
    - a `describe("favourites")` after the use-cases block (~L434), using `devActor`, `createCase`, `seedAssets` (images) and a `create_asset` call with kind `document` for the PDF
    - cover mark/unmark/no-op events, status unchanged (pattern at L388-418), compensation (L420-433), and the CHECK violation 23514 (fits the `it.each` at L452-460)
    - add an `is_favourite` update to the RLS lockout `statements` (L525-533)
    - **Fix the "schema guards" `checkValues("kind")` filter (L472-489).** It expects exactly one CHECK mentioning `kind`; narrow it to the kind-values constraint by name.

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/20261014140000_material_asset_favourite.sql` -- column + kind CHECK
- [ ] `src/shared/db.types.ts` -- `is_favourite` in asset Row/Insert/Update and `create_asset` Returns
- [ ] `src/modules/material/**` -- domain, port, adapter, `set-favourite.ts`, listing, index, unit tests
- [ ] `src/modules/access/**` -- `mark favourites` action, `NOT_FAVOURITABLE` mapping, tests
- [ ] `src/app/(tool)/case-studies/actions.ts` + test -- `setAssetFavourite`
- [ ] `test/db/material.db.test.ts` -- favourites block, RLS update statement, schema-guard filter fix

**Acceptance Criteria:**
- Given a listed image, when `listAssets` runs, then each row carries `isFavourite`.
- Given the PR, when CI runs, then `check`, `db` (DB tests + db-types diff) and `image` pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- all pass
- CI `db` job -- DB tests pass; `git diff --exit-code -- src/shared/db.types.ts` clean
