---
title: 'Story 5.11a: edit texts, hide and reorder pages in a collection'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '57bb89202140971a40243ab958df76c45d65481e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-10a-collections.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A collection (5.10) shows each case's approved pages as they are. Whoever prepares a pitch can't adjust the wording, drop a page or change the page order for that collection without changing the original cases.

**Approach:** The collection page gains three edits, all stored in the collection only:
- Double-click a text to change it.
- **Elimina dalla raccolta** hides a page, and **Ripristina** brings it back.
- Pages within a part can be reordered.

The original case histories, client intros and client records are never written. Every role that manages collections can do this (IR-COLL-EDIT; owner 2026-10-28). No approval is needed.

## Boundaries & Constraints

**Owner decisions (2026-11-11):**
- **Base:** the existing collection page (5.10a), not the editing Configurator. There are no layout, media, typography or section tools, for anyone.
- **Split:** this is part 1. Part 2 (5.11b, deferred) makes exports apply the edits.
- **Free text only:** approved with the spec: only free text elements are editable; bound client/case field texts stay as they are.

**Always:**
- **Storage:**
  - A forward migration adds three tables, owned by the `collection` module and following 5.10a's pattern (RLS on, revoked from anon and authenticated, writes only through `security definer` functions executable by `service_role`):
    - `collection_text_edit`: collection, part, format, page key, element id, new text, and the hash of the original text.
    - `collection_hidden_page`: collection, part, format, page key.
    - `collection_page_order`: collection, part, format, page keys in order.
  - Here a part is a case or a client intro.
  - Writes compare-and-set on `collection.version` (`STALE_COLLECTION`) and log a `collection_event`.
- **What can be edited:** only free text elements (`text`). Bound texts (client or case fields), images, logos and the "About the client" block can't be edited here, and double-clicking them does nothing.
- **Editing a text:**
  - Double-click opens the text in place; leaving the text (blur) or Enter on a single line saves it.
  - The block then shows "Modificato in questa raccolta", with **Ripristina testo originale** to remove the edit.
  - Text length follows the document's text limit.
- **Original changed:** if the original text's hash no longer matches (the case or intro was updated since), the collection keeps its text and the block shows "Il testo originale è cambiato" with **Vedi originale** (shows it) and **Usa originale** (removes the edit).
- **Hiding a page:**
  - **Elimina dalla raccolta** in a page's menu in **Pagine** hides that page in that format. Client intro and outro pages can be hidden too.
  - A hidden page leaves the preview, and a collapsed strip in its place offers **Ripristina**.
  - A part can't hide its last page. The refusal says "Una parte tiene almeno una pagina."
- **Reordering pages:**
  - Pages move within their part, by drag or "Sposta su / giù" in **Pagine**.
  - The order is saved for that part and format, and on failure the previous order comes back with "Ordine non salvato. Riprova."
  - Adding new pages isn't possible.
- **Never writes originals:** no revision, client or client intro row is written by any of these actions. A test proves it.
- **Everyone:** every role may do all of this, admin included (5.10a decision). Collection actions other than these and 5.10's stay `FORBIDDEN` here.

**Never:**
- Applying the edits to exports (5.11b).
- Layout, media, background or style tools.
- Adding blocks, elements or pages.
- Deleting blocks or elements.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Edit | Double-click a case's title text, type, blur | Saved in the collection; "Modificato in questa raccolta"; case revision unchanged | stale → refresh + message |
| Restore | **Ripristina testo originale** | Original text back; edit row gone | — |
| Bound | Double-click client name | Nothing happens | — |
| Original changed | Case updated after the edit | Collection text kept; "Il testo originale è cambiato"; Usa originale removes edit | — |
| Hide | Elimina dalla raccolta on a page | Page leaves preview; strip with Ripristina | last page → refused |
| Restore page | Ripristina on the strip | Page back in place | — |
| Reorder | Sposta giù on page 1 of a case | Order saved for that case and format | failure → restored |
| Intro page | Hide a client intro page | Hidden like any other | — |
| Any role | Account user, admin | Allowed | — |
| Originals | Any of the above | No revision / client / intro row written | — |

</frozen-after-approval>

## Code Map

- `src/app/(wizard)/collections/[collectionId]/_components/collection-view.tsx`, `collection-pagine.tsx`, `collection-file.ts`: the 5.10a page, with its read-only canvas, Pagine groups and moves. Add the edit layer here:
  - overrides applied to each part's pages before composing;
  - double-click on text elements;
  - page menu items, hidden strips and page moves within a part.
- `src/app/(wizard)/collections/[collectionId]/collection-data.ts`, `page.tsx`, `actions.ts`: load the overrides with the collection, and add the actions (authorize `manage collections`).
- `src/modules/collection/` (domain, ports, adapters, application, index): the new use cases and repository functions. Hash the original text the same way on save and on check.
- `supabase/migrations/20261110160000_collection.sql`: the 5.10a pattern to follow for the new migration (`20261111120000_collection_edits.sql`).
- `src/modules/generation/domain/document.ts` L139–160: text element shape (`elementId`, `text` vs `binding`/`bindings`), `MAX_TEXT_CHARS` L55.
- Canvas reuse: the configurator `canvas.tsx` already used read-only by 5.10a. For in-place text editing, look at the 4.3a text-session code in `configurator.tsx` for the contenteditable pattern; don't import the editing Configurator.
- `test/permissions.test.ts`, `test/authorize-guard.test.ts`: the new actions.

## Tasks & Acceptance

