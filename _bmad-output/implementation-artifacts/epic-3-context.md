# Epic 3 Context: Generate a graphic case study from the material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer presses Generate and can leave: a worker builds a draft from MAC templates, with a challenge / approach / result narrative written only from this case's material, form answers and the client's current info, laid out for every MVP format and adapted to the media count, and the case lands in To review with a toast. The epic also delivers the foundations Epic 4 edits (display renditions, the case study document and revisions, versioned templates, one renderer per format) and the client intro draft. Because the narrative guidelines and quality checklist are late while the graphic template is ready, Sprint 2 now runs 3.2 → 3.3 → 3.4 → 3.5 → 3.10 → (Bento configurator design session with the owner) → 4.1–4.8 → 3.6 → 3.7 → 3.8 → 3.9 → 4.11 → 4.9 → 4.12. This relaxes "epics run one after another" for Epics 3 and 4 only; every story still depends only on stories built before it.

## Stories

- Story 3.1: Background job queue and worker loop (done)
- Story 3.2: Display renditions for uploaded media
- Story 3.3: The case study document, revisions and the format registry
- Story 3.4: Templates as versioned code with media-count rules
- Story 3.5: One renderer per format
- Story 3.10: Test draft without AI (dev only; after 3.5, before 4.1)
- Story 3.6: Narrative generator port and Anthropic adapter
- Story 3.7: Generate a case study
- Story 3.8: Tell me when the draft is ready
- Story 3.9: Client intro template and draft

## Requirements & Constraints

- **Guardrails (code, never DB/env/UI, each with an automated test):** AI never alters graphic assets, technical substance or template design. With no material (no non-deleted asset) nothing is generated: `NO_MATERIAL` before any job or LLM call, checked by the button, the action and the worker on claim. The details form and client info never count as material. A client intro needs at least 2 client images (`NO_CLIENT_IMAGES`).
- **Allowed media processing:** renditions only downscale the whole image (never upscale, crop, recolour or filter) and make video poster frames/transcodes. Originals are only read. Media are placed whole (fit, no stretch, no crop); adaptation and Shuffle pick only among designed variants.
- **Narrative:** challenge, approach and result are always present and in order (for `case_history`); claims are tagged `technical` or `graphic`, and missing one marks the draft `MISSING_ASPECT` (a warning, not blocking). Every claim starts `provenance: generated`, `check: null`; never labelled "verified". Text in the case's `locale` (it default, or en).
- **Formats (interim):** Deck 16:9 (1920×1080, PDF), Social carousel 4:5 (1080×1350, ZIP of PNGs), PDF A4 portrait (PDF). No canvas-ratio field anywhere.
- **Client info is live:** the About block (logo, name, up to four industries, description ≤400 chars, all required) is filled at render time from the client's current values. No client value is stored in a job, revision, manifest or document; a client edit shows everywhere without regeneration or re-approval.
- **Waiting is off the clock:** generation time is unbounded; the UI shows no ETA or percentage. Status lifecycle: Bozza → In elaborazione → Da approvare → Approvato; a failed generation returns to Bozza with material and details untouched.
- **Story 3.10:** dev command only, no UI entry point, no LLM call; refuses the production project ref; runs on mac-recap-dev or local. It drives the normal transitions with the dev actor, writes a `working` revision with placeholder text marked "[bozza di prova]" citing the case's own form answers or files, lays out every MVP format, and the case appears in Da approvare.
- **Blocked inputs:** 3.4/3.5 need the final templates (About area, `pageKey`s and intro pages, the overflow rule); the zero-media rule (A4) has no interim rule. 3.6/3.7 need the data-processing rule (which material types the LLM reads, OP 2) and the NFR5 quality checklist. 3.9 needs the client intro template. Favourites are stored but ignored by generation.

## Technical Decisions

