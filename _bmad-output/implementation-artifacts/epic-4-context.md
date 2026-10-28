# Epic 4 Context: Review, edit and approve a case study

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer works the To review queue, opens each draft in the configurator, refines every format's own pages (texts, elements, bento blocks, layouts, backgrounds, media, pages) with autosave, and approves. Approval for the demo needs only no overflow in any format and all referenced material present; there is no per-block check. Later edits to an approved case are staged on a working copy and go live only through **Update approved version**. The same frame edits and approves the client's own intro and closing pages, and opens the client's whole file, made of the client's intro, its cases' pages and its closing. The clickable mockup `ux-designs/ux-MAC Recap-2026-10-08/mockups/configurator.html`, built from the Figma file "MAC-TF-AI", is the UX source of truth. Where older text disagrees, the mockup and decisions C28–C40 win. Build order: 4.2 → 4.3 → 4.4 → 4.5 → 4.13 → 4.11 and 4.12 → 4.8, then Epic 3's 3.6/3.7. 4.1 comes after 3.10 and before 3.6.

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
- Story 4.10: Template maintenance (conditional, not scheduled; blocked on IR-C4)
- Story 4.11: Client intro and outro in the configurator
- Story 4.12: Client overview configurator
- Story 4.13: Pages: add, delete, reorder, sections

## Requirements & Constraints

- **Three formats, independent:** Presentazione 16:9 (1920×1080), Carosello 1:1 (1080×1080, Figma frame 1000) and Video 9:16 (1080×1920). Each format owns its pages, blocks, elements, texts and backgrounds. Every edit (text, layout, background, page, media) applies only to the format in view, and nothing cascades between formats.
- **Preview equals export:** the canvas, the thumbnails and Anteprima all draw with the shared per-format renderer (Story 3.5). There is no second layout implementation.
- **Templates bound the design:** the layouts are the format's coded grids. Services, logos and the divider come only from templates. There is no font picker, font upload, text scale, per-word styling, recolour, filter or effect control, and no animated page layouts. Media fit is Riempi, Adatta or Ritaglia. With Ritaglia, the person drags the image inside its block and zooms with a slider.
- **Limits:** a page has at most 6 blocks. A resize that would overflow a text, or shrink a row or column below 12% of the page, is refused. A layout with fewer cells removes only empty blocks; otherwise it refuses and says how many blocks are over. Default pages only restore lost template pages and never add a page.
- **Free deletion:** blocks and pages, including Sfida, Idea and Risultati, can be deleted freely and come back with ⌘Z or **Pagine di default**. Every edit is undoable, and an undo or redo saves like any edit.
- **Media guardrail:** a server write may reference only non-deleted assets of this case or of its client. Removing media from a page never touches the asset. Upload (Story 2.7 rules: 20 files, 50 MB each, allowlisted types) and favourites never change case status.
- **Bound fields are editable on the page:** client name, sector (free text) and logo (replaced by uploading a file), and the case's year and services, write back through the client's or case's own update use case, with its validation and permission. The change shows at once everywhere. The document stores only the binding, never the value.
- **Approval (demo):** **Approva** and **Update approved version** need an overflow-free result for every format of that revision version (measured client-side with the shared renderer and sent with the call) and no deleted referenced material. Errors: `OVERFLOW_NOT_CLEARED`, `MATERIAL_MISSING`, `STALE_REVISION`, `STALE_HEAD`. There is no `BLOCKS_UNCHECKED`, no "blocks still to check" counter and no Check tab. Any owner/designer can approve. There is no bulk approve, auto-approve or tick-all, and the guardrail test must prove this.
- **`MISSING_ASPECT`** shows as a non-blocking message at the top of the canvas.
- **Lifecycle:** Bozza → In elaborazione → Da approvare → Approvato. Approvato is terminal and has no path back. Delete is allowed only in Bozza, as a soft delete; any other status gets `CASE_NOT_DELETABLE`. Saves are rejected while a case is `generating`. Opening a Bozza or In elaborazione case in the configurator returns to the table.
- **Intros:** a client intro that isn't approved is never included in a client pack or collection.

## Technical Decisions

- **Reads:** the configurator reads only `getEditableRevision(subject)`, where the subject is a case or a `client_intro`. Live surfaces use `getLiveRevision`. The frame makes no case-only assumption beyond the top bar data.
- **Document v2** (`generation/domain` zod, `schemaVersion: 2`) has one page list per format. A page has a stable `pageKey`, name, `role`, section (intro | output | risultati), background, bento grid with its own track sizes, and at most 6 ordered blocks. A block has a `blockId`, a background and ordered elements: text with style, colour, alignment and columns; Testi group (top | centre | bottom | split); image or video (asset ref and fit); Animazione (type, asset refs, fit, size 50–150%); services; logos; divider. Defaults: page white, block `#EDEDF0`, text `#012234`. Edits write `doc` only. `generated_doc` is immutable. Changed AI text gets `provenance: human_edited`, and new text gets `human_added`.
- **Autosave (compare-and-set):** each write passes the expected `revision.version`. Writes go one at a time. The save state shows "Salvataggio…" then "Salvato". On a network error it shows "Not saved. Retrying…", and after 3 failures a banner appears. `STALE_REVISION`, `STALE_HEAD` or `REVISION_NOT_WRITABLE` → no retry: reload the revision. Only `working` revisions are writable, and saves never fork. Every save records an event. A session with several documents (the client file) does one compare-and-set per document and reloads only the stale part.
- **Approve:** `approve(caseId, revisionId, expectedRevisionVersion, expectedHeadVersion)` checks the material on the server and, in one transaction, sets the revision to `approved`, sets `approved_revision_id`, transitions the case and records an approval event with the actor. The server does not re-measure overflow.
- **Edit after approval:** the first edit calls the idempotent `case-study.forkHead(caseId, expectedHeadVersion)`, which copies from `approved_revision_id`. **Update approved version** runs the same `approve` on the head, and the previous approved revision becomes `superseded`. **Discard changes** supersedes the head and points `head_revision_id` back. Both are shown only while the head differs from the approved revision. Intros use the same model through `transitionIntro`.
- **Layouts and default pages** come only from the template version's single grid-listing function and default-page definitions (Story 3.4). There are no template values in the DB. The `template_variant_state` on/off table exists only if 4.10 is adopted.
- **Client file:** it references the cases' pages and never copies them. Each case part is read from that case's editable revision and saved to it with that revision's version. The case's own intro pages and its Carosello Chiusura are left out, and its Risultati e testimonial pages stay. The case order belongs to the client and defaults to newest first. Where the order is stored is decided in 4.12, and the client pack follows it.
- **Conventions:** call `access.getActor()` and `authorize()` on every action. Use cases return `Result<T, AppError>` with SCREAMING_SNAKE codes. Every mutation emits an event (`case_event` or `client_event`). Italian copy comes from the dictionary. Cross-module imports go only through `index.ts`. Migrations are forward-only and reach mac-recap-dev only after green CI and the owner's agreement.

