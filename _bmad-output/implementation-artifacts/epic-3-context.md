# Epic 3 Context: Generate a graphic case study from the material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer presses Generate on a case with material and can leave. A background worker produces a draft: a challenge / approach / result narrative built only from the case's material, form answers and the client's info. Each format (Presentazione, Carosello, Video) gets its own pages, built from MAC's templates. The case lands in Da approvare and a toast says so. The same pipeline drafts each client's intro-and-outro document. Test text comes first (3.11), and the AI text replaces it later (3.9). Then the owner can lay out and approve client pages before the AI writes them.

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

- Generation is background work. The subject shows "In elaborazione". A failure returns it to Bozza with its material and details intact. There is no ETA or percentage.
- **Gates:**
  - A case needs at least one non-deleted file (`NO_MATERIAL`).
  - A client intro needs at least 2 image rows in `client_asset` (`NO_CLIENT_IMAGES`). The check runs on the server before any job, revision or LLM call.
- The AI never alters graphic assets or template design. Media gets only deterministic processing, and originals are never written.
- The AI writes one text per format. An edit in one format never reaches another.
- **Demo scope:**
  - Nothing sets or reads a per-block `check`.
  - There is no "generated, not checked" marking.
  - Template blocks and pages can be deleted freely and come back via default pages, so document v2 does not require them.
- The generated draft is kept unchanged beside the editable copy. Every transition is an append-only event: `case_event` for cases, `client_event` for client intros.
- **Client intro and outro** are one document per client, with the case lifecycle. One review and one approval cover both.
  - Client info and client material are read live at render time, and AI or test text stays as written.
  - Only an approved intro or outro appears in a client pack or collection.
- **Test text (3.10 for cases, 3.11 for clients):**
  - It is marked "[bozza di prova]" wherever the AI will later write, and it is built from the subject's own fields.
  - No LLM is called.
  - It goes through the normal transitions, so the subject reaches Da approvare.
  - 3.10's dev command refuses the production project ref and has no UI entry point. 3.11 runs from the real **Aggiungi** flow.
- UI strings are Italian, from the single dictionary, and meet WCAG 2.2 AA.

## Technical Decisions

- **Modules:** this is a modular monolith. Cross-module imports go only through `index.ts`, and vendor SDKs live only in adapters. `case-study` owns `client`, `client_asset`, `client_intro`, `client_event` and `revision`.
- **Jobs:**
  - Jobs live in the Postgres `job` table, with idempotent enqueue on (kind, subject, input hash), a lease, and at most 3 attempts before failed.
  - A `generate` job handles both subjects (`case` or `client_intro`).
  - The worker acts as the `system` actor.
  - The UI reads outcomes only through `jobs.getJobsFor`.
- **Lifecycle (AD-3):**
  - The states are draft → generating → in_review → approved, and a failure goes back to draft.
  - Cases change state only through `case-study.transition`. Client intros change only through `case-study.transitionIntro`, with the same states, `head_revision_id` / `approved_revision_id` pointers, compare-and-set on `head_version`, and fork-on-edit rules.
  - A revision belongs to exactly one subject: `case_id` or `client_intro_id`, with a check that exactly one is set.
  - `getLiveRevision(subject)` and `getEditableRevision(subject)` take `{ kind: 'case' | 'client_intro', id }`.
- **Story 3.11 migration (moved here from 3.9):** forward-only, with RLS denying anon and authenticated.
  - `client_intro`: uuid `id`, `client_id` unique (one per client), `status` (the case lifecycle states), `head_revision_id`, `approved_revision_id`, `head_version`, timestamps.
  - `client_event`: append-only, for intro transitions, saves and approvals.
  - `revision.client_intro_id` gets its FK.
- **Document v2:** `CaseStudyDocument` is jsonb, stored as `generated_doc` (immutable) and `doc` (editable). The zod schema is defined once in `domain/`.
  - Its `kind` is `case_history` or `client_intro`. The challenge / approach / result rule applies to `case_history` only.
  - There is one page list per registry format.
  - A page carries `pageKey`, `role` (`intro` | `body` | `outro`), section, background and bento grid, and holds blocks of elements.
  - The document stores no client or case values, only bindings to record fields (AD-22 as amended). Renderers read the current values, and an on-page edit writes back to the record.
  - `relayout` and slot assignment are retired. Pages come from the template version's default pages.
