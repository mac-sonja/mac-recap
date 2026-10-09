# Epic 2 Context: Create a case study and collect its material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer creates a case study by hand, gets a permanent ID, uploads project files and pasted text, tags each deliverable from a fixed list and fills in an optional details form, all stored in Supabase and a private EU S3 bucket inside a gated environment. Epic 2 also lays the foundation every later epic depends on: the pinned starter scaffold, module boundaries, the actor/policy seam with a dev actor, the basic-auth gate, the append-only event log, the app shell with design tokens and Italian copy, and a basic Case studies table. Sprint 1, due 2026-10-14.

## Stories

- Story 2.1: Scaffold the app from the starter and pin the stack
- Story 2.2: One gated image, deployable to staging
- Story 2.3: Actor and policy seam with a dev owner/designer
- Story 2.4: App shell: navigation, tokens, Italian copy, status badge
- Story 2.5: Create a case study with a permanent ID
- Story 2.6: Find and reopen case studies in the table
- Story 2.7: Upload project files
- Story 2.8: Add pasted text as material
- Story 2.9: Tag, property and flag deliverables
- Story 2.10: Fill in the details form

## Requirements & Constraints

- **Case ID:** a DB-generated uuid that is immutable and never reused, and the only identifier exposed externally. `project_order_ref` exists but stays null, with no UI. There is no automatic trigger at project close.
- **Upload limits:** at most 20 non-deleted files per case, 100 MB each, allowlisted types only (JPEG, PNG, WebP, MP4, MOV, PDF, plain text, Markdown, DOCX). A bad file is rejected inline without blocking the others. Limits must also hold when the UI is bypassed, enforced by S3 policy and the confirm step. Pasted text items do not count toward the 20-file cap.
- **Material vs. form:** material is a non-deleted asset or a non-empty text item. The details form (context, solution, results; all optional) is never material, even when filled in, but it can be cited as a claim source later. `hasMaterial(caseId)` is the single check that Epic 3's generation gate reuses.
- **Taxonomy:** tags, properties and flags come only from a fixed seeded list, with no free text. Tagging is optional, and untagged deliverables show a marker. The values are still pending a decision due 2026-10-14. Until they arrive, the pickers use whatever is seeded, an empty kind shows "No values yet", and the final values arrive by a new seed migration only.
- **Status:** uploading, tagging or editing details never changes case status. New cases start in `draft` (labels: Bozza / In elaborazione / Da approvare / Approvato, an interim decision).
- **Event log:** every mutation appends a `case_event` row with its actor (create, transition, upload confirm, removal, text add, details save). The log is append-only and the DB rejects UPDATE/DELETE. The tool records no hands-on time.
- **Gating:** every deployed environment sits behind HTTP basic auth until login ships in Epic 6, including `/s/*`. The web process refuses to start if the credentials are missing.
- **Data residency:** data stays in Supabase (EU) and files in a private S3 bucket (EU). The app is standalone, with no calls to MAC Productive and no `integration` module or MCP client.
- **Platform:** desktop web at 1440 px primary and 1280 px minimum, WCAG 2.2 AA, Italian UI through one dictionary file. Narrative locale is per case (it | en, default it).

## Technical Decisions

