---
title: 'Story 5.10b: export a collection'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: 'dd92f7641adecd8d4563407fced5b52f8d754130'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-9a-client-pack-download.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-10a-collections.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A collection (5.10a) can be built and arranged but not downloaded, so it can't be sent to anyone.

**Approach:** Add one **Esporta** button to the collection page. It opens the same export dialog as a case or a client pack. For each ticked format the server builds the collection's parts in the collection's order and exports them through the 5.9a pack pipeline with a collection subject. Several formats come as one ZIP, and exporting the same inputs again returns the stored file.

## Boundaries & Constraints

**Owner decisions (2026-11-10, from 5.10a):**
- **Client intro:** a client's approved intro and closing wrap its cases only when 2 or more of them are in the collection (`composeParts` default mode, not the pack option).
- **Who:** every role can export, admin included, under `manage collections`.

**Always:**
- **Parts, per format:**
  - For each client group in collection order: if the group has 2 or more available cases and the client's intro is approved, the intro part, then the group's cases. Otherwise just the group's cases, each with all its own pages.
  - **Approved revisions only** (`getLiveRevision`). A "Non disponibile" case (no approved revision, or deleted) is left out.
  - **No available case** → `NOT_APPROVED`, and the page shows no **Esporta**.
  - Page numbers run on through the whole file.
- **Pipeline:** widen 5.9a rather than duplicate it.
  - **Subject:** the export subject can be a collection.
  - **Hash:** the content hash covers the collection's id and name, then every part's subject, approved revision and bound values, then the format. The same inputs give the stored export. Any change (an approved revision, the order, the items, the name, client fields) gives a new one.
  - **Status:** the status check compares content hashes, as 5.9a's does, and never hands out a client pack or single-case file as a collection.
  - **Worker:** it re-reads the collection and refuses with `EXPORT_STALE` when it changed.
  - **Files:** file names are made from the collection's name. Several formats come as one ZIP.
- **Dialog:**
  - The same `DownloadButton`, polling and ZIP behaviour as the pack.
  - When cases are left out because they are "Non disponibile", the dialog says so: "{n} case non disponibili non saranno incluse."
- **Events:** each delivery records an event in `collection_event` (`collection_exported`, with export id and format), following the pack's delivery pattern.

**Never:**
- Video (after the demo).
- Editing inside a collection (B7).
- Changing single-case or client-pack exports or their hashes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Mixed | Group A (2 cases, intro approved), group B (1 case), Presentazione | A intro, A1, A2 (own intros dropped), A closing, B1 whole | — |
| Intro not approved | Group A 2 cases, intro Da approvare | A1, A2 whole, B1 whole | — |
| Unavailable | B1 lost approval | Left out; dialog note "1 case non disponibili…" | — |
| None left | Every case unavailable | No Esporta; direct call → `NOT_APPROVED` | `NOT_APPROVED` |
| Two formats | Presentazione + Carosello | One ZIP named after the collection | — |
| Again | Same inputs | Stored export, no new job | — |
| Changed | Collection reordered or renamed | New export; old status → `EXPORT_STALE` | — |
| Stale job | Collection changed after request | Job refuses | `EXPORT_STALE` |
| Any role | Admin / account user | Allowed | — |

</frozen-after-approval>

## Code Map

- `src/modules/rendering/domain/export.ts`: `clientSubjectSchema`, the pack payloads (L97–110) and `packHashInput` (L245). Add a collection subject and a hash input; leave single-case and client hashes unchanged.
- `src/modules/rendering/application/export-source.ts`:
  - `readPackParts` (L223) and `readPackSources` (L287) are the patterns.
  - Add `readCollectionParts`, which reads `collection.getCollection` (`src/modules/collection/index.ts` L58: groups and items) and then, per item, the case's `getLiveRevision`.
  - Build per-group intro parts with the 2+ rule, and compose with default mode.
- `src/modules/rendering/application/request-export.ts`: `makeRequestPack` (L303) and `makePackStatus` (L344). Add the collection request and status, comparing hashes as 5.9a does. `export-handler.ts`: the collection branch.
- `src/modules/rendering/server.ts` (`packSourceDeps` L35, `requestPack` L87, `packStatus` L97) and `worker.ts`: wire the collection reads through the collection module's index only.
- Collection page: `src/app/(wizard)/collections/[collectionId]/page.tsx`, `actions.ts`, `_components/collection-view.tsx`. Add the **Esporta** button in the top bar, mirroring `src/app/(tool)/clients/_components/client-pack-button.tsx` and `client-download.ts`.
- `collection_event` writes: the collection module's repository, plus an event writer if the 5.10a migration exposes none. A new migration only if needed, following the 5.10a writer pattern.
- `test/permissions.test.ts`: the new actions, and a collection guardrail (no non-approved revision, `getEditableRevision` never called).

## Tasks & Acceptance

