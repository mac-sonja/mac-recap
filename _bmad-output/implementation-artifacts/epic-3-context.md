# Epic 3 Context: Generate a graphic case study from the material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer presses Generate on a draft case and can leave. A background worker turns this case's uploaded material and details-form answers into a challenge / approach / result narrative, lays it out with MAC's coded templates for every MVP format (adapted to the number of images and videos), and moves the case to Da approvare with an in-app toast. The epic also lays the foundation Epics 4 and 5 rely on: the job queue, display renditions, the revisioned case study document, the format registry, templates and the one-renderer-per-format rule. Several stories depend on non-dev inputs that haven't arrived yet (final templates and layouts, the narrative quality checklist, the data processing rule); those stories can be built up to that point but can't close without them.

## Stories

- Story 3.1: Background job queue and worker loop
- Story 3.2: Display renditions for uploaded media
- Story 3.3: The case study document, revisions and the format registry
- Story 3.4: Templates as versioned code with media-count rules
- Story 3.5: One renderer per format
- Story 3.6: Narrative generator port and Anthropic adapter
- Story 3.7: Generate a case study
- Story 3.8: Tell me when the draft is ready
- Story 3.9: Client intro template and draft (Phase 2, after the demo; SCP 2026-10-16 client intro and collections)

## Requirements & Constraints

- **No material, no generation (guardrail).** Generation needs at least one non-deleted asset. The details form alone is never enough, and form text is not material. The same check backs the Generate button, the server action (`NO_MATERIAL` before any job or LLM call) and the worker when it claims the job.
- **The AI never alters assets or template design (guardrail).** Renditions only downscale whole images (no upscaling, crop, recolour or filter) and make video poster frames and transcodes, with no AI involved. Originals are only read. Layout adaptation and Shuffle choose only among designed variants. Media are placed whole (fit, no stretching).
- **Narrative from this case only.** Only manifest items, form answers and the client's current name, sector and description (read when the job runs) are input; client info never counts as material. The output has challenge, approach and result, always present and in that order. It covers both technical and graphic aspects; if one is missing the document is marked `MISSING_ASPECT`, which is recorded and shown later, not blocking (interim). Generated text is never labelled "verified".
- Generation time has no limit and doesn't count toward hands-on time. A failure returns the case to Bozza with material and details intact.
- Narrative language is the case `locale` (it|en, default it). UI copy is Italian, from the dictionary.
- Favourites are carried in the manifest but ignored by generation (interim).
- Formats (interim): Deck 16:9 1920×1080 → PDF; Social carousel 4:5 1080×1350 → ZIP of PNGs; PDF A4 portrait → PDF.
- Guardrails are code with automated tests, never DB, env or UI settings, so the end-of-Sprint-2 guardrail check runs on the pre-login build.
- **About the client block (AD-22, live).** Every format shows the client's logo, name, sector and description as they are now. There is no client snapshot in the job, the revision or the document: renderers get the client's current info at render time (`case-study.getClientInfoForCase(caseId)`, a live read), so a client edit shows at once in drafts and approved case histories alike. The LLM never writes the block; it isn't a text block, has no check and no claims, and is hidden when the client has no description, sector or logo. Claims may cite `client_field` refs (`description`, `sector`), resolved against the client's current values. Templates fit a 400-character description in every format.
- **Client intro (Phase 2, AD-23).** A client has one intro, a document of kind `client_intro` with the case lifecycle, generated only with 2+ client images (`NO_CLIENT_IMAGES`). The LLM writes only a headline and one short paragraph from the client's current name, sector and description; layout is `relayout` over the images. It is checked and approved like a case history; only an approved intro appears in client packs and collections. Its events go to `client_event`.
- Every mutation emits an append-only `case_event`. `generated_doc` is kept next to the editable doc for the validation measures.

## Technical Decisions

