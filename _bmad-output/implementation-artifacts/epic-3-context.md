# Epic 3 Context: Generate a graphic case study from the material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer presses Generate and can leave: a background worker turns a case's uploaded material, form answers and client info into a draft laid out in each format's own pages from MAC's Figma templates (Presentazione, Carosello, Video), and the case lands in Da approvare with a toast. Because the narrative guidelines and AI prompt aren't ready, the epic also has dev-only test drafts (3.10 for cases, 3.11 for client intros) that build the same document from the default pages with marked test text, so the configurator (Epic 4) can be built and tried first. The 2026-10-28 configurator change rewrote this epic around per-format pages and bento blocks. Build order: 3.3 v2, 3.4, 3.5, 3.10, then Epic 4, then 3.6 and 3.7.

## Stories

- Story 3.1: Background job queue and worker loop
- Story 3.2: Display renditions for uploaded media
- Story 3.3: The case study document, revisions and the format registry (plus document v2 follow-up)
- Story 3.4: Templates as versioned code: pages, layouts and default pages per format
- Story 3.5: One renderer per format
- Story 3.6: Narrative generator port and Anthropic adapter
- Story 3.7: Generate a case study
- Story 3.8: Tell me when the draft is ready
- Story 3.9: Client intro and outro template and draft
- Story 3.10: Test draft without AI (dev only)
- Story 3.11: Client intro and outro with test text

## Requirements & Constraints

- Generation needs material: a case with no non-deleted asset can't generate (`NO_MATERIAL`), even with the form filled in. Client info never counts as material. The gate is checked in the UI, at enqueue time and again in the worker.
- The AI writes narrative text only. It never chooses the template, layout or assets, and never changes asset bytes. Media processing is limited to deterministic renditions (whole-image downscale, video poster and transcode). The original file is never written.
- Every claim cites the case's material, form answers or `client_field` refs. A `sourceRef` outside the manifest fails validation. There is no check workflow and no "generated, not checked" marking for the demo, and v2 has no `check` field.
- The AI writes three texts, one per format, each fitted to that format's space. An edit in one format never reaches another.
- Sfida, Idea and Risultati blocks and pages can be deleted freely: v2 doesn't require them, and they come back from Pagine di default or with undo.
- Case outro (C24): the Risultati e testimonial page uses the case's Risultati rows (up to 3 label/value rows) and its Testimonial (quote and author) as typed, with no AI text. A case with neither has no such page.
- Template design and assets stay unchanged. Each template fits a sector label of up to 40 characters without overflow in every format.
- An empty image block is transparent in an approved export.
- Story 3.10 is dev tooling only. It runs as a CLI command (e.g. `npm run dev:test-draft -- <caseId>`) against mac-recap-dev or a local database only. It refuses the production project ref, has no UI entry point and calls no LLM. Every placeholder text is marked "[bozza di prova]" and cites the case's own form answers or files.

## Technical Decisions

- **Case transitions:** `case_study.status` changes only through `case-study.transition(caseId, event, actor)`, which writes the status and a transition event in one transaction. The flow is `draft` → `generating` (generate, gated) → `in_review` (job ok, first working head), and back to `draft` if the job fails or its result is discarded. `in_review` → `approved` happens on approval. The UI labels are Bozza, In elaborazione, Da approvare and Approvato. Generation runs only from `draft`. Every mutation appends a `case_event`. Client intros use `transitionIntro` with the same states.
- **Revisions:** `revision` has `status` ∈ working | approved | superseded. It holds `generated_doc` (immutable, enforced by a trigger) and `doc` (the copy people edit), set to the same document at creation, plus `manifest`, `model`, `fell_back`, `prompt_version` and `schema_version`. A result always creates a **new** working revision. The head is set by compare-and-set on `case_study.head_version` against `baseHeadVersion`; a mismatch discards the result (`STALE_HEAD`). Doc writes pass the expected `revision.version` (`STALE_REVISION`). Reads go through `getEditableRevision(subject)` (the head) or `getLiveRevision(subject)` (approved), with `upgrade(doc)` applied on read and never written back to a non-working revision.
- **Format registry** (`rendering/domain/formats.ts`, the only list of formats): Presentazione 16:9 1920×1080 static PDF; Carosello 1:1 1080×1080 static ZIP of PNGs (drawn on a 1000 px Figma frame); Video 9:16 1080×1920 motion (for the demo only in Anteprima, exported later as MP4 or WebM). No type has a canvas-ratio field. A revision's formats are fixed at creation, and any other format fails with `FORMAT_NOT_IN_REVISION`.
- **Document v2** (zod, `generation/domain`): `schemaVersion: 2`, `kind` (`case_history` | `client_intro`), `templateId@version`, and one page list per format id. There is no shared text part and no per-format layout part.
  - **Page:** stable `pageKey`, name, `role` (intro/body/outro), section (intro/output/risultati), a background (colour, transparent or image ref), a bento grid with its own track sizes, and at most 6 ordered blocks.
  - **Block:** stable `blockId`, a background (default `#EDEDF0`; the page default is white) and ordered elements. The element types are text (seven styles, colour, alignment, columns, template size), Testi group (top, centre, bottom or split), image/video (asset ref plus Riempi, Adatta or Ritaglia), Animazione (type, assets, fit, size 50–150%), services tags, logos and divider. Template spacers are not elements.
  - **Texts** keep `provenance` (generated, human_edited or human_added) and optional `aspect` and `sourceRefs`.
  - `relayout`, slot maps, variants, spacing, text scales, font pairings and media-count rules are gone.
