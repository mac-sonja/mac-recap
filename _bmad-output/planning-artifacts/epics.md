---
status: final
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/specs/spec-mac-recap/SPEC.md
  - _bmad-output/specs/spec-mac-recap/delivery-plan.md
  - _bmad-output/specs/spec-mac-recap/success-metrics.md
  - _bmad-output/specs/spec-mac-recap/ui-flows.md
  - '_bmad-output/planning-artifacts/prds/prd-MAC Recap-2026-10-08/prd.md'
  - '_bmad-output/planning-artifacts/architecture/architecture-MAC Recap-2026-10-08/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/EXPERIENCE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/DESIGN.md'
---

# MAC Recap - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for MAC Recap, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

Scope: the standalone MVP, Epics 2–6, keeping PRD v2 numbering (Epic 1 is team setup, not product scope; Epics 7–8 are post-MVP). SPEC.md and its companions are the canonical contract; the PRD is cited for numbering and traceability.

**This breakdown does not decide any PRD open point (OP) or flagged conflict (A1–A5, C3, C4).** Stories are written against the interim rules in the *Interim Rules Register* below. Every story that depends on one is marked `⚑ Interim: IR-…`. Where no interim rule exists, the story is marked `⛔ Blocked on: …`, which means it can be built up to that point but can't be closed until the decision lands.

## Requirements Inventory

### Functional Requirements

