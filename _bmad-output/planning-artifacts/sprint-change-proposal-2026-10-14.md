---
title: "Sprint Change Proposal: favourites instead of tags, no pasted text, no undo on removal"
date: 2026-10-14
status: approved
approved: 2026-10-14 (Sonja, product owner)
owner: Sonja (product owner)
scope: moderate
mode: incremental
triggers: [C6, C7, C8]
source: "_bmad-output/planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/EXPERIENCE.md (Conflicts), PR mac-sonja/mac-recap#24"
---

# Sprint Change Proposal, 2026-10-14

## 1. Issue summary

During the UX update of 2026-10-13/14 (DESIGN.md and EXPERIENCE.md, PR #24), the product owner made three decisions about the new-case-study wizard. Each one conflicts with the PRD, the epics and Sprint 1 backend work that is already merged:

| ID | Decision | Conflicts with |
|---|---|---|
| C6 | Deliverables get no tags, properties or flags. Instead, any number of **images and videos** can be marked **favourite**. The mark is optional. | FR2, PRD Story 2.4, OP 3 (taxonomy, due 2026-10-14), AR14 / AD-14, Story 2.9 (backend merged, #19), Story 5.1 tag facets |
| C7 | There is no pasted-text entry in step 1. Typed project text lives only in the three Details fields, and **Details text is not material** (NFR6 unchanged). Text-document *files* are still uploaded in step 1. | FR2 "pasted text also counts", PRD Story 2.3 "files and text", AR6 / AD-6, Story 2.8 (backend merged, #18), Stories 2.10, 3.6, 3.7, 4.5 |
| C8 | Removing a file is immediate: no confirm and no Undo toast. Soft delete stays. | UX-DR8, Stories 2.7 and 2.8 remove ACs, the `restore_asset` backend (#17) |

Type: new requirement from the stakeholder (product owner), decided in UX review. No technical limitation is involved. Evidence: the owner's decisions are logged in the UX memlog (2026-10-13/14), and the mocks are `mockups/material-step.html` and `mockups/details-step.html`.

## 2. Impact analysis

**Epics**
- **Epic 2 (in progress)** can still be completed. Story 2.8 is repurposed as a cleanup story, Story 2.9 is rewritten for favourites, and Stories 2.7 and 2.10 get AC edits. No wizard UI has been built yet, so no UI work is lost.
- **Epic 3 (backlog)** gets text edits only. The material gate and generator input lose text items, and favourites are carried in the manifest but ignored until OP 14. No Epic 3 story reads tags.
- **Epic 4 (backlog):** Story 4.5 wording only.
- **Epic 5 (backlog):** Story 5.1 loses tag facets and card tags; Client and Year facets remain.
- **Epic 6** is unaffected. No epic becomes obsolete, none is added, and the epic order is unchanged.

**Artifacts**
- **PRD:** roles, Terms (Material, Deliverable), FR2, the Sprint 1 and Epic 2 names, Stories 2.3, 2.4 and 6.2, OP 3 (resolved), and a new OP 14 (what a favourite means for generation). NFR6 and FR3 are unchanged.
- **Architecture:** scope, AD-1 ownership, AD-6 gate (one live asset), AD-11 matrix, AD-14 rewritten (favourite on `asset`), AD-18 `MaterialRef`, ER diagram, FR map and open-point table.
- **UX (EXPERIENCE.md):** roles, search, library cards and facets, the C6–C8 resolutions, and OPEN F renumbered to OPEN 14.
- **Tracking and supporting docs:** sprint-status, the done 2.7, 2.8 and 2.9 specs (superseded banners), deferred-work, epic-2-context, and SPEC (`SPEC.md`, `ui-flows.md`, `delivery-plan.md`).

**Technical (merged code, from the impact sweep)**
- The taxonomy slice (Story 2.9) becomes dead code:
  - Tables and functions: `taxonomy_term`, `material_term`, `set_material_terms`, `case_material_terms`.
  - Modules: domain, port, adapter and use cases.
  - Three server actions, the policy action `tag`, `UNKNOWN_TERM`, and the DB tests.
- The text-item slice (Story 2.8) becomes dead code:
  - The `text_item` table.
  - Four use cases and their actions, `TEXT_EMPTY`, and the DB tests.
  - `has_material` currently reads `text_item`.
  - Shared helpers in `domain/text-item.ts` that `details-form.ts` and `has-material.ts` import.
- Restore (C8) becomes dead code: `restore_asset`, the `restoreAsset` and `restoreTextItem` use cases and actions.
- Migrations are forward-only (AR12, README). Every removal goes through a new migration, and `db.types.ts` is regenerated in CI (no local Docker; see team note).

## 3. Recommended approach

**Direct adjustment, with cleanup now (path A, chosen by the owner).**

| Path | Verdict |
|---|---|
| A. Clean up now with one forward migration and code removal, then add favourites | **Chosen.** Medium effort, low risk. Nothing reads the retired tables yet, so this is the cheapest moment. |
| B. Leave the retired backend dormant and clean up later | Rejected. Dead tables, and `hasMaterial` would keep counting text items nobody can create. |
| C. Revert PRs #18 and #19 | Not viable. Their migrations are applied, and editing or reverting an applied migration is forbidden. |

The MVP is not reduced: the demo criteria (upload, generate, review, export) all remain. The owner chose to **remove** the restore backend (C8) rather than keep it.

Timeline: Sprint 1 ends 2026-10-14. New Story 2.8 (cleanup) and Story 2.9 (favourites) are small backend stories. The Story 2.7 and 2.10 UI parts follow them. Effort is about 1–1.5 dev days in total. The risk is low, because every removal is covered by existing tests that get deleted or updated alongside it.

## 4. Detailed change proposals (all approved incrementally)

### 4.1 PRD (`prds/prd-MAC Recap-2026-10-08/prd.md`) — approved
- **Roles, owner/designer:** "assigns tags, properties and flags" becomes "marks favourite images and videos".
- **Terms:**
  - *Material:* "Uploaded files: images, videos, text documents and PDFs. The details form is not material."
  - *Deliverable:* "One uploaded file of material. Images and videos can be marked as favourite."
- **FR2:** "…uploads material (images, videos, text documents and PDFs), can mark any number of images and videos as favourite, and fills in a short details form on context, solution and results. The details form is the only place for typed project text."
- **Sprint plan, Epic list and § 8 heading:** "Epic 2 – Asset upload and tagging" becomes "Epic 2 – Asset upload"; "file and text upload with tags…" becomes "file upload, favourites and the details form".
- **Story 2.3:** "upload files and text" becomes "upload files"; "file and text upload flow" becomes "file upload flow".
- **Story 2.4:** "I want to mark images and videos as favourite. The favourite mark is saved for each image or video; it's optional and any number can be marked."
- **Story 6.2:** "create, upload and tag" becomes "create, upload and mark favourites".
- **OP 3:** "Resolved 2026-10-14: no taxonomy. Tags, properties and flags are dropped; favourites replace them (Story 2.4)."
- **OP 14 (new):** "What a favourite means for generation (Epic 3; decide before Sprint 2). Whether generation must use, prefers, or simply shows favourites first."
- **Unchanged:** NFR6 and FR3. Header: `updated: 2026-10-14`, plus a changelog line linking this proposal.

### 4.2 Epics, requirement inventory (`epics.md`) — approved
- **FR2** as in 4.1, with "never counts as material" kept.
- **AR6:** "at least one non-deleted asset" (text item removed).
- **AR14:** "Favourite is a boolean on `asset` (`is_favourite`, default false), settable only on image and video assets; changing it records an event and never changes case status. There is no taxonomy."
- **AR18:** `MaterialRef { asset | form_field, id }`; "Upload and favourite never change case status."
- **UX-DR6:** card has no tags; facets are Client and Year.
- **UX-DR8:** rewritten for the focused wizard (per `mockups/material-step.html`):
  - accepted-type chips; no pasted text
  - rows: thumbnail, name, size, remove, plus a Preferito toggle on images and videos
  - remove is immediate, with no confirm and no undo
  - Avanti is active from the first uploaded file; Dettagli and Genera can't be reached with 0 files
- **IR-OP3** is resolved. New **IR-OP14**: favourite meaning; Epic 3; owner; interim "stored and shown, not used by generation".
- **IR-OP4:** facets are Client and Year.
- **FR coverage:** "Upload (20 × 100 MB, allowlist), favourites, details form".
- **Epic 2 summaries:** "uploads files, marks favourite images and videos".

### 4.3 Epic 2 stories (`epics.md`) — approved
- **Story 2.7:**
  - Covers: "remove/undo" becomes "remove".
  - Remove AC: "disappears at once, with no confirm dialog and no undo; the asset is soft-deleted (`deleted_at`), never hard-deleted (AR18)".
  - New AC: while the case has 0 non-deleted files, Avanti is inactive and Dettagli and Genera can't be reached.
- **Story 2.8 becomes "Retire pasted text and the taxonomy"** (team story; Covers FR2, AR6, AR14, AR18, AR12):
  - **Forward migration:**
    - `has_material` is rewritten to "case exists and has ≥ 1 non-deleted asset".
    - Drops `material_term`, `taxonomy_term`, `set_material_terms`, `case_material_terms`, `text_item`, their triggers and functions, and `restore_asset`.
    - `db.types.ts` is regenerated.
  - **Code:**
    - Remove the text-item and taxonomy slices, `restoreAsset` / `restoreTextItem` and their actions, tests and error mappings (`TEXT_EMPTY`, `UNKNOWN_TERM`), and the policy action `tag`.
    - Move `hasMaterial` to the asset repository.
    - Move `withinCodePoints`, `hasNoNul` and `caseIdSchema` out of `text-item.ts` first.
    - `MaterialRef` kinds become `asset | form_field`.
  - **ACs:**
    - `hasMaterial` is true only with a live asset, and false with the form filled and no asset.
    - No applied migration is edited.
    - `check`, `db` and `image` pass.
- **Story 2.9 becomes "Mark images and videos as favourite"** (Covers FR2, AR14, UX-DR8; ⚑ Interim IR-OP14):
  - A forward migration adds `asset.is_favourite boolean not null default false`; setting it on a non-image, non-video asset is rejected.
  - Preferito on an image or video row:
    - toggles at once and survives reload
    - records an event
    - can be set as soon as the file has uploaded
    - never changes case status
  - PDFs and documents have no toggle. Any number of favourites is allowed, and none are required.
- **Story 2.10:**
  - The prompt is the placeholder; the counter "{n} di 3 compilati" sits in the footer; Avanti is active from the start.
  - Gate AC: "`hasMaterial` true (at least one uploaded file), then Avanti is enabled; before that it is inactive and step 2 can't be reached".
- **Order:** new 2.8 lands first, then 2.9, then the Story 2.7 and 2.10 UI parts.

### 4.4 Epics 3–5 (`epics.md`) — approved
- **Story 3.3:** no text change (`MaterialRef` follows AR18).
- **Story 3.6:** generator input is "form answers as text, other types per OP 2" (text items removed). ⚑ Interim IR-OP14: favourites are in the manifest but ignored.
- **Story 3.7:** "no material (no non-deleted asset), with or without the details form filled in". The server gate stays as a safety check.
- **Story 4.5:** "uploads and favourites working as for a draft".
- **Story 5.1:** the IR-OP3 interim is removed; cards show name, client and year; facets are Client and Year; tag-facet ACs are trimmed.

### 4.5 Architecture (`architecture/…/ARCHITECTURE-SPINE.md`) — approved
- **Scope:** "upload and favourites".
- **AD-1:** `material` no longer "includes taxonomy". Ownership: `asset` (including `is_favourite`) and `context_form`.
- **AD-6:** the gate is "at least one non-deleted asset of any allowed type; typed text lives only in the details form, which never counts (NFR6)". The diagram label becomes "at least one live asset?".
- **AD-11:** "upload, mark favourites".
- **AD-14 rewritten: "Favourite is a property of an image or video asset"** (Binds FR2, PRD Story 2.4, `material`, OP 14):
  - Rule: `asset.is_favourite` (boolean, default false) is settable only on image and video assets through `material.index`, with any number per case.
  - Setting it records an event and never changes case status.
  - It is carried in the manifest, and generation ignores it until OP 14.
  - There is no taxonomy.
- **AD-18:** `MaterialRef { 'asset' | 'form_field' }`; "Uploading or marking a favourite never changes case status"; the UI offers no restore.
- **ER diagram:** `TEXT_ITEM` and `material_term` are removed; `ASSET.is_favourite` is added.
- **FR map:** "FR2 upload (20 × 100 MB), favourites, details form | `material` | AD-8, AD-14, AD-18".
- **Open-point table:** OP 3 is resolved (dropped); new OP 14 row.

### 4.6 UX (`ux-designs/ux-MAC Recap-2026-10-08/EXPERIENCE.md`) — approved
- **Roles:** "mark favourites".
- **Search:** the tag-search assumption is removed.
- **Library:** cards are name, client and year; facets are Client and Year.
- **Favourite row:** [OPEN F] becomes [OPEN 14].
- **C6–C8** marked "Resolved 2026-10-14 by the owner", with one-line outcomes.
- **Open-points line:** [OPEN 14] is added; the OP 3 clause is removed.
- **Memlog:** one decision entry per resolution. `updated: 2026-10-14`.

### 4.7 Tracking and supporting docs — approved
- **`sprint-status.yaml`:**
  - `2-8-retire-pasted-text-and-the-taxonomy: backlog` (land first)
  - `2-9-mark-images-and-videos-as-favourite: backlog`
  - Comments: 2.7 "remove without undo (SCP)", 2.10 "gate = ≥1 file".
  - `last_updated` refreshed.
- **`spec-2-8-…`, `spec-2-9-…` (done):** "Superseded 2026-10-14" banner. **`spec-2-7-…`:** restore removed by new Story 2.8.
- **`deferred-work.md`:**
  - Removed: the 2.8 UI item, the 2.9 UI item and the OP 3 seed item.
  - Edited: the 2.7 UI item drops the Undo toast.
- **`epic-2-context.md`:** aligned (no tags, no pasted text, no undo, favourites, gate ≥ 1 file).
- **SPEC (`specs/spec-mac-recap/`):**
  - `SPEC.md`: CAP-2 (favourites), line 99 (typed text is only Details, not material), line 104 (favourites optional), OP 3 resolved.
  - `ui-flows.md`: lines 33 and 43.
  - `delivery-plan.md`: line 7.
- **Not changed:**
  - The PRD addendum's pre-existing "4 fields" drift, noted only.
  - UX-DR28 "everything else undoable" and the configurator undo, which are unrelated.

## 5. Implementation handoff

**Scope: Moderate.** It reorganises the backlog and adds two backend stories, without a fundamental replan.

| Role | Responsibility | Status |
|---|---|---|
| Product owner (Sonja) | Decisions C6–C8, path A, remove restore. Open: decide OP 14 before Sprint 2. | Approved |
| PO / Dev (this session) | Apply the document edits in 4.1–4.7 in one docs PR, separate from #24 or stacked on it. | On approval |
| Developer (`bmad-build`) | 1) New Story 2.8, retire pasted text and the taxonomy. 2) Story 2.9, favourites. 3) Story 2.7 and 2.10 UI parts per the mockups. One PR per story, with Auto-fix. | Next |

**Success criteria**
- No document in `_bmad-output/` refers to tags, properties, flags, taxonomy terms, pasted text or a removal Undo toast as current scope. Superseded specs carry their banner.
- After new Story 2.8:
  - the database has no `text_item`, `taxonomy_term`, `material_term` or `restore_asset`
  - `hasMaterial` counts only live assets
  - all CI checks pass
- After Story 2.9: an image or video can be favourited and unfavourited; a PDF can't.
- OP 14 is decided before Story 3.6/3.7 work starts.
