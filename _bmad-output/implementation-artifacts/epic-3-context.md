# Epic 3 Context: Generate a graphic case study from the material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer presses Generate on a case with material and can leave. A background worker produces a draft: a challenge / approach / result narrative built only from the case's material, form answers and the client's info, laid out in each format's own pages from MAC's templates (Presentazione, Carosello, Video). The case lands in review and a toast says so. The same pipeline drafts a client's intro and outro pages. Sprint 2, due 2026-10-21.

## Stories

- Story 3.1: Background job queue and worker loop
- Story 3.2: Display renditions for uploaded media
- Story 3.3: The case study document, revisions and the format registry
- Story 3.4: Templates as versioned code: pages, layouts and default pages per format
- Story 3.5: One renderer per format
- Story 3.6: Narrative generator port and Anthropic adapter
- Story 3.7: Generate a case study
- Story 3.8: Tell me when the draft is ready
- Story 3.9: Client intro and outro template and draft
- Story 3.10: Test draft without AI (dev only)
- Story 3.11: Client intro and outro with test text

## Requirements & Constraints

- Generation is background work. The case shows "In elaborazione"; failure returns it to Bozza with material and details intact. No ETA or percentage; waiting is not counted against the hands-on time budget.
- No material (no non-deleted file) means no generation, enforced in UI and worker (`NO_MATERIAL`). The form and client info alone never enable Generate. A client intro needs at least 2 client images (`NO_CLIENT_IMAGES`).
- The AI never alters graphic assets, technical substance or template design. Media gets only deterministic processing (downscale, poster frame, transcode; no crop, recolour, filter, upscaling). Originals are never written.
- Narrative: challenge, approach and result present; covers technical and graphic sides; draws only on uploaded material, form answers and client info; no "verified" labels; Italian or English (default Italian); prompt follows the copywriting guide. The AI writes one text per format, fitted to that format; edits to one format never reach another.
- Demo scope: no claim check workflow (nothing sets or reads a `check`); AI output is text only. Deleting template blocks/pages is free (recoverable via default pages), so v2 does not require them.
- The generated draft is kept unchanged beside the editable document. Every transition is an append-only event.
- UI strings Italian via the single dictionary; WCAG 2.2 AA. An empty image block exports transparent. Client logos may be SVG: draw via `<img>`, rasterise at render time with external entity/network loading off.
- Risultati e testimonial pages use the case's typed results (up to 3 label/value rows) and testimonial, no AI text; a case with neither has no such page.

## Technical Decisions

