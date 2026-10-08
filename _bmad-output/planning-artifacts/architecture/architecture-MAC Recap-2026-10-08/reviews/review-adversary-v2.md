# Adversarial Review v2: ARCHITECTURE-SPINE.md (MAC Recap MVP, update run)

- **Reviewed:** `ARCHITECTURE-SPINE.md` (status `final`, updated 2026-10-08, uncommitted changes on `architecture-spine`)
- **Focus:** what changed in this update — the fork-a-working-head model on approved cases with **Update approved version** and **Discard** (AD-3, AD-17, AD-19), per-block check state inside `revision.doc` and its clearing on edit (AD-19), shareable links that resolve the case's current `approved_revision_id` (AD-13), the shared vs per-format document split (AD-4), the "any owner/designer" policy matrix (AD-11), and the reworked material gate (AD-6).
- **Method:** For each hole, two units one level down (Epic 2 upload, Epic 3 generation, Epic 4 review/approval/configurator, Epic 5 export/share, Epic 6 auth). Each unit obeys every AD as written and still builds something that does not fit with the other unit. Each hole ends with the smallest new or tightened rule that closes it.
- **Verdict:** **NOT READY: fix before sharding Epic 4 and Epic 5.** The v1 holes are closed: revision ownership, compare-and-set, the print route, typed refs and the rendition owner. The new approved-case staging model adds a second mutable pointer (`head_revision_id`) that has no concurrency contract. "Approve" never states *which version* it approves. Read surfaces are not told which revision to load. The block set that gates approval is defined by per-format templates, but it lives in the shared part of the document. Each of these lets two epics build to the letter and still ship unchecked or unreviewed content to a client link, which breaks NFR2 and NFR7.

Severity: **Critical** = unchecked or unapproved content reaching a client or sales, approval or guardrail bypass, or data loss. **High** = two epics ship code that cannot be integrated, or a silent wrong result. **Medium** = rework or a latent bug. **Low** = something to clarify.

---

## H1 — The fork of a working head, and the `head_revision_id` pointer, have no compare-and-set [Critical]

**Unit A, Epic 4 / configurator autosave (Story 4.2):** AD-17 says every write to `revision.doc` passes the expected `revision.version`, and that only `working` revisions are writable. It also says "the first edit on an approved case forks the working head (AD-3)". The team implements `saveDoc(revisionId, expectedVersion, patch)`. If the revision is `approved`, the call forks a new `working` revision from it, applies the patch, sets `case_study.head_revision_id = new.id` and returns the new id. The client then switches to that id.

**Unit B, Epic 4 / Check tab and Discard (Story 4.3):** The Check tab also writes `doc`, because the check lives in each block (AD-19). Its toggle use case loads `case.head_revision_id`. If that is the approved revision, it forks too, following the same rule. Discard, per AD-3, "marks the working head `superseded` and points `head_revision_id` back to `approved_revision_id`". AD-11 lets any owner/designer run it on any case.

