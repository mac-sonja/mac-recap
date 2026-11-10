---
title: 'Story 5.9a: client pack download'
type: 'feature'
created: '2026-11-10'
status: 'in-review'
baseline_commit: '7e0d869dc2720532053eb913c49338e88fabf78c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-3-export-a-format.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-4-several-formats-one-zip.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A client's whole track record can't be downloaded. Today the export (5.3, 5.4) works one case at a time, and the client pack button on the Clienti list is inactive.

**Approach:** **Scarica** on a client opens the same export dialog as a case. For each ticked format, the server builds the client's pack: the client's approved intro, then its approved cases in the client's order (4.12b), then the approved closing. It exports the pack through the existing export job. Several formats come as one ZIP, and the same inputs return the stored file.

## Boundaries & Constraints

**Owner decisions (2026-11-10):**
- **Scope:** this is part 1, for owner/designers. Part 2 (5.9b, deferred) gives account/sales/social users a read-only Clienti list with Scarica.
- **Intro with one case:** when the client's intro is approved, the pack is intro, then case(s), then closing, whatever the number of cases. This replaces the story's "1 case → its own pages".
- **Case order:** the client's saved order, as set in 4.12b (`listClientCasesInOrder`), replaces the story's "newest first". With no saved order, newest first is still the result.

**Always:**
- **Pack contents, per format:**
  - **Intro approved:** the intro's `intro` pages, then each approved case without its own `intro` pages and, in Carosello, without its own Chiusura (Risultati e testimonial stay), then the intro's `outro` pages once.
  - **Intro missing or not approved:** each approved case with all its own pages, in order, and the dialog says "L'introduzione del cliente non è approvata: ogni case tiene la sua intro e la sua chiusura."
  - Page numbers run on across the whole pack.
  - Each part is read from its **approved** revision only (`getLiveRevision`), never a working, superseded or unapproved one.
  - Deleted cases are left out.
- **Building the pack:** `composeParts` gets a pack mode, or an option, for the intro-with-any-count rule. Single-case exports and the configurator's `clientFile` mode stay unchanged.
- **Export pipeline (5.3/5.4), widened rather than duplicated:**
  - The export subject can be a client.
  - The payload holds all of the pack's parts, in order.
  - The content hash covers every part's subject, approved revision and bound values, plus the client's fields.
  - The same inputs return the stored export, and any change to an approved revision, the order or the client's fields gives a new one.
  - Files are named from the client's code and name. Several formats download as one ZIP.
  - The worker re-reads the pack and refuses with `EXPORT_STALE` when a part has changed since the request.
- **Refusals:** a client with no approved case has no **Scarica**, and a direct call fails with `NOT_APPROVED`. A format that a part lacks behaves as for cases (`FORMAT_NOT_IN_REVISION`).
- **Where Scarica appears:** on each Clienti row with at least one approved case (the existing button, now active), and on the client page. Both are owner/designer only for now.
- **Dialog:** the same component and polling as the case dialog, with the note above when the intro isn't approved.
- **Activity:** each successful pack download records an event, using the existing export event pattern.

**Never:**
- Account/sales/social access (5.9b).
- Video export (after the demo).
- Collections (5.10).
- Changing single-case exports or their hashes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Full pack | Intro approved, 3 approved cases (saved order C,A,B), Presentazione | Intro pages, C, A, B (own intros dropped), closing once; continuous numbers | — |
| One case | Intro approved, 1 case | Intro, the case without its intro, closing | — |
| No intro | Intro Da approvare, 2 cases | Both cases with all their own pages; dialog note | — |
| Carosello | Intro approved, 2 cases | Each case's own Chiusura dropped; client closing once | — |
| Two formats | Presentazione + Carosello | One ZIP with both files | — |
| Again | Same inputs, Scarica again | Stored export returned, no new job | — |
| Changed | One case's approved revision updated | New export | — |
| Working copy | A case has an unpublished working copy | Pack uses its approved revision | — |
| No approved case | Client with only Bozza cases | No Scarica; direct call → `NOT_APPROVED` | `NOT_APPROVED` |
| Stale | A case updated between request and job | Job refuses | `EXPORT_STALE`, as for cases |

