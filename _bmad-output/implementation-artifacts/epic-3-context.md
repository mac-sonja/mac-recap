# Epic 3 Context: Generate a graphic case study from the material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer presses Generate and can leave: a worker builds a draft from MAC's Figma templates ("MAC-TF-AI"), with texts written only from this case's material, form answers and the client's current info, laid out in each format's own pages (Presentazione, Carosello, Video), and the case lands in Da approvare with a toast. The epic also delivers the foundations Epic 4's configurator edits: renditions, the case study document (now schema v2: per-format pages, bento blocks holding elements) and revisions, the format registry, templates as versioned code with layout grids and default pages, one renderer per format (including an animated Video renderer), and the client intro/outro drafts. Build order: 3.3 v2 follow-up → 3.4 → 3.5 → 3.10 → 3.11 → Epic 4 (4.2–4.5, 4.13, 4.11/4.12, 4.8) → 3.6 → 3.7 → 3.8 → 3.9. Every story depends only on stories built before it.

## Stories

- Story 3.1: Background job queue and worker loop (done)
- Story 3.2: Display renditions for uploaded media (done)
- Story 3.3: The case study document, revisions and the format registry (done for v1; v2 + new registry is a tracked follow-up)
- Story 3.4: Templates as versioned code: pages, layouts and default pages per format
- Story 3.5: One renderer per format
- Story 3.10: Test draft without AI (dev only)
- Story 3.11: Client intro and outro with test text
- Story 3.6: Narrative generator port and Anthropic adapter
- Story 3.7: Generate a case study
- Story 3.8: Tell me when the draft is ready
- Story 3.9: Client intro and outro template and draft

## Requirements & Constraints

- **Formats (the only three):** Presentazione 16:9 1920×1080, static, PDF; Carosello 1:1 1080×1080 (drawn on a 1000 px Figma frame, scaled), static, ZIP of PNGs; Video 9:16 1080×1920, motion, MP4/WebM with animations, but Anteprima only for the demo. Deck 16:9, Social carousel 4:5 and PDF A4 are gone. No canvas-ratio field anywhere.
- **Per-format independence:** each format owns its pages, blocks, elements, texts and backgrounds. An edit changes only that format; nothing cascades from Presentazione. The AI writes one text per format, fitted to its space; each copy carries its own claims.
- **Guardrails (code, never DB/env/UI, each tested):** AI never alters assets, layout or template design; the LLM returns only text. No material (no non-deleted asset) → `NO_MATERIAL` before any job or LLM call, checked in the button, the action and the worker. Form answers and client info never count as material. Client drafts need ≥2 client images (`NO_CLIENT_IMAGES`).
- **Media:** renditions only downscale whole images and make video poster/transcode; originals are only read. At render time media fit is Riempi, Adatta or **Ritaglia** (crop now allowed). An empty image block exports transparent.
- **Narrative:** texts carry `provenance` (generated | human_edited | human_added) and, from generation, `aspect` (technical | graphic) and `sourceRefs`; none tagged on one side → `MISSING_ASPECT` (warning only). No `check` field and no "generated, not checked" marking, now or after the demo. Sfida, Idea and Risultati are not required by the schema (deleting is free; recovered via Pagine di default or ⌘Z). Prompt follows the copywriting guide (`copywriting-case-mac.md`); the company is always "MAC".
- **Risultati e testimonial:** no AI text; read straight from the case's typed results (up to 3 label/value rows) and testimonial (Story 2.21). A case with neither gets no such page.
- **Client and case fields are bound, not copied:** client name, sector, logo and case year, services are stored as bindings (record + field); renderers read current values; an on-page edit writes to the record (Epic 4). The document, revision and manifest store no client values. A client edit shows everywhere without regeneration or re-approval. Services are a multiselect list on the case.
- **Client intro/outro:** intro and closing use the client's first 3 images in upload order, favourites first (the 3-file client limit is gone). The client's closing uses the Risultati e testimonial template in Presentazione and Video.
- **Waiting is off the clock:** no ETA or percentage. Lifecycle Bozza → In elaborazione → Da approvare → Approvato; failure returns to Bozza with material and details untouched.
- **Story 3.10/3.11:** dev/test text only, no LLM, text marked "[bozza di prova]"; 3.10 is a dev command with no UI that refuses the production project ref.
- **Still blocked:** 3.6/3.7 on which material types the LLM reads (OP 2) and the NFR5 quality checklist; 3.9/3.11 on the client template. Favourites are ignored by generation.

## Technical Decisions