- **Jobs:** Postgres `job` table (kinds `generate | export | rendition`). Idempotent enqueue via a partial unique index on `(kind, subject_id, input_hash)` while queued or running. `jobs_claim()` uses `FOR UPDATE SKIP LOCKED` with a 10-min lease renewed every minute (the lease detects crashes, it is not a timeout). Max 3 attempts, then `failed` + `job_failed`. The UI reads outcomes only through `jobs.getJobsFor(subjectId)`. Web requests never import the LLM, Chromium, sharp or ffmpeg adapters (enforced by test or lint).
- **Worker actor:** the worker uses the `system` actor via a public resolver on `access.index` (seeded profile). Nothing outside `access` hard-codes its id. Every action still calls `getActor()` + `authorize()`.
- **Renditions:** stored at `cases/{caseId}/assets/{assetId}/renditions/{specHash}.{ext}`. Only `material.getRendition(assetId, spec)` builds keys and returns signed GET URLs (≤ 15 min).
- **Document and revisions:** `CaseStudyDocument` is a zod schema in `generation/domain`: `schemaVersion`, `templateId@version`, a shared part (blocks with stable `blockId`, claims with `aspect`, `provenance`, optional `sourceRefs: MaterialRef[]`, `check | null`, media set) and a per-format part (variant, slot → assetId, spacing, text scale, font pairing). No canvas ratio anywhere. The `revision` table (`working | approved | superseded`, `version`, `generated_doc` immutable by trigger, `doc`, `manifest`, `model`, `fell_back`, `prompt_version`, `schema_version`) adds FKs for `head_revision_id` / `approved_revision_id`. Reads go through `getLiveRevision` / `getEditableRevision` and `upgrade(doc)`, which never writes back to non-working revisions. A format not in the revision → `FORMAT_NOT_IN_REVISION`. **Phase 1 (SCP 2026-10-16 client intro and collections):** the document has `kind` ∈ `case_history | client_intro` (challenge/approach/result enforced only for `case_history`); `revision` has nullable `case_id` and `client_intro_id` with exactly one set (`client_intro_id` stays null until 3.9); `getLiveRevision` / `getEditableRevision` take a subject (`case` or `client_intro`).
- **Format registry:** `rendering/domain/formats.ts` is the only list of formats.
- **Pages (Phase 1):** every template page has a stable `pageKey` and a `role` (`intro` | `body`) from the design team's spec, never changed within a published version. Renderers put both on each page and accept a starting page number, so `rendering.composeParts` can chain documents later.
- **Templates:** code folders `rendering/templates/{templateId}/v{n}/`. A published version is never edited (hash-list test); changes ship as a new version. `rendering.listVariants(templateId, format, mediaCount)` is the only variant source. `rendering.relayout` is a pure, deterministic function and the only slot-assignment code. It never invents assets and leaves text untouched.
- **Renderers:** exactly one React renderer per format: a pure function of (doc, format, template, asset URLs, the client's current info), no data fetching, `renderToStaticMarkup` equal to the client render. It reports overflow per block and page, never shrinks text below the template minimum, shows video as its poster frame, and uses template styles, not tool UI tokens.
- **LLM:** the `NarrativeGenerator` port is worker-only, and its adapter is the only importer of `@anthropic-ai/sdk`. It calls `client.beta.messages.parse` with the zod schema, model `claude-opus-5-5` from one constant, adaptive thinking, `effort: "high"` in `output_config`, and server-side refusal fallbacks. No tools. Prompts are versioned files in `generation/adapters/prompts/`. `refusal` → `LLM_REFUSAL`. A `sourceRef` outside the manifest fails the attempt. Stay within the API limits (32 MB, 600 PDF pages, no DOCX or video input) by extracting or splitting; no Files API. Record the served `model`, `fellBack`, `promptVersion` and `schemaVersion`. Never log prompts, material or responses.
- **Generate flow:** `draft` → `generating` → `in_review`; failure → `draft`. The job payload carries the manifest (refs + hashes) and `baseHeadVersion`. The worker creates a new `working` revision (`generated_doc` = `doc`) and sets the head by compare-and-set. On a head mismatch the result is discarded and the case returns to `draft`. Material added after enqueue is ignored.
- Use `Result<T, AppError>` with SCREAMING_SNAKE codes, migrations forward-only, env only via `src/shared/env.ts` (the Anthropic key isn't defined there yet), and commit CI-generated `db.types.ts`.

## UX & Interaction Patterns

- Wizard step 3 (currently a placeholder): the summary reads "{n} files, {m} of 3 details filled." Generate is disabled without material, with the visible reason linked via `aria-describedby`. While processing it shows leave-page copy and **Back to case studies**, with no ETA or percentage. On failure: the banner "Generation didn't finish. Your material and details are saved." with **Try again** (no re-upload).
- Case studies table rows update live between statuses. Clicking a row in In elaborazione is a no-op with the "Still generating" tooltip.
- The Material step thumbnails switch to renditions once ready, with a type icon while pending.
- Draft-ready toast on any app page within one poll: "{Name} is ready to review." with **Open** (for now: the table with the row highlighted). It is announced to screen readers, doesn't take focus and isn't replayed later. No email or Slack.

## Cross-Story Dependencies

- Phase 1 amendments ride inside 3.3, 3.4 and 3.5. 3.9 (Phase 2) runs after Epic 6 and needs 2.15, 3.3–3.6 and 4.2–4.8; it is blocked on the client intro template and on OP 2 for image input.
- 3.1 comes first: 3.2 and 3.7 run as jobs. 3.3 underpins 3.4–3.7. 3.4 and 3.5 need the final templates (non-dev, Sprint 2), and 3.4 also needs the zero-media rule (IR-A4). 3.6 needs the data processing rule (OP 2) and the quality checklist (NFR5). 3.7 integrates 3.3–3.6. 3.8 follows 3.7.
- From Epic 2: asset upload confirmation (2.7/2.11) enqueues renditions. The wizard step 3 placeholder (2.10) and Story 2.5 close with 3.7.
- Open from Epic 2 deferred work: native dependencies in the worker bundle (sharp, playwright), an init process once ffmpeg or Chromium are spawned, and staging deploy blocked on the EU container host.
- Downstream: Epic 4 retargets the toast's Open to the configurator and reuses the renderers and `relayout`. Epic 5 adds `export` jobs on this queue.
