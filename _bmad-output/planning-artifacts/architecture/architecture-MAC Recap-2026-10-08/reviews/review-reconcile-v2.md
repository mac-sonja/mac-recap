---
review: input-reconciliation (v2)
target: ARCHITECTURE-SPINE.md (updated to PRD v2)
inputs: prd.md (v2), addendum.md, .memlog.md (PRD); EXPERIENCE.md, DESIGN.md (UX)
date: 2026-10-08
verdict: 'PASS WITH FIXES: the v2 update is faithful on the big items (any-owner approval, staged edits, approved-only export/share, fixed roles, NFR6 material gate, PDF-only deck, no hands-on tracking), but three rules quietly decide or contradict inputs (LLM sees text only, renditions allow scaling/upscaling, 10-min lease caps generation) and several UX assumptions are adopted as fact without a tag'
---

# Input Reconciliation Review (v2): ARCHITECTURE-SPINE.md

**Question asked:** does the spine contradict, silently drop, or resolve without flagging anything in PRD v2 or the UX specs? Does it decide any of PRD open points 1, 2, 3, 8, 11, 12, 13?

**Scope note:** items already listed under *Conflicts flagged* (A1–A5) and *Open-point dependencies* are not re-raised unless the flag is inaccurate. All five flags (A1–A5) were checked and are accurate.

Severity: **High** = contradicts an input or decides an open point in a way that will shape code before the owner decides. **Medium** = adopts or drops something without flagging; likely rework. **Low** = tagging, wording or completeness.

## Summary

| # | Finding | Severity | AD |
|---|---|---|---|
| R1 | "Narrative filter LLM, text only" + "asset bytes never go to an AI transform" decides OP 2 (images/video not LLM input) and makes image-only cases pass the NFR6 gate with nothing to write from | High | AD-5, AD-6, AD-18, pipeline diagram |
| R2 | AD-5 permits "scaling the whole image" and "format conversion"; UX guarantees ban upscaling, and OP 12 option C forbids resize altogether. Dependency table treats this as stable | High | AD-5, Open-point table |
| R3 | 10-minute lease with no heartbeat, `max_attempts` 3, contradicts NFR4 "generation time has no limit" | High | AD-10 |
| R4 | Shared link page serves media by presigned GET without restricting to renditions: originals (up to 100 MB, full video) reachable, a side door around export | Medium | AD-13, AD-8 |
| R5 | Dev-profile records reassigned to "a named real profile" at cutover conflicts with append-only `case_event` and attributes pre-login approvals to someone who may not have made them (NFR7 "approval by an owner/designer") | Medium | AD-11, AD-20, AD-19 |
| R6 | `accessMode` enum omits UX OP 11 option D (password); dependency row presents the enum as fixed | Medium | AD-13 |
| R7 | Shuffle modelled as a "seed"; UX says Shuffle steps to the next designed variant and never generates a layout | Medium | AD-4, AD-15 |
| R8 | Regenerate from `in_review` added; not in UX; silently discards text edits and checks | Medium | AD-3, AD-17 |
| R9 | `taxonomy_term` models properties as enumerated terms, pre-shaping OP 3 | Low-Medium | AD-14 |
| R10 | Material gate counts `text_item`; UX has no text-entry input and its gate copy says "file" | Low | AD-6 |
| R11 | Upload allowlist omits deck formats (PPTX/KEY) the addendum names as suggested input; GIF/SVG/HEIC also absent; only "text types" are tagged assumption | Low | AD-8 |
| R12 | UX assumptions adopted as rules without `[ASSUMPTION]`: no download on link page, image formats → ZIP of PNGs, delete only in draft, "links are a count, not a status" (OP 8 option A) | Low | AD-3, AD-9, AD-13 |
| R13 | NFR4 restated incompletely: target 15 min and "NFR2 wins over NFR4" dropped | Low | Capability map, AD-19 |
| R14 | `system` actor matrix row lists only export jobs; AD-11 text and AD-10 also have it writing generate results and renditions | Low | AD-11 |
| R15 | User removal (UX: "their case studies and links stay") not handled: FK and link ownership | Low | AD-11, AD-13 |

---

## High

### R1 — The LLM is text-only: OP 2 decided, and the NFR6 gate becomes hollow for image-only cases

- **Spine:** pipeline diagram labels the narrative step "LLM, text only". AD-5: "Asset bytes never go to an AI transform." AD-18 then says how video and PDF become LLM input "is a generation adapter concern decided with OP 2", which implies they might. The two statements disagree.
- **Inputs:** PRD OP 2 ("how the tool turns uploaded material into text") is open. NFR1 forbids the AI *altering* assets; it does not forbid the AI *reading* them. NFR5 requires the graphic side to be covered. PRD defines material as images, videos, texts and PDFs, and NFR6/AD-6 let a case of images alone pass the gate.
- **Problem:** if images never reach the LLM, an images-only case (allowed by AD-6 and A4) generates from file names, tags and the *optional* details form only. That is close to "generation from the form alone" in spirit (NFR6) and a hallucination risk on the graphic side (NFR5, NFR2). Whether the model looks at images is exactly OP 2.
- **Fix:** reword AD-5 to "asset bytes are never *modified* by AI"; drop "text only" from the diagram or mark it OP 2; add OP 2 to the dependency row for "LLM input modalities (vision on images/poster frames)". Consider noting in A4 that an images-only case needs an OP 2 answer, not just a template rule.

