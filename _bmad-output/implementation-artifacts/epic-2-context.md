# Epic 2 Context: Create a case study and collect its material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer creates a case study by hand, gets a permanent ID, uploads project files, marks favourite images and videos and fills in an optional details form, all stored in Supabase (database and a private Storage bucket, EU) inside a basic-auth-gated environment. The epic also lays the foundation every later epic builds on: the pinned starter scaffold, the module skeleton with enforced boundaries, the actor/policy seam with a dev owner/designer, the append-only event log, the app shell with design tokens and Italian copy, and a basic Case studies table. Scope was reshaped on 2026-10-14: no tags/taxonomy (favourites instead), no pasted text, no undo on file removal. Files move from AWS S3 to Supabase Storage (Story 2.11, storage proposal 2026-10-14).

## Stories

- Story 2.1: Scaffold the app from the starter and pin the stack
- Story 2.2: One gated image, deployable to staging
- Story 2.3: Actor and policy seam with a dev owner/designer
- Story 2.4: App shell — navigation, tokens, Italian copy, status badge
- Story 2.5: Create a case study with a permanent ID
- Story 2.6: Find and reopen case studies in the table
- Story 2.7: Upload project files
- Story 2.8: Retire pasted text and the taxonomy
- Story 2.9: Mark images and videos as favourite
- Story 2.10: Fill in the details form
- Story 2.11: Store project files in Supabase Storage

## Requirements & Constraints

- Case study ID: DB-generated uuid, immutable, never reused; the only identifier exposed externally. `project_order_ref` stays null with no UI.
- Material = uploaded files only (images, videos, text documents, PDFs). Max 20 non-deleted files per case, 100 MB each, allowlisted types. A rejected file never blocks the others.
- Favourite: optional, any number, images and videos only; stored and shown but not used by generation (open point, interim).
- Details form (context, solution, results): all optional, the only place for typed project text, citable as a claim source, and **never counts as material**. `hasMaterial` is true only with at least one non-deleted asset.
- Upload, favourite and details saves never change case status. Removal is a soft delete (`deleted_at`), never hard delete, with no confirm and no undo.
- Every mutation writes an append-only `case_event` row with actor id (no hands-on-time tracking).
- Until login (Epic 6) every deployed environment, `/s/` included, sits behind HTTP basic auth; the web process refuses to start if the credentials are missing.
- WCAG 2.2 AA; desktop web (primary 1440 px, min 1280 px); UI in Italian through one dictionary file; narrative locale it | en, default it.
- Status labels (interim): Bozza / In elaborazione / Da approvare / Approvato; only Bozza is reachable in this epic.

## Technical Decisions

- Stack pinned exactly (no ranges): Next.js 16 (`output: 'standalone'`, `cacheComponents` off), React 19, TS 6, Tailwind 4 + shadcn (new-york, neutral), supabase-js/ssr, zod 4, Playwright, sharp; Node 24 LTS. Versions are listed in Story 2.1 (its AWS SDK pins are removed in Story 2.11).
- Modular monolith: `src/modules/{case-study,material,generation,rendering,sharing,access,jobs}` each with `domain/`, `application/`, `index.ts`; `ports/`/`adapters/` only at vendor seams. Lint enforces: cross-module imports via `index.ts` only, vendor SDKs only in `adapters/`, `domain/` imports only `src/shared`. `src/modules/integration` is reserved (Epic 7); no MAC Productive calls.
- `src/shared/`: `env.ts` (zod-validated, the only `process.env` reader), `result.ts` (`Result<T, AppError>`, SCREAMING_SNAKE codes), structured JSON logger (`caseId`, `jobId`, `actorId`; never material or prompts), generated `db.types.ts`.
- Every server action/route: `access.getActor()` then `access.authorize(actor, action, resource)`; denial returns `FORBIDDEN`/403 before the use case runs. Role read from `profile` on every request. The full permission matrix lives only in `access/domain/policy.ts` as code; "change permissions or guardrails" is denied to all roles. Pre-Epic 6 the actor is a seeded dev `owner_designer`; a `system` profile also exists. List scope: all statuses for owner/designer, approved only for account/sales/social.
- Data access is server-only with the service-role key (read only in `env.ts` and adapters); RLS denies `anon` and `authenticated` on every table.
- `case_study.status` changes only through `case-study.transition(caseId, event, actor)`, which writes status and event in one transaction.
- Tables (snake_case singular, uuid ids, `timestamptz` UTC displayed Europe/Rome): `profile`, `case_study`, append-only `case_event` (UPDATE/DELETE rejected), `asset` (incl. `is_favourite boolean not null default false`), `context_form` (one row per case, keys `context`/`solution`/`results`). No taxonomy or text-item tables.
- Storage: Supabase Storage, private bucket `material` in each environment's EU project, created by migration with `file_size_limit` 100 MB and `allowed_mime_types` = the allowlist; no public access, the service role is the only reader and writer. Keys `cases/{caseId}/assets/{assetId}/original.{ext}`, built only in `material/adapters`. Browser uploads to a signed upload URL issued after `authorize`; size and type limits are enforced by the bucket, and the asset row is created only after the server checks the object's metadata (size, type) at confirm and re-checks the 20-file cap. Signed GET ≤ 15 min. No versioning, so the app never deletes objects (removal is a soft delete). No AWS S3. Type allowlist lives in `material/domain/files.ts`.
- `MaterialRef { asset | form_field, id }`, resolved only through `material.resolveRefs`; unknown form keys are rejected.
- Migrations are forward-only; never edit an applied migration. Applied staging before prod, before the new image starts. Without local Docker, commit CI's regenerated `db.types.ts` when the drift check fails.
- Deployment: one Docker image on the Playwright base with pinned ffmpeg, two processes (`node server.js`, `node dist/worker.js`); worker only idles in this epic. Basic auth enforced in `proxy.ts`; credentials never `NEXT_PUBLIC_`.

