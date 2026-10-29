# Epic 3 Context: Generate a graphic case study from the material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer presses Generate on a case with material and can leave. A background worker produces a draft from MAC templates: a challenge / approach / result narrative built only from the case's material, the form answers and the client's info, laid out in each format's own pages (Presentazione, Carosello, Video). The case then moves to review and the user is told with a toast. The same pipeline drafts a client's intro and outro pages. Sprint 2, due 2026-10-21.

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

- Generation runs in the background. The case shows "In elaborazione" until ready; a failure returns it to Bozza with material and details intact. No ETA or percentage; waiting time is not counted against the hands-on time budget.
- Guardrail: with no material (at least one non-deleted file), nothing is generated, in both the UI and the worker's claim. The form alone is not enough. For a client intro, fewer than 2 client images means no intro.
- Guardrail: the AI never alters graphic assets, the technical substance, or template design. Only deterministic processing is allowed on media (downscale, poster frame, transcode; no crop, recolour, filter or upscaling).
- Narrative: challenge, approach and result always present; covers both technical and graphic side; uses only uploaded material, form answers and client info; must meet the quality checklist; no "verified" labels. Narrative language Italian or English (default Italian). The prompt follows the copywriting guide.
- Demo scope: generated claims carry no check workflow (nothing sets or reads a `check`); output is text only and generation places it into each format's pages.
- Generated draft is kept unchanged next to the editable document. Every transition and action is an append-only event.
- UI strings in Italian via the single dictionary file; WCAG 2.2 AA.
- An empty image block exports transparent.

## Technical Decisions

- Modular monolith; cross-module imports only through each module's `index.ts`; vendor SDKs only in adapters (lint-enforced). Modules involved: generation, rendering, material, jobs, case-study.
- Jobs: Postgres job table (`generate`, `export`, `rendition`), idempotent enqueue via partial unique index, claim with `FOR UPDATE SKIP LOCKED`, 10-min lease renewed each minute, max 3 attempts then `failed` plus a `job_failed` event. Web requests never call the LLM, Chromium or ffmpeg. Worker acts as a `system` actor.
- Status changes only through `case-study.transition` (draft -> generating -> in_review; failure -> draft). Client intros use the parallel `transitionIntro`. Revisions are `working | approved | superseded` with head/approved pointers; only working revisions are writable. Compare-and-set on revision and head versions; a generate result creates a new revision and is discarded on head mismatch.
- `CaseStudyDocument` (zod, jsonb), schema v2 per SCP 2026-10-28: stored twice per revision, `generated_doc` immutable and `doc` editable, with one page list per format. Schema rejects a missing challenge/approach/result. The document stores no client values; client data is filled at render time.
- Format registry in `rendering/domain/formats.ts`; one React renderer per format, shared by configurator, case view, shared links and exports. Preview must match export. Video shows its poster frame in static output; video has animations.
- Templates are versioned code folders `rendering/templates/{templateId}/v{n}/`; a published version is never edited. A version holds per format its layout grids, default pages and text styles (media-count rules, variants, spacing ranges, text scales and font pairings are retired). Source design is the Figma file "MAC-TF-AI"; the mockup `ux-designs/ux-MAC Recap-2026-10-08/mockups/configurator.html` is the reference for values. Default pages: Presentazione has Intro, Contenuti (3 images), Risultati e testimonial; Carosello has Intro (Copertina, Sfida, Idea), a content page, Risultati e testimonial, Chiusura; Video has Intro and Risultati e testimonial.
- Narrative: one `NarrativeGenerator` port, worker only. Anthropic adapter uses `client.beta.messages.parse` with the zod schema, model `claude-opus-5-5` from one constant, adaptive thinking, high effort, refusal fallbacks; `refusal` maps to `LLM_REFUSAL`. Versioned prompt files; each revision records model, `fellBack`, `promptVersion`, `schemaVersion`. Claims tagged `aspect: technical | graphic`; a missing aspect is recorded as `MISSING_ASPECT`, not blocking. Files API not used; respect Anthropic limits (32 MB request, 600-page PDF, no DOCX, no video).
- Material is referenced by `MaterialRef` (asset, form_field, client_field) resolved only via `material.resolveRefs`; generate jobs store a material manifest (refs and hashes) on the revision. Favourites are in the manifest but ignored. The LLM also reads the client's current name, sector, description and brief at job run time.
- Display renditions go under the renditions storage prefix; the private `material` bucket is read only with the service role and signed URLs.
- Client intro and outro: one document per client (kind `client_intro`, pages with role `intro`/`outro`), generated from client info and brief plus its material as allowed, using 2-3 client images; same lifecycle and approval as a case.
- Conventions: snake_case singular tables, uuid ids, UTC `timestamptz` shown in Europe/Rome, zod single definition in `domain/`, `Result<T, AppError>` with SCREAMING_SNAKE codes, structured logs without material or prompts, env read only in `src/shared/env.ts`.

## UX & Interaction Patterns

- Wizard step 3 Generate: summary "{n} files, {m} of 3 details filled."; Generate disabled without material, with the reason linked via `aria-describedby`; processing state with leave-page copy and a Back to case studies action; failure banner "Generation didn't finish. Your material and details are saved." with Try again.
- Draft-ready toast anywhere in the app: "{Name} is ready to review." with Open (toast and polling are UX-proposed). Until the client configurator exists, the intro-ready toast opens the client page.
- Status badge is colour plus text (Bozza, In elaborazione, Da approvare, Approvato).

## Cross-Story Dependencies

- Order: 3.1 and 3.2 feed 3.3 (document, registry); 3.4 templates and 3.5 renderers build on 3.3; 3.6 generator port, then 3.7 generate and 3.8 toast; 3.9 client intro follows 3.3-3.8; 3.10 dev test draft comes after 3.5 and 3.11 after 3.10, both before Epic 4.
- Blocked: 3.6/3.7 on the decision about which material types the LLM reads and the narrative quality checklist; 3.9/3.11 on the client template from the design team (and whether client material goes to the LLM).
- Depends on Epic 2: cases, uploads, clients and client material, details form, and the access/policy seam.
- Feeds Epic 4 (configurator edits the working revision and the pages built here), Epic 5 (renderers back preview, export and share), and the guardrail suite (no-material, no-overwrite, approval gates).