## UX & Interaction Patterns

- **Frame:** the configurator is full-screen without the sidebar. The top bar holds back, name, code and badge on the left; the format switch and the Anteprima eye in the centre; save state, undo, redo and **Approva** on the right. The left panel (312 px) shows the selection's settings, then always Layout, Pagine di default, Elementi, Sfondo and Elimina pagina, with the theme switch at its foot. The right panel (224 px) has the tabs Pagine and Media, plus **Cerca** and a grid/list toggle. Each panel hides from its own bar and reopens from the canvas edge, with focus moved to the reopen button. At 1024–1279 px the panels can be hidden. Below 1024 px it shows "The configurator needs a larger screen."
- **Canvas:** pages are stacked, labelled "{n} · {page name}" and grouped under Intro, Output and Risultati. Clicking a block frames it and shows "⠿ Sposta". Clicking an element selects it and frames its block. A double click or Enter edits a text. Esc steps out from element to block to page to nothing. Messages appear at the top of the canvas for a few seconds with `role="status"`.
- **Editing gestures:** drag or click Elementi into a block. Drag a block onto another to swap them. Drag a border to resize, as one undo step, and the border turns orange on a refused move. ⌘C, ⌘X and ⌘V work on blocks. Backspace or Delete removes the selection. **Mescola** cycles through the grids that have the same block count and is hidden when there is only one. There is no keyboard alternative to dragging elements, blocks or pages for now.
- **Anteprima:** the same canvas without editing tools. Formats stay switchable, and texts stay editable. Carosello and Video become one slideshow with previous/next buttons, dots, "{i} di {n}" and arrow keys. Video can overlay Instagram's Reel or Story interface (`mac.creativetech`). In the editor, the "Animazione testi" switch stops the text animation. With reduced motion set, texts never animate and layout changes switch without transitions.
- **Media tab:** lists files with their favourite star and an on-page marker, plus a drop zone. The Animazione dialog offers Carousel 01, 03 and 04 and Wheel 02, with media numbered in the order picked. **Inserisci** is disabled until a file is chosen. In client mode the tab shows "Del cliente" and "Dalle sue case".
- **Confirm dialogs** appear only for Approve, Update approved version, Delete (in Bozza) and deleting a page shared between a case and the client file. Anything else is undoable.
- **Approva disabled** names what's left (the overflowing page and format, or the missing file) via `aria-describedby`. After approval, a toast says "Approved. It's now in the library." and the user goes to To review if cases are waiting, otherwise to Case studies.
- **Templates:** the template text styles and palette (seven styles, per-format sizes; white, `#EDEDF0`, `#012234`, `#DEFE56`, `#2977FF`, transparent) are template output values, never tool UI tokens.

## Cross-Story Dependencies

- **From Epic 3:** Epic 4 needs 3.3 v2 (document and registry), 3.4 (grids, default pages, text styles), 3.5 (renderers) and 3.10 (test drafts) before 4.2 can show anything real. 4.11 needs 3.11 (client intro test text and the `client_intro` migration), later replaced by 3.9. 4.12 needs `composeParts`, which was split out of 3.5 and is tracked in deferred-work. 3.6 and 3.7 run after 4.8.
- **Within the epic:** 4.3 owns the autosave/compare-and-set path, and 4.4, 4.5, 4.13 and 4.11 all save through it. 4.2 retargets 3.8's draft-ready toast **Open** to the configurator. 4.13 comes before 4.11 and 4.12. 4.9 applies 4.8's rules to the head and also covers approved intros. The order is in conflict: 4.12's own note still puts it after 4.9, while the latest change proposal puts 4.11 and 4.12 before 4.8. Follow the proposal, and confirm 4.9's slot with the owner.
- **Built on Epic 2:** 4.1 builds on 2.17's status filter and the Home "Ti aspettano" list. 4.5 reuses 2.7's upload rules and 2.9's favourites. 4.11 opens from the client page or the toast after **Aggiungi**. Before 4.12 ships, **Modifica layout** shows inactive with "Arriva con il configuratore".
- **Later work:** the live-link count in 4.9's banner comes with 5.5. Epic 5 exports and collections read only live approved revisions and follow the case order stored in 4.12.