**Execution:**
- [x] Migration, then `npm run db:types`.
- [x] `src/modules/collection/**` (+ unit and db tests, including "no revision / client / intro row written").
- [x] Collection page: text editing and markers, hide and restore, page reorder (+ tests).
- [x] `src/shared/i18n/it.ts`, `test/permissions.test.ts`.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml`: 5.11 stays `in-progress` with a note that 5.11a is in review.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given the 5.10a/b collection tests and the configurator tests, when they run, then they pass unchanged, apart from the new edit layer.

## Implementation Notes

- **Data.** `20261111120000_collection_edits.sql`: `collection_text_edit`, `collection_hidden_page`, `collection_page_order`, keyed by collection, `part_kind` (`case` | `client_intro`), `part_id` (the case, or the client for its intro document), format and page key. Writers (service role only, CAS on `collection.version`, one event each): `set_collection_text_edit`, `delete_collection_text_edit`, `set_collection_page_hidden`, `set_collection_page_order`; the part must be a case of the collection or the client of one (`INVALID_INPUT` detail `part`).
- **Module.** `application/edits.ts`: the original's sha256 is worked out from the part's live approved revision on save and on every read (`textHash`); typing the original's words removes the edit. `COLLECTION_LAST_PAGE` (a part keeps one page of its document in the format) and `TEXT_NOT_EDITABLE` (409). `getCollectionEdits` drops edits whose text is no longer a free text and flags `originalChanged`.
- **UI.** Overrides are laid over each part's pages before `composeParts` (hidden pages composed in, then shown as strips). Canvas gained optional `onResize` (no handles without it), `pageExtras` and `CanvasGroup.before/after`. Pagine: a "Pagine di {name}" toggle under each case, intro and closing row lists its pages (move by drag, Alt+↑/↓ or menu; **Elimina dalla raccolta** / **Ripristina**). Edits share the moves' write queue; a failure restores both order and edits. Anteprima stays read-only.
- **Review fixes (2026-11-11).**
  - Reads never fail for a part that is gone: `getCollectionEdits` skips rows of parts not in the collection, and a case or client that is gone (`NOT_FOUND`, `CLIENT_NOT_FOUND`) counts as unavailable.
  - A deferred constraint trigger on `collection_item` (`collection_item_drop_edits`) drops a removed case's edits, plus its client intro's once no case of that client is left. Moves that rewrite the items keep them.
  - `delete_collection_text_edit` with no row writes nothing (no version bump, no event).
  - Text is normalised (NBSP becomes a space, trailing whitespace is trimmed), blank text is refused, and length is counted in UTF-16 units. Saving an edit whose original changed refreshes its hash, even with the same words.
  - `COLLECTION_LAST_PAGE` counts only the pages the file shows (a wrapped case leaves out its own intro pages; an intro shows only its intro and closing pages). `shownPageKeys` mirrors `composeParts` and is tested against it. The page also never draws a part with zero pages.
  - The page saves an open text before a format or Anteprima switch, and re-reads after `INVALID_INPUT` / `TEXT_NOT_EDITABLE` / `COLLECTION_LAST_PAGE` on an edit. The Enter key is handled on the canvas wrapper.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Page crashes when a stored edit's case or client was deleted / removed (edge) | high | `edits()` passes `NOT_FOUND` from `getLiveRevision` up; `page.tsx` throws | patch |
| 2 | Edits of a removed case stay and come back when it is re-added (blind, edge) | medium | No cleanup on `collection_item` delete | patch |
| 3 | Revision changed under an open page: order/text writes fail with no refresh (blind, edge) | medium | Only `STALE_COLLECTION` refreshes; `INVALID_INPUT` / `TEXT_NOT_EDITABLE` show "orderFailed" forever | patch |
| 4 | Format switch or Anteprima drops typed text (blind) | medium | `setEditing(null)` without `finishEdit` | patch |
| 5 | A part can end up with no pages shown (wrapping drops pages, new revision removes the one left) (blind, edge) | medium | Server `canHide` and client guard count differently; no re-check at read | patch |
| 6 | "Original changed" can't be cleared while keeping the words (edge) | medium | Early return when text equals shown | patch |
| 7 | Character count by code point vs schema's UTF-16 (audit, edge) | low | `[...text].length` vs zod `.max` | patch |
| 8 | Empty / whitespace text saved; NBSP and trailing whitespace make spurious edits (edge) | low | No trim or normalisation | patch |
| 9 | `restoreText` logs and bumps with nothing to restore (blind) | low | `delete_collection_text_edit` always bumps | patch |
| 10 | Enter listener read from `canvasRef` once at mount (blind) | low | `useEffect([])` | patch |
| 11 | Intro half of "no originals written" is vacuous; no real-DB intro edit; no Anteprima read-only test (audit, blind) | low | Test creates no client intro | patch |
| 12 | Exports ignore the edits (blind, edge) | false | 5.11b by owner decision | reject |
| 13 | New page after a saved order goes at the end of the part (edge) | low | Order of the rest kept; demo scale | defer |
| 14 | Intro-part hides unused once a client drops to one case (edge) | low | Follows the 2+ rule; rows kept for when it wraps again | reject |
| 15 | Version and edits read in separate SELECTs (edge) | low | CAS turns it into a refresh | reject |
| 16 | Last-page rule only in the module, not SQL (audit) | low | Writers service-role only; CAS covers races | reject |

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test`: expected to pass.
- `npm run test:db`: expected to pass.
- `npm run build`: expected to pass.