- **Modules:** modular monolith; cross-module imports only via `index.ts`; vendor SDKs only in `adapters/`. Heavy/vendor code (sharp, ffmpeg, Chromium, LLM SDK) sits behind `src/modules/<m>/worker.ts`, imported only by `src/worker`; job handlers register there by kind and run as the `system` actor.
- **Jobs (done):** kinds generate | export | rendition, idempotent on `(kind, subject_id, input_hash)`, leased claims renewed each minute, max 3 attempts. UI reads outcomes only via `jobs.getJobsFor(subjectId)`.
- **Renditions (done):** other modules get signed URLs (≤15 min) only via `material.getRendition(assetId, spec)`; never build storage keys.
- **Format registry:** `rendering/domain/formats.ts` is the only list (id, name, ratio, pixel size, page model, file type, `static | motion`). A revision's per-format entries are fixed at creation (`FORMAT_NOT_IN_REVISION`).
- **Document v2 (`generation/domain` zod):** `schemaVersion: 2`, `kind` (`case_history | client_intro`), `templateId@version`, one page list per format. Page: stable `pageKey`, name, `role` (intro | body | outro), section (intro | output | risultati), background (colour, transparent, image ref), bento grid with own track sizes, ≤6 ordered blocks. Block: stable `blockId`, background (default `#EDEDF0`; page default white), ordered elements: text (one of seven styles, colour, alignment, columns, optional template size), Testi group (top | centre | bottom | split), image/video (asset ref + fit), Animazione (type, asset refs, fit, size 50–150%), services tags, client+MAC logos, divider. Template spacers become Testi alignment, not elements. No shared text part, no relayout, variants, spacing, text scale or font pairing. v1 is upgraded on read by `upgrade(doc)` (drops removed formats, fills missing ones with default pages), never written back to a non-working revision; v1 exists only in test fixtures.
- **Revisions:** `revision` table (one of `case_id` / `client_intro_id`; working | approved | superseded; immutable `generated_doc`, editable `doc`, `manifest`, `model`, `fell_back`, `prompt_version`, `schema_version`). Read via `getLiveRevision(subject)` / `getEditableRevision(subject)`; compare-and-set on `revision.version` and `case_study.head_version`. A generate result is a new revision, discarded on head mismatch.
- **Templates:** `src/modules/rendering/templates/{templateId}/v{n}/`, published versions immutable (hash-list test), no template values in the DB. Per format: layout grids (one function is the only layout source for generation and the configurator; new Figma templates append grids), default pages (Presentazione: Intro, Contenuti 1/3/5 images, Risultati e testimonial; Carosello: Intro, Sfida, Idea, Risultati e testimonial, Chiusura; Video: Intro, Risultati e testimonial), seven text styles with per-format sizes. Default pages only restore lost template pages and are never a way to add pages. A template text keeps its own Figma size where it differs from its style.
- **Renderers:** one React renderer per format, pure function of (that format's pages, template, asset URLs, current bound field values), no fetching; identical output via `renderToStaticMarkup`; template styles, not tool tokens; sizes in units of the Figma frame width (1920 / 1000 / 1080); per-block and per-page overflow result; pages carry `pageKey`, `role`, section and accept a starting page number. Video: texts animate in sequence on a loop, a setting stops it, reduced motion disables it, room at the top for Instagram's bar. SVG logos via `<img>`, rasterised with network and external entities off.
- **`composeParts` / client file:** with 2+ case histories: client intro, then each case's pages minus its own intro pages and Carosello Chiusura (Risultati e testimonial stays), then the client's closing (plus the client's Chiusura in Carosello). Case pages are read from the case's revision, never copied.
- **Generation (3.7):** the worker re-checks the gate, runs the narrative generator, builds v2 from each format's default pages filled with the AI's texts, case images, typed results/testimonial and field bindings; creates a new working revision (`generated_doc` = `doc`), sets head by CAS, moves to `in_review`.
- **LLM adapter:** `NarrativeGenerator` port, worker only, sole importer of `@anthropic-ai/sdk`; `client.beta.messages.parse` with the zod schema, model constant `claude-opus-5-5`, adaptive thinking, `effort: "high"`, server-side refusal fallbacks; no tools; `refusal` → `LLM_REFUSAL`; versioned prompt files; extract/split to respect 32 MB / 600-page limits, no Files API; no prompts or material in logs. Output is text only (no layout, asset or `about` field); `sourceRefs` must be in the manifest or be `client_field` refs.
- **Conventions:** forward-only migrations; RLS denies `anon` and `authenticated`; `Result<T, AppError>` with SCREAMING_SNAKE codes; `access.getActor()` + `authorize()` on every action; event rows for every mutation; Italian copy from the dictionary.

## UX & Interaction Patterns

- Wizard step 3 shows "{n} files, {m} of 3 details filled."; Generate is disabled without material, with the reason linked via `aria-describedby`; the processing screen invites leaving (Back to case studies); failure shows Try again without re-upload.
- Case studies table rows update live; an In elaborazione row is not clickable ("Still generating").
- Draft-ready toast "{Name} is ready to review." with Open, announced to screen readers without taking focus, not replayed later, no email/Slack. Open goes to the highlighted table row until Story 4.2 retargets it to the configurator.
- Client **Aggiungi** starts the client draft in the background; the client page opens at once.
- The configurator mockup (`ux-designs/ux-MAC Recap-2026-10-08/mockups/configurator.html`) is the reference for template values, grids and renderer appearance. Text palette: white, `#EDEDF0`, `#012234` (text default), `#DEFE56`, `#2977FF`, transparent.

## Cross-Story Dependencies

- 3.3's v2 follow-up must land before 3.4; 3.5 depends on 3.4; 3.10 uses 3.3–3.5 and 3.11 follows it, both unblocking Epic 4 before AI exists.
- 3.6 runs after Epic 4's 4.8; 3.7 depends on 3.6, 3.4, 3.5; 3.8 on 3.7; 3.9 replaces 3.11's test text and depends on 2.15, 2.16, 3.3–3.8. 3.11 owns the `client_intro` / `client_event` migration and the `revision.client_intro_id` FK.
- Epic 4 (4.3) adds on-page editing of bound client/case fields; 4.2 retargets 3.8's Open; 4.11 retargets the client draft landing; 4.12 decides where case order in the client file is stored. Epic 5 exports use the 3.5 renderers and `composeParts`.