### R2 — AD-5 rendition operations partially decide OP 12 and contradict the UX "no upscaling" guarantee

- **Spine:** "The only processing allowed is ... scaling the whole image without cropping, format conversion, and a poster frame or transcode for video. Crop and focal point are not implemented until OP 12 allows them." Dependency table: OP 12 affects only "crop, focal point"; "no AI on assets" is stable.
- **Inputs:** EXPERIENCE.md *UX guarantees* (hold under every option): "No crop, recolour, filter, retouch, generative fill **or upscaling**." OP 12 table, "Resize for export formats": option C = "Each format needs designer-supplied media". PRD OP 12 lists "resizing for export formats" as undecided.
- **Problem:** "scaling" without a direction allows upscaling small images to fill 2480×3508 A4 or 1920×1080 slots, against a UX guarantee. Treating whole-image resize and lossy format conversion as settled pre-empts OP 12 option C.
- **Fix:** AD-5: "downscale only, never upscale"; mark resize and format conversion as OP 12-dependent; widen the OP 12 dependency row to "rendition operations (resize, conversion, crop, focal point)".

### R3 — Job lease caps generation time, against NFR4

- **Spine (AD-10):** 10-minute lease, expired lease is claimable again, `max_attempts` 3; no heartbeat or lease renewal.
- **Input:** NFR4: "Time spent waiting for the draft to generate does not count, and generation time has no limit." EXPERIENCE: "Generation time is unbounded".
- **Problem:** a generate (Opus, effort high, large PDFs) or export (Chromium, many formats) or video transcode longer than 10 minutes is re-claimed while still running: duplicate LLM spend, and after three overruns the job fails with the case back in Draft. That is a de facto time limit. AD-17's head check prevents a double write but not the duplicate work or the false failure.
- **Fix:** worker renews `locked_until` on a heartbeat while it holds the job; the lease is a crash detector, not a timeout. State that no wall-clock cap applies to `generate`.

## Medium

### R4 — Link page media is not restricted to renditions

- **Spine (AD-13):** "renders it read-only ... with media served by presigned GET". "The page offers no file download." AD-8 presigned GET is defined for originals and renditions alike.
- **Input:** EXPERIENCE: no download "so sharing a link isn't a side door around export". PRD Known risks: a forwarded link exposes client material.
- **Problem:** nothing stops the renderer from referencing `original.{ext}` (full-resolution, or a full 100 MB video, when static formats only need a poster frame). The link page would expose more source material than any export.
- **Fix:** AD-13: the shared page resolves media only through `material.getRendition` at the sizes the format needs; originals and video streams are never signed for `/s/{token}`.

### R5 — Cutover reassignment vs the append-only log and approval attribution

- **Spine:** AD-11 "`created_by` on records made by the dev profile is reassigned to a named real profile at cutover." AD-20 `case_event` rows "are append-only and are never updated." AD-19 `approve` records the approver.
- **Problem:** either reassignment rewrites `case_event.actor_id` (breaks AD-20) or it doesn't (events keep the dev actor while records say someone else). Either way, approvals and checks made by anyone holding the basic-auth credentials in Sprint 2 get attributed to one named person. NFR7 requires approval "by an owner/designer"; the 8-week hallucination measure ("reaching an approved case study") depends on knowing who approved. The Sprint 2 guardrail check can verify the NFR7 gate logic but not that the approver held the role.
- **Fix:** do not reassign `case_event`; keep the dev actor as a visible "pre-login" identity, or reassign `created_by` only and say so. Note in AD-5 that role-specific parts of NFR7 are verified only after Epic 6 (alongside NFR3).

### R6 — `accessMode` omits OP 11 option D

- **Spine (AD-13):** `accessMode` ∈ `unlisted`, `unlisted_expiring`, `login_required`. Dependency row: OP 11 changes only "default accessMode, expiry UI".
- **Input:** EXPERIENCE OP 11 option D: "A with an optional password".
- **Problem:** the data model quietly narrows OP 11 to three of four UX options.
- **Fix:** either add a `password` mode (hash column) or state the enum is open and grows with OP 11.

### R7 — Shuffle as a "seed"

- **Spine (AD-4):** per-format "layout variant and seed (shuffle)". AD-15: Shuffle uses `listVariants`.
- **Input:** EXPERIENCE: "Shuffle layout: steps to the next designed variant that fits the number of media items. It never generates a new layout." OP 12 asks whether Shuffle is altering.
- **Problem:** a seed implies randomised arrangement within a variant (slot permutation, spacing jitter), which is a layout not designed by the design team (NFR1) and goes beyond what UX allows, and pre-judges OP 12.
- **Fix:** drop `seed`; Shuffle = next entry in `listVariants` order, recorded as `variantId`. If slot reassignment is intended, say it is the person's Reorder action, not Shuffle.

