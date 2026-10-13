---
title: 'Story 2.7 (backend): List a case study''s files'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'oneshot'
baseline_commit: 'a1bd51b686b4f4246ca0c5c589085ac4ae68fe29'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Material step (deferred UI) will need to show a case's uploaded files as rows with a thumbnail, name and size, but nothing returns a case's assets or a way for the browser to fetch an image from the private bucket.

**Approach:** Add `material.listAssets(caseId)` and a `listAssets` server action (`getActor` then `authorize(actor, "upload")` first) returning the case's non-deleted assets oldest first, each with `id`, `kind`, `originalFileName`, `contentType`, `sizeBytes`, `createdAt` and, for images only, a presigned GET URL valid 15 minutes, built only in the `material` S3 adapter from the asset's key. Videos, documents and text files get no URL (the UI shows a type icon). An unknown or soft-deleted case is `NOT_FOUND`; a case with no files returns `[]`. When S3 isn't configured the list still works and every URL is `null`. Signing is local (no network call per asset). Nothing is written; status never changes; nothing is logged about file contents.

</frozen-after-approval>

## Implementation Notes

- Ports: `AssetRepository.listLive(caseId)` (oldest first, then id) and `ObjectStorage.presignDownload(target, ttlSeconds)`.
- S3 adapter: `presignGet` joins the injectable `S3Calls`, typed narrowly as `(client, GetObjectCommand, { expiresIn }) => Promise<string>` because the SDK's generic `getSignedUrl` type can't be satisfied by a mock; the default wraps `getSignedUrl` from `@aws-sdk/s3-request-presigner` (already pinned). The key comes from `assetKey`, so it stays built only in adapters.
- Use case `application/list-assets.ts`; types `ListedAsset` and `THUMBNAIL_URL_TTL_SECONDS` (900) and `listAssetsInputSchema` in `domain/asset.ts`. A signing failure fails the whole list (`STORAGE_FAILED`) rather than returning a partial list; signing is local, so it only fails on misconfiguration.
- `material.listAssets` uses `deps()` (storage may be `null` when unset, giving null URLs); action `listAssets` authorizes `upload` first (the Material step's action).
- Tests: use-case cases with fakes, Supabase adapter (`order` added to the stub builder), S3 adapter incl. a real offline-signed GET (`X-Amz-Expires=900`), index wiring, action 403/401/404, and DB tests for ordering, exclusions and the use case on the real DB. Existing fakes gained the two new methods.
- Sprint status stays `in-progress`: 2.7's UI part is still open.

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | `thumbnailUrl` is the full-size original | false | reject | Intended: Story 2.7 AC and IR-OP12 say images are "the original … scaled to fit by the browser"; Epic 3 Story 3.2 switches thumbnails to renditions. |
| 2 | Presigned GET doesn't pin response type/disposition | low | patch | Now sets `ResponseContentType` (the validated type) and `ResponseContentDisposition: inline`; tested on the command and the signed URL. |
| 3 | One signing failure fails the whole list | low | reject | Signing is local and fails only on misconfiguration; degrading silently would hide that. |
| 4 | Images signed one at a time | low | patch | Now `Promise.all`; order kept. |
| 5 | Error lists in doc comments incomplete | low | patch | Module, action and use-case docs now name `ASSET_LOOKUP_FAILED`, `ASSET_INVALID`, `STORAGE_FAILED`. |
| 6 | Action error mapping only tests 404 | low | patch | Added `INVALID_INPUT` → 400 with fields, `STORAGE_FAILED`/`ASSET_LOOKUP_FAILED` → 500. |
| 7 | Order test passes on an error result | low | patch | Asserts `ok` first. |
| 8 | `id` tie-break never exercised on the real DB | low | patch | DB test sets equal `created_at` and expects id order. |
| 9 | S3 signing-failure test doesn't check the log | low | patch | Asserts one error line with `caseId` and no key or asset id. |
| 10 | `ASSET_COLUMNS` selects `s3_key` | low | patch | Dropped; `toAsset` never reads it. |
| 11 | `presignDownload` takes `UploadTarget` | low | reject | Naming only; renaming touches every storage call for no behaviour change. |
| 12 | No domain-level tests for the new schema/TTL | low | reject | Covered by use-case tests (malformed input, `ttl=900`). |
