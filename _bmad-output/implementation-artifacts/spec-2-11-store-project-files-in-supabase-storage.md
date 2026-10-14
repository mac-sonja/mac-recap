---
title: 'Story 2.11: Store project files in Supabase Storage'
type: 'refactor'
created: '2026-10-14'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-14-storage.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Project files go to AWS S3, which needs an AWS account, credentials and CORS that the owner can't set up. The owner approved Supabase Storage on 2026-10-14 (AD-8 rewritten).

**Approach:**
- A migration creates the private bucket `material` (100 MB `file_size_limit`, the `domain/files.ts` allowlist as `allowed_mime_types`, not public, no policies).
- A Supabase Storage adapter replaces the S3 one behind the existing `ObjectStorage` port:
  - a signed upload URL that the browser PUTs to
  - an object-metadata check at confirm
  - a signed GET valid ≤ 15 min for thumbnails
- The browser upload helper switches from POST form fields to the signed-upload shape.
- AWS packages, `S3_*` env vars and the S3 adapter are removed.
- Uploads then work with only the three `SUPABASE_*` values.

## Boundaries & Constraints

**Always:**
- Use cases, the asset table, the 20-file cap, the key layout `cases/{caseId}/assets/{assetId}/original.{ext}` (`adapters/asset-key.ts`) and soft delete are unchanged.
- Size and type are re-checked at confirm from the object's stored metadata.
- Only the service role touches the bucket.
- Upload never overwrites: `x-upsert: false`.
- Migrations are forward-only; `db.types.ts` matches the generator.
- `check`, `db` and `image` pass, and the DB tests run against the real bucket in CI.

