---
title: "Sprint Change Proposal: client intro pages, client overview and collections"
date: 2026-10-16
status: approved
approved: 2026-10-16 (owner, with the recommended answers to all ten open questions)
owner: Sonja (product owner)
scope: major
mode: batch
triggers: [C14, C15, C16, C17, C18]
source: "Owner change request of 2026-10-16 (Italian, translated; 'deliverable' = case history), with the owner's answers to the clarifying questions the same day"
amended: 2026-10-16 (owner: all features before the demo, nothing cut; see Amendment)
builds_on: "Sprint Change Proposal 2026-10-16 (client info) and its owner amendment: client info is live, no snapshots, a replaced logo is deleted"
---

# Sprint Change Proposal, 2026-10-16: client intro pages, client overview and collections

## Amendment (2026-10-16, owner): all features before the demo

Later on 2026-10-16 the owner reversed open question 10. Her words, translated: "the changes weren't for after the demo but for now". She was shown that the plan meant about 15 dev days of new work on top of an unbuilt Sprint 2, and was offered three options: part of it in the demo, moving the demo by about 3 weeks, or cutting the social carousel, the A4 PDF and login. She chose: "Tutto. dovremmo farcela" ("Everything. We should make it").

**Decision.** All five decisions (C14–C18) and all eight new stories (2.15, 3.9, 4.11, 4.12, 5.9, 5.10, 5.11, 6.5) are MVP. They are built before the demo, which stays on **2026-10-30**. Nothing is cut: the three MVP formats, shareable links and login all stay.

**What it supersedes** (each superseded statement below is struck through and marked inline):
- **Open question 10** and its recommended answer (features after the demo, from 2026-11-02).
- **The Phase 1 / Phase 2 split.** There is one phase. The section 4 changes marked "[1]" and "Phase 1" are built inside their stories, as before. The ones marked "[2]" or "Phase 2", and every "after the demo", now mean *before the demo, in the order below*. Labels inside section 4 are left as written; this paragraph is how to read them.
- **The "after the demo, from Nov 2" timing**: Phase 2 starting 2026-11-02, the intro and overview by about 2026-11-11, client packs and collections by about 2026-11-20, and the intro template by 2026-11-02.
- **The hybrid recommendation** in section 3. The selected path is now direct adjustment, all before the demo.

**What stays.** Everything else, including:
- every story and AC in section 4, the data model and the two new architecture decisions (AD-23, AD-24)
- the guardrail answer to open question 4 (only owner/designers edit collection text) and the other nine answers, except 10
- the live client info rule (SCP 2026-10-16 amendment)

**Schedule risk, plainly.**
- About **15 dev days** of new work (section 3 table) now has to land before 2026-10-30.
- Of Epics 3–5, only Story 3.1 is built. Sprint 2 (due 2026-10-21) already carries all of Epics 3, 4 and 5, which was the tightest part of the plan before this change (PRD Known risks).
- With the eight new stories, about 36 stories remain for about 9 working days (2026-10-19 to 2026-10-29, with 10-29 kept for the dry run). That is roughly double the pace of Epic 2, which delivered 14 stories between 2026-10-09 and 2026-10-16.
- The design team's **client intro template** is now needed before the demo: by **2026-10-20**, so Story 3.9 can close in Sprint 2. Page names and intro pages are needed by 2026-10-19, with the final templates, which are themselves still due.
- **The four demo criteria are at risk.** These are upload to approval in 15–20 minutes, several formats, both technical and graphic sides, and every claim checked. The risk comes from the time the new work takes away from Epics 3–5, not from the new features themselves.

**Proposed in-sprint order.** Epics stay in order (NFR10). Inside each epic, the new stories come right after the stories they depend on and after that epic's demo-path stories, so the demo path is always built first.

| When | Order |
|---|---|
| Sprint 2, 2026-10-19 → 10-21 | Merge 3.1 and 2.14 (both in review) → **2.15** → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8 → **3.9** → 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.8 → **4.11** → 4.9 → **4.12** |
| Sprint 3, 2026-10-22 → 10-28 | 5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6 → 5.7 → 5.8 → **5.9** → **5.10** → **5.11** → 6.1 → 6.2 → 6.3 → 6.4 → **6.5** |
| 2026-10-29 | Final guardrail check and the dry run (PRD Sprint 3 non-dev) |
| 2026-10-30 | Demo |

Why each new story sits where it does:
- **2.15** needs only 2.14.
- **3.9** needs 2.15 and 3.3–3.8.
- **4.11** needs 4.8 (approve) and goes before 4.9, so 4.9's approved-edit flow covers intros too.
- **4.12** needs 4.9 and 4.11.
- **5.9** needs 5.3–5.4 and 4.11.
- **5.10** needs 5.9 and 5.1.
- **5.11** needs 5.10.
- **6.5** needs 6.4.

Checkpoints:
- **2026-10-21:** Epic 3 done, including 3.9.
- **2026-10-23:** Epic 4 done, including 4.11 and 4.12.
- **2026-10-27:** Epic 5 done, including 5.9–5.11.
- **2026-10-28:** Epic 6 done, including 6.5.

**What slips first if the dates don't hold.** This is a proposal; the owner decides at each checkpoint. Order, first to slip first:
1. 5.11 (collection text edits and hidden pages)
2. 5.10 (collections)
3. 4.12 (client overview)
4. 5.9 (client pack)
5. 3.9, 4.11 and 2.15 (the client intro)

The demo path never slips: 3.2–3.8, 4.1–4.8 and 5.1–5.4. If Epic 6 is late, the demo can still run on the gated pre-login build, as Sprint 2 already does (AD-12). That is the owner's call, since nothing is cut by plan. Moving the demo stays the fallback for a miss on the demo path itself.

## 1. Issue summary

On 2026-10-16 the product owner described how clients, case histories and downloads should fit together. She made five decisions (C14–C18). C15 is already built. The other four add a second kind of document (the client intro), a configurator that shows many documents at once, and a combined download built from several case histories.

| ID | Decision (owner's words, condensed) | Conflicts with |
|---|---|---|
| C14 | **Client intro.** When I create a client I upload 2–3 images. Once the data is in, the configurator opens: I'm also creating the client's introductory pages, which go into its case histories. The AI writes and lays out a draft from the client data and the images; I refine texts and layout in the configurator, as for a case history. | UX-DR35 and Stories 2.13/2.14 (Add client is a one-step dialog, built), AD-3 and AD-4 (a document and its lifecycle belong only to a case), Story 3.3 (`revision.case_id`), AD-6/NFR6 (the "no material" gate is defined for cases only), AD-8 (no client image prefix), AD-11 (no intro actions) |
| C15 | **Client page.** When I open a client I see its case histories and can create more. | None. Delivered by Story 2.13 (client page with its Case history table and **Nuova case history**). Confirmed; no change. |
| C16 | **Client overview.** When I edit a client the configurator opens. The left pane lists all the client's case histories, with the preview in the middle as if they were one single file. Editing a case history there changes that case history, as if it were embedded. | UX-DR35 (**Modifica cliente** opens a dialog, built in 2.14), UX-DR12 (the configurator's left pane is the format list, and it edits one case), AD-17 (one revision per editing session), Stories 4.2–4.9 (single-case configurator) |
| C17 | **Downloads.** PM/account and sales people download from the list of approved case histories. They can also download from the Clients list: the client intro plus all the client's (approved) case histories. | AD-11 (`list clients` is owner/designer only), FR7 and AD-9 (an export is one format of one case), Story 5.3 (export key per revision), UX-DR35 (Clients is owner/designer only) |
| C18 | **Collections (custom case).** Pick the case histories I want; a configurator opens where I reorder them and export. I can edit texts (only in this copy, as if I had duplicated it) and delete pages I don't need. Nothing else can change. Collections have a name and can be reopened, edited and exported again. Every client with 2+ case histories in the collection gets its intro in front of them; the others keep each case history's own intro. | **NFR7** (nothing leaves the tool without an owner/designer's approval) and NFR2, the PRD role table (account/sales/social "does not create, edit or approve"), AD-4 (one document is the single source of truth for a case's text), AD-9 (exports per revision), AD-11 (no collection actions) |

Type: new requirement from the stakeholder (product owner). No technical limitation is involved.

Settled by the owner on 2026-10-16 (not open):
- The AI writes and lays out the intro draft; the owner refines it in the configurator.
- Collections are saved with a name and can be reopened, edited and re-exported.
- Mixed collections: every client with 2+ case histories in the collection gets its intro in front of its case histories; the others use each case history's own intro.
- Client info stays **live** (SCP 2026-10-16 amendment). The intro pages read the client's current name, sector, description and logo at render time, like the About the client block.
- Default, to confirm (Open question 1): only **approved** case histories can be downloaded or put in a collection, and the Clients-list download is the intro plus that client's approved case histories.

