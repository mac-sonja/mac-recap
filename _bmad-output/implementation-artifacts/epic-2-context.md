# Epic 2 Context: Create a case study and collect its material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer creates a case study by hand, gets a permanent ID, uploads project files, marks favourite images and videos, and fills in an optional details form. Everything is saved in Supabase (database and a private Storage bucket) inside a gated environment. The epic also lays the foundation the later epics build on: the pinned starter scaffold, the module skeleton with lint-enforced boundaries, the actor and policy seam with a dev actor, the basic-auth gate, the append-only event log, the app shell with design tokens and Italian copy, and a basic Case studies table. Sprint 1, due 2026-10-14.

## Stories

- Story 2.1: Scaffold the app from the starter and pin the stack
- Story 2.2: One gated image, deployable to staging
- Story 2.3: Actor and policy seam with a dev owner/designer
- Story 2.4: App shell (navigation, tokens, Italian copy, status badge)
- Story 2.5: Create a case study with a permanent ID
- Story 2.6: Find and reopen case studies in the table
- Story 2.7: Upload project files
- Story 2.8: Retire pasted text and the taxonomy
- Story 2.9: Mark images and videos as favourite
- Story 2.10: Fill in the details form
- Story 2.11: Store project files in Supabase Storage
- Story 2.12: Clients as records, with readable case history codes
- Story 2.13: Clients page

## Requirements & Constraints

- **Manual creation:** name and client are required; the client is picked from the client list (client records, managed on the Clients page), and year defaults to the current year. The ID is a DB-generated uuid that is immutable and never reused. It is the only identifier exposed externally and is used in URLs. Each case also gets a readable case history code (client code, year, number, e.g. `LUM-2026-01`), fixed at creation and never reused (AD-21). `project_order_ref` is nullable and stays unset. There is no trigger at project close.
- **Material is uploaded files only:** at most 20 non-deleted files per case, 50 MB each (the hosted-plan cap, until a move to Pro). Allowlist: JPEG, PNG, WebP, MP4, MOV, PDF, plain text, Markdown, DOCX. A file that breaks a rule is rejected on its own and the other files keep uploading. There is no pasted-text material and no taxonomy (no tags, properties or flags).
- **Favourites:** any number of images and videos can be marked. The mark is optional and never blocks progress. It is stored and shown, but generation does not use it yet.
- **Details form:** three optional fields (context, solution, results). It is the only place for typed project text. It can be cited as a claim source but **never counts as material**: `hasMaterial` is true only when the case has at least one non-deleted asset (guardrail: no material, no generation).
- **Removal:** soft delete only (`deleted_at`). It takes effect at once, with no confirm and no undo. There is no restore feature.
- Uploading, removing a file, toggling a favourite and saving the details never change the case status.
- Every transition, upload confirmation, removal, favourite change and details save writes an append-only `case_event` row with its actor. The tool records no hands-on time.
- **Gated:** until login (Epic 6), every deployed environment, `/s/` included, sits behind HTTP basic auth. The web process refuses to start if the gate variables are missing.
- Data and files live in the EU. The app is standalone from MAC Productive: no MCP client and no `integration` module.
- WCAG 2.2 AA. Desktop web, 1440 px primary, 1280 px minimum. All UI copy is Italian, from one dictionary file. Each case's narrative locale is `it | en`, default `it`.

## Technical Decisions

- **Stack pinned exactly**, with no `^`/`~`: Node 24 LTS, TS 6.0.3, Next.js 16.3.8 (`output: 'standalone'`, `cacheComponents` off), React 19.3.0, Tailwind 4.3.3, shadcn 4.21.4, supabase-js 2.117.3, ssr 0.12.7, CLI 2.120.0, zod 4.6.5, Playwright 1.63.0, sharp 0.35.5. No `@aws-sdk/*`.
- **Modular monolith:** `src/modules/{case-study,material,generation,rendering,sharing,access,jobs}`, each with `domain/`, `application/` and `index.ts`. `ports/` and `adapters/` exist only at vendor seams. Lint enforces three rules: cross-module imports go only through `index.ts`, vendor SDKs appear only in `adapters/`, and `domain/` imports only `src/shared`.
- **Shared:** `src/shared/env.ts` is the only place `process.env` is read (zod-validated). It also holds `Result<T, AppError>` with SCREAMING_SNAKE codes, a structured JSON logger (no material or prompts in logs) and the generated `db.types.ts`.
- **Access:** every action and route calls `access.getActor()` then `access.authorize()`, and returns 403 `FORBIDDEN` before the use case runs. The permission matrix lives only in `access/domain/policy.ts`. No role can change guardrails, admin included. Before Epic 6 the actor is a seeded dev `owner_designer`, read from `profile` on every request. A `system` actor serves the worker. Data access is server-only with the service-role key, and RLS denies `anon` and `authenticated` on every table.
- **Status:** changes only through `case-study.transition(caseId, event, actor)`, which writes the status and its event in one transaction. Epic 2 only creates cases in `draft`. Delete is soft and allowed only in `draft`.
- **Storage (Supabase Storage, `material` bucket):** private, EU region, created by migration with `file_size_limit = 52428800` and `allowed_mime_types` from `material/domain/files.ts`. The service role is the only reader and writer. Upload flow:
  1. The server runs `authorize`, checks the 20-file cap and the type, then issues a signed upload URL (`createSignedUploadUrl`).
  2. The browser PUTs the file directly to that URL.
  3. At confirm, the server re-checks the size and type from the object's metadata, re-checks the cap, then creates the `asset` row.

  Reads use signed GET URLs valid for at most 15 minutes. The key layout is `cases/{caseId}/assets/{assetId}/original.{ext}`, built only in `material/adapters`. Storage has no versioning, so the app never deletes objects. Storage is reached only through the `ObjectStorage` port (`adapters/supabase/object-storage.ts`). No AWS S3.
