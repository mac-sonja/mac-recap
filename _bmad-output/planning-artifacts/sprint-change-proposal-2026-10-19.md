---
title: "Sprint Change Proposal: the Add client wizard and the new client fields"
date: 2026-10-19
status: approved
approved: 2026-10-19 (owner)
owner: Sonja (product owner)
scope: moderate
mode: batch
triggers: [C19, C20]
source: "Owner decisions of 2026-10-19 (Sprint 2 kick-off), with the answers to six follow-up questions given the same day"
builds_on: "Sprint Change Proposal 2026-10-16 (client info) and Sprint Change Proposal 2026-10-16 (client intro and collections), both with their owner amendments"
---

# Sprint Change Proposal, 2026-10-19: the Add client wizard and the new client fields

## 1. Issue summary

At the Sprint 2 kick-off (2026-10-19), the owner changed how a client is created. Her words: "clients kinda work like case histories. When I upload material I need to be sent in the configurator to preview how the project intro is shown and be able to edit it."

**C19: Add client is a wizard, like a case history.** Today's plan is a two-step dialog: the data, then 2–3 images, and **Crea cliente** starts the intro draft in the background, with a toast when it is ready. The new plan is a full-page wizard with three steps:

1. **Dettagli**: the client's data (C20).
2. **Materiale**: upload up to 3 files. The button stays off until at least 2 are uploaded.
3. **Introduzione**: the client intro opens in the configurator, where the owner/designer previews it and edits it. The owner and the team haven't designed this step yet, so it may stay hidden for now.

**C20: new client fields.** Step 1 asks for the following (owner answers, 2026-10-19):

| Field | Rule |
|---|---|
| Nome | Required, as today (1–120 characters, unique, sets the code) |
| Settore (industry) | **Required.** Pills, multiselect, at least one, chosen from a fixed list: *Interior design, Energia, Risorse umane, Lusso* "for now". It replaces today's free-text sector (≤60 characters). |
| Descrizione | **Required.** Kept, ≤400 characters. It feeds the About the client block on every case study. |
| Logo | **Required.** Kept, with today's file rules. |
| Contesto, Soluzione, Risultati | **New, required.** Three textareas, like the case history Details step (≤5000 characters each). |