- **Modules:** modular monolith (`case-study`, `material`, `generation`, `rendering`, `jobs`, `access`, …); cross-module imports only through `index.ts`; vendor SDKs only in `adapters/`. Web request paths never import the LLM, Chromium, sharp or ffmpeg adapters; that work runs in the worker as the `system` actor.
- **Jobs (3.1):** `job` kinds generate | export | rendition, idempotent enqueue on `(kind, subject_id, input_hash)`, `jobs_claim()` with `SKIP LOCKED`, 10-min lease renewed every minute, max 3 attempts then `failed` + `job_failed`. UI reads outcomes only through `jobs.getJobsFor(subjectId)`.
- **Renditions:** stored at `cases/{caseId}/assets/{assetId}/renditions/{specHash}.{ext}` in the private `material` bucket (Supabase Storage, EU); only `material` builds these keys; others call `material.getRendition(assetId, spec)` for a signed GET URL ≤ 15 min. sharp 0.35.5; ffmpeg pinned in the Dockerfile.
- **Document:** `CaseStudyDocument` zod schema in `generation/domain` with `schemaVersion`, `templateId@version`, `kind` (`case_history | client_intro`), shared part (blocks with stable `blockId`, claims, check state, media set) and per-format part (variant, slot → assetId, spacing, text scale, font pairing). `upgrade(doc)` on read, never written back to a non-working revision.
- **Revisions:** `revision` table (exactly one of `case_id` / `client_intro_id`, status working | approved | superseded, `version`, immutable `generated_doc`, editable `doc`, `manifest`, `model`, `fell_back`, `prompt_version`, `schema_version`). Reads via `getLiveRevision(subject)` / `getEditableRevision(subject)`. Compare-and-set on `revision.version` (`STALE_REVISION`) and `case_study.head_version` (`STALE_HEAD`); a generate result is a new revision, discarded on head mismatch. Per-format entries fixed at creation (`FORMAT_NOT_IN_REVISION`).
- **Format registry:** `rendering/domain/formats.ts` is the only list of formats.
- **Templates:** code in `src/modules/rendering/templates/{templateId}/v{n}/`; published versions never change (hash-list test); no design values in the DB. `rendering.listVariants(templateId, format, mediaCount)` is the only variant source; `rendering.relayout(doc, template)` is the only, pure, deterministic slot-assignment code. Every page has a stable `pageKey` and `role` (`intro | body`).
- **Renderers:** one React renderer per format, a pure function of (document, format, template, asset URLs, current client info); identical output via `renderToStaticMarkup`; template styles, not tool tokens; per-block/page overflow result; never shrink below template minimum; accepts a starting page number. SVG logos are drawn through `<img>` and rasterised at render time with external entity loading and network off; the stored SVG is never rewritten.
- **LLM adapter:** `NarrativeGenerator` port, worker only, sole importer of `@anthropic-ai/sdk`; `client.beta.messages.parse` with the zod schema, model constant `claude-opus-5-5`, adaptive thinking, `effort: "high"`, server-side refusal fallbacks; no tools; `refusal` → `LLM_REFUSAL`; versioned prompt files; respects the 32 MB / 600-page limits by extracting or splitting; no Files API; no prompts or material in logs. Output has only narrative text (no layout, asset or `about` field); `sourceRefs` must be in the manifest or be `client_field` refs.
- **Conventions:** forward-only migrations creating tables/prefixes in the first story that needs them; RLS denies `anon` and `authenticated`; `Result<T, AppError>` with SCREAMING_SNAKE codes; `access.getActor()` + `authorize()` on every action; `case_event` rows for every mutation; Italian copy from the dictionary.

## UX & Interaction Patterns

- Wizard step 3 shows "{n} files, {m} of 3 details filled."; Generate is disabled without material, with the reason linked via `aria-describedby`; the processing state invites leaving the page (Back to case studies); failure banner with Try again (no re-upload).
- Case studies table rows update live between In elaborazione, Da approvare and Bozza; clicking an In elaborazione row does nothing ("Still generating").
- Material-step thumbnails switch to renditions once available, with a type icon while pending.
- Draft-ready toast "{Name} is ready to review." with Open, within one polling interval, announced to screen readers without taking focus; not replayed later; no email or Slack. Open goes to the highlighted table row until Story 4.2 retargets it.
- Client intro: "Stiamo preparando l'introduzione di {client}." then opens the intro by itself (client page until 4.11); Riprova after failure.

## Cross-Story Dependencies

- 3.2 hooks on asset upload confirmation (2.7) and uses the 3.1 queue; its renditions feed renderers, the configurator and shared links.
- 3.3 adds the FKs from `case_study.head_revision_id` / `approved_revision_id` (from 2.5); `client_intro` table and its FK arrive with 3.9.
- 3.4 depends on 3.3 and the owner's graphic template; 3.5 on 3.4. 3.10 uses 3.3–3.5 to unblock Epic 4 (4.1–4.8) before AI exists.
- 3.7 depends on 3.6, 3.4 and 3.5; 3.8 on 3.7; 3.9 on 2.15, 2.16 and 3.3–3.8. Story 4.2 retargets 3.8's Open; 4.11 retargets 3.9's landing.

Source gaps: the rendition spec sizes, video transcode settings and the toast polling interval are not defined in the planning docs; Story 3.10 and the new order come from the Sprint Change Proposal 2026-10-20 (PR #61, merged) and are in epics.md and sprint-status.yaml.