- **Formats:** the registry `rendering/domain/formats.ts` is the only list.
  - Presentazione: 16:9, 1920×1080.
  - Carosello: 1:1, 1080×1080 (Figma frame 1000).
  - Video: 9:16, 1080×1920.
- **Templates** are versioned code under `rendering/templates/{templateId}/v{n}/`. A published version never changes; a change ships as `v{n+1}`.
  - Presentazione default pages: Intro, Contenuti (1, 3 or 5 images), Risultati e testimonial.
  - Carosello default pages: Intro (Copertina, Sfida, Idea), a content page, Risultati e testimonial, Chiusura.
  - Video default pages: Intro, Risultati e testimonial.
- **Client pages (decided 2026-10-28):**
  - The client's intro is the Intro template filled from the client. Its first block reads "01 Cliente", and its texts, images and services come from the client.
  - The client's closing is the Risultati e testimonial template in Presentazione and Video. Carosello also gets the client's own Chiusura ("Al prossimo progetto").
  - Pages use role `intro` or `outro`.
  - Client images: the first 3 images in `client_asset` upload order, favourites first. The old 3-file client limit is gone.
- **Client file (AD-25, `composeParts`):**
  - With 2+ cases, the order is the client intro, then each case's pages, then the client closing.
  - Each case leaves out its own intro pages and its Carosello Chiusura, but keeps its Risultati e testimonial.
  - Case pages are referenced, never copied.
  - Only approved client intros go into packs and collections.
- **Narrative:**
  - The `NarrativeGenerator` port is registered only in the worker, and the Anthropic adapter is the only SDK importer.
  - 3.7 has a text-source seam: test text versus AI. The AI runs when `ANTHROPIC_API_KEY` is set on the worker. 3.11 must stay on test text whatever the key.
  - For 3.9, the client LLM input is only the client's current name, sector, description and brief. The output is intro and outro text only: a headline and a short paragraph each, with `client_field` refs and no layout or asset fields.
- **Conventions:**
  - Tables are snake_case and singular, with uuid ids.
  - Errors are `Result<T, AppError>` with SCREAMING_SNAKE codes.
  - Env vars are read only through `src/shared/env.ts`.

## UX & Interaction Patterns

- **Client side panel, Aggiungi:**
  - It saves the client and starts the intro-and-outro draft in the background.
  - The client page opens at once, with no waiting screen and no **Crea introduzione** or **Genera introduzione** button.
  - The intro appears in Da approvare when ready.
  - The ready toast from 3.8 opens the client page until 4.11 lands, and the configurator after that.
- **Case generation:**
  - Generate is disabled without material, with the reason linked via `aria-describedby`.
  - A double click enqueues only one job.
  - On failure, a banner shows with **Riprova**.
  - A row in In elaborazione is not clickable.
- **Ready toast:** "{Name} is ready to review." with **Open**.
  - It is announced to screen readers, never steals focus, and is not replayed.

## Cross-Story Dependencies

- **Status:**
  - Done: 3.1–3.7 and 3.10.
  - In review: 3.8.
  - Backlog: 3.11, then 3.9.
- **3.11** builds on:
  - 3.3: the revision subject and `client_intro` kind.
  - 3.4: the client default pages.
  - 3.5: the renderers and `composeParts`.
  - 3.7: the generate job and the test-text seam.
  - 3.10: how test text is built.
  - 3.8: the toast.
- **3.9** replaces 3.11's test text with the AI's. 3.11 owns the migration, the **Aggiungi** trigger and the layout.
- **Epic 2:** 3.11 needs the client side panel, `client_asset` client material with favourites, and the client fields and brief.
- **Epic 4 and later:**
  - 4.11 edits and approves the client intro.
  - 4.12 is the client file.
  - 4.8 and 4.9 cover intro approval.
  - 5.9, 5.10 and 6.5 consume approved intros.
- **Blocker:** the epics still list 3.9 and 3.11 as blocked on the design team's client template. The 2026-10-28 decisions (Intro template filled from the client, Risultati e testimonial as the closing) may be enough to proceed; confirm with the owner if in doubt.