**Never:**
- No public bucket and no anon or authenticated storage policies.
- No deletes of objects.
- No rename of `asset.s3_key` (it holds the storage path; renaming isn't worth a migration now).
- No UI changes beyond the upload helper's request shape.
- No renditions or exports code (later epics).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Presign | valid case, allowed type | `{assetId, url, method:"PUT", headers:{content-type, x-upsert:"false"}}` for the asset key | N/A |
| Upload | browser PUTs the file with those headers | object stored with that mimetype | N/A |
| Over limit | PUT of > 100 MB or a type outside the bucket list | storage refuses (4xx); the row shows its failure; no asset row | existing retry, then failed |
| Confirm | object exists, size 1..100 MB, matching type | asset row created | N/A |
| Missing object | confirm without an upload | — | `UPLOAD_NOT_FOUND` |
| Mismatch | stored size or type differs from the declared one | no row | `UPLOAD_REJECTED` |
| Storage error | storage API 5xx / network error | — | `STORAGE_FAILED` (logged with caseId, no material) |
| Thumbnail | image listed | signed URL, expires ≤ 900 s, inline | N/A |
| Browser key | anon / publishable client reads or writes `material` | refused | no policies |

</frozen-after-approval>

## Code Map

- **Migration** `supabase/migrations/20261014160000_material_storage_bucket.sql` (new, header in the style of the 2.9 migration): `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('material','material',false,104857600, array[the 9 types]) on conflict (id) do update set …`. No policies.
- **`supabase/config.toml:116-130`:** `[storage] file_size_limit = "100MiB"` (it was 50MiB, which caps local uploads).
- **CI** `.github/workflows/ci.yml:49-53`: remove `storage-api` from `supabase start -x` (imgproxy can stay excluded), so the bucket migration and the DB tests have storage.
- **Port** `src/modules/material/ports/object-storage.ts`: `PresignedUpload` becomes `{ url: string; method: "PUT"; headers: Record<string, string> }`. Update the doc comment from "private S3 bucket" to Supabase Storage. `presignDownload` and `head` keep their signatures.
- **New** `src/modules/material/adapters/supabase/object-storage.ts` (+ test, stubbing `client.storage.from(bucket)`):
  - Build the key with `assetKey(...)`.
  - `presignUpload`: `createSignedUploadUrl(path)` returns `{url: signedUrl, method: "PUT", headers: {"content-type": contentType, "x-upsert": "false"}}`.
  - `head`: `info(path)` gives `{sizeBytes: size, contentType}`. A StorageApiError with status 400 or 404 gives `ok(null)`.
  - `presignDownload`: `createSignedUrl(path, ttl)`.
  - Errors return `STORAGE_FAILED` with the existing messages and a `log.error("storage … failed: status", {caseId})`.
  - The client is `createSupabaseAdminClient()` (`adapters/supabase/admin.ts`). Export `MATERIAL_BUCKET = "material"`.
- **Delete** `src/modules/material/adapters/s3/` (adapter and test).
- **`src/modules/material/index.ts:7,47-58`:** wire the Supabase adapter (memoized). Storage is always configured now, so `deps()` always passes it. Keep `storage: ObjectStorage | null` and `storageNotConfigured` so tests and the UI message stay valid. Rewrite `index.test.ts:83-151,200` around the new factory.
- **`src/shared/env.ts:23-27,77-87`** and `env.test.ts:106-125`: remove `S3_BUCKET`, `S3_REGION`, `StorageConfig`, `resolveStorageConfig` and `getStorageConfig`. In `.env.example:13-18`, drop the S3 and AWS block.
- **`package.json:21-23`:** remove the three `@aws-sdk/*` packages, then run `npm install` to refresh the lock. In `eslint.config.mjs:24`, keep the `VENDOR_SDK` regex generic (`@aws-sdk/` may stay listed) and leave `test/lint-boundaries.test.ts` as it is unless it breaks.
- **Browser helper** `src/app/(wizard)/_lib/upload.ts:28`:
  - `uploadToS3` becomes `uploadFile(target: {url, method, headers}, file, onProgress, {signal, createXhr}?)`, an XHR sending the raw body with those headers.
  - Keep the `UploadError` and abort semantics, and update `upload.test.ts`.
  - `material-step.tsx:17,155-161`: destructure `{assetId, url, method, headers}`. Update the fixtures in `material-step.test.tsx` (`"https://bucket.s3/"`, `{key:"k1"}`, "S3 answered 500").
- **Fakes to update:** `application/use-cases.test.ts:103-110` and `test/db/material.db.test.ts:375-389` (the presign shape).
- **New DB tests** in `test/db/material.db.test.ts`:
  - the bucket exists, is private, and has the limit and type list (from `storage.buckets`)
  - a real round trip through the adapter: presign, `uploadToSignedUrl`, `head` gives size and type, then confirm
  - a missing object returns `head` → null
  - the browser key is refused on `storage.from("material")`
- **`src/shared/db.types.ts`:** no change expected (the storage schema isn't generated for `public`). If CI shows drift, commit its artifact.
- **README** line 95: drop "AWS" from the vendor SDK list.

## Tasks & Acceptance

**Execution:**
- [ ] migration + `supabase/config.toml` + `.github/workflows/ci.yml` -- bucket and storage in CI
- [ ] `src/modules/material/**` -- port shape, Supabase adapter + tests, delete the S3 adapter, wiring, fakes
- [ ] `src/shared/env.ts` + test, `.env.example`, README -- no `S3_*`
- [ ] `package.json` + `package-lock.json` -- no `@aws-sdk`
- [ ] `src/app/(wizard)/_lib/upload.ts` + test, `material-step.tsx` + test -- PUT upload
- [ ] `test/db/material.db.test.ts` -- bucket and round-trip tests
- [ ] `sprint-status.yaml` -- 2.11 in-progress/review per flow

**Acceptance Criteria:**
- Given the repo, when you `grep -rn "@aws-sdk\|S3_BUCKET\|S3_REGION" src test package.json .env.example`, then nothing matches except lint fixtures.
- Given the dev project with this migration pushed, when a file is dropped in the wizard, then it uploads, appears as a row and survives a reload.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- all pass
- CI `db` job -- bucket and round-trip tests pass; db-types diff clean

**Manual checks (if no CLI):**
- `npx supabase db push` to **mac-recap-dev** (linked), then upload an image and a PDF in the wizard in the Browser pane.
