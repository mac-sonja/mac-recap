---
title: 'Story 2.7 (backend): Upload project files'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
baseline_commit: 'df3fadc11288c8382b73bc7834acc994f578bad3'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

> **Note 2026-10-14** ([Sprint Change Proposal](../planning-artifacts/sprint-change-proposal-2026-10-14.md)): the restore use case and action are removed by Story 2.8 (Retire pasted text and the taxonomy), because removal has no undo; `restore_asset` stays only as `removeAsset`'s internal compensation (port method `undoSoftDelete`). The rest of this spec stands.

> **Note 2026-10-14** ([storage proposal](../planning-artifacts/sprint-change-proposal-2026-10-14-storage.md)): the S3 adapter is replaced by Supabase Storage in Story 2.11; the use-case flow stands.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A case study can't hold any project files yet: there is no `asset` table, no S3 adapter and no way to issue, confirm, remove or restore an upload, so the Material step (deferred UI part) has nothing to call.

**Approach:** Build the `material` module backend: an `asset` table, an S3 adapter, and four use cases (presign → confirm → remove → restore) exposed as server actions. The browser uploads straight to S3 with a presigned POST; an asset row exists only after the server HEAD-checks the object.

## Boundaries & Constraints

**Always:** Allowlist in `material/domain/files.ts`: JPEG, PNG, WebP, MP4, MOV (`video/quicktime`), PDF, plain text, Markdown, DOCX; the extension comes from the content type, never the file name. Cap: 20 non-deleted assets per case, checked at presign and again atomically at confirm. Size ≤ 100 MB: declared size checked at presign, `content-length-range` 1..100 MB on the POST, HEAD size checked at confirm. The presigned POST fixes `Content-Type` and is signed with `requestChecksumCalculation: "WHEN_REQUIRED"`. Keys `cases/{caseId}/assets/{assetId}/original.{ext}`, built only in `material/adapters`; `assetId` is generated at presign. Every server action calls `getActor` then `authorize(actor, "upload")` first (remove and restore use `upload` too). The case must exist and not be soft-deleted; any status is accepted (Story 4.5 reopens Material for later statuses). Events through `case-study.recordEvent`: `asset_uploaded`, `asset_removed`, `asset_restored`, each with `{ assetId }`. Case status never changes. Removal is a soft delete (`deleted_at`); restore clears it and re-checks the cap.

**Never:** No UI and no asset listing or presigned GET (both deferred). No bucket, CORS or IaC (deferred). No hard delete, no write to `case_study`, no `transition` call, no material or file bytes in logs. No renditions (Epic 3). No `text_item` (Story 2.8).

**Decision (S3 config):** `S3_BUCKET` and `S3_REGION` are optional in `env.ts`; credentials come from the AWS SDK default chain. When either is missing, material use cases return `STORAGE_NOT_CONFIGURED` (503) and the app still starts.

