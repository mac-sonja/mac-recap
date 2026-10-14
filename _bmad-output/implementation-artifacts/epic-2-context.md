# Epic 2 Context: Create a case study and collect its material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer creates a case study by hand, gets a permanent ID, uploads project files, marks favourite images and videos, and fills in an optional details form. Everything is saved in Supabase and a private EU S3 bucket, inside an environment gated by basic auth because real client material is in use. The epic also lays the foundation every later epic builds on: the pinned starter scaffold, the module skeleton with enforced boundaries, the actor and policy seam with a dev actor, the basic-auth gate, the append-only event log, the app shell with design tokens and Italian copy, and a basic Case studies table. Sprint 1, due 2026-10-14. A sprint change approved on 2026-10-14 replaced tags with favourites, dropped pasted text, and removed undo on file removal.

## Stories

- Story 2.1: Scaffold the app from the starter and pin the stack
- Story 2.2: One gated image, deployable to staging
- Story 2.3: Actor and policy seam with a dev owner/designer
- Story 2.4: App shell: navigation, tokens, Italian copy, status badge
- Story 2.5: Create a case study with a permanent ID
- Story 2.6: Find and reopen case studies in the table
- Story 2.7: Upload project files
- Story 2.8: Retire pasted text and the taxonomy
- Story 2.9: Mark images and videos as favourite
- Story 2.10: Fill in the details form

## Requirements & Constraints

- The case ID is a database-generated uuid. It is immutable, never reused, and the only identifier exposed to other systems. `project_order_ref` exists, stays null, and has no UI in the MVP.
- Material means uploaded files only: images, videos, text documents and PDFs. A case can hold at most 20 non-deleted files of at most 100 MB each, of an allowlisted type (JPEG, PNG, WebP, MP4, MOV, PDF, plain text, Markdown, DOCX). A file that breaks a limit is rejected on its own; the other files still upload.
- Any number of images and videos can be marked favourite, and none are required. PDFs and documents can't be marked. Favourites are stored and shown, but generation ignores them for now (interim rule; open point 14).
- The details form (context, solution, results) is optional. It is the only place for typed project text and never counts as material. `hasMaterial` is true only when the case has at least one non-deleted asset.
- Upload, removal, favourite changes and form saves never change case status. Removal is a soft delete (`deleted_at`) and is never a hard delete.
- Status lifecycle (interim): `draft` Bozza → `generating` In elaborazione → `in_review` Da approvare → `approved` Approvato. Only `draft` is used in this epic.
- Guardrails: no role, admin included, can change permissions or guardrails, and no setting, table or env var can change them.
- Every deployed environment, `/s/` paths included, sits behind HTTP basic auth until Epic 6. The web process refuses to start if the auth variables are missing.
- The UI is in Italian, through one dictionary file. Each case has a narrative locale, `it` or `en`, defaulting to `it`. The app targets desktop web: 1440 px primary, 1280 px minimum. Accessibility target is WCAG 2.2 AA.
- Data lives in Supabase and files in AWS S3, both in the EU. The MVP code makes no calls to MAC Productive.

## Technical Decisions

