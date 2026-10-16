---
title: "Sprint Change Proposal: client info in the About the client block"
date: 2026-10-16
status: approved
approved: 2026-10-16 (owner, with the recommended answers to all six open questions)
owner: Sonja (product owner)
scope: moderate
mode: batch
triggers: [C13]
source: "Owner decision of 2026-10-16 (review of the Clients page after Story 2.13, PR #43)"
---

# Sprint Change Proposal, 2026-10-16

## 1. Issue summary

On 2026-10-16 the product owner reviewed the Clients page (Story 2.13). She made one decision. It conflicts with FR3, AD-4, AD-6, AD-18, Stories 2.13 (built) and 3.3–3.7 (backlog), and the UX Clients and configurator specs.

| ID | Decision | Conflicts with |
|---|---|---|
| C13 | When adding or editing a client, people also enter a **short description**, a **sector** and a **logo**. In every case history of that client, this info is shown as an **About the client** block in every format, exactly as entered, and the AI also uses it when writing the narrative. Once a case history is approved, a later change to the client doesn't change it. | FR3 ("only the uploaded material and form answers"), AD-4 (document shape), AD-6 and AD-18 (what the LLM receives), AD-8 (key layout), UX-DR35 (name-only dialogs), Story 2.13 (built), Stories 3.3, 3.4, 3.6, 3.7, 4.3, 4.7, and the Epic 3 prerequisites (templates have no client area) |

Type: new requirement from the stakeholder (product owner). No technical limitation is involved.

Evidence:
- `client` holds only `id`, `name`, `name_key`, `code`, `created_by`, `created_at`, `updated_at` (Story 2.12). `createClientInputSchema` is `{ name }` only.
- The details form (`material/domain/details-form.ts`) has the fields `context`, `solution` and `results`. Nothing describes the client, so the same intro would have to be retyped for every case.
- The template work in Epic 3 has not started, so the design team can still add a client area to the templates at no cost. Story 3.1 is built on `story/3-1-background-job-queue` (not merged) and is unaffected.

## 2. Impact analysis

### Epics
- **Epic 2 (in progress)** gets one new story, 2.14, which delivers the data, storage and Clients page dialogs. Nothing built is thrown away: the Clients page and its dialogs are extended in place.
- **Epic 3 (backlog)** gets AC amendments to Stories 3.3, 3.4, 3.6 and 3.7, and a new design prerequisite: every template, in every format, has an About the client area. Its start moves back by the time 2.14 takes (section 3). Story 3.1 (built, not merged) and Story 3.2 are unaffected.
- **Epic 4 (backlog)** gets AC amendments to Stories 4.3 and 4.7. The About block is read-only in the configurator and isn't part of the claim check.
- **Epic 5 (backlog)** has no story text change. Exports and the shared link page render the document, so they show the About block without new work. The case code is still not shown there (AD-21 rule 8).
- **Epic 6:** no change. Editing client info is part of the existing `manage clients` action, owner/designer only.
- No epic becomes obsolete, none is added, and the epic order is unchanged.

### Stories
| Story | Change |
|---|---|
| **2.14 (new)** Client info: description, sector and logo | Migration, logo storage, the add and edit dialogs, and the client page shows the info |
| 2.13 Clients page (done) | Add and **Edit name** dialogs become add and **Edit client** dialogs. Amended ACs, delivered by Story 2.14. |
| 3.3 Document, revisions, format registry | The document's shared part gains an `about` block, and the revision manifest records the client snapshot |
| 3.4 Templates | Every format has an About the client area, with rules for a missing logo, sector or description, and room for the longest allowed description |
| 3.6 Narrative generator | The LLM also receives the client's name, sector and description. Claims may cite them through `client_field` refs. |
| 3.7 Generate | The job snapshots the client info when it is enqueued, next to the material manifest |
| 4.3 Edit text in place | The About block is not editable in the configurator |
| 4.7 Check every block | The About block is not in the check list and doesn't block approval |

