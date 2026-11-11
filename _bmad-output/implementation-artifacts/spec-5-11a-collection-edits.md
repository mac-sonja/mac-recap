---
title: 'Story 5.11a: edit texts, hide and reorder pages in a collection'
type: 'feature'
created: '2026-11-11'
status: 'draft'
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
- [ ] Migration, then `npm run db:types`.
- [ ] `src/modules/collection/**` (+ unit and db tests, including "no revision / client / intro row written").
- [ ] Collection page: text editing and markers, hide and restore, page reorder (+ tests).
- [ ] `src/shared/i18n/it.ts`, `test/permissions.test.ts`.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml`: 5.11 stays `in-progress` with a note that 5.11a is in review.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given the 5.10a/b collection tests and the configurator tests, when they run, then they pass unchanged, apart from the new edit layer.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test`: expected to pass.
- `npm run test:db`: expected to pass.
- `npm run build`: expected to pass.
