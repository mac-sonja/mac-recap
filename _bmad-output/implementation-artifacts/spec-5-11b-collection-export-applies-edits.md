---
title: 'Story 5.11b: collection exports apply the collection edits'
type: 'feature'
created: '2026-11-11'
status: 'in-progress'
baseline_commit: '0e14400e2b730d95a129ab6f55c045caaaebe278'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-10b-collection-export.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-11a-collection-edits.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 5.11a lets a collection change free texts, hide pages and reorder pages, but **Esporta** (5.10b) still builds the file from the untouched approved pages. The downloaded file doesn't match what the collection page shows.

**Approach:** When the server builds a collection export, it applies the collection's stored edits to a copy of each part's approved document for that format, before composing. It uses the same rules the collection page uses, from one shared function. The collection's content hash includes the edits that take effect, so a changed edit gives a new export and makes a running job stop with `EXPORT_STALE`.

## Boundaries & Constraints

**Owner decisions (2026-11-11):** this is part 2 of B7; part 1 (5.11a, merged #163) stores and shows the edits.

**Always:**
- **Same result as the page:** the export's pages, order and texts for a format equal what the collection page shows in that format (without the hidden-page strips):
  - text overrides on free `text` elements only (including inside groups and rows); edits whose element is no longer a free text are ignored;
  - an edit whose original changed still uses the collection's text;
  - saved page order first, then any page not in it, in the document's order;
  - hidden pages left out, except the "never zero pages" rule: when every page a part would show is hidden, its hides are ignored.
- **One implementation:** the apply rules move into one pure, browser-safe function in the rendering module's public index, used both by the collection page (`collection-file.ts`) and by the export. The page's behaviour stays the same.
- **Intro parts:** a client intro's edits are keyed by the client id; match them to the group's client.
- **Hash:** bump the collection hash input version and add, per part, the edits that take effect in that format (canonical, sorted). The same edits give the stored export; any change gives a new one. Single-case and client-pack hashes and output are unchanged.
- **Stale:** a job whose collection edits changed since the request refuses with `EXPORT_STALE`; the status check reports the old file as stale.
- **Originals:** the export never writes revisions, cases, clients or intros (it only reads).

**Never:**
- A new migration or table.
- Changing single-case, client-pack or configurator exports.
- Edits in Video (after the demo), new UI controls, or showing strips in the export.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Text | Title of case A edited in Presentazione | PDF shows the edited title; Carosello unchanged | — |
| Hidden | Page 2 of case A hidden in Carosello | PNGs leave it out; numbering runs on | — |
| Order | Case A pages reordered | Export follows the saved order | — |
| Intro | Client intro page hidden, 2+ cases | Intro page left out of the file | — |
| All hidden | Every shown page of a part hidden (e.g. after a new revision) | Part's pages exported as if none hidden | — |
| Original changed | Case updated after edit | Export keeps the collection's text | — |
| Again | No edit change | Stored export, no new job | — |
| Edited | Any edit saved after the export | New export; old status `EXPORT_STALE` | — |
| Running | Edit saved while job runs | Job refuses | `EXPORT_STALE` |
| No edits | Collection with no edits | Same pages as before 5.11b (hash version changes) | — |

</frozen-after-approval>

## Code Map

- `src/app/(wizard)/collections/[collectionId]/_components/collection-file.ts`: today's apply helpers (`isFreeText`/`freeTextIn` 142-162, `withWords` 170, `orderedPages` 199, `hiddenOf` 209, `docOf` 213, the zero-pages fallback in `collectionSegments` 286-296), keyed by `ViewEdits` (`case:<id>` / `client_intro:<clientId>`, from `viewEditsOf` in `collection-data.ts`). Move the pure rules out; keep the page's `WeakMap` caching and strips here.
- `src/modules/rendering/index.ts` (browser-safe): export the new pure function, e.g. `applyCollectionEdits` in a new `src/modules/rendering/collection-edits.ts`. Rendering already owns `composeParts`; the page already imports from rendering. The zero-pages rule depends on what `composeParts` shows: decide hides after knowing the shown pages (compose, or reuse the wrapping rule).
- Not in the collection module: collection domain may only import `@/shared` and zod (`eslint.config.mjs:90-93`), and collection must not import rendering (rendering imports collection; avoid a cycle). `shownPageKeys` (`collection/domain/edits.ts:149`) stays for the server's `canHide`.
- `src/modules/collection/index.ts:162` `getCollectionEdits(collectionId)` → `{ textEdits, hiddenPages, pageOrders }` (`application/edits.ts:42-57`), already skips gone parts.
- `src/modules/rendering/adapters/collection/read-collection.ts`: add `readCollectionEdits` mapping to a rendering-owned type. Wire it in `src/modules/rendering/server.ts:47-51` and `worker.ts:31`.
- `src/modules/rendering/application/export-source.ts`: `CollectionSourceDeps` (370) gets the edits dep; `readCollectionParts` (407) reads them; `readCollectionSources` (475) applies them per format before `composeParts` (532), e.g. by giving each `DrawPart` (144) an edited doc so `composePartOf` (354), `pageCount` and the handler's `composeParts` (`export-handler.ts:154`, `:247`) all pick it up.
- `src/modules/rendering/domain/export.ts:289` `collectionHashInput`: `export.collection.v2` plus the per-part effective edits. `partRows` (245) and case/pack inputs stay unchanged.
- `request-export.ts` (`makeRequestCollection` 452, `makeCollectionStatus` 497) and `export-handler.ts` collection branch (361-368): no logic change beyond deps; stale already follows the hash.
- Esporta button (`collection-export-button.tsx`): no change.

## Tasks & Acceptance

**Execution:**
- [x] `src/modules/rendering/collection-edits.ts` + `index.ts` -- the shared pure apply function (+ unit tests for every matrix rule) -- one rule set for page and export.
- [x] `collection-file.ts` (+ existing tests) -- use the shared function; page behaviour unchanged.
- [x] `rendering` adapter, `export-source.ts`, `domain/export.ts`, `server.ts`, `worker.ts` (+ unit tests) -- read, apply, hash.
- [x] `test/` -- a handler/source test proving edited text, hidden page, order and intro hide reach the composed pages, and stale on edit change.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.11 to `review` (5.11a and 5.11b built).

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given single-case and client-pack exports, when requested, then their hashes and output are unchanged.
- Given the 5.11a collection page tests, when they run, then they pass unchanged.

## Implementation Notes

- **Shared rules.** `rendering/collection-edits.ts` (exported from `index.ts`): `applyCollectionEdits(parts, formatId, edits, { wordPage?, compose? })` returns the parts ordered and worded (hidden pages in) and composed (the page's layout, with strips), the effective hidden keys per part (only pages the file would show; none when that would be all of them), the parts without hidden pages and their composed file (the export), and `effective`: per part, the words on shown pages that differ from the page's, the hidden pages that take effect, and the shown order when it differs from the document's. Part keys compare with the id lower-cased; a client intro is `client_intro:{clientId}`. `freeTextIn`, `orderedPages`, `pageTextEdits`, `wordedPage` moved here too; `collection-file.ts` re-exports them, keeps its `WeakMap` caches (passed as `wordPage`) and strips, and its zero-pages fallback now comes from the shared function.
- **Export.** `readCollectionEdits` (adapter, `collection.getCollectionEdits` → `CollectionEditSet`), wired in `server.ts` and `worker.ts` as `getCollectionEdits`; read with the collection in `readCollectionParts`. `readCollectionSources` applies them per format; each `DrawPart` carries the edited copy as `doc`, which `composePartOf` prefers, so `pageCount`, media and the handler's `exportHtml` all draw it. Case and pack parts have no `doc`: unchanged.
- **Hash.** `collectionHashInput` is `export.collection.v2` with a trailing list of the effective edits (sorted by part key; words sorted by page and element; hidden sorted; order or null). Case, bundle and pack inputs unchanged. Stale follows the hash in the handler and the status check.
- **Tests.** `collection-edits.test.ts` (every matrix rule), `export.test.ts` (v2 and edit hashing), `test/collection-export-edits.test.ts` (text, hide, order, intro hide reach the drawn pages; Carosello untouched; all-hidden; stored again; stale on edit; running job refused). `test/permissions.test.ts` stubs `getCollectionEdits` for the 5.10b guardrail.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass.
- `npm run build` -- expected: pass.
