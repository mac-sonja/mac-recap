---
title: "Sprint Change Proposal: clients as records and readable case history codes"
date: 2026-10-15
status: approved
approved: 2026-10-15 (owner, with the recommended answers to all five open questions)
owner: Sonja (product owner)
scope: moderate
mode: batch
triggers: [C9, C10, C11, C12]
source: "Owner decisions of 2026-10-15 (review of the Case history table and the wizard after Story 2.10, PR #36, and the wording change in PR #38)"
---

# Sprint Change Proposal, 2026-10-15

## 1. Issue summary

On 2026-10-15 the product owner reviewed the Case history table and the wizard after Story 2.10. She made four decisions. Each one conflicts with FR1, AD-2, Stories 2.5 and 2.6 (both built) and the UX table and step 0 specs.

| ID | Decision | Conflicts with |
|---|---|---|
| C9 | The ID people see is a short readable code (client code, year, number), e.g. `LUM-2026-01`, not the uuid. | FR1 / AR2 / AD-2 ("the only identifier"), Convention "never expose sequential ids", UX-DR4 (ID column), UX-DR7 and the wizard top bar (ID in the header), Stories 2.5 and 2.6 |
| C10 | Each case history belongs to a client record. Client stops being free text. One case history covers one deliverable. | `case_study.client text` (Story 2.5 migration), `create_case_study(p_client text…)`, the ER diagram, AD-1 ownership, UX-DR6 and Story 5.1 facets (now built on records) |
| C11 | New **Clients** page in the dashboard: list, add, edit, and click a client to see only its case histories. | UX-DR1 (sidebar), the EXPERIENCE IA table, the AD-11 matrix (no client actions) |
| C12 | When creating a case history, people pick an existing client from a list. Clients are added only on the Clients page. | UX-DR7 and Story 2.5 ("enter a name and a client") |

Type: new requirement from the stakeholder (product owner). No technical limitation is involved.

Evidence:
- `wizard-frame.tsx` prints `caseStudy.id`, a 36-character uuid, in the top bar.
- `case-studies-table.tsx` shows the same uuid in the ID column and sorts it as a string.
- `case_study.client` is `text not null`, so the same client can be spelled several ways. Dev holds a few cases, for example "Test Lumen" with client "Lumen Srl".

**Related context (not part of this change).** PR #38 (`chore/copy-case-history-account-recap`, open) changes three things in the UI only:
- Italian UI copy says *case history* instead of *case study*.
- The user menu is labelled **Account**.
- *RECAP* sits next to the MAC logo.

The planning documents still say "case study". Section 4.5 proposes a light terminology note.

## 2. Impact analysis

### Epics
- **Epic 2 (in progress)** can still be completed. It gets two new stories, 2.12 and 2.13, and AC amendments to Story 2.5 (in progress) and Story 2.6 (done). Nothing built so far is thrown away: the wizard, table and create path are changed in place.
- **Epic 3 (backlog)** has no story changes. Its start moves back by the time 2.12 and 2.13 take (section 3). Doing the data change now is cheaper: the `revision`, `job` and `export` tables and every later list don't exist yet.
- **Epic 4 (backlog)** has no story text changes:
  - Story 4.1 inherits the code column and search from Story 2.6.
  - A soft-deleted draft keeps its number, so numbers are never reused (rule 5 in AD-21).
- **Epic 5 (backlog)** has a wording change only. In Story 5.1 the Client facet lists client records and the search also matches the code. The code is not shown on the shared link page or in exports (rule 8 in AD-21).
- **Epic 6:** Story 6.3's role table gains no admin client rights. The new policy actions are owner/designer only.
- No epic becomes obsolete, none is added, and the epic order is unchanged.

### Stories
| Story | Change |
|---|---|
| 2.5 Create a case study with a permanent ID (in progress) | Step 0 picks a client from a list. The header shows the code. The ACs are amended in 4.1, and the work is delivered by Story 2.12. |
| 2.6 Find and reopen case studies (done) | The ID column shows the code, search matches the code, and sort orders codes naturally. Amended ACs, delivered by Story 2.12. |
| **2.12 (new)** Clients as records, with readable case history codes | Migration and data migration, the client and code backend, the step 0 picker, and the code in the table and top bar |
| **2.13 (new)** Clients page | Sidebar item, list, add, rename, and a client's case histories |
| 5.1 Library | Wording: the Client facet is built from client records, and search covers the code |

### Artifact conflicts
- **PRD:**
  - FR1
  - Terms: new *Client* and *Case history code*, plus a terminology note
  - Story 2.2
  - a new Story 2.5 (Clients) in Epic 2
  - the Epic 2 summary and the changelog line