### Artifact conflicts
- **PRD:** the changelog line, Terms (*Client*, new *About the client block*), FR3, Story 3.1, the Story 2.5 (Clients) ACs, and the Epic 3 prerequisites
- **Epics:** FR3, AR4 (AD-4), AR6 (AD-6), AR18, a new AR24, UX-DR35, a new UX-DR36, Stories 2.13, 3.3, 3.4, 3.6, 3.7, 4.3, 4.7, the new Story 2.14, and the Epic 3 prerequisites
- **Architecture:** AD-4 (document shape), AD-6 (LLM input), AD-8 (key layout and logo limits), AD-18 (snapshot and refs), a new AD-22 (client info snapshot), the ER diagram and the FR map
- **UX (EXPERIENCE.md):** the Clients pattern, the configurator (About block), the case study view note, and the conflicts log (C13)
- **UX (DESIGN.md):** no change. The dialogs reuse the existing dialog, textarea and upload patterns.
- **Tracking and supporting docs:** `sprint-status.yaml`, `epic-3-context.md`, a banner on `spec-2-13-clients-page.md`, and `SPEC.md` CAP-1

### Technical impact (from the code on `main` as of `1960776`)
- **Database.** One forward-only migration (AR12). No applied migration is edited.
  - `client` gains `description` (text, null, at most 400 characters after trimming), `sector` (text, null, at most 60 characters after trimming) and `logo_id` (uuid, null, FK to `client_logo`).
  - New `client_logo` table: uuid `id`, `client_id`, `path`, `mime_type`, `size_bytes`, `created_by`, `created_at`. Rows are never updated or deleted, so an old snapshot can always find its logo.
  - `update_client(id, name, description, sector, logo_id, actor)` replaces `rename_client` for the dialog (the name and code rules of AD-21 stay inside it). `create_client` takes the same optional fields.
  - RLS on, revoked from `anon` and `authenticated`, service role only, like every table.
- **Storage.** Same private `material` bucket (AD-8). New key prefix `clients/{clientId}/logos/{logoId}.{ext}`, built only by the `case-study` adapter. Logo uploads use the same signed upload URL flow, limited to PNG, JPEG and WebP (already in the bucket allowlist) and 5 MB, checked on the server. Replacing a logo uploads a new object and points `logo_id` at it; the old object stays.
- **`case-study` module.**
  - Domain: `Client` gains `description`, `sector` and `logo` (`{ id, url }` or null). New schemas `clientInfoSchema` and `updateClientInputSchema`.
  - New use cases `updateClient`, `requestClientLogoUpload` and `confirmClientLogoUpload`. `renameClient` folds into `updateClient`.
  - New `getClientSnapshot(caseId)` on the index, for `generation`: `{ clientId, name, sector, description, logoId }`.
  - New error codes `CLIENT_LOGO_INVALID` (400) and `CLIENT_FIELD_TOO_LONG` (400).
- **`generation` and `rendering` (Epic 3, not built yet).** The document's shared part gains `about: { name, sector, description, logoId } | null`, filled by code from the snapshot, never by the LLM. Renderers draw the logo through a signed URL from `case-study`.
- **UI:** the Clients page dialogs gain a textarea, a sector field and a logo upload with preview. The client page shows the logo, sector and description. New dictionary keys in `it.ts`.
- **Tests and CI:** DB tests for the length limits and the immutable logo rows, use case and action tests for update and logo upload, the authorize guard test, and `db.types.ts` regenerated in CI (commit the CI artifact if the drift check fails, since there is no local Docker).
- **Unchanged:** client codes, case codes, URLs, the `manage clients` permission, and NFR6 (client info never counts as material).

## 3. Recommended approach

**Direct adjustment.** Add Story 2.14 to Epic 2, land it at the start of Sprint 2 before the Epic 3 stories that read client info (3.3 onwards), and amend the Epic 3 and 4 stories that aren't built yet.

| Path | Verdict |
|---|---|
| A. Direct adjustment: new Story 2.14, amended ACs on 2.13 and the Epic 3 and 4 stories | **Recommended.** Medium effort, low risk. Epic 3 hasn't started, so the document and templates take the About block from day one. |
| B. Rollback | Not applicable. Nothing built is wrong, only incomplete. |
| C. MVP review | Not needed. The demo criteria (upload, generate, review, export) are untouched. This adds three fields to clients and one block to the document. |

**Snapshot, not a live link.** At Generate, the job copies the client's info into the job and the new revision. The document holds that copy, and the logo is referenced by the id of a logo row that never changes.
- *Gain:* an approved case history never changes because someone edited the client, which is what the owner asked for. It also follows the existing rule that each revision is frozen (AD-4, AD-18) and is reproducible.
- *Trade-off:* a draft that is already generated also keeps the old info. A client edit reaches a case only at its next generation. Section 6, question 5, covers this.

