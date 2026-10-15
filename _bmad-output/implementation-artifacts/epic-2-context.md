# Epic 2 Context: Create a case study and collect its material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer creates a case study by hand for a client picked from the client list. It gets a permanent uuid and a readable case history code such as `LUM-2026-01`. The owner/designer then uploads project files, marks favourite images and videos, and fills in an optional details form. Everything is saved in Supabase (database and a private Storage bucket) inside a gated environment. Clients are records managed on their own Clients page. The epic also lays the foundation the later epics build on: the pinned starter scaffold, the module skeleton with lint-enforced boundaries, the actor and policy seam with a dev actor, the basic-auth gate, the append-only event log, the app shell with design tokens and Italian copy, and the Case history table. Sprint 1 was due 2026-10-14. Stories 2.12 and 2.13 were added on 2026-10-15 and must land before Epic 3.

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

- **Terminology:** the Italian UI says *case history*. "Case study" stays the internal term in docs, story keys, tables (`case_study`) and code. Do not rename anything internal.
- **Manual creation:** name and client are both required. The client is picked from the existing client records; there is no free text and no adding a client from the wizard. Year defaults to the current year. The id is a DB-generated uuid that is immutable and never reused. It is the only identifier used in URLs, foreign keys and anything exposed to other systems. `project_order_ref` is nullable and stays unset. There is no trigger at project close.
- **Case history code:** `{clientCode}-{year}-{number}` (number padded to at least 2 digits, no upper limit). It is fixed at creation, unique and never reused, and it is a display field only: never a key and never in URLs. It shows in the app's tables, wizard and library, but not on shared link pages or in exports.
- **Clients:** each client has an automatic, immutable code (e.g. `LUM`). Names can be edited (1–120 characters after trimming) without changing any code. Names must be unique after normalisation (`CLIENT_NAME_TAKEN`). Clients are never deleted. Only owner/designers can list and manage clients.
- **Material is uploaded files only:** at most 20 non-deleted files per case, 50 MB each (the hosted-plan cap). Allowlist: JPEG, PNG, WebP, MP4, MOV, PDF, plain text, Markdown, DOCX. A file that breaks a rule is rejected on its own and the other files keep uploading. There is no pasted-text material and no taxonomy (no tags, properties or flags).
- **Favourites:** any number of images and videos can be marked. The mark is optional and never blocks progress. It is stored and shown, but generation does not use it yet.
- **Details form:** three optional fields (context, solution, results). It is the only place for typed project text. It can be cited as a claim source but **never counts as material**: `hasMaterial` is true only when the case has at least one non-deleted asset.
- **Removal:** soft delete only (`deleted_at`). It takes effect at once, with no confirm, no undo and no restore.
- Uploading, removing a file, toggling a favourite and saving the details never change the case status.
- Every transition, upload confirmation, removal, favourite change and details save writes an append-only `case_event` row with its actor. `case_created` also records `clientId`, `clientCode` and `code`. The tool records no hands-on time.
- **Gated:** until login (Epic 6), every deployed environment, `/s/` included, sits behind HTTP basic auth. The web process refuses to start if the gate variables are missing.
- Data and files live in the EU. The app is standalone from MAC Productive: no MCP client and no `integration` module.
- WCAG 2.2 AA. Desktop web, 1440 px primary, 1280 px minimum. All UI copy is Italian, from one dictionary file. Each case's narrative locale is `it | en`, default `it`.

## Technical Decisions