- **Epics:**
  - FR1, AR2, a new AR23, UX-DR1, UX-DR4, UX-DR7, a new UX-DR35, and the FR coverage row
  - Stories 2.5, 2.6, 5.1 and the new 2.12 and 2.13
- **Architecture:**
  - AD-1 (ownership)
  - AD-2 (amended)
  - a new AD-21 (readable case code)
  - the AD-11 matrix (two actions)
  - Conventions (IDs)
  - the ER diagram and the FR map
- **UX (EXPERIENCE.md):**
  - roles, the IA table, navigation, and the Case studies table (columns, search)
  - the wizard layout (top bar) and step 0
  - a new *Clients* pattern, Flow 1 step 1, and the conflicts log (C9 to C12)
- **UX (DESIGN.md):** no change. The Clients page reuses the table, dialog and mono tokens. No new mockup is needed (open question 3).
- **Tracking and supporting docs:**
  - `sprint-status.yaml`
  - `epic-2-context.md` (lines 25, 51 and 60)
  - SPEC: `SPEC.md` CAP-1 and `ui-flows.md` line 32

### Technical impact (from the code as of `4bf9400`)
- **Database.** One forward-only migration (AR12). No applied migration is edited.
  - New `client` table: uuid `id`, `name`, `name_key`, `code`, `created_by`, `created_at` and `updated_at`.
  - New `case_number_counter` table: `client_id`, `year` and `last_number`, with primary key (`client_id`, `year`).
  - `case_study` gains `client_id` (FK, not null), `number` (int, not null) and `code` (text, not null, unique), plus a unique key on (`client_id`, `year`, `number`).
  - `case_study.client` (text) is dropped after the backfill.
  - `create_case_study(text, text, integer, text, uuid)` is replaced by `create_case_study(p_name, p_client_id, p_year, p_locale, p_actor_id)`, which assigns the number and code in the same transaction.
  - New functions `client_code_letters(name)`, `create_client(name, actor)` and `rename_client(id, name, actor)`. They are service role only and have RLS like every table.
  - The `unaccent` extension is enabled in the `extensions` schema.
  - Triggers reject any change to `client.code`, `case_study.code` and `case_study.number`, and reject deletes on `client`.
- **Data migration**, which runs in the same migration on every environment (dev, staging, and the `mac-recap` prod project, whatever rows they hold):
  1. Group the existing `case_study.client` values by `name_key` (rule 2 in AD-21), soft-deleted cases included.
  2. Create one client per group. Its name is the spelling of the group's earliest case. Clients get their codes in order of their earliest case's `created_at`, so the oldest client gets the shortest code.
  3. Set `client_id` on every case.
  4. Number each case per (`client_id`, `year`), ordered by `created_at` and then `id`, and set `code`.
  5. Seed `case_number_counter` with each pair's highest number.
  6. Check in the migration that no case is left without `client_id` or `code`, and abort otherwise.

  Example: "Test Lumen" (client "Lumen Srl", 2026) becomes client *Lumen Srl* `LUM` and case `LUM-2026-01`.
- **`case-study` module.**
  - Domain: `CaseStudy.client: string` becomes `client: { id, name, code }`, and `code` and `number` are added. The create input takes `clientId`, not `client`. New client schemas.
  - Repository: the reads join `client`.
  - New use cases `listClients`, `getClient`, `createClient` and `renameClient`. `list(scope)` accepts an optional `clientId`.
  - New error codes: `CLIENT_NOT_FOUND` (404), `CLIENT_NAME_TAKEN` (409) and `CLIENT_CODE_EXHAUSTED` (409).
  - `case_created` event data adds `clientId`, `clientCode` and `code`. Old events stay as they are (append-only).
- **Access:** two new policy actions, `list clients` and `manage clients`, plus their tests.
- **UI:**
  - `name-step.tsx`: the client text input becomes a select.
  - `wizard-frame.tsx` shows `code`.
  - `filter-sort.ts` and `case-studies-table.tsx`: the ID column, search and sort use the code.
  - `sidebar.tsx` gets a Clients item.
  - New `(tool)/clients` and `(tool)/clients/[clientId]` pages and their server actions.
  - New dictionary keys in `it.ts`.
- **Tests and CI:**
  - DB tests: normalisation cases, concurrent creates, immutability and backfill.
  - The use case, action and UI tests change wherever `client` was a string.
  - `db.types.ts` is regenerated in CI. There is no local Docker, so commit the CI artifact if the drift check fails.
