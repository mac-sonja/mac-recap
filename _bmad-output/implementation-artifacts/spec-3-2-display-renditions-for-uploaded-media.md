---
title: 'Story 3.2: Display renditions for uploaded media'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_commit: '6189dfffd6548aea1fab4d8a2e5fcc1cc716f14f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-background-job-queue-and-worker-loop.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Thumbnails, the configurator (Epic 4) and shared links (Epic 5) would load full originals of up to 50 MB, and videos have no preview at all.

**Approach:** When a case image or video is confirmed, enqueue a `rendition` job. The worker makes light display copies:
- images: whole-image downscales, never upscaled, cropped, recoloured or filtered;
- videos: a poster frame and a display transcode.

Each copy is recorded in a new `rendition` table. Other modules get a short-lived signed URL through `material.getRendition`, and the Material step shows the thumbnail rendition when it exists.

## Boundaries & Constraints

**Always:**
- **Specs:** each one is a named constant with a version. `specHash` = the first 16 hex characters of the sha256 of the spec's canonical JSON.
  - `image.thumb`: WebP, long side ≤ 480 px.
  - `image.display`: WebP, long side ≤ 2048 px.
  - `video.poster`: one WebP frame at 1 s (or the first frame if the video is shorter), long side ≤ 2048 px.
  - `video.display`: MP4 H.264/AAC, long side ≤ 1920 px, faststart.
  - Every spec keeps the original's aspect ratio (`fit: inside`) and never enlarges. A smaller source is kept at its own size, and the only allowed change is EXIF orientation.
- **Where copies live:** `cases/{caseId}/assets/{assetId}/renditions/{specHash}.{ext}` in bucket `material`. Only the material adapter builds these keys.
- **The `rendition` table** (owned by material): `asset_id`, `spec_hash`, `path`, `content_type`, `width`, `height`, `size_bytes`, `created_at`, unique on (`asset_id`, `spec_hash`). RLS is on, and the system actor writes it through a service-role RPC.
- **Enqueueing:**
  - Confirm enqueues `rendition` with `subjectId = assetId` and `inputHash` = the hash of the asset id plus every spec hash for that kind. Enqueue is idempotent.
  - An enqueue failure is logged and never fails the confirm.
  - Documents and text files get no job.
- **The worker:**
  - it reads the original, writes each missing rendition, and upserts its row, so a retry skips what already exists;
  - it never writes, moves or deletes the original;
  - it never calls an LLM;
  - an abort kills ffmpeg;
  - a bad or undecodable file fails the job with `retryable: false`.
- **`material.getRendition(assetId, specName)`** returns `{ url, width, height, contentType }`, with the URL signed for ≤ 15 min, or `RENDITION_NOT_READY` / `NOT_FOUND`. It doesn't run for soft-deleted assets.
- **The Material step:**
  - an image row uses `image.thumb` when it exists, and otherwise today's signed original;
  - a video row uses `video.poster` when it exists, and otherwise the type icon;
  - the step re-lists every 5 s while a listed image or video still lacks its thumbnail, for up to 2 min.
- **Module and import rules:** sharp and `child_process` live only in worker-only code: a new `src/modules/material/worker.ts` entry that only `src/worker` imports. Nothing under `src/app` reaches it (web-imports test).

**Never:**
- Crop, focal point, upscaling, recolouring, filters, watermarks or any AI.
- Renditions for client logos or client material (not in this story).
- Changing the bucket's allowed types, since WebP and MP4 are already allowed.
- Editing an applied migration, or running `supabase db push`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Large image | 6000×4000 JPEG | thumb 480×320, display 2048×1365 WebP; rows written | N/A |
| Small image | 300×200 PNG | thumb and display at 300×200, no upscale | N/A |
| Portrait EXIF | JPEG with orientation 6 | Copies upright, aspect kept | N/A |
| Video | 20 s MP4, 3840×2160 | Poster WebP 2048×1152 at 1 s; MP4 1920×1080 | N/A |
| Short video | 0.5 s clip | Poster from the first frame | N/A |
| Corrupt file | Undecodable image or video | No rendition rows; job failed, not retried | `retryable: false` |
| Retry | Job retried after thumb was written | Only display is made | N/A |
| Document | PDF confirmed | No job enqueued | N/A |
| Not ready | `getRendition` before the job ends | — | `RENDITION_NOT_READY` |
| Deleted asset | `getRendition` on a soft-deleted asset | — | `NOT_FOUND` |