</frozen-after-approval>

## Code Map

- `src/modules/rendering/domain/export.ts`:
  - `exportSubjectSchema` L58 is `case` only, with a comment saying "5.9 and 5.10 add…".
  - `exportPayloadSchema` L77–83 has `parts.length(1)`.
  - `exportStatusInputSchema` L98 is keyed by `caseId`.
  - `contentHashInput` L168: multi-part, with a case block.
  - `bundleHashInput` L190.
  - File names L209–236.
  - Widen all of these for a client subject.
- `src/modules/rendering/application/export-source.ts`: `ExportSourceDeps` L350, `readExportSources` L389, `bundleHashOf` L449. Add a pack reader: the client, its intro's live revision, `listClientCasesInOrder`, and each case's live revision, values and media.
- `src/modules/rendering/application/request-export.ts`: `makeRequestExport` L178, `deliver` L120, `makeExportStatus` L217 (single-part checks L250–253). Add the client subject path and the client status.
- `src/modules/rendering/application/export-handler.ts`: `run` L286 (`parts[0]`), `draw` L163 (hard-coded single `case_history` part, page-count check L193/198), `caseIdOf` L94. Draw N parts, count pages from `composeParts`, and return `caseIdOf` null for a client.
- `src/modules/rendering/compose.tsx` L79 (default mode: intro only with 2+ cases, L98–123) and `export-html.ts` L12: add the pack rule (intro with any count of cases when an intro part is given). Default and `clientFile` stay as they are.
- `supabase/migrations/20261105140000_rendering_export.sql`: `parts jsonb` holds 1–200 entries with no `case_id` column, so no migration should be needed. Confirm the parts check accepts the new subject kinds; if it doesn't, add a forward migration.
- `src/app/(tool)/case-studies/export-actions.ts` (L20, L37, deps L25–41): mirror these as `src/app/(tool)/clients/export-actions.ts` (`requestClientExport`, `getClientExportStatus`), authorized `export` for owners.
- `src/app/(tool)/case-studies/_components/case-download.ts` (`caseDownload`, `refusalFor`): mirror as `clientDownload(clientId)`.
- `src/app/_components/download-button.tsx` (props L42–60): add an optional note line.
- `src/app/(tool)/clients/_components/clients-table.tsx` L265–275 (inactive pack button, `packLabel`/`packTitle`/`packDescription` in `it.ts` L641–645) and `src/app/(tool)/clients/[clientId]/page.tsx`: wire Scarica.
- `test/permissions.test.ts`:
  - `EXPECTED` L92–121 and the count at L146 need the new actions.
  - The guardrail L252–276 is the pattern for a client pack test: no role exports a pack with a non-approved revision, and `getEditableRevision` is never called.

## Tasks & Acceptance

**Execution:**
- [x] `src/modules/rendering/**` (+ unit tests) -- the pack rule in `composeParts`, the pack source, hash, payload, handler and status.
- [x] Migration only if the export table's parts check refuses the new subject kinds; then `npm run db:types`.
- [x] `src/app/(tool)/clients/export-actions.ts`, `_components/client-download.ts` (+ tests) -- the actions and dialog wiring.
- [x] `download-button.tsx`, `clients-table.tsx`, `clients/[clientId]/page.tsx` (+ tests) -- Scarica and the intro note.
- [x] `src/shared/i18n/it.ts`, `test/permissions.test.ts` (new actions and the pack guardrail).
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.9 stays `in-progress`, with a note that 5.9a is in review.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given a single-case export, when it is requested, then its hash and output are unchanged (existing tests pass as they are).

## Implementation Notes