### R8 — Regenerate added without UX coverage

- **Spine:** AD-3 `in_review --> generating: regenerate`; AD-17 regeneration creates a new working revision carrying only per-format choices.
- **Input:** EXPERIENCE has no Regenerate control in the configurator; "To add new material, go back to the wizard's Material step; the case study keeps its status." Nothing says a second generation is possible from To review, nor from Approved.
- **Problem:** the spine invents a flow that throws away the reviewer's text edits and block checks silently, and leaves material added to an Approved case unusable by generation (Generate is unavailable from `approved`) with no UX statement either way.
- **Fix:** flag as a new conflict for UX (A6): whether Regenerate exists, what it keeps (edits, checks), and whether an Approved case can regenerate into a staged head.

## Low-Medium / Low

- **R9 (AD-14, OP 3).** `kind ∈ tag|property|flag` as rows with key/label assumes properties are enumerated values. If OP 3 defines a property as a value (a year, a dimension, a KPI), the model won't fit. Mark the property shape as OP 3-dependent in the dependency table.
- **R10 (AD-6).** The gate counts a `text_item`. PRD Story 2.3 does say "files and text", so this is defensible, but EXPERIENCE has only a file dropzone and the gate copy says "at least one file". AD-6 claims the button "uses the same check": it won't match the UX text. Flag to UX; also consider whether an empty or whitespace text item counts.
- **R11 (AD-8).** Allowlist: JPEG, PNG, WebP, MP4, MOV, PDF, TXT, MD, DOCX. The addendum's suggested inputs include "strategic decks" (often PPTX/KEY); designers commonly upload GIF, SVG, HEIC. Only the text types are tagged `[ASSUMPTION]`; tag the whole list. Also the memlog recorded the material definition as "[inferred from user's list, to confirm]" before PRD finalisation; the PRD now states it in Terms, so the spine is fine to adopt it.
- **R12 (tags).** Rules taken from UX `[ASSUMPTION]`s without the tag: link page has no download (AD-13), carousel/image formats → ZIP of PNGs (AD-9), delete only in Draft (AD-3, AD-11). AD-3 line "Shareable links are a count on approved cases, not a status" is UX OP 8 option A stated as fact; prefix with "Interim (Option A)". `turn off link` and `case_study.locale` are tagged correctly.
- **R13 (NFR4).** Capability map says "≤ 20 min hands-on, waiting excluded". PRD NFR4 also has "target of 15" and "If the claim check (NFR2) needs more time, NFR2 wins", plus the counter-metric. The architecture honours this (no tick-all, no bulk check), but cite it so no later story optimises time at the check's expense.
- **R14 (AD-11 matrix).** `system` column shows only "export jobs"; text says it performs job events incl. renditions, and AD-10/17 have it create generate results. Align the matrix.
- **R15 (user removal).** EXPERIENCE Users: "Remove user ... Their case studies and links stay." Spine does not say removal is a soft-disable of `profile` (needed for FKs on `created_by`, `share_link.createdBy`, `case_event.actor_id`) or that a removed user's links stay live. Add one line to AD-11.

## Checked and consistent (no action)

- **Role permissions / NFR3 / Story 6.2-6.3:** matrix in code only, admin only users+roles, no permission or guardrail API; role read per request (matches UX "next page load"); last-admin guard.
- **Guardrails NFR1–NFR7 & Sprint 2 check:** AD-5 enumerates use-case checks with tests runnable pre-login; NFR3 re-checked after Epic 6 (see R5 for the NFR7 role caveat).
- **Story 4.3:** approved terminal, staged working head, Update approved version, Discard; A1 flag accurately describes the literal-reading conflict and the memlog user decision.
- **NFR6 material definition:** images, videos, texts, PDFs; form never counts; `form_field` refs are sources but not material.
- **FR2 limits:** 20 non-deleted files, 100 MB via `content-length-range`, checked at issue and confirm; per-file inline rejection compatible.
- **FR7 interim access:** `unlisted` default; A2 accurately flags the basic-auth gate before Epic 6.
- **UX decisions:** deck PDF only, no PPTX (AD-9); no hands-on time tracking (AD-20); one format per link, Turn off link, "no longer available" page; per-block manual check with `{by, at}`, cleared on edit, no bulk check, `sourceRefs` never shown as verification; canvas ratio removed; content shared / layout per format tagged as UX assumption; Italian UI.
- **Open points:** OP 1 (registry deferred; motion formats out until decided), OP 3 values, OP 8 labels, OP 11 default, OP 13 measures are deferred correctly, apart from R1 (OP 2), R2/R7 (OP 12), R6 (OP 11), R9 (OP 3), R12 (OP 8 wording).
- **A3, A4, A5:** accurate against EXPERIENCE.md and NFR5/NFR6.