**Written by a person, so not checked like AI text.** The About block is typed on the client by a person and shown as entered. It is read-only in the configurator and is not one of the blocks that must be checked before approval (AD-19), because the check exists to catch AI mistakes. The AI may still cite the description as a source for its own claims, and those claims are checked as usual.

**Fits by construction.** Text overflow blocks approval (AD-19), and the About block can't be edited in the configurator. So the description has a fixed maximum length (400 characters, to confirm with the design team), and every template must fit the longest allowed description in every format. That way an About block can never block an approval.

**Effort and timeline.**
- Story 2.14 takes about 1–1.5 dev days. The Epic 3 and 4 amendments add a few hours spread across those stories.
- Epic 3's document story (3.3) starts after 2.14 merges, about one working day later than planned. Story 3.1 (built) and 3.2 can go ahead first, so the slip is partly absorbed. Sprint 2 (due 2026-10-21) is already the tightest sprint (PRD Known risks).
- Fallback if the schedule slips: ship description and sector first and add the logo as a follow-up, which must land before Story 3.5 (renderers).

**Risk.**
- *The design dependency* is the main risk. The templates already gate Epic 3, and the About area adds to what the design team must deliver this week. Mitigation: send the request with this week's stakeholder update.
- *Logo quality.* A small or low-contrast logo can look poor in large formats. Mitigation: a minimum size of 400 px on the short side, checked on upload. Background handling is the template's job.

## 4. Detailed change proposals

### 4.1 Stories and epics (`epics.md`)

**FR3**
- OLD: "…It writes the text as challenge, approach and result, using only the uploaded material and form answers."
- NEW: "…It writes the text as challenge, approach and result, using only the uploaded material, the form answers and the client's info (description and sector). Every case study shows an About the client block with the client's logo, name, sector and description, as entered on the client and copied when the draft is generated."
- Rationale: C13.

**AR24 (new)**
- NEW: "AR24 (AD-22): `client` gains optional `description` (≤400), `sector` (≤60) and `logo_id`; logos live in append-only `client_logo` rows under `clients/{clientId}/logos/`. A `generate` job snapshots `{ clientId, name, sector, description, logoId }` at enqueue; the revision stores it, and the document's `about` block is filled from it by code. Later client edits never change an existing revision."

**AR4 / AR6 / AR18** (one-line additions)
- AR4: add "The shared part also holds `about` (AD-22)."
- AR6: add "The LLM also receives the client snapshot's name, sector and description (AD-22)."
- AR18: add "`MaterialRef.kind` gains `client_field` (`description` or `sector`), resolved from the revision's client snapshot. It is a valid claim source and never counts as material."

**UX-DR35**
- OLD: "…**Add client** dialog (name); **Edit name** dialog that states the code stays the same; row click opens the client page: client name and code, Edit name, and the Case history table…"
- NEW: "…**Add client** dialog (name, sector, description, logo); **Edit client** dialog with the same fields, stating that the code stays the same and that approved case histories keep the info they were generated with; row click opens the client page: logo, client name and code, sector, description, **Edit client**, and the Case history table…"

**UX-DR36 (new)**
- NEW: "About the client block. Shown in every format of a case study: logo, client name, sector, description, as copied at generation. Read-only in the configurator, with the hint 'Modifica i dati nella pagina del cliente. Valgono dalla prossima generazione.' Not in the Check tab list. Parts without a value are hidden; the block is hidden when the client had no description, sector or logo."

**Epic 3 prerequisites** (top of Epic 3)
- OLD: "Epic prerequisites (non-dev): graphic template layouts and final case study templates…"
- NEW: "Epic prerequisites (non-dev): graphic template layouts and final case study templates, **each with an About the client area in every format (logo, name, sector, description up to 400 characters, and what shows when any of them is missing)**…"

**Story 2.13** (done). AC amendments; Story 2.14 delivers them.
- OLD AC: "**Given** **Aggiungi cliente** **When** I enter a name (1–120 characters after trimming) and confirm…"
- NEW AC: "**Given** **Aggiungi cliente** **When** I enter a name (1–120 characters after trimming) and optionally a sector, a description and a logo, and confirm…"
- OLD AC: "**Given** **Modifica nome** on a client…"
- NEW AC: "**Given** **Modifica cliente** on a client…", with the rename rules unchanged.
- A banner on `spec-2-13-clients-page.md` says so.