</frozen-after-approval>

## Code Map

- `src/modules/jobs/index.ts`: `enqueue` and `JobHandler` (`domain/job.ts`). `rendition` is already in `JOB_KINDS`. `caseIdOf` lets a permanent failure log `job_failed` on the case.
- `src/worker/run.ts`: today it calls `startJobLoop({ actor, handlers: {} })`. Register `rendition: material.worker.renditionHandler(...)` there.
- `test/lint-boundaries.test.ts`: the worker may import only module indexes. Allow `src/modules/*/worker.ts` for `src/worker/**` only.
- `test/web-imports.test.ts` and `test/helpers/web-imports.ts`: these must still pass, with no app path reaching `worker.ts`.
- `src/modules/material/application/confirm-upload.ts`: enqueue after the `ASSET_UPLOADED` event, before `return ok`. Add `jobs` to `MaterialDeps` (`application/deps.ts`) and wire it in `index.ts` `deps()`.
- `src/modules/material/ports/object-storage.ts` and `adapters/supabase/object-storage.ts`: add `download(key)` and `upload(key, bytes, contentType)` (server-side, worker-only use). `adapters/asset-key.ts`: add `renditionKey`.
- `src/modules/material/application/list-assets.ts`: `thumbnailUrl` comes from the thumb or poster rendition first. `domain/asset.ts` L76: `THUMBNAIL_URL_TTL_SECONDS`.
- `src/modules/material/ports/asset-repository.ts`: `get(caseId, assetId)`. Add `getById(assetId)` for `getRendition`.
- `src/app/(wizard)/_components/asset-row.tsx`:
  - L69: show the thumbnail for videos too when there is a URL;
  - L43: `TypeIcon` while pending.
- `src/app/(wizard)/_components/material-step.tsx` L292 `refreshThumbnails`: turn it into polling (5 s, 2 min cap). Client material uses the same component without renditions; its behaviour must not change.
- The Dockerfile runtime already installs ffmpeg 6.1.1, and sharp 0.35.5 is already a dependency.
- New migration `supabase/migrations/20261020120000_material_rendition.sql`: the `rendition` table and an `upsert_rendition` RPC (service_role), patterned on the material migrations.

## Tasks & Acceptance

**Execution:**
- [x] Migration, domain specs, `specHash` and the key builder, with unit tests.
- [x] Storage `download` / `upload` and the repository `getById` and `rendition` reads and writes, with adapter tests.
- [x] `src/modules/material/worker.ts`: the rendition handler using sharp and ffmpeg (spawned via `child_process`, killed on abort).
  - Tests with real sharp on generated fixtures: the aspect ratio holds, there is no upscale, EXIF orientation is applied.
  - A static test that the image pipeline only calls `rotate()`, `resize({ fit: "inside", withoutEnlargement: true })` and the output encoder.
  - A video test, skipped when ffmpeg is missing locally, but run in the image smoke test or CI.
