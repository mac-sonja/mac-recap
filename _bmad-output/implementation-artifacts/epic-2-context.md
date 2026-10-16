# Epic 2 Context: Create a case study and collect its material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer creates a case study by hand for a client picked from the client list. It gets a permanent uuid and a readable case history code such as `LUM-2026-01`. The owner/designer then uploads project files, marks favourite images and videos, and fills in an optional details form. Everything is saved in Supabase (database and a private Storage bucket) inside a gated environment. Clients are records managed on their own Clients page, and each can carry a short description, a sector and a logo, which later feed the About the client block of every case study. The epic also lays the foundation the later epics build on: the pinned starter scaffold, the module skeleton with lint-enforced boundaries, the actor and policy seam with a dev actor, the basic-auth gate, the append-only event log, the app shell with design tokens and Italian copy, and the Case history table. Stories 2.12 and 2.13 were added on 2026-10-15; Story 2.14 was added on 2026-10-16, lands first in Sprint 2 and must merge before Story 3.3.

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
- Story 2.14: Client info (description, sector and logo)

## Requirements & Constraints

- **Terminology:** the Italian UI says *case history*; "case study" stays the internal term in docs, story keys, tables (`case_study`) and code. Do not rename anything internal.
- **Manual creation:** name and client are required; the client is picked from existing records (no free text, no adding from the wizard). Year defaults to the current year. The DB-generated uuid is immutable, never reused, and the only identifier in URLs, foreign keys and anything exposed to other systems. `project_order_ref` stays unset; nothing triggers at project close.
- **Case history code:** `{clientCode}-{year}-{number}` (number padded to at least 2 digits, no upper limit), fixed at creation, unique, never reused. Display only: never a key or in URLs; shown in app tables, wizard and library, never on shared link pages or in exports.
- **Clients:** automatic, immutable code (e.g. `LUM`). Names are editable (1–120 characters after trimming) without changing any code, and unique after normalisation (`CLIENT_NAME_TAKEN`). Clients are never deleted. Only owner/designers list and manage clients.
- **Client info:** sector (optional plain text, ≤60 characters after trimming), description (optional plain text, ≤400) and logo (optional; PNG, JPEG or WebP, ≤5 MB, ≥400 px on the short side). All three are optional and existing clients start empty. Replacing or removing a logo deletes the old one (row and object); there is no logo history. Client info is live: every case history of the client, approved ones included, shows its current info (SCP 2026-10-16 amendment). Client info is never material: it never enables Generate.
- **Material is uploaded files only:** at most 20 non-deleted files per case, 50 MB each (the hosted-plan cap). Allowlist: JPEG, PNG, WebP, MP4, MOV, PDF, plain text, Markdown, DOCX. A rejected file fails on its own; others keep uploading. No pasted text, no taxonomy.
- **Favourites:** any number of images and videos; optional, never blocks progress; stored and shown but not yet used by generation.
- **Details form:** three optional fields (context, solution, results), the only place for typed project text. A valid claim source that **never counts as material**: `hasMaterial` is true only with at least one non-deleted asset.
- **Removal:** soft delete only (`deleted_at`), immediate, no confirm, undo or restore. Uploads, removals, favourites and details saves never change the case status.
- Every transition, upload confirmation, removal, favourite change and details save writes an append-only `case_event` row with its actor; `case_created` also records `clientId`, `clientCode` and `code`. Client edits are not case events. No hands-on time is recorded.
- **Gated:** until login (Epic 6) every deployed environment, `/s/` included, sits behind HTTP basic auth; the web process refuses to start without the gate variables.
- Data and files live in the EU. The app is standalone from MAC Productive (no MCP client, no `integration` module).
- WCAG 2.2 AA. Desktop web, 1440 px primary, 1280 px minimum. All UI copy is Italian, from one dictionary file. Each case's narrative locale is `it | en`, default `it`.

## Technical Decisions

