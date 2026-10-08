---
review: reconcile
target: ARCHITECTURE-SPINE.md
sources: [brief.md, addendum.md, "MAC Recap-PRD-EN v1.pdf (overridden by addendum 'Changes to PRD v1')"]
date: 2026-10-08
---

# Reconcile review: spine vs. brief, addendum, PRD v1

**Verdict:** Mostly reconciled. One high-severity gap (who may approve), plus several medium gaps that will surface as rework in Epics 3-5 or block the 8-week validation. No stylistic findings are included.

Checked and covered (no finding): unique immutable ID and MCP seam (AD-2, AD-16); upload limits 20 files / 100 MB (AD-8); tags/properties/flags (AD-14, values deferred Q2); no-material gate (AD-6); AI never alters assets/template/technical substance (AD-5, AD-6); no role incl. admin can view/change guardrails (AD-5, AD-11); approved-only export and share (AD-3, AD-13); "publish" = shareable link (AD-13); merged roles owner/designer and account/sales/social (AD-11); no auth before Sprint 3 and confidentiality risk (AD-12); async generation with notify (AD-10, notification deferred); dashboard statuses Bozza / In elaborazione / Approvato (AD-3, plus Da revisionare); configurator variants, tokens (typography, spacing), slot assignment (replace media), format list (AD-4, AD-15); export format list (deferred Q1); narrative structure and quality checklist (deferred Q3); share-link access mode (deferred Q5); attribution (deferred Q4); manual creation, no trigger (scope); NFR2 as human review (AD-6).

## Findings

### F1 (high) - "Human review belongs to whoever uploaded the visual material" is not enforced

- **Source:** addendum, "New guardrails": human review before publication is mandatory *and belongs to whoever uploaded the visual material*.
- **Spine:** AD-3 allows `approve` by any `owner_designer`; AD-11's matrix is role-only, with no ownership or uploader check. The ER seed has `PROFILE owns CASE_STUDY` but `ASSET` has no uploader, and `REVISION` records no approver.
- **Risk:** any owner/designer can approve someone else's case, which breaks a stated guardrail. Under AD-5 a guardrail is supposed to be code.
- **Fix:** add `asset.uploaded_by` and `revision.approved_by` / `approved_at`. Make `authorize(actor, 'approve', case)` require the actor to be the uploader of the case's visual assets (or define the rule for a case with several uploaders). Put the check in `guardrails.ts` / `policy.ts`, not in configuration. Before Sprint 3 the fixed dev actor makes this check trivially true, so say so explicitly.

### F2 (med) - The AD-6 gate allows generation with zero visual assets, which amounts to a text-only case study (out of scope)

- **Source:** brief scope: text-only case studies are out of the MVP (they depend on the integration, Epic 8 / FR10). FR3/FR4 are "graphic case studies" whose templates adapt to the media count.
- **Spine:** AD-6 rejects only when there are no assets *and* no text or form content, so a case with only text or form content passes the gate. AD-15's media-count range has no defined behaviour for 0 media.
- **Fix:** the gate should require at least one visual asset, or at least the template's minimum media count, and return a specific `AppError` code. Alternatively, state the 0-media behaviour explicitly as a documented decision.

### F3 (med) - Video material and video output have no architectural path

- **Source:** brief and PRD: the owner uploads "images, video and text". A3 formats include social video 1080×1920.
- **Spine:** renditions are sharp only (images). Renderers are React HTML through Chromium to PDF/PNG, with PPTX built from PNGs. Nothing says how a video asset fills a slot in a static format (poster frame? excluded?), and a video export doesn't fit AD-9's claim that a new format is just "a registry entry plus a renderer". AD-5's allowed processing (fit, crop, resize) doesn't mention frame extraction or transcoding.
- **Fix:** add a rule for video assets: an allowed deterministic poster-frame or transcode step, its tool (for example ffmpeg in the worker), and how video behaves in static formats. Flag video output as excluded from the AD-9 model until Q1 resolves, or extend AD-9 for it.