- [x] The enqueue on confirm, with use-case tests (image and video enqueue, document doesn't, an enqueue failure only logs).
- [x] `getRendition`, exported from `material/index.ts`, with use-case tests for the matrix rows.
- [x] The worker registration and the lint-boundary allowance, with tests.
- [x] The list and UI thumbnail switch and polling, with component tests (case step only; client step unchanged).
- [x] DB tests: table, RLS, RPC grants, idempotent upsert.

**Acceptance Criteria:**
- Given CI, when `check`, `db` and `image` run, then they pass, `db.types.ts` matches, and the image smoke test still finds ffmpeg.
- Given the client material step, when it runs, then its thumbnails behave as before.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all pass.
- `npm run test:db` -- runs in CI only.

**Manual checks:**
- After the owner applies the change to dev, and with the worker running locally, upload a large image and a video to a case, then check that the thumbnail and poster appear within a minute.

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | blind, edge-case | A failed, never-enqueued or pre-3.2 rendition reads as pending forever, so the step polls 2 min on every visit and videos keep the icon | medium | patch | `pending` = "no row"; confirm-time enqueue is the only enqueue; dev already holds pre-3.2 assets. |
| 2 | edge-case, verification-gap | An image whose thumb exists but can't be signed shows the icon, not its original | low | patch | `list-assets.ts` drops it from `originals`; the spec says to fall back to the signed original. |
| 3 | blind | ffmpeg/ffprobe have no time limit and unbounded stdout, so one bad file can block the single-job worker | medium | patch | `run()` stops only on abort; the lease renews forever. |
| 4 | edge-case | A display MP4 over the 50 MB bucket cap fails as retryable, transcoding three times | medium | patch | The upload 413 maps to a retryable storage error; no bitrate cap. |
| 5 | edge-case | Transient sharp/ffmpeg failures (OOM, ENOSPC, limits) are marked undecodable and never retried | medium | patch | Any throw or non-zero exit maps to `RENDITION_UNDECODABLE`, `retryable: false`. |
| 6 | blind | The image now spawns ffmpeg but has no init process to reap children | medium | patch | The Dockerfile has no `tini`/`--init`; the deferred item was dropped from the epic context. |
| 7 | edge-case | `getRendition` issues URLs for a live asset of a soft-deleted case | low | patch | `listAssets` checks the case; `getRendition` doesn't. |
| 8 | blind | `upsert_rendition` writes rows for an asset deleted during a transcode | low | patch | It checks existence only; the migration is unapplied. |
| 9 | blind | The handler hard-codes `"ABORTED"` instead of `JOB_ABORTED` | low | patch | Direct correction. |
| 10 | edge-case | `session.close()` rejecting in `finally` overrides the real outcome | low | patch | Direct correction (catch and log). |
| 11 | blind | `fitInside` is exported and tested but unused | low | patch | Remove it, or use it to assert adapter output. |
| 12 | blind | The epic context says Story 3.10 lives only on an open branch; PR #61 is merged | low | patch | Stale line. |
| 13 | verification-gap | Restarting the 2-min polling window on a later upload is untested | low | patch | No test adds a file mid-window. |
| 14 | blind | `getRendition(assetId, …)` has no case check, so a caller holding another case's asset id gets its URL | low | defer | No caller yet (renderers come in 3.5); its asset ids will come from the case's own revision. Settle the signature in 3.5. |
| 15 | blind | 10-bit HEVC/HDR iPhone clips may give washed-out copies; .mov, portrait and HDR are untested | medium | defer | Needs tone-mapping and real phone fixtures; verify with the owner's footage on dev. |
| 16 | verification-gap | The poster's fallback to the first frame (seek returns no frame) never runs | low | defer | Awkward fixture; add when the video test is next touched. |
| 17 | blind | Video thumbnails use the 2048 px poster | low | reject | A few videos per case; adding a spec changes the frozen spec list. |
| 18 | blind | Upload content type isn't checked against the key's extension | low | reject | Only the handler uploads, with types from the spec constants. |
| 19 | blind | The idempotency test checks only the hash function | low | reject | Enqueue idempotency is covered by the 3.1 jobs DB tests. |
| 20 | blind | Spec and tracker statuses differ | false | reject | `in-review` spec with `in-progress` tracker is the workflow's normal state. |
| 21 | edge-case | Stale temp dirs after a SIGKILL | low | reject | Container tmp is ephemeral per deploy. |
| 22 | edge-case | Odd-sized small videos are rescaled by a pixel to even sizes | low | reject | H.264 4:2:0 needs even sides; ≤1 px. |
| 23 | edge-case | Anamorphic videos (non-square SAR) get a stretched poster | low | reject | Rare in project footage. |