- **Stack pinned exactly** (no `^`/`~`/latest): Node 24 LTS, TS 6.0.3, Next 16.3.8 (`output: 'standalone'`, `cacheComponents` off, all pages dynamic), React 19.3.0, Tailwind 4.3.3 (upgraded from the starter's 3.4), shadcn 4.21.4, supabase-js 2.117.3 / ssr 0.12.7 / CLI 2.120.0, AWS SDK v3 3.1147.0, `@anthropic-ai/sdk` 0.132.1, zod 4.6.5, Playwright 1.63.0, sharp 0.35.5. ffmpeg is pinned in the Dockerfile. The starter is `npx create-next-app -e with-supabase`.
- **Modular monolith:** `src/{app,worker,shared}` plus `modules/{case-study,material,generation,rendering,sharing,access,jobs}`, each with `domain/`, `application/` and `index.ts`. `ports/` and `adapters/` exist only at vendor seams. A lint rule enforces three things: imports go only through a module's `index.ts`, vendor SDKs are imported only in `adapters/`, and `domain/` imports only `src/shared`. `src/modules/integration` is reserved for Epic 7.
- **Table ownership** (nobody else writes them): `case-study` owns `case_study`, `revision`, `case_event`. `material` owns `asset`, `text_item`, `context_form`, `taxonomy_term`, `material_term` and S3 `cases/{caseId}/assets/**`. `access` owns `profile`.
- **Authorization:** every server action or route calls `access.getActor()` then `access.authorize(actor, action, resource)` before the use case. A denial returns 403 `{ error: { code: 'FORBIDDEN' } }`. The full role matrix lives only in `access/domain/policy.ts` as code. No table, env var or API changes it, and "change permissions or guardrails" is denied to every role. The role is read from `profile` on every request. Until Epic 6, `getActor()` returns a seeded dev `owner_designer`. A seeded `system` profile serves the worker.
- **Data access:** server-only, using the service-role key, which only `env.ts` and adapters may read. RLS is enabled on every table and denies `anon` and `authenticated`. The browser never queries Supabase.
- **Lifecycle:** `case_study.status` changes only via `case-study.transition(caseId, event, actor)`, which writes the status and the event in one transaction. Delete is soft (`deleted_at`) and allowed only in `draft`. Material is soft-deleted only.
- **S3 (AD-8):** the bucket is private, in the EU, with Block Public Access and versioning on, and CORS allows only the app origin for POST/GET. Uploads go browser → S3 via a presigned POST issued after `authorize`, with `content-length-range` ≤ 100 MB and the allowlisted `Content-Type`. The signing client sets `requestChecksumCalculation: "WHEN_REQUIRED"`. The cap is checked at issue and again at confirm. An `asset` row is created only after a HEAD check of size and type. Reads use presigned GET valid for ≤ 15 min. Keys follow `cases/{caseId}/assets/{assetId}/original.{ext}` and are built only in `material/adapters`. Supabase Storage is not used.
- **Material refs:** use `MaterialRef { kind: 'asset' | 'text' | 'form_field', id }`, resolved only by `material.resolveRefs`. Form fields use the stable keys `context`, `solution`, `results`, and any other key is rejected.
- **Taxonomy:** `taxonomy_term(kind tag|property|flag, unique key, label)` plus `material_term` links. Code refers to terms by `key` only, never by label.
- **Conventions:** snake_case singular tables. uuid ids via `gen_random_uuid()`. `timestamptz` in UTC, displayed in Europe/Rome. zod schemas in `domain/` are the single definition. Generated DB types go to `src/shared/db.types.ts` (adapters only). Use cases return `Result<T, AppError>` with SCREAMING_SNAKE codes. Logs are structured JSON (`caseId`, `jobId`, `actorId`) and never contain material or prompts. `process.env` is read only in `src/shared/env.ts` (zod-validated), and secrets never carry `NEXT_PUBLIC_`.
- **Deployment:** one Docker image on `mcr.microsoft.com/playwright:v1.63.0-noble` with two processes, `node server.js` and `node dist/worker.js` (the worker idles for now). Environments are local, staging and prod (from Epic 6), each with its own Supabase project and bucket. Migrations are forward-only SQL in `supabase/migrations/`, applied with `supabase db push` to staging and then prod, before the image. Each table is created by the first story that needs it.

## UX & Interaction Patterns

- **Shell:** a left sidebar with + New case study, Case studies and the user menu (To review arrives in Story 4.1). Controls a role can't use are absent, not disabled. A direct URL to a forbidden surface redirects to the role's landing page, defined once in `access`. The sidebar collapses to icons at 1024–1279 px. The wizard is full-screen with a back arrow. Dialogs stack at most one deep, trap focus and return it on close.
- **Tokens:** DESIGN.md fixes the token names; their values are TBD. Create every token as a theme variable with a placeholder: the colours `surface`, `surface-raised`, `foreground`, `foreground-muted`, `border`, `primary`, `primary-foreground`, `focus-ring`, `danger` and `status-draft|generating|review|approved`; the typography roles display, heading, body, label and mono; and rounding. Tool tokens never style template output. The status badge always pairs colour with a text label.
- **Copy:** every UI string comes from the Italian dictionary, never hard-coded. Use plain verbs and no exclamation marks.
- **Wizard step 0:** name and client are required, and year defaults to the current year. Add a narrative-language select defaulting to Italiano; this is a UX gap to flag. The ID shows in `mono` in the header and the case saves as Bozza at once. Leaving loses nothing.
- **Wizard step 1, Material:** a dropzone plus browse, with the copy "Up to 20 files, 100 MB each." Uploads run in parallel with per-file progress announced to screen readers, and rejections appear inline per row. Deliverable rows show a thumbnail, name, size, chip pickers and an "untagged" marker. Remove has a 5 s Undo toast and no confirm. A Paste text control sits beside browse; this is a UX gap to flag. Next: Details is enabled once `hasMaterial` is true.
- **Wizard step 2, Details:** Context, Solution and Results textareas, each with a one-line prompt and a "{n} of 3" counter. Each field saves on pause or blur.
- **Case studies table:** columns ID (mono), Name, Client, Year, Status, Updated and Links (blank for now). The default sort is Updated, newest first, and a header click toggles the sort. Search covers name, client and ID with a ~250 ms debounce and is case- and accent-insensitive. `/` focuses search. Skeleton rows show on first load. The empty and no-results copy is in the stories. A Bozza row opens the wizard at its first incomplete step.

## Cross-Story Dependencies

- Story 2.1 must come first. Story 2.3 (actor/policy) and Story 2.4 (shell, dictionary, tokens) are prerequisites for every UI or action story. Story 2.5 creates `case_study` and `case_event`, which all later stories log to.
- Story 2.6's Bozza row click is completed by Story 2.10 (open at the first incomplete step). Stories 2.8 and 2.10 both rely on `hasMaterial`.
- Downstream:
  - Epic 3's generation gate reuses `material.hasMaterial` and `resolveRefs`.
  - Story 4.1 adds the status filter, row actions, delete and the To review queue.
  - Stories 5.1 and 6.3 register the library and Users landing routes.
  - Epic 6 swaps only the `getActor()` resolver and retires the basic-auth gate.
- **Open blockers:**
  - Story 2.2's staging deploy waits on the choice of an EU container host, due end of Sprint 1.
  - The taxonomy seed values wait on a decision due 2026-10-14.