- **Data:** `case_study` (incl. `locale`, `head_revision_id` / `approved_revision_id` nullable, `head_version`, `deleted_at`); `case_event` (append-only, a trigger rejects UPDATE and DELETE); `asset` (incl. `is_favourite boolean not null default false`, settable only on image and video assets); `context_form` (one row per case, keys `context`, `solution`, `results`); `profile` (role ∈ owner_designer | account_sales_social | admin | system).
- **`MaterialRef { asset | form_field, id }`** resolves only through `material.resolveRefs`. A form_field key must be `context`, `solution` or `results`; any other key is rejected.
- **Conventions:** tables are snake_case and singular, ids are uuid (the case history code is the one human-readable display code, never a key or in URLs), timestamps are `timestamptz` in UTC and displayed in Europe/Rome. zod schemas live in `domain/` as the single definition.
- **Migrations:** forward-only SQL in `supabase/migrations/`, applied to staging before prod. An applied migration is never edited. Each table or prefix is created by the first story that needs it.
- **Deployment:** one Docker image on `mcr.microsoft.com/playwright:v1.63.0-noble` with pinned ffmpeg, running two processes (`node server.js`, `node dist/worker.js`). Each environment has its own Supabase project and bucket. The EU container host is still open.

## UX & Interaction Patterns

- **Shell:** a left sidebar with **+ New case study**, Case studies and the user menu (To review arrives in Epic 4). Controls a role can't use are absent, not disabled. A direct URL the role can't use redirects to the role's landing page. The sidebar collapses to icons at 1024–1279 px.
- **Status badge:** always colour plus a text label (Bozza, In elaborazione, Da approvare, Approvato), using the `status-*` tokens.
- **Tokens:** the fixed names from DESIGN.md are theme variables with placeholder values. Tool chrome tokens never style template output.
- **Case studies table:** columns ID (the case history code, mono), Name, Client, Year, Status, Updated and Links. Default sort is Updated, newest first, and a header click sorts. Search ("Search name, client or code", over name, client name, client code and case code) runs with a ~250 ms debounce, ignores case and accents, and `/` focuses it. It has empty, no-results and skeleton states. A Bozza row click opens the wizard at its first incomplete step (Material if there are no files, otherwise Details). Below 1024 px the table is read-only and the wizard shows "needs a larger screen".
- **Wizard (focused mode, no sidebar):** a slim top bar holds the back arrow, the name and the badge. Below it sits one centred column (~820 px) with the eyebrow *Nuovo case study*, the name as title, a horizontal stepper **1 Material · 2 Details · 3 Generate**, the heading and intro, the content, and a footer with step dots and **Avanti**. The current mockups `material-step.html`, `details-step.html` and `generate-step.html` are the visual reference; the experience spine wins on conflict.
- **Material step:**
  - A dropzone with **browse** and type chips, and the copy "Up to 20 files, 50 MB each."
  - Parallel uploads with per-file progress. Each row shows a thumbnail, the name, the size (mono) and a remove ✕. Image and video rows also get a **Preferito** star toggle (`aria-pressed`, saves at once).
  - Rejections show inline on the file's row ("Over 50 MB. Not uploaded." / "This file type isn't supported. Use images, videos, texts or PDFs." / 20-file message).
  - Progress and rejections are announced to screen readers.
  - **Avanti** is active once one file has uploaded. With 0 files, Dettagli and Genera can't be reached by any route.
- **Details step:** Contesto, Soluzione and Risultati textareas, each with a one-line prompt as its placeholder. The counter "{n} di 3 compilati" sits in the footer. Each field autosaves on pause or blur. **Avanti** is always active. Visited steps are clickable in the stepper.
- **Accessibility:** a visible `focus-ring`, dialogs that trap and return focus, no stacked dialogs, keyboard access for every action, and reduced motion respected.

## Cross-Story Dependencies

- 2.1 comes before everything. 2.3 (actor and policy) comes before any story that adds a server action. 2.4 (shell, dictionary, badge) comes before the UI stories. 2.5 creates `case_study` and `case_event`, which later stories write to.
- 2.7 builds the upload UI and the asset table. 2.11 swaps the storage adapter behind the existing `ObjectStorage` port and changes the browser helper to the signed-upload shape (method, URL, headers). The 2.7 UI isn't redone.
- 2.8 lands before 2.9. It rewrites `has_material` to count assets only, drops text-item and taxonomy tables and code, and moves the shared validators out of `text-item.ts` so `details-form.ts` keeps working.
- 2.10 completes the Bozza row-click routing begun in 2.6 and the Avanti gate begun in 2.7.
- Hand-offs to Epic 3: `material.hasMaterial` backs the NO_MATERIAL guardrail, `material.resolveRefs` and form_field refs feed the generation manifest, and the `material` bucket also holds renditions and exports. Epic 6 swaps only how `getActor()` resolves the actor and retires the basic-auth gate.