**Clash:**
1. Two owner/designers open the same approved case, which is a normal case (A5). Both make a first edit at the same moment. Each call sees the approved revision at the same `version`, and each forks. Compare-and-set protects `revision.version`, but a fork **never writes to the approved revision**, so neither call fails. Two `working` revisions now exist and `head_revision_id` names whichever write landed last. The other designer's edits are orphaned silently, with no `STALE_REVISION` and no reload.
2. Designer B clicks Discard while Designer A is typing. A's next autosave targets a revision that is now `superseded`. AD-17 has no error for "not writable". Unit A returns `STALE_REVISION`, because the version check runs first. Another implementation returns `REVISION_NOT_WRITABLE`. A's client then either reloads onto the approved revision and loses the in-flight text, or, if Unit A's fork-on-non-working logic matches `superseded` as well as `approved`, it **forks from a superseded revision** and brings the discarded edits back.
3. AD-3 says Discard resets the head to the approved revision. After that, "head" is an `approved` revision again, so for some time the head is not writable. Any epic that assumes "head is always working" (the configurator, AD-10's "head check") is wrong for approved cases.

**Proposed rule (tighten AD-17, add to AD-3):**
- `case_study` carries a `head_version` integer. Every change to `head_revision_id` (fork, generate success, Discard, Update approved version) is a compare-and-set on `(case_id, expected_head_version)` and fails with `STALE_HEAD`.
- Forking is its own use case, `case-study.forkHead(caseId, expectedHeadVersion)`. It is idempotent: if the head is already a `working` revision whose parent is `approved_revision_id`, it returns that revision. `saveDoc` and check toggles never fork implicitly. They accept only a `working` revision id and otherwise return `REVISION_NOT_WRITABLE`.
- Forks are taken only from `approved_revision_id`, never from a `superseded` revision.
- Clients treat `STALE_REVISION`, `STALE_HEAD` and `REVISION_NOT_WRITABLE` the same way: reload, with no retry (this settles A5's "someone else changed this" state for UX).

---

## H2 — `approve` and "Update approved version" do not say which version they approve [Critical]

**Unit A, Epic 4 / Approve button (Story 4.3):** AD-19 says `approve` "is computed at approve time on the server" and requires every block to have a current `check`. Overflow is detected "by the AD-9 renderer in the configurator" and the server does not re-measure it (Deferred). The team sends `approve(caseId)`. The server loads `head_revision_id`, verifies that every block is checked and flips it to `approved`.

**Unit B, Epic 4 / per-format layout panel:** AD-4 puts spacing, text scale, font pairing, variant, seed and slot assignments in the **per-format** part. AD-19 clears checks only "whenever that block's **text** changes". The team saves layout changes, correctly, without clearing any check.

**Clash:** Designer A previews the deck at version 7, with no overflow, and clicks Approve. In between, Designer B saves version 8: A4 text scale up one step and a media swap in the shared set. Every check is still current, because no text changed, so the server approves version 8. Nobody has looked at version 8, and it overflows in A4. Through AD-13, every client link now renders it **at request time**. The same race exists for Update approved version, which is the path that reaches *already distributed* links. Because the server does not re-measure overflow (Deferred), the only overflow gate was the client view of a different version.

**Proposed rule (tighten AD-19):** `approve(caseId, revisionId, expectedVersion)` is a compare-and-set on both `revision.version` and `case.head_version`, and fails with `STALE_REVISION` if anything changed since the approver's last load. The client sends the version it last rendered. Its overflow result is sent as `overflowCheckedVersion` per format and must equal `expectedVersion` for every format in the document (see H4). The `case_event` for `approve` records `revision_id` and `version`.

---

## H3 — Read surfaces are not told which revision to load; sales and the case view can read the unchecked head [Critical]

**Unit A, Epic 5 / case study view and library (Story 5.1):** AD-9 says the case study view uses the AD-9 renderer. AD-11 gives `account_sales_social` "view: any approved". The team checks `case.status === 'approved'`, which still holds because AD-3 makes `approved` terminal, and renders `case.head_revision_id`. In the MVP model that is "the case's current revision". The library thumbnail uses the same loader.

**Unit B, Epic 4 / approved-case editing:** This follows AD-3 exactly. It forks a working head, the case stays `approved`, and the edits are staged.

**Clash:** As soon as an owner/designer starts editing an approved case, every sales user sees the staged, **unchecked** text in the view and the library, because the case is still `approved`. AD-3 guards export and share with `isRevisionApproved`, and AD-13 guards links, but the in-tool **view** is not in AD-3's NFR7 list. The status check that Unit A used is exactly the v1 H1 failure, coming back through the new "approved is terminal" rule. Exports are also affected. Epic 5's Export button takes the revision the user is looking at. If that is the head, the use case rejects it (`isRevisionApproved` is false), so for sales, export breaks on every case that is being edited.

**Proposed rule (tighten AD-3):** Revision resolution belongs to `case-study` and has only two entry points: `getLiveRevision(caseId)` returns `approved_revision_id` (or none), and `getEditableRevision(caseId)` returns the head and requires the `edit` permission. Only the configurator and Check tab may call `getEditableRevision`. Every other surface (view, library, thumbnails, export, `/s/{token}`, Export all) calls `getLiveRevision`. No use case outside `case-study` reads `head_revision_id`.

---

## H4 — The approval gate is per format in practice, but shareable links and approval do not agree on which formats are reviewed [High]

**Unit A, Epic 4 / configurator overflow (Story 4.3):** AD-19 says "text overflow also blocks approval; it is detected by the AD-9 renderer in the configurator". The configurator shows one format at a time, so the team blocks Approve when the **visible** format overflows.

**Unit B, Epic 5 / Create shareable link (Story 5.2):** AD-13 says a link has `caseId` and `format`, and that creating it "requires the case to have an `approved_revision_id`". The team offers every format in the AD-9 registry.

**Clash:** The approver worked only on the deck. The approved revision has a per-format entry for A4 that was carried over by regeneration (AD-17 "where still valid") or never configured, and no one rendered it. A sales user creates an A4 link, and the client opens text that overflows or is clipped. The gap widens when OP 1 adds a format to the registry after approval. AD-4 keys the per-format part "by format id from the AD-9 registry", but nothing requires an approved revision to have an entry for every format a link or export can request. One renderer then defaults the missing entry and another throws.

**Proposed rule (tighten AD-4 and AD-19):** A revision's document has a per-format entry for **exactly** the formats in the registry at the time the revision was created, and the zod schema enforces this. A format added to the registry later is available for links and exports only on revisions created after it was added. `approve` requires a passing overflow result for **every** format entry at `expectedVersion`, collected by the configurator rendering each format off-screen. AD-13 link creation and AD-9 export requests are rejected with `FORMAT_NOT_IN_REVISION` for any other format, and `/s/{token}` shows the "no longer available" page if the live revision lacks the link's format.

---

## H5 — The blocks that gate approval are template-defined per format, yet stored once as shared [High]

**Unit A, Epic 3 / generation layout filter:** AD-4 says the shared text blocks are "challenge, approach, result, plus the headline and KPI tiles **the template defines**". The template is per format (`templateId@version`). The team writes the shared blocks as the **union** of every format template's headline and KPI slots, so that each format's renderer finds its tiles.

**Unit B, Epic 4 / Check tab:** The team lists the blocks to check from the template of the **active** format and checks those. AD-19's gate says "every block". The `approve` use case, written by a third person, iterates over `doc.blocks`.

**Clash:**
- KPI tile 3 exists only in the social template. The Check tab on the deck never shows it, so `approve` is blocked forever with no visible reason. If a developer "fixes" this by filtering the gate to the active format, unchecked tiles reach a social link.
- Changing a format's template version, or a per-format choice that switches template, changes the block set inside the shared part. Neither unit owns adding or removing blocks, and AD-19's "cleared whenever text changes" does not cover a block that appears.
- Block identity is unspecified, so check carry-over on a fork ("keeps the checks of unedited blocks") is matched by array index in one epic and by `kind` in another. Inserting a human-added claim (`human_added`) then moves checks onto the wrong blocks.
- AD-4's upgrade-on-read means a forked working head is built from an **upgraded** document. If an epic decides "unedited" by comparing against the stored, non-upgraded approved `doc`, every block looks edited and all checks clear. If it compares against the upgraded copy, they carry over. The two epics disagree.

**Proposed rule (tighten AD-4 and AD-19):** Every text block has a stable `blockId` (uuid) assigned when it is created and never reused. The set of shared blocks is a fixed set from the template family: challenge, approach, result, headline, plus `kpi[0..n]` with n = the maximum over the family's formats. A format's renderer only *chooses* which blocks it shows. The approval gate is over **every block in the shared part**, regardless of format. The server decides whether a check is current by storing `check.textHash`: a check is current only if the hash of the block's text after `upgrade()` matches. Fork carry-over then falls out of that rule, matched by `blockId`, with no separate "clear on edit" code path.

---

## H6 — Material referenced only by a working head can be hard-deleted, then becomes "approved" by a status flip [High]

**Unit A, Epic 2 / material drawer delete (Story 2.x):** AD-18 says "material that a **non-working** revision references can only be soft-deleted". The team hard-deletes everything else, including the S3 original, so that deleted client files actually go away.

**Unit B, Epic 4 / approve:** AD-3 and AD-19 approve by flipping the head's `revision.status` from `working` to `approved`. Nothing is copied.

**Clash:** Asset X is in the working head's media set and slot assignments, and nothing else references it. Unit A hard-deletes it, as allowed. The next Approve or Update approved version produces an approved revision that references a missing asset, and AD-13 renders the client link with a broken image. The same gap applies to a queued `generate` job: AD-6 gates at **enqueue**, and the manifest names a text item that Unit A then hard-deletes before the worker runs. AD-18 does not cover job manifests, so the worker's `resolveRefs` returns nothing. One implementation fails with an unmapped error. Another generates from the form alone, which is exactly what NFR6 forbids.

**Proposed rule (tighten AD-18 and AD-6):** Material is only ever soft-deleted while any revision (of any status) or any `queued`/`running` job manifest references it. Hard deletion is a separate purge job that runs only for unreferenced material. The worker re-runs the AD-6 gate against the resolved manifest, so a manifest whose items are all deleted fails with `NO_MATERIAL`. `approve` fails with `MATERIAL_MISSING` if any slot or `sourceRef` resolves to a deleted item.

---

## H7 — A media-set edit (shared) and slot assignments (per format) have no single re-layout owner [High]

**Unit A, Epic 4 / media drawer:** AD-4 puts "the selected media set" in the shared part. The team writes only the media set.

**Unit B, Epic 3 / layout filter:** The deterministic slot assignment and the media-count rule (AD-15) run as a pipeline filter in the worker, so the team builds it inside `generation`. AD-15's `listVariants(templateId, format, mediaCount)` depends on the media count.

**Clash:** Removing an image changes the media count. For every format, the stored variant may now be outside its supported range, and slot assignments point at an asset that is no longer selected. Unit A's write is valid under AD-17, but it leaves a document that the renderer cannot render or that fails AD-4's own zod schema. Unit B's re-layout logic lives in the worker and runs only when generating, and generation is **not available** from `approved` (AD-3). On an approved case's working head, nothing can repair the layout. The configurator then copies the logic into the web app, and two layout implementations drift, which is the drift AD-9 exists to prevent.

**Proposed rule (tighten AD-4 and AD-15):** Re-layout is one pure domain function, `rendering.relayout(doc, format, templateVersion)`. The generation layout filter and every shared-part write that changes the media set call it, the latter inside the same compare-and-set write, for every format entry. A per-format choice is kept if it is still valid for the new media count. Otherwise it falls back to the template's first listed variant for that count, and the fallback is recorded in the `case_event`.

---

## H8 — Exports and Export all after Update approved version [Medium]

**Unit A, Epic 5 / export use case:** AD-3 requires an approved revision to export. The team checks `isRevisionApproved` when the export is requested. Download uses the stored `export` row for (revision, format), as AD-9's `ensureExport` allows.

**Unit B, Epic 5 / Export all:** AD-9 says Export all is "built from exports already rendered". The team takes the newest `export` row per format for the case.

**Clash:** After Update approved version, the newest A4 export may belong to the superseded revision, because only the deck was re-exported. Export all then mixes two revisions, one of them no longer approved. `isRevisionApproved(superseded)` is false, so an implementation that re-checks on **download** refuses old export rows, while Unit A serves them. Export jobs queued before the update finish against a revision that is now superseded. AD-10's acceptance check ("`targetRevisionId` or head check") does not say which check applies to exports.

**Proposed rule (tighten AD-9 and AD-10):** An export request and Export all name `getLiveRevision(caseId)` at the time of the request (H3). Export all collects or enqueues exports only for that revision id. Downloads re-check `isRevisionApproved` and return `REVISION_SUPERSEDED` otherwise. An export job for a revision that is not approved when it finishes is marked failed with that code, and the case status does not change.

---

## H9 — Check toggles and autosave fight over one `revision.version` [Medium]

**Unit A, Epic 4 / Check tab:** A check is a field inside `doc` (AD-19), so a toggle is a `doc` write with compare-and-set (AD-17) and bumps `version`.

**Unit B, Epic 4 / text editor autosave:** This also writes with compare-and-set on the same `version`, and the client does not retry `STALE_REVISION`: "it reloads the revision" (AD-17).

**Clash:** A reviewer ticks the result block while a colleague, or the same user in another tab, is typing in the approach block. The typist's next autosave is stale, the client reloads, and the unsaved keystrokes are lost. The edits are to unrelated blocks. Teams then work around it in opposite ways: one excludes checks from the version, which breaks H2's approve compare-and-set, and the other merges silently on the client, which breaks AD-17.

**Proposed rule (tighten AD-17):** `doc` writes are **block-scoped patches** (`blockId`, expected `revision.version`). The server rejects them only if the same block or the per-format entry being written changed after `expectedVersion`, and always bumps `revision.version`. Check toggles are block-scoped patches too. `approve` still compares the whole `revision.version` (H2).

---

## H10 — The material gate counts items that hold no material [Medium]

**Unit A, Epic 2 / text items:** The team creates a `text_item` row when the user opens a "new note" field and autosaves it as it is typed. The row can be empty. A DOCX or scanned PDF from which no text can be extracted (Deferred extraction) is a valid asset.

**Unit B, Epic 3 / AD-6 gate:** The gate counts "at least one non-deleted material item: an asset of any allowed type … or a text item".

**Clash:** An empty note, or a single image-only PDF with no extractable text, passes the gate. The LLM then receives only form answers, which is the NFR6 case the gate exists to stop. The wizard's Generate button agrees with the gate, so the user gets no warning.

**Proposed rule (tighten AD-6):** A material item counts only if it has usable content: a `text_item` with non-empty trimmed text, an image or video asset that passed the HEAD check, or a document asset with non-empty extracted text. `material.index.hasUsableMaterial(caseId)` is the single check used by the wizard, the enqueue gate and the worker re-check (H6).

---

## H11 — Discard and "Update approved version" are not defined outside the approved staging case [Low]

AD-11 grants "approve, update approved version, discard" on **any case**. AD-3 defines Discard as resetting the head to `approved_revision_id`, which is null before the first approval. On an `in_review` case, one Epic 4 team hides Discard. Another implements it per the matrix, and the head becomes null, which strands the case. Similarly, "Update approved version" on an approved case whose head *is* the approved revision becomes a no-op that still emits an `approve` event and corrupts AD-20's approval counts.

**Proposed rule (tighten AD-3):** Discard and Update approved version require `case.status = approved` **and** a `working` head that differs from `approved_revision_id`. Otherwise they return `NOTHING_TO_DISCARD` or `NOTHING_TO_UPDATE`. On cases that are not approved, the policy matrix row reads "approve" only.

---

## Summary of proposed changes

| Hole | Severity | AD touched | Change |
| --- | --- | --- | --- |
| H1 | Critical | AD-3, AD-17 | `head_version` compare-and-set; explicit idempotent `forkHead`; no implicit fork; fork only from approved; reload on `STALE_HEAD`/`REVISION_NOT_WRITABLE` |
| H2 | Critical | AD-19 | `approve(caseId, revisionId, expectedVersion)` with compare-and-set; overflow result bound to that version |
| H3 | Critical | AD-3 | `getLiveRevision` vs `getEditableRevision`; only configurator and Check tab read the head |
| H4 | High | AD-4, AD-13, AD-19, AD-9 | Per-format entries = registry at creation; approve requires overflow pass on all formats; `FORMAT_NOT_IN_REVISION` |
| H5 | High | AD-4, AD-19 | Stable `blockId`; fixed family block set; gate over all shared blocks; `check.textHash` after upgrade |
| H6 | High | AD-18, AD-6 | Soft delete while any revision or live job references it; worker re-gate; `MATERIAL_MISSING` at approve |
| H7 | High | AD-4, AD-15 | One pure `rendering.relayout`, called by the pipeline and by media-set writes |
| H8 | Medium | AD-9, AD-10 | Exports and Export all bound to the live revision id; `REVISION_SUPERSEDED` |
| H9 | Medium | AD-17 | Block-scoped patches; approve still compares the whole version |
| H10 | Medium | AD-6 | `hasUsableMaterial`: non-empty text, or extracted text for documents |
| H11 | Low | AD-3, AD-11 | Discard and Update approved version only with a staged working head on an approved case |
