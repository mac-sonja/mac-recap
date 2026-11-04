# Epic 4 Context: Review, edit and approve a case study

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer works the To review queue, opens each draft in the configurator, refines every format's own pages (texts, elements, blocks, layouts, backgrounds, media, pages) with autosave, and approves once nothing overflows and all referenced material is present. Later edits to an approved case are staged on a working copy and go live only through **Update approved version**. The same frame then edits and approves the client's own intro and closing pages, and opens the client's whole file (client intro, its cases' pages, client closing). This is what turns a generated draft into something a person has reviewed and that exports, packs and collections can trust. The clickable mockup `ux-designs/ux-MAC Recap-2026-10-08/mockups/configurator.html` is the UX source of truth; where older text disagrees, the mockup wins. As of 2026-11-04, 4.1, 4.2, 4.4, 4.8 and 4.13 are done, 4.3 and 4.9 are merged and in review, and 4.5 lacks only the Animazione dialog's own upload (4.5c-3). What remains for the demo is 4.11 then 4.12, both waiting on the client intro/outro draft with test text (Story 3.11), which is blocked on the owner's client cover/outro template design.

## Stories

- Story 4.1: Review dashboard and To review queue
- Story 4.2: Open a draft in the configurator
- Story 4.3: Edit pages in place: texts, elements and blocks, with autosave
- Story 4.4: Adjust the layout per format
- Story 4.5: Replace, reorder and remove media
- Story 4.6: Choose typography per format (folded into 4.3; nothing to build)
- Story 4.7: Check every block against the material (not for the demo; needs rewriting for document v2)
- Story 4.8: Approve a case study
- Story 4.9: Edit an approved case and update the approved version
- Story 4.10: Template maintenance (conditional, not scheduled)
- Story 4.11: Client intro and outro in the configurator
- Story 4.12: Client overview configurator
- Story 4.13: Pages: add, delete, reorder, sections

## Requirements & Constraints

- **Three independent formats:** Presentazione 16:9, Carosello 1:1, Video 9:16. Each owns its pages, blocks, texts and backgrounds; every edit applies only to the format in view.
- **Preview equals export:** canvas, thumbnails and Anteprima all draw with the shared per-format renderer; never a second layout implementation.
- **Templates bound the design:** layouts are the format's coded grids; services, logos and the divider come only from templates. No font picker, text scale, per-word styling, recolour, filter or effect, and no animated page layouts. Media fit is Riempi, Adatta or Ritaglia (drag inside the block plus zoom slider).
- **Limits:** at most 6 blocks per page; a resize that overflows a text or shrinks a row/column below 12% is refused; a layout with fewer cells removes only empty blocks; default pages restore template pages and never add one.
- **Free deletion, full undo:** blocks and pages (Sfida, Idea, Risultati included) delete freely and come back with ⌘Z or **Pagine di default**. Undo/redo saves like any edit.
- **Media guardrail:** a server write may reference only non-deleted assets of this case or its client. Removing media from a page never touches the asset; deleting a referenced file only soft-deletes it. Upload (20 files, 50 MB each, allowlisted types) and favourites never change status.
- **Bound fields:** client name, sector (free text), logo (by upload), case year and services are edited on the page and written through the client's or case's own update use case; the document stores only the binding.
- **Approval:** needs an overflow-free result for every format of that revision version, measured in the browser with the shared renderer and sent with the call, plus no deleted referenced material. Errors: `OVERFLOW_NOT_CLEARED`, `MATERIAL_MISSING`, `STALE_REVISION`, `STALE_HEAD`. No per-block check, no bulk or auto approve (a guardrail test proves it). Any owner/designer can approve. `MISSING_ASPECT` is a non-blocking canvas message.
- **Lifecycle:** Bozza → In elaborazione → Da approvare → Approvato; Approvato is terminal. Saves are rejected while `generating`. Opening a Bozza or In elaborazione case in the configurator returns to the table.
- **Client intro:** one per client; an intro that isn't approved is never included in a client pack or collection. Intro and closing use the client's first 3 images (favourites first); the closing uses the Risultati e testimonial template, plus the client's own Chiusura in Carosello.

## Technical Decisions