The owner's answers on the step 2 material:
- **Any material type** is accepted (the case history's types: images, videos, PDF, TXT, MD, DOCX).
- **At most 3 files**, and **at least 2 of them must be images**, because the intro pages have 2–3 image slots. A PDF or a video is extra reading for the AI.

**Type of change:** new requirement from the owner. **Evidence:** the owner's messages of 2026-10-19 and her answers to six follow-up questions (logo, description, step 2 file types, required fields, images among the files, logo and description required).

## 2. Impact analysis

**Epic impact.**
- **Epic 2** (in progress) gains work. Story 2.15 (not built) is rewritten and split in two. Stories 2.13 and 2.14 (done) get amended criteria, and their built code changes: the dialog, the sector column and the client page.
- **Epic 3** (backlog): Stories 3.3, 3.4, 3.6 and 3.9 change how the client is read (industries instead of sector, plus the three new texts). The trigger for 3.9 moves to the end of the wizard's step 2.
- **Epic 4** (backlog): Story 4.11 becomes wizard step 3, and Story 4.12's **Dati cliente** panel gets the new fields.
- **Epics 5 and 6**: no impact. The export hash already includes "each part's client info", which covers the new fields.
- No epic becomes obsolete, no new epic is needed, and the epic order stays the same.

**Story impact.**

| Story | Status | Change |
|---|---|---|
| 2.13 Clients page | done | **Aggiungi cliente** opens the wizard, not a dialog. A client whose wizard isn't finished shows in the table and reopens at its first incomplete step. |
| 2.14 Client info | done | Sector becomes industries (a fixed list, multiselect). Every field is required. The dialog is replaced by the wizard. The 400-character description and the logo rules stay. |
| **2.15** Client wizard and details step (rewritten) | backlog | The wizard shell and step 1 with the new fields. Replaces "Client images". |
| **2.16** Client material step (new) | backlog | Step 2: up to 3 files of any material type, at least 2 images, and the end of the wizard. |
| 3.3 Document and format registry | backlog | The About block shows the industries (joined) instead of the sector. |
| 3.4 Templates | backlog | The About area fits the industries. It no longer needs rules for an empty sector or description, because both are now required. |
| 3.6 Narrative generator | backlog | `client_field` refs gain `industry`, `context`, `solution` and `results`. |
| 3.7 Generate a case study | backlog | The LLM reads the client's industries, description and three texts. |
| 3.9 Client intro template and draft | backlog | It starts from the wizard's step 2. Its input adds the industries, the three texts and the client material. The screen waits and opens the configurator by itself. |
| 4.11 Client intro in the configurator | backlog | It becomes wizard step 3. Its layout is designed with the owner first (⛔ design session). |
| 4.12 Client overview | backlog | **Dati cliente** has the new fields and the client material, with the same rules. |

**Artifact conflicts.**
- **PRD**: FR11; NFR6 (no images, no intro); Terms (*Client*, *About the client block*, *Client intro*); the Story 2.5 bullets; changelog.
- **Architecture**: AD-1 (the `case-study` module owns client material and its key prefix); AD-22 (client fields); AD-23 (intro inputs and gate); AD-18 (`client_field` keys); the ER diagram (`client_image` becomes `client_asset`; new `client_brief`).
- **UX**: UX-DR35 and UX-DR37 (dialog → wizard); EXPERIENCE.md rows for Add client, Edit client, the client page and the About block. The journey "filters by sector" now reads "industry".
- **Implementation artifacts**: the spec banners on spec-2-13 and spec-2-14. Spec-2-14's "Never: sector as … fixed list" is overridden by this proposal. Also epic-2-context.md, epic-3-context.md and sprint-status.yaml.

**Technical impact.**
- A forward migration (no applied migration is edited):
  - `client.industries` (text array, values from the fixed list, at least one), replacing `sector`;
  - a `client_brief` table (`context`, `solution`, `results`, one row per client, ≤5000 each), modelled on `context_form`;
  - a `client_asset` table (up to 3 per client, any material type, with the image size checks), in place of the planned `client_image`.
- The `create_client` and `update_client` RPCs change: they take industries, not sector.
- Code to change:
  - `case-study` domain schemas, validation and the repository;
  - the actions;
  - `client-dialog.tsx` is replaced by wizard steps;
  - the client page (industries as pills);
  - `getClientInfoForCase`, which returns industries;
  - Italian copy in `it.ts`;
  - about 10 test files.
- The case history wizard's frame, stepper, details step, drop zone, asset row and upload helper can be reused. The frame and stepper are hard-wired to cases today, so they need to accept a client as well.
- **Data**: the 2.14 migrations are applied only to mac-recap-dev. Clients there get empty new fields and must finish the wizard before an intro can be generated. Staging and prod have no client data to migrate.

## 3. Recommended approach

**Direct adjustment.** Rewrite 2.15, add 2.16, and amend 2.13, 2.14, 3.3, 3.4, 3.6, 3.7, 3.9, 4.11 and 4.12 plus the PRD, architecture and UX lines above. Nothing is rolled back and nothing leaves the MVP.

**Why.**
- The change mostly reshapes work that isn't built yet: 2.15, 3.9 and 4.11.
- The new texts also fix a known risk of the 16 October proposal: an intro written from a name, a sector and 400 characters would be thin. The AI now has context, solution, results and up to 3 files to work from.
- Rolling back 2.14 would gain nothing: its logo, its description and the dialog's upload code are reused.

**Effort.**

| Item | Estimate |
|---|---|
| 2.15 Client wizard and details step (migration, industries, three texts, the wizard reused for clients, edit through the wizard, rework of 2.14's dialog, page and tests) | ~1.5 dev days |
| 2.16 Client material step (`client_asset`, any type, at least 2 images, the end of the wizard) | ~1 dev day (replaces today's ~1 day for 2.15) |
| Small amendments to 3.3, 3.4, 3.6, 3.7, 3.9 and 4.12 | ~0.25 dev days, inside those stories |
| 4.11 as wizard step 3 | no extra build; waits on a design session with the owner |
| **Net new** | **~1.5–2 dev days** |

**Order.** The owner asked to start with client creation. Sprint 2 now runs as follows:

2.15 → 2.16 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8 → 3.9 → 4.1 → … → 4.8 → 4.11 → 4.9 → 4.12

**Risk.**
- *Schedule (high, already).* Building client creation first pushes the demo path (3.2–3.8) back by about two days. The 2026-10-21 checkpoint ("Epic 3 done, including 3.9") is very unlikely to hold.
  - *Alternative:* build 2.15 and 2.16 after 3.8 and before 3.9. Client creation would then wait for 3.9, its first real use.
  - The owner decides. This proposal follows her request to start with client creation.
- *Design (medium).* Step 3 needs a design session with the owner before 4.11. Until then, the end of step 2 lands on a "preparing the intro" screen. After 3.9, that screen opens the client page when the draft is ready, and after 4.11 it opens the configurator.
- *OP 2 (open).* Whether PDFs and videos are read by the LLM, and how, follows the same open point as case material. Until OP 2 is decided, client files other than images are stored but not sent to the LLM, as for cases.

## 4. Detailed change proposals

### 4.1 Stories (epics.md)

**Story 2.13: Clients page.** Acceptance criteria, Aggiungi cliente.

OLD:
> **Given** **Aggiungi cliente** **When** I enter a name (1–120 characters after trimming) and optionally a sector, a description and a logo … **And** (delivered by Story 2.15 …) Add client becomes two steps: after the data, I add 2–3 images and press **Crea cliente** …

NEW:
> **Given** **Aggiungi cliente** **When** I press it **Then** the client wizard opens full-page at step 1 (delivered by Stories 2.15 and 2.16; SCP 2026-10-19). The name and code rules are unchanged, a duplicate name shows "Esiste già un cliente con questo nome." on step 1, and there is no code field.
> **Given** a client whose wizard isn't finished (a required step 1 field is empty, or fewer than 2 images are uploaded) **When** I click its row **Then** the wizard opens at the first incomplete step: Dettagli if a required field is empty, otherwise Materiale.

*Rationale:* C19.

**Story 2.13: Modifica cliente.**

OLD:
> **Given** **Modifica cliente** … **When** I save a new name **Then** … the dialog says "Il codice {code} non cambia." …

NEW:
> **Given** **Modifica cliente** on a client page **When** I press it **Then**, until Story 4.12 lands, the client wizard opens at step 1 with the client's data, saying "Il codice {code} non cambia. Le modifiche si vedono in tutte le sue case history.", and the name rules are unchanged. From Story 4.12, it opens the client overview.

*Rationale:* there is no dialog left to edit in.

**Story 2.14: Client info.** Add a banner:

> *Amended by SCP 2026-10-19:* the sector becomes `industries` (multiselect from a fixed list); name, industries, description and logo are all required; the dialog is replaced by the client wizard (Story 2.15). The description limit (400), the logo rules, "live, no snapshot" (AD-22) and `getClientInfoForCase` stay; `getClientInfoForCase` now returns `{ clientId, name, industries, description, logoId, brief }`.

The ACs on `sector` ≤60, the optional fields and the dialog are struck through and point to 2.15.

*Rationale:* C20. 2.14 is done, so its record stays readable, and the rework is built in 2.15.

**Story 2.15: rewritten.**

OLD: *Story 2.15: Client images* (2–3 images in step 2 of the Add client dialog; `client_image` table).

NEW:

> ### Story 2.15: Client wizard and details step
>
> As an owner/designer,
> I want to create a client in a wizard like a case history, starting with its details,
> So that every client has the data its intro and its case studies need.
>
> Covers: FR11 (amended), AR24 (amended), AR11 (`manage clients`), UX-DR35 (amended) (SCP 2026-10-19). It reworks the dialog of Stories 2.13 and 2.14.
> Order: MVP, Sprint 2, first (owner, 2026-10-19).
>
> **Given** the forward migration for this story **When** it runs **Then**:
> - `client.industries` exists (text array; each value one of `interior_design`, `energia`, `risorse_umane`, `lusso`; at least one, checked by the database). It is filled from nothing, and `sector` is dropped (no prod data; dev clients lose their sector).
> - A `client_brief` table exists, one row per client, with `context`, `solution` and `results` (each ≤5000 characters after trimming) and RLS denying `anon` and `authenticated`.
> - No applied migration is edited.
>
> **Given** **Aggiungi cliente** **When** the wizard opens **Then** step 1 **Dettagli** shows, in this order:
> - Nome
> - Settore as pills (multiselect; labels *Interior design, Energia, Risorse umane, Lusso*; the list lives in one constant)
> - Descrizione (≤400, live counter)
> - Logo (rules of Story 2.14)
> - Contesto, Soluzione and Risultati (textareas with one-line placeholder prompts, as in Story 2.10)
>
> The stepper shows Dettagli, Materiale and Introduzione.
>
> **Given** step 1 **When** any field is empty or no pill is selected **Then** **Avanti** is inactive, with the reason linked via `aria-describedby`.
> **When** all are filled and I press **Avanti** **Then** the client is created with its automatic code (or updated, if it exists), the texts are saved, and step 2 opens.
>
> **Given** a client that exists **When** I edit a field on step 1 **Then** the three texts autosave as in Story 2.10, and the name, industries and description save on **Avanti** with the rules of Stories 2.13 and 2.14.
>
> **Given** an industry value outside the list, an empty list, or a text over its limit **When** an action is called directly **Then** it fails (`CLIENT_FIELD_INVALID` or `CLIENT_FIELD_TOO_LONG`) and writes nothing.
>
> **Given** a client page **When** it loads **Then** it shows the logo, name, code, industries as pills and the description. The three texts are not shown on the page.
>
> **Given** `getClientInfoForCase(caseId)` **When** it is called **Then** it returns the client's current name, industries, description, logo and brief, read each time (AD-22).
>
> **Given** account/sales/social or admin **When** they call any client action **Then** it fails with `FORBIDDEN` and writes nothing.
>
> **Given** a viewport narrower than 1024 px **When** I open the wizard **Then** it is read-only, as for case histories.

**Story 2.16: new.**

> ### Story 2.16: Client material step
>
> As an owner/designer,
> I want to upload 2–3 files for a client, at least 2 of them images,
> So that the client intro has pictures and the AI has material to write from.
>
> Covers: FR11 (amended), NFR6 (amended), AR8 (client key prefix), AR11, UX-DR37 (amended) (SCP 2026-10-19).
> Order: MVP, Sprint 2: after 2.15, before 3.2 (owner, 2026-10-19).
>
> **Given** the forward migration **When** it runs **Then** a `client_asset` table exists (uuid `id`, `client_id`, `position` 1–3, `path`, `mime_type`, `size_bytes`, `width`, `height` (images only), `created_by`, `created_at`), unique on (`client_id`, `position`), with RLS denying `anon` and `authenticated`.
>
> **Given** step 2 **Materiale** **When** I drop or pick files **Then**:
> - It accepts the case history's material types and size (Story 2.7: images, videos, PDF, TXT, MD, DOCX, ≤50 MB).
> - Images must also be ≥1600 px on the short side.
> - Files upload through signed URLs to `clients/{clientId}/material/{assetId}.{ext}`, and the server re-checks type and size at confirm (AD-8).
> - A 4th file is refused inline ("Massimo 3 file."), and other files aren't blocked.
>
> **Given** step 2 **When** fewer than 2 images are uploaded **Then** **Crea introduzione** is inactive, with the reason "Carica almeno 2 immagini." linked via `aria-describedby`. Copy above the drop zone: "Carica fino a 3 file, almeno 2 immagini. Le immagini servono per le pagine di introduzione."
>
> **Given** rows of uploaded files **When** I remove one **Then** it is removed at once, with no undo, as in Story 2.7. Its row and object are deleted (no history, like logos). Reorder and replace come with 4.12.
>
> **Given** 2–3 files with at least 2 images **When** I press **Crea introduzione** **Then**:
> - Story 3.9's intro draft starts.
> - The wizard shows "Stiamo preparando l'introduzione di {client}." with **Torna ai clienti**.
> - Before Story 3.9 lands, it goes to the client page instead.
>
> **Given** account/sales/social or admin **When** they call any client material action **Then** it fails with `FORBIDDEN` and writes nothing.

*Rationale:* C19 and C20. Splitting the work keeps one reviewable change per story.

**Story 3.3.** About the client block. "logo, name, sector and description" → "logo, name, industries and description".

**Story 3.4.** About area:
- "rules for a missing sector or description" → removed (both required).
- The area fits up to four industry labels plus 400 characters.

**Story 3.6.**
- OLD: "`client_field` (`description` or `sector`)".
- NEW: "`client_field` (`description`, `industry`, `context`, `solution` or `results`)".
- A `client_field` ref is never material.

**Story 3.7.**
- OLD: "the client's current name, sector and description".
- NEW: "the client's current name, industries, description and brief (context, solution, results)".
- The "About block hidden when description, sector and logo are all empty" criterion is removed, because they can't be empty.

**Story 3.9.**
- *Trigger:* OLD "a new client created with 2–3 images, or **Genera introduzione**". NEW "**Crea introduzione** on wizard step 2 (Story 2.16), or **Genera introduzione** on a client without an intro".
- *Gate:* "at least 2 images" stays; it now counts image rows in `client_asset` (`NO_CLIENT_IMAGES`).
- *Input:* OLD "only the client's current name, sector and description … plus the images if OP 2 allows". NEW "the client's current name, industries, description and brief, plus its material as OP 2 allows (until then, nothing but the text fields)".
- *Waiting screen:* the screen stays on "Stiamo preparando…" and opens the intro in the configurator by itself when it is ready (the client page until Story 4.11 lands). If I leave, the toast of Story 3.8 still shows.
- *Live:* "name, sector, description, logo and images" → "name, industries, description, logo and client material".

**Story 4.11.**
- Add: "The configurator in client intro mode is step 3 **Introduzione** of the client wizard; the stepper stays visible."
- Add: "⛔ Blocked on: a design session with the owner for step 3 (owner, 2026-10-19). Until then, step 3 isn't shown and the wizard ends on step 2."

**Story 4.12.** **Dati cliente** shows the step 1 fields and the step 2 material with the rules of Stories 2.15 and 2.16, plus replace and reorder. Removing an image when only 2 remain is refused ("Servono almeno 2 immagini.").

### 4.2 PRD (prd.md)

- **Changelog:** "2026-10-19: Add client is a three-step wizard (Dettagli, Materiale, Introduzione). Client fields: name, industries (fixed list, multiselect), description, logo, context, solution, results, all required. Client material: up to 3 files, any type, at least 2 images (SCP 2026-10-19)."
- **Term *Client*:** "… a description, a sector and a logo" → "… industries, a description, a logo, a brief (context, solution, results) and up to 3 files of material".
- **Term *About the client block*:** sector → industries.
- **Term *Client intro*:** "from its data and 2–3 images" → "from its data, its brief and its material, laid out with its 2–3 images".
- **FR11:** "creating a client asks for 2–3 images" → "creating a client is a wizard: details (all required), then up to 3 files with at least 2 images, then the intro in the configurator".
- **NFR6:** "no images, no intro" → "fewer than 2 client images, no intro".
- **Story 2.5 bullets:** same field list as the Term.

### 4.3 Architecture (ARCHITECTURE-SPINE.md)

- **AD-1:** `case-study` owns `client`, `client_logo`, `client_brief`, `client_asset`, and the `clients/{id}/logos/**` and `clients/{id}/material/**` prefixes (`images/**` is never created).
- **AD-22:**
  - `client` has `industries` (text array, fixed list, ≥1), `description` (≤400) and `logo_id`, all required by the app.
  - `client_brief` holds context, solution and results (≤5000).
  - `getClientInfoForCase` returns `{ clientId, name, industries, description, logoId, brief }`, read live.
- **AD-23:** the intro needs at least 2 image rows in `client_asset` (`NO_CLIENT_IMAGES`); the LLM input is name, industries, description and brief, plus material as OP 2 allows.
- **AD-18:** `MaterialRef.kind` `client_field` keys are `description`, `industry`, `context`, `solution` and `results`.
- **Storage limits (:188):** `client_asset` follows the case material types and 50 MB, plus ≥1600 px for images.
- **ER diagram:** CLIENT_IMAGE → CLIENT_ASSET; add CLIENT_BRIEF (1:1 with CLIENT).

### 4.4 UX (epics.md UX-DRs and EXPERIENCE.md)

- **UX-DR35:**
  - "**Add client** dialog …; **Add client** in two steps …" → "**Aggiungi cliente** opens the client wizard (full-page, like a case history): **Dettagli** (Nome, Settore pills multiselect, Descrizione, Logo, Contesto, Soluzione, Risultati; all required), **Materiale** (up to 3 files, at least 2 images; **Crea introduzione**), **Introduzione** (the configurator in client intro mode; designed with the owner, hidden until then)".
  - **Modifica cliente** opens the wizard at step 1 until Story 4.12.
  - The client page shows the industries as pills.
- **UX-DR37:** "2–3 images per client" → "up to 3 files per client, at least 2 images; images PNG, JPEG or WebP ≥1600 px; other files as case material".
- **EXPERIENCE.md:**
  - Rows :309, :311, :314 and :315 follow UX-DR35 and UX-DR37.
  - :198 and :263: About block shows industries.
  - :466 and :472: "filters by sector" → "filters by industry" (filtering stays out of scope for the MVP, as today).

### 4.5 Implementation artifacts

- spec-2-14: banner "Amended by SCP 2026-10-19". The Never-list item "sector as a column, filter or fixed list" is overridden for "fixed list".
- spec-2-13: banner pointing to the client wizard.
- epic-2-context.md: client info rules and the story list (2.15, 2.16). epic-3-context.md: narrative inputs and the intro gate.
- sprint-status.yaml:
  - rename `2-15-client-images` → `2-15-client-wizard-and-details-step`;
  - add `2-16-client-material-step` (backlog);
  - add comments on 2.13, 2.14, 3.9, 4.11 and 4.12.

## 5. Implementation handoff

**Scope: moderate.** The backlog changes (a rewritten story, a new story, amendments) and a planning-document pass are done here. The build goes to the developer agent story by story.

| Who | What |
|---|---|
| This session (on approval) | Apply section 4 to epics.md, prd.md, ARCHITECTURE-SPINE.md, EXPERIENCE.md, the spec banners, the epic contexts and sprint-status.yaml in one docs PR |
| Developer agent | Build 2.15, then 2.16, each as its own PR with CI; the migration is pushed to mac-recap-dev only after CI passes and the owner agrees |
| Owner + design | A design session for wizard step 3 (client intro in the configurator) before Story 4.11 |
| Owner | Decide at the 2026-10-21 checkpoint whether Epic 3's date moves, given client creation goes first |

**Success criteria.**
- A new client can only be created through the wizard.
- Every field on step 1 is required, and Settore is a multiselect of the four industries.
- Step 2 takes up to 3 files and won't continue with fewer than 2 images.
- After step 2, the screen waits for the intro: the client page until 4.11, then the configurator.
- The About block and the AI read the industries, the description and the brief, always current.

## 6. Owner answers (2026-10-19)

1. **Logo:** kept in step 1.
2. **Description:** Descrizione stays, alongside Contesto, Soluzione and Risultati.
3. **Step 2 file types:** any material type.
4. **Required fields:** everything.
5. **Images among the files:** at least 2 of the files must be images.
6. **Descrizione and logo:** both required.

## Change navigation checklist

| Item | Status | Note |
|---|---|---|
| 1.1 Trigger | [x] | Owner, Sprint 2 kick-off, about Stories 2.13–2.15, 3.9 and 4.11 |
| 1.2 Problem | [x] | New requirement: client creation works like a case history |
| 1.3 Evidence | [x] | Owner messages and six answers (section 6) |
| 2.1 Current epic | [x] | Epic 2 can finish, with 2.15 rewritten and 2.16 added |
| 2.2 Epic changes | [x] | Stories added and amended, no new epic |
| 2.3 Future epics | [x] | Epics 3 and 4 amended; 5 and 6 unaffected |
| 2.4 Obsolete or new epics | [N/A] | None |
| 2.5 Order | [!] | Client creation first, by owner request; the demo path moves back about 2 days |
| 3.1 PRD | [x] | FR11, NFR6, Terms, Story 2.5; MVP unchanged |
| 3.2 Architecture | [x] | AD-1, AD-18, AD-22, AD-23, ER diagram |
| 3.3 UX | [!] | UX-DR35, UX-DR37 and EXPERIENCE rows; step 3 needs a design session |
| 3.4 Other artifacts | [x] | Spec banners, epic contexts, sprint status |
| 4 Path | [x] | Direct adjustment |
| 5 Proposal | [x] | This document |
| 6 Approval | [x] | Approved by the owner, 2026-10-19 |