- **Stack pinned exactly**, with no `^`/`~`: Node 24 LTS, TS 6.0.3, Next.js 16.3.8 (`output: 'standalone'`, `cacheComponents` off), React 19.3.0, Tailwind 4.3.3, shadcn 4.21.4, supabase-js 2.117.3, ssr 0.12.7, CLI 2.120.0, zod 4.6.5, Playwright 1.63.0, sharp 0.35.5. No `@aws-sdk/*`.
- **Modular monolith:** `src/modules/{case-study,material,generation,rendering,sharing,access,jobs}`, each with `domain/`, `application/` and `index.ts`. `ports/` and `adapters/` exist only at vendor seams. Lint enforces three rules: cross-module imports go only through `index.ts`, vendor SDKs appear only in `adapters/`, and `domain/` imports only `src/shared`.
- **Shared:** `src/shared/env.ts` is the only place `process.env` is read (zod-validated). It also holds `Result<T, AppError>` with SCREAMING_SNAKE codes, a structured JSON logger (no material or prompts in logs) and the generated `db.types.ts`.
- **Access:** every action and route calls `access.getActor()` then `access.authorize()`, and returns 403 `FORBIDDEN` before the use case runs. The permission matrix lives only in `access/domain/policy.ts`; `list clients` and `manage clients` (add, rename) are owner_designer only, and there is no delete-client action. No role can change guardrails, admin included. Before Epic 6 the actor is a seeded dev `owner_designer`, read from `profile` on every request. A `system` actor serves the worker. Data access is server-only with the service-role key, and RLS denies `anon` and `authenticated` on every table.
- **Status:** changes only through `case-study.transition(caseId, event, actor)`, which writes the status and its event in one transaction. Epic 2 only creates cases in `draft`. Delete is soft and allowed only in `draft`.
- **Clients and codes (owned by `case-study`):** `client` (uuid `id`, `name`, unique `name_key`, unique immutable `code`, audit columns) and `case_number_counter` (`client_id`, `year`, `last_number`) sit with `case_study` because the code is assigned in the create transaction. `case_study` carries `client_id` (FK, not null), `number` and a unique `code`, with a unique key on (`client_id`, `year`, `number`).
  - The code rules live once, in SQL (`client_code_letters`, `create_client`, `rename_client`, `create_case_study(p_name, p_client_id, p_year, p_locale, p_actor_id)`). TypeScript only validates the name length and never computes codes.
  - Client code: strip accents and uppercase, drop dots and whole-word legal suffixes (SRL, SPA, GMBH, LTD and so on), keep only A–Z, and pad to 3 letters with `X`. The code is the first free candidate among the first 3 letters, the first 4 letters, then the first 3 letters plus A through Z. If none is free, the create fails with `CLIENT_CODE_EXHAUSTED`. An advisory lock serialises concurrent client creates.
  - Name key: trim, collapse whitespace, lowercase and strip accents (`unaccent` extension).
  - Case number: counts from 1 per (client, year). It is assigned via `insert … on conflict do update … returning` on the counter, so concurrent creates get consecutive numbers and a failed create leaves no gap. Soft-deleted cases keep their numbers.
  - Triggers reject any change to `client.code`, `case_study.code` and `case_study.number`, and any delete on `client`.
  - New error codes: `CLIENT_NOT_FOUND` (404), `CLIENT_NAME_TAKEN` (409), `CLIENT_CODE_EXHAUSTED` (409).
  - In the domain, `CaseStudy.client` is `{ id, name, code }`, and the create input takes `clientId`. Use cases: `listClients`, `getClient`, `createClient`, `renameClient`; `list(scope)` takes an optional `clientId`.
- **Storage (Supabase Storage, `material` bucket):** private, EU region, created by migration with `file_size_limit = 52428800` and `allowed_mime_types` from `material/domain/files.ts`. The service role is the only reader and writer. Upload flow:
  1. The server runs `authorize`, checks the 20-file cap and the type, then issues a signed upload URL.
  2. The browser PUTs the file directly to that URL.
  3. At confirm, the server re-checks the size and type from the object's metadata, re-checks the cap, then creates the `asset` row.

  Reads use signed GET URLs valid for at most 15 minutes. The key layout is `cases/{caseId}/assets/{assetId}/original.{ext}`, built only in `material/adapters`. Storage has no versioning, so the app never deletes objects. Storage is reached only through the `ObjectStorage` port.
- **Data:** `case_study` (incl. `locale`, `head_revision_id` / `approved_revision_id` nullable, `head_version`, `deleted_at`); `case_event` (append-only, a trigger rejects UPDATE and DELETE); `asset` (incl. `is_favourite boolean not null default false`, settable only on image and video assets); `context_form` (one row per case, keys `context`, `solution`, `results`); `profile` (role ∈ owner_designer | account_sales_social | admin | system).
- **`MaterialRef { asset | form_field, id }`** resolves only through `material.resolveRefs`. A form_field key must be `context`, `solution` or `results`; any other key is rejected.
- **Conventions:** tables are snake_case and singular. Ids are uuid, and the case history code is the one human-readable display code. Timestamps are `timestamptz` in UTC, displayed in Europe/Rome. zod schemas live in `domain/` as the single definition.
- **Migrations:** forward-only SQL in `supabase/migrations/`, applied to staging before prod. An applied migration is never edited. Each table or prefix is created by the first story that needs it. Without local Docker, `db.types.ts` comes from CI; commit CI's generated file when the drift check fails.
- **Deployment:** one Docker image on `mcr.microsoft.com/playwright:v1.63.0-noble` with pinned ffmpeg, running two processes (`node server.js`, `node dist/worker.js`). Each environment has its own Supabase project and bucket.

## UX & Interaction Patterns