**Story 2.14 (new): Client info (description, sector and logo)**

As an owner/designer,
I want to store a short description, the sector and the logo with each client,
So that every case history for that client introduces them without my retyping it.

Covers: FR3 (amended), AR24, AR8 (key layout), AR11 (`manage clients`), AR12, UX-DR35 (amended), UX-DR30 ([Sprint Change Proposal 2026-10-16](sprint-change-proposal-2026-10-16.md)). It delivers the amended ACs of Story 2.13.
Order: first in Sprint 2. It has to land before Story 3.3.

Acceptance criteria:

**Given** the forward migration for this story
**When** it runs
**Then**:
- `client` has nullable `description`, `sector` and `logo_id`, and every existing client has them empty
- a `client_logo` table exists (uuid `id`, `client_id`, `path`, `mime_type`, `size_bytes`, `created_by`, `created_at`), with RLS denying `anon` and `authenticated`
- the database rejects any update or delete on `client_logo`, and a `description` over 400 or a `sector` over 60 characters after trimming
- no applied migration is edited

**Given** **Aggiungi cliente** or **Modifica cliente**
**When** the dialog opens
**Then** it shows Name (required), Settore (optional, up to 60 characters), Descrizione (optional textarea, up to 400 characters, with a live counter) and Logo (optional upload with preview and **Rimuovi**)
**And** the edit dialog says "Il codice {code} non cambia. Le case history già approvate mantengono i dati con cui sono state generate."

**Given** a logo file
**When** I pick it
**Then**:
- PNG, JPEG or WebP up to 5 MB, at least 400 px on the short side, uploads through a signed upload URL to `clients/{clientId}/logos/{logoId}.{ext}`
- any other type, size or a smaller image is rejected with an inline message, and nothing is written
- the server re-checks type and size at confirm, as for project files (AD-8)

**Given** a client with a logo
**When** I upload a new one or press **Rimuovi** and save
**Then** `logo_id` points to the new row or is cleared, and the old row and object stay

**Given** a description of 401 characters or a sector of 61 after trimming
**When** I try to save
**Then** the field shows an inline error, no server call is made, and a direct action call fails with `CLIENT_FIELD_TOO_LONG` and writes nothing

**Given** a client page
**When** it loads
**Then** it shows the logo (signed URL), name, code, sector and description above the Case history table, and an empty field shows nothing (no placeholder)

**Given** the Clients table
**When** it loads
**Then** it is unchanged (Code, Name, Case histories); sector isn't a column or a search field in this story

**Given** the `case-study` index
**When** `generation` asks for `getClientSnapshot(caseId)`
**Then** it returns `{ clientId, name, sector, description, logoId }` with the client's current values

**Given** account/sales/social or admin
**When** they call any client update or logo action
**Then** it fails with `FORBIDDEN` and writes nothing

**Given** a viewport narrower than 1024 px
**When** I open a client page
**Then** the info shows read-only, with no edit

**Given** CI
**When** the `check`, `db` and `image` jobs run
**Then** they pass, and `db.types.ts` matches the generated types

**Story 3.3** (backlog). AC additions.
- Document schema AC, add: "**And** the shared part has `about: { name, sector, description, logoId } | null`, which is not a text block, has no `check` and no claims"
- Revision AC, add: "**And** `manifest` includes the client snapshot taken at enqueue (AD-22)"

**Story 3.4** (backlog). AC addition.
- Add: "**Given** the design team's template specs **When** a template is coded **Then** every format has an About the client area with its rules for a missing logo, sector or description, and its layout fits a 400-character description without overflow (a test renders the longest allowed description in every format)"
- Add to ⛔ Blocked on: "the About the client area in the final templates"

**Story 3.6** (backlog). AC amendments.
- OLD: "**Then** it includes only items in the manifest plus the form answers…"
- NEW: "**Then** it includes only items in the manifest, the form answers, and the client snapshot's name, sector and description as text…"
- Add: "**And** a claim may cite `client_field` refs (`description`, `sector`); any other unknown ref fails validation as before"
- Add: "**And** the output schema has no `about` field; the LLM never writes or rewrites the About block"