Evidence (code on `main` at `35f1c1a`):
- `src/modules/generation/domain` and `src/modules/rendering/domain` are empty. Stories 3.2–3.8 and Epics 4–5 are not started, so the document, revision, template and export designs can still take the new needs at almost no cost. Story 3.1 (job queue) is in review and is unaffected.
- `src/app/(tool)/clients/_components/client-dialog.tsx` is a one-step Add/Edit dialog (name, sector, description, logo). `[clientId]/page.tsx` already shows the client's case histories and **Nuova case history** (C15).
- `src/modules/access/domain/policy.ts`: `list clients` and `manage clients` are `owner_designer` only. `export` is per approved case. There is no action for an intro, a client download or a collection.
- `client_logo` and the `clients/{clientId}/logos/` prefix (Story 2.14, migrations `20261016140000`, `20261016160000`) are the pattern client images can reuse.

## 2. Impact analysis

### Epics

The four new features map onto the existing epics. ~~Most of the new work is **Phase 2, after the demo** (section 3). Phase 1 only makes room for it in stories that aren't built yet.~~ *(superseded by the amendment: everything is built before the demo)*

| Epic | Phase 1 (now, MVP) | Phase 2 (after the demo) |
|---|---|---|
| **Epic 2** (in progress) | No change. C15 is already delivered by Story 2.13. | New **2.15** Client images (2–3 per client). Amends the Add and Edit client flows of 2.13/2.14 (built). |
| **Epic 3** (in progress) | Amend **3.3** (a document belongs to a case *or* a client intro; stable page keys), **3.4** (templates mark their intro pages), **3.5** (pages carry their key; renderers can be chained) | New **3.9** Client intro template and draft |
| **Epic 4** (backlog) | Amend **4.2** (the configurator opens a document by subject, not only by case) | New **4.11** Client intro in the configurator, **4.12** Client overview configurator |
| **Epic 5** (backlog) | Amend **5.3** (an export takes an ordered list of parts; MVP passes one; storage key from a content hash) | New **5.9** Combined export and client pack download, **5.10** Collections, **5.11** Edit texts and remove pages in a collection. Amend **5.1** (multi-select). |
| **Epic 6** (backlog) | No change | New **6.5** Permission check for intros, client packs and collections |

