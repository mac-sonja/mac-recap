# Epic 4 Context: Review, edit and approve a case study

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Owner/designers work a To review queue, open each generated draft in a full-screen configurator, refine every format's own pages (texts, bento blocks, elements, layouts, backgrounds, media, pages) with autosave, and approve it so it becomes available for export and sharing. Later edits to an approved case are staged on a working copy and go live only through **Update approved version**. The same configurator also edits and approves the client's intro and closing, and opens a client's whole file (intro, all its cases, closing). The configurator mockup `ux-designs/ux-MAC Recap-2026-10-08/mockups/configurator.html` is the UX source of truth; EXPERIENCE.md wins on behaviour. This epic is the human gate that keeps unreviewed content from leaving the tool.

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
- Story 4.10: Template maintenance (conditional, not scheduled; blocked on IR-C4)
- Story 4.11: Client intro and outro in the configurator
- Story 4.12: Client overview configurator
- Story 4.13: Pages — add, delete, reorder, sections

## Requirements & Constraints

- **Lifecycle (interim):** Bozza (`draft`) → In elaborazione (`generating`) → Da approvare (`in_review`) → Approvato (`approved`). No path back from Approvato. Delete only in Bozza, soft (`deleted_at`); otherwise `CASE_NOT_DELETABLE`.
- **To review:** Da approvare only, oldest first by time entered; sidebar count; no assignment or claiming; any owner/designer sees and approves any case.
- **Approval (demo rule):** **Approva** requires only no overflow in any format (Presentazione, Carosello, Video) and no referenced material deleted. No per-block check, no `BLOCKS_UNCHECKED`, no "blocks still to check". It is always a person pressing Approva and confirming; no bulk approve, auto-approve or tick-all may exist, and an automated guardrail test must prove it.
- `MISSING_ASPECT` is shown as a non-blocking message; it never blocks approval.
- **Nothing exported or shared before approval** — including client intros: an unapproved intro is never included in a pack or collection.
- Media come only from the case's (or its client's) own non-deleted assets; server rejects any other asset ref. Upload and favourite never change case status. No recolour, filter or effect controls; Riempi/Adatta/Ritaglia are allowed (Ritaglia = drag inside block + zoom slider). Uploads follow material rules (20 files, 50 MB, allowlist, per-file rejections).
- Text styling only from fixed values: seven styles, the brand palette (white, `#EDEDF0`, `#012234`, `#DEFE56`, `#2977FF`, Trasparente) or a typed colour, alignment, one/two columns. No font picker, scale or per-word styling.
- Autosave states: "Salvataggio…" / "Salvato" / "Not saved. Retrying…"; after 3 failures a "Changes aren't saving. Keep this tab open." banner. No Save button, no version history.
- Confirm dialogs only for Approve, Update approved version, Delete, and shared-page deletion; everything else is undoable (⌘Z / ⇧⌘Z).
- Below 1024 px the configurator shows "The configurator needs a larger screen."; at 1024–1279 px panels can hide. Reduced motion: no animated layout transitions; Video text animation off.
- No keyboard/menu alternative to dragging elements, blocks or pages for now (deferred).
- All UI copy in Italian via the dictionary; WCAG 2.2 AA; messages announced with `role="status"`; disabled-reason text linked via `aria-describedby`.

## Technical Decisions