- **No migration.** `export.parts` only checks a JSON array of 1–200 entries, so a pack's parts (`client_intro` and `case` subjects) fit; `test/db/export.db.test.ts` adds a pack row (not run here: no Docker). No `db:types` change.
- **Domain.** `exportSubjectSchema` is now `case | client_intro`; a case payload still takes exactly one `case` part (`casePartSchema`). A pack payload adds `subject: { kind: "client", id }` with 1–200 parts, single format or bundle. `packHashInput` (`export.pack.v1`) covers the client's id, code and name, then every part as `contentHashInput` takes it (shared `partRows`, so a case's hash text is byte-identical), the format and `EXPORT_RENDER_VERSION`. File names reuse `exportFileName` / `bundleFileName` with the client's code and name.
- **Compose.** `composeParts(..., { pack: true })`: a client's intro part is used with one case or more; without an intro part every case stays whole; an intro with no case gives nothing. Default and `clientFile` unchanged.
- **Source.** `readPackParts` (client, `listClientCasesInOrder`, each case's and the intro's `getLiveRevision`; a listed case with no live revision, deleted or another client's is left out; none left is `NOT_APPROVED`). `readPackSources` adds each case's values (as a case export) and the intro part (the client's values, no case values), and per format an `ExportDrawing` with its page count from `composeParts`. The handler now draws `ExportDrawing`s (a case is `drawingOfCase`), so single-case exports go through the same code with one part.
- **Status.** `packStatus` re-reads the pack's parts and hands a file out only when its stored parts equal the current ones (`EXPORT_STALE` otherwise; `NOT_FOUND` when none of its subjects are this client's). Jobs are enqueued and looked up with the client id as subject; `caseIdOf` is null for a pack.
- **Activity.** `client_event` needs an intro id, so a pack download records the existing `export` case event on each case in the pack (`data { exportId, format, clientId }`, the case's own approved revision).
- **Access.** `clients/export-actions.ts` authorizes `list clients` and `export` (approved), so owner/designer and admin only; account/sales/social get 403 until 5.9b.
- **UI.** `ClientPackButton` (Clienti card and client page) wraps `DownloadButton` with `clientDownload`; the dialog's new `note` shows `download.packIntroNote` when the intro has no approved revision (`ClientRow.introApproved`, read per card with Scarica on the Clienti page), and the description drops "Intro e" then.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | `packStatus` hands out a stored file without comparing hashes: stale after a client or field edit, and a case's own export can pass as the pack (blind, edge) | high | `makePackStatus` checks `sameParts` only; a one-case pack without an approved intro has the same parts as the case's own export | patch |
| 2 | Assets collected from pages the pack drops can fail the job (edge, blind) | medium | `mediaAssets` uses `pagesIn(part, format)` before composing | patch |
| 3 | A case deleted or unapproved between listing and reading fails the whole pack (edge) | medium | `readPackParts` returns the `getLiveRevision` error | patch |
| 4 | A failed event write fails a ready delivery (blind, edge) | low | `deliverPack` returns the `recordEvent` error | patch |
| 5 | One failed intro read throws the Clienti page (blind) | low | `clients/page.tsx` throws on `getClientIntro` error | patch |
| 6 | Incomplete refusal mapping; JSDoc contradicts the poll code (blind) | low | `packRefusalFor` covers two codes | patch |
| 7 | Dialog note not announced (blind) | low | No `aria-describedby` on the note | patch |
| 8 | Untyped business-line lookup (blind) | low | `line as BusinessLine` | patch |
| 9 | Per-case values, Carosello closing, `CLIENT_NOT_FOUND`, page-level intro note untested; bad test default (gap, blind) | medium | Identical fixture cases; Chiusura fixture missing; no test for the permanent code; pages mock `ok(null)` | patch |
| 10 | Duplicate export events on every delivery or poll (blind, edge) | low | Same pattern as the single-case `deliver` (5.3) | reject |
| 11 | Size limit checked late; serial reads; unbounded media listing (blind, edge) | low | A client has a handful of cases, far from 200 | reject |
| 12 | Missing-format refusal doesn't name the part (blind) | low | Rare; the dialog already says a part lacks the format | reject |
| 13 | Failed pack reason not shown or logged per client (blind) | low | Pressing Scarica again rebuilds; job failures are logged | reject |
| 14 | Approved intro with no intro/outro-role pages (edge) | low | The client template always has both roles | reject |
| 15 | Media links fetched but unused (blind) | low | Same root as #2; fixed there | patch |

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass.
- `npm run build` -- expected: pass.