- **Unchanged:** URLs, foreign keys, `wizardHref(caseId)`, `project_order_ref` and the MCP seam all keep the uuid.

## 3. Recommended approach

**Direct adjustment.** Add Stories 2.12 and 2.13 to Epic 2 and land them before Epic 3 starts.

| Path | Verdict |
|---|---|
| A. Direct adjustment: new stories 2.12 and 2.13 in Epic 2, amended ACs on 2.5 and 2.6 | **Recommended.** Medium effort, low to medium risk. The schema change touches one table that only Epic 2 reads today. |
| B. Rollback | Not applicable. Nothing built is wrong, it is only incomplete. Reverting Story 2.5 or 2.6 would lose working code, and applied migrations can't be edited. |
| C. MVP review | Not needed. The demo criteria (upload, generate, review, export) are untouched. This adds a small management surface and a display field. |

**Keep the uuid, add the code.** The internal uuid stays the permanent technical id: primary key, foreign keys, URLs and the future MAC Productive link. The readable code is a separate stored field. It is unique, fixed at creation and shown wherever people see an ID.
- *Gain:* nothing that already references a case changes. Codes can follow human rules (per client, per year) without becoming a key that other tables depend on.
- *Trade-off:* a case has two identifiers. URLs still show the uuid, so a person can't type `/case-studies/LUM-2026-01` (a lookup by code can be added later if wanted). The code also reveals how many case histories a client had that year, which is acceptable inside a gated internal tool and is why it stays off shared links and exports.

**Effort and timeline.**
- Story 2.12 takes about 1–1.5 dev days and Story 2.13 about 0.5–1 dev day.
- Epic 3 starts after 2.13 merges, about two working days later than it would have. That time comes out of Sprint 2 (due 2026-10-21), already the tightest sprint (PRD Known risks).
- Fallback lever if the schedule slips: ship 2.13 without the client's own case-history page, because the table search by client already covers it. Then add that page as the last Epic 2 item.

**Risk.**
- *The data migration* is the main risk. It is forward-only and runs on every environment, prod included. It is mitigated by the in-migration completeness check, DB tests over a seeded mix of names, and applying to dev before staging and prod (AR12).
- *Concurrency* is handled in the database (AD-21 rules 4 and 6), not in the app.

## 4. Detailed change proposals

### 4.1 Stories and epics (`epics.md`)

**FR1**
- OLD: "…the system gives it a unique, permanent ID (a database-generated uuid that is never changed or reused). The ID is the only identifier exposed to other systems…"
- NEW: "…the system gives it a unique, permanent ID (a database-generated uuid that is never changed or reused) and a readable **case history code** (client code, year, number, e.g. `LUM-2026-01`), fixed at creation. The code is what people see; the uuid is the only identifier exposed to other systems and used in URLs. Every case belongs to one client record, picked from the client list. (CAP-1, Stories 2.2 and 2.5)"
- Rationale: C9 and C10.

**AR2**
- OLD: "`case_study.id` is a DB-generated uuid, immutable, never reused; `project_order_ref` nullable and unset in the MVP."
- NEW: OLD + "`case_study.code` is a separate, unique, immutable display code (AD-21); it is never used as a key or in URLs."

**AR23 (new)**
- NEW: "AR23 (AD-21): `client` (uuid id, unique `name_key`, unique immutable `code`) owned by `case-study`; every case has `client_id`. Case code `{clientCode}-{year}-{nn}` is assigned inside `create_case_study` from `case_number_counter`, fixed once created, never reused."

**UX-DR1**
- OLD: "…Templates (owner/designer, scope per C4), Users (admin), user menu with sign-out."
- NEW: "…**Clients** (owner/designer), Templates (owner/designer, scope per C4), Users (admin), the **Account** menu with sign-out. *RECAP* sits by the logo."

**UX-DR4**
- OLD: "Columns ID (monospace)… Search 'Search name, client or ID'… over name, client, ID."
- NEW: "Columns ID (the case history code, monospace)… Search 'Search name, client or code'… over name, client name, client code and case code. Sorting by ID orders codes naturally (`LUM-2026-9` < `LUM-2026-10`)."

**UX-DR7**
- OLD: "Name (required) and client (required), year defaulting to the current year. The case is created and its ID shown in the header…"
- NEW: "Name (required) and client (required, picked from the existing clients; no free text, no adding here), year defaulting to the current year. The case is created and its code shown in the header…"