### F4 (med) - 8-week validation metrics can't be measured from the design

- **Source:** brief success criteria: average owner time per case (NFR4 is redefined as the owner's hands-on time from upload to approval), amount of manual editing after generation, and hallucinations or guardrail violations caught in review.
- **Spine:** configurator edits overwrite the in-review revision's document (AD-3, AD-4), so the original generated output is lost and the editing done after generation can't be measured. There are no timestamps or events for first upload, generation and approval. Observability is deferred "until there is real usage after the 8-week validation", which is exactly when these numbers are needed.
- **Fix:** keep the generated `CaseStudyDocument` immutable on the revision (for example `generated_document` alongside `document`). Record a small `case_event` log (created, first_upload, generate_requested, generated, approved; claims edited, deleted or flagged unsupported) with timestamps and actor. This makes time-on-task, edit volume and caught hallucinations queryable.

### F5 (med) - The unsupported-claim loophole: any edit clears the approval block

- **Source:** brief: "every claim in the text can be traced back to the uploaded material"; NFR2 hallucination check.
- **Spine:** AD-6 blocks approval while there are unsupported claims "unless the reviewer edits or deletes them". It doesn't say what happens to `sourceRefs` or `unsupported` on a human-edited claim, or whether a human can add claims with no source.
- **Fix:** define the claim provenance states (`generated`, `human_edited`, `human_added`). A human-edited or human-added claim must either keep or attach at least one `sourceRef` or carry an explicit "reviewer-asserted" mark. Approval should record that the reviewer confirmed it.

### F6 (med) - "Owner/designer maintains templates" is in tension with templates-as-code

- **Source:** brief role table (owner/designer "maintains templates"); PRD Story 6.2 "Designer: templates".
- **Spine:** AD-15 says templates change only by code change and deploy. The owner/designer can only choose a template, variant, shuffle and tokens.
- **Fix:** state explicitly that in the MVP "maintains templates" means the designer supplies the template designs and rules and a developer codes them, with no template editor in the tool. Alternatively, list it as an open question for the PRD and UX.

### F7 (low) - Configurator: shuffle layout and canvas ratio aren't modelled explicitly

- **Source:** A3 configurator: channels and formats, shuffle layout, replace media, template variants, canvas ratio, typography, spacing.
- **Spine:** AD-4 lists variants, slot assignments, the format list and tokens. Shuffle appears only in AD-15, and canvas ratio is implied by the format registry's fixed canvas sizes.
- **Fix:** say that shuffle is a deterministic re-assignment written into the slot assignments (so renderers stay pure), and that canvas ratio is chosen by choosing a registry format rather than set freely. Otherwise add a ratio field constrained by the template.

### F8 (low) - Approved case visibility while a new revision is in review, and the effect of regenerate on human edits

- **Spine:** AD-3 keeps old approved revisions valid. But case-level `status` moves to `in_review`, and AD-11 lists only "approved" cases for account/sales/social. It isn't defined whether the case stays listed and exportable from its last approved revision. `in_review → generating` (regenerate) doesn't say whether configurator edits are discarded or kept.
- **Fix:** list cases that have an approved revision, regardless of their current status, and export from `latestApprovedRevisionId`. Define regenerate as creating a new revision while keeping the edited one.

### F9 (low) - The narrative must cover both the technical and the graphic side

- **Source:** brief demo criterion and the 0% baseline.
- **Spine:** the `CaseStudyDocument` narrative blocks (challenge, approach, result) have no technical/graphic dimension. Q3 defers the quality checklist, but the document schema is architecture.
- **Fix:** add a `facet` (technical | graphic) to claims, or a coverage check in the quality checklist that the schema can support. Otherwise note explicitly that this is deferred to Q3.

### F10 (low) - Allowed file types aren't specified

- **Source:** brief and PRD: images, video, text. PRD Epic 2 prerequisite: template wireframes (asset dimensions, formats).
- **Spine:** AD-8 enforces count and size but no MIME or extension allowlist.
- **Fix:** add a server-checked MIME allowlist next to the limits in AD-8.
