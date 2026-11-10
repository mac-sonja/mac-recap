# Epic 4 Context: Review, edit and approve a case study

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer works the To review queue, opens each draft in the configurator, refines every format's own pages (texts, elements, bento blocks, layouts, backgrounds, media, pages) with autosave, and approves. For the demo, approval needs only two things: no overflow in any format and all referenced material present. Later edits to an approved case are staged on a working copy and go live only through **Update approved version**. The same frame edits and approves the client's own intro and closing pages (4.11). It also opens the client's whole file: the client's intro, its cases' pages and its closing (4.12). The clickable mockup `ux-designs/ux-MAC Recap-2026-10-08/mockups/configurator.html` (built from the Figma file "MAC-TF-AI"; "Una case" / "Un cliente" switch) is the UX source of truth. Where older text disagrees, the mockup and decisions C28–C40 win. Status at 2026-11-06: 4.1, 4.2, 4.4, 4.8 and 4.13 are done. 4.3 and 4.9 are in review. 4.5 is in progress. 4.11 and 4.12 are next, and 3.11 (client intro with test text) has merged.

## Stories

- Story 4.1: Review dashboard and To review queue
- Story 4.2: Open a draft in the configurator
- Story 4.3: Edit pages in place: texts, elements and blocks, with autosave
- Story 4.4: Adjust the layout per format
- Story 4.5: Replace, reorder and remove media
- Story 4.6: Choose typography per format (folded into 4.3; nothing to build)
- Story 4.7: Check every block against the material (not for the demo)
- Story 4.8: Approve a case study
- Story 4.9: Edit an approved case and update the approved version
- Story 4.10: Template maintenance (conditional, not scheduled)
- Story 4.11: Client intro and outro in the configurator
- Story 4.12: Client overview configurator
- Story 4.13: Pages: add, delete, reorder, sections

## Requirements & Constraints

- **Three independent formats:** Presentazione 16:9 (1920×1080), Carosello 1:1 (1080×1080; the Figma frame is 1000) and Video 9:16 (1080×1920). Every edit applies only to the format in view, and nothing cascades.
- **Preview equals export:** the canvas, the thumbnails and Anteprima all draw with the shared per-format renderer. There is no second layout implementation.
- **Templates bound the design:** layouts are the format's coded grids, and default pages only restore lost template pages. There is no font picker, recolour, filter or animated page layout. Media fit is Riempi, Adatta or Ritaglia (drag inside the block, zoom slider).
- **Limits:** a page has at most 6 blocks. A resize is refused if it would overflow a text or shrink a track below 12%. A layout with fewer cells removes only empty blocks, and otherwise refuses.
- **Free deletion:** blocks and pages can be deleted freely and come back with ⌘Z or **Pagine di default**. Every edit is undoable, and an undo or redo saves like any edit.
- **Media guardrail:** a server write may reference only non-deleted assets of this case or of its client. Removing media from a page never touches the asset.
- **Bound fields:** the client's name, sector (free text) and logo (replaced by uploading a file), and the case's year and services, are editable on the page. They write back through the record's own update use case with its validation and permission. The document stores only the binding.
- **Approval (demo):** **Approva** and **Update approved version** need two things:
  - an overflow-free result for every format of that revision version, measured in the browser with the shared renderer and sent with the call;
  - no deleted referenced material.

  The errors are `OVERFLOW_NOT_CLEARED`, `MATERIAL_MISSING`, `STALE_REVISION` and `STALE_HEAD`. There is no per-block check and no Check tab. Any owner/designer can approve. There is no bulk approve or auto-approve, and the guardrail test must prove this.
- **Lifecycle:** Bozza → In elaborazione → Da approvare → Approvato. Approvato is terminal. Saves are rejected while generating.
- **Client intro (4.11):**
  - **One document:** a client has one intro-and-outro document (kind `client_intro`, pages with role `intro` or `outro`). It has the case lifecycle, and one review and one approval cover both parts.
  - **Who:** only owner/designers generate, edit or approve it.
  - **NFR7:** an intro that isn't approved is never included in a client pack or collection.
  - **Content:**
    - The intro's first block reads "01 Cliente", with texts, images and services from the client's data, brief and media.
    - The client's closing uses the **Risultati e testimonial** template in Presentazione and Video. Carosello also gets the client's own Chiusura ("Al prossimo progetto").
    - The intro and closing use the client's first 3 images in upload order, with favourites first. The 3-file limit on client material is gone.
  - **Live client data:** client info and material are read live, and AI text stays as written.

## Technical Decisions

- **Reads by subject:**
  - The configurator reads only `getEditableRevision(subject)`, and live surfaces read `getLiveRevision(subject)`.
  - The subject is `{ kind: 'case' | 'client_intro', id }`, and both kinds are served today.
  - The frame makes no case-only assumption beyond the top-bar data.
- **Document v2:**
  - Each format has its own page list. A page has `pageKey`, name, `role`, section, background, bento grid and at most 6 blocks of ordered elements.
  - Edits write `doc` only, and `generated_doc` is immutable.
  - Changed AI text gets `provenance: human_edited`.
- **Autosave (compare-and-set):**
  - Each write passes the expected `revision.version`, and writes go one at a time.
  - The save state shows "Salvataggio…" then "Salvato". On failure it retries 3 times, then shows a banner.
  - `STALE_REVISION`, `STALE_HEAD` or `REVISION_NOT_WRITABLE` reloads instead of retrying.
  - Only `working` revisions are writable, and every save records an event.
  - A session with several documents (the client file) does one compare-and-set per document and reloads only the stale part.