## UX & Interaction Patterns

- **Design tokens** are theme variables (component code never hard-codes values; tool tokens never style template output). Dark chrome: `surface #000`, `surface-raised #151515`, `surface-control #1E1E1E`, `surface-selected #262626`, `border #262626`, `border-strong #303030`; text `foreground-strong #FFF`, `foreground #F2F2F2`, `foreground-muted #878787`. `primary #CBFF00` (lime) with black `primary-foreground`; `accent #007BFF` (blue); `info #B2D9EF` (text on blue tints); `danger #FF4D4F` with black text; `focus-ring` lime, 2px outline. No navy, gradients or panel shadows; depth is tonal.
- **Colour use:** lime only for main CTAs (Avanti, Genera, *Nuovo case study*…), the dropzone *sfoglia* link, focus ring and Approvato badge; at most one primary button per view. Blue for the Preferito "on" state, upload progress bars, the Da approvare badge and inline links. Never muted grey on `surface-selected`, never blue text on a blue tint.
- **Typography:** Inter (heading 14/500, body 14/400, label 12/400 muted, badge 13, button 14/400); JetBrains Mono 12 for IDs and sizes. Hierarchy by size and colour, not weight. **Radius:** sm 8, md 10 (buttons, fields, tiles), lg 16 (panels, dropzone), full (badges, favourite pill). Panel padding 16, section gap 16, label-to-field 6, segmented inset 3.
- **Status badge:** pill, no dot, tinted fill and border, text in the status hue; always label plus colour. Bozza/In elaborazione: off-white tint; Da approvare: blue tint with `info` text; Approvato: lime tint.
- **Shell:** left sidebar with white MAC wordmark on top, **+ New case study**, Case studies, user menu; controls a role can't use are absent, not disabled; direct URLs to forbidden surfaces redirect to the role's landing page. Sidebar collapses to icons at 1024–1279 px. Dialogs trap and return focus, max one level deep.
- **Case studies table:** ID (mono), Name, Client, Year, Status, Updated, Links; default sort Updated newest; header sort toggles; search "name, client or ID", ~250 ms debounce, case/accent-insensitive; `/` focuses search; skeleton on first load; empty and no-results copy; below 1024 px read-only with "needs a larger screen" for the wizard. A Bozza row opens the wizard at the first incomplete step (Material if no files, else Details).
- **Wizard layout (every step):** focused mode, no sidebar. Slim top bar (back arrow + case name left, status badge right). One centred column (~820 px), centred vertically and horizontally; scrolls from the top under the fixed top bar when taller. Column order: eyebrow *Nuovo case study*, case name as large title, horizontal segmented stepper **1 Materiale · 2 Dettagli · 3 Genera**, step heading + one-line intro, content, footer under a divider (left slot, step dots centre, **Avanti** right, no step name). Step 0 is name + client (required, field-level missing messages) with year prefilled and editable; the case is created as Bozza and its ID shown in mono; leaving and returning loses nothing. Visited steps are clickable; Dettagli and Genera are clickable only once step 1 has a file.
- **Material step:** dropzone (dashed `border-strong` on `surface-raised`, lg radius) with **browse**, mono type chips (PDF, DOCX, TXT, PNG/JPG, MP4/MOV) and "Up to 20 files, 100 MB each."; it compacts above the rows once files exist, with an "n / 20 file" count. Parallel uploads, per-file progress bar; progress and rejections announced to screen readers. Rows: thumbnail (or type icon), name, size (mono), remove ✕; images/videos also get a **Preferito** pill toggle (star + label, `aria-pressed`; off: transparent, `border-strong`, muted; on: blue tint, blue star, `info` label), usable as soon as that file has uploaded. Inline rejections: "Over 100 MB. Not uploaded." / "This file type isn't supported. Use images, videos, texts or PDFs." / 20-file limit. Footer left: favourites are optional. **Avanti** inactive with 0 files.
- **Details step:** heading "Racconta il progetto", intro saying the three fields are optional and not enough to generate alone. Contesto, Soluzione, Risultati textareas whose one-line prompt is the placeholder; autosave on pause/blur; footer left counter "{n} di 3 compilati"; **Avanti** active from the start.
- Mockups (`mockups/material-step.html`, `details-step.html`) govern layout; token values and colour roles come from DESIGN.md, and EXPERIENCE.md behaviour wins on any conflict. Copy: plain verbs, no hype, no exclamation marks.

## Cross-Story Dependencies

- 2.1 → 2.2 → 2.3 are foundations for everything; 2.4 (shell, tokens, dictionary, StatusBadge) precedes all UI stories.
- 2.5 creates `case_study`, `case_event` and `transition`, used by 2.6–2.10; 2.6's Bozza row click is completed by 2.10 (first-incomplete-step routing).
- 2.8 (cleanup migration, `hasMaterial` = live asset) lands before 2.9 (favourites); the 2.7 and 2.10 UI parts follow both. 2.10's Avanti gate depends on `hasMaterial`.
- 2.11 swaps the S3 adapter for Supabase Storage behind the existing `ObjectStorage` port, after the 2.7 UI lands; it updates the browser upload helper to the signed-upload shape (method, URL, headers).
- Later epics: Epic 3 consumes `hasMaterial`, `resolveRefs` and the material manifest (favourites carried but ignored); Story 4.1 adds status filter, row actions, delete and To review; Epic 6 swaps only how `getActor()` resolves the actor and retires the basic-auth gate.