**UX-DR35 (new)**
- NEW: "Clients (owner/designer). Table of clients (Code mono, Name, Case histories count), search over name and code, default sort Name A–Z; **Add client** dialog (name); **Edit name** dialog that states the code stays the same; row click opens the client page: client name and code, Edit name, and the Case history table limited to that client, with **New case history** preselecting the client. No delete. Below 1024 px read-only."

**FR coverage map**
- OLD: "FR1 | Epic 2 | Manual creation with a permanent uuid"
- NEW: "FR1 | Epic 2 | Manual creation with a permanent uuid, readable code and client record"

**Story 2.5** (in progress). AC amendments only; Story 2.12 delivers them.
- OLD AC: "**When** I enter a name and a client (both required) and confirm… **Then** … the wizard header shows its ID in the `mono` style…"
- NEW AC: "**When** I enter a name, pick a client from the list (both required) and confirm… **Then** … the wizard header shows its case history code (e.g. `LUM-2026-01`) in the `mono` style…"
- OLD AC: "the form doesn't submit while name or client is empty"
- NEW AC: "the form doesn't submit while the name is empty or no client is picked"
- Note: the migration AC (`client` column) is superseded by Story 2.12. A banner on the 2.5 specs says so.

**Story 2.6** (done). AC amendments; Story 2.12 delivers them.
- OLD: "a table shows ID (monospace), Name, Client…" and "rows filter by name, client or ID"
- NEW: "a table shows ID (the case history code, monospace), Name, Client (the client's name)…" and "rows filter by name, client name, client code or case code"

**Story 2.12 (new): Clients as records, with readable case history codes**

As an owner/designer,
I want every case history to belong to a client record and to carry a short code like `LUM-2026-01`,
So that I can recognise and quote a case history at a glance, and clients are spelled one way.

Covers: FR1 (amended), CAP-1, AR2, AR23, AR12, AR20, UX-DR4, UX-DR7. It delivers the amended ACs of Stories 2.5 and 2.6.
Order: first. It has to land before 2.13 and before Epic 3.

Acceptance criteria:

**Given** the forward migration for this story
**When** it runs on a database that has cases with free-text clients
**Then**:
- a `client` table exists (uuid `id`, `name`, unique `name_key`, unique `code`, `created_by`, `created_at`, `updated_at`), with RLS denying `anon` and `authenticated`
- every existing case has a `client_id`, a `number` and a `code` per AD-21, including soft-deleted cases
- identical clients after normalisation (rule 2 in AD-21, e.g. "Lumen Srl" and "lumen  srl") share one client
- `case_study.client` (text) no longer exists
- `case_number_counter` holds each (client, year) pair's highest number
- the migration aborts, with nothing applied, if any case would be left without a client or code
- no applied migration is edited

**Given** the dev case "Test Lumen" with client "Lumen Srl" and year 2026, and no other Lumen client
**When** the migration has run
**Then** a client *Lumen Srl* with code `LUM` exists, and the case's code is `LUM-2026-01`

**Given** the client code rules (AD-21 rules 1–3)
**When** the DB tests run `create_client` on these names in this order: "Lumen Srl", "Lumina S.p.A.", "Lume", "Città di Torino", "A2A", "3M"
**Then** the codes are `LUM`, `LUMI`, `LUME`, `CIT`, `AAX` and `MXX`
**And** a name equal to an existing client's after normalisation is rejected with `CLIENT_NAME_TAKEN`, and nothing is written

**Given** wizard step 0
**When** it loads
**Then**:
- the client field is a select of every client, sorted by name, each option showing the name and its code
- with no clients, the field is replaced by "Nessun cliente. Aggiungilo nella pagina Clienti." and **Avanti** stays inactive
- there is no way to type a new client here

**Given** a name and a picked client
**When** I press **Avanti**
**Then**:
- `createCaseStudy({ name, clientId, year, locale })` creates the case with the next number for that client and year
- the top bar shows the code in mono, not the uuid
- `case_created` records `clientId`, `clientCode` and `code`
- an unknown `clientId` returns `CLIENT_NOT_FOUND` and writes nothing

**Given** a client with cases `LUM-2025-01` and `LUM-2025-02`
**When** the first 2026 case for that client is created
**Then** its code is `LUM-2026-01`
**And** the 100th case of a client in one year gets `LUM-2026-100`

**Given** two owner/designers create a case for the same client and year at the same moment (a DB test runs both in parallel)
**When** both commit
**Then** they get consecutive numbers with no duplicate, and a failed create leaves no gap

**Given** an existing case
**When** any code path tries to change `code` or `number`, or to change or reuse `client.code`
**Then** the database rejects it
**And** URLs and every foreign key still use the uuid