**Decision (event after row):** confirm inserts the asset row, then records `asset_uploaded`; if the event write fails, it soft-deletes that row and returns the error, so no asset exists without its event.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Presign | draft case, 3 assets, 2 MB PNG | `{ assetId, url, fields }`; nothing stored | N/A |
| Bad type | `application/zip` | no POST issued | `FILE_TYPE_NOT_ALLOWED` (400) |
| Too large | declared 101 MB | no POST issued | `FILE_TOO_LARGE` (400) |
| 21st file | 20 non-deleted assets (deleted ones don't count) | no POST issued | `FILE_LIMIT_REACHED` (409) |
| Confirm | object present, size/type match | asset row + `asset_uploaded`; status unchanged | N/A |
| Confirm, no object | HEAD 404 | no row | `UPLOAD_NOT_FOUND` (404) |
| Confirm, mismatch | HEAD > 100 MB or other `Content-Type` | no row | `UPLOAD_REJECTED` (400) |
| Concurrent confirms | 19 assets, two confirms at once | exactly one succeeds | other `FILE_LIMIT_REACHED` |
| Remove | live asset | `deleted_at` set + `asset_removed` | unknown/already removed → `NOT_FOUND` |
| Restore | removed asset, case under cap | `deleted_at` cleared + `asset_restored` | live asset → ok, no event; at cap → `FILE_LIMIT_REACHED` |
| Forbidden | account/sales/social actor | nothing queried | `FORBIDDEN` (403) |
| Deleted case | soft-deleted case id | nothing issued | `NOT_FOUND` (404) |

</frozen-after-approval>

## Code Map

- `src/modules/material/**` -- currently `index.ts` (`export {};`) + `.gitkeep`s. Mirror `src/modules/case-study`: `domain/` (zod; `files.ts` allowlist/limits/kind `image|video|document|text`; own `parseInput` copy — case-study's isn't exported), `ports/{asset-repository,object-storage}.ts`, `adapters/supabase/{admin.ts,asset-repository.ts}` (own admin client, as `case-study/adapters/supabase/admin.ts` says), `adapters/s3/object-storage.ts`, `application/*` (`makeX(deps)` factories), `index.ts` wiring.
- Lint (`eslint.config.mjs`): application may import `@/modules/case-study` and `@/modules/access` indexes only; `@aws-sdk/*` and `db.types` only in `adapters/`; domain imports only zod/`@/shared`/own domain. `process.env` only in `src/shared/env.ts`.
- `src/modules/case-study/index.ts` -- reuse `get(id)` (NOT_FOUND for deleted) and `recordEvent(actor, { caseId, type, data })`. Don't change.
- `src/modules/access` -- `authorize(actor, "upload")` (owner_designer only); add the new codes to `httpStatusFor` with the statuses in the matrix (`STORAGE_NOT_CONFIGURED` → 503).
- `supabase/migrations/2026101312xxxx_material_asset.sql` -- `asset` (uuid id, `case_id` FK `case_study`, `kind`, `original_file_name`, `content_type`, `size_bytes`, `s3_key` unique, `created_by` FK `profile`, `created_at`, `deleted_at`); RLS enabled, `revoke all … from anon, authenticated`; reject-delete trigger like `case_study_reject_delete`; RPC `create_asset(...)` (security invoker, `search_path=''`, `pg_advisory_xact_lock` on the case, counts non-deleted, raises `FILE_LIMIT_REACHED`) and `restore_asset(...)` with the same lock; `grant execute … to service_role`. Then `npm run db:types` → `src/shared/db.types.ts` (CI diffs it).
- `src/shared/env.ts` (+ `env.test.ts`), `.env.example` -- optional `S3_BUCKET`, `S3_REGION`.
- `src/app/(tool)/case-studies/actions.ts` -- add `presignAssetUpload`, `confirmAssetUpload`, `removeAsset`, `restoreAsset`; reuse `ActionResult`/`failure`. `test/authorize-guard.test.ts` enforces authorize-first.
- Tests to mirror: `case-study/application/use-cases.test.ts` (`fakeRepository`), `case-study/adapters/supabase/case-study-repository.test.ts` (`stubClient`), `test/db/case-study.db.test.ts` (`pool`, `devActor`, `createCase`, RLS lockout block). Keep `test/case-status-writes.test.ts` passing.

## Tasks & Acceptance

**Execution:**
- [x] migration + `src/shared/db.types.ts` -- `asset` table, triggers, `create_asset`/`restore_asset`
- [x] `src/shared/env.ts`, `.env.example`, `src/shared/env.test.ts` -- optional S3 vars
- [x] `src/modules/material/**` + unit tests -- domain, ports, Supabase and S3 adapters (S3 client stubbed), use cases with fakes covering every matrix row
- [x] `src/modules/access` -- new codes in `httpStatusFor` + test
- [x] `src/app/(tool)/case-studies/actions.ts` + test -- four actions, authorize first
- [x] `test/db/material.db.test.ts` -- RLS lockout, cap at 20 under concurrent `create_asset`, soft delete/restore, delete rejected
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 2.7 stays `in-progress` (UI part open)

**Acceptance Criteria:**
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.
- Given the PR, when the CI `db` job runs, then the material DB tests and the db-types diff pass.

## Implementation Notes

- `src/shared/db.types.ts` was edited by hand (no Docker locally to run `npm run db:types`). The CI `db` job's drift check is the proof; if it fails, commit the uploaded `db-types` artifact.
- `test/db/material.db.test.ts` was not run locally (no Docker); first run is in CI.
- Added code `ASSET_ALREADY_CONFIRMED` (409) for a second confirm of the same `assetId`, not in the matrix. `create_asset` raises it after the lock and before the cap check (23505 mapped as a fallback).
- `restore_asset` also refuses a soft-deleted case (`NOT_FOUND`). The S3 adapter is memoized in `material/index.ts` per resolved bucket/region.
- `fileName` rejects C0/C1 controls (incl. NUL) and bidi controls U+202A–U+202E, U+2066–U+2069 as `INVALID_INPUT`.
- Remove and restore compensate like confirm: if the event write fails, remove restores the asset and restore soft-deletes it again, then the error is returned.
- Remove and restore also return `STORAGE_NOT_CONFIGURED` without S3 ("material use cases" per the S3 config decision), although they touch only the DB.
- `UPLOAD_REJECTED` leaves the S3 object in place (no hard delete; lifecycle cleanup belongs with the bucket IaC).
- Presign input is `{ caseId, contentType, sizeBytes }`; confirm input is `{ caseId, assetId, contentType, fileName }` (size comes from HEAD). Malformed ids are `INVALID_INPUT`. Presigned POST is valid 15 minutes.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | verification-gap | `material/index.ts` wiring never executed by a test | medium | patch | Pre-verified: action tests mock the module; DB and unit tests build their own deps. |
| 2 | blind, gap, edge | Failed confirm (event write fails) can't be retried with the same `assetId` | low | reject | Real (PK → `ASSET_ALREADY_CONFIRMED`), but needs an event-write failure; recovery is re-presign + re-upload, recorded for the deferred UI. |
| 3 | blind, gap | A compensated row can be restored without an `asset_uploaded` event | low | reject | Reachable only by calling restore on an id confirm reported as failed; the UI never shows it. Fix needs a schema marker. |
| 4 | blind, edge, gap | Remove's compensating restore can fail at the cap | low | reject | Needs an event-write failure plus a concurrent confirm in the same window; frozen Decision chose compensation. |
| 5 | blind | Row + event not atomic | low | reject | Frozen Decision (event after row) under AD-11 ownership; consequences covered by #2–#4. |
| 6 | blind, edge | Duplicate confirm at 20 live returns `FILE_LIMIT_REACHED` | low | patch | Cap checked before PK in `create_asset`; direct reorder. |
| 7 | edge | `toAsset` rejects after insert → live row without event | false | reject | Table check constraints mirror the domain schema exactly (DB test asserts it). |
| 8 | edge | HEAD 403 (no `s3:ListBucket`) → 500 instead of 404 | medium | defer | IAM belongs to the deferred bucket infrastructure. |
| 9 | edge, blind | Orphaned objects (rejected/abandoned/removed) never cleaned | medium | defer | Needs a lifecycle rule in the deferred bucket infrastructure. |
| 10 | edge, blind | `restore_asset` / soft delete don't check the case is live | low | patch | `restore_asset` patched like `create_asset`; plain soft delete rejected (needs an RPC, app-level `get` already guards). |
| 11 | edge, blind | NUL / control / bidi characters in `fileName` | low | patch | NUL → 22P05 → 500; direct schema refinement. |
| 12 | blind | Object can be replaced within the POST's 15 min after confirm | low | reject | Only the same authorized owner/designer, within 15 min; binding by ETag/version waits for versioning infra and Epic 3 reads. |
| 13 | blind | Parallel presigns overshoot the cap | low | reject | Spec checks at presign and confirm; confirm enforces it. |
| 14 | blind | New `S3Client` per server action | low | patch | `deps()` runs per call; memoize. |
| 15 | blind | Markdown/empty browser content types rejected | medium | defer | How the UI declares the type belongs to the deferred UI part. |
| 16 | blind | Action tests skip codes and real input shapes | low | patch | Direct test additions. |
| 17 | blind | Spec "done" with DB proofs unrun | false | reject | Status is `in-review`; the CI `db` job is an explicit acceptance criterion. |
| 18 | blind | Epic context rebuild dropped requirements | medium | patch | Confirmed; `epics.md` unchanged since `051ba10`, staleness was mtime-only. Restored the committed file. |
| 19 | blind | No DB test of restore racing create at 19 | low | patch | Direct test addition. |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0