- **Approve and approved editing (cases, built):**
  - `approve(caseId, revisionId, expectedRevisionVersion, expectedHeadVersion)` checks the material on the server. In one transaction it approves the revision, sets `approved_revision_id`, transitions the case and records the actor.
  - The first edit after approval calls the idempotent `forkHead` (a copy of `approved_revision_id`).
  - **Update approved version** reruns `approve` on the head, and the previous approved revision becomes `superseded`.
  - **Discard changes** supersedes the head and points `head_revision_id` back.
  - Both controls show only while the head differs from the approved revision.
- **What 3.11 gave 4.11:**
  - **Tables:** `client_intro` (one per client: `status`, `head_revision_id`, `approved_revision_id`, `head_version`) and an append-only `client_event`. Both have RLS on, and writes go only through `security definer` SQL functions.
  - **Use cases:** `transitionIntro` (the only way to change intro status), `createIntroWorkingRevision`, `getClientIntro` / `getClientIntroById`, subject reads for intros, and `startClientIntro`. **Aggiungi** and **Salva** start a draft when the client has 2+ images.
  - **Placeholder template:** `mac-client@1` ("[bozza di prova]" test text, client-field bindings). The design team's version will come later as `mac-client@2`.
  - **Ready toast:** it covers intros and today opens the client page.
  - **Not built:** an intro configurator, intro saves, intro approve, fork and discard.
- **What 4.11 must add:**
  - `saveRevisionDoc`, `approve`, `forkHead` and `discardHead` take `caseId` today. 4.11 extends them to the intro subject with the same rules, writing `client_event` and transitioning through `transitionIntro`.
  - The material check covers the client's assets: client files are soft-deleted since 4.5c-2.
  - Approved-intro editing closes with 4.9's model.
- **Client file (4.12):**
  - The file references the cases' pages and never copies them. Each part is read from, and saved to, its own editable revision.
  - A case's own intro pages and its Carosello Chiusura are left out. Its Risultati e testimonial pages stay.
  - The case order belongs to the client and defaults to newest first. Where it is stored is decided in 4.12.
  - Approval stays per part.
- **Conventions:**
  - Every action calls `access.getActor()` and `authorize()`.
  - Use cases return `Result<T, AppError>` with SCREAMING_SNAKE codes.
  - Every mutation emits a `case_event` or a `client_event`.
  - Copy is Italian, from the dictionary.
  - Imports cross modules only through `index.ts`.
  - Migrations are forward-only and reach mac-recap-dev only after green CI and the owner's agreement.

## UX & Interaction Patterns

- **Frame:** full-screen, without the sidebar.
  - **Top bar:** back, name, code and badge on the left; the format switch and the Anteprima eye in the centre; save state, undo, redo and **Approva** on the right.
  - **Left panel (312 px):** the selection's settings, then always Layout, Pagine di default, Elementi, Sfondo and Elimina pagina.
  - **Right panel (224 px):** Pagine and Media, with **Cerca** and a grid/list toggle.
  - Below 1024 px it shows "The configurator needs a larger screen."
- **Client mode ("Un cliente" in the mockup):**
  - **Top bar:** "{Client} · Pagine cliente", with the client's code prefix in place of the case code.
  - **Canvas and Pagine:** grouped as **Introduzione**, then (with 4.12) one group per case labelled "{code} · {name}" (in Pagine, **Progetti del cliente** rows), then **Chiusura**.
  - **Media tab:** "Del cliente" and "Dalle sue case". The drop zone reads "Finiscono nei Media di questo cliente."
  - **Default pages and Animazione** draw from the client's media first.
  - **Confirmation:** deleting a case page from the client file asks first. A page can't be dragged into another list.
- **Opening the intro:** from the client page, or from the ready toast after **Aggiungi**. The toast now has to open the configurator, not the client page.
- **Canvas:**
  - Pages are labelled "{n} · {page name}".
  - Esc steps out from element to block to page.
  - Messages appear at the top of the canvas with `role="status"`.
  - Confirm dialogs appear only for Approve, Update approved version, Delete (in Bozza) and deleting a shared page.
- **Approva:** when disabled, it names what's left via `aria-describedby`. The dialog reads "Approve {Name}? Once approved, it can be exported and shared." For an approved subject, the banner reads "Approved. Changes go live when you update the approved version."

## Cross-Story Dependencies

- **4.11 needs:** 3.11 (merged), 4.3/4.4/4.5/4.13's save path and tools, 4.8 (approve) and 4.9 (approved editing; in review).
- **4.11 and 4.12, unresolved:** 4.11's criteria open "on the client's file (Story 4.12)", but 4.12 is still backlog. Confirm with the owner whether 4.11 opens a client file that holds only Introduzione and Chiusura, leaving the case groups, case reorder and per-part saves to 4.12.
- **4.12 also needs** `composeParts` (deferred from 3.5). **Modifica layout** stays inactive ("Arriva con il configuratore") until 4.12 ships.
- **Later Epic 3 stories:** 3.9 later replaces the intro's test text with AI text, without changing the configurator. 3.6 and 3.7 follow 4.8.
- **Epic 5:**
  - Client packs (5.9) and collections (5.10) include only approved intros and follow the case order stored in 4.12.
  - Collection mode reuses this configurator with the editing gestures off. Keep them behind one capability flag.
  - The live-link count in 4.9's banner comes with 5.5.