**Given** the Case history table
**When** it loads
**Then**:
- the ID column shows the code
- search matches name, client name, client code and case code
- sorting by ID orders codes naturally
- the Client column shows the client's current name

**Given** CI
**When** the `check`, `db` and `image` jobs run
**Then** they pass, and `db.types.ts` matches the generated types

**Story 2.13 (new): Clients page**

As an owner/designer,
I want a Clients page where I add and rename clients and see each client's case histories,
So that the client list stays clean and I can find everything we did for one client.

Covers: UX-DR1 (Clients item), UX-DR35, UX-DR30, AR11 (`list clients`, `manage clients`), AR23
Order: after 2.12, before Epic 3.

Acceptance criteria:

**Given** an owner/designer
**When** the sidebar renders
**Then**:
- it shows **Clienti** between Case history and Templates
- account/sales/social and admin users don't see it
- a direct URL to `/clients` from those roles returns to their landing page (UX-DR2)

**Given** the Clients page
**When** it loads
**Then**:
- a table lists every client with Code (mono), Name and Case histories (count of non-deleted cases), sorted by name A–Z, with header sort
- search over name and code works with the table's rules (case- and accent-insensitive, ~250 ms debounce)
- it has skeleton, empty ("Nessun cliente. Aggiungi il primo.") and no-results states

**Given** **Aggiungi cliente**
**When** I enter a name (1–120 characters after trimming) and confirm
**Then**:
- the client is created with its automatic code (AD-21) and appears in the list with that code
- a duplicate name shows "Esiste già un cliente con questo nome." and keeps the dialog open
- there is no code field

**Given** **Modifica nome** on a client
**When** I save a new name
**Then**:
- the name changes everywhere it is shown, including its case histories
- the dialog says "Il codice {code} non cambia." and the code and every case code stay the same
- a duplicate name is rejected as on add

**Given** a client row
**When** I click it
**Then**:
- `/clients/{clientId}` shows the client's name and code, **Modifica nome**, and the Case history table limited to that client's non-deleted cases, with the same columns, search, sort and row click
- with no cases it shows "Nessuna case history per questo cliente." and **Nuova case history**, which opens step 0 with the client preselected

**Given** a client
**When** I look for a delete action
**Then** there is none, and no delete action exists on the server

**Given** a viewport narrower than 1024 px
**When** I open Clients
**Then** the list still loads, searches and sorts, read-only, with no add or edit

**Given** the policy tests
**When** they run
**Then** `list clients` and `manage clients` are allowed for owner_designer only

**Story 5.1** (backlog). Wording only.
- OLD: "it matches name, client and ID with the same rules as the table (Story 2.6)"
- NEW: "it matches name, client name, client code and case code with the same rules as the table (Story 2.6)"
- Card ACs are unchanged. The Client facet lists client names.

### 4.2 PRD (`prds/prd-MAC Recap-2026-10-08/prd.md`)
- **Changelog line (top):** add "Updated Oct 15, 2026: case studies belong to client records managed on a Clients page, and show a readable code such as LUM-2026-01 next to the permanent ID ([Sprint Change Proposal 2026-10-15](../../sprint-change-proposal-2026-10-15.md))." Header `updated: 2026-10-15`.
- **Terms**:
  - Case study, OLD: "…Each has a unique ID."
  - Case study, NEW: "…Each has a unique ID and a readable case history code, and belongs to one client. In the Italian UI a case study is called a *case history*."
  - New term **Client**: "A company MAC worked for. Each has an automatic short code (e.g. LUM). Clients are managed on the Clients page."
  - New term **Case history code**: "Client code, year and a number per client and year, e.g. LUM-2026-01. Fixed once the case study is created."
- **FR1**
  - OLD: "The system creates every case study with a unique ID, ready to be linked to the project order later."
  - NEW: "The system creates every case study with a unique ID, ready to be linked to the project order later, and a readable case history code. The owner/designer picks the case study's client from the client list."
- **Story 2.2**: add the AC "I pick the client from the existing clients" and the AC "The case study shows a readable code, e.g. LUM-2026-01, that never changes".
- **New Story 2.5:** "As an owner/designer, I want to manage the client list. I can add a client and edit its name; the client code is automatic and never changes; I can open a client to see only its case studies." (PRD numbering: new items are added at the end.)
- **§ 7 Epic list, Epic 2:** "…create the case study with a unique ID and a readable code for a client from the client list, and handle file upload, favourites and the details form."
- **No change:** NFRs, open points, and the MVP success criteria.