**Story 3.7** (backlog). AC amendment.
- OLD: "…enqueues one `generate` job whose payload carries the material manifest (refs plus content hashes) and `baseHeadVersion`…"
- NEW: "…enqueues one `generate` job whose payload carries the material manifest (refs plus content hashes), the client snapshot (AD-22) and `baseHeadVersion`…"
- Add: "**Given** the client is edited after the job was enqueued **When** the job runs **Then** it uses the snapshot, not the new values"
- Add: "**And** the new revision's `about` block is filled from the snapshot by code, or is `null` when the snapshot has no description, sector or logo"
- Note: client info never enables Generate (NFR6). A case with only client info and the form still has no material.

**Story 4.3** (backlog). AC addition.
- Add: "**Given** the About the client block **When** I click it **Then** it isn't editable and a hint says 'Modifica i dati nella pagina del cliente. Valgono dalla prossima generazione.'"

**Story 4.7** (backlog). AC addition.
- Add: "**And** the About the client block isn't in the Check tab list and doesn't count towards the every-block check; claims citing `client_field` refs are checked like any other claim"

### 4.2 PRD (`prds/prd-MAC Recap-2026-10-08/prd.md`)
- **Changelog line (top):** add "Updated Oct 16, 2026: clients have a description, sector and logo, shown in every case study as an About the client block and used by the AI; approved case studies keep the info they were generated with ([Sprint Change Proposal 2026-10-16](../../sprint-change-proposal-2026-10-16.md))." Header `updated: 2026-10-16`.
- **Terms:**
  - Client, OLD: "A company MAC worked for. Each has an automatic short code (e.g. LUM). Clients are managed on the Clients page."
  - Client, NEW: OLD + " Each can have a short description, a sector and a logo."
  - New term **About the client block**: "The part of every case study that shows the client's logo, name, sector and description, copied from the client when the draft is generated."
- **FR3:**
  - OLD: "…using only the uploaded material and form answers."
  - NEW: "…using only the uploaded material, the form answers and the client's description and sector. Every case study shows the client's info in an About the client block."
- **Story 2.5 (Clients):** add "I can add a short description, a sector and a logo to a client" and "Case studies already approved keep the client info they were generated with".
- **Story 3.1:** OLD "Texts … use only the uploaded material and form answers"; NEW "…use only the uploaded material, form answers and the client's info", and add "The case study shows an About the client block".
- **§ 8 Epic 3 prerequisites:** add "…final case study templates, each with an About the client area".
- **No change:** NFRs (NFR6 still requires an uploaded file), open points, and the MVP success criteria.

### 4.3 Architecture (`architecture/…/ARCHITECTURE-SPINE.md`)
- **AD-4:** in the shared part, add "`about` (AD-22): the client's name, sector, description and logo id, copied from the snapshot by code. It is not a text block: no `blockId` check, no claims, not editable."
- **AD-6:** OLD "The LLM receives only the case's material snapshot and form answers (AD-18)." NEW "The LLM receives only the case's material snapshot, form answers and the client snapshot's name, sector and description (AD-18, AD-22). Client info never counts as material."
- **AD-8:** add the key `clients/{clientId}/logos/{logoId}.{ext}`, owned by `case-study`. Logos: PNG, JPEG, WebP, at most 5 MB, at least 400 px on the short side, checked at signed-URL issue and at confirm. Objects are never deleted.
- **AD-18:** `MaterialRef.kind` gains `client_field` (`description`, `sector`), resolved from the revision's client snapshot. It is a valid claim source (NFR2) and never counts as material (AD-6).
- **AD-22 (new): Client info is copied into each revision when it is generated**
  - **Binds:** FR3 (amended), PRD Story 2.5, `case-study`, `generation`, `rendering`
  - **Prevents:** an approved case history changing because a client was edited, an About block that differs between formats, the LLM rewriting the client's own words, and a missing logo breaking an old revision
  - **Rule:**
    1. `client.description` (≤400) and `client.sector` (≤60) are optional plain text. `client.logo_id` points to a `client_logo` row. Rows in `client_logo` are never updated or deleted.
    2. When a `generate` job is enqueued, `case-study.getClientSnapshot(caseId)` is copied into the job payload. The revision stores it in its manifest.
    3. The document's `about` block is filled by code from the snapshot. The LLM never writes it. It is `null` when the snapshot has no description, sector or logo.
    4. Editing the client never changes an existing revision, whatever its status. The new values reach a case only at its next generation.
    5. Every template fits the maximum description length in every format, so the About block can never cause an overflow that blocks approval.
    6. The About block appears in every format, export and shared link, like the rest of the document. AD-21 rule 8 (no case code there) is unchanged.