- **Document v2 (`schemaVersion: 2`):** `kind` (`case_history` | `client_intro`), `templateId@version`, and one page list per registry format. Page: `pageKey`, name, `role` (`intro`|`body`|`outro`), section (`intro`|`output`|`risultati`), background, bento grid with own track sizes, max 6 blocks. Block: `blockId`, background (default `#EDEDF0`; page default white), ordered elements (text, Testi group, image/video with fit, Animazione, services tags, logos, divider). Edits never cascade across formats. Older docs upgraded on read only.
- Client/case fields on a page (client name, sector, logo; case year, services) are **bindings**, never stored values. Editing them on the page calls the client's/case's own update use case (with validation and permissions) and shows everywhere at once. Sector is free text on the page; logo is replaced by upload.
- Each revision stores `generated_doc` (immutable) and `doc` (edited). Edited AI text gets `provenance: human_edited` (`human_added` for new text).
- **Compare-and-set:** writes pass expected `revision.version` (`STALE_REVISION`); pointer changes pass `case_study.head_version` (`STALE_HEAD`); only `working` revisions are writable (`REVISION_NOT_WRITABLE`); saves rejected while `generating`. Client sends writes one at a time, never retries stale errors — it reloads. Multi-document views (client file) do one CAS per document and reload only the stale part.
- Reads via `getEditableRevision(subject)` in the configurator and `getLiveRevision` for live reads. Editing an approved case: explicit idempotent `case-study.forkHead(caseId, expectedHeadVersion)` from `approved_revision_id`; Update approved version reruns `approve` on the head (previous becomes `superseded`); Discard marks the head `superseded` and points head back to approved.
- `approve(caseId, revisionId, expectedRevisionVersion, expectedHeadVersion)` takes a client-measured overflow-free result per format from the shared renderer; server checks material, then in one transaction sets revision `approved`, `approved_revision_id`, case `approved`, and records an event. Errors: `OVERFLOW_NOT_CLEARED`, `MATERIAL_MISSING`, `STALE_REVISION`, `STALE_HEAD`.
- Removing media from a page leaves the asset untouched; referenced assets are only soft-deleted so approval can report missing material.
- The configurator, previews and thumbnails use the same per-format renderer as exports (preview equals export). Layout grids and default pages come only from the versioned template code.
- Client intro has the same lifecycle and pointers on `client_intro`, changed via `case-study.transitionIntro`; its events go to `client_event`.
- Client file references case pages, never copies them; it omits a case's own intro pages and Carosello Chiusura but keeps Risultati e testimonial. Case order belongs to the client (default newest first) and drives the client pack.
- Every action calls `access.getActor()` + `access.authorize()`, returns `Result<T, AppError>`, and emits `case_event` rows (save, transition, approval, favourite, delete, upload).

## UX & Interaction Patterns

- Configurator is full-screen, no sidebar. Top bar: back, name, code, status badge | format switch (Presentazione 16:9 · Carosello 1:1 · Video 9:16) + Anteprima eye | save state, undo, redo, Approva (or Update approved version / Discard changes).
- Left panel 312 px: selection settings, then Layout, Pagine di default, Elementi, Sfondo, Elimina pagina; theme switch at foot. Right panel 224 px: Pagine and Media tabs, Cerca, grid/list. Both hide from their bar and reopen from the canvas edge.
- Canvas: pages stacked, labelled "{n} · {page name}", grouped Intro / Output / Risultati. Selection: click block (framed, "⠿ Sposta" handle), click element; double-click or Enter edits text; Esc steps out element → block → page → nothing.
- Layout: grid thumbnails; Mescola cycles grids with the same block count; border drag resize (min 12%, refuse overflow, one undo step). Pagine di default only restore template pages, never add pages.
- Anteprima: same canvas without tools; Carosello/Video as social slideshow; texts still editable; Video can overlay Instagram Reel/Story UI.
- Approved case shows the banner "Approved. Changes go live when you update the approved version."; after approve, toast "Approved. It's now in the library." and go to To review if items wait, else Case studies.

## Cross-Story Dependencies

- Depends on Epic 3: document v2 and format registry (3.3), templates with grids/default pages (3.4), per-format renderer with overflow reporting (3.5), default page fill (3.10), client intro draft (3.9); and Epic 2 material upload/favourites and client records.
- Build order: 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.13 → 4.11 and 4.12 → 4.8, with 4.9 after 4.8/4.11 (4.12 last; it also needs 4.9 for approved parts).
- 4.4, 4.5, 4.13, 4.11, 4.12 all save through 4.3's autosave/undo path. 4.9 and 4.11 reuse 4.8's approval rules; 4.12 reuses the 4.2 frame and 4.13's shared-page delete confirm.
- Epic 5 relies on `approved_revision_id`/`getLiveRevision` from here; the live-link count in 4.9's banner arrives with Story 5.5. Client pack order set in 4.12 feeds 5.9.