- Modular monolith: cross-module imports only via each module's `index.ts`; vendor SDKs only in adapters (lint-enforced). Modules: generation, rendering, material, jobs, case-study.
- Jobs: Postgres `job` table (generate | export | rendition), idempotent enqueue via partial unique index on (kind, subject, input hash) for queued/running, `jobs_claim()` with `FOR UPDATE SKIP LOCKED`, 10-min lease renewed each minute, max 3 attempts, then failed plus `job_failed`. Worker acts as `system` actor, resolved through `access.index`. Web paths never import LLM, Chromium, sharp or ffmpeg adapters. UI reads outcomes only via `jobs.getJobsFor`.
- Status changes only via `case-study.transition` (draft -> generating -> in_review; failure -> draft); client intros via `transitionIntro`. Revisions: working | approved | superseded, head/approved pointers, compare-and-set on `baseHeadVersion`; generate always creates a new revision and is discarded if the head moved. Read via `getLiveRevision` / `getEditableRevision` (subject = case or client_intro) through `upgrade(doc)`, never written back to non-working revisions.
- `CaseStudyDocument` zod schema v2, jsonb, stored twice per revision (`generated_doc` immutable by trigger, `doc` editable): one page list per registry format; pages carry `pageKey`, role (intro | body | outro), section, background, grid, track sizes and blocks of elements (text, Testi group, image/video with Riempi/Adatta/Ritaglia, Animazione, services tags, logos, divider). Text keeps `provenance`, optional `aspect`, `sourceRefs`. The document stores no client or case values, only bindings to record fields; renderers read current values. `kind` = case_history | client_intro.
- Format registry `rendering/domain/formats.ts` is the only format list: Presentazione 16:9 1920x1080 (PDF), Carosello 1:1 1080x1080 (ZIP of PNGs; templates drawn on 1000 px), Video 9:16 1080x1920 (motion; Anteprima only for the demo). Operations naming another format fail `FORMAT_NOT_IN_REVISION`.
- Templates are versioned code in `rendering/templates/{templateId}/v{n}/`; a published version never changes (hash-list test), changes ship as `v{n+1}`. Per format: bento layouts (single source for generation and the configurator), default pages, seven text styles. Source design: Figma "MAC-TF-AI"; mockup `ux-designs/ux-MAC Recap-2026-10-08/mockups/configurator.html` is the value reference. Default pages: Presentazione Intro, Contenuti (1/3/5 images), Risultati e testimonial; Carosello Intro (Copertina, Sfida, Idea), content, Risultati e testimonial, Chiusura; Video Intro, Risultati e testimonial. Services are a case multiselect shown as Intro tags; sector label fits 40 characters.
- One pure React renderer per format, sizes in units of the template frame width, used by configurator, case view, shared links and exports (preview equals export; server `renderToStaticMarkup` output identical to client). Exposes per-block/page overflow, `pageKey`/role/section, a starting page number. Video: texts animate in sequence, switchable, none with reduced motion, room for Instagram's bar, poster frame in static output. Template output uses template styles, not tool UI tokens.
- Narrative: single `NarrativeGenerator` port, registered only in the worker; the adapter is the only `@anthropic-ai/sdk` importer. `client.beta.messages.parse` with zod output, model from one constant (`claude-opus-5-5`), adaptive thinking, effort high, server-side refusal fallbacks, no server tools, no Files API; respect limits (32 MB, 600 PDF pages, no DOCX/video). Versioned prompt files. Output has only text fields and claims (no layout/asset/about field); sourceRefs outside the manifest fail; `refusal` becomes `LLM_REFUSAL`; `MISSING_ASPECT` recorded, not blocking. Record `model`, `fellBack`, `promptVersion`, `schemaVersion`; never log prompts or material.
- Material is referenced by `MaterialRef` (asset | form_field | client_field), resolved only via `material.resolveRefs`; the job stores a manifest (refs plus hashes). Favourites are in the manifest but ignored. Later-added material is not used. Client name, sector, description and brief are read live at job run time. Renditions live under `cases/{caseId}/assets/{assetId}/renditions/{specHash}.{ext}`, fetched only via `material.getRendition` (signed URL, 15 min max).
- Client intro: one document per client (`client_intro`, `client_event` tables), same lifecycle and approval as a case, filled with 2-3 client images. `composeParts`: with 2+ cases, client intro first, each case's pages minus its own intro pages and Carosello Chiusura (Risultati e testimonial stays), then the client's closing; pages are referenced, never copied.
- Conventions: snake_case singular tables, uuid ids, UTC `timestamptz` shown in Europe/Rome, zod defined once in `domain/`, `Result<T, AppError>` with SCREAMING_SNAKE codes, env only via `src/shared/env.ts`, forward-only migrations with RLS denying anon/authenticated.

## UX & Interaction Patterns

- Wizard step 3 shows "{n} files, {m} of 3 details filled." Generate is disabled without material with the reason linked by `aria-describedby`. After pressing: leave-page copy plus **Back to case studies**; a double click enqueues one job. Failure banner "Generation didn't finish. Your material and details are saved." with **Try again**.
- Table rows update live between generating, in_review and draft; a row in In elaborazione is not clickable and shows "Still generating".
- Toast anywhere in the app: "{Name} is ready to review." with **Open** (table row highlighted for now; configurator after Story 4.2; client page for intros until 4.11). Screen-reader announced, no focus steal, not replayed later, no external notifications.
- Client **Aggiungi** in the side panel opens the client page at once; the draft appears in Da approvare when ready.

## Cross-Story Dependencies

- Order: 3.1 and 3.2 feed 3.3; 3.4 templates and 3.5 renderers build on 3.3; 3.6 then 3.7 and 3.8; 3.10 after 3.5 and 3.11 after 3.10, both before Epic 4; 3.9 follows 3.3-3.8 and replaces 3.11's test text (3.11 owns the client_intro migration).
- Blocked: 3.6/3.7 on which material types the LLM reads and the quality checklist; 3.4/3.9/3.11 on templates from the design team; client material to the LLM on the same decision.
- Needs Epic 2: cases, uploads, clients and client material, details form and Risultati/testimonial (2.21), access/policy seam.
- Feeds Epic 4 (configurator edits the working revision and pages built here), Epic 5 (renderers back preview, export, share) and the guardrail suite.