- **Shell:** a left sidebar with **+ New case study**, Case history, **Clienti** (owner/designer only, between Case history and Templates) and the **Account** menu, with *RECAP* by the logo. Controls a role can't use are absent, not disabled. A direct URL the role can't use redirects to that role's landing page. The sidebar collapses to icons at 1024–1279 px.
- **Status badge:** always colour plus a text label (Bozza, In elaborazione, Da approvare, Approvato), using the `status-*` tokens.
- **Tokens:** the fixed names from DESIGN.md are theme variables with placeholder values. Tool chrome tokens never style template output.
- **Case history table:** columns ID (the case code, mono), Name, Client (current name), Year, Status, Updated and Links.
  - Default sort is Updated, newest first, and a header click sorts. ID sorts naturally (`LUM-2026-9` < `LUM-2026-10`).
  - Search ("Search name, client or code") covers name, client name, client code and case code. It debounces ~250 ms, ignores case and accents, and `/` focuses it.
  - The table has empty, no-results and skeleton states.
  - A Bozza row click opens the wizard at its first incomplete step.
  - Below 1024 px the table is read-only and the wizard shows "needs a larger screen".
- **Wizard (focused mode, no sidebar):** a slim top bar holds the back arrow, the name, the code (mono) and the badge. Below it sits one centred column (~820 px) with a stepper **1 Material · 2 Details · 3 Generate**, the content, and a footer with **Avanti**. The mockups `material-step.html`, `details-step.html` and `generate-step.html` are the visual reference; the experience spine wins on conflict.
- **Step 0:** the client field is a select of every client, sorted by name, each option showing the name and code. With no clients, the field is replaced by "Nessun cliente. Aggiungilo nella pagina Clienti." and **Avanti** stays inactive. A narrative-language select defaults to Italiano.
- **Material step:**
  - A dropzone with **browse** and type chips, and the copy "Up to 20 files, 50 MB each."
  - Parallel uploads with per-file progress, announced to screen readers.
  - Rows show a thumbnail, the name, the size (mono) and a remove ✕. Image and video rows also get a **Preferito** star toggle (`aria-pressed`) that saves at once.
  - Rejections show inline on the file's row.
  - **Avanti** is active from the first uploaded file. With 0 files, Dettagli and Genera can't be reached.
- **Details step:** Contesto, Soluzione and Risultati textareas with one-line prompts, a "{n} di 3 compilati" counter, and autosave on pause or blur. **Avanti** is always active.
- **Clients page:**
  - A table with Code (mono), Name and Case histories (non-deleted count), sorted by name A–Z, with header sort and search over name and code. It has skeleton, empty and no-results states.
  - **Aggiungi cliente** asks for a name only (no code field). A duplicate shows "Esiste già un cliente con questo nome." and keeps the dialog open.
  - **Modifica nome** states "Il codice {code} non cambia."
  - A row opens `/clients/{clientId}`: the name and code, **Modifica nome**, and the Case history table filtered to that client. **Nuova case history** opens step 0 with the client preselected.
  - There is no delete. Below 1024 px the page is read-only.
- **Accessibility:** a visible `focus-ring`, dialogs that trap and return focus, no stacked dialogs, keyboard access for every action, and reduced motion respected.

## Cross-Story Dependencies

- 2.1 comes before everything. 2.3 (actor and policy) comes before any story that adds a server action. 2.4 (shell, dictionary, badge) comes before the UI stories. 2.5 creates `case_study` and `case_event`, which later stories write to.
- 2.7 builds the upload UI and the asset table. 2.11 swaps the storage adapter behind the existing `ObjectStorage` port and changes the browser helper to the signed-upload shape; the 2.7 UI isn't redone.
- 2.8 lands before 2.9. It rewrites `has_material` to count assets only, drops the text-item and taxonomy tables and code, and moves the shared validators so `details-form.ts` keeps working.
- 2.10 completes the Bozza row-click routing begun in 2.6 and the Avanti gate begun in 2.7.
- 2.12 delivers the amended ACs of 2.5 (client picker, code in the header) and 2.6 (code column, search, natural sort). Its single forward migration creates the client tables and backfills every existing case, soft-deleted ones included: free-text clients are grouped by name key, cases are numbered per (client, year) by `created_at` then `id`, the counter is seeded, the free-text `case_study.client` column is dropped, and the migration aborts if any case is left without a client or code. Example: "Test Lumen" / "Lumen Srl" / 2026 becomes `LUM-2026-01`.
- 2.13 follows 2.12, and both land before Epic 3. Story 4.1 inherits the code column and search. In Story 5.1 the Client facet is built from client records and search covers the code.
- Hand-offs to Epic 3: `material.hasMaterial` backs the NO_MATERIAL guardrail, `material.resolveRefs` and form_field refs feed the generation manifest, and the `material` bucket also holds renditions and exports. Epic 6 swaps only how `getActor()` resolves the actor and retires the basic-auth gate, and admin gets no client rights.
