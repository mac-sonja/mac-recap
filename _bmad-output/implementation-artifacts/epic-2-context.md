# Epic 2 Context: Create a case study and collect its material

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The owner/designer creates a case study (UI term: *case history*) by hand for an existing client. It gets a permanent uuid and a readable code such as `LUM-2026-01`. The owner/designer then uploads project files, marks favourite images and videos, and fills in an optional details form, all stored in Supabase (database plus a private Storage bucket) behind a gate. Clients are records managed on their own Clients page. They are created through a full-page wizard like the case history one: details first (all required), then 2–3 files of material. The client's data later feeds the About the client block of every case study, the AI, and the client intro. The epic also lays the foundation later epics build on: the pinned scaffold, module boundaries, the actor and policy seam, the basic-auth gate, the append-only event log, and the app shell with tokens and Italian copy. Stories 2.1–2.14 are built. 2.15 and 2.16 run first in Sprint 2.

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
- Story 2.15: Client wizard and details step
- Story 2.16: Client material step

## Requirements & Constraints

- "Case study" stays the internal name (tables, code, story keys). Only the Italian UI says *case history*.
- **Case creation:** name and client are required, and the client is picked from existing records. The uuid is immutable and is the only identifier in URLs and foreign keys. The case code `{clientCode}-{year}-{nn}` is display only: it never appears in URLs, shared link pages or exports.
- **Clients:** each has an automatic, immutable code. Names are 1–120 characters and unique after normalisation (`CLIENT_NAME_TAKEN`). Clients are never deleted. Only owner/designers can list or manage clients; any other role gets `FORBIDDEN` and nothing is written.
- **Client fields (all required):**
  - Name
  - Industries: multiselect, at least one, from a fixed list held in one constant: `interior_design`, `energia`, `risorse_umane`, `lusso`. This replaces the free-text sector.
  - Description: plain text, up to 400 characters
  - Logo: PNG, JPEG or WebP, up to 5 MB, at least 400 px on the short side. It can be replaced but not cleared, and there is no logo history.
  - Brief: context, solution and results, each up to 5000 characters after trimming
- **Validation errors:** a value outside the industry list, an empty list or an over-long text fails with `CLIENT_FIELD_INVALID` or `CLIENT_FIELD_TOO_LONG` and writes nothing. Dev clients made under 2.14 start with these fields empty and must finish the wizard.
- **Client material:** up to 3 files of the case material types (no more than 50 MB each). Images must also be at least 1600 px on the short side. The intro needs at least 2 images. Removing a file deletes its row and its object at once, with no undo. Replace and reorder come with 4.12. Until open point OP 2 is decided, non-image client files are stored but not sent to the LLM.
- **Client info is live:** every case history of a client, approved ones included, shows the client's current info, with no snapshot. Client info is never material, so it never enables Generate.
- **Case material:** uploaded files only. At most 20 non-deleted files per case, 50 MB each. Allowed types: JPEG, PNG, WebP, MP4, MOV, PDF, TXT, MD and DOCX. A rejected file fails on its own; the others keep uploading.
- **Favourites and the details form:** any number of images and videos can be favourites. The details form has three optional fields: context, solution and results. Form text is a valid claim source but never counts as material: `hasMaterial` needs at least one non-deleted asset.
- **Changes to case material:** removing case material is a soft delete with no undo. Uploads, removals, favourites and details saves never change the case status. Each of these mutations writes an append-only `case_event` row with its actor. Client edits are not case events.
- **Environment:** until login (Epic 6), every deployed environment sits behind HTTP basic auth. Data stays in the EU.
- **Interface:** WCAG 2.2 AA, desktop first (1280 px minimum). All copy is Italian and comes from one dictionary.

## Technical Decisions

- **Module boundaries:** modules import each other only through `index.ts`. Vendor SDKs appear only in `adapters/`. `src/shared/env.ts` is the only reader of `process.env`.
- **Results and authorization:** actions return `Result<T, AppError>` with SCREAMING_SNAKE error codes. Every action calls `access.getActor()` and then `access.authorize()`, and the permission matrix exists only in `policy.ts`.
- **Client ownership:** the `case-study` module owns `client`, `client_logo`, `client_brief`, `client_asset`, `case_number_counter`, and the storage prefixes `clients/{clientId}/logos/**` and `clients/{clientId}/material/**`. `clients/{id}/images/**` is never created.
- **Code rules:** client and case code rules live once, in SQL (`create_client`, `create_case_study`, `update_client`), and TypeScript never computes codes. Triggers block changes to codes and any client delete.
- **Story 2.15 migration:**
  - Adds `client.industries`, a text array checked by the database (values from the list, at least one).
  - Drops `sector`.
  - Adds `client_brief`, one row per client with `context`, `solution` and `results`, modelled on `context_form`.
  - `create_client` and `update_client` take industries instead of sector.