FR1: The owner/designer creates a case study by hand, and the system gives it a unique, permanent ID (a database-generated uuid that is never changed or reused). The ID is the only identifier exposed to other systems and is ready for the later project-order link. There is no trigger at project close. (CAP-1, Story 2.2)
FR2: The owner/designer uploads material (images, videos, texts, PDFs; pasted text also counts) to a case study. The limit is 20 files of at most 100 MB each, of an allowlisted type. A file over the limits, or of a type not on the allowlist, is rejected without blocking the others. Each deliverable gets tags, properties and flags from a fixed list. The owner/designer also fills in an optional details form (context, solution, results), which is saved, can be cited as a claim source, and never counts as material. (CAP-2, CAP-3, Stories 2.3–2.4)
FR3: The system generates a graphic case study in the background by applying MAC templates to the uploaded material. The case shows "In elaborazione" until the draft is ready; a failure returns it to Bozza with material and details intact. The narrative follows challenge, approach and result (always present, can't be removed or reordered), covers the technical and the graphic side, and uses only the uploaded material and form answers. Template design and assets stay unchanged. Generation is refused when there is no material, even with the form filled in. Layouts are produced for every MVP export format. (CAP-4, CAP-5, Story 3.1)
FR4: Templates adapt their layout to the number of available media items, using the template's own media-count rules (slot mapping per count). (CAP-4, Story 3.2)
FR5: The owner/designer reviews and edits case studies through the review dashboard (every case with its status, a To review queue oldest first, delete only in Bozza) and the configurator (generated text in place, layout variant, shuffle, spacing, media replace / reorder / remove, font pairing and text scale per format). Layout, spacing and typography accept only template-defined values; media come only from this case's material; the preview matches the exported files exactly; there is no canvas-ratio control. (CAP-6, CAP-7, Stories 4.1–4.2)
FR6: Any owner/designer approves a case study after manually checking every text block against the material and form answers. Approve stays disabled until every block has a current manual check, no block overflows in any format, and no referenced material is deleted. There is no bulk check or bulk approve. Approval makes the case available for export and sharing. Editing an approved case keeps it approved. (CAP-8, Story 4.3)
FR7: Owner/designer and account/sales/social users export an approved case study in each MVP format (at least a 16:9 deck as PDF, a social carousel and an A4 PDF), and publish it as a shareable link to a hosted presentation. Each link shows one format of the current approved version, never a working copy, and offers no file download. The share dialog says who can open the link. A link can be turned off; a turned-off or expired link shows "no longer available". Account/sales/social users see approved case studies only; unapproved content has no view, export or share entry point. The tool does not post to social channels or the website. (CAP-9, CAP-10, Stories 5.1–5.2)
FR8: Users sign in with one of three fixed roles (owner/designer, account/sales/social, admin). The admin adds and removes users and assigns their role, and nothing else: no case content, no permission settings, no guardrail settings. The last admin can't drop their own admin role. Every action follows the AD-11 permission matrix. Delivered in Sprint 3. (CAP-11, Stories 6.1–6.2)
CAP-12 (SPEC; no PRD FR number): every transition, upload, save, block check, claim edit, approval, export and link change is an append-only, timestamped event with its actor, and the generated draft is kept next to the approved version. The tool does not record hands-on time. Built by each epic as it goes, not as an epic of its own.

Out of MVP scope (listed for traceability only): FR9 MAC Productive via MCP (Epic 7), FR10 text-based case studies and whitepapers (Epic 8).

### NonFunctional Requirements

NFR1 (guardrail): The AI never alters graphic assets, the technical substance of the content, or template design. Where adaptation, shuffle and resize stand is OP 12.
NFR2 (guardrail): A person checks every generated claim against the uploaded material or form answers during review, before approval. Manual, not automated; no confidence scores or "AI verified" labels.
NFR3 (guardrail): No role can view or change the guardrails, admin included. There is no setting anywhere that disables or changes NFR1–NFR7.
NFR4: Owner/designer hands-on time from upload to approval is at most 20 minutes, target 15. If the claim check needs more time, NFR2 wins. Waiting for generation doesn't count; generation time has no limit. Counter-metric: time must not fall by shortening the review.
NFR5: The narrative follows challenge, approach and result, meets the Sprint 2 quality checklist, and covers both the technical and the graphic side.
NFR6 (guardrail): With no material, nothing is generated. The details form alone is not enough.
NFR7 (guardrail): Nothing is exported or shared before review and approval by an owner/designer.
NFR8 (constraint): Data lives in Supabase and files in a private AWS S3 bucket, both in the EU. Standalone from MAC Productive.
NFR9 (constraint): Until login ships in Sprint 3, every deployed environment, shareable links included, is gated (AD-12), because real client material is in use.
NFR10 (constraint): Epics run one after another, never in parallel. Sprints due Oct 14, 21, 28; demo Oct 30, 2026.
NFR11 (accessibility): WCAG 2.2 AA for the app and the shared link page.
NFR12 (platform): Desktop web, primary 1440 px, minimum 1280 px; only the shared link page is fully responsive.
NFR13 (language): UI in Italian through one dictionary file; each case's narrative in Italian or English, default Italian.

### Additional Requirements

From the architecture spine (AD-1 to AD-20 are binding):

- **Starter template (Epic 2, first story):** `npx create-next-app -e with-supabase`. The first story pins every Stack version exactly (Node 24 LTS, TypeScript 6.0.3, Next.js 16.3.8 with `output: standalone`, React 19.3.0, Tailwind 4.3.3 / shadcn 4.21.4, supabase-js 2.117.3 / ssr 0.12.7 / CLI 2.120.0, AWS SDK 3.1147.0, `@anthropic-ai/sdk` 0.132.1, zod 4.6.5, Playwright 1.63.0, sharp 0.35.5, ffmpeg pinned in the Dockerfile), upgrades Tailwind to 4, and turns `cacheComponents` off.
- AR1 (AD-1): Modular monolith with modules `case-study`, `material`, `generation`, `rendering`, `sharing`, `access`, `jobs`; each with `domain/`, `application/`, `index.ts`, plus `ports/` and `adapters/` only at vendor seams. Cross-module imports only through `index.ts`; vendor SDKs only in adapters. Table and S3-prefix ownership per AD-1. Enforced by a lint rule.
- AR2 (AD-2): `case_study.id` is a DB-generated uuid, immutable, never reused; `project_order_ref` nullable and unset in the MVP.
- AR3 (AD-3): `case_study.status` changes only through `case-study.transition`. Revisions have `working | approved | superseded`. `head_revision_id` and `approved_revision_id` pointers; `getLiveRevision` and `getEditableRevision` reads. Generation only from `draft`; delete only in `draft`, soft (`deleted_at`).
- AR4 (AD-4): `CaseStudyDocument` (zod, jsonb) stored twice per revision, `generated_doc` (immutable) and `doc` (editable). Shared part (template@version, blocks with stable `blockId`, claims and check state, media set) and per-format part (variant, slot assignments, spacing, text scale, font pairing). No canvas ratio. Schema rejects a missing challenge/approach/result. `rendering.relayout` is the only slot-assignment code. `schemaVersion` + `upgrade(doc)` on read. `FORMAT_NOT_IN_REVISION`.
- AR5 (AD-5): Guardrails are code (`generation/domain/guardrails.ts`, `access/domain/policy.ts`, `case-study` preconditions), never DB/env/UI. Each guardrail is enforced in a use case and covered by an automated test, so the end-of-Sprint-2 guardrail check runs on the pre-login build.
- AR6 (AD-6): `generate` fails with `NO_MATERIAL` before any LLM call unless there's at least one non-deleted asset or non-empty text item; the same check backs the Generate button and the worker's claim. Claims tagged `aspect: technical | graphic`; a draft missing one is `MISSING_ASPECT`.
- AR7 (AD-7): One `NarrativeGenerator` port, worker only. Adapter uses `client.beta.messages.parse` with the zod schema, model `claude-opus-5-5` from one constant, adaptive thinking, `effort: "high"`, server-side refusal fallbacks; `refusal` → `LLM_REFUSAL`. Versioned prompt files. Each revision records `response.model`, `fellBack`, `promptVersion`, `schemaVersion`.
- AR8 (AD-8): Private EU S3 bucket, Block Public Access, versioning, CORS for app origin only. Browser uploads via presigned POST (`content-length-range` 100 MB, allowlisted Content-Type), `requestChecksumCalculation: "WHEN_REQUIRED"`. Asset row only after a HEAD check. 20-file cap checked on issue and confirm. Presigned GET ≤ 15 min. Fixed key layout. No Supabase Storage.
- AR9 (AD-9): A format registry (`rendering/domain/formats.ts`) and one React renderer per format, used by the configurator, case study view, `/s/{token}` and exports. Exports: `renderToStaticMarkup` + Playwright `page.setContent`, no print route. Deck and A4 → PDF; image formats → ZIP of PNGs; Export all → one ZIP. Video shows its poster frame in static formats. `export` unique and immutable on `(revision_id, format)`; `ensureExport` is idempotent.
- AR10 (AD-10): Postgres job table (`generate`, `export`, `rendition`), idempotent enqueue via partial unique index, `jobs_claim()` with `FOR UPDATE SKIP LOCKED`, 10-min lease renewed every minute, max 3 attempts then `failed` + `job_failed`. Web requests never call the LLM, Chromium or ffmpeg.
- AR11 (AD-11): Every action and route calls `access.getActor()` + `access.authorize()`. Permission matrix lives only in `policy.ts`. Role read from `profile` on every request. A `system` actor for the worker. Server-only data access with the service-role key; RLS denies `anon` and `authenticated`. A seeded dev `owner_designer` until Epic 6, disabled at cutover and never reassigned.
- AR12 (AD-12): HTTP basic auth in `proxy.ts` on every deployed environment until Epic 6, including `/s/{token}`. Forward-only SQL migrations applied staging → prod before the image.
- AR13 (AD-13): `share_link` (token ≥ 128 bits URL-safe, caseId, format, createdBy/At, expiresAt, revokedAt, accessMode enum). `/s/{token}` resolves via `getLiveRevision` at request time, read-only, display renditions only, no download.
- AR14 (AD-14): Taxonomy is `taxonomy_term` rows (kind tag|property|flag, stable key, label) seeded by migration; `material_term` links; code refers to keys only.
- AR15 (AD-15): Templates are versioned code folders `rendering/templates/{templateId}/v{n}/` (variants, slots, media-count rules, allowed values, one renderer per format); a published version is never edited. `rendering.listVariants(templateId, format, mediaCount)` is the only variant source.
- AR16 (AD-16): No MVP code calls MAC Productive.
- AR17 (AD-17): Compare-and-set on `revision.version` (`STALE_REVISION`) and `case_study.head_version` (`STALE_HEAD`); no edits while `generating`; only `working` revisions writable (`REVISION_NOT_WRITABLE`); explicit idempotent `forkHead`; generate results create a new revision, discarded on head mismatch.
- AR18 (AD-18): `MaterialRef { asset | text | form_field, id }` resolved only via `material.resolveRefs`. Generate jobs carry a material manifest (refs + hashes) stored on the revision. Referenced material is soft-deleted only; `approve` fails with `MATERIAL_MISSING`. Upload/tag never change case status. Anthropic limits (32 MB request, 600-page PDF, no DOCX, no video); Files API not used.
- AR19 (AD-19): Per-block `check: { by, at, textHash } | null`, set only by a person, no bulk check. A check counts only while `textHash` matches. `approve(caseId, revisionId, expectedRevisionVersion, expectedHeadVersion)` checks every block on the server and requires an overflow-free result per format from the client. Claims carry `provenance` and optional validated `sourceRefs`, never shown as "verified".
- AR20 (AD-20): `case_event` append-only rows (`case_id`, `revision_id`, `actor_id`, `type`, `at`, `data`) on every transition, upload confirmation, save, block check/uncheck, claim edit, approval, export, link create and turn-off.
- AR21 (conventions): snake_case singular tables; uuid ids; `timestamptz` UTC, displayed Europe/Rome; zod in `domain/` as single definition; generated DB types; `Result<T, AppError>` with SCREAMING_SNAKE codes; structured JSON logs with no material or prompts; env read only in `src/shared/env.ts`; `case_study.locale` it|en default it.
- AR22 (deployment): One Docker image on the Playwright base, two processes (`node server.js`, `node dist/worker.js`). Environments `local`, `staging` (demo, gated), `prod` (from Epic 6), each with its own Supabase project and bucket. EU container host chosen by end of Sprint 1.

### UX Design Requirements

UX-DR1: Navigation shell. Left sidebar with + New case study (owner/designer), Case studies, To review with count (owner/designer), Templates (owner/designer, scope per C4), Users (admin), user menu with sign-out. Wizard and configurator are full-screen with a back arrow and no sidebar. Dialogs stack at most one level deep.
UX-DR2: Role-based absence. A control a role can't use is absent, not disabled. Guardrail controls are shown disabled with their reason. A direct URL to a surface the role can't use returns to the role's landing page (owner/designer: Case studies table; account/sales/social: library; admin: Users).
UX-DR3: Status badge. Always colour plus text label, using tokens `status-draft`, `status-generating`, `status-review`, `status-approved`. Labels from the OP 8 interim (Bozza, In elaborazione, Da approvare, Approvato).
UX-DR4: Owner/designer Case studies table. Columns ID (monospace), Name, Client, Year, Status, Updated, Links (count, Approvato only). Search "Search name, client or ID", ~250 ms debounce, case- and accent-insensitive over name, client, ID. Status segmented filter with per-segment counts, combined with search (AND). Default sort Updated newest; header click sorts. Row click by status (Bozza → wizard at first incomplete step; In elaborazione → no-op with "Still generating" tooltip; Da approvare → configurator; Approvato → configurator plus View). Overflow menu: View, Export, Share (Approvato), Delete (Bozza, with confirm). Rows in In elaborazione update without reload. Empty and no-results states with their copy.
UX-DR5: To review queue. The table pre-filtered to Da approvare, oldest first; sidebar count; no assignment or claiming; empty copy "Nothing to review."
UX-DR6: Library view. Card grid (cover = first slide of the 16:9 deck, name, client, year, up to three tags); approved only; no status filter or badge; same search; facets Client, Year and tags as multi-select chips with active filters and Clear all; newest approved first; paginates at 24, no infinite scroll; empty copy "No approved case studies yet."; owner/designer Table / Library toggle.
UX-DR7: Wizard step 0. Name (required) and client (required), year defaulting to the current year. The case is created and its ID shown in the header; saved as Bozza from that moment; leaving and returning loses nothing.
UX-DR8: Wizard step 1 Material. Dropzone plus browse button; copy "Up to 20 files, 100 MB each."; per-file inline rejections ("Over 100 MB. Not uploaded." / unsupported-type copy / 21st file) that don't block others; parallel uploads with per-file progress, announced to screen readers; deliverable rows (thumbnail, name, size, tag/property/flag chip pickers from a fixed list, no free text, "untagged" marker; tagging optional); remove with 5 s Undo toast; Next: Details enabled once one file has uploaded.
UX-DR9: Wizard step 2 Details. Context, Solution, Results textareas with one-line prompts, a "{n} of 3" counter, all optional.
UX-DR10: Wizard step 3 Generate. Summary "{n} files, {m} of 3 details filled."; Generate disabled without material, with the visible reason linked via `aria-describedby`; processing state with leave-page copy and Back to case studies; no ETA or percentage; failure banner "Generation didn't finish. Your material and details are saved." with Try again.
UX-DR11: Draft-ready toast anywhere in the app: "{Name} is ready to review." with Open (C3).
UX-DR12: Configurator frame. Top bar (back, name, status badge, save state, Approve or Update approved version); left Formats pane (one entry per registry format: name, ratio, pixel size, looked-at check mark); centre canvas at fit-to-pane zoom with page strip for multi-page formats; right pane Edit and Check tabs. Below 1024 px: "The configurator needs a larger screen."
UX-DR13: Configurator text editing. Click to edit in place, Esc or click outside to finish, autosave. Plain text and line breaks only. Section headings can be reworded, sections can't be deleted or reordered. Overflow marker; no silent shrink below template minimum. Edited blocks are marked "edited" and need re-checking.
UX-DR14: Configurator layout. Variant thumbnail grid from the template's designed variants for the format; Shuffle layout steps to the next designed variant that fits the media count, with undo; spacing sliders bounded by template range; Reset to generated default per format.
UX-DR15: Configurator media. Replace from this case's own material only (no upload, stock or generated images); drag to swap slots with a keyboard/menu alternative; remove from layout re-adapts to the new count; media placed whole (fit, no stretching); no crop, recolour, filter or effect controls.
UX-DR16: Configurator typography. Font pairing from the template's list; text scale S / M / L per format; no per-word or per-block styling.
UX-DR17: Check tab. Every block listed by section (challenge, approach, result, headline, KPI tiles) with "Checked against material"; selection synced between list and canvas; material drawer showing files (image, PDF, text viewer; video player) and details answers beside the canvas; editing a block unticks it; Approve disabled with "{n} blocks still to check" (reason via `aria-describedby`, counter `aria-live="polite"`); overflowing blocks listed; no tick-all.
UX-DR18: Approve confirm dialog with the specified copy; on confirm, status Approvato, toast "Approved. It's now in the library.", navigate to To review if items are waiting, otherwise Case studies.
UX-DR19: Editing an approved case. Banner "Approved, with {n} live links. Changes go live when you update the approved version."; edits autosave to a working copy; edited blocks unticked; Update approved version enabled when every edited block is ticked again; confirm "{n} links will show the new version."; Discard changes.
UX-DR20: Autosave state. "Saved" / "Saving…" / "Not saved. Retrying…"; after 3 failures a banner "Changes aren't saving. Keep this tab open." No Save draft button, no version history.
UX-DR21: Case study view. Top bar Back, name, badge, Share, Export (+ Edit for owner/designer); format list matching the configurator; pager ("Slide 1 of 12"), zoom − / 100% / +, fit, full screen; Export selected format with progress and browser download; Export all as one ZIP; "Export didn't finish." toast with Try again; format list becomes a dropdown at 1024–1279 px.
UX-DR22: Share dialog. Choose a format (default 16:9 deck); link auto-copied with "Link copied" toast; plain "who can open it" sentence above the link; link list with format, created by, created on, Copy, Turn off link (with confirm).
UX-DR23: Shared link page. Full-screen presentation of one format, pager, arrow keys, full screen; no app chrome, no sign-in prompt under the interim mode, no download; fully responsive with swipe on phones; slide text available to screen readers; turned-off or expired copy "This case study is no longer available. Contact the person who shared it."
UX-DR24: Users (admin). List (name, email, role, added on); Add user (email + one role); role dropdown per row, effective at the user's next page load; Remove user with confirm (their cases and links stay); last-admin guard; no permission matrix, guardrail settings or case access.
UX-DR25: Sign in. One screen, no self-sign-up.
UX-DR26: Keyboard. Every action keyboard-reachable; configurator shortcuts Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z, Esc, `[` `]` pages, `J` `K` blocks, Space ticks the selected block; `/` focuses search on Case studies; every drag has a keyboard or menu alternative.
UX-DR27: Accessibility floor. Visible focus (`focus-ring`) on every control; dialogs trap and return focus; canvas blocks reachable by Tab in reading order; Check list keyboard-operable; reduced motion respected (no animated slide or variant transitions).
UX-DR28: Confirm dialogs only for Approve, Update approved version, Delete, Remove user, Turn off link; everything else undoable. Banned anywhere: approve all, tick all, bulk approve, auto-approve, any guardrail control, posting to social channels, infinite scroll.
UX-DR29: Copy and voice. All UI copy in Italian through one dictionary file (English lines in the spec are the source for the Italian microcopy); plain verbs, no hype, no exclamation marks; generated text is never described as "verified".
UX-DR30: Responsive rules. Case studies / Users / Templates: sidebar collapses to icons at 1024–1279 px, read-only usable list below 1024 px. First load shows skeleton rows or cards.
UX-DR31: Design tokens (DESIGN.md). Implement the fixed token names (colours, typography roles incl. mono, rounded, components button-primary, status-badge, focus-indicator) as theme variables with placeholder values, so values can be filled later without code changes. Tool chrome tokens never style template output.
UX-DR32: Templates surface (conditional on C4). Browse templates and their variants per format with sample content; turn variants on and off (at least one per format stays on); see usage counts.
UX-DR33: `MISSING_ASPECT` warning shown in the configurator (spine AD-6; placement and blocking are conflict A3).

### Interim Rules Register

These are the rules the stories are built against. None of them is a decision; each one is replaced when its owner decides. A story marked `⚑ Interim: IR-x` has to be revisited when IR-x changes.

| ID | Open point / conflict | Owner | Interim rule used by the stories | Source |
| --- | --- | --- | --- | --- |
| IR-OP1 | OP 1 export formats | PRD owner | Format registry holds UX Option A only: Deck 16:9 (1920×1080, PDF), Social carousel 4:5 (1080×1350, ZIP of PNGs), PDF A4 portrait (PDF). Adding formats means adding registry entries and template renderers. | SPEC CAP-9, ui-flows, AD-9 |
| IR-OP2 | OP 2 data processing logic | PRD owner | **No interim rule.** Stable regardless: the `NarrativeGenerator` port, `MaterialRef`s and the manifest shape (AD-18). Which material types the LLM reads, and how each is turned into input, is open. | AD-7, AD-18 |
| IR-OP3 | OP 3 taxonomy values (due Oct 14) | PRD owner | Term table, key-only references and chip pickers are built; the seed values arrive by migration once OP 3 is decided. Until then, facets and tag search show only the terms seeded. | AD-14, EXPERIENCE |
| IR-OP4 | OP 4 account/sales/social browsing | PRD owner | UX proposal: card library with search, Client / Year / tag facets, paginated at 24, approved only. | EXPERIENCE (library view) |
| IR-OP8 | OP 8 status lifecycle | PRD owner | Option A: `draft` Bozza → `generating` In elaborazione → `in_review` Da approvare → `approved` Approvato. Links are a count, not a status. No path back from Approvato. | AD-3, EXPERIENCE |
| IR-OP11 | OP 11 link access | PRD owner | `accessMode = unlisted` (anyone with the link), with `expiresAt` present but unused in the UI. Share dialog says "Anyone with the link can view." Combined with IR-A2 until Epic 6. | AD-13, FR7 |
| IR-OP12 | OP 12 what counts as altering | Design team | Renditions only downscale whole images (no upscaling, crop, recolour or filter) and make video poster frames/transcodes. Media are placed whole (fit). No crop or focal point. Media-count adaptation and Shuffle pick only among designed variants. | AD-5, AD-15, EXPERIENCE |
| IR-OP13 | OP 13 recording the measures | PRD owner | The tool records no hands-on time and has no timer UI; it keeps the append-only `case_event` log and `generated_doc` next to the approved `doc`. | AD-20, UX Q3 |
| IR-NFR5 | NFR5 quality checklist (Sprint 2 deliverable) | Non-dev, Sprint 2 | **No interim rule.** The schema enforces challenge / approach / result and both aspects are tagged; the checklist content for prompts is open. | SPEC Open Questions |
| IR-HOST | Container host | Team, end of Sprint 1 | **No interim rule.** Any EU host that runs one image with two processes. | Spine Deferred, AR22 |
| IR-A1 | A1 / C1 live edits vs claim check | PRD owner | Edits to an approved case are staged on a working head; links keep serving the approved revision until an owner/designer re-checks the edited blocks and runs **Update approved version**. **Discard changes** returns to the live version. | AD-3, AD-19, EXPERIENCE |
| IR-A2 | A2 links before login | PRD owner | `/s/{token}` stays behind the AD-12 basic-auth gate until Epic 6; after Epic 6 it is the only unauthenticated route. | AD-12 |
| IR-A3 | A3 `MISSING_ASPECT` | UX | Detected and shown as a warning in the configurator; it does not block approval. | AD-6 |
| IR-A4 | A4 zero images or videos | Design team | **No interim rule.** Generation is allowed from texts or PDFs alone (NFR6 is satisfied); what the template renders for zero media is not yet supplied. | AD-6 |
| IR-A5 | A5 concurrent editing | UX | The server rejects a stale write with `STALE_REVISION` / `STALE_HEAD`; the client doesn't retry and reloads the revision. No dedicated "someone else changed this" state is designed. | AD-17 |
| IR-C3 | C3 autosave and toast not in any FR | PRD owner | Built as UX describes: autosave with save states, and an in-app polled toast when a draft is ready. No email or Slack. | EXPERIENCE, AD Deferred |
| IR-C4 | C4 template maintenance | PRD owner | `manage templates` exists in the policy matrix, but the Templates surface and the `template_variant_state` table are **not built** unless the PRD owner adopts the UX scope. | AD-15, AD-11 |
| IR-PERM | Turn off any link | PRD owner (assumption) | Anyone who can share can turn off any link. | AD-11 `[ASSUMPTION]`, SPEC Assumptions |

### FR Coverage Map

| Requirement | Epic | What it covers |
| --- | --- | --- |
| FR1 | Epic 2 | Manual creation with a permanent uuid |
| FR2 | Epic 2 | Upload (20 × 100 MB, allowlist), pasted text, tags / properties / flags, details form |
| FR3 | Epic 3 | Background generation, narrative from material only, NFR6 gate, layouts per format |
| FR4 | Epic 3 | Media-count rules (re-applied when the media set changes in the Epic 4 configurator) |
| FR5 | Epic 4 | Review dashboard, To review queue, configurator editing |
| FR6 | Epic 4 | Manual per-block check, approval, approved-case editing |
| FR7 | Epic 5 | Library, export, shareable links, turning links off |
| FR8 | Epic 6 | Login, fixed roles, user admin |
| CAP-12 | Epics 2–5 | Each epic emits its own `case_event` rows (AR20) |
| NFR1, NFR6 | Epic 3 | Guardrails enforced in use cases, each with an automated test |
| NFR2 | Epic 4 | Manual claim check |
| NFR3 | Epic 6 | No guardrail setting for any role, checked again after login |
| NFR4 | Epics 3–4 | Async generation keeps waiting off the clock; no bulk shortcuts |
| NFR5 | Epic 3 | Narrative structure and both aspects |
| NFR7 | Epics 4–5 | Approval gate (Epic 4); export and share gates (Epic 5) |
| FR9, FR10 | — | Post-MVP (Epics 7–8), not in this breakdown |

## Epic List

Epic numbering follows PRD v2 (Epic 1 is team setup, not product scope). Epics run strictly in order, never in parallel.

### Epic 2: Create a case study and collect its material (Sprint 1, due 2026-10-14)
The owner/designer creates a case study by hand, gets its permanent ID, uploads files and pasted text, tags each deliverable and fills in the details form, all saved in Supabase and S3 inside a gated environment. Also lays the foundation later epics build on: starter scaffold, module skeleton, actor and policy seam with a dev actor, basic-auth gate, event log, app shell, design tokens and a basic Case studies table.
**FRs covered:** FR1, FR2, CAP-12

### Epic 3: Generate a graphic case study from the material (Sprint 2, due 2026-10-21)
The owner/designer presses Generate and can leave. The worker produces a draft from MAC templates: a challenge / approach / result narrative built only from this case's material and form answers, laid out for every MVP format and adapted to the media count. The case lands in To review with a toast.
**FRs covered:** FR3, FR4, NFR1, NFR5, NFR6, CAP-12

### Epic 4: Review, edit and approve a case study (Sprint 2)
The owner/designer works the To review queue, refines the draft in the configurator, checks every block against the material and approves; later edits to an approved case go live only through Update approved version.
**FRs covered:** FR5, FR6, NFR2, NFR7 (approval), CAP-12

### Epic 5: Find, export and share approved case studies (Sprint 2)
Users find approved cases in the library, preview every format, export files and publish shareable links that always show the live approved version and can be turned off.
**FRs covered:** FR7, NFR7 (export and share), CAP-12

### Epic 6: Sign in, users and fixed permissions (Sprint 3, due 2026-10-28)
Each user signs in with one of three fixed roles; the admin manages users and roles only; no role sees or changes a guardrail. The pre-login gate is replaced and `/s/{token}` becomes the only unauthenticated route.
**FRs covered:** FR8, NFR3

## Story conventions

- `Covers:` lists the requirements a story implements. `⚑ Interim: IR-x` means the story is built on that interim rule and is revisited when it changes. `⛔ Blocked on: IR-x` means no interim rule exists: the story is built up to that point but can't close until the decision lands. `UX gap:` marks behaviour the sources require but EXPERIENCE.md doesn't design; the story uses the smallest placement consistent with EXPERIENCE.md and flags it for UX.
- Every story that adds a server action or route calls `access.getActor()` and `access.authorize()` first (AR11), returns `Result<T, AppError>` (AR21), uses Italian copy from the dictionary (UX-DR29), and emits the `case_event` rows its mutations require (AR20). These are not repeated in each story's criteria.
- NFR10 (sequential epics, sprint dates) is met by the epic order itself: stories within an epic depend only on earlier stories and earlier epics, never later ones.
- Tables and S3 prefixes are created by the first story that needs them, through a forward-only migration (AR12).

## Epic 2: Create a case study and collect its material

The owner/designer creates a case study by hand, gets its permanent ID, uploads files and pasted text, tags each deliverable and fills in the details form, all saved in Supabase and S3 inside a gated environment. The epic also lays the foundation the later epics build on.

### Story 2.1: Scaffold the app from the starter and pin the stack

As the team,
I want the app scaffolded from the architecture's starter with every version pinned and the module boundaries enforced,
So that every later story builds on the same stack and can't leak vendor code or cross-module imports.

Covers: Starter template, AR1, AR16, AR21, Stack table

**Acceptance Criteria:**

**Given** an empty repository
**When** the app is created with `npx create-next-app -e with-supabase`
**Then** `package.json` pins every Stack version exactly (no `^`, `~` or `latest`): Next.js 16.3.8, React and react-dom 19.3.0, TypeScript 6.0.3, Tailwind CSS 4.3.3, shadcn 4.21.4, `@supabase/supabase-js` 2.117.3, `@supabase/ssr` 0.12.7, Supabase CLI 2.120.0, `@aws-sdk/client-s3` / `s3-presigned-post` / `s3-request-presigner` 3.1147.0, `@anthropic-ai/sdk` 0.132.1, zod 4.6.5, Playwright 1.63.0, sharp 0.35.5
**And** `.nvmrc` / `engines` require Node 24 LTS
**And** Tailwind is upgraded from the starter's 3.4 to 4.3.3, `cacheComponents` is off and `output: 'standalone'` is set in `next.config`

**Given** the scaffolded app
**When** I inspect `src/`
**Then** it contains `app/`, `worker/`, `shared/` and `modules/{case-study,material,generation,rendering,sharing,access,jobs}/` each with `domain/`, `application/` and `index.ts`
**And** `src/shared/` holds `env.ts` (zod-validated env, the only place `process.env` is read), `result.ts` (`Result<T, AppError>` with SCREAMING_SNAKE codes) and a structured JSON stdout logger that accepts `caseId`, `jobId`, `actorId`

**Given** the lint configuration
**When** code in `src/app` or `src/worker` imports anything in a module other than its `index.ts`, or code outside `adapters/` imports a vendor SDK (`@supabase/*`, `@aws-sdk/*`, `@anthropic-ai/sdk`, `playwright`, `sharp`), or `domain/` imports anything outside `src/shared`
**Then** `npm run lint` fails naming the rule
**And** no `integration` module and no MCP client dependency exists, and the lint rule reserves `src/modules/integration` for Epic 7

**Given** a local machine with Docker
**When** I run the documented setup
**Then** the Supabase CLI local stack starts, `npm run db:types` writes `src/shared/db.types.ts`, and `npm run lint`, `npm run typecheck` and `npm test` all pass in CI

### Story 2.2: One gated image, deployable to staging

As the team,
I want one container image running the web and worker processes behind HTTP basic auth, with forward-only migrations,
So that real client material can be used in staging without being reachable on an open URL.

Covers: AR12, AR22, NFR8, NFR9
⚑ Interim: IR-A2 (the gate also covers `/s/{token}`)
⛔ Blocked on: IR-HOST (only the "deployed to staging" criterion; everything else closes without it)

**Acceptance Criteria:**

**Given** the repository
**When** the Dockerfile is built
**Then** it uses `mcr.microsoft.com/playwright:v1.63.0-noble`, installs an explicitly pinned ffmpeg, and produces one image with two start commands: `node server.js` (Next standalone) and `node dist/worker.js` (a bundled worker entry that, for now, starts, logs readiness and idles)

**Given** a deployed environment with `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` set
**When** any request without valid credentials reaches the app, including any path under `/s/`
**Then** `proxy.ts` returns 401 with a basic-auth challenge and no app content
**And** the credentials are read only through `src/shared/env.ts` and never carry the `NEXT_PUBLIC_` prefix

**Given** a deployed environment where the basic-auth variables are missing
**When** the web process starts
**Then** it refuses to start (env validation fails), so a deployment can't run ungated by mistake

**Given** SQL files in `supabase/migrations/`
**When** the documented deploy runs
**Then** migrations are applied with `supabase db push` to staging before the new image is started, and the docs state that migrations are forward-only and applied to prod only after staging

**Given** the chosen EU container host (IR-HOST)
**When** the image is deployed to staging
**Then** both processes run, staging has its own Supabase project and its own private EU bucket, and the app responds only behind the basic-auth gate

### Story 2.3: Actor and policy seam with a dev owner/designer

As the team,
I want every server action to resolve an actor and pass one fixed policy before doing anything,
So that Epic 6 only swaps how the actor is resolved and no endpoint built before login needs changing.

Covers: AR11, AR5 (permissions half), NFR3, CAP-11 (policy only)
⚑ Interim: IR-PERM (any sharer turns off any link), IR-C4 (`manage templates` exists in the matrix but no surface uses it)

**Acceptance Criteria:**

**Given** the `access` module
**When** the migration for this story runs
**Then** a `profile` table exists (uuid id, email, display name, `role` ∈ owner_designer | account_sales_social | admin | system, `created_at`, `disabled_at` nullable)
**And** it seeds one `system` profile and one dev `owner_designer` profile
**And** RLS is enabled on `profile` with no policy granting `anon` or `authenticated` any access

**Given** `access/domain/policy.ts`
**When** I read it
**Then** it holds the complete AD-11 matrix as code for every action (list cases, create/upload/tag/fill details/generate/edit, delete draft case, approve/update approved version/discard, view/export, job work, create link, turn off link, manage templates, manage users and roles, change permissions or guardrails)
**And** "change permissions or guardrails" is denied to every role, admin and system included
**And** there is no table, environment variable or API that changes the matrix
**And** a unit test asserts every cell of the matrix

**Given** any request before Epic 6
**When** a server action calls `access.getActor()`
**Then** it returns the dev `owner_designer` profile, read from `profile` on each request rather than from a cached claim

**Given** a server action or route handler
**When** `access.authorize(actor, action, resource)` denies the action
**Then** the use case is never called and the handler returns `{ error: { code: 'FORBIDDEN' } }` with HTTP 403
**And** a test helper lets later stories assert that every new action is authorized (a lint or test check fails for an action that skips `authorize`)

**Given** the Supabase secret (service-role) key
**When** I search the code
**Then** only `src/shared/env.ts` and `adapters/` read it, and no browser bundle contains it or any direct Supabase table query

### Story 2.4: App shell — navigation, tokens, Italian copy, status badge

As an owner/designer,
I want a consistent app frame with role-aware navigation, Italian copy and clear status badges,
So that every screen I use speaks one vocabulary and shows only what I can act on.

Covers: UX-DR1, UX-DR2, UX-DR3, UX-DR27 (focus, dialogs), UX-DR29, UX-DR30 (sidebar collapse), UX-DR31, NFR11, NFR12, NFR13
⚑ Interim: IR-OP8 (labels Bozza / In elaborazione / Da approvare / Approvato), IR-C4 (no Templates entry)

**Acceptance Criteria:**

**Given** DESIGN.md's token names
**When** the theme is set up
**Then** every colour (`surface`, `surface-raised`, `foreground`, `foreground-muted`, `border`, `primary`, `primary-foreground`, `focus-ring`, `danger`, `status-draft`, `status-generating`, `status-review`, `status-approved`), typography role (`display`, `heading`, `body`, `label`, `mono`) and rounding token exists as a theme variable with a placeholder value
**And** changing a token value changes the UI without touching component code
**And** the template renderers (Epic 3) are documented as not consuming these tokens

**Given** the Italian dictionary file
**When** any UI string is rendered
**Then** it comes from the dictionary, with no hard-coded UI strings in components (checked by a lint rule or test)

**Given** the owner/designer actor
**When** the app loads at ≥ 1280 px
**Then** a left sidebar shows **+ New case study**, Case studies and the user menu (To review is added in Story 4.1, when the queue exists)
**And** Users and Templates are absent (not disabled) for this role
**And** at 1024–1279 px the sidebar collapses to icons

**Given** an actor whose role can't use a surface
**When** they open that surface's URL directly
**Then** they are redirected to their role's landing page, defined once in `access` (owner/designer: Case studies table; account/sales/social: library; admin: Users); this story tests it with the owner/designer landing, and the library and Users routes are registered by Stories 5.1 and 6.3

**Given** the `StatusBadge` component
**When** it renders any case status
**Then** it shows the interim label text together with the matching `status-*` colour token, never colour alone

**Given** any interactive control or dialog
**When** I navigate by keyboard
**Then** focus is visible using `focus-ring`, dialogs trap focus and return it on close, and a dialog can't open a second stacked dialog

### Story 2.5: Create a case study with a permanent ID

As an owner/designer,
I want to create a case study by entering its name and client,
So that it gets a permanent ID and is saved as a draft I can fill in later.

Covers: FR1, CAP-1, AR2, AR3 (create, `draft`), AR20, UX-DR7, PRD Story 2.2
⚑ Interim: IR-OP8
UX gap: narrative language (`it` | `en`) has no designed control; it is placed in this form as a select defaulting to Italiano.

**Acceptance Criteria:**

**Given** the `case-study` module
**When** the migration for this story runs
**Then** a `case_study` table exists with `id uuid default gen_random_uuid()`, `name`, `client`, `year`, `locale` (it | en, default it), `status`, `project_order_ref` (nullable), `head_revision_id` and `approved_revision_id` (nullable), `head_version`, `created_by`, `created_at`, `updated_at`, `deleted_at`
**And** an append-only `case_event` table exists (`case_id`, `revision_id` nullable, `actor_id`, `type`, `at`, `data`) with a database rule or trigger that rejects UPDATE and DELETE
**And** RLS denies `anon` and `authenticated` on both

**Given** I click **+ New case study**
**When** I enter a name and a client (both required) and confirm, with year prefilled to the current year and editable
**Then** the case is created in status `draft`, the wizard header shows its ID in the `mono` style and the Bozza badge, and a `case_created` event is recorded with my actor id
**And** the form doesn't submit while name or client is empty, and says which field is missing

**Given** an existing case
**When** any code path tries to change `case_study.id` or reuse an id
**Then** the database rejects it (the id is immutable: a trigger or column privilege blocks updates)
**And** `project_order_ref` stays null and no MVP UI exposes it

**Given** the `case-study` module's public index
**When** I read it
**Then** status changes go only through `transition(caseId, event, actor)`, which writes the new status and a transition event in one transaction, and a test proves no other code writes `case_study.status`

**Given** I leave the wizard after step 0
**When** I come back to the case
**Then** nothing I entered is lost

### Story 2.6: Find and reopen case studies in the table

As an owner/designer,
I want a table of all case studies with search,
So that I can find a draft I started and carry on where I left off.

Covers: UX-DR4 (columns, search, sort, Bozza row click, empty and no-results states, `/` shortcut), UX-DR30 (skeleton), CAP-6 (list part)
⚑ Interim: IR-OP8
Note: the status filter, row actions, delete and the To review queue come in Story 4.1, when more than one status exists.

**Acceptance Criteria:**

**Given** case studies exist
**When** I open Case studies
**Then** a table shows ID (monospace), Name, Client, Year, Status (badge), Updated and Links (blank for now), sorted by Updated, newest first
**And** clicking a column header sorts by it, and clicking again reverses the order
**And** skeleton rows show while the first load is in progress
**And** soft-deleted cases never appear

**Given** the search field ("Search name, client or ID")
**When** I type, with a ~250 ms debounce
**Then** rows filter by name, client or ID, case- and accent-insensitively (e.g. "citta" matches "Città")
**And** pressing `/` anywhere on the page focuses the search field

**Given** a search with no matches
**When** the table is empty
**Then** it shows "Nothing matches '{query}'." with **Clear search and filters**

**Given** no case studies exist
**When** I open Case studies
**Then** it shows "No case studies yet. Start with the material from a closed project." with **New case study**

**Given** a row in Bozza
**When** I click it
**Then** the wizard reopens for that case (Story 2.10 makes it open at the first incomplete step once all steps exist)

### Story 2.7: Upload project files

As an owner/designer,
I want to drop up to 20 project files into a case study,
So that the material is stored safely with the case and ready for generation.

Covers: FR2 (files), CAP-2, AR8, AR18 (soft delete, upload doesn't change status), AR20, UX-DR8 (dropzone, limits, progress, rows, remove/undo), NFR8, PRD Stories 2.1 and 2.3
⚑ Interim: IR-OP12 (images are shown whole, scaled by the browser; no crop)

**Acceptance Criteria:**

**Given** the `material` module
**When** the migration and infrastructure for this story are applied
**Then** an `asset` table exists (uuid id, `case_id`, kind, original file name, content type, size, S3 key, `created_by`, `created_at`, `deleted_at`) with RLS denying `anon` and `authenticated`
**And** each environment's bucket is private, in the EU, with Block Public Access and versioning on, and CORS allowing only the app origin for POST and GET
**And** keys follow `cases/{caseId}/assets/{assetId}/original.{ext}` and are built only in `material/adapters`

**Given** wizard step 1 (Material) for a draft case
**When** I drop files or use **browse**
**Then** for each file the server, after `authorize`, checks the case has fewer than 20 non-deleted files and the type is on the allowlist in `material/domain/files.ts` (JPEG, PNG, WebP, MP4, MOV, PDF, plain text, Markdown, DOCX), then issues a presigned POST with `content-length-range` up to 100 MB and that `Content-Type`, signed with `requestChecksumCalculation: "WHEN_REQUIRED"`
**And** the browser uploads directly to S3, several files in parallel, each with its own progress bar announced to screen readers

**Given** an upload has finished
**When** the browser asks the server to confirm it
**Then** the server HEAD-checks the object's size and type, re-checks the 20-file cap, and only then creates the `asset` row and records an `asset_uploaded` event
**And** the case status does not change

**Given** a file over 100 MB, a file of a type not on the allowlist, or a 21st file
**When** I add it with other valid files
**Then** only that file is rejected, inline on its row ("Over 100 MB. Not uploaded." / "This file type isn't supported. Use images, videos, texts or PDFs." / a 20-file limit message), and the other files upload normally
**And** a request that bypasses the UI and exceeds a limit is rejected by S3 or by the confirm step, never stored as an asset

**Given** an uploaded file
**When** its row appears
**Then** it shows a thumbnail (images: the original fetched by a presigned GET valid ≤ 15 minutes and scaled to fit by the browser; other types: a type icon), the file name and size

**Given** an uploaded file
**When** I remove it
**Then** it disappears with an **Undo** toast for 5 s and no confirm dialog; the asset is soft-deleted (`deleted_at`), never hard-deleted, and Undo restores it
**And** a removal event is recorded

### Story 2.8: Add pasted text as material

As an owner/designer,
I want to paste project text straight into the case study,
So that notes that aren't a file still count as material.

Covers: FR2 (text), AR6 (non-empty text item counts as material), AR18, AR20, SPEC assumption "pasted text counts as material", PRD Story 2.3 "files and text"
UX gap: EXPERIENCE.md designs no text-entry control. This story adds **Paste text** next to **browse** in the Material step, producing a deliverable row like a file. Flag to UX.

**Acceptance Criteria:**

**Given** the `material` module
**When** the migration for this story runs
**Then** a `text_item` table exists (uuid id, `case_id`, title, body, `created_by`, `created_at`, `updated_at`, `deleted_at`) with RLS denying `anon` and `authenticated`

**Given** wizard step 1
**When** I choose **Paste text**, enter a title and a body, and save
**Then** a text item is stored with the case and appears as a deliverable row (text icon, title, character count)
**And** an event is recorded and the case status does not change

**Given** a text item whose body is empty or only whitespace
**When** I try to save it
**Then** it isn't saved, and I'm told the text is empty

**Given** text items
**When** the 20-file limit is counted
**Then** text items don't count toward it, because the limit applies to files (FR2)

**Given** a text item
**When** I remove it
**Then** it is soft-deleted with the same 5 s **Undo** toast as files

**Given** `material.index`
**When** another module asks whether a case has material
**Then** `hasMaterial(caseId)` returns true only for at least one non-deleted asset or one non-deleted, non-empty text item, and never counts the details form (the function Epic 3's gate uses)

### Story 2.9: Tag, property and flag deliverables

As an owner/designer,
I want to give each deliverable tags, properties and flags from a fixed list,
So that the material is described consistently for generation and for finding case studies later.

Covers: FR2 (tagging), CAP-2, AR14, UX-DR8 (chip pickers, untagged marker), PRD Story 2.4
⚑ Interim: IR-OP3 (seed values arrive by migration once the taxonomy is decided; due 2026-10-14)

**Acceptance Criteria:**

**Given** the `material` module
**When** the migration for this story runs
**Then** `taxonomy_term` (uuid id, `kind` ∈ tag | property | flag, stable unique `key`, `label`) and `material_term` (material ref kind and id, term id) tables exist, with RLS denying `anon` and `authenticated`
**And** term values are inserted only by migrations; no UI or API creates, renames or deletes a term

**Given** a deliverable row (file or text item)
**When** I open its tag, property or flag picker
**Then** I can pick only from that kind's seeded terms as chips, with no free-text entry, and the choice saves at once and survives reload
**And** I can tag a file as soon as it has finished uploading, while others are still uploading

**Given** a deliverable with no terms
**When** the row is shown
**Then** it shows an "untagged" marker, and nothing blocks continuing (tagging is optional)

**Given** code, templates or prompts that refer to a term
**When** a term's `label` changes in a later migration
**Then** nothing breaks, because references use `key` only (checked by a test that renames a label)

**Given** OP 3 is not yet decided
**When** this story is closed
**Then** the pickers work against whatever terms are seeded (an empty kind shows "No values yet"), and adding the decided values needs only a new seed migration

### Story 2.10: Fill in the details form

As an owner/designer,
I want to write short answers on context, solution and results,
So that the narrative can use what isn't in the files, and each answer can be cited when I check claims.

Covers: FR2 (details form), CAP-3, AR18 (form fields as stable-key refs, never material), UX-DR8 (Next: Details), UX-DR9, UX-DR4 (Bozza row opens first incomplete step)

**Acceptance Criteria:**

**Given** the `material` module
**When** the migration for this story runs
**Then** a `context_form` table exists, one row per case, with fields keyed `context`, `solution`, `results`, and RLS denying `anon` and `authenticated`

**Given** wizard step 2 (Details)
**When** it opens
**Then** it shows three sections, Context, Solution and Results, each a textarea with a one-line prompt (e.g. "What did the client need, and why?"), and a counter "{n} of 3"

**Given** I type in a field
**When** I pause or leave the field
**Then** the answer is saved with the case and survives reload, the counter updates, and a save event is recorded

**Given** wizard step 1 (Material)
**When** `material.hasMaterial(caseId)` is true (at least one uploaded file or one non-empty text item)
**Then** **Next: Details** is enabled; before that it is disabled

**Given** a row in Bozza in the Case studies table
**When** I click it
**Then** the wizard opens at the first incomplete step: Material if the case has no material, otherwise Details

**Given** all three fields are empty
**When** I continue
**Then** nothing blocks me, because the fields are optional

**Given** a case with a filled-in details form and no material
**When** `material.hasMaterial(caseId)` is called
**Then** it returns false (NFR6: the form is never material)

**Given** `material.resolveRefs(caseId, refs)`
**When** it gets a `form_field` ref with key `context`, `solution` or `results`
**Then** it returns that field's current text, and any other key is rejected as unknown

## Epic 3: Generate a graphic case study from the material

The owner/designer presses Generate and can leave. The worker produces a draft from MAC templates: a challenge / approach / result narrative built only from this case's material and form answers, laid out for every MVP format and adapted to the media count. The case lands in To review with a toast.

Epic prerequisites (non-dev): graphic template layouts and final case study templates (Sprint 2, decided 2026-10-09), narrative structure and quality criteria (NFR5, Sprint 2), and data processing logic (OP 2, Sprint 1). Stories 3.4–3.7 can't close before their prerequisites land; when in Sprint 2 the templates arrive is the schedule risk.

### Story 3.1: Background job queue and worker loop

As the team,
I want long work to run as leased Postgres jobs in the worker process,
So that generation, exports and renditions never run inside a web request, never run twice from a double click, and never leave a case stuck after a crash.

Covers: AR10, NFR4 (waiting off the hands-on path)

**Acceptance Criteria:**

**Given** the `jobs` module
**When** the migration for this story runs
**Then** a `job` table exists (`kind` ∈ generate | export | rendition, `subject_id`, `input_hash`, `payload` jsonb, `status` ∈ queued | running | succeeded | failed, `attempts`, `max_attempts` default 3, `locked_until`, `error` jsonb, timestamps) with RLS denying `anon` and `authenticated`
**And** a partial unique index on `(kind, subject_id, input_hash) WHERE status IN ('queued','running')` exists
**And** a SQL function `jobs_claim()` claims one claimable job with `FOR UPDATE SKIP LOCKED`, sets a 10-minute lease and increments `attempts`

**Given** a job with the same kind, subject and input hash is already queued or running
**When** `jobs.enqueue` is called again
**Then** it returns the existing job and creates no second one

**Given** the worker process
**When** it runs a job
**Then** it renews the lease every minute while the job runs, so a long job is never cut off by the lease (generation time is unbounded)
**And** handlers are registered per kind, and the worker acts as the `system` actor

**Given** a worker crashes mid-job
**When** the lease expires
**Then** the job can be claimed again; and when it expires with `attempts = max_attempts`, `jobs_claim()` marks it `failed` and the worker emits `job_failed` for its subject

**Given** the UI
**When** it needs a job's outcome
**Then** it reads it only through `jobs.getJobsFor(subjectId)`

**Given** the web process code
**When** a test or lint check scans it
**Then** no web request path imports the LLM, Chromium, sharp or ffmpeg adapters

### Story 3.2: Display renditions for uploaded media

As an owner/designer,
I want light display copies of my images and videos,
So that thumbnails, the configurator and shared links load fast without anyone touching the original files.

Covers: AR5 (allowed deterministic processing), AR8 (renditions prefix), NFR1
⚑ Interim: IR-OP12 (whole-image downscale and video poster frame/transcode only; no crop, focal point, upscaling, recolour or filter)

**Acceptance Criteria:**

**Given** an asset upload is confirmed (Story 2.7)
**When** the asset is an image or video
**Then** a `rendition` job is enqueued for it

**Given** an image asset
**When** the rendition job runs
**Then** sharp produces downscaled copies of the whole image at the spec sizes (never upscaled: an image smaller than the spec is copied at its own size), stored at `cases/{caseId}/assets/{assetId}/renditions/{specHash}.{ext}`
**And** a test proves the output has the same aspect ratio as the original and no crop, colour or filter operation exists in the code path

**Given** a video asset
**When** the rendition job runs
**Then** ffmpeg produces a poster frame and a display transcode under the renditions prefix

**Given** the original object
**When** any rendition runs
**Then** the original is only read, never written or replaced, and no AI or LLM call is involved

**Given** another module needs a display copy
**When** it calls `material.getRendition(assetId, spec)`
**Then** it gets a presigned GET URL (≤ 15 minutes) for that rendition, and no other module builds rendition keys
**And** the Material step's thumbnails (Story 2.7) switch to renditions once available, with a type icon while pending

### Story 3.3: The case study document, revisions and the format registry

As the team,
I want one validated document per revision that every format and screen reads, and one registry of formats,
So that content never differs between formats, configurator edits reach the exports, and old revisions survive schema changes.

Covers: AR3 (revision model, live and editable reads), AR4, AR9 (format registry), AR21, FR3 (layouts per format), CAP-12 (generated draft kept)
⚑ Interim: IR-OP1 (registry holds Deck 16:9, Social carousel 4:5, PDF A4 only), IR-OP8

**Acceptance Criteria:**

**Given** `rendering/domain/formats.ts`
**When** I read it
**Then** it lists exactly the IR-OP1 formats, each with id, name, ratio, pixel size (1920×1080, 1080×1350, A4 portrait), page model, file type (PDF / ZIP of PNGs / PDF) and `static`
**And** it is the only list of formats used anywhere; there is no canvas-ratio field in any type

**Given** `generation/domain` zod schema for `CaseStudyDocument`
**When** a document is validated
**Then** it has a `schemaVersion`, `templateId@version`, a shared part (text blocks with stable `blockId`, section, text, claims with `aspect` ∈ technical | graphic, `provenance` ∈ generated | human_edited | human_added, optional `sourceRefs: MaterialRef[]`, and `check: { by, at, textHash } | null`; the selected media set) and a per-format part keyed by format id (variant, slot → assetId, spacing, text scale, font pairing)
**And** a document missing the challenge, approach or result block, or with them out of order, is rejected

**Given** the `case-study` module
**When** the migration for this story runs
**Then** a `revision` table exists (uuid id, `case_id`, `status` ∈ working | approved | superseded, `version`, `generated_doc` jsonb, `doc` jsonb, `manifest` jsonb, `model`, `fell_back`, `prompt_version`, `schema_version`, timestamps), with RLS denying `anon` and `authenticated`
**And** `generated_doc` can't be changed after insert (trigger)
**And** foreign keys from `case_study.head_revision_id` and `approved_revision_id` (columns added in Story 2.5) to `revision` are added here

**Given** a revision
**When** its per-format entries are created
**Then** they are exactly the registry formats at that moment, and any later operation naming another format fails with `FORMAT_NOT_IN_REVISION`

**Given** the `case-study` index
**When** other modules read a case's document
**Then** they use `getLiveRevision(caseId)` (approved revision, or none) or `getEditableRevision(caseId)` (head), and documents are passed through `upgrade(doc)` on read without writing the upgrade back to a non-working revision (covered by a test with a v0 fixture)

### Story 3.4: Templates as versioned code with media-count rules

As an owner/designer,
I want the case study layout to adapt to how many images and videos I have,
So that the draft looks designed whether I uploaded three media items or twelve.

Covers: FR4, CAP-4 (slot mapping per media count), AR4 (`relayout`), AR15, NFR1 (template design unchanged), PRD Story 3.2
⚑ Interim: IR-OP1, IR-OP12 (adaptation chooses only among designed variants), IR-C4 (no variant on/off state)
⛔ Blocked on: IR-A4 (the zero-images-or-videos rule) and the graphic template layouts and final templates (Sprint 2 non-dev prerequisites)

**Acceptance Criteria:**

**Given** the design team's final template specs
**When** the first template is coded
**Then** it lives in `src/modules/rendering/templates/{templateId}/v1/` and holds, per registry format: its layout variants, slots, media-count rules (supported range and slot mapping per count), and allowed values (spacing ranges, text scales S/M/L, font pairings)
**And** no template design value is stored in the database or editable at runtime

**Given** a published template version
**When** a change is needed
**Then** it ships as `v{n+1}`, and a test fails if a file in an existing version folder changes (checked against a committed hash list)

**Given** `rendering.listVariants(templateId, format, mediaCount)`
**When** it is called
**Then** it returns only the variants whose media-count rule supports that count, and it is the only source of variants for generation and Shuffle

**Given** `rendering.relayout(doc, template)`
**When** it runs for a media set
**Then** for every format it picks a supported variant and assigns slots → assetIds deterministically (same input, same output), never invents an asset, and leaves the shared text untouched
**And** it is a pure function with unit tests at the low and high ends of each format's supported range

**Given** a media count above the template's maximum
**When** relayout runs
**Then** it uses the template's rule for the overflow case as specified by the design team, and never crops or resizes media to fit

**Given** a case whose material has no images or videos
**When** relayout runs
**Then** it applies the template's zero-media rule (IR-A4: not yet supplied; until it is, this criterion stays open and the case is not silently rendered with empty slots)

### Story 3.5: One renderer per format

As an owner/designer,
I want each format rendered by one implementation,
So that the preview I approve is exactly what gets exported and shared.

Covers: AR9 (one renderer per format), FR3 (layouts per format), CAP-7 (preview matches export), NFR1
⚑ Interim: IR-OP1, IR-OP12 (media placed whole, fit, never stretched or cropped)
⛔ Blocked on: final templates (Sprint 2 non-dev prerequisite)

**Acceptance Criteria:**

**Given** each registry format
**When** I look at the template version folder
**Then** there is exactly one React renderer for it, a pure function of (document, format, template, asset URLs) with no data fetching

**Given** a document and a format
**When** the renderer runs
**Then** it lays out the shared text blocks and the format's slot assignments, places each media item whole within its slot (fit, no stretching, no crop), shows videos as their poster frame, and paginates multi-page formats (deck pages, carousel slides, A4 pages)
**And** template output uses the template's own styles, not the tool UI tokens

**Given** the renderer
**When** rendered server-side with `renderToStaticMarkup`
**Then** the output is identical to the client render for the same input (snapshot test), so the configurator, case study view, shared link page and exports can all use it

**Given** a text block that doesn't fit its slot
**When** the renderer runs
**Then** it exposes an overflow result per block and page, and never shrinks text below the template's minimum size

### Story 3.6: Narrative generator port and Anthropic adapter

As an owner/designer,
I want the narrative written only from my case's material and form answers,
So that every claim in the draft has something I can check it against.

Covers: FR3, CAP-5, AR6 (aspects, MISSING_ASPECT), AR7, AR18 (manifest, limits, no Files API), AR19 (provenance, validated sourceRefs), NFR1, NFR2 (no "verified"), NFR5, NFR13 (narrative language)
⚑ Interim: IR-A3 (`MISSING_ASPECT` is recorded, not blocking)
⛔ Blocked on: IR-OP2 (which material types the LLM reads and how each becomes input), IR-NFR5 (quality checklist content for the prompt)

**Acceptance Criteria:**

**Given** the `generation` module
**When** I read it
**Then** `NarrativeGenerator` is the only port that calls an LLM, its adapter is the only importer of `@anthropic-ai/sdk`, and it is registered only in the worker

**Given** the adapter
**When** it calls the API
**Then** it uses `client.beta.messages.parse` with the zod output schema, the model from one constant (`claude-opus-5-5`), adaptive thinking, `effort: "high"` in `output_config` next to `format`, and server-side refusal fallbacks (beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`)
**And** it passes no web or other server tools
**And** the prompt is a versioned file in `generation/adapters/prompts/` and asks for text in the case's `locale`

**Given** a material manifest
**When** the adapter builds the request
**Then** it includes only items in the manifest plus the form answers: text items and form answers as text, other types per the OP 2 rule (blocked until decided)
**And** it respects the API limits (32 MB request, 600 PDF pages; DOCX and video are not API inputs) by extracting or splitting rather than failing, and never uploads to the Anthropic Files API

**Given** the model's response
**When** it is parsed
**Then** the output contains only narrative text fields (blocks, claims with `aspect` and optional `sourceRefs`); no layout, template, asset or slot field exists in the output schema
**And** every claim gets `provenance: generated` and `check: null`
**And** any `sourceRef` not in the manifest fails validation and the attempt fails

**Given** the claims
**When** none is tagged `technical` or none is tagged `graphic`
**Then** the document is marked `MISSING_ASPECT`

**Given** a `refusal` stop reason
**When** the adapter receives it
**Then** the attempt fails with code `LLM_REFUSAL`

**Given** a successful call
**When** the result is returned
**Then** it carries the served `response.model`, a `fellBack` flag, `promptVersion` and `schemaVersion`
**And** no prompt, material text or response text is written to logs

### Story 3.7: Generate a case study

As an owner/designer,
I want to press Generate once my material is in and leave the page,
So that the draft is built in the background without my waiting time counting against the 15-minute budget.

Covers: FR3, CAP-4, NFR6, NFR4, AR3 (`draft` → `generating` → `in_review`, failure → `draft`), AR6 (gate in UI and worker), AR10, AR17 (`baseHeadVersion`, new revision), AR18 (manifest), AR20, UX-DR10, UX-DR4 (live status), PRD Story 3.1
⚑ Interim: IR-OP8, IR-OP1
⛔ Blocked on: IR-A4 (a case with text or PDFs only, until the template's zero-media rule exists), via Stories 3.4 and 3.6

**Acceptance Criteria:**

**Given** wizard step 3 (Generate)
**When** it opens
**Then** it shows "{n} files, {m} of 3 details filled."

**Given** a case with no material (no non-deleted asset and no non-empty text item), with or without the details form filled in
**When** I look at **Generate**
**Then** it is disabled and shows "Add at least one file of project material. The details form alone isn't enough to generate.", linked via `aria-describedby`
**And** calling the generate action directly fails with `NO_MATERIAL` before any job or LLM call

**Given** a draft case with material
**When** I press **Generate**
**Then** the server re-checks `material.hasMaterial`, enqueues one `generate` job whose payload carries the material manifest (refs plus content hashes) and `baseHeadVersion`, and transitions the case to `generating`
**And** a double click enqueues only one job
**And** the screen shows "Generating your case study. You can leave this page; it will appear in To review when it's ready." with **Back to case studies**, and no ETA or percentage
**And** generate is rejected for any case not in `draft`

**Given** the worker claims the job
**When** it runs
**Then** it checks the NFR6 gate again, runs the narrative filter (Story 3.6) and then `rendering.relayout` (Story 3.4), and creates a **new** `working` revision with `generated_doc` and `doc` set to the same document and the manifest stored
**And** it sets the head by compare-and-set against `baseHeadVersion`, transitions the case to `in_review`, and emits `job_ok`

**Given** the head changed since the job was enqueued
**When** the job finishes
**Then** its result is discarded, no revision becomes head, and the case returns to `draft`

**Given** the job fails after its attempts (including `NO_MATERIAL`, `LLM_REFUSAL` or a crash)
**When** it is marked failed
**Then** the case returns to `draft` with its material and details untouched, and the wizard shows "Generation didn't finish. Your material and details are saved." with **Try again**, which re-runs Generate without re-uploading

**Given** the Case studies table is open
**When** a case moves between `generating`, `in_review` and `draft`
**Then** its row updates without a page reload; clicking a row in In elaborazione does nothing and shows "Still generating"

**Given** material added after the job was enqueued
**When** the job runs
**Then** it isn't used, because only the manifest's items are read

### Story 3.8: Tell me when the draft is ready

As an owner/designer,
I want a notice wherever I am in the app when a draft is ready,
So that I can start the review without watching the list.

Covers: UX-DR11, SPEC assumption (in-app toast)
⚑ Interim: IR-C3 (toast and polling are UX-proposed, not in any FR)

**Acceptance Criteria:**

**Given** I started a generation and I'm on any app page
**When** the case moves to `in_review`
**Then** within one polling interval a toast says "{Name} is ready to review." with **Open**, which for now opens the Case studies table with that row highlighted (Story 4.2 retargets **Open** to the configurator)

**Given** the toast
**When** it appears
**Then** it is announced to screen readers and doesn't take focus

**Given** I'm not in the app when the draft finishes
**When** I come back
**Then** no toast is replayed; the case is visible in the Case studies table

**Given** the MVP
**When** a draft is ready
**Then** no email, Slack or other external notification is sent

## Epic 4: Review, edit and approve a case study

The owner/designer works the To review queue, refines the draft in the configurator, checks every block against the material and approves; later edits to an approved case go live only through Update approved version.

Epic prerequisite (non-dev, Sprint 2): configurator visual design (Bento). Story 4.2 follows it for layout; EXPERIENCE.md wins on behaviour.

### Story 4.1: Review dashboard and To review queue

As an owner/designer,
I want to filter case studies by status and see the ones waiting for review, oldest first,
So that nothing sits waiting and I can clear out drafts I don't need.

Covers: FR5 (dashboard), CAP-6, AR3 (delete only in `draft`, soft), UX-DR1 (To review entry), UX-DR4 (status filter, Delete row action), UX-DR5, UX-DR28 (Delete confirm), PRD Story 4.1
⚑ Interim: IR-OP8

**Acceptance Criteria:**

**Given** the Case studies table
**When** it loads
**Then** a segmented status filter shows All · Bozza · In elaborazione · Da approvare · Approvato, each with its count, and combines with search (AND)

**Given** the sidebar
**When** it loads
**Then** it now shows **To review** with the count of cases in Da approvare, updating when a draft becomes ready

**Given** the sidebar's **To review** item
**When** I open it
**Then** I see the table pre-filtered to Da approvare and sorted oldest first (by the time the case entered Da approvare), with the sidebar count matching the rows
**And** when it's empty it shows "Nothing to review."
**And** any owner/designer sees every waiting case; there is no assignment or claiming

**Given** a row in Bozza
**When** I choose **Delete** from its overflow menu and confirm
**Then** the case is soft-deleted (`deleted_at`), disappears from every list, and a delete event is recorded
**And** the overflow menu of a row in any other status has no Delete entry, and the delete action called directly for a non-draft case fails with a `CASE_NOT_DELETABLE` error

### Story 4.2: Open a draft in the configurator

As an owner/designer,
I want to open a case in the configurator and see every format of the draft,
So that I can review the generated case study exactly as it will be exported.

Covers: FR5 (configurator), CAP-7 (preview equals export), AR3 (`getEditableRevision`), AR9 (same renderer), UX-DR12, UX-DR26 (`[` `]`), UX-DR33, PRD Story 4.2 (Bento layout)
⚑ Interim: IR-OP1 (three formats), IR-A3 (`MISSING_ASPECT` shown as a non-blocking warning; placement is UX's call)

**Acceptance Criteria:**

**Given** a case in Da approvare or Approvato
**When** I click its row in the table or **Open** on the draft-ready toast
**Then** the configurator opens full-screen without the sidebar, with a back arrow to the list

**Given** the configurator
**When** it loads
**Then** the top bar shows back, case name, status badge and save state; the left Formats pane lists every format in the revision with name, ratio and pixel size, in registry order; the centre canvas shows the selected format at fit-to-pane zoom using the Story 3.5 renderer; the right pane has Edit and Check tabs
**And** multi-page formats show a page strip under the canvas, and `[` / `]` move between pages
**And** a format gets a check mark in the Formats pane once I've viewed it

**Given** the revision is marked `MISSING_ASPECT`
**When** the configurator opens
**Then** a warning says the draft lacks the technical or the graphic side (whichever is missing), and Approve is not blocked by it

**Given** a viewport narrower than 1024 px
**When** I open the configurator
**Then** it shows "The configurator needs a larger screen." instead of the panes

**Given** a case in Bozza or In elaborazione
**When** I open the configurator URL directly
**Then** I'm returned to the Case studies table

### Story 4.3: Edit generated text in place, with autosave

As an owner/designer,
I want to fix any generated text directly on the canvas and have it saved as I go,
So that a claim that doesn't match the material can be corrected without losing work.

Covers: FR5 (text editing), CAP-7, NFR5 (sections locked), AR4, AR17, AR19 (provenance; any text change voids the check), AR20 (save, claim edit), UX-DR13, UX-DR20, UX-DR26 (undo/redo, Esc), UX-DR27 (blocks reachable by Tab)
⚑ Interim: IR-C3 (autosave), IR-A5 (stale writes reload; no "someone else changed this" state)

**Acceptance Criteria:**

**Given** a text block on the canvas
**When** I click it (or Tab to it in reading order and press Enter)
**Then** I can edit it in place as plain text with line breaks; Esc or clicking outside finishes editing
**And** there is no font, colour or size control inside a block

**Given** I change a block's text
**When** editing pauses
**Then** the change is saved to the working revision's `doc` with the expected `revision.version` (writes sent one at a time), the save state shows "Saving…" then "Saved", and the block is marked "edited"
**And** the changed claims get `provenance: human_edited` (or `human_added` for new text), and save and claim-edit events are recorded
**And** `generated_doc` is unchanged

**Given** the challenge, approach and result sections
**When** I edit them
**Then** I can reword their headings but there is no control to delete or reorder them, and a write that would remove or reorder one is rejected by the schema

**Given** a save fails
**When** the network or server errors
**Then** the save state shows "Not saved. Retrying…", and after 3 failures a banner says "Changes aren't saving. Keep this tab open."

**Given** a colleague saved the same revision first
**When** my save returns `STALE_REVISION`, `STALE_HEAD` or `REVISION_NOT_WRITABLE`
**Then** the client does not retry; it reloads the revision and shows the current content

**Given** text no longer fits its slot in a format
**When** the renderer reports overflow
**Then** the block shows an overflow marker; text is never shrunk below the template minimum

**Given** an edit
**When** I press Cmd/Ctrl+Z or Shift+Cmd/Ctrl+Z
**Then** the text change is undone or redone, and the result is saved like any edit

**Given** the case is `generating`
**When** a save arrives
**Then** it is rejected

### Story 4.4: Adjust the layout per format

As an owner/designer,
I want to pick a designed variant, shuffle, adjust spacing or reset each format's layout,
So that each format looks right without changing the template design.

Covers: FR5 (layout), FR4 (shuffle respects media count), CAP-7, NFR1, AR15 (`listVariants`), UX-DR14, UX-DR26 (undo/redo)
⚑ Interim: IR-OP12 (Shuffle and variants choose only among designed variants), IR-C4 (all coded variants are available)

**Acceptance Criteria:**

**Given** the Edit tab for the selected format
**When** I open Layout
**Then** I see a thumbnail grid of the variants `rendering.listVariants(templateId, format, mediaCount)` returns, and picking one re-renders the canvas and saves it to that format only

**Given** **Shuffle layout**
**When** I press it
**Then** the format moves to the next variant in that list (never a newly generated layout), and Cmd/Ctrl+Z returns the previous one

**Given** spacing (outer padding and gap)
**When** I move a slider
**Then** it moves only within the template's allowed range for that format, and the server rejects any out-of-range value

**Given** **Reset**
**When** I press it
**Then** this format's variant, spacing, text scale and font pairing return to the values in `generated_doc`, and other formats are unchanged

**Given** any layout change
**When** it is saved
**Then** it uses the Story 4.3 save path (compare-and-set, save states, events), and the shared text and media set are unchanged

### Story 4.5: Replace, reorder and remove media

As an owner/designer,
I want to swap, reorder or hide media in the layout using only this case's material,
So that the best visuals lead without anything outside the project creeping in.

Covers: FR5 (media), FR4 (adapt on count change), CAP-7, NFR1, AR4 (`relayout` in the same write), AR18 (refs from own material), UX-DR15, UX-DR26 (drag alternative)
⚑ Interim: IR-OP12 (fit whole; no crop, focal point, recolour, filter or effect controls)

**Acceptance Criteria:**

**Given** a selected media slot
**When** I choose **Replace media**
**Then** a picker lists only this case's non-deleted images and videos (display renditions), with no upload, stock or generated option, and the chosen item replaces the slot's media in the shared media set

**Given** two media slots
**When** I drag one onto the other, or use the slot's menu "Swap with…"
**Then** the two items swap, and the change is saved

**Given** a media item
**When** I choose **Remove from layout**
**Then** it leaves the shared media set (the asset itself is untouched) and `rendering.relayout` runs in the same write, so every format adapts to the new count

**Given** a server-side write
**When** it names an asset that isn't this case's non-deleted material
**Then** it is rejected

**Given** any media control
**When** I look for crop, recolour, filter or effect controls
**Then** none exists; media are always placed whole within their slot

**Given** a media change
**When** I press Cmd/Ctrl+Z
**Then** it is undone and saved

### Story 4.6: Choose typography per format

As an owner/designer,
I want to choose the font pairing and text scale the template offers,
So that the text reads well in each format while staying on-brand.

Covers: FR5 (typography), CAP-7, NFR1, UX-DR16

**Acceptance Criteria:**

**Given** the Edit tab for the selected format
**When** I open Typography
**Then** I can choose one of the template's font pairings and a text scale S / M / L, saved to that format only

**Given** the typography controls
**When** I look for other options
**Then** there is no font upload, free font picker or per-word or per-block styling

**Given** a value the template doesn't allow
**When** it is sent to the server
**Then** it is rejected

**Given** a larger text scale
**When** a block no longer fits
**Then** the overflow marker from Story 4.3 appears on it

### Story 4.7: Check every block against the material

As an owner/designer,
I want to tick each block only after I've checked its claims against the material and form answers,
So that nothing reaches a client that a person hasn't traced back to the source.

Covers: NFR2, FR6 (manual check), CAP-8, AR19 (`check { by, at, textHash }`, no bulk, voided on change, `sourceRefs` never "verified"), AR20 (check and uncheck events), UX-DR17, UX-DR26 (`J` `K` `Space`), UX-DR28 (no tick-all), UX-DR29 (never "verified")

**Acceptance Criteria:**

**Given** the Check tab
**When** it opens
**Then** it lists every text block by section (challenge, approach, result, headline, KPI tiles), each with a "Checked against material" checkbox, and blocks that overflow are listed as overflowing

**Given** a block in the list or on the canvas
**When** I select it in one place
**Then** it is highlighted in the other

**Given** I open the material drawer
**When** I pick an item
**Then** it opens beside the canvas: images, PDFs and text in a viewer, video in a player, and the three details answers as text

**Given** I tick a block
**When** the tick is saved
**Then** the block's `check` becomes `{ by: me, at: now, textHash: hash(current text) }` through the compare-and-set save path, and a check event is recorded; unticking sets it to null with an uncheck event

**Given** a checked block
**When** its text changes by any means
**Then** it shows as unticked, because a check counts only while its `textHash` matches the current text

**Given** the Check tab
**When** I look for shortcuts
**Then** there is no "tick all" control and no use case that sets more than one block's check in one call
**And** `J` / `K` move between blocks and `Space` ticks the selected one

**Given** claims carry `sourceRefs` from generation
**When** they are shown
**Then** they are never labelled "verified", "supported" or "unsupported", and they never count as a check

**Given** the counter
**When** checks change
**Then** it reads "{n} blocks still to check" (or "All blocks checked") and is announced with `aria-live="polite"`

### Story 4.8: Approve a case study

As an owner/designer,
I want to approve a case once every block is checked and nothing overflows,
So that it becomes available for export and sharing, and only then.

Covers: FR6, CAP-8, NFR2, NFR7, AR3 (`in_review` → `approved`, `approved_revision_id`), AR5 (automated guardrail test), AR17, AR18 (`MATERIAL_MISSING`), AR19 (server-side check, overflow per format), AR20, UX-DR18, UX-DR28, PRD Story 4.3
⚑ Interim: IR-OP8, IR-A3 (`MISSING_ASPECT` doesn't block)

**Acceptance Criteria:**

**Given** a case in Da approvare
**When** any block lacks a current check, or any format overflows
**Then** **Approve** is disabled and names what's left ("3 blocks still to check." / overflow), linked via `aria-describedby`

**Given** every block is checked and nothing overflows
**When** I press **Approve**
**Then** a dialog asks "Approve {Name}? Every claim has been checked against the material. Once approved, it can be exported and shared." with **Approve** / **Cancel**

**Given** I confirm
**When** the client calls `approve(caseId, revisionId, expectedRevisionVersion, expectedHeadVersion)` with an overflow-free result measured with the shared renderer for every format of that revision version
**Then** the server recomputes that every block has a current check, confirms nothing the revision references is deleted, and in one transaction sets the revision to `approved`, sets `approved_revision_id`, transitions the case to `approved` and records an approval event with my actor id
**And** any owner/designer can approve, not only the one who created the case

**Given** the call
**When** a block lacks a current check, an overflow result is missing for any format, referenced material is deleted, or a version is stale
**Then** it fails with `BLOCKS_UNCHECKED`, `OVERFLOW_NOT_CLEARED`, `MATERIAL_MISSING`, `STALE_REVISION` or `STALE_HEAD`, and nothing changes

**Given** approval succeeds
**When** the dialog closes
**Then** the badge shows Approvato, a toast says "Approved. It's now in the library.", and I go to To review if other cases are waiting, otherwise to Case studies

**Given** an automated guardrail test
**When** the suite runs
**Then** it proves approval is impossible without a person's per-block check and that no bulk approve or auto-approve use case exists

### Story 4.9: Edit an approved case and update the approved version

As an owner/designer,
I want to fix an approved case without unchecked text reaching anyone,
So that a correction goes live only after I've checked it.

Covers: FR6 (approved stays approved), CAP-8, NFR2, NFR7, AR3 (fork, live vs editable, update, discard, `superseded`), AR17 (`forkHead`), AR19 (unedited blocks keep their checks), AR20, UX-DR19, UX-DR28, PRD Story 4.3 (last criterion, staged reading)
⚑ Interim: IR-A1 (edits are staged until **Update approved version**)
Note: the live-link count in the banner and dialog is added by Story 5.5, when links exist.

**Acceptance Criteria:**

**Given** an Approvato case
**When** I open it in the configurator
**Then** a banner says "Approved. Changes go live when you update the approved version."

**Given** my first edit
**When** it is saved
**Then** `case-study.forkHead(caseId, expectedHeadVersion)` creates one `working` revision copied from `approved_revision_id` (or returns the existing one), and the edit goes there
**And** blocks I didn't edit keep their checks; edited blocks are unticked
**And** the case status stays `approved` and every live read (`getLiveRevision`) still returns the approved revision

**Given** the head differs from the approved revision
**When** every edited block is ticked again and nothing overflows
**Then** **Update approved version** is enabled; confirming runs the same `approve` use case on the head, the head becomes `approved`, the previous approved revision becomes `superseded`, and the status stays Approvato

**Given** the head differs from the approved revision
**When** I choose **Discard changes**
**Then** the working head is marked `superseded`, `head_revision_id` points back to `approved_revision_id`, and the configurator shows the live version

**Given** the head equals the approved revision
**When** I look at the top bar
**Then** neither **Update approved version** nor **Discard changes** is shown

**Given** any state
**When** I look for a way back to Da approvare or Bozza
**Then** there is none

### Story 4.10 (conditional, not scheduled): Template maintenance

As an owner/designer,
I want to browse templates, turn variants on and off, and see where each is used,
So that generation and Shuffle only use variants we want.

Covers: UX-DR32, AR15 (conditional `template_variant_state`), AR11 (`manage templates`)
⛔ Blocked on: IR-C4. Built only if the PRD owner adopts the UX scope for "maintain templates"; otherwise dropped. Not counted in Sprint 2.

**Acceptance Criteria:**

**Given** the PRD owner adopted the C4 scope
**When** I open **Templates** in the sidebar
**Then** I see each template's variants per format with sample content and how many case studies use each variant

**Given** a variant
**When** I turn it off
**Then** a `template_variant_state` row owned by `rendering` records it, and `listVariants` stops returning it for generation and Shuffle
**And** turning off the last enabled variant of a format is refused

**Given** the Templates surface
**When** I look for design controls
**Then** there is no upload, design editing or versioning; template design is never stored in the database

## Epic 5: Find, export and share approved case studies

Users find approved cases in the library, preview every format, export files and publish shareable links that always show the live approved version and can be turned off. Before login, the library is reached through the owner/designer's Table / Library toggle; the account/sales/social rules are enforced by the policy and covered by tests, and go live for real users in Epic 6.

Epic prerequisite (non-dev, Sprint 2): account/sales/social user journey (OP 4). Decided before Epic 5 ships: shareable link access (OP 11).

### Story 5.1: Library of approved case studies

As an account/sales/social user,
I want to browse approved case studies as cards with search and filters,
So that I can find the right one to show a client in under a minute.

Covers: FR7 (find), CAP-9 (approved only), AR3 (`getLiveRevision` only), AR11 (approved-only listing), UX-DR6, UX-DR30 (skeleton cards)
⚑ Interim: IR-OP4 (card library with facets), IR-OP3 (tag facets show only seeded terms), IR-OP1 (cover from the 16:9 deck)

**Acceptance Criteria:**

**Given** the library
**When** it loads
**Then** it shows only cases with an approved revision, read through `getLiveRevision`, as a card grid sorted newest approved first, paginated at 24 cards with no infinite scroll, with skeleton cards during the first load
**And** each card shows a cover thumbnail (the first page of the live revision's 16:9 deck, drawn with the shared renderer), name, client, year and up to three tags
**And** cards have no status badge and the library has no status filter

**Given** the search field
**When** I type
**Then** it matches name, client and ID with the same rules as the table (Story 2.6)

**Given** facets for Client, Year and tags (from the taxonomy terms on the case's material)
**When** I pick chips
**Then** values in one facet combine with OR, facets combine with AND and with search, active filters show above the grid, and **Clear all** removes them
**And** with no results it shows "Nothing matches '{query}'." with **Clear search and filters**; with no approved cases at all, "No approved case studies yet." and no action

**Given** the owner/designer
**When** they use the Table / Library toggle on Case studies
**Then** they see the same library account/sales/social users see

**Given** the account/sales/social role
**When** the policy test suite runs
**Then** it proves listing returns approved cases only for that role, and that working or superseded revisions never reach the library

**Given** a card
**When** I click it
**Then** the case study view opens (Story 5.2)

### Story 5.2: Preview an approved case study in every format

As an account/sales/social user,
I want to page through each format of an approved case study,
So that I know what I'm sending before I export or share it.

Covers: FR7, CAP-9 (no entry point for unapproved content), NFR7, AR3, AR9, UX-DR21 (view, pager, zoom, full screen, Edit), UX-DR4 (View row action), UX-DR2
⚑ Interim: IR-OP1

**Acceptance Criteria:**

**Given** an approved case
**When** I open its case study view (from a library card, or **View** in an Approvato row's overflow menu)
**Then** it shows a top bar (Back, name, status badge), a format list with the same names and order as the configurator, and a read-only preview of the live revision drawn with the shared renderer
**And** the preview has a pager ("Slide 1 of 12"), zoom − / 100% / +, fit and full screen

**Given** an owner/designer
**When** they open the view
**Then** they also see **Edit**, which opens the configurator; account/sales/social users don't see it

**Given** a case with no approved revision
**When** anyone opens its view URL directly
**Then** they are returned to their landing page, and no Bozza, In elaborazione or Da approvare row or card offers View, Export or Share

**Given** an approved case with unpublished edits (Story 4.9)
**When** I open the view
**Then** it shows the approved revision, never the working head

**Given** a viewport of 1024–1279 px
**When** the view loads
**Then** the format list becomes a dropdown; below 1024 px the preview still works

### Story 5.3: Export a format as a file

As an account/sales/social user or owner/designer,
I want to download the selected format as a file,
So that I can attach it or drop it into my own slides.

Covers: FR7 (export), CAP-9, NFR7, AR5 (guardrail test), AR8 (exports prefix, presigned GET), AR9 (export pipeline, file types, `ensureExport`), AR10, AR20, UX-DR21 (Export, progress, failure), UX-DR4 (Export row action), PRD Story 5.1
⚑ Interim: IR-OP1 (deck → PDF, carousel → ZIP of PNGs, A4 → PDF)

**Acceptance Criteria:**

**Given** the `rendering` module
**When** the migration for this story runs
**Then** an `export` table exists, unique and immutable on `(revision_id, format)`, with S3 keys `cases/{caseId}/revisions/{revisionId}/exports/{format}.{ext}` built only by `rendering` adapters, and RLS denying `anon` and `authenticated`

**Given** an approved case in the view with a format selected
**When** I press **Export** (or **Export** in an Approvato row's overflow menu)
**Then** the server checks `case-study.isRevisionApproved` on the live revision and that the format is in it, then enqueues an `export` job; the button shows progress and I can keep browsing
**And** for a case with no approved revision, or a format not in the revision, it fails with `NOT_APPROVED` or `FORMAT_NOT_IN_REVISION` and nothing is enqueued

**Given** the worker runs the export
**When** it renders
**Then** it builds HTML with `renderToStaticMarkup` from the same renderer, loads it into Playwright Chromium with `page.setContent` (no print route exists), and writes a PDF for deck and A4 or a ZIP of one PNG per slide for the carousel, using display renditions and video poster frames
**And** `rendering.ensureExport(revisionId, format)` returns the existing export if there is one, so a second request for the same revision and format doesn't render again

**Given** the export is ready
**When** the job succeeds
**Then** the browser downloads the file through a presigned GET valid ≤ 15 minutes, and an export event is recorded with my actor id

**Given** the export job fails
**When** it is marked failed
**Then** a toast says "Export didn't finish." with **Try again**, and the case status doesn't change

**Given** an automated guardrail test
**When** the suite runs
**Then** it proves no export can be produced for a case without an approved revision, by any role

### Story 5.4: Export every format at once

As an account/sales/social user or owner/designer,
I want one ZIP with every format,
So that I can hand over the whole case study in one go.

Covers: FR7, CAP-9, NFR7, AR9 (Export all), UX-DR21
⚑ Interim: IR-OP1

**Acceptance Criteria:**

**Given** an approved case in the view
**When** I press **Export all**
**Then** the server ensures an export of every format of the live revision (Story 5.3), then builds one ZIP stored as export `(revision_id, 'all')` from exactly those files, and the browser downloads it

**Given** an `all` export already exists for the revision
**When** I press **Export all** again
**Then** the existing ZIP is returned

**Given** one format's export fails
**When** Export all runs
**Then** no partial ZIP is stored, and the "Export didn't finish." toast with **Try again** appears

### Story 5.5: Create a shareable link

As an account/sales/social user or owner/designer,
I want to create a link to one format of an approved case study,
So that I can send it to a client, who sees a hosted presentation.

Covers: FR7 (publish as link), CAP-10, NFR7, AR11 (create link), AR13, AR20, UX-DR22, UX-DR19 (link count), UX-DR4 (Links column, Share row action), PRD Story 5.2
⚑ Interim: IR-OP11 (`accessMode = unlisted`, "Anyone with the link can view."), IR-A2 (link pages stay behind the basic-auth gate until Epic 6), IR-OP1

**Acceptance Criteria:**

**Given** the `sharing` module
**When** the migration for this story runs
**Then** a `share_link` table exists (`token` unique, random, ≥ 128 bits, URL-safe; `case_id`; `format`; `created_by`; `created_at`; `expires_at` nullable; `revoked_at` nullable; `access_mode` enum whose only value in use is `unlisted`) with RLS denying `anon` and `authenticated`

**Given** an approved case
**When** I press **Share** in the view (or in an Approvato row's overflow menu)
**Then** the Share dialog lets me pick a format (default: Deck 16:9) and states, as a plain sentence above the link, "Anyone with the link can view."

**Given** I create the link
**When** it is created
**Then** the server requires an `approved_revision_id`, stores the link, copies `/s/{token}` to the clipboard, shows "Link copied", and records a link-created event
**And** for a case with no approved revision it fails with `NOT_APPROVED`

**Given** the dialog
**When** links exist for the case
**Then** a list shows each link's format, creator, creation date and **Copy**

**Given** an approved case with active links
**When** I look at the Case studies table, or open it in the configurator
**Then** the Links column shows the count of links not turned off, and Story 4.9's banner and confirm dialog read "Approved, with {n} live links. Changes go live when you update the approved version." and "Update the approved version? {n} links will show the new version."

**Given** an automated guardrail test
**When** the suite runs
**Then** it proves no link can be created for a case without an approved revision, by any role

### Story 5.6: The shared link page

As a client or prospect who received a link,
I want to view the case study as a presentation on any device,
So that I can see the work without an account or a download.

Covers: FR7, CAP-10 (current approved version, no download), NFR7, NFR11, AR3 (`getLiveRevision` at request time), AR9 (same renderer), AR13, UX-DR23
⚑ Interim: IR-OP11 (no sign-in prompt), IR-A2 (until Epic 6 the page sits behind the basic-auth gate, so only people with those credentials can open it)

**Acceptance Criteria:**

**Given** a valid token
**When** `/s/{token}` is requested
**Then** the server resolves the case's live revision at request time and renders the link's format read-only with the shared renderer, full screen, with no app chrome, no editing and no download control
**And** media are display renditions and video poster frames or transcodes served by presigned GET, never originals

**Given** an owner/designer runs **Update approved version**
**When** the link is opened afterwards
**Then** it shows the new approved revision; a working head or superseded revision is never served

**Given** the page
**When** I use it
**Then** I can page with the pager, the arrow keys and full screen; on phones slides scale to width and I can swipe
**And** each slide's text is available to screen readers, and with reduced motion set there are no animated transitions

**Given** an unknown token
**When** it is requested
**Then** it shows "This case study is no longer available. Contact the person who shared it."

**Given** Epic 6 has not shipped
**When** anyone requests `/s/{token}` without the basic-auth credentials
**Then** they get the basic-auth challenge (IR-A2)

### Story 5.7: Turn off a shareable link

As an account/sales/social user or owner/designer,
I want to turn off a link,
So that a forwarded or outdated link stops showing client work.

Covers: CAP-10 (turn off, "no longer available"), AR11 (turn off link), AR13 (`revokedAt`, `expiresAt`), AR20, UX-DR22 (Turn off link), UX-DR28 (confirm)
⚑ Interim: IR-PERM (anyone who can share can turn off any link), IR-OP11 (no expiry picker; `expires_at` is honoured if set)

**Acceptance Criteria:**

**Given** the link list in the Share dialog
**When** I choose **Turn off link** and confirm
**Then** `revoked_at` is set, a link-turned-off event is recorded, the link shows as off in the list, and the Links count drops by one
**And** I can turn off any link, including one someone else created

**Given** a turned-off link
**When** anyone opens it
**Then** the page says "This case study is no longer available. Contact the person who shared it."

**Given** a link whose `expires_at` has passed
**When** anyone opens it
**Then** it shows the same "no longer available" page

**Given** a turned-off link
**When** I look for a way to turn it back on
**Then** there is none; a new link is created instead

### Story 5.8: Guardrail test suite for the end-of-Sprint-2 check

As the team,
I want every guardrail covered by automated tests that run against the pre-login build,
So that the first guardrail check at the end of Sprint 2 has evidence, not opinions.

Covers: AR5, NFR1, NFR3, NFR6, NFR7, Sprint 2 non-dev "first guardrail check"
⚑ Interim: IR-OP12 (the NFR1 tests check the interim boundary)

**Acceptance Criteria:**

**Given** `npm run test:guardrails`
**When** it runs in CI on the pre-login build
**Then** it runs one named test per guardrail and reports each separately:
- NFR6: generate fails with `NO_MATERIAL` from the UI action and from the worker with the details form filled in and no material
- NFR1: the LLM output schema has no asset, layout, template or slot fields; no code path writes an asset original; renditions only downscale whole images
- NFR7: export, Export all and link creation fail without an approved revision; `/s/{token}` never serves a working or superseded revision
- NFR2: approval needs a current per-block check made by a person, and no bulk check or approve use case exists (Story 4.8)
- NFR3: no table, environment variable, API or UI changes a guardrail or the permission matrix, and the matrix denies guardrail changes to every role

**Given** the suite
**When** it is handed to the guardrail check
**Then** a short checklist in the repo maps each test to its NFR and lists what is checked manually (hallucinations in technical content on a real case, and template design unchanged by eye)

## Epic 6: Sign in, users and fixed permissions

Each user signs in with one of three fixed roles; the admin manages users and roles only; no role sees or changes a guardrail. Epic 6 swaps only the actor resolver built in Story 2.3, replaces the basic-auth gate, and makes `/s/{token}` the only unauthenticated route.

### Story 6.1: Sign in with a fixed role

As an owner/designer, account/sales/social user or admin,
I want to sign in and land on the screen for my role,
So that I see and do only what my role allows.

Covers: FR8, CAP-11, AR11 (resolver swap, role read per request, dev profile disabled at cutover), UX-DR25, UX-DR2 (landing per role), PRD Story 6.1
Open (spine *Deferred*, not an OP): the sign-in method, Supabase Auth email and password or magic link, is chosen when this story starts. Microsoft SSO can come later without changing AR11.

**Acceptance Criteria:**

**Given** the sign-in screen
**When** I open the app without a session
**Then** I see one sign-in screen in Italian with no self-sign-up link, and after signing in with Supabase Auth I land on my role's page: owner/designer → Case studies table, account/sales/social → library, admin → Users

**Given** a signed-in user
**When** any server action or route handler runs
**Then** `access.getActor()` resolves the Supabase Auth session to the user's `profile` and reads `role` from the database on that request (no role in a cached token claim), and nothing else in the endpoints built in Epics 2–5 changes

**Given** a profile with `disabled_at` set, or an auth user with no profile
**When** they try to sign in or use an existing session
**Then** they are denied and returned to the sign-in screen

**Given** the cutover
**When** Epic 6 is deployed
**Then** the seeded dev `owner_designer` profile is disabled, never reassigned to a person, and every record it made keeps it as actor (so pre-login approvals aren't credited to a real person)
**And** the `system` profile can't sign in

**Given** the user menu
**When** I choose sign-out
**Then** my session ends and I'm on the sign-in screen

**Given** an account/sales/social user
**When** they sign in
**Then** they see only the library and the case study view; **+ New case study**, To review, the table view, Edit, Approve and Delete are absent, and the matching URLs and actions are refused

### Story 6.2: Retire the basic-auth gate and open shared links to their audience

As the team,
I want the pre-login gate replaced by real sign-in, with only shared link pages left open,
So that clients can open the links they receive and everything else needs an account.

Covers: AR12 (after Epic 6, `/s/{token}` is the only unauthenticated route), AR13, AR22 (prod environment), NFR9, CAP-10 (who can open the link)
⚑ Interim: IR-A2 (this is its cutover), IR-OP11 (the page opens for anyone with the link, `accessMode = unlisted`)
⛔ Blocked on: IR-HOST (only the prod-environment criterion)

**Acceptance Criteria:**

**Given** Epic 6 is deployed
**When** a request has no session
**Then** every route except the sign-in screen and `/s/{token}` redirects to sign-in, and `proxy.ts` no longer applies basic auth

**Given** a valid, active link
**When** anyone opens `/s/{token}` without signing in
**Then** the hosted presentation opens, matching the Share dialog's "Anyone with the link can view."

**Given** OP 11 is decided as something other than "anyone with the link"
**When** this story is revisited
**Then** the new mode is added to `access_mode` and enforced at `/s/{token}`, and the dialog sentence follows it (no change to tokens, case + format links or turning off)

**Given** the deployment docs
**When** prod is set up
**Then** prod has its own Supabase project and private EU bucket, migrations run on staging first and then prod, and staging keeps its basic-auth gate as a non-production environment

### Story 6.3: Manage users and their roles

As an admin,
I want to add users, change their role and remove them,
So that the right people get the right access, without me touching case content or permissions.

Covers: FR8 (admin), CAP-11, AR11 (role changes apply at next request; removal disables the profile), UX-DR24, UX-DR28 (Remove user confirm), PRD Story 6.2

**Acceptance Criteria:**

**Given** the first deployment with login
**When** the environment is set up
**Then** a documented, one-off step creates the first admin (no UI path creates an admin without an existing admin)

**Given** the Users screen
**When** I open it as admin
**Then** I see name, email, role and added-on date for every non-system user

**Given** **Add user**
**When** I enter an email and pick exactly one role (owner/designer, account/sales/social, admin)
**Then** a profile is created with that role and the person can sign in with the chosen sign-in method; the `system` role can't be picked

**Given** a user's role dropdown
**When** I change it
**Then** the new role applies at that user's next request

**Given** **Remove user**
**When** I confirm
**Then** the profile gets `disabled_at`, the user can no longer sign in, and their case studies, links and events stay

**Given** I'm the last admin
**When** I try to change my own role or remove myself
**Then** it is refused with a message, in the UI and in the action

**Given** the admin role
**When** they look for other surfaces
**Then** Case studies, library, case views, Templates, any permission matrix and any guardrail setting are absent, and the matching URLs and actions are refused

### Story 6.4: Guardrail and permission check after login

As the team,
I want the guardrail and permission tests re-run with real roles,
So that the final guardrail check in Sprint 3 confirms that no role, admin included, can change a guardrail.

Covers: NFR3, AR5, AR11, Story 6.3 of the PRD (no role configures guardrails), Sprint 3 non-dev "final guardrail check"

**Acceptance Criteria:**

**Given** signed-in test users of each role
**When** `npm run test:guardrails` and the permission suite run against the post-login build
**Then** every AD-11 matrix cell is checked end to end through the real actor resolver: each allowed action succeeds and each denied action returns 403

**Given** an admin session
**When** the suite probes every route and action
**Then** none reads case content or changes a guardrail or a permission, and no such setting exists in the UI, the database or the environment

**Given** the account/sales/social role
**When** the suite runs
**Then** it proves they reach approved cases only and can export and share but not create, edit, approve or delete

**Given** the Sprint 2 checklist from Story 5.8
**When** it is updated for Sprint 3
**Then** it records that NFR3 was re-checked after Epic 6 and lists the manual checks still to run before the demo