### 4.3 Architecture (`architecture/…/ARCHITECTURE-SPINE.md`)
- **AD-1 table:** the `case-study` row, OLD "`case_study`, `revision`, `case_event`", NEW "`case_study`, `client`, `case_number_counter`, `revision`, `case_event`".
  - Rationale: the code is assigned in the create transaction, so its tables sit with `case_study`. A separate `client` module would need a cross-module write inside one transaction.
- **AD-2**
  - OLD "Prevents: a second 'project code' competing with the ID…" and "It is the only identifier exposed to other systems."
  - NEW: keep both, and add "The readable case history code (AD-21) is a display field: never a key, never in URLs or APIs to other systems, and not a substitute for the project-order link."
- **AD-21 (new): A case history's readable code is fixed at creation and unique**
  - **Binds:** FR1, PRD Stories 2.2 and 2.5, `case-study`
  - **Prevents:** duplicate or shifting codes, codes that depend on client spelling, and two people getting the same number
  - **Rule:**
    1. **Client code letters.** Strip accents (`unaccent`) and uppercase. Remove dots, then drop these whole-word legal suffixes: SRL, SRLS, SPA, SAPA, SAS, SNC, SS, SCARL, SCRL, SCPA, COOP, ONLUS, ETS, APS, GMBH, AG, KG, LTD, LLC, LLP, INC, CORP, CO, SA, SARL, SL, BV, NV, PLC. If that leaves no letters, keep them. Keep only the letters A–Z of the remaining words, joined. Pad to 3 letters with `X`, so "3M" gives `MXX`.
    2. **Client name key.** Trim, collapse whitespace, lowercase and strip accents. It is unique, so a second client with the same key is `CLIENT_NAME_TAKEN`.
    3. **Client code.** It is the first free code among these candidates, in order:
       - the first 3 letters
       - the first 4 letters (when the name has 4 or more)
       - the first 3 letters plus A, then B, through Z

       If every candidate is taken, the create fails with `CLIENT_CODE_EXHAUSTED`. `create_client` takes a transaction-level advisory lock, so two clients created at once can't get the same code. A unique index is the backstop. The code is always automatic, can't be edited, doesn't change when the name changes, and clients are never deleted.
    4. **Case number.** Each (client, case year) pair counts from 1, restarting each year. `create_case_study` increments `case_number_counter` with `insert … on conflict do update … returning`. That row lock serialises concurrent creates for the same client and year only. A unique key on (`client_id`, `year`, `number`) is the backstop.
    5. **Fixed and never reused.** Code and number are stored when the case is created. A later change to the case's client or year, or to the client's name, doesn't change them, and a trigger blocks any update. Soft-deleted cases keep their numbers, so a number is never reused and gaps can appear. A failed create rolls the counter back with it.
    6. **Format.** `{clientCode}-{year}-{number}`, with the number padded to at least 2 digits and no upper limit (`LUM-2026-01`, `LUM-2026-100`). It is unique across all cases.
    7. **Single definition.** These rules live once, in SQL (`client_code_letters`, `create_client`, `create_case_study`), used by both the data migration and the app. The TypeScript domain only validates the name length (1–120) and never computes codes.
    8. **Where it shows.** The code appears in the app's tables, wizard and library. It is not shown on the shared link page or in exports.
- **AD-11 matrix:** two new rows.
  - `list clients`: owner_designer ✓, account_sales_social —, admin —, system —
  - `manage clients (add, rename)`: owner_designer ✓, account_sales_social —, admin —, system —
  - No delete-client action.
- **Consistency Conventions, IDs**
  - OLD: "uuid everywhere (`gen_random_uuid()`), share token excepted (AD-13). Never expose sequential ids."
  - NEW: "uuid everywhere (`gen_random_uuid()`), share token excepted (AD-13). Never expose sequential ids as keys or in URLs; the case history code (AD-21) is the one human-readable display code."
- **Conventions, Mutation:** add "Client changes are not case events (no case exists); `client` keeps `created_by` and `updated_at`."
- **ER diagram:** add `CLIENT ||--o{ CASE_STUDY : owns` and `PROFILE ||--o{ CLIENT : created`, with the comment `%% CASE_STUDY carries code + number (AD-21)`.
- **Capability map, FR1:** OLD "FR1 unique ID | `case-study` | AD-2"; NEW "FR1 unique ID, readable code, client | `case-study` | AD-2, AD-21".
- Header `updated: 2026-10-15`.