- **Reads by subject:** the configurator reads `getEditableRevision(subject)`, where subject is a case or a `client_intro`; live surfaces use `getLiveRevision`. Nothing in the frame may assume a case beyond the top-bar data.
- **Document v2:** one page list per format; pages have a stable `pageKey`, name, role, section (intro | output | risultati), background, bento grid with track sizes and ordered blocks of ordered elements. Edits write `doc` only; `generated_doc` is immutable; edited AI text gets `provenance: human_edited`, new text `human_added`.
- **Autosave (compare-and-set):** writes carry the expected `revision.version`, go one at a time, and record an event. Network errors retry ("Not saved. Retrying…", banner after 3 failures); `STALE_REVISION`, `STALE_HEAD`, `REVISION_NOT_WRITABLE` reload without retry. Only `working` revisions are writable. A multi-document session (client file) does one compare-and-set per document and reloads only the stale part. All later stories save through the 4.3 path.
- **Approve / edit after approval:** `approve(subjectId, revisionId, expectedRevisionVersion, expectedHeadVersion)` checks material, then in one transaction approves the revision, sets `approved_revision_id`, transitions status and records an event. The first edit on an approved subject calls the idempotent `forkHead`; **Update approved version** runs the same approve and supersedes the old revision; **Discard changes** supersedes the head. Client intros reuse this model (`transitionIntro`).
- **Client file:** built with the existing `rendering.composeParts` / `renderComposed`: client intro, each case's pages without its own intro pages and its Carosello Chiusura (recognised today by `pageKey === "closing"`), Risultati e testimonial kept, then the client closing. It references case pages, never copies them; each case part saves to its own editable revision. The case order belongs to the client, defaults to newest first, and its storage is decided in 4.12; packs (5.9) follow it.
- **Layouts and default pages** come only from the template version's grid-listing and default-page functions; no template values in the DB.
- **Conventions:** `access.getActor()` + `authorize()` on every action; use cases return `Result<T, AppError>` with SCREAMING_SNAKE codes; every mutation emits `case_event` or `client_event`; Italian copy from the dictionary (add strings only in your feature's section); cross-module imports via `index.ts`; forward-only migrations, applied to mac-recap-dev only after green CI and owner agreement, then `npm run db:types`. New configurator actions need rows in `test/permissions.test.ts`.

## UX & Interaction Patterns

- **Frame:** full-screen, no sidebar. Top bar: back, name, code, badge | format switch, Anteprima eye | save state, undo, redo, **Approva**. Left panel (312 px): selection settings, then Layout, Pagine di default, Elementi, Sfondo, Elimina pagina, theme switch. Right panel (224 px): Pagine and Media tabs, **Cerca**, grid/list. Panels hide and reopen from the canvas edge with focus moved. Below 1024 px: "The configurator needs a larger screen."
- **Canvas:** pages stacked as "{n} · {page name}" under Intro, Output, Risultati. Click frames a block ("⠿ Sposta"); double click or Enter edits text; Esc steps out. Messages at the top of the canvas with `role="status"`. No keyboard alternative to dragging for now.
- **Client mode:** Pagine shows **Introduzione** thumbnails, **Progetti del cliente** (one row per case: thumbnail, name, "{code} · {n} pagine"; click scrolls, drag reorders in every format), then **Chiusura**. Case groups on the canvas are labelled "{code} · {name}"; Bozza/In elaborazione cases appear greyed without pages; an approved case's forked part shows "Modifiche non ancora pubblicate". Media tab shows "Del cliente" and "Dalle sue case"; the drop zone reads "Finiscono nei Media di questo cliente."
- **Confirm dialogs** only for Approve, Update approved version, Delete (Bozza) and deleting a page shared between a case and the client file ("Eliminare la pagina?" with the case or client named, "Puoi annullare con ⌘Z."). Everything else is undoable.
- **Approva disabled** names the overflowing page and format or the missing file via `aria-describedby`; after approval, toast "Approved. It's now in the library." and go to To review if cases wait, else Case studies.

## Cross-Story Dependencies

- **Blocking path:** 3.11 (client intro/outro draft with test text, `client_intro` and `client_event` migration) → 4.11 → 4.12 → Epic 5's client pack (5.9) and collections (5.10, 5.11). 3.11 waits on the owner's client cover/outro template design; 3.9 later swaps the test text for AI text.
- **4.11** opens the client's file (4.12's frame) from the client page or the ready toast after **Aggiungi**, and closes its approved-intro editing through 4.9's model. **4.12** replaces the inactive **Modifica layout** ("Arriva con il configuratore") and owns the case-order storage; the 4.13 shared-page delete confirmation was left for it.
- **4.5c-3** (Animazione dialog upload through a shared upload hook from the Media tab) is independent UI work still open.
- **Collection mode (5.10–5.11):** collections open this configurator; account/sales/social users may only reorder and remove pages, add or remove cases and edit texts; no left panel, no Media tab, no block/element delete, and other actions fail with `FORBIDDEN`. Keep editing gestures behind one capability flag.
- **After the demo:** share links (5.5–5.7) and so 4.9's live-link count; the per-block check (4.7).