- **Stack:** pinned exactly, with no `^`, `~` or `latest`. Node 24 LTS, Next.js 16.3.8 (`output: 'standalone'`, `cacheComponents` off), React 19.3.0, TypeScript 6.0.3, Tailwind 4.3.3, shadcn 4.21.4, supabase-js 2.117.3, ssr 0.12.7, Supabase CLI 2.120.0, AWS SDK 3.1147.0, zod 4.6.5, Playwright 1.63.0, sharp 0.35.5.
- **Modular monolith:** the modules are `case-study`, `material`, `generation`, `rendering`, `sharing`, `access` and `jobs`, each with `domain/`, `application/` and `index.ts`. `ports/` and `adapters/` exist only at vendor seams. Code imports another module only through its `index.ts`, vendor SDKs appear only in `adapters/`, and `domain/` imports only from `src/shared`. Lint enforces these rules. `src/modules/integration` is reserved for Epic 7.
- **Shared conventions:** `src/shared/env.ts` is the only reader of `process.env` and validates it with zod. Errors use `Result<T, AppError>` with SCREAMING_SNAKE codes. Logs are structured JSON with `caseId`, `jobId` and `actorId`, and never contain material. Tables are snake_case and singular, with uuid ids and `timestamptz` stored in UTC and shown in Europe/Rome. zod schemas live in `domain/`, and DB types are generated into `src/shared/db.types.ts`.
- **Server actions:** every action first calls `access.getActor()` and then `access.authorize(actor, action, resource)`. A denial returns `FORBIDDEN` (HTTP 403) before the use case runs. The permission matrix exists only as code in `access/domain/policy.ts`. Until Epic 6 the actor is a seeded dev `owner_designer`, and the role is read from `profile` on every request. A `system` profile exists for the worker.
- **Data access:** server-only, using the service-role key, which is read only in `env.ts` and in adapters. RLS is enabled on every table, with no access for `anon` or `authenticated`. The browser never queries tables directly.
- **Status changes:** only `case-study.transition(caseId, event, actor)` writes `case_study.status`. It writes the status and its event in one transaction.
- **Event log:** `case_event` (`case_id`, `revision_id`, `actor_id`, `type`, `at`, `data`) is append-only, and the database rejects UPDATE and DELETE. Every mutation writes its event, including create, upload confirmation, removal, favourite change and form save.
- **S3:** the bucket is private and in the EU, with Block Public Access, versioning, and CORS limited to the app origin. Browsers upload directly with a presigned POST (`content-length-range` 100 MB, allowlisted `Content-Type`, `requestChecksumCalculation: "WHEN_REQUIRED"`). The server creates the asset row only after a HEAD check and a second check of the 20-file cap. Presigned GETs last at most 15 minutes. Keys follow `cases/{caseId}/assets/{assetId}/original.{ext}` and are built only in `material/adapters`. Supabase Storage is not used.
- **Material refs:** `MaterialRef { kind: asset | form_field, id }`, resolved only through `material.resolveRefs`. Form fields use the stable keys `context`, `solution` and `results`.
- **Migrations:** forward-only SQL. Never edit an applied migration. Deploys apply migrations to staging before the new image starts, and to prod only after staging. Each story creates the tables it needs.
- **Deployment:** one Docker image on `mcr.microsoft.com/playwright:v1.63.0-noble` with ffmpeg pinned, and two processes: `node server.js` and `node dist/worker.js`. Staging has its own Supabase project and bucket. The EU container host is still undecided, which blocks only the "deployed to staging" criterion.

## UX & Interaction Patterns

- **App shell:** a left sidebar with **+ New case study**, Case studies and the user menu. Controls a role can't use are absent, not disabled. Opening a forbidden URL redirects to the role's landing page, which `access` defines once. The sidebar collapses to icons at 1024–1279 px.
- **Design tokens:** the names are fixed (colours, `status-*`, typography roles including `mono`, rounding) and start with placeholder values. They never style template output.
- **`StatusBadge`:** always shows a colour token together with a text label, never colour alone.
- **Accessibility:** focus is always visible via `focus-ring`. Dialogs trap focus and return it on close, and stack at most one level deep.
- **Wizard:** full-screen, with a back arrow and no sidebar. Step 0 asks for name and client (both required) and the year, which defaults to the current year. The case is created at once and shows its mono ID and the Bozza badge in the header. Leaving and returning loses nothing.
- **Step 1, Material:**
  - Dropzone plus **browse**, with accepted-type chips and the copy "Up to 20 files, 100 MB each." There is no pasted-text input.
  - Files upload in parallel, each with its own progress bar.
  - Rejections appear inline on the file's row, and screen readers announce both progress and rejections.
  - Each row shows a thumbnail (images: the original scaled by the browser, never cropped; other types: a type icon), the name, the size, a remove action, and a **Preferito** toggle on images and videos only.
  - Removal is immediate, with no confirm and no undo.
  - **Avanti** stays inactive until the first file has uploaded.
- **Step 2, Details:** three textareas (Context, Solution, Results), each with a one-line prompt as placeholder. The footer counter reads "{n} di 3 compilati". Fields save on pause or blur, and **Avanti** is active from the start.
- **Case studies table:**
  - Columns: ID (mono), Name, Client, Year, Status, Updated, Links. Default sort is Updated, newest first, and clicking a header sorts by that column.
  - Search runs after about 250 ms of debounce over name, client and ID, ignoring case and accents. `/` focuses the search field.
  - Shows skeleton rows on first load and has its own empty and no-results states.
  - Clicking a Bozza row opens the wizard at its first incomplete step.
  - Below 1024 px the table is read-only, and the wizard shows "needs a larger screen".

## Cross-Story Dependencies

- Stories 2.1–2.4 are the foundation. Every later story relies on the module layout, `env.ts`, `Result`, the policy seam, the dictionary and the tokens.
- Story 2.5 creates `case_study`, `case_event` and `transition`, which every material story uses.
- Story 2.8 (cleanup migration) lands before 2.9. The UI parts of 2.7 and 2.10 follow 2.9.
- Story 2.10's first-incomplete-step routing completes the row click from Story 2.6.
- Later epics build on Epic 2:
  - Epic 3's generation gate reuses `hasMaterial`, and its manifest carries `MaterialRef`s and favourites.
  - Story 4.1 adds the status filter, row actions, delete and the To review queue to the table.
  - Epic 6 swaps only how `getActor()` resolves the actor, and retires the basic-auth gate.