### 4.4 UX (`ux-designs/ux-MAC Recap-2026-10-08/EXPERIENCE.md`)
- **Roles table, owner/designer "Can do":** add "manage clients".
- **IA table:** new row: "Clients | Sidebar | Owner/designer | Client list with automatic codes; add and rename; open a client to see its case studies."
- **Navigation:**
  - OLD: "…Case studies, To review (owner/designer only), Templates…, Users (admin only), and the user menu with sign-out."
  - NEW: "…Case studies, To review (owner/designer only), Clients (owner/designer only), Templates…, Users (admin only), and the **Account** menu with sign-out."
- **Case studies table:**
  - Columns, OLD "ID (FR1, monospace…)"; NEW "ID (the case history code, e.g. `LUM-2026-01`, FR1, monospace…)".
  - Search, OLD "over name, client and ID"; NEW "over name, client name, client code and case code".
- **Wizard layout, top bar:** OLD "back arrow and case study name on the left"; NEW "back arrow, case study name and its code (mono) on the left".
- **Step 0:**
  - OLD: "case study name (required) and client (required)."
  - NEW: "case study name (required) and client (required), picked from a list of existing clients showing name and code. Clients are added only on the Clients page; with none, the field says so and links there."
- **New pattern "Clients":** UX-DR35 as the behaviour table (list, add, rename with "the code stays", client page, no delete, read-only below 1024 px). Codes are always automatic.
- **Flow 1, step 1:** "…enters the project name and picks the client. The code appears in the header."
- **Conflicts log:** C9–C12 "Resolved 2026-10-15 by the owner", with one-line outcomes. Header `updated: 2026-10-15`.
- **DESIGN.md:** no change.

### 4.5 Terminology ("case study" → "case history")
- **Recommendation: a light note, not a rename.**
  - Add one line to the PRD Terms (4.2) and to the EXPERIENCE Foundation: "The Italian UI says *case history* (PR #38); 'case study' stays the internal term in these documents, story keys, tables (`case_study`) and code."
  - Story keys, file names, routes (`/case-studies`) and identifiers stay as they are.
- **Rationale:** a full rename would touch about 40 story keys, spec file names and the database schema, and it would add nothing for users. The UI copy is already right.

### 4.6 Tracking and supporting docs
- **`sprint-status.yaml`** (`last_updated` refreshed), new entries after `2-11`:
  - `2-12-clients-and-readable-case-history-codes: backlog  # SCP 2026-10-15; land first, before Epic 3`
  - `2-13-clients-page: backlog  # SCP 2026-10-15; after 2.12`
  - The `2-5` comment adds "client picker and code via Story 2.12".
- **Spec banners:** `spec-2-5-create-a-case-study-backend.md`, `spec-2-5-wizard-shell-and-name-step.md` and `spec-2-6-…` get "Amended 2026-10-15: client record and readable code, see Story 2.12".
- **`epic-2-context.md`:**
  - line 25: client picked from records, and the readable code
  - line 51: the conventions note on the display code
  - line 60: the ID column shows the code
- **SPEC:**
  - `SPEC.md` CAP-1 intent: add "…and a readable code, under a client from the client list."
  - `ui-flows.md` line 32: "enter name and pick the client; the case is created with its code…"

## 5. Implementation handoff

**Scope: Moderate.** It reorganises the Epic 2 backlog (two new stories, amended ACs on two built stories) and updates the PRD, architecture and UX. It is not a replan.

| Role | Responsibility | When |
|---|---|---|
| Product owner (Sonja) | Approve this proposal and answer the open questions below. Confirm the dev client list after the migration (merge or rename any near-duplicates on the Clients page). | Now; client check after 2.12 |
| PO / Dev (docs) | Apply 4.1–4.6 in one docs PR against `main`. It doesn't depend on PR #38, but merge #38 first so the wording matches. | On approval |
| Developer (`bmad-build`) | 1) Story 2.12, migration and data backfill, applied to dev first. 2) Story 2.13, Clients page. One PR per story, with Auto-fix. Then Epic 3. | After the docs PR |

**Success criteria**
- No case in any environment lacks a client or a code, every code is unique, and "Test Lumen" reads `LUM-2026-01`.
- The table and the wizard top bar show codes, and URLs still use the uuid.
- Step 0 offers only existing clients, and the Clients page adds and renames them without changing codes.
- The parallel-create DB test proves there are no duplicate numbers.
- CI `check`, `db` and `image` pass on both story PRs.
- No planning document describes the client as free text or the uuid as the displayed ID.

## Change navigation checklist

