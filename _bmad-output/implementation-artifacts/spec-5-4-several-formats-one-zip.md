---
title: 'Story 5.4: several formats as one ZIP'
type: 'feature'
created: '2026-11-04'
status: 'in-progress'
baseline_commit: '8b0091c109e03c27ab33afc8a619eb5eb566e8a3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-3-export-a-format.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** **Scarica** exports one format at a time (5.3). To hand over a whole case, a person downloads the Presentazione and the Carosello separately.

**Approach:** The picker's formats become checkboxes. One ticked behaves exactly as 5.3. With two or more ticked, the export job makes (or reuses) each format's export, then builds one ZIP from exactly those stored files, stores it as its own `export` row under its own content hash, and the browser downloads it. Same content gives the same ZIP back.

**Decisions (2026-11-04):**
- The ZIP is named `{code} {name}.zip`. Inside, the Presentazione PDF sits at the root under its 5.3 name, and the Carosello's PNGs sit in a folder `Carosello/` (`01.png`…) rather than as a ZIP inside the ZIP.
- The format shown in the view is ticked by default. On a table row, where nothing is in view, Presentazione is.

## Boundaries & Constraints

**Always:**
- Approval and format checks as 5.3, for every ticked format, before anything is enqueued (`NOT_APPROVED`, `FORMAT_NOT_IN_REVISION`, `INVALID_INPUT`). Nothing is enqueued if any check fails.
- The bundle's hash covers the ticked formats (sorted) and each format's own 5.3 content hash, so any change to a format makes a new bundle, and an existing one is reused when nothing changed.
- One `export` job does the work: it renders any format that has no export yet (with 5.3's handler logic, unchanged), then zips. If any format fails, no ZIP is stored and the job fails as that format's failure would. A format export already made stays stored and reusable.
- The bundle row has format `bundle`, content type `application/zip` and path `exports/{hash}/bundle.zip`. It's immutable like every export row.
- One `export` case event per download handed out, as 5.3.
- Italian copy from `it.ts`, house voice.

**Never:**
- An **Export all** button (owner, 2026-10-28).
- Video in the bundle (after the demo; it stays "In arrivo").
- Client packs (5.9) or collections (5.10).
- Re-rendering a format whose export already exists.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| One ticked | Only Carosello | Exactly 5.3's flow and file | As 5.3 |
| Both ticked | Presentazione + Carosello, neither exported yet | One job renders both, then zips; `{code} {name}.zip` downloads with the PDF and `Carosello/01.png`… | N/A |
| Partly exported | The PDF exists, the Carosello doesn't | Only the Carosello renders; the stored PDF goes in the ZIP as is | N/A |
| Reuse | Same case and formats again, nothing changed | The stored ZIP downloads at once, no job | N/A |
| After an edit | The client's name changed | Both formats and the ZIP are made again | N/A |
| One fails | The Carosello render fails for good | No ZIP stored; the toast «L’esportazione di {name} non è finita.» with **Riprova** | The PDF stays stored |
| None ticked | All boxes cleared | **Scarica** disabled | N/A |
| Not approved | Direct call | `NOT_APPROVED`, nothing enqueued | Message in the dialog |

</frozen-after-approval>

## Code Map

- `src/app/_components/download-button.tsx` -- radio → checkboxes (`FORMAT_ORDER`), default ticked from a new optional `currentFormat` prop, disabled with none ticked; `onDownload(formats: ExportFormatId[])`. The progress, polling, 5-minute give-up, toast and in-flight guard are unchanged.
- `src/app/(tool)/case-studies/_components/case-download.ts`, `case-view.tsx` (pass the view's format), `case-studies-table.tsx` -- adapt to the list.
- `src/app/(tool)/case-studies/export-actions.ts` -- `requestCaseExport({ caseId, formats })`; `getCaseExportStatus` unchanged in shape.
- `src/modules/rendering/domain/export.ts` -- `EXPORT_FORMAT_IDS`, `EXPORT_FILES`, `contentHashInput`, the job payload schema: add the bundle kind (format `bundle`, payload `formats: [...]` of 2+), its hash input (sorted formats + each format's hash) and file name.
- `src/modules/rendering/application/request-export.ts` (`requestExport`, `exportStatus`, the ensure step) -- one format: unchanged; 2+: compute every format's hash, reuse a stored bundle by its hash, else enqueue one bundle job.
- `src/modules/rendering/application/export-handler.ts` -- factor the single-format render-and-store into a function the bundle path calls per missing format; then read each stored file from storage and write the bundle with `adapters/zip/store-zip.ts` (Carosello's PNGs unpacked into `Carosello/`).
- `src/modules/rendering/adapters/supabase/export-storage.ts` -- add a read of a stored export's bytes, and the bundle key.
- `supabase/migrations/20261105180000_rendering_export_bundle.sql` -- widen the `export` checks: `format` also `bundle`, its content type `application/zip`, path `exports/{hash}/bundle.zip`. Then `db.types.ts` (keep the generator's layout).
- `src/shared/i18n/it.ts` -- the checkbox group label if it changes; reuse the 5.3 strings.

## Tasks & Acceptance

**Execution:**
- [x] Migration + `db.types.ts`; `domain/export.ts` bundle kind and hash (tests: stable, order-independent, changes when a format's hash changes).
- [x] `request-export.ts` + tests: one format unchanged; 2+ reuse, enqueue, refusals before enqueue.
- [x] `export-handler.ts` + tests: render only missing formats, zip the stored files with the layout above, no ZIP on any failure, size and page checks as 5.3.
- [x] `export-storage.ts` read and key, with tests.
- [x] `download-button.tsx`, `case-download.ts`, `case-view.tsx`, `case-studies-table.tsx`, `export-actions.ts` + tests: checkboxes, default from the view, disabled with none, one vs several.
- [x] `test/export-chromium.test.ts`: a two-format bundle with real Chromium contains the PDF and `Carosello/01.png`…; `test/db/export.db.test.ts`: a `bundle` row is accepted with its path, a wrong path is refused.

**Acceptance Criteria:**
- Given both formats exported once, when both are exported again with nothing changed, then no job is enqueued and the same file downloads.

## Implementation Notes

- Resumed build (2026-11-04): the server side is already on the branch since `baseline_commit` — domain bundle kind and hash, `request-export.ts`, `export-handler.ts`, `store-zip.ts` read-back, `export-storage.ts` read and key, the migration, and tests including `test/db/export.db.test.ts` and `test/export-chromium.test.ts`. Check those against the spec and keep them; don't rewrite. Still open: the picker (radio → checkboxes) and its wiring in `case-download.ts`, `case-view.tsx`, `case-studies-table.tsx`, `export-actions.ts`, their tests, and a lint error in `domain/export.test.ts` (unused `_`).
- Picker (2026-11-04): checkboxes over `EXPORT_FORMAT_IDS` (now also exported, pure, from `rendering/index.ts`). The ticked boxes reset to `currentFormat` each time the dialog opens (Presentazione when there is none, or when the view shows Video); `onDownload` gets them in the picker's order; **Riprova** asks again for the same set. `caseDownload` always sends `{ caseId, formats }` (one format takes 5.3's path on the server). Copy: `download.formats` "Formati", `download.caseDescription` "Scegli uno o più formati."
- `db.types.ts` needs no change: the migration only widens check constraints, and `format`/`content_type`/`path` are `string` already.
- Not run here: `npm run test:db` (no Docker) and `test/export-chromium.test.ts` (skipped without Playwright's Chromium); local Node is 22, not 24.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` (Node 24) -- expected: all green
- `npm run test:db` (CI) -- expected: green, including the bundle row

**Manual checks:**
- On mac-recap-dev with the worker on the new image: tick both formats on an approved case; open the ZIP and compare its PDF and PNGs with the preview.