**Execution:**
- [x] `src/modules/rendering/**` (+ unit tests): collection source, hash, payload, handler, request and status.
- [x] The event writer, plus a migration if needed; then `npm run db:types`.
- [x] Collection page **Esporta**, actions and download wiring (+ tests).
- [x] `src/shared/i18n/it.ts`, `test/permissions.test.ts`.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml`: 5.10 to `review` (5.10a and 5.10b both built).

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given single-case and client-pack exports, when requested, then their hashes and output are unchanged (existing tests pass as they are).

## Implementation Notes

- **Domain.** `collectionSubjectSchema` (`{ kind: "collection", id }`); the pack payload variants now take a client or a collection `subject` (single format or bundle), so client-pack payloads parse as before. `collectionHashInput` (`export.collection.v1`) covers the collection's id and name, then every part as `contentHashInput` takes it (shared `partRows`), the format and `EXPORT_RENDER_VERSION`; case, bundle and pack hash inputs are unchanged. Files are named with `recordFileName("", name, format)`: `Pitch moda – Presentazione.pdf`, `Pitch moda.zip`.
- **Source.** `readCollectionParts` reads `getCollection` (through `rendering/adapters/collection/read-collection.ts`, the collection module's index only), then per item `getCase` and `getLiveRevision`; a case with no live revision, deleted, or `NOT_FOUND` is left out and counted as `unavailable`; none left is `NOT_APPROVED`. Groups are per client in first-appearance order; a client's intro is read only for a group with 2+ available cases. `readCollectionSources` composes with `composeParts` default mode (not `pack`), so a one-case group keeps its own intro and closing.
- **Handler.** A `collection` subject goes through `readCollectionSources`, with `EXPORT_STALE` when its parts or hash changed since the request (rename, reorder, items, revision, client fields). Logos and client media are now read per distinct client of the parts (a case or pack has one, so its calls and output are unchanged). `COLLECTION_NOT_FOUND` is permanent. `caseIdOf` is null.
- **Request/status.** `makeRequestCollection` / `makeCollectionStatus` mirror the pack's: jobs are enqueued and looked up with the collection id as subject; status compares parts, then the current content hashes (`EXPORT_STALE`; `NOT_FOUND` for a file of none of its cases), so a case's own export or a client pack is never handed out as the collection.
- **Events.** New migration `20261110180000_collection_exported_event.sql`: `record_collection_exported(collection, actor, export, format)`, security definer, service role only, appends `collection_exported` (`data { exportId, format }`) at the current version without bumping it; `COLLECTION_NOT_FOUND` for a deleted collection. Exposed as `collection.recordCollectionExported`; each delivery (stored file or ready poll) records one, as the pack's delivery does. `db:types` regenerated (matches the hand edit).
- **Access.** `requestCollectionExport` / `getCollectionExportStatus` in the collection page's `actions.ts` authorize `manage collections` and `export` (approved), which every role holds, admin included.
- **UI.** `CollectionExportButton` (top bar, after **Modifica tag**) wraps `DownloadButton` with `collectionDownload`; `DownloadButton` gets an optional `actionLabel` (default **Scarica**) so the pill and confirm read **Esporta**. The page passes `exportCounts` (`available`/`unavailable` from the collection's items); no **Esporta** with none available; the dialog note "{n} case non disponibili non saranno incluse." when some are left out. The format in view is ticked when the dialog opens.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Per-client logo and media in a mixed collection untested (gap) | medium | Fakes return the same logo and media for every client | patch |
| 2 | Polls re-read the whole collection while the job runs, and once per format on ready; false stale possible (blind, edge) | medium | `makeCollectionStatus` reads before checking the job; `currentCollectionHashes` per format | patch |
| 3 | A collection edited during export ends with the generic failure (blind) | low | `onPoll` maps `EXPORT_STALE` to failed; edits happen on this page | patch |
| 4 | `EXPORT_TOO_LARGE` unmapped; a near-full collection with intros exceeds 200 parts (blind) | low | `collectionRefusalFor` lacks it | patch |
| 5 | A name of only unsafe characters gives blank file names (edge) | low | `recordFileName("", name)` with no code fallback | patch |
| 6 | Logo warning logs the wrong case (blind, edge) | low | `drawing.parts[0].caseId` | patch |
| 7 | Handler runs with unavailable case / unapproved intro, account-role allow, test titles (blind) | low | Not covered; titles name cases the fixtures don't have | patch |
| 8 | Another collection's identical export answers `EXPORT_STALE`, not `NOT_FOUND` (edge) | false | Every collection is visible to every role (owner decision); nothing is disclosed | reject |
| 9 | Page counts may disagree with the server's (blind) | low | Both drop cases with no approved revision; differ only in a race with a deletion | reject |
| 10 | Size checked after reading; unbounded or serial reads (blind) | low | Demo-scale collections | reject |
| 11 | `CollectionEntry.clientId` unused; request schemas not strict (blind) | low | Harmless; the schemas match the existing case and pack request schemas | reject |
| 12 | Server's unavailable count not returned with the ticket (blind) | low | The page count is read when the page opens | reject |
| 13 | Migration must reach the hosted project before deliveries work (blind) | false | Applied at merge, as with every migration so far | reject |

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test`: expected to pass.
- `npm run test:db`: expected to pass.
- `npm run build`: expected to pass.
