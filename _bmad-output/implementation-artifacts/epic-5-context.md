# Epic 5 Context: Find, export and share approved case studies

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make approved work leave the tool safely. Users find approved case studies in a card library, preview every format, export files (one format or several as a ZIP), and publish shareable links that always show the live approved version and can be turned off. The epic also delivers client packs (a client's intro, approved case histories and closing as one file) and named, shared collections that can be reordered, trimmed and re-worded without touching the originals, all before the October 30 demo. Nothing unapproved may ever be exported or shared. Before login (Epic 6), the library is reached through the owner/designer's Table / Library toggle, and account/sales/social rules are enforced by policy and tests only.

## Stories

- Story 5.1: Library of approved case studies
- Story 5.2: Preview an approved case study in every format
- Story 5.3: Export a format as a file
- Story 5.4: Export every format at once
- Story 5.5: Create a shareable link
- Story 5.6: The shared link page
- Story 5.7: Turn off a shareable link
- Story 5.8: Guardrail test suite for the end-of-Sprint-2 check
- Story 5.9: Combined export and client pack download
- Story 5.10: Collections
- Story 5.11: Edit texts and remove pages in a collection

## Requirements & Constraints

- **Approved only (guardrail).** Export, share, library, case study view and `/s/{token}` read only the live approved revision (`getLiveRevision`), never a working head or superseded revision. Approval is checked only through `case-study.isRevisionApproved`. Failures: `NOT_APPROVED`, `FORMAT_NOT_IN_REVISION`. Unapproved cases offer no View, Export or Share entry point anywhere, and a direct URL returns the user to their landing page. Interim exception (owner, 2026-10-28): until Story 4.8 can approve a revision, the detail page of a case with no approved revision shows the starter pages with the *Bozza di prova* note instead of redirecting.
- **Formats:** Presentazione 16:9 (1920×1080, PDF), Carosello 1:1 (1080×1080, ZIP of PNGs), Video 9:16 (1080×1920). For the demo, Video is Anteprima only: no export, shown disabled as "Dopo la demo". It will export as MP4 or WebM after the demo. Deck 16:9, 4:5 carousel and PDF A4 are dropped.
- **Who:** owner/designer and account/sales/social can view, export, share, turn off any link (including others'), download client packs and manage collections. Admin cannot use any collection action (`FORBIDDEN`).
- **Links:** access mode `unlisted`; the dialog says "Anyone with the link can view." `expires_at` exists and is honoured but has no UI. A turned-off link cannot be turned back on. Turned-off, expired and unknown tokens show "This case study is no longer available. Contact the person who shared it." Until Epic 6, `/s/{token}` stays behind the basic-auth gate.
- **Shared link page:** WCAG 2.2 AA, fully responsive (swipe on phones), slide text available to screen readers, reduced motion respected, no download, no app chrome. Media are display renditions or poster frames served via signed GET, never originals.
- **Export failures** never change case status. Exports are reused only when the content hash matches, so after a client edit the next export renders again.
- **Collections:** contain only approved content plus text written in the collection. Since 2026-10-28, collection text edits by any collection manager (account/sales/social included) export without owner/designer approval. Edits, page order and hidden pages never write a revision or a client row, and tests must prove this.
- Every mutation (export, link create, link turn-off) emits a `case_event`. All copy comes from the Italian dictionary. Desktop is 1440 px primary, 1280 px minimum; the case study view's format list becomes a dropdown at 1024–1279 px.
- **Guardrail suite (`npm run test:guardrails`):** one named test per guardrail (NFR1, NFR3, NFR6, NFR7, plus NFR2), with a repo checklist mapping each test to its NFR and listing manual checks. Note: for the demo, approval no longer needs a per-block check, so the NFR2 test must follow the current approve rule (no overflow and material present, no bulk approve).

## Technical Decisions

- **Modules:** `rendering` owns the `export` table and `exports/{contentHash}/{format}.{ext}`. `sharing` owns `share_link`. A new `collection` module owns `collection`, `collection_item`, `collection_tag`, `collection_text_edit`, `collection_hidden_page` and `collection_page_order`. Cross-module access goes only through `index.ts`. Tables are created by forward-only migrations with RLS denying `anon` and `authenticated`. Data access is server-only, with the service-role key.
- **Format registry plus one React renderer per format** (`rendering/domain/formats.ts`), shared by the configurator, case study view, library cover, `/s/{token}` and exports, so the preview equals the export.
- **Export pipeline:** a server action authorizes and checks approval, then enqueues an `export` job (Postgres job queue; web requests never run Chromium or ffmpeg). The worker uses `renderToStaticMarkup`, then Playwright `page.setContent`; there is no print route. The payload is `{ parts: [{ subject, revisionId }], format }`. `export` is unique and immutable on `content_hash`, which covers the ordered parts, revision ids, each part's client info, collection edits, page order, hidden pages and format. `ensureExport` reuses on a hash match. A multi-format ZIP is built only after each per-format export succeeds, never as a partial ZIP. Downloads use a signed GET valid for 15 minutes or less. SVG client logos are rasterised at render time with network and DTD loading off.
- **`rendering.composeParts(parts, format)`** renders the parts in order with continuous page numbers. For a client with 2 or more cases, its approved intro goes first and its approved closing comes once after the last case; each case's own intro pages and Carosello Chiusura are left out, and its Risultati e testimonial pages stay. Case pages are read from the revision, never copied. If the client's intro or outro isn't approved, each case keeps its own. Unit tests cover one part, two parts of one client, and mixed clients.
- **`share_link`:** a URL-safe random token of at least 128 bits, plus `case_id`, `format`, `created_by`/`created_at`, `expires_at`, `revoked_at` and `access_mode`. Creating a link requires an `approved_revision_id`. The page resolves the live revision at request time, so an **Update approved version** shows on existing links at once.
- **Collections** are an overlay on live approved revisions. Text edits are stored per part and `blockId` with the original text's hash. If the original changes, show "Il testo originale è cambiato" instead of merging silently. Writes use compare-and-set on `collection.version`. A case with no approved revision any more is listed "Non disponibile" and left out of exports.
- **Client info is live**, filled at render time and never snapshotted. Every action calls `access.getActor()` and `access.authorize()`, the permission matrix lives only in `policy.ts`, and actions return `Result<T, AppError>`.

## UX & Interaction Patterns

- **Library:** a card grid showing cover (page 1 of Presentazione), name, client and year. No status badge or filter. It uses the table's search rules, Client and Year facet chips (OR within a facet, AND across facets and with search), active filters with **Clear all**, newest approved first, pages of 24 with no infinite scroll, and skeleton cards on first load. Card checkboxes plus a "{n} selezionate" bar lead to **Crea raccolta**.
- **Case study view** (full-screen, read-only, at `/case-studies/{id}`, opened from an Approvato row in the Case table or Home, or a library card): Back, name, code, badge, the format switch (same names and order as the configurator), Share, Export, and **Modifica** to the configurator only with `edit` (owner/designer). The body reuses the configurator's Anteprima pieces: Presentazione stacked, Carosello and Video as a slideshow with ← →, the Instagram overlay on Video. Target adds pager "Slide 1 of 12", zoom, fit and full screen.
- **Built so far (owner note, 2026-10-28):** the detail page above with **Scarica** as the inactive picker and **Modifica**; Approvato table rows show **Modifica** next to **Scarica** (with `edit`). Below 1024 px a larger-screen message shows for now. Still backlog in 5.2: pager, zoom, full screen, the 1024–1279 px dropdown, the sub-1024 px preview, Share, a working Export, and **Elimina** (next spec).
- **Delete:** no table row has Delete. A draft is deleted only inside the draft (Story 2.20); an approved case's **Elimina** lives on its detail page (Story 5.2).
- **Export dialog**, the same for a case, a client pack and a collection: a checkbox per format, with the current format ticked; **Esporta** is disabled until one is ticked. One format downloads its file and several download as one ZIP. Progress is shown while the user keeps browsing. On failure, the toast "Export didn't finish." offers **Try again**. There is no separate Export all button.
- **Share dialog:** format picker (default Presentazione), auto-copy with a "Link copied" toast, a link list (format, creator, date, Copy, **Turn off link** with confirm). The Links column counts active links.
- **Client pack:** account/sales/social get a read-only **Clienti** list (clients with an approved case only) with **Scarica**. When the intro isn't approved, the dialog shows a notice.
- **Collections** are built in the configurator itself. A **Raccolte** sidebar list shows name, tags, count, updated and created by, can be filtered by business line and industry, and supports open, rename and soft delete with confirm. **Aggiungi casi** is suggested by tags. Edited blocks show "Modificato in questa raccolta" with **Ripristina testo originale**. **Elimina dalla raccolta** with **Ripristina** hides and restores pages. Account/sales/social users get no left panel, no Media tab, no block or element delete and no add pages, but can reorder pages, double-click to edit text, and use Anteprima. The server refuses any other configurator action.

## Cross-Story Dependencies

- Depends on Epic 4 (approval, Update approved version, configurator frame, client intro/outro in Stories 4.11–4.12) and Epic 3 (renderers, job queue, renditions).
- 5.2 is opened from 5.1 and from Approvato rows (Case table, Home); its Share and Export controls wait on 5.5 and 5.3, and its interim no-approved-revision fallback ends once Story 4.8 approves revisions. 5.4 builds on 5.3's dialog and `ensureExport`. 5.6 and 5.7 need 5.5. 5.9 needs 5.3, 5.4 and 4.11. 5.10 needs 5.9's `composeParts` and 5.1's selection. 5.11 comes last, after 5.10.
- 5.5 feeds the link count into Story 4.9's approved-case banner and confirm copy.
- Epic 6 removes the basic-auth gate so `/s/{token}` becomes the only public route, and turns on the real account/sales/social role and pack/collection permission checks (Story 6.5).
- Slip order if dates slip: 5.11, then 5.10, then 5.9. 5.1–5.4 are on the demo path and never slip.