- **ER diagram:** add `CLIENT ||--o{ CLIENT_LOGO : has` and the comment `%% CLIENT.logo_id -> current CLIENT_LOGO (AD-22)`.
- **AD-1 table:** the `case-study` row adds `client_logo`.
- **Capability map, FR3:** add AD-22.
- Header `updated: 2026-10-16`.

### 4.4 UX (`ux-designs/ux-MAC Recap-2026-10-08/EXPERIENCE.md`)
- **Clients pattern:**
  - Add client, OLD "name only"; NEW "name, sector, description (up to 400 characters, live counter), logo (upload with preview). The code is automatic."
  - Edit name becomes **Edit client** with the same fields. It states that the code stays the same and that approved case histories keep the info they were generated with.
  - Client page: "logo, name and code, sector, description, **Edit client**, and the Case studies table…"
- **Configurator:** new row "About the client block (UX-DR36): read-only, with the hint pointing to the client page; not in the Check tab."
- **Case study view:** note "The About the client block shows in every format, as generated."
- **Conflicts log:** "C13. Client info. Resolved 2026-10-16 by the owner: clients have description, sector and logo; every case study shows them in an About the client block and the AI uses them; approved case studies keep the info they were generated with." Header `updated: 2026-10-16`.
- **DESIGN.md:** no change.

### 4.5 Tracking and supporting docs
- **`sprint-status.yaml`** (`last_updated` refreshed), new entry after `2-13`:
  - `2-14-client-info-description-sector-logo: backlog  # SCP 2026-10-16; first in Sprint 2, before 3.3`
  - Comments on `3-3`, `3-4`, `3-6`, `3-7`: "About block and client snapshot per SCP 2026-10-16".
  - `3-1` is unaffected. Its status is set by its own PR (built on `story/3-1-background-job-queue`).
- **Spec banner:** `spec-2-13-clients-page.md` gets "Amended 2026-10-16: the dialogs gain sector, description and logo, see Story 2.14".
- **`epic-3-context.md`:** add the About block, the client snapshot and the `client_field` ref. (This file is on the unmerged Story 3.1 branch, not on `main`, so it is updated there or right after 3.1 merges.)
- **SPEC:** `SPEC.md` CAP-1: add "…clients carry a description, sector and logo."

## 5. Implementation handoff

**Scope: Moderate.** It adds one story to Epic 2, amends ACs on one built story and six backlog stories, and updates the PRD, architecture and UX. It is not a replan.

| Role | Responsibility | When |
|---|---|---|
| Product owner (Sonja) | Approve this proposal and answer the open questions below. Ask the design team for the About the client area in the templates. Fill in description, sector and logo for the demo clients once 2.14 is live. | Now; client data after 2.14 |
| Design team | Add an About the client area to every format of the final templates, with what shows when the logo, sector or description is missing. Confirm that 400 characters fits. | With the templates, this week |
| PO / Dev (docs) | Apply 4.1–4.5 in one docs PR against `main`. | On approval |
| Developer (`bmad-build`) | 1) Merge Story 3.1 (built, unaffected). 2) Story 2.14. 3) Epic 3 from Story 3.2, with the amended ACs. One PR per story, with Auto-fix. | After the docs PR |

**Success criteria**
- A client can hold a sector, a description of up to 400 characters and a logo, and replacing the logo keeps the old one for older revisions.
- A generated draft shows the About block in every format, filled from the info the client had at Generate.
- Editing the client after approval leaves the approved case history unchanged, which a test proves.
- The LLM output schema has no `about` field, and client info never enables Generate.
- The longest allowed description renders without overflow in every format.
- CI `check`, `db` and `image` pass on the 2.14 PR.

## 6. Open questions for the owner (resolved 2026-10-16: all recommended answers accepted)

1. **Are sector, description and logo required?**
   - *Recommended: all optional.* Existing clients have none, and adding a client quickly stays possible. A case generated without them simply has no About block, or only the parts that have a value.