- **Story 2.16 migration:** adds `client_asset` with these columns: `id`, `client_id`, `position` (1–3), `path`, `mime_type`, `size_bytes`, `width`/`height` (images only), `created_by` and `created_at`. It is unique on (`client_id`, `position`).
- **Migrations in general:** RLS denies `anon` and `authenticated` on every new table. Migrations are forward-only, and an applied migration is never edited. Builders never run `supabase db push`; CI produces `db.types.ts`.
- **`getClientInfoForCase(caseId)`:** returns `{ clientId, name, industries, description, logoId, brief }`, read fresh on every call and never copied. Epic 3 renderers and the generate job depend on it.
- **Storage:** private `material` bucket. The upload flow:
  1. The server authorizes and checks the declared type, size and file-count cap.
  2. The server issues a signed upload URL.
  3. The browser PUTs the file directly.
  4. At confirm, the server re-checks type and size from the object's metadata before writing the row.
- **Storage reads and deletes:** reads are signed GETs valid for up to 15 minutes. Case material objects are never deleted. Replaced logos and removed client files have their objects deleted.
- **Storage keys:** only the owning adapter builds keys. Client material lives at `clients/{clientId}/material/{assetId}.{ext}`.
- **Reuse for the client wizard:** use the case wizard's frame, stepper, details step, drop zone, asset row and upload helper. The frame and stepper are wired to cases today, so they must also accept a client. The wizard steps replace `client-dialog.tsx`.

## UX & Interaction Patterns

- **Shell:** the **Clienti** sidebar entry shows for owner/designers only. Controls a role can't use are absent, not disabled. Below 1024 px, tables and wizards are read-only.
- **Case wizard:** a slim top bar with back, name, code (mono) and status badge, then one centred column. **Avanti** sits in the footer. A Bozza (draft) row reopens the wizard at its first incomplete step.
- **Client wizard:** full page, with the stepper **Dettagli · Materiale · Introduzione**. Step 3 stays hidden until it has been designed with the owner, so the wizard ends on step 2.
- **Step 1 Dettagli** shows, in order: Nome, Settore (pills), Descrizione (with a live counter), Logo (preview, replace), and Contesto/Soluzione/Risultati (textareas with one-line prompts).
  - **Avanti** stays inactive until every field is filled, with the reason linked through `aria-describedby`.
  - On a new client, **Avanti** creates the client and opens step 2. On an existing client, the three texts autosave and the other fields save on **Avanti**.
  - A duplicate name shows "Esiste già un cliente con questo nome." There is no code field.
- **Step 2 Materiale:**
  - The copy above the drop zone reads "Carica fino a 3 file, almeno 2 immagini. Le immagini servono per le pagine di introduzione."
  - A 4th file is refused inline with "Massimo 3 file."
  - **Crea introduzione** stays inactive until 2 images are uploaded, with the reason "Carica almeno 2 immagini."
  - Pressing it shows "Stiamo preparando l'introduzione di {client}." with **Torna ai clienti**. Before 3.9 lands, it goes to the client page instead.
- **Clients page:**
  - The table has Code (mono), Name and Case histories, sorted A–Z, with search over name and code.
  - A client with an unfinished wizard reopens at Dettagli if a required field is empty, otherwise at Materiale.
  - The client page (`/clients/{clientId}`) shows the logo, name, code, industries as pills and the description (not the brief), plus that client's Case history table and **Nuova case history**.
  - Until 4.12, **Modifica cliente** opens the wizard at step 1 with the note "Il codice {code} non cambia. Le modifiche si vedono in tutte le sue case history."
- **Accessibility:** visible focus ring, full keyboard access, upload progress announced to screen readers, reduced motion respected.

## Cross-Story Dependencies

- 2.1–2.14 are done. 2.15 replaces the client dialog from 2.13/2.14 and reworks their sector field and client page.
- 2.16 follows 2.15. Both must land before 3.2 and before 3.9, the client intro draft, which is triggered by **Crea introduzione**. 4.11 later adds wizard step 3, and 4.12 adds the client overview and **Dati cliente**.
- Sprint 2 order: 2.15 → 2.16 → 3.2 … 3.8 → 3.9 → 4.1 … 4.8 → 4.11 → 4.9 → 4.12.
- Epic 3 reads the client through `getClientInfoForCase`. `client_field` refs use the keys `description`, `industry`, `context`, `solution` and `results`. The intro gate counts image rows in `client_asset` (`NO_CLIENT_IMAGES`).