- **Stack pinned exactly** (no `^`/`~`): Node 24 LTS, TS 6.0.3, Next.js 16.3.8 (`output: 'standalone'`, `cacheComponents` off), React 19.3.0, Tailwind 4.3.3, shadcn 4.21.4, supabase-js 2.117.3, ssr 0.12.7, CLI 2.120.0, zod 4.6.5, Playwright 1.63.0, sharp 0.35.5. No `@aws-sdk/*`.
- **Modular monolith:** `src/modules/{case-study,material,generation,rendering,sharing,access,jobs}`, each with `domain/`, `application/` and `index.ts`; `ports/` and `adapters/` only at vendor seams. Lint enforces: cross-module imports only through `index.ts`, vendor SDKs only in `adapters/`, `domain/` imports only `src/shared`.
- **Shared:** `src/shared/env.ts` is the only reader of `process.env` (zod-validated). It also holds `Result<T, AppError>` with SCREAMING_SNAKE codes, a structured JSON logger (no material or prompts in logs) and the generated `db.types.ts`.
- **Access:** every action and route calls `access.getActor()` then `access.authorize()` and returns 403 `FORBIDDEN` before the use case runs. The matrix lives only in `access/domain/policy.ts`; `list clients` and `manage clients` (add, edit, logo) are owner_designer only, with no delete-client action. Before Epic 6 the actor is a seeded dev `owner_designer` read from `profile` per request; a `system` actor serves the worker. Data access is server-only with the service-role key; RLS denies `anon` and `authenticated` on every table.
- **Status:** changes only through `case-study.transition(caseId, event, actor)`, which writes status and event in one transaction. Epic 2 only creates `draft` cases; soft delete only in `draft`.
- **Clients and codes (owned by `case-study`):** `client` (uuid `id`, `name`, unique `name_key`, unique immutable `code`, audit columns) and `case_number_counter` (`client_id`, `year`, `last_number`). `case_study` carries `client_id` (FK, not null), `number` and a unique `code`, unique on (`client_id`, `year`, `number`).
  - Code rules live once, in SQL (`client_code_letters`, `create_client`, `create_case_study`); TypeScript only validates name length and never computes codes. Client code: strip accents, uppercase, drop dots and whole-word legal suffixes, keep A–Z, pad to 3 with `X`; first free of first 3 letters, first 4, then first 3 + A..Z, else `CLIENT_CODE_EXHAUSTED`. An advisory lock serialises client writes.
  - Case number counts from 1 per (client, year) via `insert … on conflict do update … returning`; concurrent creates get consecutive numbers, a failed create leaves no gap, soft-deleted cases keep their numbers.
  - Triggers reject changes to `client.code`, `case_study.code`, `case_study.number`, and any delete on `client`.
  - Error codes: `CLIENT_NOT_FOUND` (404), `CLIENT_NAME_TAKEN` (409), `CLIENT_CODE_EXHAUSTED` (409).
- **Client info (AD-22, owned by `case-study`):** `client` gains nullable `description`, `sector` and `logo_id` (FK to `client_logo`), with DB checks on the trimmed lengths. `client_logo` (uuid `id`, `client_id`, `path`, `mime_type`, `size_bytes`, `created_by`, `created_at`) holds only the client's current logo: replacing or removing it deletes the old row and its storage object. An `update_client` SQL function (name, description, sector, logo id) replaces the rename path and keeps the name and code rules. New errors `CLIENT_FIELD_TOO_LONG` (400) and `CLIENT_LOGO_INVALID` (400). `case-study` exposes `getClientInfoForCase(caseId)` → `{ clientId, name, sector, description, logoId }` with current values. It is a live read, never copied: Epic 3 renderers call it at render time for the About block and the generate job calls it when it runs, so a client edit shows at once in every case history, drafts and approved ones alike.
- **Storage (Supabase Storage, `material` bucket):** private, EU, created by migration with `file_size_limit = 52428800` and `allowed_mime_types` from `material/domain/files.ts`. The service role is the only reader and writer. Upload flow: the server authorizes and checks declared type and size (and the 20-file cap for assets), issues a signed upload URL; the browser PUTs directly; at confirm the server re-checks size and type from the object's metadata before creating the row. Reads are signed GETs valid ≤15 minutes. No versioning, so material objects are never deleted; the one exception is a replaced or removed client logo, whose old object is deleted. Keys are built only by the owning module's adapter: `cases/{caseId}/assets/{assetId}/original.{ext}` (`material`, via the `ObjectStorage` port) and `clients/{clientId}/logos/{logoId}.{ext}` (`case-study`; logo limits checked at signed-URL issue and again at confirm).
- **Data:** `case_study` (incl. `locale`, nullable `head_revision_id` / `approved_revision_id`, `head_version`, `deleted_at`); `case_event` (append-only via trigger); `asset` (incl. `is_favourite`, settable only on images and videos); `context_form` (one row per case: `context`, `solution`, `results`); `profile` (role ∈ owner_designer | account_sales_social | admin | system).
- **`MaterialRef { asset | form_field, id }`** resolves only through `material.resolveRefs`; form-field keys are only `context`, `solution`, `results`.
- **Conventions:** snake_case singular tables; uuid ids; `timestamptz` in UTC, shown in Europe/Rome; zod schemas in `domain/` as the single definition.
- **Migrations:** forward-only SQL in `supabase/migrations/`, applied to the dev project (`mac-recap-dev`) and staging before prod; an applied migration is never edited. Each table or prefix is created by the first story that needs it. Without local Docker, DB tests run in CI and `db.types.ts` comes from CI: commit CI's generated file when the drift check fails.
- **Deployment:** one Docker image on `mcr.microsoft.com/playwright:v1.63.0-noble` with pinned ffmpeg, running `node server.js` and `node dist/worker.js`. Each environment has its own Supabase project and bucket.