2. **Sector: free text or a fixed list?**
   - *Recommended: free text, up to 60 characters, for now.* A fixed list is better for filtering the library, but someone has to define it. It can become a list later without losing data.
3. **How long can the description be?**
   - *Recommended: 400 characters (about 3–4 lines).* The design team must confirm the template fits it in every format, including the social carousel.
4. **Which logo files?**
   - *Recommended: PNG, JPEG and WebP, up to 5 MB, at least 400 px.* SVG is the usual logo format but can carry scripts and needs extra handling in the renderer, so it is left out of the MVP.
5. **What about a draft that is already generated when the client changes?**
   - *Recommended: it keeps the old info too, until it is generated again.* This is the same rule as for approved case histories and keeps one simple rule. The alternative, a "refresh client info" button in the configurator, can be added later.
6. **Can someone change the About text for one case history only?**
   - *Recommended: no.* It is shown exactly as entered on the client. To change it, edit the client and generate again.

## Change navigation checklist

| Item | Status | Finding |
|---|---|---|
| 1.1 Triggering story | [x] | No failing story. The trigger is the owner's review of the Clients page (Story 2.13, PR #43). |
| 1.2 Core problem | [x] | New stakeholder requirement: client info (description, sector, logo), shown in an About the client block and used by the AI, frozen once approved (C13) |
| 1.3 Evidence | [x] | `client` has only name and code. The details form has no client fields. The templates aren't designed yet. |
| 2.1 Current epic | [x] | Epic 2 is completable with Story 2.14 and AC edits on 2.13 |
| 2.2 Epic-level changes | [x] | Epic 2 scope gains client info. Epic 3 gains a design prerequisite. No epic is added or removed. |
| 2.3 Future epics | [x] | Epic 3: 3.3, 3.4, 3.6, 3.7 amended, and 3.3 starts about a day later. Epic 4: 4.3, 4.7 amended. Epic 5: no text change. Epic 6: none. |
| 2.4 Obsolete or new epics | [N/A] | None |
| 2.5 Epic order | [x] | Unchanged. 2.14 lands first in Sprint 2. Story 3.1 (built) and 3.2 can proceed meanwhile. |
| 3.1 PRD | [x] | Changelog, Terms, FR3, Stories 2.5 and 3.1, Epic 3 prerequisites. The MVP is unaffected. |
| 3.2 Architecture | [x] | AD-4, AD-6, AD-8, AD-18, new AD-22, AD-1 table, ER, FR map |
| 3.3 UI/UX | [x] | EXPERIENCE: the Clients pattern, configurator, case study view, conflicts log. DESIGN: no change. No mockup needed. |
| 3.4 Other artifacts | [x] | sprint-status, spec banner, epic-3-context, SPEC CAP-1, DB tests, `db.types.ts` (CI). No change to deployment or CI config. |
| 4.1 Direct adjustment | [x] Viable | Medium effort, low risk |
| 4.2 Rollback | [x] Not viable | Nothing to roll back |
| 4.3 MVP review | [x] Not needed | The demo criteria are untouched |
| 4.4 Selected path | [x] | Direct adjustment, with a per-revision snapshot of the client info |
| 5.1 Issue summary | [x] | Section 1 |
| 5.2 Epic and artifact impact | [x] | Section 2 |
| 5.3 Path and rationale | [x] | Section 3 |
| 5.4 MVP impact and plan | [x] | The MVP is unaffected. Order: docs PR, merge 3.1, Story 2.14, then Epic 3 from 3.2. |
| 5.5 Handoff | [x] | Section 5 |
| 6.1 Checklist complete | [x] | All applicable items are addressed |
| 6.2 Proposal accuracy | [x] | Each rule is stated once (AD-22) and referenced elsewhere |
| 6.3 Owner approval | [x] | Approved by the owner on 2026-10-16, with the recommended answers to all six open questions |
| 6.4 sprint-status update | [x] | `2-14` added as `backlog` after `2-13`, notes on `2-13`, `3-3`, `3-4`, `3-6`, `3-7`, `last_updated` refreshed (2026-10-16) |
| 6.5 Next steps confirmed | [x] | Docs edits in 4.1–4.5 applied on `docs/scp-2026-10-16-client-info`, except `epic-3-context.md`, which exists only on the unmerged Story 3.1 branch and is updated there or right after it merges. Next: docs PR, merge 3.1, Story 2.14, then Epic 3 from 3.2. |