| Item | Status | Finding |
|---|---|---|
| 1.1 Triggering story | [x] | No failing story. The trigger is the owner's review of Stories 2.5, 2.6 and 2.10 (PR #36) and the wording change (PR #38). |
| 1.2 Core problem | [x] | New stakeholder requirement: readable IDs, client records, a Clients page, and picking a client from a list (C9–C12) |
| 1.3 Evidence | [x] | The uuid shows in `wizard-frame.tsx` and the table ID column. `case_study.client` is free text. Dev case "Test Lumen" / "Lumen Srl". |
| 2.1 Current epic | [x] | Epic 2 is completable with two new stories and AC edits on 2.5 and 2.6 |
| 2.2 Epic-level changes | [x] | Epic 2 scope gains client records and codes. No epic is added or removed. |
| 2.3 Future epics | [x] | Epic 3: start shifts. Epic 4: none. Epic 5: Story 5.1 wording. Epic 6: no admin client rights. |
| 2.4 Obsolete or new epics | [N/A] | None |
| 2.5 Epic order | [x] | Unchanged. 2.12 and 2.13 land before Epic 3, which costs about two days of Sprint 2 (owner to confirm, Q1). |
| 3.1 PRD | [x] | FR1, Terms, Story 2.2, new Story 2.5, Epic 2 line. The MVP is unaffected. |
| 3.2 Architecture | [x] | AD-1, AD-2, new AD-21, the AD-11 matrix, Conventions, ER, FR map |
| 3.3 UI/UX | [x] | EXPERIENCE: nav, IA, table, wizard top bar, step 0, the new Clients pattern, Flow 1. DESIGN: no change. No new mockup (Q3). |
| 3.4 Other artifacts | [x] | sprint-status, spec banners, epic-2-context, SPEC CAP-1 and ui-flows, DB tests, `db.types.ts` (CI). No change to deployment or CI config. |
| 4.1 Direct adjustment | [x] Viable | Medium effort, low to medium risk |
| 4.2 Rollback | [x] Not viable | Nothing to roll back, and applied migrations are immutable |
| 4.3 MVP review | [x] Not needed | The demo criteria are untouched |
| 4.4 Selected path | [x] | Direct adjustment, keeping the uuid and adding the code |
| 5.1 Issue summary | [x] | Section 1 |
| 5.2 Epic and artifact impact | [x] | Section 2 |
| 5.3 Path and rationale | [x] | Section 3 |
| 5.4 MVP impact and plan | [x] | The MVP is unaffected. Order: docs PR, then 2.12, then 2.13, then Epic 3. |
| 5.5 Handoff | [x] | Section 5 |
| 6.1 Checklist complete | [x] | All applicable items are addressed |
| 6.2 Proposal accuracy | [x] | Each rule is stated once (AD-21) and referenced elsewhere |
| 6.3 Owner approval | [x] | Approved by the owner on 2026-10-15, with the recommended answers to all five open questions |
| 6.4 sprint-status update | [x] | `2-12` and `2-13` added as `backlog` after `2-11`, notes on `2-5` and `2-6`, `last_updated` refreshed (2026-10-15) |
| 6.5 Next steps confirmed | [x] | Docs edits in 4.1–4.6 applied on `docs/scp-2026-10-15-clients-codes`; next: docs PR, then Story 2.12, Story 2.13, then Epic 3 |

## Open questions for the owner (resolved 2026-10-15: all recommended answers accepted)

1. **Accept about two days of Sprint 2 for 2.12 and 2.13 before Epic 3?**
   - *Recommended: yes.* The data change is cheapest before Epic 3 adds tables that read cases.
   - If time gets short, the client's own case-history page (part of 2.13) can wait.
2. **Should "Lumen" and "Lumen Srl" count as the same client?**
   - *Recommended: no.* Uniqueness ignores case, accents and spacing only, not legal suffixes, because two firms can differ by suffix alone.
   - You tidy up duplicates by renaming on the Clients page. There is no merge in this change, so a near-duplicate with case histories stays a separate client (it can't be deleted).
3. **Do the Clients page and the step 0 picker need a mockup first?**
   - *Recommended: no.* Both reuse the existing table, dialog and select patterns.
   - The picker is a native select for now. It can become a searchable combobox if the list grows beyond a few dozen clients.
4. **Should a case history's client or year be editable after creation?**
   - *Recommended: not in this change.* There is no edit path today. If one is added later, the code stays as created (AD-21 rule 5).
5. **Should the code appear on shared links and exports?**
   - *Recommended: no.* It is an internal reference and reveals per-client counts (AD-21 rule 8).