## UX & Interaction Patterns

- **Shell:** left sidebar with **+ New case study**, Case history, **Clienti** (owner/designer only, between Case history and Templates) and the **Account** menu, *RECAP* by the logo. Controls a role can't use are absent, not disabled; a direct URL the role can't use redirects to its landing page. The sidebar collapses to icons at 1024–1279 px.
- **Status badge:** colour plus text label (Bozza, In elaborazione, Da approvare, Approvato), `status-*` tokens. Tool chrome tokens never style template output.
- **Case history table:** ID (case code, mono), Name, Client (current name), Year, Status, Updated, Links. Default sort Updated newest first; header sort; ID sorts naturally (`LUM-2026-9` < `LUM-2026-10`). Search covers name, client name, client code and case code (~250 ms debounce, case- and accent-insensitive, `/` focuses it). Empty, no-results and skeleton states. A Bozza row opens the wizard at its first incomplete step. Below 1024 px the table is read-only and the wizard shows "needs a larger screen".
- **Wizard (focused mode):** slim top bar (back arrow, name, code in mono, badge), one centred ~820 px column, stepper **1 Material · 2 Details · 3 Generate**, footer with **Avanti**. Mockups are visual reference; the experience spec wins on conflict.
- **Step 0:** client select of every client by name, showing name and code; with none, "Nessun cliente. Aggiungilo nella pagina Clienti." and **Avanti** inactive. Narrative-language select defaults to Italiano.
- **Material step:** dropzone with **browse**, type chips and "Up to 20 files, 50 MB each."; parallel uploads with per-file progress announced to screen readers; rows with thumbnail, name, size (mono), remove ✕, and a **Preferito** toggle (`aria-pressed`) on images and videos; inline per-row rejections. **Avanti** active from the first file.
- **Details step:** Contesto, Soluzione, Risultati textareas with one-line prompts, a "{n} di 3 compilati" counter, autosave on pause or blur; **Avanti** always active.
- **Clients page:**
  - Table: Code (mono), Name, Case histories (non-deleted count), sorted A–Z, header sort, search over name and code; skeleton, empty and no-results states. Sector is not a column or search field.
  - **Aggiungi cliente** and **Modifica cliente** dialogs share the fields: name (required), Settore (optional, ≤60), Descrizione (optional textarea, ≤400, live counter) and Logo (optional upload with preview and **Rimuovi**). No code field. A duplicate name shows "Esiste già un cliente con questo nome." and keeps the dialog open. The edit dialog says "Il codice {code} non cambia. Le modifiche si vedono in tutte le sue case history."
  - A row opens `/clients/{clientId}`: logo, name and code, sector, description, **Modifica cliente**, and the Case history table filtered to that client; empty fields show nothing. **Nuova case history** opens step 0 with the client preselected.
  - No delete. Below 1024 px the page is read-only (no add or edit).
- **Accessibility:** visible `focus-ring`, dialogs that trap and return focus, no stacked dialogs, keyboard access for every action, reduced motion respected.

## Cross-Story Dependencies

- 2.1 comes before everything; 2.3 before any server action; 2.4 before the UI stories; 2.5 creates `case_study` and `case_event`.
- 2.7 builds the upload UI and asset table; 2.11 swaps the storage adapter behind the `ObjectStorage` port and moved the browser helper to the signed-upload shape. 2.8 lands before 2.9 and makes `has_material` count assets only. 2.10 completes the Bozza row routing (2.6) and the Avanti gate (2.7).
- 2.12 delivers the amended ACs of 2.5 and 2.6; its migration backfilled every existing case with a client, number and code. 2.13 follows 2.12.
- 2.14 delivers the amended dialog ACs of 2.13 (Edit name becomes Edit client), reusing the signed-upload pattern of 2.11 under the `clients/` prefix. It must land before Story 3.3, which adds the `about` block to the document; 3.6 (the LLM gets the client's name, sector and description, and claims may cite `client_field` refs) and 3.5/3.7 (renderers read the client's current info at render time; the job reads it when it runs, with no snapshot) build on `getClientInfoForCase`.
- Hand-offs to Epic 3: `material.hasMaterial` backs the NO_MATERIAL guardrail, `material.resolveRefs` and form-field refs feed the manifest, and the `material` bucket also holds renditions and exports. Epic 6 swaps only how `getActor()` resolves the actor and retires the basic-auth gate; admin gets no client rights.