No epic becomes obsolete and the epic order stays the same. ~~Phase 2 stories run after Epic 6, as a second pass in epic order (2.15 → 3.9 → 4.11 → 4.12 → 5.9 → 5.10 → 5.11 → 6.5).~~ *(superseded by the amendment: the new stories are built before the demo, in the amendment's in-sprint order)*

### Stories

| Story | Phase | Change |
|---|---|---|
| 2.13 Clients page (done) | 2 | **Aggiungi cliente** becomes two steps (data, then 2–3 images) and ends by generating the intro. **Modifica cliente** opens the client overview (4.12); the client data form moves into it. Delivered by 2.15 and 4.12. |
| 2.14 Client info (in review) | 2 | Unchanged for now. Its dialog fields are reused in the Add flow and in the overview's **Dati cliente** panel. |
| **2.15 (new)** Client images | 2 | `client_image` table and storage prefix, 2–3 images required on Add client, replace/reorder on edit, images are live like the logo |
| 3.3 Document, revisions, format registry | **1** | The document has a `kind` (`case_history` or `client_intro`). A revision belongs to exactly one subject: a case or a client intro. The challenge/approach/result rule applies only to `case_history`. |
| 3.4 Templates | **1** | Each format's pages have a stable `pageKey` and a `role` (`intro` or `body`), so a combined file can leave out a case history's own intro pages and a collection can drop pages |
| 3.5 Renderers | **1** | Each rendered page carries its `pageKey`; renderers take a page offset so chained documents number pages continuously |
| **3.9 (new)** Client intro template and draft | 2 | A client intro template in every format; a `generate` job for the intro (text from the client's name, sector and description; layout from the 2–3 images); no images, no intro |
| 4.2 Open a draft in the configurator | **1** | Reads the editable revision by subject (`case` or `client_intro`), so 4.11 reuses the frame without a rewrite |
| **4.11 (new)** Client intro in the configurator | 2 | Edit, check and approve the intro like a case history |
| **4.12 (new)** Client overview configurator | 2 | **Modifica cliente** opens one canvas with the intro and every case history of the client in sequence; editing a case history edits that case history |
| 5.1 Library | 2 | Cards can be selected to start a collection (**Crea raccolta**) |
| 5.3 Export a format as a file | **1** | The export job takes an ordered list of parts (one part in the MVP); the stored file is keyed by a hash of exactly what was rendered (also closes the deferred export-key item of Story 2.14) |
| **5.9 (new)** Combined export and client pack download | 2 | Read-only Clients list for account/sales/social with **Scarica**: intro + approved case histories as one file per format |
| **5.10 (new)** Collections | 2 | Name, pick, reorder, intro rule, save, reopen, export |
| **5.11 (new)** Edit texts and remove pages in a collection | 2 | Text edits that live only in the collection; hidden pages; nothing else editable |
| **6.5 (new)** Permission check | 2 | The permission suite covers the new actions for every role |

### Artifact conflicts

- **PRD:** changelog line; Terms (new *Client intro*, *Client overview*, *Client pack*, *Collection*); role table (account/sales/social downloads client packs and builds collections); new FR11–FR13 marked "after the demo"; NFR6 and NFR7 wording (section 4.2); Story 2.5; new PRD stories 2.6, 3.3, 4.4, 4.5, 5.3–5.5; out of scope (no shareable link for a collection or a client pack); new open point 15 (who may edit collection text). MVP success criteria unchanged.
- **Epics:** FR coverage map, AR3, AR4, AR8, AR9, AR11, new AR25 (AD-23) and AR26 (AD-24), UX-DR12, UX-DR35, new UX-DR37–UX-DR40, Stories 2.13, 3.3, 3.4, 3.5, 4.2, 5.1, 5.3, new Stories 2.15, 3.9, 4.11, 4.12, 5.9, 5.10, 5.11, 6.5, Epic 3 prerequisites, Interim Rules Register (new IR-COLL-EDIT).
- **Architecture:** AD-1 (new `collection` module; `client_image`, `client_intro` in `case-study`), AD-3 (the same lifecycle for a client intro), AD-4 (document `kind`, page keys and roles), AD-6 (no images, no intro), AD-8 (client images prefix, combined export prefix), AD-9 (combined exports, export key), AD-11 (matrix rows), AD-17 (one compare-and-set per document in a multi-document session), new AD-23 (client intro), new AD-24 (collections), ER diagram, capability map.
- **UX (EXPERIENCE.md):** roles table, IA table (Client overview, Collections, Clients for account/sales/social), Clients pattern, Configurator (three modes), Library (multi-select), new Collections pattern, Export, a new key flow, conflicts log C14–C18.
- **UX (DESIGN.md):** no token change. Two component notes: a selected state for library cards, and a sortable list row with a drag handle and a keyboard alternative.
- **Design team (non-dev):** Phase 1: mark each format's intro pages and give every page a name (this week, with the templates). ~~Phase 2: a client intro template in every format, designed for 2–3 images.~~ *(superseded by the amendment: the client intro template is needed by 2026-10-20)*
- **Tracking:** `sprint-status.yaml`, `epic-2-context.md`, `epic-3-context.md`, spec banners on `spec-2-13-clients-page.md` and `spec-2-14-client-info-description-sector-logo.md`, `deferred-work.md` (the export-key item is closed by the 5.3 amendment).

### Technical impact

**Database (forward-only migrations, AR12; no applied migration edited).**
- **Phase 1 (Story 3.3, not built yet):** `revision` gets `case_id` (nullable) and `client_intro_id` (nullable) with a check that exactly one is set. Every revision read takes a subject. The `CaseStudyDocument` schema gets `kind`.
- **Phase 2:**
  - `client_image` (uuid `id`, `client_id`, `position` 1–3, `path`, `mime_type`, `size_bytes`, `width`, `height`, `created_by`, `created_at`), unique on (`client_id`, `position`). Replacing or removing an image deletes the old row and object, like logos.
  - `client_intro` (uuid `id`, `client_id` unique, `status` with the case lifecycle states, `head_revision_id`, `approved_revision_id`, `head_version`, timestamps). One intro per client.
  - `client_event`, append-only, for intro transitions, saves, checks and approvals. `case_event` requires a case, so it can't hold these.
  - `collection` (uuid `id`, `name`, `version`, `created_by`, timestamps, `deleted_at`).
  - `collection_item` (`collection_id`, `position`, `case_id`): which case histories, in which order. The intro rule needs no row: it is computed.
  - `collection_text_edit` (`collection_id`, `part` = case id or client intro id, `block_id`, `text`, `base_text_hash`, `edited_by`, `edited_at`).
  - `collection_hidden_page` (`collection_id`, `part`, `format`, `page_key`).
  - `export` keyed by a content hash of everything rendered (parts and their revision ids, the client info of each part, text edits, hidden pages, format). This replaces `(revision_id, format, client_info_hash)` and covers single, client pack and collection exports alike.
  - RLS on every new table, denying `anon` and `authenticated`, as for every table.
- **Storage (AD-8).** `clients/{clientId}/images/{imageId}.{ext}` (owned by `case-study`). Combined and single exports at `exports/{contentHash}/{format}.{ext}` (owned by `rendering`).
- **Modules (AD-1).**
  - `case-study` owns the client intro (lifecycle, revisions, events) and client images.
  - A new `collection` module owns collections, their items, text edits and hidden pages. It reads live approved revisions only through `case-study.index` and never writes a revision.
  - `rendering` gains a pure `composeParts(parts, format)`. It chains renderers, leaves out each part's `intro` pages when a client intro replaces them, applies the collection's hidden pages and text edits on a copy of the document, and numbers pages continuously. The configurator, the client overview, collections and exports all use it.
- **Jobs.** `generate` handles both subjects (`case` or `client_intro`), with the same idempotent enqueue (AD-10). `export` takes `{ parts, format }`.
- **Generation.** A second versioned prompt (`client-intro`) with its own zod output schema: a headline and short intro blocks with claims. Inputs are only the client's name, sector and description, plus the 2–3 images if OP 2 allows images as input. No asset or layout fields (NFR1).
- **Policy (AD-11).** New rows in section 4.3. `list clients` opens to account/sales/social, read-only and limited to clients with at least one approved case history.
- **UI.** A two-step Add client flow, a three-mode configurator (case history, client intro, client overview), a collection configurator (reorder, intro rule, edit text, hide page), library multi-select, and a Collections list.
- **Tests and CI.** DB tests for the new constraints. Unit tests for `composeParts`: the intro rule, hidden pages, edits applied only to the copy, continuous page numbers. Guardrail tests: nothing unapproved in any combined export; collection edits never touch a revision. Authorize guard and policy tests. `db.types.ts` comes from CI (commit the CI artifact if the drift check fails; no local Docker).
- **Unchanged:** client and case codes (AD-21: codes stay out of exports), the live client info rule (AD-22), the approval model for case histories (AD-19), shareable links (AD-13, one case and one format).

## 3. Recommended approach

~~**Hybrid: direct adjustment, in two phases. The demo scope stays as it is.**~~ *(superseded by the amendment: direct adjustment, everything before the demo, nothing cut)*

| Path | Verdict |
|---|---|
| A. Direct adjustment, all before the demo | ~~**Not viable.**~~ *(superseded by the amendment: selected by the owner; the schedule risk is in the amendment)* About 15 dev days of new work on top of Sprint 2, which already carries Epics 3–5 by 2026-10-21 and waits on the final templates. It would put all four demo criteria at risk. |
| B. Rollback | **Not viable.** Nothing built is wrong. Stories 2.13 and 2.14 are extended, not undone. |
| C. MVP review: move features out of the MVP | **Needed for timing, not for content.** None of the four demo criteria needs the intro, the overview or collections. Moving them to Phase 2 shrinks nothing that is in the MVP today. |
| ~~**Hybrid (recommended)**~~ | ~~**Phase 1, now:** amend Stories 3.3, 3.4, 3.5, 4.2 and 5.3 (not built yet) so the document, templates, renderers and exports can hold intros and combined files later. Ask the design team to name pages and mark intro pages this week. **Phase 2, after the demo:** Stories 2.15, 3.9, 4.11, 4.12, 5.9, 5.10, 5.11, 6.5, in that order.~~ *(superseded by the amendment: not selected)* |

**Why do Phase 1 now.** The document schema, revision table, template page model and export key are decided in Stories 3.3–3.5 and 5.3 over the next days. Changing them after the demo would mean migrating stored revisions, re-cutting published template versions (AD-15 never edits a published version) and re-keying exports. Doing it now costs about one dev day plus a small design ask.

~~**Why Phase 2 waits.**~~ *(superseded by the amendment: the dependencies below now set the in-sprint order instead of a later phase)*
- Every Phase 2 feature needs Epics 3–5 to exist first. The intro needs the generator, templates and renderers (3.3–3.6) and the configurator (4.2–4.8). The overview needs the single-case configurator and approved-case editing (4.2–4.9). Collections and client packs need the export pipeline (5.3–5.4).
- Sprint 2 is already the tightest sprint (PRD Known risks).

~~**Can anything move earlier?**~~ *(superseded by the amendment: everything moves earlier)* Story 2.15 (client images) is data and upload only, about one day. If Sprint 3 ends with slack, it can land before the demo so the demo client already has its images. Recommended only if Epic 6 is done.

**How the pieces fit.**
- **Client intro (C14).** It is a document of its own, with the same lifecycle as a case history: Bozza, In elaborazione, Da approvare, Approvato (Open question 2). The AI writes only text, and only from the client's info. The layout comes from the intro template and the 2–3 images. Client name, sector, description, logo and images are read live (AD-22), so a client edit shows at once. The AI's text stays as written.
- **Client overview (C16).** One canvas that chains the intro and every generated case history of the client. Each part keeps its own revision, version and status. An edit goes to that part's editable revision through the normal save path (AD-17). For an approved case history, the edit forks a working copy and goes live only through **Update approved version** (AD-3, IR-A1), exactly as in Story 4.9. "Embedded" means the overview is a window onto the real case histories, not a copy.
- **Client pack (C17).** A ready-made combined file: the client's approved intro, then its approved case histories, newest first. With two or more case histories, the client intro replaces their own intro pages. With one, the case history's own intro is used. If the intro isn't approved yet, every case history keeps its own intro and the download says so.
- **Collection (C18).** A saved, named list of approved case histories. It references the live approved versions and adds its own overlay: text edits by block and hidden pages by page key. Nothing in the collection writes a case history.
  - *Duplicate behaviour.* Unedited text follows the live approved version. Edited text keeps the collection's wording. If the original block changes after it was edited in the collection, the collection shows "Il testo originale è cambiato" on that block (Open question 6).
  - *Guardrail.* Text edited in a collection hasn't been approved by an owner/designer, so exporting it as written would break NFR7 for account/sales/social. The interim rule IR-COLL-EDIT allows text edits in a collection to owner/designers only. Account/sales/social can reorder, hide pages and export. Open question 4 sets the final rule.

**Alternative considered: one new "Epic 9: Client intros and collections".** It would let Epics 2–5 close at the demo. It isn't recommended, because the stories extend the generator, configurator and export of Epics 3–5 and read best next to them. It is a bookkeeping choice: if you prefer epics to close at the demo, the Phase 2 stories move to an Epic 9 with no other change.

**Effort and timeline** (dev days, at the pace of Stories 2.12–2.14).

| Work | Phase | Effort |
|---|---|---|
| Amendments to 3.3, 3.4, 3.5, 4.2, 5.3 | 1 | ~1 day, spread over those stories |
| Design ask: page names and intro pages in every format | 1 | Design team, with this week's templates |
| 2.15 Client images | 2 | 1 day |
| 3.9 Client intro template and draft | 2 | 2 days, plus the design team's intro template |
| 4.11 Client intro in the configurator | 2 | 1–1.5 days |
| 4.12 Client overview configurator | 2 | 3 days |
| 5.9 Combined export and client pack download | 2 | 2 days |
| 5.10 Collections | 2 | 2.5 days |
| 5.11 Edit texts and remove pages in a collection | 2 | 2 days |
| 6.5 Permission check | 2 | 0.5 day |
| **Total Phase 2** | | **~14–15 dev days, about 3 weeks** |

- **Schedule.** Phase 1 adds about one day to Sprint 2 (due 2026-10-21), spread over Stories 3.3–3.5 and 5.3. The demo date (2026-10-30) doesn't move. ~~Phase 2 starts 2026-11-02, after the go/no-go. The client intro and overview could land by about 2026-11-11, and client packs and collections by about 2026-11-20.~~ *(superseded by the amendment: all of it lands before 2026-10-30; see the in-sprint order)*
- ~~**After a no-go**, the gap fixes come first and Phase 2 shifts by the same time.~~ *(superseded by the amendment: everything is built before the demo)*
- ~~Phase 2 overlaps the start of the 8-week validation. Each Phase 2 story ships on its own, so validation runs on a working tool throughout.~~ *(superseded by the amendment: everything is built before the demo)*

**Risk.**
- *Guardrail (high if ignored).* Collection text edits by account/sales/social would send unreviewed text to clients (NFR7). It is handled by IR-COLL-EDIT and Open question 4. It must not be built as "anyone edits, anyone exports" without the owner explicitly amending NFR7.
- *Thin intro text (medium).* The AI has only the client's name, sector and a 400-character description to write from. A longer intro tempts it to invent. Mitigation: the intro template has little text (a headline and one short paragraph), the per-block check applies, and Open question 7 offers an optional longer intro note.
- *Design dependency (medium).* Page names and intro pages are needed this week. ~~The intro template is needed by 2026-11-02.~~ *(superseded by the amendment: by 2026-10-20)* Mitigation: send the request with this week's stakeholder update.
- *Overview complexity (medium).* Several documents, each with its own version, in one session. Mitigation: each part saves on its own through the existing compare-and-set (AD-17). A stale part reloads alone.
- *Long combined exports (low).* Many case histories in one PDF take longer to render. Exports already run as worker jobs with no time limit and a progress state (AD-10).

## 4. Detailed change proposals

Each change below is OLD → NEW, with the phase in brackets. Rationale is C14–C18 unless stated.

### 4.1 Stories and epics (`epics.md`)

**FR coverage map** [2]
- NEW rows: "FR11 | Epic 2, 3, 4 | Client images, client intro draft, editing and approval"; "FR12 | Epic 4 | Client overview configurator"; "FR13 | Epic 5, 6 | Client pack download, collections, combined export, permissions".

**AR3 (AD-3)** [1]
- OLD: "…`case_study.status` changes only through `case-study.transition`. Revisions have `working | approved | superseded`…"
- NEW: OLD + " A client intro (AD-23) has the same states and pointers on `client_intro` and changes only through `case-study.transitionIntro`. A revision belongs to exactly one subject, a case or a client intro."

**AR4 (AD-4)** [1]
- Add: "The document has `kind` ∈ `case_history | client_intro`. The challenge/approach/result rule applies only to `case_history`. Every page a template defines has a stable `pageKey` and a `role` ∈ `intro | body`."

**AR8 (AD-8)** [2]
- Add the keys `clients/{clientId}/images/{imageId}.{ext}` (owned by `case-study`; replacing or removing an image deletes the old object, as for logos) and `exports/{contentHash}/{format}.{ext}` (owned by `rendering`).

**AR9 (AD-9)** [1]
- OLD: "…`export` unique and immutable on `(revision_id, format, client_info_hash)`; `ensureExport` is idempotent and reuses an export only if it was made with the client's current info (AD-22)."
- NEW: "…An export renders an ordered list of parts (one part for a single case history). `export` is unique and immutable on `content_hash`, a hash of the parts, their revision ids, each part's client info, any collection edits and hidden pages, and the format. `ensureExport` reuses an export only when the hash matches."

**AR11 (AD-11)** [2]
- Add: "New actions `download client pack`, `manage collections`, `edit collection text`, plus intro generation, editing and approval under the existing `generate`, `edit` and `approve` with resource `client_intro`. `list clients` is open to account/sales/social for clients with an approved case history, read-only. See the AD-11 matrix."

**AR25 (new, AD-23)** [2]
- NEW: "A client has one client intro: a document of kind `client_intro` with the case lifecycle, generated from the client's name, sector and description and laid out with the 2–3 client images. It is checked and approved like a case history. Client info and images are read live at render time."

**AR26 (new, AD-24)** [2]
- NEW: "A collection is a named, ordered list of approved case histories owned by the `collection` module. It references live approved revisions and stores only its own text edits (per block) and hidden pages (per format and page key). It never writes a revision. Combined files come from `rendering.composeParts`."

**UX-DR12 (configurator frame)** [2]
- Add: "Three modes share the frame: *case history* (as today), *client intro* (same panes, intro blocks), *client overview* (left pane lists the intro and the client's case histories; the format switch moves to the top bar). The collection configurator (UX-DR39) reuses the frame with fewer controls."

**UX-DR35 (Clients)** [2]
- OLD: "…**Add client** dialog (name, sector, description, logo); **Edit client** dialog with the same fields…"
- NEW: "…**Add client** in two steps: the data (name, sector, description, logo), then 2–3 images (required). **Crea cliente** creates the client and starts the intro draft. **Modifica cliente** opens the client overview (UX-DR38), where **Dati cliente** holds the same fields and the images. Account/sales/social get a read-only Clients list of clients with an approved case history, with **Scarica** per row and no add or edit…"

**UX-DR37 (new): Client images** [2]
- NEW: "2–3 images per client in Add client (step 2) and in **Dati cliente**: drop zone, thumbnails in order, **Sostituisci**, **Rimuovi** (not below 2), drag or menu to reorder. PNG, JPEG or WebP, ≤20 MB, ≥1600 px on the short side (Open question 3). Copy: 'Carica 2 o 3 immagini. Servono per le pagine di introduzione del cliente.'"

**UX-DR38 (new): Client overview** [2]
- NEW: "Left pane: **Introduzione** (with its status badge), then every case history of the client that has a document, newest first, each with code, name and status badge. A Bozza case history is listed greyed with 'Non ancora generata'. Centre: one continuous preview of the selected format, every part in that order, with a divider per part. Clicking a part in the list scrolls to it. Editing a block edits that part (status and save state shown for that part). Right pane: Edit and Check for the selected part. The top bar has the format switch, **Dati cliente** and, for the selected part, its **Approve** or **Update approved version**."

**UX-DR39 (new): Collections** [2]
- NEW: "Library cards get a checkbox. With one or more selected, a bar shows '{n} selezionate' and **Crea raccolta**, which asks for a name and opens the collection configurator. Left pane: the parts in order (client intros computed, shown locked). Reorder by drag handle or by the menu 'Sposta su / giù'. Centre: continuous preview per format. Right pane: **Testo** (edit the selected block, only for roles allowed by IR-COLL-EDIT), **Pagine** (hide or show the selected page). Edited blocks show 'Modificato in questa raccolta'. Hidden pages show as a collapsed strip with **Mostra**. Top bar: name (editable), save state, **Esporta** and **Esporta tutto**. No layout, media or typography controls. A sidebar item **Raccolte** lists collections (name, parts, updated, created by) with open, rename and delete (with confirm)."

**UX-DR40 (new): Combined download copy** [2]
- NEW: "The client pack and collection exports show progress and then the browser download, like UX-DR21. When a client's intro isn't approved: 'L'introduzione di {client} non è ancora approvata: le sue case history usano la propria introduzione.'"

**Interim Rules Register: new row** [2]
- NEW: "IR-COLL-EDIT | OP 15 who may edit collection text | PRD owner | Only owner/designers can edit text in a collection. Account/sales/social can reorder, hide pages and export. Collection exports contain only text from approved revisions or written by an owner/designer. | NFR7, AD-24"

**Epic 3 prerequisites** [1 and 2]
- OLD: "…final case study templates…, each with an About the client area in every format…"
- NEW: OLD + " **Every page of every format has a name (`pageKey`), and the pages that introduce the case history (for example the cover and About the client) are marked as intro pages** (Phase 1, SCP 2026-10-16 client intro). **A client intro template in every format, for 2–3 images, a headline and one short paragraph** (Phase 2, needed by 2026-11-02)."

**Story 2.13** (done). Phase 2 AC amendments, delivered by Stories 2.15 and 4.12. A banner goes on `spec-2-13-clients-page.md`.
- OLD AC: "**Given** **Aggiungi cliente** **When** I enter a name … and confirm **Then** the client is created…"
- NEW AC: "**Given** **Aggiungi cliente** **When** I enter the data, add 2–3 images and press **Crea cliente** **Then** the client is created and its intro draft starts (Story 3.9)…", with the name and code rules unchanged.
- OLD AC: "**Given** **Modifica cliente** on a client **When** I save a new name…"
- NEW AC: "**Given** **Modifica cliente** on a client **When** I press it **Then** the client overview opens (Story 4.12) and the data is edited in **Dati cliente**", with the same name rules.

**Story 3.3** (backlog). Phase 1 AC amendments.
- Document schema AC, add: "**And** the document has `kind` ∈ `case_history | client_intro`; the challenge/approach/result rule is enforced only for `case_history`, and a `client_intro` has its own block set from its template"
- Revision AC, OLD: "a `revision` table exists (uuid id, `case_id`, …)"
- Revision AC, NEW: "a `revision` table exists (uuid id, `case_id` nullable, `client_intro_id` nullable, with a check that exactly one is set, …). The `client_intro` table and its FK arrive with Story 3.9; until then `client_intro_id` is always null."
- Reads AC, add: "**And** `getLiveRevision` and `getEditableRevision` take a subject (`{ kind: 'case', id }` or `{ kind: 'client_intro', id }`); the MVP calls them only with cases"

**Story 3.4** (backlog). Phase 1 AC addition.
- Add: "**Given** a template format **When** it is coded **Then** every page it can produce has a stable `pageKey` and a `role` (`intro` or `body`) from the design team's spec, and the keys never change within a published version"
- Add to ⛔ Blocked on: "page names and intro pages in the final templates"

**Story 3.5** (backlog). Phase 1 AC addition.
- Add: "**Given** a renderer **When** it paginates **Then** each page carries its `pageKey` and `role`, and the renderer accepts a starting page number, so chained documents number their pages continuously"

**Story 4.2** (backlog). Phase 1 AC addition.
- Add: "**Given** the configurator **When** it loads a document **Then** it reads it through `getEditableRevision(subject)`, and the frame (top bar, panes, canvas, page strip) has no case-only assumption beyond the case's own data in the top bar"

**Story 5.1** (backlog). Phase 2 AC addition, delivered by Story 5.10.
- Add: "**Given** the library **When** I select one or more cards **Then** a bar shows '{n} selezionate' with **Crea raccolta** and **Annulla selezione**; selection is keyboard-operable (Space on a focused card)"

**Story 5.3** (backlog). Phase 1 AC amendments.
- OLD: "an `export` table exists, unique and immutable on `(revision_id, format, client_info_hash)` … with storage keys `cases/{caseId}/revisions/{revisionId}/exports/{format}.{ext}`"
- NEW: "an `export` table exists, unique and immutable on `content_hash` (a hash of the ordered parts, their revision ids, each part's client info, any collection edits and hidden pages, and the format), with storage keys `exports/{contentHash}/{format}.{ext}` built only by `rendering` adapters"
- Add: "**And** the export job's payload is `{ parts: [{ subject, revisionId }], format }`; the MVP always sends one part"

**Story 2.15 (new, Phase 2): Client images**

As an owner/designer,
I want to add 2–3 images to each client,
So that the client's intro pages have pictures from the start.

Covers: FR11, AR25, AR8 (images key), AR11 (`manage clients`), UX-DR35 (amended), UX-DR37
Order: Phase 2, first. Before Story 3.9.

Acceptance criteria:

**Given** the forward migration for this story
**When** it runs
**Then**:
- a `client_image` table exists (uuid `id`, `client_id`, `position` 1–3, `path`, `mime_type`, `size_bytes`, `width`, `height`, `created_by`, `created_at`), unique on (`client_id`, `position`), with RLS denying `anon` and `authenticated`
- existing clients have no images, and no applied migration is edited

**Given** **Aggiungi cliente**
**When** I have filled in the data and press **Avanti**
**Then** step 2 asks for 2 or 3 images, and **Crea cliente** stays disabled until 2 have uploaded, with the reason linked via `aria-describedby`
**And** a 4th image is refused with an inline message

**Given** an image file
**When** I pick it
**Then**:
- PNG, JPEG or WebP up to 20 MB and at least 1600 px on the short side uploads through a signed upload URL to `clients/{clientId}/images/{imageId}.{ext}`
- the server re-checks type and size at confirm (AD-8)
- any other file is rejected inline, and nothing is written

**Given** a client with images
**When** I replace one, reorder them or remove one, and at least 2 remain
**Then** the change is saved, and a replaced or removed image's row and object are deleted (no image history, like logos)
**And** removing an image when only 2 remain is refused ("Servono almeno 2 immagini.")

**Given** an existing client with fewer than 2 images
**When** I open its overview (Story 4.12) or try to generate its intro
**Then** I'm asked to add images first, and the intro can't be generated

**Given** account/sales/social or admin
**When** they call any image action
**Then** it fails with `FORBIDDEN` and writes nothing

**Given** CI
**When** the `check`, `db` and `image` jobs run
**Then** they pass, and `db.types.ts` matches the generated types

**Story 3.9 (new, Phase 2): Client intro template and draft**

As an owner/designer,
I want the AI to draft the client's intro pages from the client's data and images,
So that I only refine them instead of laying them out by hand.

Covers: FR11, AR25 (AD-23), AR3, AR4, AR6 (gate), AR7, AR10, NFR1, NFR2, NFR6 (as amended)
⛔ Blocked on: the client intro template from the design team; OP 2 for whether images go to the LLM
Order: after 2.15 and Epic 4's single-case configurator (4.2–4.8)

Acceptance criteria:

**Given** the forward migration for this story
**When** it runs
**Then** `client_intro` (one per client) and `client_event` (append-only) exist with RLS on, and `revision.client_intro_id` gets its FK

**Given** a new client created with 2–3 images, or **Genera introduzione** on a client without an intro
**When** it is triggered
**Then** the server checks the client has at least 2 images (else `NO_CLIENT_IMAGES`, before any job or LLM call), creates or reuses the `client_intro`, enqueues one `generate` job for it and moves it to `generating`
**And** the screen says "Stiamo preparando l'introduzione di {client}. Puoi lasciare questa pagina." and the intro opens in the configurator when it's ready (toast as Story 3.8)

**Given** the worker runs the intro job
**When** it calls the LLM
**Then** the input is only the client's current name, sector and description, plus the images if OP 2 allows images as input; the output schema has only intro text blocks (headline and short paragraph) with claims and `client_field` refs, and no layout, asset or `about` field
**And** `rendering.relayout` places the 2–3 images in the intro template's slots for every format
**And** a new `working` revision of kind `client_intro` is created and the intro moves to `in_review`

**Given** the job fails after its attempts
**When** it is marked failed
**Then** the intro returns to `draft` with the client's data and images untouched, and **Riprova** runs it again

**Given** the client is edited after the intro was generated or approved
**When** the intro is rendered anywhere
**Then** the name, sector, description, logo and images are the client's current ones (AD-22), and the AI text stays as written

**Story 4.11 (new, Phase 2): Client intro in the configurator**

As an owner/designer,
I want to edit, check and approve the client intro like a case history,
So that the intro that reaches clients has been reviewed by a person.

Covers: FR11, AR25, AR19, NFR2, NFR7, UX-DR12 (client intro mode)
Order: after 3.9

Acceptance criteria:

**Given** an intro in Da approvare or Approvato
**When** I open it (from the client page, the overview or the toast)
**Then** the configurator opens in client intro mode with the Formats pane, the canvas and the Edit and Check tabs, and text, layout (designed variants only), image order and typography work as in Stories 4.3–4.6

**Given** the Check tab
**When** it opens
**Then** it lists the intro's text blocks; the material drawer shows the client's data and images
**And** **Approve** follows Story 4.8 (every block checked, no overflow), and editing an approved intro follows Story 4.9 (working copy, **Update approved version**, **Discard changes**)

**Given** an intro that isn't approved
**When** anything builds a client pack or collection
**Then** it is never included (NFR7)

**Story 4.12 (new, Phase 2): Client overview configurator**

As an owner/designer,
I want **Modifica cliente** to open the client's intro and all its case histories as one file,
So that I see the client's whole story and fix any part of it in place.

Covers: FR12, UX-DR38, AR3, AR17, AR19, IR-A1
Order: after 4.11 (needs 4.2–4.9 and 4.11)

Acceptance criteria:

**Given** a client page
**When** I press **Modifica cliente**
**Then** the client overview opens full-screen: the left pane lists **Introduzione** and every case history of the client, newest first, each with code, name and status badge; the centre shows the selected format with every part in that order as one continuous, paginated preview

**Given** a case history in Bozza or In elaborazione
**When** the overview loads
**Then** it is listed greyed ("Non ancora generata" / "In elaborazione") and has no pages in the preview

**Given** I edit a block of a case history in the overview
**When** the edit is saved
**Then** it is saved to that case history's editable revision with that revision's expected version (AD-17), exactly as in its own configurator, and the change shows when the case history is opened on its own
**And** for an Approvato case history the first edit forks a working copy, the part shows "Modifiche non ancora pubblicate", and the change goes live only through that part's **Update approved version** after its edited blocks are checked again (Story 4.9)

**Given** a part's save returns `STALE_REVISION` or `STALE_HEAD`
**When** the client receives it
**Then** only that part reloads; the other parts keep their state

**Given** **Dati cliente** in the top bar
**When** I open it
**Then** a panel shows name, sector, description, logo and images with the Story 2.14 and 2.15 rules, and saving them updates the About blocks and the intro in the preview at once

**Given** the overview
**When** I look for reordering case histories, or approving several parts at once
**Then** neither exists; each part is checked and approved on its own (no bulk approve, UX-DR28)

**Given** a viewport narrower than 1024 px
**When** I open the overview
**Then** it shows "The configurator needs a larger screen."

**Story 5.9 (new, Phase 2): Combined export and client pack download**

As an account/sales/social user or owner/designer,
I want to download a client's intro and its approved case histories as one file,
So that I can send a client's whole track record in one go.

Covers: FR13, AR9 (combined export), AR11 (`list clients` read-only, `download client pack`), NFR7, UX-DR35 (amended), UX-DR40
Order: after 4.11 and Epic 5's single exports (5.3, 5.4)

Acceptance criteria:

**Given** `rendering.composeParts(parts, format)`
**When** it runs
**Then**:
- it renders each part with its format renderer, in order, with continuous page numbers
- it leaves out the `intro` pages of each case history that follows its client's intro
- it has unit tests for one part, two parts of one client, and mixed clients

**Given** an account/sales/social user
**When** the sidebar renders
**Then** it shows **Clienti**, listing only clients with at least one approved case history, read-only (no add, no edit, no overview), with **Scarica** per row and on the client page

**Given** **Scarica** on a client
**When** I pick a format (Deck 16:9 or PDF A4; Open question 5) and confirm
**Then** the server builds the parts: the client's approved intro (if any), then its approved case histories newest first, using the intro rule (2+ case histories → the client intro replaces their own intro pages; 1 → its own intro), and enqueues one `export` job
**And** if the intro isn't approved, every case history keeps its own intro and the dialog says so (UX-DR40)
**And** a client with no approved case history has no **Scarica**, and a direct call fails with `NOT_APPROVED`

**Given** the same client, revisions, client info and format
**When** **Scarica** is pressed again
**Then** the stored export with the same `content_hash` is returned

**Given** an automated guardrail test
**When** the suite runs
**Then** it proves no combined export contains a working, superseded or unapproved revision, by any role

**Story 5.10 (new, Phase 2): Collections**

As an account/sales/social user or owner/designer,
I want to pick approved case histories, put them in the order I want, save them under a name and export them,
So that I can prepare a custom case for one pitch and reuse it later.

Covers: FR13, AR26 (AD-24), AR11 (`manage collections`), NFR7, UX-DR39, UX-DR40
Order: after 5.9

Acceptance criteria:

**Given** the forward migration for this story
**When** it runs
**Then** `collection` and `collection_item` exist, owned by the `collection` module, with RLS denying `anon` and `authenticated`

**Given** the library with cards selected
**When** I press **Crea raccolta** and enter a name (1–120 characters)
**Then** a collection is saved with those case histories in selection order, and the collection configurator opens

**Given** the collection configurator
**When** it loads
**Then** the left pane lists the parts in order: for each client with 2 or more case histories in the collection, its approved intro comes before the first of them, shown locked, and that client's case histories are kept together (Open question 8); the centre shows the continuous preview per format through `composeParts`

**Given** I move a case history (drag handle, or the menu "Sposta su / giù")
**When** the move is saved
**Then** the order and the computed intros update, with compare-and-set on `collection.version`

**Given** I add or remove case histories (from the left pane's **Aggiungi** picker, approved only)
**When** a client crosses from 1 to 2 case histories, or back
**Then** its intro appears or disappears, and that client's case histories switch between their own intro pages and the client intro

**Given** **Raccolte** in the sidebar
**When** I open it
**Then** I see every collection (name, number of case histories, updated, created by) and can open, rename or delete one (with confirm; delete is soft)

**Given** **Esporta** or **Esporta tutto** in a collection
**When** I press it
**Then** it exports through the Story 5.9 pipeline, one file per format (Open question 5)

**Given** a case history in a collection
**When** its approved version is updated, or the client is edited
**Then** the collection shows the new approved version and the client's current info the next time it is opened or exported
**And** if a case history has no approved revision any more, it is listed as "Non disponibile" and left out of exports

**Given** admin
**When** they call any collection action
**Then** it fails with `FORBIDDEN`

**Story 5.11 (new, Phase 2): Edit texts and remove pages in a collection**

As the person preparing a collection,
I want to change wording and drop pages only in this collection,
So that the custom case fits the pitch without changing the original case histories.

Covers: FR13, AR26, NFR7 (via IR-COLL-EDIT), UX-DR39
⚑ Interim: IR-COLL-EDIT (until Open question 4 is answered)
Order: after 5.10

Acceptance criteria:

**Given** the forward migration for this story
**When** it runs
**Then** `collection_text_edit` and `collection_hidden_page` exist, owned by the `collection` module, with RLS on

**Given** an owner/designer in a collection
**When** they edit a text block in place
**Then** a `collection_text_edit` row stores the new text with the hash of the original text, the block shows "Modificato in questa raccolta", and the original case history's revisions are unchanged (a test proves no revision is written)
**And** **Ripristina testo originale** removes the edit

**Given** an account/sales/social user in a collection
**When** they select a text block
**Then** it isn't editable, and a hint says "Solo i designer possono modificare i testi. Puoi nascondere le pagine o riordinare." (IR-COLL-EDIT)

**Given** any user who can manage collections
**When** they choose **Nascondi pagina** on a page
**Then** a `collection_hidden_page` row (part, format, `pageKey`) is stored, the page leaves the preview and the exports for that format, and **Mostra** brings it back
**And** a client intro page can be hidden like any other

**Given** the original block's text changed after it was edited in the collection
**When** the collection opens
**Then** the block keeps the collection's text and shows "Il testo originale è cambiato" with **Vedi originale** and **Usa originale**

**Given** the collection configurator
**When** I look for layout, media, typography, About block or section controls
**Then** none exists; the About the client block and section structure can't be edited or hidden as text

**Given** an export
**When** the collection has text edits or hidden pages
**Then** the export applies them to a copy of the documents, and its `content_hash` includes them

**Story 6.5 (new, Phase 2): Permission check for intros, client packs and collections**

As the team,
I want the permission suite to cover the new actions,
So that no role gets more than the matrix allows.

Covers: NFR3, NFR7, AR5, AR11
Order: last in Phase 2

Acceptance criteria:

**Given** signed-in test users of each role
**When** the permission suite runs
**Then** every new matrix cell (section 4.3) is checked end to end: allowed actions succeed, denied ones return 403
**And** it proves account/sales/social can't edit collection text while IR-COLL-EDIT applies, can't edit clients or intros, and see only clients with an approved case history

### 4.2 PRD (`prds/prd-MAC Recap-2026-10-08/prd.md`)

- **Changelog line (top):** add "Updated Oct 16, 2026 (second): after the demo, a client gets AI-drafted intro pages from its data and 2–3 images; editing a client opens an overview of its intro and case histories; users can download a client's intro and approved case histories in one file, or build named collections of approved case histories ([Sprint Change Proposal 2026-10-16, client intro and collections](../../sprint-change-proposal-2026-10-16-client-intro-and-collections.md))." Header `updated: 2026-10-16`.
- **Roles table:**
  - Owner/designer, add: "…creates and approves client intros, edits clients and their case histories from the client overview, builds collections".
  - Account/sales/social, add: "…downloads a client's pack from the Clients list, builds collections (reorder, hide pages; text edits per open point 15)".
- **Terms (new):**
  - **Client intro.** "Pages that introduce a client, drafted by the AI from the client's data and 2–3 images and approved like a case study. They show the client's current info."
  - **Client overview.** "The configurator view of a client's intro and all its case studies as one file."
  - **Client pack.** "One file with a client's approved intro and approved case studies."
  - **Collection.** "A named, saved set of approved case studies in a chosen order, with its own text edits and hidden pages."
- **New FRs (after the demo, Phase 2):**
  - **FR11.** "Creating a client asks for 2–3 images. The system drafts the client's intro pages from the client's name, sector, description and images, and the owner/designer edits, checks and approves them in the configurator."
  - **FR12.** "Editing a client opens the client overview: the intro and every case study of the client in one preview. Editing a case study there edits that case study."
  - **FR13.** "Owner/designer and account/sales/social users download a client pack, or build, save and export collections of approved case studies. A client with 2 or more case studies in a file gets its intro in front of them; otherwise each case study keeps its own intro. Text edits and hidden pages in a collection apply only to that collection."
- **NFR6:** add "For a client intro, the same rule: no images, no intro."
- **NFR7:** add "This includes client intros, client packs and collections. A collection contains only approved content and text written by an owner/designer (open point 15)."
- **Epic details:**
  - Story 2.5 (Clients), add "Creating a client asks for 2–3 images (after the demo)" and "Editing a client opens the client overview (after the demo)".
  - New PRD stories, each marked "after the demo": 2.6 Client images; 3.3 Client intro draft; 4.4 Client intro review; 4.5 Client overview; 5.3 Client pack download; 5.4 Collections; 5.5 Collection text edits and hidden pages.
- **§ 6 Release plan:** new row "After the demo (from Nov 2) | Client intros, client overview, client packs and collections (Phase 2 of SCP 2026-10-16) | Client intro template".
- **§ 10 Out of scope:** add "A shareable link to a collection or a client pack (downloads only)."
- **§ 12 Open points:** new **15. Who may edit text in a collection** (Epic 5, Phase 2). Interim: owner/designers only (IR-COLL-EDIT).
- **No change:** the October 30 success criteria, NFR1–NFR5, the sprint plan up to the demo.

### 4.3 Architecture (`architecture/…/ARCHITECTURE-SPINE.md`)

- **AD-1 table** [2]:
  - `case-study` adds `client_image`, `client_intro`, `client_event` and the `clients/{clientId}/images/**` prefix.
  - `rendering` adds `exports/{contentHash}/**`.
  - New row: `collection` | `collection`, `collection_item`, `collection_text_edit`, `collection_hidden_page` | —.
- **AD-3** [1]: add "A client intro (AD-23) uses the same states, pointers, compare-and-set and fork rules, on `client_intro`, through `case-study.transitionIntro`. A revision belongs to exactly one subject. `getLiveRevision(subject)` and `getEditableRevision(subject)` take the subject."
- **AD-4** [1]: add "The document has `kind` (`case_history` | `client_intro`). The challenge/approach/result rule applies to `case_history` only. Pages have a stable `pageKey` and a `role` (`intro` | `body`) defined by the template version."
- **AD-6** [2]: add "A client intro is generated only when the client has at least 2 images (`NO_CLIENT_IMAGES`). Its LLM input is only the client's current name, sector and description, plus images if OP 2 allows."
- **AD-8** [2]: add the keys `clients/{clientId}/images/{imageId}.{ext}` (PNG, JPEG or WebP; ≤20 MB; ≥1600 px short side; replace or remove deletes the old object) and `exports/{contentHash}/{format}.{ext}`. The latter replaces `cases/{caseId}/revisions/{revisionId}/exports/…` (Phase 1).
- **AD-9** [1]:
  - OLD: "`export` is unique on `(revision_id, format, client_info_hash)`…"
  - NEW: "An export renders an ordered list of parts through `rendering.composeParts`. `export` is unique on `content_hash` (parts, revision ids, each part's client info, collection edits and hidden pages, format) and immutable. `ensureExport` reuses on a hash match. **Export all** is one ZIP of the per-format exports for the same parts."
- **AD-11 matrix** [2], new and changed rows:

| Action | owner_designer | account_sales_social | admin | system |
| --- | --- | --- | --- | --- |
| list clients | ✓ | clients with an approved case, read-only | — | — |
| manage clients (add, edit, images) | ✓ | — | — | — |
| generate, edit, approve a client intro | ✓ | — | — | — |
| download client pack | approved content | approved content | — | — |
| manage collections (create, rename, reorder, add/remove, hide pages, delete, export) | ✓ | ✓ | — | — |
| edit collection text | ✓ | — (IR-COLL-EDIT, OP 15) | — | — |

- **AD-17** [2]: add "A session that shows several documents (client overview, collection) does one compare-and-set per document. A stale document reloads alone."
- **AD-23 (new): A client has one intro, a document reviewed like a case history** [2]
  - **Binds:** FR11, FR12, `case-study`, `generation`, `rendering`
  - **Prevents:** unreviewed AI text reaching clients through an intro, a second editing model for intros, intros with stale client data
  - **Rule:**
    1. One `client_intro` per client, with the case lifecycle (AD-3) and revisions of kind `client_intro`.
    2. Generated only with 2+ client images. The LLM writes text blocks only; layout is `relayout` over the images (AD-5, AD-15).
    3. Client info and images are read live at render time (AD-22); AI text stays as written.
    4. Checked and approved as in AD-19. Only an approved intro appears in a client pack or a collection; otherwise case histories keep their own intro pages.
- **AD-24 (new): A collection is an overlay on live approved revisions** [2]
  - **Binds:** FR13, NFR7, `collection`, `rendering`
  - **Prevents:** collection edits changing a case history, unapproved content leaving the tool through a collection, two copies of a case history's text drifting silently
  - **Rule:**
    1. A collection stores an ordered list of case ids, its text edits (by part and `blockId`, with the original text's hash) and hidden pages (by part, format and `pageKey`). It never stores or writes a revision.
    2. It always reads `getLiveRevision`; a case with no approved revision is shown as unavailable and left out.
    3. The intro rule is computed: a client with 2+ case histories in the collection gets its approved intro before them, and their `intro` pages are left out.
    4. Text edits apply to a copy of the document at render time. Only roles allowed by `edit collection text` can make them. A changed original is flagged, never merged silently.
    5. Layout, media, typography, sections and the About block can't be changed in a collection.
- **ER diagram** [2]: add `CLIENT ||--o{ CLIENT_IMAGE : has`, `CLIENT ||--o| CLIENT_INTRO : introduced_by`, `CLIENT_INTRO ||--o{ REVISION : versions`, `COLLECTION ||--o{ COLLECTION_ITEM : lists`, `CASE_STUDY ||--o{ COLLECTION_ITEM : in`, `COLLECTION ||--o{ COLLECTION_TEXT_EDIT : edits`, `COLLECTION ||--o{ COLLECTION_HIDDEN_PAGE : hides`.
- **Capability map** [2]: FR11 → `case-study`, `generation`, `rendering` (AD-23); FR12 → `app/(tool)`, `case-study` (AD-3, AD-17); FR13 → `collection`, `rendering`, `jobs` (AD-9, AD-24).
- Header `updated: 2026-10-16`.

### 4.4 UX (`ux-designs/ux-MAC Recap-2026-10-08/EXPERIENCE.md`)

- **Roles table:** add client intros, client overview and collections to owner/designer. Add "client packs, collections (reorder, hide pages)" to account/sales/social.
- **IA table:** new rows *Client overview* (from **Modifica cliente**, owner/designer), *Collections* (sidebar **Raccolte**, owner/designer and account/sales/social), *Collection configurator* (from **Crea raccolta** or a collection row). *Clients* gains the account/sales/social read-only list.
- **Clients pattern:**
  - Add client becomes two steps (data, then 2–3 images) and ends by starting the intro.
  - Edit client opens the client overview, with **Dati cliente** in it.
  - The client page shows the intro's status and **Apri introduzione**.
  - New: the account/sales/social read-only list with **Scarica**.
- **Configurator:** a short "Modes" section (case history, client intro, client overview) per UX-DR12, UX-DR38.
- **Library:** multi-select and **Crea raccolta** (UX-DR39).
- **New Collections pattern** per UX-DR39 and UX-DR40.
- **New key flow:** "Flow 5: A custom case for a pitch (Daniele)". He selects four approved case histories (two from Lumen), names the collection, sees Lumen's intro in front of its two, hides the carousel-style gallery page, reorders, and exports the deck as one PDF.
- **Conflicts log:** C14–C18 as in section 1, each "Resolved 2026-10-16 by the owner; Phase 2 after the demo". C18 notes open point 15 (IR-COLL-EDIT).
- **DESIGN.md:** no token change. Add component notes for the card selected state and the sortable list row (drag handle, "Sposta su / giù" menu, focus ring).

### 4.5 Tracking and supporting docs

- **`sprint-status.yaml`** (`last_updated` refreshed):
  - Comments on `3-3`, `3-4`, `3-5`, `4-2`, `5-3`: "Phase 1 amendment per SCP 2026-10-16 client intro and collections"
  - New `backlog` entries, each commented "Phase 2, after the demo (SCP 2026-10-16 client intro and collections)":
    - `2-15-client-images` after `2-14`
    - `3-9-client-intro-template-and-draft` after `3-8`
    - `4-11-client-intro-in-the-configurator`, then `4-12-client-overview-configurator`, after `4-10`
    - `5-9-combined-export-and-client-pack-download`, `5-10-collections`, `5-11-edit-texts-and-remove-pages-in-a-collection` after `5-8`
    - `6-5-permission-check-for-intros-client-packs-and-collections` after `6-4`
  - A comment on `2-13` and `2-14`: "Add/Edit client flows extended in Phase 2 by 2.15 and 4.12".
- **Spec banners:** `spec-2-13-clients-page.md` and `spec-2-14-client-info-description-sector-logo.md` get "Amended 2026-10-16 (client intro and collections): after the demo, Add client asks for 2–3 images and starts the intro; Modifica cliente opens the client overview (Stories 2.15, 4.12)."
- **`epic-2-context.md`:** add client images and the Phase 2 Add/Edit flows. **`epic-3-context.md`:** add document `kind`, the revision subject, page keys and roles (Phase 1), and the client intro (Phase 2).
- **`deferred-work.md`:** mark the Story 2.14 item "Story 5.1 must settle where an export is stored…" as resolved by the 5.3 amendment (content-hash key).
- **SPEC:** `SPEC.md` gets a capability line for client intros and collections (after the demo).

## 5. Implementation handoff

**Scope: Major.** Five decisions, three new FRs and one guardrail question, eight new stories across Epics 2–6, two new architecture decisions and a new module. Phase 1 alone is Minor: AC amendments to five stories that aren't built yet. Phase 2 is a planned extension after the demo, not a replan of the MVP.

| Role | Responsibility | When |
|---|---|---|
| Product owner (Sonja) | Approve this proposal and the phasing; answer the open questions, above all 1 (approved only) and 4 (collection text edits and NFR7); send the design ask | Now |
| Design team | Page names and intro pages in every format, with the final templates; the client intro template in every format, for 2–3 images (amended: before the demo) | ~~This week; intro template by 2026-11-02~~ *(superseded by the amendment)* page names by 2026-10-19, intro template by 2026-10-20 |
| PO / Dev (docs) | Apply 4.1–4.5 in one docs PR against `main` (this branch) | On approval |
| Architect (`bmad-architecture`, update mode) | Write AD-23 and AD-24 and the AD-1/AD-3/AD-4/AD-9/AD-11 edits in full | With the docs PR |
| Developer (`bmad-build`) | ~~Phase 1 inside 3.3–3.5, 4.2, 5.3; Phase 2 from 2026-11-02 in order 2.15 → 3.9 → 4.11 → 4.12 → 5.9 → 5.10 → 5.11 → 6.5~~ *(superseded by the amendment)* All stories in the amendment's in-sprint order, including the section 4 amendments inside 3.3–3.5, 4.2 and 5.3. One PR per story, with Auto-fix. | Sprints 2–3, before 2026-10-29 |
| UX (`bmad-ux`, update mode) | Turn UX-DR37–UX-DR40 into EXPERIENCE sections; add a low-fidelity wireframe of the overview and the collection configurator before 4.12 and 5.10 | ~~Before 2026-11-02~~ *(superseded by the amendment)* Before 4.12 starts (about 2026-10-22) |

**Success criteria**
- *Phase 1:* the document and revision schemas accept a `client_intro` subject. Every template page has a `pageKey` and a `role`. Exports are keyed by content hash. The demo flow is unchanged and the demo date holds.
- *Phase 2:*
  - A new client with 2–3 images gets an intro draft that the owner refines and approves in the configurator.
  - **Modifica cliente** shows the intro and every case history as one preview, and an edit there shows in the case history itself.
  - A sales user downloads a client pack as one PDF, with the client intro in front when the client has 2+ approved case histories.
  - A named collection can be reopened, reordered and re-exported. Its text edits and hidden pages never change the original case histories.
  - No combined file ever contains unapproved content (guardrail test).

## Change navigation checklist

| Item | Status | Finding |
|---|---|---|
| 1.1 Triggering story | [x] | No failing story. Trigger: the owner's change request of 2026-10-16 after the Clients page and client info (Stories 2.13, 2.14, PR #48). |
| 1.2 Core problem | [x] | New stakeholder requirement: a client intro document, a client overview configurator, combined client downloads and saved collections (C14, C16–C18). C15 is already built. |
| 1.3 Evidence | [x] | One-step client dialog; owner-only `list clients`; export per single revision; generation and rendering domains empty (section 1) |
| 2.1 Current epic | [x] | Epic 2 completes as planned for the MVP. Story 2.15 is added for Phase 2. |
| 2.2 Epic-level changes | [x] | Epics 3–6 gain Phase 1 AC amendments (3.3, 3.4, 3.5, 4.2, 5.3) and Phase 2 stories (3.9, 4.11, 4.12, 5.9–5.11, 6.5) |
| 2.3 Future epics | [x] | Dependencies: 3.9 needs 3.3–3.6 and 4.2–4.8; 4.12 needs 4.2–4.9 and 4.11; 5.9 needs 5.3–5.4 and 4.11; 5.10 needs 5.9; 5.11 needs 5.10 |
| 2.4 Obsolete or new epics | [x] | None obsolete. No new epic recommended (Epic 9 noted as a bookkeeping alternative). |
| 2.5 Epic order | [x] | Epic order unchanged. ~~Phase 2 runs after Epic 6 as a second pass in epic order.~~ *(superseded by the amendment: the new stories sit inside Sprints 2–3 by dependency)* |
| 3.1 PRD | [!] | New FR11–FR13, NFR6 and NFR7 wording, roles, terms, new open point 15. **NFR7 conflict** for collection text edits by account/sales/social, held by IR-COLL-EDIT until the owner decides. MVP criteria unchanged. |
| 3.2 Architecture | [x] | AD-1, AD-3, AD-4, AD-6, AD-8, AD-9, AD-11, AD-17, new AD-23 and AD-24, ER diagram, capability map |
| 3.3 UI/UX | [x] | EXPERIENCE: roles, IA, Clients, Configurator modes, Library, Collections, Flow 5, conflicts C14–C18. DESIGN: two component notes. Wireframes needed for the overview and collection configurator before Phase 2. |
| 3.4 Other artifacts | [x] | sprint-status, two spec banners, epic contexts, deferred-work (export key resolved), SPEC, DB and guardrail tests, `db.types.ts` from CI. No CI or deploy config change. |
| 4.1 Direct adjustment | [x] Viable in two phases | ~~All at once before the demo: not viable (about 15 days on Sprint 2).~~ *(superseded by the amendment: chosen by the owner, high schedule risk)* Phase 1 only: low effort, low risk. |
| 4.2 Rollback | [x] Not viable | Nothing built is wrong |
| 4.3 MVP review | [x] Viable | ~~The new features move to Phase 2.~~ *(superseded by the amendment: the new features join the MVP; nothing is cut)* Nothing in today's MVP is reduced. |
| 4.4 Selected path | [x] | ~~Hybrid: Phase 1 amendments now, Phase 2 stories after the demo (section 3)~~ *(superseded by the amendment: direct adjustment, everything before the demo)* |
| 5.1 Issue summary | [x] | Section 1 |
| 5.2 Epic and artifact impact | [x] | Section 2 |
| 5.3 Path and rationale | [x] | Section 3 |
| 5.4 MVP impact and plan | [x] | ~~MVP content unaffected; about +1 day in Sprint 2; Phase 2 about 3 weeks from 2026-11-02~~ *(superseded by the amendment: the MVP gains about 15 dev days before 2026-10-30; the demo criteria are at risk)* |
| 5.5 Handoff | [x] | Section 5 |
| 6.1 Checklist complete | [x] | All applicable items addressed; the one [!] item (NFR7) is documented with an interim rule and Open question 4 |
| 6.2 Proposal accuracy | [x] | Each new rule is stated once (AD-23, AD-24, IR-COLL-EDIT) and referenced elsewhere |
| 6.3 Owner approval | [x] Done | Approved by the owner on 2026-10-16 with the recommended answers to all ten open questions |
| 6.4 sprint-status update | [x] Done | Eight Phase 2 stories added as `backlog` in order (2-15, 3-9, 4-11, 4-12, 5-9, 5-10, 5-11, 6-5), Phase 1 notes on 3-3, 3-4, 3-5, 4-2, 5-3, notes on 2-13, 2-14, 5-1, `last_updated` refreshed. No new epic key (none created). |
| 6.5 Next steps confirmed | [x] Done | Section 4 applied on `docs/scp-2026-10-16-client-intro-and-collections` (epics, PRD, spine, EXPERIENCE, DESIGN, epic 2/3 contexts, sprint-status, spec banners, deferred-work, SPEC). Next: docs PR, design ask, Phase 1 inside 3.3–3.5, 4.2 and 5.3, Phase 2 from 2026-11-02. |

## 6. Open questions for the owner (resolved 2026-10-16: all recommended answers accepted; answer 10 later reversed by the owner amendment)

**Assumption recorded at approval:** the owner did not say who "PM" is. We read "PM" as an owner/designer in the tool, so under answer 4 (a) PMs can edit collection text. If PMs turn out to use the account/sales/social role, answer 4's upgrade (b) applies.

1. **Which case histories can be downloaded or put in a collection?**
   - Options: (a) approved only; (b) any status, with drafts marked.
   - *Recommended: (a) approved only, including the Clients-list download (intro plus the client's approved case histories).* NFR7 already says nothing leaves the tool before an owner/designer approves it, and the sales library shows approved only. Drafts can still be seen in the client overview.

2. **Is the client intro approved like a case history?**
   - Options: (a) yes, with the per-block check and **Approve**; (b) no, the owner's edits are enough.
   - *Recommended: (a).* The intro contains AI-written text that goes to clients, so NFR2 and NFR7 apply. Until it is approved, case histories keep their own intro in every download.

3. **Are the 2–3 images mandatory, and what quality?**
   - Options: (a) at least 2 and at most 3, required when adding a client; (b) optional; (c) exactly 3.
   - *Recommended: (a), PNG, JPEG or WebP up to 20 MB and at least 1600 px on the short side.* The intro template is designed for 2–3 images. Existing clients are asked for images the first time their intro is generated. The design team confirms the minimum size.

4. **Who can edit texts in a collection?** This is the one guardrail question. Text edited in a collection hasn't been approved by an owner/designer, and NFR7 says nothing leaves the tool without that approval.
   - Options: (a) only owner/designers edit text; account/sales/social reorder, hide pages and export. (b) Anyone edits, but a collection with edited text needs an owner/designer's **Approva modifiche** before export (about one extra dev day). (c) Anyone edits and exports freely; this means changing NFR7 explicitly.
   - *Recommended: (a) to start, with (b) as the upgrade if sales people need to change wording themselves.* Please also tell us who "PM" is: if PMs are owner/designers in the tool, (a) already lets them edit.

5. **Which formats does a combined file (client pack or collection) come in?**
   - Options: (a) Deck 16:9 PDF and A4 PDF only; (b) every MVP format, including the social carousel as a ZIP of images.
   - *Recommended: (a).* A carousel built from several case histories isn't a usable social post. Single case histories keep every format.

6. **When an original case history is updated, does a collection follow?**
   - Options: (a) yes for text you didn't touch, and your edits stay, with a notice if the original changed; (b) no, the collection freezes everything when it is made.
   - *Recommended: (a).* A correction to an approved case history (for example a wrong number) then reaches every collection, and your wording is never lost silently. (b) matches "duplicated" literally but can keep an error forever.

7. **What should the intro say, and from what?**
   - Options: (a) a headline and one short paragraph, written only from the client's name, sector and description; (b) as (a), plus an optional "Note per l'introduzione" field on the client (up to 1,500 characters) for more to draw from.
   - *Recommended: (a) for the first version.* With little source text, a long intro invites the AI to invent things. (b) can follow if the intros feel thin.

8. **In a collection, do a client's case histories stay together?**
   - Options: (a) yes, a client's case histories move as a group under its intro, and you can still reorder within and between groups; (b) free order, with the intro before the client's first case history.
   - *Recommended: (a).* An intro followed by another client's work reads as a mistake.

9. **Who can see and change a collection?**
   - Options: (a) everyone who can export sees every collection and can change it; (b) only the person who made it can change it, others can view and export.
   - *Recommended: (a) for a small team, like shareable links (IR-PERM).* "Created by" is shown on every collection.

10. **Phasing: is it fine that these features arrive after the October 30 demo?**
    - Options: (a) Phase 1 amendments now, the features from 2026-11-02 (about 3 weeks); (b) pull client images (2.15) before the demo if Sprint 3 has slack; (c) try to fit the intro before the demo.
    - ~~*Recommended: (a), with (b) if Epic 6 finishes early.* (c) would put the four demo criteria at risk for a feature the demo doesn't need.~~
    - *Superseded by the owner amendment of 2026-10-16:* everything before the demo, the demo stays on 2026-10-30 and nothing is cut (see Amendment).
