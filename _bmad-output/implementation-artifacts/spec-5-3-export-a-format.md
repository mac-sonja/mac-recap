---
title: 'Story 5.3: export a format as a file'
type: 'feature'
created: '2026-11-04'
status: 'in-progress'
baseline_commit: 'd3bf032d8beafad7c957ec1e88e9eb439c6892af'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** **Scarica** on an approved case (the case page and Approvato rows) opens a format picker whose button does nothing. Nobody can take an approved case out of the tool as a file.

**Approach:** **Scarica** in the picker asks the server for the chosen format of the case's live approved revision. The server checks approval and enqueues an `export` job, or reuses an export already made for the same content. The worker renders the pages with the same renderer into a Presentazione PDF or a Carosello ZIP of PNGs (Playwright Chromium, `page.setContent`), stores it under `exports/{contentHash}/…`, and the browser downloads it through a signed URL. While it works, the button shows progress and the person can keep browsing.

**Decisions (2026-11-04):**
- 5.3 wires the existing single-format picker (radio). Ticking several formats into one ZIP is 5.4.
- The export HTML embeds the Inter font files (OFL), so the file uses the same font as the preview. The worker's Chromium has no Inter installed.

## Boundaries & Constraints

**Always:**
- Approved only. The server action reads `getLiveRevision`, refuses `NOT_APPROVED` when there's none and `FORMAT_NOT_IN_REVISION` when the format has no pages, and enqueues nothing then. The worker re-checks before rendering.
- Web requests never run Chromium.
- `content_hash` covers the ordered parts (`subject`, `revisionId`), each part's current client info (name, sector, description, logo id), the bound case fields (year, services, results, testimonial) and the format. The same hash reuses the stored export without rendering. A client or case field edit gives a new hash, so the next export renders again.
- Pages draw from display renditions and video posters, case and client files alike (deferred-work: exports must resolve client files through `client_rendition`). An SVG logo is rasterised from the stored file with network access off.
- An `export` row is immutable. Storage keys `exports/{contentHash}/{format}.{ext}` are built only in `rendering` adapters. RLS denies `anon` and `authenticated`.
- A successful download records an `export` case event with the actor id. A failed export never changes the case's status.
- Italian copy from `it.ts`, house voice.

**Never:**
- Video export: it stays "In arrivo".
- Several formats at once (5.4), client packs (5.9) or collections (5.10).
- A print route.
- Rendering on the web server.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Presentazione | Approved case, Presentazione picked, Scarica | Job enqueued; the button shows progress; when done the browser downloads `{code} {name} – Presentazione.pdf`, one page per slide at 1920×1080 | N/A |
| Carosello | Carosello picked | `{code} {name} – Carosello.zip` with `01.png`… at 1080×1080 | N/A |
| Reuse | Same case and format again, nothing changed | No new job; the stored file downloads at once | N/A |
| After an edit | The client's name changed since the last export | A new hash; it renders again with the new name | N/A |
| Not approved | Direct call for a case with no approved revision | `NOT_APPROVED`; nothing enqueued | Message in the dialog |
| Format missing | The revision has no Carosello pages | `FORMAT_NOT_IN_REVISION`; nothing enqueued | Message in the dialog |
| Job fails | The worker throws, or its attempts run out | Toast «L’esportazione non è finita.» with **Riprova**; status unchanged | Riprova enqueues again |
| Keep browsing | The person leaves the page while it renders | No download (the page that asked is gone); the export is stored, so the next Scarica is instant | N/A |
| Client media | A page uses a client image | It draws from its client rendition | N/A |
| Any role | The guardrail test | No role can produce an export for a case without an approved revision | N/A |

</frozen-after-approval>

## Code Map

- `src/app/_components/download-button.tsx` -- the picker. It already takes `onDownload(format)`, has `FORMAT_ORDER` (Presentazione, Carosello) and keeps Video "In arrivo". Add the progress and failure states; the picker's look is unchanged.
- `src/app/(tool)/case-studies/_components/case-view.tsx` (around line 143) and `case-studies-table.tsx` -- the two places that mount `DownloadButton` for a case. Wire `onDownload` there. `clients-table.tsx` (the client pack) stays inactive.
- `src/modules/jobs/domain/job.ts` -- `export` is already a job kind. `src/worker/run.ts` (`workerHandlers`) -- add `export: rendering.exportHandler()`.
- `src/modules/rendering` -- `index.ts`, `compose.tsx` (`renderComposed`), templates and `renderFormat` with `options.still`. New: `domain/export.ts` (the content hash), `application/ensure-export.ts`, `application/export-handler.ts`, and adapters for the `export` table and `exports/…` storage. Cross-module reads go through `case-study` and `material` `index.ts` only.
- `src/app/(wizard)/_lib/configurator-data.ts` -- `boundValuesOf`, `renderAssetsOf`, `clientRenderAssetsOf` (4.5c-2) show how to build values and assets. The worker needs the same, read as the system actor.
- `src/modules/case-study` -- `getLiveRevision`, `getClientInfoForCase`, `recordEvent`. Add an `export` event type.
- Dockerfile -- already Playwright `v1.63.0-noble` with `playwright@1.63.0`. Add the Inter woff2 files (e.g. `@fontsource-variable/inter`, pinned) and inline them as `@font-face` in the export HTML.
- `supabase/migrations/20261105140000_rendering_export.sql` -- the `export` table (`content_hash` unique, `format`, `parts` jsonb, `path`, `content_type`, `size_bytes`, `created_by`, `created_at`), with no update or delete for any role, and service role inserts only.
- `src/shared/i18n/it.ts` -- `download.working: "Preparo il file…"`, `download.failed: "L’esportazione non è finita."`, `download.retry: "Riprova"`, `download.notApproved`, `download.formatMissing`.

## Tasks & Acceptance

**Execution:**
- [ ] Migration + `db.types.ts`; `rendering` domain (`contentHash`, with tests for stability and each input changing it), the export repository and storage adapters (signed GET ≤ 15 minutes).
- [ ] `rendering.requestExport(actor, {caseId, format})`: approval and format checks, `ensureExport` reuse, or enqueue; `rendering.exportStatus(actor, {jobId|exportId})` returning `pending`, `ready` with a signed URL, or `failed`. Server actions with `authorize(actor, "export")` (or the policy's existing name), plus tests and permissions rows.
- [ ] `exportHandler`: re-check approval; build values and assets (case and client renditions); `renderToStaticMarkup` of every page with the inlined fonts; Playwright `setContent`, wait for images and fonts, then `page.pdf` (1920×1080 pages) or one `screenshot` per page into a ZIP; store; insert the `export` row. Unit tests use a fake browser; one integration test renders a two-page Presentazione with real Chromium.
- [ ] `download-button.tsx` + `case-view.tsx` + `case-studies-table.tsx` -- **Scarica** requests, polls status every 2 s, downloads on ready, shows the failure toast with Riprova; tests.
- [ ] `src/worker/run.ts` wiring and its test; `it.ts` copy; `test/permissions.test.ts`; a DB test for `export` (unique hash, RLS lockout) and the guardrail test.

**Acceptance Criteria:**
- Given a case exported once, when its client's name is edited and it is exported again, then a second `export` row exists and the new file has the new name.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` (Node 24) -- expected: all green
- `npm run test:db` (CI) -- expected: green, including `export`

**Manual checks:**
- On mac-recap-dev with the worker running, once the migration is applied: Scarica a Presentazione and a Carosello of an approved case; open the PDF and the PNGs and compare them with the preview (Inter, images, logo).