- **Bindings (answer 2):** client fields (name, sector, logo) and case fields (year, services) on a page are stored as bindings (which record, which field), never as values. The document and manifest hold no client values, and there is no client snapshot. Renderers read the current values. An edit on the page writes to the record through that record's own update use case.
- **Templates (C31, C33)** are code under `src/modules/rendering/templates/{templateId}/v1/`, never in the database. A published version folder is frozen by a hash test, and a change ships as `v{n+1}`. Per format, one function returns the layout grids and the default pages. Default pages exist only to restore a lost template page, never to add pages.
  - **Presentazione:** Intro is one page of 5 blocks (01 Progetto with title, subtitle and cover image; 02 Cliente with name, sector, year and logos; 03 Servizi tags; 04 Sfida; 05 Idea). Then Contenuti with 1, 3 or 5 images in grey blocks plus the text "06 Deliverable — Output", then Risultati e testimonial with a visual.
  - **Carosello:** Intro is three pages (Copertina, Sfida, Idea). Then a content page, Risultati e testimonial and Chiusura ("Al prossimo progetto", one copy per carousel).
  - **Video:** Intro is one page with info above and a Carousel 04 animation of the case images below at 105%. Then Risultati e testimonial, starting with the Intro's info block.
  - **Risultati e testimonial:** a blue `#2977FF` "06 — Risultati" block (what each result measures, and the number in lime `#DEFE56` under a thin line) and a grey "08 — Voce del cliente" block.
- **Sample case pages (C36):** Presentazione has no separate Sfida or Approccio page, because the Intro holds them. Video has only Intro and Risultati e testimonial. Pages are grouped by section into Intro, Output and Risultati.
- **Renderers:** one pure React renderer per format, taking that format's pages, the template, asset URLs and the current bound values, with no data fetching. Sizes are in units of the Figma frame width. Server and client output must be identical (`renderToStaticMarkup` snapshot). The renderer reports overflow per block and page, carries `pageKey`, role and section, and accepts a starting page number. Video animates texts in sequence on a loop, with an off switch, and respects reduced motion. `composeParts` builds client files, which reference case pages and never copy them.
- **Jobs:** leased Postgres jobs (`jobs_claim()`, a 10-minute lease renewed every minute, 3 attempts, a deduplicating unique index). The worker acts as the `system` actor. No web path imports the LLM, Chromium, sharp or ffmpeg.

## Cross-Story Dependencies

- 3.10 depends on the 3.3 v2 schema, 3.4's default pages and 3.5's renderers, and on Story 2.21 (case Risultati and Testimonial, stored in `context_form.results`) and the case services list. It runs before Epic 4 (4.2 onward). 3.7 later reuses the same build, with AI texts in place of the test text.
- 3.11 follows 3.10 with the same approach for client intros (at least 2 client images, `NO_CLIENT_IMAGES`). It is blocked on the client template, and 3.9 later replaces its test text.
- 3.6 and 3.7 are blocked on the narrative guidelines (which material the LLM reads, and the quality checklist). The prompt follows the copywriting guide.
- Epic 4's configurator edits the document v2 pages per format. Epic 5's exports use the same renderers. Client packs and collections reference case pages from their revisions.
