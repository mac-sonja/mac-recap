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

FR1: The owner/designer creates a case study by hand, and the system gives it a unique, permanent ID (a database-generated uuid that is never changed or reused) and a readable **case history code** (client code, year, number, e.g. `LUM-2026-01`), fixed at creation. The code is what people see; the uuid is the only identifier exposed to other systems and used in URLs, and is ready for the later project-order link. Every case belongs to one client record, picked from the client list. There is no trigger at project close. (CAP-1, Stories 2.2 and 2.5)
FR2: The owner/designer uploads material (images, videos, text documents, PDFs) to a case study. The limit is 20 files of at most 50 MB each, of an allowlisted type. A file over the limits, or of a type not on the allowlist, is rejected without blocking the others. Any number of images and videos can be marked as favourite; the mark is optional. The owner/designer also fills in an optional details form (context, solution, results), which is the only place for typed project text, is saved, can be cited as a claim source, and never counts as material. (CAP-2, CAP-3, Stories 2.3–2.4)
FR3: The system generates a graphic case study in the background by applying MAC templates to the uploaded material. The case shows "In elaborazione" until the draft is ready; a failure returns it to Bozza with material and details intact. The narrative follows challenge, approach and result (always present, can't be removed or reordered), covers the technical and the graphic side, and uses only the uploaded material, the form answers and the client's info (description, industries and brief; SCP 2026-10-19). Every case study shows an About the client block with the client's logo, name, industries and description, as entered on the client and always current: drafts and approved case studies alike show the client's info as it is now. Template design and assets stay unchanged. Generation is refused when there is no material, even with the form filled in. Layouts are produced for every MVP export format. (CAP-4, CAP-5, Story 3.1)
FR4: Templates adapt their layout to the number of available media items, using the template's own media-count rules (slot mapping per count). (CAP-4, Story 3.2)
FR5: The owner/designer reviews and edits case studies through the review dashboard (every case with its status, a To review queue oldest first, delete only in Bozza) and the configurator (generated text in place, layout variant, shuffle, spacing, media replace / reorder / remove, font pairing and text scale per format). Layout, spacing and typography accept only template-defined values; media come only from this case's material; the preview matches the exported files exactly; there is no canvas-ratio control. (CAP-6, CAP-7, Stories 4.1–4.2)
FR6: Any owner/designer approves a case study after manually checking every text block against the material and form answers. Approve stays disabled until every block has a current manual check, no block overflows in any format, and no referenced material is deleted. There is no bulk check or bulk approve. Approval makes the case available for export and sharing. Editing an approved case keeps it approved. (CAP-8, Story 4.3)
FR7: Owner/designer and account/sales/social users export an approved case study in each MVP format (at least a 16:9 deck as PDF, a social carousel and an A4 PDF), and publish it as a shareable link to a hosted presentation. Each link shows one format of the current approved version, never a working copy, and offers no file download. The share dialog says who can open the link. A link can be turned off; a turned-off or expired link shows "no longer available". Account/sales/social users see approved case studies only; unapproved content has no view, export or share entry point. The tool does not post to social channels or the website. (CAP-9, CAP-10, Stories 5.1–5.2)
FR8: Users sign in with one of three fixed roles (owner/designer, account/sales/social, admin). The admin adds and removes users and assigns their role, and nothing else: no case content, no permission settings, no guardrail settings. The last admin can't drop their own admin role. Every action follows the AD-11 permission matrix. Delivered in Sprint 3. (CAP-11, Stories 6.1–6.2)
FR11 (MVP, before the demo; owner amendment 2026-10-16; amended by SCP 2026-10-19): Creating a client is a wizard: details (name, industries, description, logo, context, solution and results, all required), then up to 3 files of client material with at least 2 images, then the intro in the configurator. The system drafts the client's intro pages from the client's name, industries, description, brief and material, and the owner/designer edits, checks and approves them in the configurator. ([Sprint Change Proposal 2026-10-16, client intro and collections](sprint-change-proposal-2026-10-16-client-intro-and-collections.md); [Sprint Change Proposal 2026-10-19](sprint-change-proposal-2026-10-19.md))
FR12 (MVP, before the demo; owner amendment 2026-10-16): Editing a client opens the client overview: the intro and every case study of the client in one preview. Editing a case study there edits that case study.
FR13 (MVP, before the demo; owner amendment 2026-10-16): Owner/designer and account/sales/social users download a client pack (the client's approved intro and approved case studies), or build, save and export named collections of approved case studies (Deck 16:9 and PDF A4). A client with 2 or more case studies in a file gets its intro in front of them; otherwise each case study keeps its own intro. Text edits (owner/designers only) and hidden pages in a collection apply only to that collection.
CAP-12 (SPEC; no PRD FR number): every transition, upload, save, block check, claim edit, approval, export and link change is an append-only, timestamped event with its actor, and the generated draft is kept next to the approved version. The tool does not record hands-on time. Built by each epic as it goes, not as an epic of its own.

Out of MVP scope (listed for traceability only): FR9 MAC Productive via MCP (Epic 7), FR10 text-based case studies and whitepapers (Epic 8).

### NonFunctional Requirements

NFR1 (guardrail): The AI never alters graphic assets, the technical substance of the content, or template design. Where adaptation, shuffle and resize stand is OP 12.
NFR2 (guardrail): A person checks every generated claim against the uploaded material or form answers during review, before approval. Manual, not automated; no confidence scores or "AI verified" labels.
NFR3 (guardrail): No role can view or change the guardrails, admin included. There is no setting anywhere that disables or changes NFR1–NFR7.
NFR4: Owner/designer hands-on time from upload to approval is at most 20 minutes, target 15. If the claim check needs more time, NFR2 wins. Waiting for generation doesn't count; generation time has no limit. Counter-metric: time must not fall by shortening the review.
NFR5: The narrative follows challenge, approach and result, meets the Sprint 2 quality checklist, and covers both the technical and the graphic side.
NFR6 (guardrail): With no material, nothing is generated. The details form alone is not enough. For a client intro, the same rule: fewer than 2 client images, no intro (SCP 2026-10-19).
NFR7 (guardrail): Nothing is exported or shared before review and approval by an owner/designer. This includes client intros, client packs and collections; a collection contains only approved content and text written by an owner/designer (OP 15, resolved 2026-10-16).
NFR8 (constraint): Data lives in Supabase and files in a private Supabase Storage bucket, both in the EU. Standalone from MAC Productive.
NFR9 (constraint): Until login ships in Sprint 3, every deployed environment, shareable links included, is gated (AD-12), because real client material is in use.
NFR10 (constraint): Epics run one after another, never in parallel. Sprints due Oct 14, 21, 28; demo Oct 30, 2026.
NFR11 (accessibility): WCAG 2.2 AA for the app and the shared link page.
NFR12 (platform): Desktop web, primary 1440 px, minimum 1280 px; only the shared link page is fully responsive.
NFR13 (language): UI in Italian through one dictionary file; each case's narrative in Italian or English, default Italian.

### Additional Requirements

From the architecture spine (AD-1 to AD-21 are binding):

- **Starter template (Epic 2, first story):** `npx create-next-app -e with-supabase`. The first story pins every Stack version exactly (Node 24 LTS, TypeScript 6.0.3, Next.js 16.3.8 with `output: standalone`, React 19.3.0, Tailwind 4.3.3 / shadcn 4.21.4, supabase-js 2.117.3 / ssr 0.12.7 / CLI 2.120.0, `@anthropic-ai/sdk` 0.132.1, zod 4.6.5, Playwright 1.63.0, sharp 0.35.5, ffmpeg pinned in the Dockerfile), upgrades Tailwind to 4, and turns `cacheComponents` off.
- AR1 (AD-1): Modular monolith with modules `case-study`, `material`, `generation`, `rendering`, `sharing`, `access`, `jobs`; each with `domain/`, `application/`, `index.ts`, plus `ports/` and `adapters/` only at vendor seams. Cross-module imports only through `index.ts`; vendor SDKs only in adapters. Table and storage-prefix ownership per AD-1. Enforced by a lint rule.
- AR2 (AD-2): `case_study.id` is a DB-generated uuid, immutable, never reused; `project_order_ref` nullable and unset in the MVP. `case_study.code` is a separate, unique, immutable display code (AD-21); it is never used as a key or in URLs.
- AR3 (AD-3): `case_study.status` changes only through `case-study.transition`. Revisions have `working | approved | superseded`. `head_revision_id` and `approved_revision_id` pointers; `getLiveRevision` and `getEditableRevision` reads. Generation only from `draft`; delete only in `draft`, soft (`deleted_at`). A client intro (AD-23) has the same states and pointers on `client_intro` and changes only through `case-study.transitionIntro`. A revision belongs to exactly one subject, a case or a client intro.
- AR4 (AD-4): `CaseStudyDocument` (zod, jsonb) stored twice per revision, `generated_doc` (immutable) and `doc` (editable). Shared part (template@version, blocks with stable `blockId`, claims and check state, media set) and per-format part (variant, slot assignments, spacing, text scale, font pairing). No canvas ratio. Schema rejects a missing challenge/approach/result. The document stores no client values; the About block is filled at render time from the client's current info (AD-22). `rendering.relayout` is the only slot-assignment code. `schemaVersion` + `upgrade(doc)` on read. `FORMAT_NOT_IN_REVISION`. The document has `kind` ∈ `case_history | client_intro`; the challenge/approach/result rule applies only to `case_history`. Every page a template defines has a stable `pageKey` and a `role` ∈ `intro | body`.
- AR5 (AD-5): Guardrails are code (`generation/domain/guardrails.ts`, `access/domain/policy.ts`, `case-study` preconditions), never DB/env/UI. Each guardrail is enforced in a use case and covered by an automated test, so the end-of-Sprint-2 guardrail check runs on the pre-login build.
- AR6 (AD-6): `generate` fails with `NO_MATERIAL` before any LLM call unless there's at least one non-deleted asset; the same check backs the Generate button and the worker's claim. Claims tagged `aspect: technical | graphic`; a draft missing one is `MISSING_ASPECT`. The LLM also receives the client's current name, industries, description and brief (context, solution, results), read when the job runs (AD-22; SCP 2026-10-19).
- AR7 (AD-7): One `NarrativeGenerator` port, worker only. Adapter uses `client.beta.messages.parse` with the zod schema, model `claude-opus-5-5` from one constant, adaptive thinking, `effort: "high"`, server-side refusal fallbacks; `refusal` → `LLM_REFUSAL`. Versioned prompt files. Each revision records `response.model`, `fellBack`, `promptVersion`, `schemaVersion`.
- AR8 (AD-8): Private Supabase Storage bucket `material` in the project's EU region, created by migration, with `file_size_limit` 50 MB and `allowed_mime_types` set to the allowlist; no public access, service role is the only reader and writer. Browser uploads to a signed upload URL issued after `authorize`; size and type limits enforced by the bucket and re-checked from the object's metadata at confirm. Asset row only after that check. 20-file cap checked on issue and confirm. Signed GET ≤ 15 min. No versioning, so the app never deletes material objects; the one exception is a replaced or removed client logo, whose object is deleted (AD-22). Fixed key layout. No AWS S3. The client intro and collections change (SCP 2026-10-16) adds the client material key, owned by `case-study`: since SCP 2026-10-19 it is `clients/{clientId}/material/{assetId}.{ext}` (`clients/{clientId}/images/**` is never created), and removing a client file deletes its object, as for logos, and exports live at `exports/{contentHash}/{format}.{ext}` (owned by `rendering`).
- AR9 (AD-9): A format registry (`rendering/domain/formats.ts`) and one React renderer per format, used by the configurator, case study view, `/s/{token}` and exports. Exports: `renderToStaticMarkup` + Playwright `page.setContent`, no print route. Deck and A4 → PDF; image formats → ZIP of PNGs; Export all → one ZIP. Video shows its poster frame in static formats. An export renders an ordered list of parts (one part for a single case history). `export` is unique and immutable on `content_hash`, a hash of the parts, their revision ids, each part's client info, any collection edits and hidden pages, and the format. `ensureExport` reuses an export only when the hash matches, so after a client edit the next export renders again (AD-22).
- AR10 (AD-10): Postgres job table (`generate`, `export`, `rendition`), idempotent enqueue via partial unique index, `jobs_claim()` with `FOR UPDATE SKIP LOCKED`, 10-min lease renewed every minute, max 3 attempts then `failed` + `job_failed`. Web requests never call the LLM, Chromium or ffmpeg.
- AR11 (AD-11): Every action and route calls `access.getActor()` + `access.authorize()`. Permission matrix lives only in `policy.ts`. Role read from `profile` on every request. A `system` actor for the worker. Server-only data access with the service-role key; RLS denies `anon` and `authenticated`. A seeded dev `owner_designer` until Epic 6, disabled at cutover and never reassigned. The client intro and collections change (SCP 2026-10-16) adds `download client pack`, `manage collections` and `edit collection text` (owner/designer only), plus intro generation, editing and approval under `generate`, `edit` and `approve` with resource `client_intro`; `list clients` opens to account/sales/social for clients with an approved case history, read-only.
- AR12 (AD-12): HTTP basic auth in `proxy.ts` on every deployed environment until Epic 6, including `/s/{token}`. Forward-only SQL migrations applied staging → prod before the image.
- AR13 (AD-13): `share_link` (token ≥ 128 bits URL-safe, caseId, format, createdBy/At, expiresAt, revokedAt, accessMode enum). `/s/{token}` resolves via `getLiveRevision` at request time, read-only, display renditions only, no download.
- AR14 (AD-14): Favourite is a boolean on `asset` (`is_favourite`, default false), settable only on image and video assets; changing it records an event and never changes case status. There is no taxonomy.
- AR15 (AD-15): Templates are versioned code folders `rendering/templates/{templateId}/v{n}/` (variants, slots, media-count rules, allowed values, one renderer per format); a published version is never edited. `rendering.listVariants(templateId, format, mediaCount)` is the only variant source.
- AR16 (AD-16): No MVP code calls MAC Productive.
- AR17 (AD-17): Compare-and-set on `revision.version` (`STALE_REVISION`) and `case_study.head_version` (`STALE_HEAD`); no edits while `generating`; only `working` revisions writable (`REVISION_NOT_WRITABLE`); explicit idempotent `forkHead`; generate results create a new revision, discarded on head mismatch.
- AR18 (AD-18): `MaterialRef { asset | form_field, id }` resolved only via `material.resolveRefs`. Generate jobs carry a material manifest (refs + hashes) stored on the revision. Referenced material is soft-deleted only; `approve` fails with `MATERIAL_MISSING`. Upload and favourite never change case status. Anthropic limits (32 MB request, 600-page PDF, no DOCX, no video); Files API not used. `MaterialRef.kind` gains `client_field` (`description`, `industry`, `context`, `solution` or `results`; SCP 2026-10-19), resolved from the client's current values; a valid claim source that never counts as material.
- AR19 (AD-19): Per-block `check: { by, at, textHash } | null`, set only by a person, no bulk check. A check counts only while `textHash` matches. `approve(caseId, revisionId, expectedRevisionVersion, expectedHeadVersion)` checks every block on the server and requires an overflow-free result per format from the client. Claims carry `provenance` and optional validated `sourceRefs`, never shown as "verified".
- AR20 (AD-20): `case_event` append-only rows (`case_id`, `revision_id`, `actor_id`, `type`, `at`, `data`) on every transition, upload confirmation, save, block check/uncheck, claim edit, approval, export, link create and turn-off.
- AR21 (conventions): snake_case singular tables; uuid ids; `timestamptz` UTC, displayed Europe/Rome; zod in `domain/` as single definition; generated DB types; `Result<T, AppError>` with SCREAMING_SNAKE codes; structured JSON logs with no material or prompts; env read only in `src/shared/env.ts`; `case_study.locale` it|en default it.
- AR22 (deployment): One Docker image on the Playwright base, two processes (`node server.js`, `node dist/worker.js`). Environments `local`, `staging` (demo, gated), `prod` (from Epic 6), each with its own Supabase project and storage bucket. EU container host chosen by end of Sprint 1.
- AR23 (AD-21): `client` (uuid id, unique `name_key`, unique immutable `code`) owned by `case-study`; every case has `client_id`. Case code `{clientCode}-{year}-{nn}` is assigned inside `create_case_study` from `case_number_counter`, fixed once created, never reused.
- AR24 (AD-22): `client` gains `description` (≤400), `industries` (text array from a fixed list, at least one; it replaces the free-text `sector`, SCP 2026-10-19) and `logo_id`, which points to the client's current `client_logo` row under `clients/{clientId}/logos/`. A `client_brief` row holds the client's context, solution and results (≤5000 each). Name, industries, description, logo and brief are all required by the app (SCP 2026-10-19). Replacing or removing a logo deletes the old row and its object; there is no logo history. Client info is live: nothing about the client is snapshotted into a job, revision or document. Renderers fill the About block at render time from the client's current info, so a client edit shows at once in every case history of that client, drafts and approved ones alike, in every format, the case study view, new exports and shared links (SCP 2026-10-16, amendment).
- AR25 (AD-23): A client has one client intro: a document of kind `client_intro` with the case lifecycle, generated from the client's name, industries, description and brief, plus its material as OP 2 allows, and laid out with 2–3 of its images (image rows in `client_asset`; SCP 2026-10-19). It is checked and approved like a case history. Client info and client material are read live at render time. ([Sprint Change Proposal 2026-10-16, client intro and collections](sprint-change-proposal-2026-10-16-client-intro-and-collections.md))
- AR26 (AD-24): A collection is a named, ordered list of approved case histories owned by the `collection` module. It references live approved revisions and stores only its own text edits (per block) and hidden pages (per format and page key). It never writes a revision. Combined files come from `rendering.composeParts`.

### UX Design Requirements

UX-DR1: Navigation shell. Left sidebar with + New case study (owner/designer), Case studies, To review with count (owner/designer), **Clients** (owner/designer), Templates (owner/designer, scope per C4), Users (admin), the **Account** menu with sign-out. *RECAP* sits by the logo. Wizard and configurator are full-screen with a back arrow and no sidebar. Dialogs stack at most one level deep.
UX-DR2: Role-based absence. A control a role can't use is absent, not disabled. Guardrail controls are shown disabled with their reason. A direct URL to a surface the role can't use returns to the role's landing page (owner/designer: Case studies table; account/sales/social: library; admin: Users).
UX-DR3: Status badge. Always colour plus text label, using tokens `status-draft`, `status-generating`, `status-review`, `status-approved`. Labels from the OP 8 interim (Bozza, In elaborazione, Da approvare, Approvato).
UX-DR4: Owner/designer Case studies table. Columns ID (the case history code, monospace), Name, Client, Year, Status, Updated, Links (count, Approvato only). Search "Search name, client or code", ~250 ms debounce, case- and accent-insensitive over name, client name, client code and case code. Sorting by ID orders codes naturally (`LUM-2026-9` < `LUM-2026-10`). Status segmented filter with per-segment counts, combined with search (AND). Default sort Updated newest; header click sorts. Row click by status (Bozza → wizard at first incomplete step; In elaborazione → no-op with "Still generating" tooltip; Da approvare → configurator; Approvato → configurator plus View). Overflow menu: View, Export, Share (Approvato), Delete (Bozza, with confirm). Rows in In elaborazione update without reload. Empty and no-results states with their copy.
UX-DR5: To review queue. The table pre-filtered to Da approvare, oldest first; sidebar count; no assignment or claiming; empty copy "Nothing to review."
UX-DR6: Library view. Card grid (cover = first slide of the 16:9 deck, name, client, year; no tags); approved only; no status filter or badge; same search; facets Client and Year as multi-select chips with active filters and Clear all; newest approved first; paginates at 24, no infinite scroll; empty copy "No approved case studies yet."; owner/designer Table / Library toggle.
UX-DR7: Wizard step 0. Name (required) and client (required, picked from the existing clients; no free text, no adding here), year defaulting to the current year. The case is created and its code shown in the header; saved as Bozza from that moment; leaving and returning loses nothing.
UX-DR8: Wizard step 1 Material, in the focused wizard (per `mockups/material-step.html`). Dropzone plus browse button with accepted-type chips; no pasted text; copy "Up to 20 files, 50 MB each."; per-file inline rejections ("Over 50 MB. Not uploaded." / unsupported-type copy / 21st file) that don't block others; parallel uploads with per-file progress, progress and rejections announced to screen readers; rows (thumbnail, name, size, remove, plus a **Preferito** toggle on images and videos); remove is immediate, with no confirm and no undo; **Avanti** is active from the first uploaded file, and Dettagli and Genera can't be reached with 0 files.
UX-DR9: Wizard step 2 Details. Context, Solution, Results textareas with one-line prompts, a "{n} of 3" counter, all optional.
UX-DR10: Wizard step 3 Generate. Summary "{n} files, {m} of 3 details filled."; Generate disabled without material, with the visible reason linked via `aria-describedby`; processing state with leave-page copy and Back to case studies; no ETA or percentage; failure banner "Generation didn't finish. Your material and details are saved." with Try again.
UX-DR11: Draft-ready toast anywhere in the app: "{Name} is ready to review." with Open (C3).
UX-DR12: Configurator frame. Top bar (back, name, status badge, save state, Approve or Update approved version); left Formats pane (one entry per registry format: name, ratio, pixel size, looked-at check mark); centre canvas at fit-to-pane zoom with page strip for multi-page formats; right pane Edit and Check tabs. At 1024–1279 px the panes narrow and the right pane can collapse. Below 1024 px: "The configurator needs a larger screen." Client intro and collections (SCP 2026-10-16): three modes share the frame: *case history* (as today), *client intro* (same panes, intro blocks), *client overview* (left pane lists the intro and the client's case histories; the format switch moves to the top bar). The collection configurator (UX-DR39) reuses the frame with fewer controls.
UX-DR34: Adding material after generation. To add material to a case in Da approvare or Approvato, the owner/designer goes back to the wizard's Material step; the case keeps its status, and the new material is available to Replace media (EXPERIENCE `[ASSUMPTION]`, spine *Deferred: Regenerate*).
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
UX-DR28: Confirm dialogs only for Approve, Update approved version, Delete, Elimina cliente (owner, 2026-10-19: clients can be deleted (soft), with their cases; the user types the client's name), Remove user, Turn off link; everything else undoable. Banned anywhere: approve all, tick all, bulk approve, auto-approve, any guardrail control, posting to social channels, infinite scroll.
UX-DR29: Copy and voice. All UI copy in Italian through one dictionary file (English lines in the spec are the source for the Italian microcopy); plain verbs, no hype, no exclamation marks; generated text is never described as "verified".
UX-DR30: Responsive rules. Case studies / Users / Templates: sidebar collapses to icons at 1024–1279 px, read-only usable list below 1024 px. Wizard and configurator below 1024 px show the "needs a larger screen" message. First load shows skeleton rows or cards.
UX-DR31: Design tokens (DESIGN.md). Implement the fixed token names (colours, typography roles incl. mono, rounded, components button-primary, status-badge, focus-indicator) as theme variables with placeholder values, so values can be filled later without code changes. Tool chrome tokens never style template output.
UX-DR32: Templates surface (conditional on C4). Browse templates and their variants per format with sample content; turn variants on and off (at least one per format stays on); see usage counts.
UX-DR33: `MISSING_ASPECT` warning shown in the configurator (spine AD-6; placement and blocking are conflict A3).
UX-DR35: Clients (owner/designer). Table of clients (ID: the client code, mono; Name; Case histories count; owner 2026-10-19), search over name and code, default sort Name A–Z. SCP 2026-10-19 (replacing the dialogs of SCP 2026-10-16): **Aggiungi cliente** opens the client wizard (full-page, like a case history): **Dettagli** (Nome, Settore pills multiselect, Descrizione, Logo, Contesto, Soluzione, Risultati; all required), **Materiale** (up to 3 files, at least 2 images; **Crea introduzione**), **Introduzione** (the configurator in client intro mode; designed with the owner, hidden until then). Every row opens the client page, finished or not; an unfinished client is completed through **Modifica cliente** (owner, 2026-10-19). **Modifica cliente** opens the wizard at step 1 until Story 4.12, stating that the code stays the same and that changes apply to all the client's case histories, approved ones included; from Story 4.12 it opens the client overview (UX-DR38), where **Dati cliente** holds the same fields and the client material. Account/sales/social get a read-only Clients list of clients with an approved case history, with **Scarica** per row and no add or edit; row click opens the client page: logo, client name and code, industries as pills (SCP 2026-10-19), description, **Edit client**, and the Case history table limited to that client, with **New case history** preselecting the client. **Elimina cliente** on wizard step 1 of an existing client (owner, 2026-10-19: clients can be deleted (soft), with their cases): a dialog where the user types the client's name; the client and all its case histories, approved ones included, are soft-deleted. Not on the Clients list. Below 1024 px read-only.
UX-DR36: About the client block. Shown in every format of a case study: logo, client name, industries (SCP 2026-10-19), description, always the client's current info (drafts and approved case studies alike). Read-only in the configurator, with the hint "Modifica i dati nella pagina del cliente. Le modifiche si vedono in tutte le sue case history." Not in the Check tab list. Parts without a value are hidden; the block is hidden when the client has no description, industries or logo (since SCP 2026-10-19 all are required, so this only covers a client whose wizard isn't finished).
UX-DR37: Client material (was Client images; SCP 2026-10-19). Up to 3 files per client, at least 2 images, in wizard step 2 **Materiale** and in **Dati cliente**: drop zone, file rows in order, **Rimuovi**; in **Dati cliente** also **Sostituisci** and drag or menu to reorder, and an image can't be removed when only 2 remain. Images PNG, JPEG or WebP ≥1600 px on the short side; other files as case material (Story 2.7 types, ≤50 MB). Copy: "Carica fino a 3 file, almeno 2 immagini. Le immagini servono per le pagine di introduzione."; a 4th file: "Massimo 3 file."
UX-DR38: Client overview. Left pane: **Introduzione** (with its status badge), then every case history of the client that has a document, newest first, each with code, name and status badge. A Bozza case history is listed greyed with "Non ancora generata". Centre: one continuous preview of the selected format, every part in that order, with a divider per part. Clicking a part in the list scrolls to it. Editing a block edits that part (status and save state shown for that part). Right pane: Edit and Check for the selected part. The top bar has the format switch, **Dati cliente** and, for the selected part, its **Approve** or **Update approved version**.
UX-DR39: Collections. Library cards get a checkbox. With one or more selected, a bar shows "{n} selezionate" and **Crea raccolta**, which asks for a name and opens the collection configurator. Left pane: the parts in order, a client's case histories grouped under its computed intro (shown locked). Reorder groups and case histories within a group by drag handle or by the menu "Sposta su / giù". Centre: continuous preview per format. Right pane: **Testo** (edit the selected block, owner/designers only, IR-COLL-EDIT), **Pagine** (hide or show the selected page). Edited blocks show "Modificato in questa raccolta". Hidden pages show as a collapsed strip with **Mostra**. Top bar: name (editable), save state, **Esporta** and **Esporta tutto** (Deck 16:9 and PDF A4). No layout, media or typography controls. A sidebar item **Raccolte** lists collections (name, parts, updated, created by) with open, rename and delete (with confirm).
UX-DR40: Combined download copy. The client pack and collection exports show progress and then the browser download, like UX-DR21. When a client's intro isn't approved: "L'introduzione di {client} non è ancora approvata: le sue case history usano la propria introduzione."

### Interim Rules Register

These are the rules the stories are built against. None of them is a decision; each one is replaced when its owner decides. A story marked `⚑ Interim: IR-x` has to be revisited when IR-x changes.

| ID | Open point / conflict | Owner | Interim rule used by the stories | Source |
| --- | --- | --- | --- | --- |
| IR-OP1 | OP 1 export formats | PRD owner | Format registry holds UX Option A only: Deck 16:9 (1920×1080, PDF), Social carousel 4:5 (1080×1350, ZIP of PNGs), PDF A4 portrait (PDF). Adding formats means adding registry entries and template renderers. | SPEC CAP-9, ui-flows, AD-9 |
| IR-OP2 | OP 2 data processing logic | PRD owner | **No interim rule.** Stable regardless: the `NarrativeGenerator` port, `MaterialRef`s and the manifest shape (AD-18). Which material types the LLM reads, and how each is turned into input, is open. | AD-7, AD-18 |
| IR-OP3 | OP 3 taxonomy values | PRD owner | **Resolved 2026-10-14:** no taxonomy. Tags, properties and flags are dropped; favourites replace them (AR14). No interim rule remains. | PRD OP 3, AD-14 |
| IR-OP4 | OP 4 account/sales/social browsing | PRD owner | UX proposal: card library with search, Client / Year facets, paginated at 24, approved only. | EXPERIENCE (library view) |
| IR-OP8 | OP 8 status lifecycle | PRD owner | Option A: `draft` Bozza → `generating` In elaborazione → `in_review` Da approvare → `approved` Approvato. Links are a count, not a status. No path back from Approvato. | AD-3, EXPERIENCE |
| IR-OP11 | OP 11 link access | PRD owner | `accessMode = unlisted` (anyone with the link), with `expiresAt` present but unused in the UI. Share dialog says "Anyone with the link can view." Combined with IR-A2 until Epic 6. | AD-13, FR7 |
| IR-OP12 | OP 12 what counts as altering | Design team | Renditions only downscale whole images (no upscaling, crop, recolour or filter) and make video poster frames/transcodes. Media are placed whole (fit). No crop or focal point. Media-count adaptation and Shuffle pick only among designed variants. | AD-5, AD-15, EXPERIENCE |
| IR-OP13 | OP 13 recording the measures | PRD owner | The tool records no hands-on time and has no timer UI; it keeps the append-only `case_event` log and `generated_doc` next to the approved `doc`. | AD-20, UX Q3 |
| IR-OP14 | OP 14 what a favourite means for generation (Epic 3) | PRD owner | Favourites are stored and shown, not used by generation. | AD-14, PRD OP 14 |
| IR-NFR5 | NFR5 quality checklist (Sprint 2 deliverable) | Non-dev, Sprint 2 | **No interim rule.** The schema enforces challenge / approach / result and both aspects are tagged; the checklist content for prompts is open. | SPEC Open Questions |
| IR-HOST | Container host | Team, end of Sprint 1 | **No interim rule.** Any EU host that runs one image with two processes. | Spine Deferred, AR22 |
| IR-A1 | A1 / C1 live edits vs claim check | PRD owner | Edits to an approved case are staged on a working head; links keep serving the approved revision until an owner/designer re-checks the edited blocks and runs **Update approved version**. **Discard changes** returns to the live version. | AD-3, AD-19, EXPERIENCE |
| IR-A2 | A2 links before login | PRD owner | `/s/{token}` stays behind the AD-12 basic-auth gate until Epic 6; after Epic 6 it is the only unauthenticated route. | AD-12 |
| IR-A3 | A3 `MISSING_ASPECT` | UX | Detected and shown as a warning in the configurator; it does not block approval. | AD-6 |
| IR-A4 | A4 zero images or videos | Design team | **No interim rule.** Generation is allowed from texts or PDFs alone (NFR6 is satisfied); what the template renders for zero media is not yet supplied. | AD-6 |
| IR-A5 | A5 concurrent editing | UX | The server rejects a stale write with `STALE_REVISION` / `STALE_HEAD`; the client doesn't retry and reloads the revision. No dedicated "someone else changed this" state is designed. | AD-17 |
| IR-C3 | C3 autosave and toast not in any FR | PRD owner | Built as UX describes: autosave with save states, and an in-app polled toast when a draft is ready. No email or Slack. | EXPERIENCE, AD Deferred |
| IR-C4 | C4 template maintenance | PRD owner | `manage templates` exists in the policy matrix, but the Templates surface and the `template_variant_state` table are **not built** unless the PRD owner adopts the UX scope. | AD-15, AD-11 |
| IR-COLL-EDIT | OP 15 who may edit collection text | PRD owner | **Resolved 2026-10-16** (owner, SCP 2026-10-16 client intro and collections): only owner/designers can edit text in a collection. Account/sales/social can reorder, hide pages and export. Collection exports contain only text from approved revisions or written by an owner/designer. Planned upgrade if needed: an owner/designer **Approva modifiche** for edits made by others. Assumption: "PM" in the owner's request means an owner/designer in the tool. | NFR7, AD-24 |
| IR-PERM | Turn off any link | PRD owner (assumption) | Anyone who can share can turn off any link. | AD-11 `[ASSUMPTION]`, SPEC Assumptions |

### FR Coverage Map

| Requirement | Epic | What it covers |
| --- | --- | --- |
| FR1 | Epic 2 | Manual creation with a permanent uuid, readable code and client record |
| FR2 | Epic 2 | Upload (20 × 50 MB, allowlist), favourites, details form |
| FR3 | Epic 2, Epic 3 | Background generation, narrative from material, form and client info only, About the client block, NFR6 gate, layouts per format |
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
| FR11 | Epic 2, 3, 4 | Client wizard and client material (Stories 2.15, 2.16; SCP 2026-10-19), client intro draft, editing and approval (before the demo) |
| FR12 | Epic 4 | Client overview configurator (before the demo) |
| FR13 | Epic 5, 6 | Client pack download, collections, combined export, permissions (before the demo) |
| FR9, FR10 | — | Post-MVP (Epics 7–8), not in this breakdown |

## Epic List

Epic numbering follows PRD v2 (Epic 1 is team setup, not product scope). Epics run strictly in order, never in parallel.

### Epic 2: Create a case study and collect its material (Sprint 1, due 2026-10-14)
The owner/designer creates a case study by hand, gets its permanent ID, uploads files, marks favourite images and videos and fills in the details form, all saved in Supabase (database and storage) inside a gated environment. Also lays the foundation later epics build on: starter scaffold, module skeleton, actor and policy seam with a dev actor, basic-auth gate, event log, app shell, design tokens and a basic Case studies table.
**FRs covered:** FR1, FR2, CAP-12 (also FR11, client wizard and client material, Stories 2.15 and 2.16; SCP 2026-10-19)

### Epic 3: Generate a graphic case study from the material (Sprint 2, due 2026-10-21)
The owner/designer presses Generate and can leave. The worker produces a draft from MAC templates: a challenge / approach / result narrative built only from this case's material and form answers, laid out for every MVP format and adapted to the media count. The case lands in To review with a toast.
**FRs covered:** FR3, FR4, NFR1, NFR5, NFR6, CAP-12 (also FR11, client intro draft)

### Epic 4: Review, edit and approve a case study (Sprint 2)
The owner/designer works the To review queue, refines the draft in the configurator, checks every block against the material and approves; later edits to an approved case go live only through Update approved version.
**FRs covered:** FR5, FR6, NFR2, NFR7 (approval), CAP-12 (also FR11 intro review, FR12 client overview)

### Epic 5: Find, export and share approved case studies (Sprint 2)
Users find approved cases in the library, preview every format, export files and publish shareable links that always show the live approved version and can be turned off.
**FRs covered:** FR7, NFR7 (export and share), CAP-12 (also FR13, client packs and collections)

### Epic 6: Sign in, users and fixed permissions (Sprint 3, due 2026-10-28)
Each user signs in with one of three fixed roles; the admin manages users and roles only; no role sees or changes a guardrail. The pre-login gate is replaced and `/s/{token}` becomes the only unauthenticated route.
**FRs covered:** FR8, NFR3 (also FR13 permissions)

## Story conventions

- `Covers:` lists the requirements a story implements. `⚑ Interim: IR-x` means the story is built on that interim rule and is revisited when it changes. `⛔ Blocked on: IR-x` means no interim rule exists: the story is built up to that point but can't close until the decision lands. `UX gap:` marks behaviour the sources require but EXPERIENCE.md doesn't design; the story uses the smallest placement consistent with EXPERIENCE.md and flags it for UX.
- Every story that adds a server action or route calls `access.getActor()` and `access.authorize()` first (AR11), returns `Result<T, AppError>` (AR21), uses Italian copy from the dictionary (UX-DR29), and emits the `case_event` rows its mutations require (AR20). These are not repeated in each story's criteria.
- NFR10 (sequential epics, sprint dates) is met by the epic order itself: stories within an epic depend only on earlier stories and earlier epics, never later ones.
- Tables and storage prefixes are created by the first story that needs them, through a forward-only migration (AR12).
- **Client intro and collections stories** (2.15, 2.16 (SCP 2026-10-19), 3.9, 4.11, 4.12, 5.9, 5.10, 5.11, 6.5; [Sprint Change Proposal 2026-10-16, client intro and collections](sprint-change-proposal-2026-10-16-client-intro-and-collections.md)) are MVP and built before the October 30 demo (owner amendment 2026-10-16: "Tutto. dovremmo farcela"). Epics stay in order (NFR10); inside each epic a new story comes after the stories it depends on and after that epic's demo-path stories. Sprint 2: 2.15 → 2.16 → 3.2–3.8 → 3.9 → 4.1–4.8 → 4.11 → 4.9 → 4.12 (client creation first, owner 2026-10-19). Sprint 3: 5.1–5.8 → 5.9 → 5.10 → 5.11 → 6.1–6.4 → 6.5. If dates slip, the owner decides at each checkpoint; the proposed slip order is 5.11, 5.10, 4.12, 5.9, then the client intro (3.9, 4.11, 2.16, 2.15), and the demo path (3.2–3.8, 4.1–4.8, 5.1–5.4) never slips.

## Epic 2: Create a case study and collect its material

The owner/designer creates a case study by hand, gets its permanent ID, uploads files, marks favourite images and videos and fills in the details form, all saved in Supabase (database and storage) inside a gated environment. The epic also lays the foundation the later epics build on.

### Story 2.1: Scaffold the app from the starter and pin the stack

As the team,
I want the app scaffolded from the architecture's starter with every version pinned and the module boundaries enforced,
So that every later story builds on the same stack and can't leak vendor code or cross-module imports.

Covers: Starter template, AR1, AR16, AR21, Stack table

**Acceptance Criteria:**

**Given** an empty repository
**When** the app is created with `npx create-next-app -e with-supabase`
**Then** `package.json` pins every Stack version exactly (no `^`, `~` or `latest`): Next.js 16.3.8, React and react-dom 19.3.0, TypeScript 6.0.3, Tailwind CSS 4.3.3, shadcn 4.21.4, `@supabase/supabase-js` 2.117.3, `@supabase/ssr` 0.12.7, Supabase CLI 2.120.0, `@aws-sdk/client-s3` / `s3-presigned-post` / `s3-request-presigner` 3.1147.0 (removed in Story 2.11, AD-8), `@anthropic-ai/sdk` 0.132.1, zod 4.6.5, Playwright 1.63.0, sharp 0.35.5
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
**Then** both processes run, staging has its own Supabase project and its own private storage bucket, and the app responds only behind the basic-auth gate

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
**Then** it holds the complete AD-11 matrix as code for every action (list cases, create/upload/mark favourites/fill details/generate/edit, delete draft case, approve/update approved version/discard, view/export, job work, create link, turn off link, manage templates, manage users and roles, change permissions or guardrails)
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
⚑ Interim: IR-OP8, IR-OP13 (the `case_event` log is what the tool keeps for the measures; no hands-on time)
UX gap: narrative language (`it` | `en`) has no designed control; it is placed in this form as a select defaulting to Italiano.
Note (amended 2026-10-15, [Sprint Change Proposal 2026-10-15](sprint-change-proposal-2026-10-15.md)): the client is picked from the client list and the header shows the case history code; Story 2.12 delivers these ACs. The migration AC's free-text `client` column is superseded by Story 2.12.

**Acceptance Criteria:**

**Given** the `case-study` module
**When** the migration for this story runs
**Then** a `case_study` table exists with `id uuid default gen_random_uuid()`, `name`, `client`, `year`, `locale` (it | en, default it), `status`, `project_order_ref` (nullable), `head_revision_id` and `approved_revision_id` (nullable), `head_version`, `created_by`, `created_at`, `updated_at`, `deleted_at`
**And** an append-only `case_event` table exists (`case_id`, `revision_id` nullable, `actor_id`, `type`, `at`, `data`) with a database rule or trigger that rejects UPDATE and DELETE
**And** RLS denies `anon` and `authenticated` on both

**Given** I click **+ New case study**
**When** I enter a name, pick a client from the list (both required) and confirm, with year prefilled to the current year and editable
**Then** the case is created in status `draft`, the wizard header shows its case history code (e.g. `LUM-2026-01`) in the `mono` style and the Bozza badge, and a `case_created` event is recorded with my actor id
**And** the form doesn't submit while the name is empty or no client is picked, and says which field is missing

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

Covers: UX-DR4 (columns, search, sort, Bozza row click, empty and no-results states, `/` shortcut), UX-DR30 (skeleton, below 1024 px), CAP-6 (list part), AR11 (list scope)
⚑ Interim: IR-OP8
Note: the status filter, row actions, delete and the To review queue come in Story 4.1, when more than one status exists.
Note (amended 2026-10-15, [Sprint Change Proposal 2026-10-15](sprint-change-proposal-2026-10-15.md)): the ID column shows the case history code and search matches the codes; Story 2.12 delivers these ACs.

**Acceptance Criteria:**

**Given** case studies exist
**When** I open Case studies
**Then** a table shows ID (the case history code, monospace), Name, Client (the client's name), Year, Status (badge), Updated and Links (blank for now), sorted by Updated, newest first
**And** clicking a column header sorts by it, and clicking again reverses the order
**And** skeleton rows show while the first load is in progress
**And** soft-deleted cases never appear

**Given** the search field ("Search name, client or code")
**When** I type, with a ~250 ms debounce
**Then** rows filter by name, client name, client code or case code, case- and accent-insensitively (e.g. "citta" matches "Città")
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

**Given** the list use case
**When** it authorizes `list cases` with a scope (all statuses for owner/designer, approved only for account/sales/social)
**Then** the query filters by exactly the scope that was authorized, and a test with an account/sales/social actor gets approved cases only (follow-up from the Story 2.3 review, `deferred-work.md`)

**Given** a viewport narrower than 1024 px
**When** I open Case studies
**Then** the table still lists, searches and sorts, read-only
**And** **+ New case study** and a Bozza row click show "needs a larger screen" copy instead of opening the wizard

### Story 2.7: Upload project files

As an owner/designer,
I want to drop up to 20 project files into a case study,
So that the material is stored safely with the case and ready for generation.

Covers: FR2 (files), CAP-2, AR8, AR18 (soft delete, upload doesn't change status), AR20, UX-DR8 (dropzone, limits, progress, rows, remove), NFR8, PRD Stories 2.1 and 2.3
⚑ Interim: IR-OP12 (images are shown whole, scaled by the browser; no crop)

**Acceptance Criteria:**

**Given** the `material` module
**When** the migration and infrastructure for this story are applied
**Then** an `asset` table exists (uuid id, `case_id`, kind, original file name, content type, size, storage key, `created_by`, `created_at`, `deleted_at`) with RLS denying `anon` and `authenticated`
**And** each environment's Supabase project has the private bucket `material`, created by migration, with `file_size_limit` 50 MB and `allowed_mime_types` set to the allowlist, no public access, and the service role as the only reader and writer
**And** keys follow `cases/{caseId}/assets/{assetId}/original.{ext}` and are built only in `material/adapters`

**Given** wizard step 1 (Material) for a draft case
**When** I drop files or use **browse**
**Then** for each file the server, after `authorize`, checks the case has fewer than 20 non-deleted files and the type is on the allowlist in `material/domain/files.ts` (JPEG, PNG, WebP, MP4, MOV, PDF, plain text, Markdown, DOCX), then issues a signed upload URL for that file; size and type limits are enforced by the bucket and re-checked at confirm
**And** the browser uploads directly to storage, several files in parallel, each with its own progress bar announced to screen readers

**Given** an upload has finished
**When** the browser asks the server to confirm it
**Then** the server checks the object's metadata (size and type), re-checks the 20-file cap, and only then creates the `asset` row and records an `asset_uploaded` event
**And** the case status does not change

**Given** a file over 50 MB, a file of a type not on the allowlist, or a 21st file
**When** I add it with other valid files
**Then** only that file is rejected, inline on its row ("Over 50 MB. Not uploaded." / "This file type isn't supported. Use images, videos, texts or PDFs." / a 20-file limit message), and the other files upload normally
**And** each rejection is announced to screen readers, like upload progress
**And** a request that bypasses the UI and exceeds a limit is rejected by the bucket or by the confirm step, never stored as an asset

**Given** an uploaded file
**When** its row appears
**Then** it shows a thumbnail (images: the original fetched by a signed GET valid ≤ 15 minutes and scaled to fit by the browser; other types: a type icon), the file name and size

**Given** an uploaded file
**When** I remove it
**Then** it disappears at once, with no confirm dialog and no undo; the asset is soft-deleted (`deleted_at`), never hard-deleted (AR18)
**And** a removal event is recorded

**Given** a case with 0 non-deleted files
**When** wizard step 1 is shown
**Then** **Avanti** is inactive, and Dettagli and Genera can't be reached

### Story 2.8: Retire pasted text and the taxonomy

As the team,
I want the pasted-text, taxonomy and restore backends removed with one forward migration,
So that material means uploaded files only and no dead tables or code remain before favourites are added.

Replaces: Story 2.8 "Add pasted text as material" and the taxonomy part of Story 2.9 "Tag, property and flag deliverables" (Sprint Change Proposal 2026-10-14). Lands before Story 2.9.
Covers: FR2, AR6 (material = at least one non-deleted asset), AR14 (no taxonomy), AR18 (`MaterialRef` kinds `asset | form_field`), AR12 (forward-only migrations)

**Acceptance Criteria:**

**Given** the `material` module
**When** the forward migration for this story runs
**Then** `has_material` is rewritten to "case exists and has at least one non-deleted asset"
**And** `material_term`, `taxonomy_term`, `set_material_terms`, `case_material_terms`, `text_item`, and their triggers and functions are dropped; `restore_asset` stays only as `removeAsset`'s internal compensation when the event write fails (owner decision 2026-10-14, no restore feature)
**And** `src/shared/db.types.ts` is regenerated

**Given** the code
**When** this story is done
**Then** the text-item and taxonomy slices are removed, along with `restoreAsset` / `restoreTextItem`, their actions, tests and error mappings (`TEXT_EMPTY`, `UNKNOWN_TERM`), and the policy action `tag`
**And** `withinCodePoints`, `hasNoNul` and `caseIdSchema` are moved out of `text-item.ts` first, so `details-form.ts` keeps working
**And** `hasMaterial` lives in the asset repository
**And** `MaterialRef` kinds are `asset | form_field`

**Given** `material.hasMaterial(caseId)`
**When** it is called
**Then** it returns true only when the case has a non-deleted asset, and false when the details form is filled in and there is no asset

**Given** the migrations folder
**When** this story is reviewed
**Then** no applied migration is edited
**And** the `check`, `db` and `image` CI jobs pass

### Story 2.9: Mark images and videos as favourite

As an owner/designer,
I want to mark any of my images and videos as favourite,
So that the ones I like best are recorded with the case.

Replaces: Story 2.9 "Tag, property and flag deliverables" (Sprint Change Proposal 2026-10-14).
Covers: FR2 (favourites), AR14, UX-DR8 (Preferito toggle)
⚑ Interim: IR-OP14 (favourites are stored and shown, not used by generation)

**Acceptance Criteria:**

**Given** the `material` module
**When** the forward migration for this story runs
**Then** `asset.is_favourite boolean not null default false` exists
**And** setting it on an asset that isn't an image or a video is rejected

**Given** an image or video row in wizard step 1
**When** I use its **Preferito** toggle
**Then** the mark changes at once and survives reload
**And** an event is recorded and the case status does not change
**And** I can set it as soon as the file has finished uploading

**Given** a PDF or text-document row
**When** the row is shown
**Then** it has no **Preferito** toggle

**Given** a case's images and videos
**When** I mark favourites
**Then** any number can be marked, and none are required to continue

### Story 2.10: Fill in the details form

As an owner/designer,
I want to write short answers on context, solution and results,
So that the narrative can use what isn't in the files, and each answer can be cited when I check claims.

Covers: FR2 (details form), CAP-3, AR18 (form fields as stable-key refs, never material), UX-DR8 (Avanti gate), UX-DR9, UX-DR4 (Bozza row opens first incomplete step)

**Acceptance Criteria:**

**Given** the `material` module
**When** the migration for this story runs
**Then** a `context_form` table exists, one row per case, with fields keyed `context`, `solution`, `results`, and RLS denying `anon` and `authenticated`

**Given** wizard step 2 (Details)
**When** it opens
**Then** it shows three sections, Context, Solution and Results, each a textarea whose placeholder is a one-line prompt (e.g. "What did the client need, and why?"), and the counter "{n} di 3 compilati" in the footer
**And** **Avanti** is active from the start

**Given** I type in a field
**When** I pause or leave the field
**Then** the answer is saved with the case and survives reload, the counter updates, and a save event is recorded

**Given** wizard step 1 (Material)
**When** `material.hasMaterial(caseId)` is true (at least one uploaded file)
**Then** **Avanti** is enabled; before that it is inactive and step 2 can't be reached

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

### Story 2.11: Store project files in Supabase Storage

As the team,
I want project files stored in a private Supabase Storage bucket,
So that the app runs with Supabase alone.

Covers: FR2, AD-8 ([storage proposal](sprint-change-proposal-2026-10-14-storage.md); after the Story 2.7 UI)

**Acceptance Criteria:**

**Given** the `material` module
**When** this story's migration runs
**Then** a private bucket `material` exists with `file_size_limit = 52428800` and `allowed_mime_types` set to the allowlist in `material/domain/files.ts`
**And** it has no public access, and only the service role reads and writes it

**Given** an upload request that passed `authorize` and the presign checks
**When** the server issues the upload
**Then** the `adapters/supabase/object-storage.ts` adapter returns a signed upload URL (`createSignedUploadUrl`), and the browser PUTs the file to it

**Given** an upload has finished
**When** the browser asks the server to confirm it
**Then** the adapter reads the object's metadata and the server checks its size and type before creating the `asset` row

**Given** an uploaded file is displayed
**When** its thumbnail is requested
**Then** the adapter returns a signed GET URL valid ≤ 15 minutes

**Given** the repository after this story
**When** I search the code, `package.json`, `src/shared/env.ts` and `.env.example`
**Then** the S3 adapter, the `@aws-sdk/*` dependencies and `S3_BUCKET` / `S3_REGION` are gone, and no `@aws-sdk` import remains

**Given** the browser upload helper
**When** it uploads a file
**Then** it uses the signed-upload shape (method, URL and headers), not POST form fields

**Given** the updated tests
**When** CI runs
**Then** the `check`, `db` and `image` jobs pass, and the DB tests run against the bucket

### Story 2.12: Clients as records, with readable case history codes

As an owner/designer,
I want every case history to belong to a client record and to carry a short code like `LUM-2026-01`,
So that I can recognise and quote a case history at a glance, and clients are spelled one way.

Covers: FR1 (amended), CAP-1, AR2, AR23, AR12, AR20, UX-DR4, UX-DR7 ([Sprint Change Proposal 2026-10-15](sprint-change-proposal-2026-10-15.md)). It delivers the amended ACs of Stories 2.5 and 2.6.
Order: first. It has to land before 2.13 and before Epic 3.

**Acceptance Criteria:**

**Given** the forward migration for this story
**When** it runs on a database that has cases with free-text clients
**Then** a `client` table exists (uuid `id`, `name`, unique `name_key`, unique `code`, `created_by`, `created_at`, `updated_at`), with RLS denying `anon` and `authenticated`
**And** every existing case has a `client_id`, a `number` and a `code` per AD-21, including soft-deleted cases
**And** identical clients after normalisation (rule 2 in AD-21, e.g. "Lumen Srl" and "lumen  srl") share one client
**And** `case_study.client` (text) no longer exists
**And** `case_number_counter` holds each (client, year) pair's highest number
**And** the migration aborts, with nothing applied, if any case would be left without a client or code
**And** no applied migration is edited

**Given** the dev case "Test Lumen" with client "Lumen Srl" and year 2026, and no other Lumen client
**When** the migration has run
**Then** a client *Lumen Srl* with code `LUM` exists, and the case's code is `LUM-2026-01`

**Given** the client code rules (AD-21 rules 1–3)
**When** the DB tests run `create_client` on these names in this order: "Lumen Srl", "Lumina S.p.A.", "Lume", "Città di Torino", "A2A", "3M"
**Then** the codes are `LUM`, `LUMI`, `LUME`, `CIT`, `AAX` and `MXX`
**And** a name equal to an existing client's after normalisation is rejected with `CLIENT_NAME_TAKEN`, and nothing is written

**Given** wizard step 0
**When** it loads
**Then** the client field is a select of every client, sorted by name, each option showing the name and its code
**And** with no clients, the field is replaced by "Nessun cliente. Aggiungilo nella pagina Clienti." and **Avanti** stays inactive
**And** there is no way to type a new client here

**Given** a name and a picked client
**When** I press **Avanti**
**Then** `createCaseStudy({ name, clientId, year, locale })` creates the case with the next number for that client and year
**And** the top bar shows the code in mono, not the uuid
**And** `case_created` records `clientId`, `clientCode` and `code`
**And** an unknown `clientId` returns `CLIENT_NOT_FOUND` and writes nothing

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
**Then** the ID column shows the code
**And** search matches name, client name, client code and case code
**And** sorting by ID orders codes naturally
**And** the Client column shows the client's current name

**Given** CI
**When** the `check`, `db` and `image` jobs run
**Then** they pass, and `db.types.ts` matches the generated types

### Story 2.13: Clients page

As an owner/designer,
I want a Clients page where I add and rename clients and see each client's case histories,
So that the client list stays clean and I can find everything we did for one client.

Covers: UX-DR1 (Clients item), UX-DR35, UX-DR30, AR11 (`list clients`, `manage clients`), AR23 ([Sprint Change Proposal 2026-10-15](sprint-change-proposal-2026-10-15.md))
Order: after 2.12, before Epic 3.

**Acceptance Criteria:**

**Given** an owner/designer
**When** the sidebar renders
**Then** it shows **Clienti** between Case history and Templates
**And** account/sales/social and admin users don't see it
**And** a direct URL to `/clients` from those roles returns to their landing page (UX-DR2)

**Given** the Clients page
**When** it loads
**Then** a table lists every client with ID (the client code, mono; header "ID", owner 2026-10-19), Name and Case histories (count of non-deleted cases), sorted by name A–Z, with header sort
**And** search over name and code works with the table's rules (case- and accent-insensitive, ~250 ms debounce)
**And** it has skeleton, empty ("Nessun cliente. Aggiungi il primo.") and no-results states

**Given** **Aggiungi cliente**
**When** I press it
**Then** the client wizard opens full-page at step 1 (delivered by Stories 2.15 and 2.16; SCP 2026-10-19)
**And** the name and code rules are unchanged: a name of 1–120 characters after trimming, and the client is created with its automatic code (AD-21) and appears in the list with that code
**And** a duplicate name shows "Esiste già un cliente con questo nome." on step 1
**And** there is no code field

~~**Given** a client whose wizard isn't finished … **When** I click its row **Then** the wizard opens at the first incomplete step (SCP 2026-10-19)~~ *(superseded by the owner, 2026-10-19: every row opens the client page; an unfinished client is completed through **Modifica cliente**)*

**Given** **Modifica cliente** (was **Modifica nome**; amended 2026-10-16 and by SCP 2026-10-19) on a client page
**When** I press it
**Then**, until Story 4.12 lands, the client wizard opens at step 1 with the client's data, saying "Il codice {code} non cambia. Le modifiche si vedono in tutte le sue case history." (SCP 2026-10-19)
**And** the name rules are unchanged: a new name changes everywhere it is shown, including its case histories; the code and every case code stay the same; a duplicate name is rejected as on add
**And** (delivered by Story 4.12; SCP 2026-10-16 client intro and collections) **Modifica cliente** opens the client overview, and the data is edited in its **Dati cliente** panel, with the same name rules

**Given** a client row (any client, finished or not; owner, 2026-10-19)
**When** I click it
**Then** `/clients/{clientId}` shows the client's name and code, **Modifica cliente**, and the Case history table limited to that client's non-deleted cases, with the same columns, search, sort and row click
**And** with no cases it shows "Nessuna case history per questo cliente." and **Nuova case history**, which opens step 0 with the client preselected

**Given** a client
**When** I look for a delete action
**Then** there is none on the Clients page; **Elimina cliente** lives in the client wizard (owner, 2026-10-19: clients can be deleted (soft), with their cases)

**Given** a viewport narrower than 1024 px
**When** I open Clients
**Then** the list still loads, searches and sorts, read-only, with no add or edit

**Given** the policy tests
**When** they run
**Then** `list clients` and `manage clients` are allowed for owner_designer only

### Story 2.14: Client info (description, sector and logo)

As an owner/designer,
I want to store a short description, the sector and the logo with each client,
So that every case history for that client introduces them without my retyping it.

Covers: FR3 (amended), AR24, AR8 (key layout), AR11 (`manage clients`), AR12, UX-DR35 (amended), UX-DR30 ([Sprint Change Proposal 2026-10-16](sprint-change-proposal-2026-10-16.md)). It delivers the amended ACs of Story 2.13.
Order: first in Sprint 2. It has to land before Story 3.3.

> *Amended by SCP 2026-10-19 ([Sprint Change Proposal 2026-10-19](sprint-change-proposal-2026-10-19.md)):* the sector becomes `industries` (multiselect from a fixed list); name, industries, description and logo are all required; the dialog is replaced by the client wizard (Story 2.15). The description limit (400), the logo rules, "live, no snapshot" (AD-22) and `getClientInfoForCase` stay; `getClientInfoForCase` now returns `{ clientId, name, industries, description, logoId, brief }`. The struck-through criteria below are reworked in Story 2.15.

**Acceptance Criteria:**

**Given** the forward migration for this story
**When** it runs
**Then** `client` has nullable `description`, ~~`sector`~~ and `logo_id`, and every existing client has them empty (SCP 2026-10-19: `sector` is replaced by `industries`, see Story 2.15)
**And** a `client_logo` table exists (uuid `id`, `client_id`, `path`, `mime_type`, `size_bytes`, `created_by`, `created_at`), with RLS denying `anon` and `authenticated`
**And** the database rejects a `description` over 400 ~~or a `sector` over 60~~ characters after trimming (SCP 2026-10-19: see Story 2.15)
**And** no applied migration is edited

~~**Given** **Aggiungi cliente** or **Modifica cliente**~~
~~**When** the dialog opens~~
~~**Then** it shows Name (required), Settore (optional, up to 60 characters), Descrizione (optional textarea, up to 400 characters, with a live counter) and Logo (optional upload with preview and **Rimuovi**)~~
~~**And** the edit dialog says "Il codice {code} non cambia. Le modifiche si vedono in tutte le sue case history."~~
(SCP 2026-10-19: replaced by step 1 **Dettagli** of the client wizard, Story 2.15; every field is required there.)

**Given** a logo file
**When** I pick it
**Then** PNG, JPEG or WebP up to 5 MB, at least 400 px on the short side, uploads through a signed upload URL to `clients/{clientId}/logos/{logoId}.{ext}`
**And** any other type, size or a smaller image is rejected with an inline message, and nothing is written
**And** the server re-checks type and size at confirm, as for project files (AD-8)

(Amended 2026-10-19, owner: SVG logos are accepted too ([spec](../implementation-artifacts/spec-svg-client-logo.md)). An SVG (`.svg`, up to 5 MB) is accepted as is only when a dependency-free safety scan passes, in the browser at pick and again at confirm: no scripts, event handlers, foreignObject, external references or entities; a standard SVG DOCTYPE without internal subset and embedded PNG/JPEG/WebP images are allowed (owner, 2026-10-19). An unsafe SVG shows "Il file SVG non è sicuro: contiene script o collegamenti esterni." and fails confirm with `CLIENT_LOGO_INVALID`, with nothing written; a file that isn't an SVG at all gets the unreadable-image message. It is always shown through `<img>`. The 400 px and 8000 px rules apply to PNG, JPEG and WebP only.)

**Given** a client with a logo
**When** I upload a new one ~~or press **Rimuovi**~~ and save
**Then** `logo_id` points to the new row ~~or is cleared~~, and the old `client_logo` row and its storage object are deleted (no logo history) (SCP 2026-10-19: the logo is required, so it can be replaced but not cleared; see Story 2.15)

**Given** a description of 401 characters ~~or a sector of 61~~ after trimming (SCP 2026-10-19: see Story 2.15)
**When** I try to save
**Then** the field shows an inline error, no server call is made, and a direct action call fails with `CLIENT_FIELD_TOO_LONG` and writes nothing

**Given** a client page
**When** it loads
**Then** it shows the logo (signed URL), name, code, ~~sector~~ industries as pills (SCP 2026-10-19, Story 2.15) and description above the Case history table, and an empty field shows nothing (no placeholder)

**Given** the Clients table
**When** it loads
**Then** it is unchanged (Code, Name, Case histories); ~~sector isn't~~ industries aren't a column or a search field in this story (SCP 2026-10-19)

**Given** the `case-study` index
**When** a renderer or `generation` asks for `getClientInfoForCase(caseId)`
**Then** it returns ~~`{ clientId, name, sector, description, logoId }`~~ `{ clientId, name, industries, description, logoId, brief }` (SCP 2026-10-19, built in Story 2.15) with the client's current values, read each time and never stored as a copy (AD-22)

**Given** account/sales/social or admin
**When** they call any client update or logo action
**Then** it fails with `FORBIDDEN` and writes nothing

**Given** a viewport narrower than 1024 px
**When** I open a client page
**Then** the info shows read-only, with no edit

**Given** CI
**When** the `check`, `db` and `image` jobs run
**Then** they pass, and `db.types.ts` matches the generated types

### Story 2.15: Client wizard and details step

As an owner/designer,
I want to create a client in a wizard like a case history, starting with its details,
So that every client has the data its intro and its case studies need.

Covers: FR11 (amended), AR24 (amended), AR11 (`manage clients`), UX-DR35 (amended) ([Sprint Change Proposal 2026-10-19](sprint-change-proposal-2026-10-19.md)). It reworks the dialog of Stories 2.13 and 2.14, and replaces the earlier Story 2.15 "Client images" (SCP 2026-10-16 client intro and collections).
Order: MVP, Sprint 2, first (owner, 2026-10-19).

**Acceptance Criteria:**

**Given** the forward migration for this story
**When** it runs
**Then**:
- `client.industries` exists (text array; each value one of `interior_design`, `energia`, `risorse_umane`, `lusso`; at least one, checked by the database). It is filled from nothing, and `sector` is dropped (no prod data; dev clients lose their sector)
- a `client_brief` table exists, one row per client, with `context`, `solution` and `results` (each ≤5000 characters after trimming) and RLS denying `anon` and `authenticated`
- no applied migration is edited

**Given** **Aggiungi cliente**
**When** the wizard opens
**Then** step 1 **Dettagli** shows, in this order:
- Nome
- Settore as pills (multiselect; labels *Interior design, Energia, Risorse umane, Lusso*; the list lives in one constant)
- Descrizione (≤400, live counter)
- Logo (rules of Story 2.14)
- Contesto, Soluzione and Risultati (textareas with one-line placeholder prompts, as in Story 2.10)
**And** the stepper shows Dettagli, Materiale and Introduzione

**Given** step 1
**When** any field is empty or no pill is selected
**Then** **Avanti** is inactive, with the reason linked via `aria-describedby`

**Given** step 1 with every field filled
**When** I press **Avanti**
**Then** the client is created with its automatic code (or updated, if it exists), the texts are saved, and step 2 opens

**Given** a client that exists
**When** I edit a field on step 1
**Then** the three texts autosave as in Story 2.10, and the name, industries and description save on **Avanti** with the rules of Stories 2.13 and 2.14

**Given** an industry value outside the list, an empty list, or a text over its limit
**When** an action is called directly
**Then** it fails (`CLIENT_FIELD_INVALID` or `CLIENT_FIELD_TOO_LONG`) and writes nothing

**Given** a client page
**When** it loads
**Then** it shows the logo, name, code, industries as pills and the description
**And** the three texts are not shown on the page

**Given** `getClientInfoForCase(caseId)`
**When** it is called
**Then** it returns `{ clientId, name, industries, description, logoId, brief }` with the client's current values, read each time (AD-22)

**Given** account/sales/social or admin
**When** they call any client action
**Then** it fails with `FORBIDDEN` and writes nothing

**Given** a viewport narrower than 1024 px
**When** I open the wizard
**Then** it is read-only, as for case histories

**Given** CI
**When** the `check`, `db` and `image` jobs run
**Then** they pass, and `db.types.ts` matches the generated types

### Story 2.16: Client material step

As an owner/designer,
I want to upload 2–3 files for a client, at least 2 of them images,
So that the client intro has pictures and the AI has material to write from.

Covers: FR11 (amended), NFR6 (amended), AR8 (client key prefix), AR11, UX-DR37 (amended) ([Sprint Change Proposal 2026-10-19](sprint-change-proposal-2026-10-19.md))
Order: MVP, Sprint 2: after 2.15, before 3.2 (owner, 2026-10-19).

**Acceptance Criteria:**

**Given** the forward migration for this story
**When** it runs
**Then** a `client_asset` table exists (uuid `id`, `client_id`, `position` 1–3, `path`, `mime_type`, `size_bytes`, `width`, `height` (images only), `created_by`, `created_at`), unique on (`client_id`, `position`), with RLS denying `anon` and `authenticated`
**And** no applied migration is edited

**Given** step 2 **Materiale**
**When** I drop or pick files
**Then**:
- it accepts the case history's material types and size (Story 2.7: images, videos, PDF, TXT, MD, DOCX, ≤50 MB)
- images must also be ≥1600 px on the short side
- files upload through signed URLs to `clients/{clientId}/material/{assetId}.{ext}`, and the server re-checks type and size at confirm (AD-8)
- a 4th file is refused inline ("Massimo 3 file."), and other files aren't blocked

**Given** step 2
**When** fewer than 2 images are uploaded
**Then** **Crea introduzione** is inactive, with the reason "Carica almeno 2 immagini." linked via `aria-describedby`
**And** the copy above the drop zone reads "Carica fino a 3 file, almeno 2 immagini. Le immagini servono per le pagine di introduzione."

**Given** rows of uploaded files
**When** I remove one
**Then** it is removed at once, with no undo, as in Story 2.7, and its row and object are deleted (no history, like logos)
**And** replace and reorder come with Story 4.12

**Given** 2–3 files with at least 2 images
**When** I press **Crea introduzione**
**Then** Story 3.9's intro draft starts
**And** the wizard shows "Stiamo preparando l'introduzione di {client}." with **Torna ai clienti**
**And** before Story 3.9 lands, it goes to the client page instead

**Given** account/sales/social or admin
**When** they call any client material action
**Then** it fails with `FORBIDDEN` and writes nothing

**Given** CI
**When** the `check`, `db` and `image` jobs run
**Then** they pass, and `db.types.ts` matches the generated types

## Epic 3: Generate a graphic case study from the material

The owner/designer presses Generate and can leave. The worker produces a draft from MAC templates: a challenge / approach / result narrative built only from this case's material and form answers, laid out for every MVP format and adapted to the media count. The case lands in To review with a toast.

Epic prerequisites (non-dev): graphic template layouts and final case study templates (Sprint 2, decided 2026-10-09), each with an About the client area in every format (logo, name, industries (up to four labels; they replace the sector, SCP 2026-10-19) and a description up to 400 characters, all required, so no rules for a missing field; SCP 2026-10-16), every page of every format named (`pageKey`) with the pages that introduce the case history (for example the cover and About the client) marked as intro pages (SCP 2026-10-16 client intro and collections), a client intro template in every format for 2–3 images (the client's image files; SCP 2026-10-19), a headline and one short paragraph (needed by 2026-10-20, before Story 3.9 closes; owner amendment 2026-10-16: before the demo), narrative structure and quality criteria (NFR5, Sprint 2), and data processing logic (OP 2, Sprint 1). Stories 3.4–3.7 can't close before their prerequisites land; when in Sprint 2 the templates arrive is the schedule risk.

### Story 3.1: Background job queue and worker loop

As the team,
I want long work to run as leased Postgres jobs in the worker process,
So that generation, exports and renditions never run inside a web request, never run twice from a double click, and never leave a case stuck after a crash.

Covers: AR10, AR11 (system actor), NFR4 (waiting off the hands-on path)

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

**Given** `access.index`
**When** the worker starts
**Then** it gets the `system` actor through a public resolver on `access.index` (the seeded system profile, read from `profile`), and passes it to `authorize` for job work; nothing outside `access` hard-codes the system profile id (follow-up from the Story 2.3 review, `deferred-work.md`)

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
**Then** it gets a signed GET URL (≤ 15 minutes) for that rendition, and no other module builds rendition keys
**And** the Material step's thumbnails (Story 2.7) switch to renditions once available, with a type icon while pending

### Story 3.3: The case study document, revisions and the format registry

As the team,
I want one validated document per revision that every format and screen reads, and one registry of formats,
So that content never differs between formats, configurator edits reach the exports, and old revisions survive schema changes.

Covers: AR3 (revision model, live and editable reads), AR4, AR9 (format registry), AR21, FR3 (layouts per format), CAP-12 (generated draft kept)
⚑ Interim: IR-OP1 (registry holds Deck 16:9, Social carousel 4:5, PDF A4 only), IR-OP8, IR-OP13 (`generated_doc` is kept next to the approved `doc` for the measures)

**Acceptance Criteria:**

**Given** `rendering/domain/formats.ts`
**When** I read it
**Then** it lists exactly the IR-OP1 formats, each with id, name, ratio, pixel size (1920×1080, 1080×1350, A4 portrait), page model, file type (PDF / ZIP of PNGs / PDF) and `static`
**And** it is the only list of formats used anywhere; there is no canvas-ratio field in any type

**Given** `generation/domain` zod schema for `CaseStudyDocument`
**When** a document is validated
**Then** it has a `schemaVersion`, `templateId@version`, a shared part (text blocks with stable `blockId`, section, text, claims with `aspect` ∈ technical | graphic, `provenance` ∈ generated | human_edited | human_added, optional `sourceRefs: MaterialRef[]`, and `check: { by, at, textHash } | null`; the selected media set) and a per-format part keyed by format id (variant, slot → assetId, spacing, text scale, font pairing)
**And** a document missing the challenge, approach or result block, or with them out of order, is rejected
**And** the document stores no client values: the About block is not a text block, has no `check` and no claims, and renderers fill it at render time from the client's current info: logo, name, industries and description (AD-22, SCP 2026-10-16 amendment; SCP 2026-10-19)
**And** the document has `kind` ∈ `case_history | client_intro`; the challenge/approach/result rule is enforced only for `case_history`, and a `client_intro` has its own block set from its template (SCP 2026-10-16 client intro and collections)

**Given** the `case-study` module
**When** the migration for this story runs
**Then** a `revision` table exists (uuid id, `case_id` nullable, `client_intro_id` nullable, with a check that exactly one is set, `status` ∈ working | approved | superseded, `version`, `generated_doc` jsonb, `doc` jsonb, `manifest` jsonb, `model`, `fell_back`, `prompt_version`, `schema_version`, timestamps), with RLS denying `anon` and `authenticated`
**And** `generated_doc` can't be changed after insert (trigger)
**And** neither `manifest` nor the documents hold a copy of the client info (AD-22)
**And** the `client_intro` table and the FK for `client_intro_id` arrive with Story 3.9; until then `client_intro_id` is always null (SCP 2026-10-16 client intro and collections)
**And** foreign keys from `case_study.head_revision_id` and `approved_revision_id` (columns added in Story 2.5) to `revision` are added here

**Given** a revision
**When** its per-format entries are created
**Then** they are exactly the registry formats at that moment, and any later operation naming another format fails with `FORMAT_NOT_IN_REVISION`

**Given** the `case-study` index
**When** other modules read a case's document
**Then** they use `getLiveRevision(caseId)` (approved revision, or none) or `getEditableRevision(caseId)` (head), and documents are passed through `upgrade(doc)` on read without writing the upgrade back to a non-working revision (covered by a test with a v0 fixture)
**And** `getLiveRevision` and `getEditableRevision` take a subject (`{ kind: 'case', id }` or `{ kind: 'client_intro', id }`); the MVP calls them only with cases (SCP 2026-10-16 client intro and collections)

### Story 3.4: Templates as versioned code with media-count rules

As an owner/designer,
I want the case study layout to adapt to how many images and videos I have,
So that the draft looks designed whether I uploaded three media items or twelve.

Covers: FR4, CAP-4 (slot mapping per media count), AR4 (`relayout`), AR15, NFR1 (template design unchanged), PRD Story 3.2
⚑ Interim: IR-OP1, IR-OP12 (adaptation chooses only among designed variants), IR-C4 (no variant on/off state)
⛔ Blocked on: IR-A4 (the zero-images-or-videos rule), the graphic template layouts and final templates (Sprint 2 non-dev prerequisites), the About the client area in the final templates (SCP 2026-10-16), and page names and intro pages in the final templates (SCP 2026-10-16 client intro and collections)

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

**Given** the design team's template specs
**When** a template is coded
**Then** every format has an About the client area for the logo, name, industries and description (AD-22), with no rules for a missing field, because all of them are required (SCP 2026-10-19)
**And** its layout fits up to four industry labels plus a 400-character description without overflow (a test renders all four labels and the longest allowed description in every format; SCP 2026-10-19)

**Given** a template format
**When** it is coded
**Then** every page it can produce has a stable `pageKey` and a `role` (`intro` or `body`) from the design team's spec, and the keys never change within a published version (SCP 2026-10-16 client intro and collections)

### Story 3.5: One renderer per format

As an owner/designer,
I want each format rendered by one implementation,
So that the preview I approve is exactly what gets exported and shared.

Covers: AR9 (one renderer per format), FR3 (layouts per format), CAP-7 (preview matches export), NFR1
⚑ Interim: IR-OP1, IR-OP12 (media placed whole, fit, never stretched or cropped)
⛔ Blocked on: final templates (Sprint 2 non-dev prerequisite)

Note (2026-10-19, owner): a client logo may be an SVG ([spec](../implementation-artifacts/spec-svg-client-logo.md)). Renderers draw the logo through `<img>`, and any raster output rasterises an SVG logo at render time; the stored SVG is never rewritten. Rasterising an SVG logo must run with external DTD/entity loading and network access off.

**Acceptance Criteria:**

**Given** each registry format
**When** I look at the template version folder
**Then** there is exactly one React renderer for it, a pure function of (document, format, template, asset URLs, the client's current info for the About block) with no data fetching

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

**Given** a renderer
**When** it paginates
**Then** each page carries its `pageKey` and `role`, and the renderer accepts a starting page number, so chained documents number their pages continuously (SCP 2026-10-16 client intro and collections)

### Story 3.6: Narrative generator port and Anthropic adapter

As an owner/designer,
I want the narrative written only from my case's material and form answers,
So that every claim in the draft has something I can check it against.

Covers: FR3, CAP-5, AR6 (aspects, MISSING_ASPECT), AR7, AR18 (manifest, limits, no Files API), AR19 (provenance, validated sourceRefs), NFR1, NFR2 (no "verified"), NFR5, NFR13 (narrative language)
⚑ Interim: IR-A3 (`MISSING_ASPECT` is recorded, not blocking), IR-OP14 (favourites are in the manifest but ignored)
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
**Then** it includes only items in the manifest, the form answers, and the client's current name, industries, description and brief (context, solution, results), read when the job runs, as text (AD-22; SCP 2026-10-19): form answers and client info as text, other types per the OP 2 rule (blocked until decided)
**And** it respects the API limits (32 MB request, 600 PDF pages; DOCX and video are not API inputs) by extracting or splitting rather than failing, and never uploads to the Anthropic Files API

**Given** the model's response
**When** it is parsed
**Then** the output contains only narrative text fields (blocks, claims with `aspect` and optional `sourceRefs`); no layout, template, asset or slot field exists in the output schema
**And** every claim gets `provenance: generated` and `check: null`
**And** any `sourceRef` not in the manifest fails validation and the attempt fails; `client_field` refs (`description`, `industry`, `context`, `solution` or `results`; SCP 2026-10-19) are allowed, and a `client_field` ref is never material
**And** the output schema has no `about` field; the LLM never writes or rewrites the About block

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
⛔ Blocked on: IR-A4 (a case with text or PDFs only, until the template's zero-media rule exists, via Story 3.4); IR-OP2 and IR-NFR5 (via Story 3.6); the graphic template layouts and final templates (via Stories 3.4 and 3.5)

**Acceptance Criteria:**

**Given** wizard step 3 (Generate)
**When** it opens
**Then** it shows "{n} files, {m} of 3 details filled."

**Given** a case with no material (no non-deleted asset), with or without the details form filled in
**When** I look at **Generate**
**Then** it is disabled and shows "Add at least one file of project material. The details form alone isn't enough to generate.", linked via `aria-describedby`
**And** calling the generate action directly fails with `NO_MATERIAL` before any job or LLM call

**Given** a draft case with material
**When** I press **Generate**
**Then** the server re-checks `material.hasMaterial`, enqueues one `generate` job whose payload carries the material manifest (refs plus content hashes) and `baseHeadVersion`, with no client snapshot (AD-22), and transitions the case to `generating`
**And** a double click enqueues only one job
**And** the screen shows "Generating your case study. You can leave this page; it will appear in To review when it's ready." with **Back to case studies**, and no ETA or percentage
**And** generate is rejected for any case not in `draft`

**Given** the worker claims the job
**When** it runs
**Then** it checks the NFR6 gate again, runs the narrative filter (Story 3.6, with the client's current name, industries, description and brief: context, solution, results; SCP 2026-10-19) and then `rendering.relayout` (Story 3.4), and creates a **new** `working` revision with `generated_doc` and `doc` set to the same document and the manifest stored
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

**Given** the client is edited after the draft was generated or approved
**When** the configurator, the case study view, a new export or a shared link renders the case
**Then** the About block shows the client's current info, with no new generation and no new approval (AD-22)
**And** the revision stores no client values (the rule hiding the About block when description, sector and logo are all empty is removed, because they can't be empty; SCP 2026-10-19)
**And** client info never enables Generate (NFR6): a case with only client info and the form still has no material

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

### Story 3.9: Client intro template and draft

As an owner/designer,
I want the AI to draft the client's intro pages from the client's data, brief and material,
So that I only refine them instead of laying them out by hand.

Covers: FR11, AR25 (AD-23), AR3, AR4, AR6 (gate), AR7, AR10, NFR1, NFR2, NFR6 (as amended) ([Sprint Change Proposal 2026-10-16, client intro and collections](sprint-change-proposal-2026-10-16-client-intro-and-collections.md); [Sprint Change Proposal 2026-10-19](sprint-change-proposal-2026-10-19.md))
⛔ Blocked on: the client intro template from the design team; OP 2 for whether client material (images, PDFs, videos) goes to the LLM
Order: MVP, Sprint 2: after 2.15, 2.16 and 3.3–3.8, before Epic 4 (owner amendment 2026-10-16). Until 4.11 lands, the intro-ready toast opens the client page, as 3.8 does for cases.

**Acceptance Criteria:**

**Given** the forward migration for this story
**When** it runs
**Then** `client_intro` (one per client) and `client_event` (append-only) exist with RLS on, and `revision.client_intro_id` gets its FK

**Given** **Crea introduzione** on wizard step 2 (Story 2.16), or **Genera introduzione** on a client without an intro (SCP 2026-10-19)
**When** it is triggered
**Then** the server checks the client has at least 2 image rows in `client_asset` (else `NO_CLIENT_IMAGES`, before any job or LLM call), creates or reuses the `client_intro`, enqueues one `generate` job for it and moves it to `generating`
**And** the screen stays on "Stiamo preparando l'introduzione di {client}." and opens the intro in the configurator by itself when it's ready (until Story 4.11 lands, the client page); if I leave, the toast of Story 3.8 still shows (SCP 2026-10-19)

**Given** the worker runs the intro job
**When** it calls the LLM
**Then** the input is the client's current name, industries, description and brief (the intro is a headline and one short paragraph; owner decision 2026-10-16), plus its material as OP 2 allows (until then, nothing but the text fields; SCP 2026-10-19); the output schema has only intro text blocks (headline and short paragraph) with claims and `client_field` refs, and no layout, asset or `about` field
**And** `rendering.relayout` places 2–3 of the client's images (image rows in `client_asset`) in the intro template's slots for every format
**And** a new `working` revision of kind `client_intro` is created and the intro moves to `in_review`

**Given** the job fails after its attempts
**When** it is marked failed
**Then** the intro returns to `draft` with the client's data and material untouched, and **Riprova** runs it again

**Given** the client is edited after the intro was generated or approved
**When** the intro is rendered anywhere
**Then** the name, industries, description, logo and client material are the client's current ones (AD-22; SCP 2026-10-19), and the AI text stays as written

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

**Given** a viewport of 1024–1279 px
**When** the configurator loads
**Then** the panes narrow and the right pane can be collapsed and reopened, by pointer and by keyboard

**Given** a viewport narrower than 1024 px
**When** I open the configurator
**Then** it shows "The configurator needs a larger screen." instead of the panes

**Given** a case in Bozza or In elaborazione
**When** I open the configurator URL directly
**Then** I'm returned to the Case studies table

**Given** the configurator
**When** it loads a document
**Then** it reads it through `getEditableRevision(subject)`, and the frame (top bar, panes, canvas, page strip) has no case-only assumption beyond the case's own data in the top bar (SCP 2026-10-16 client intro and collections)

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

**Given** the About the client block (UX-DR36)
**When** I click it
**Then** it isn't editable and a hint says "Modifica i dati nella pagina del cliente. Le modifiche si vedono in tutte le sue case history."

### Story 4.4: Adjust the layout per format

As an owner/designer,
I want to pick a designed variant, shuffle, adjust spacing or reset each format's layout,
So that each format looks right without changing the template design.

Covers: FR5 (layout), FR4 (shuffle respects media count), CAP-7, NFR1, AR15 (`listVariants`), UX-DR14, UX-DR26 (undo/redo), UX-DR27 (reduced motion)
⚑ Interim: IR-OP12 (Shuffle and variants choose only among designed variants), IR-C4 (all coded variants are available), IR-C3 and IR-A5 (saves through the Story 4.3 autosave path)

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

**Given** reduced motion is set
**When** the variant changes (pick, Shuffle, undo or Reset)
**Then** the canvas switches without an animated transition

### Story 4.5: Replace, reorder and remove media

As an owner/designer,
I want to swap, reorder or hide media in the layout using only this case's material,
So that the best visuals lead without anything outside the project creeping in.

Covers: FR5 (media), FR4 (adapt on count change), CAP-7, NFR1, AR3 (generation only from `draft`), AR4 (`relayout` in the same write), AR18 (refs from own material; upload never changes status), UX-DR15, UX-DR26 (drag alternative), UX-DR34
⚑ Interim: IR-OP12 (fit whole; no crop, focal point, recolour, filter or effect controls), IR-OP8 (status kept when material is added), IR-C3 and IR-A5 (saves through the Story 4.3 autosave path)
UX gap: EXPERIENCE.md sends the owner/designer "back to the wizard's Material step" but designs no control for it. This story adds **Add material** in the Replace media picker. Flag to UX.

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

**Given** a case in Da approvare or Approvato
**When** I choose **Add material** in the Replace media picker
**Then** the wizard's Material step (Stories 2.7–2.9) opens for this case, with uploads and favourites working as for a draft, and a back arrow to the configurator
**And** the case status doesn't change, no Details or Generate step is offered (generation runs only from `draft`), and the Generate action called directly fails because the case isn't in `draft`
**And** when I return, the new images and videos are listed in the Replace media picker; nothing enters the layout or the revision until I place it
**And** removing a file there that a revision references only soft-deletes it (AR18), so the revision's references stay resolvable and the approval check can report the missing material

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
⚑ Interim: IR-C3 and IR-A5 (saves through the Story 4.3 autosave path)

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
⚑ Interim: IR-C3 and IR-A5 (ticks save through the Story 4.3 autosave path)

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

**Given** the About the client block (UX-DR36)
**When** the Check tab lists blocks
**Then** it isn't listed and doesn't count towards the every-block check
**And** claims citing `client_field` refs are checked like any other claim

### Story 4.8: Approve a case study

As an owner/designer,
I want to approve a case once every block is checked and nothing overflows,
So that it becomes available for export and sharing, and only then.

Covers: FR6, CAP-8, NFR2, NFR7, AR3 (`in_review` → `approved`, `approved_revision_id`), AR5 (automated guardrail test), AR17, AR18 (`MATERIAL_MISSING`), AR19 (server-side check, overflow per format), AR20, UX-DR18, UX-DR28, PRD Story 4.3
⚑ Interim: IR-OP8, IR-A3 (`MISSING_ASPECT` doesn't block), IR-A5 (a stale approve reloads the revision; no "someone else changed this" state)

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
⚑ Interim: IR-A1 (edits are staged until **Update approved version**), IR-OP8 (no path back from Approvato), IR-C3 and IR-A5 (edits save through the Story 4.3 autosave path)
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
**And** below 1024 px the list stays readable (UX-DR30)

**Given** a variant
**When** I turn it off
**Then** a `template_variant_state` row owned by `rendering` records it, and `listVariants` stops returning it for generation and Shuffle
**And** turning off the last enabled variant of a format is refused

**Given** the Templates surface
**When** I look for design controls
**Then** there is no upload, design editing or versioning; template design is never stored in the database

### Story 4.11: Client intro in the configurator

As an owner/designer,
I want to edit, check and approve the client intro like a case history,
So that the intro that reaches clients has been reviewed by a person.

Covers: FR11, AR25, AR19, NFR2, NFR7, UX-DR12 (client intro mode), UX-DR35 (wizard step 3) ([Sprint Change Proposal 2026-10-16, client intro and collections](sprint-change-proposal-2026-10-16-client-intro-and-collections.md); [Sprint Change Proposal 2026-10-19](sprint-change-proposal-2026-10-19.md))
Order: MVP, Sprint 2: after 3.9 and 4.8, before 4.9 (owner amendment 2026-10-16). Its approved-intro editing criterion closes with 4.9, which covers intros too.
⛔ Blocked on: a design session with the owner for step 3 (owner, 2026-10-19). Until then, step 3 isn't shown and the wizard ends on step 2.

**Acceptance Criteria:**

**Given** the client wizard (Stories 2.15 and 2.16)
**When** the intro draft is ready after step 2
**Then** the configurator in client intro mode is step 3 **Introduzione** of the client wizard; the stepper stays visible (SCP 2026-10-19)

**Given** an intro in Da approvare or Approvato
**When** I open it (from the client page, the overview or the toast)
**Then** the configurator opens in client intro mode with the Formats pane, the canvas and the Edit and Check tabs, and text, layout (designed variants only), image order and typography work as in Stories 4.3–4.6

**Given** the Check tab
**When** it opens
**Then** it lists the intro's text blocks; the material drawer shows the client's data, brief and client material (SCP 2026-10-19)
**And** **Approve** follows Story 4.8 (every block checked, no overflow), and editing an approved intro follows Story 4.9 (working copy, **Update approved version**, **Discard changes**)

**Given** an intro that isn't approved
**When** anything builds a client pack or collection
**Then** it is never included (NFR7)

### Story 4.12: Client overview configurator

As an owner/designer,
I want **Modifica cliente** to open the client's intro and all its case histories as one file,
So that I see the client's whole story and fix any part of it in place.

Covers: FR12, UX-DR38, AR3, AR17, AR19, IR-A1 ([Sprint Change Proposal 2026-10-16, client intro and collections](sprint-change-proposal-2026-10-16-client-intro-and-collections.md))
Order: MVP, Sprint 2, last in Epic 4: after 4.9 and 4.11 (owner amendment 2026-10-16)

**Acceptance Criteria:**

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
**Then** a panel shows the step 1 fields (name, industries, description, logo, context, solution, results) and the step 2 client material with the rules of Stories 2.15 and 2.16, plus **Sostituisci** and reorder, and saving them updates the About blocks and the intro in the preview at once (SCP 2026-10-19)
**And** removing an image when only 2 remain is refused ("Servono almeno 2 immagini.")

**Given** the overview
**When** I look for reordering case histories, or approving several parts at once
**Then** neither exists; each part is checked and approved on its own (no bulk approve, UX-DR28)

**Given** a viewport narrower than 1024 px
**When** I open the overview
**Then** it shows "The configurator needs a larger screen."

## Epic 5: Find, export and share approved case studies

Users find approved cases in the library, preview every format, export files and publish shareable links that always show the live approved version and can be turned off. Before login, the library is reached through the owner/designer's Table / Library toggle; the account/sales/social rules are enforced by the policy and covered by tests, and go live for real users in Epic 6.

Epic prerequisite (non-dev, Sprint 2): account/sales/social user journey (OP 4). Decided before Epic 5 ships: shareable link access (OP 11).

### Story 5.1: Library of approved case studies

As an account/sales/social user,
I want to browse approved case studies as cards with search and filters,
So that I can find the right one to show a client in under a minute.

Covers: FR7 (find), CAP-9 (approved only), AR3 (`getLiveRevision` only), AR11 (approved-only listing), UX-DR6, UX-DR30 (skeleton cards)
⚑ Interim: IR-OP4 (card library with facets), IR-OP1 (cover from the 16:9 deck)

**Acceptance Criteria:**

**Given** the library
**When** it loads
**Then** it shows only cases with an approved revision, read through `getLiveRevision`, as a card grid sorted newest approved first, paginated at 24 cards with no infinite scroll, with skeleton cards during the first load
**And** each card shows a cover thumbnail (the first page of the live revision's 16:9 deck, drawn with the shared renderer), name, client and year
**And** cards have no status badge and the library has no status filter

**Given** the search field
**When** I type
**Then** it matches name, client name, client code and case code with the same rules as the table (Story 2.6)

**Given** facets for Client and Year
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

**Given** the library (delivered by Story 5.10; SCP 2026-10-16 client intro and collections)
**When** I select one or more cards
**Then** a bar shows "{n} selezionate" with **Crea raccolta** and **Annulla selezione**; selection is keyboard-operable (Space on a focused card)

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

Covers: FR7 (export), CAP-9, NFR7, AR5 (guardrail test), AR8 (exports prefix, signed GET), AR9 (export pipeline, file types, `ensureExport`), AR10, AR20, UX-DR21 (Export, progress, failure), UX-DR4 (Export row action), PRD Story 5.1
⚑ Interim: IR-OP1 (deck → PDF, carousel → ZIP of PNGs, A4 → PDF)

Note (2026-10-19, owner): a client logo may be an SVG ([spec](../implementation-artifacts/spec-svg-client-logo.md)). The export renderer rasterises an SVG logo at render time (PNG pages, and PDF pages wherever the logo is not embedded as vector), from the stored file as is, with external DTD/entity loading and network access off.

**Acceptance Criteria:**

**Given** the `rendering` module
**When** the migration for this story runs
**Then** an `export` table exists, unique and immutable on `content_hash` (a hash of the ordered parts, their revision ids, each part's client info, any collection edits and hidden pages, and the format; AD-9, AD-22), with storage keys `exports/{contentHash}/{format}.{ext}` built only by `rendering` adapters, and RLS denying `anon` and `authenticated` (amendment, SCP 2026-10-16 client intro and collections)
**And** the export job's payload is `{ parts: [{ subject, revisionId }], format }`; the MVP always sends one part

**Given** an approved case in the view with a format selected
**When** I press **Export** (or **Export** in an Approvato row's overflow menu)
**Then** the server checks `case-study.isRevisionApproved` on the live revision and that the format is in it, then enqueues an `export` job; the button shows progress and I can keep browsing
**And** for a case with no approved revision, or a format not in the revision, it fails with `NOT_APPROVED` or `FORMAT_NOT_IN_REVISION` and nothing is enqueued

**Given** the worker runs the export
**When** it renders
**Then** it builds HTML with `renderToStaticMarkup` from the same renderer, loads it into Playwright Chromium with `page.setContent` (no print route exists), and writes a PDF for deck and A4 or a ZIP of one PNG per slide for the carousel, using display renditions and video poster frames
**And** `rendering.ensureExport(revisionId, format)` returns the existing export if there is one, so a second request for the same revision and format doesn't render again
**And** an existing export is reused only if it was made with the client's current info; after a client edit, the next export renders again with the new info (AD-22)

**Given** the export is ready
**When** the job succeeds
**Then** the browser downloads the file through a signed GET valid ≤ 15 minutes, and an export event is recorded with my actor id

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
**And** media are display renditions and video poster frames or transcodes served by signed GET, never originals

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
⚑ Interim: IR-OP12 (the NFR1 tests check the interim boundary), IR-PERM (the NFR3 matrix check includes "any sharer turns off any link")

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

### Story 5.9: Combined export and client pack download

As an account/sales/social user or owner/designer,
I want to download a client's intro and its approved case histories as one file,
So that I can send a client's whole track record in one go.

Covers: FR13, AR9 (combined export), AR11 (`list clients` read-only, `download client pack`), NFR7, UX-DR35 (amended), UX-DR40 ([Sprint Change Proposal 2026-10-16, client intro and collections](sprint-change-proposal-2026-10-16-client-intro-and-collections.md))
Order: MVP, Sprint 3: after 5.1–5.8 (needs 5.3, 5.4 and 4.11) (owner amendment 2026-10-16)

**Acceptance Criteria:**

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
**When** I pick a format (Deck 16:9 or PDF A4 only; owner decision 2026-10-16) and confirm
**Then** the server builds the parts: the client's approved intro (if any), then its approved case histories newest first, using the intro rule (2+ case histories → the client intro replaces their own intro pages; 1 → its own intro), and enqueues one `export` job
**And** if the intro isn't approved, every case history keeps its own intro and the dialog says so (UX-DR40)
**And** a client with no approved case history has no **Scarica**, and a direct call fails with `NOT_APPROVED`

**Given** the same client, revisions, client info and format
**When** **Scarica** is pressed again
**Then** the stored export with the same `content_hash` is returned

**Given** an automated guardrail test
**When** the suite runs
**Then** it proves no combined export contains a working, superseded or unapproved revision, by any role

### Story 5.10: Collections

As an account/sales/social user or owner/designer,
I want to pick approved case histories, put them in the order I want, save them under a name and export them,
So that I can prepare a custom case for one pitch and reuse it later.

Covers: FR13, AR26 (AD-24), AR11 (`manage collections`), NFR7, UX-DR39, UX-DR40 ([Sprint Change Proposal 2026-10-16, client intro and collections](sprint-change-proposal-2026-10-16-client-intro-and-collections.md))
Order: MVP, Sprint 3: after 5.9 (owner amendment 2026-10-16)

**Acceptance Criteria:**

**Given** the forward migration for this story
**When** it runs
**Then** `collection` and `collection_item` exist, owned by the `collection` module, with RLS denying `anon` and `authenticated`

**Given** the library with cards selected
**When** I press **Crea raccolta** and enter a name (1–120 characters)
**Then** a collection is saved with those case histories in selection order, and the collection configurator opens

**Given** the collection configurator
**When** it loads
**Then** the left pane lists the parts in order: for each client with 2 or more case histories in the collection, its approved intro comes before the first of them, shown locked, and that client's case histories are kept together as a group, and I reorder groups and case histories within a group (owner decision 2026-10-16); the centre shows the continuous preview per format through `composeParts`

**Given** I move a case history (drag handle, or the menu "Sposta su / giù")
**When** the move is saved
**Then** the order and the computed intros update, with compare-and-set on `collection.version`

**Given** I add or remove case histories (from the left pane's **Aggiungi** picker, approved only)
**When** a client crosses from 1 to 2 case histories, or back
**Then** its intro appears or disappears, and that client's case histories switch between their own intro pages and the client intro

**Given** **Raccolte** in the sidebar
**When** I open it
**Then** I see every collection (name, number of case histories, updated, created by) and can open, rename or delete one (with confirm; delete is soft)
**And** every user who can manage collections sees every collection and can change it, and "created by" is shown (owner decision 2026-10-16)

**Given** **Esporta** or **Esporta tutto** in a collection
**When** I press it
**Then** it exports through the Story 5.9 pipeline, one file per format, Deck 16:9 PDF and PDF A4 only; the social carousel stays a single-case-history format (owner decision 2026-10-16)

**Given** a case history in a collection
**When** its approved version is updated, or the client is edited
**Then** the collection shows the new approved version and the client's current info the next time it is opened or exported
**And** if a case history has no approved revision any more, it is listed as "Non disponibile" and left out of exports

**Given** admin
**When** they call any collection action
**Then** it fails with `FORBIDDEN`

### Story 5.11: Edit texts and remove pages in a collection

As the person preparing a collection,
I want to change wording and drop pages only in this collection,
So that the custom case fits the pitch without changing the original case histories.

Covers: FR13, AR26, NFR7 (IR-COLL-EDIT), UX-DR39 ([Sprint Change Proposal 2026-10-16, client intro and collections](sprint-change-proposal-2026-10-16-client-intro-and-collections.md))
Rule: IR-COLL-EDIT, decided by the owner on 2026-10-16 (OP 15): only owner/designers edit text in a collection. The planned upgrade, if sales people need to change wording, is an owner/designer **Approva modifiche** before export.
Order: MVP, Sprint 3, last in Epic 5: after 5.10 (owner amendment 2026-10-16)

**Acceptance Criteria:**

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

**Given** a session email that differs from a profile email only in letter case
**When** `getActor()` matches the session to a profile
**Then** it matches case-insensitively, and the database rejects two profiles whose emails differ only in case (`lower(email)` unique index or `citext`; follow-up from the Story 2.3 review, `deferred-work.md`)

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

Covers: FR8 (admin), CAP-11, AR11 (role changes apply at next request; removal disables the profile), UX-DR24, UX-DR28 (Remove user confirm), UX-DR30 (Users list), PRD Story 6.2

**Acceptance Criteria:**

**Given** the first deployment with login
**When** the environment is set up
**Then** a documented, one-off step creates the first admin (no UI path creates an admin without an existing admin)

**Given** the Users screen
**When** I open it as admin
**Then** I see name, email, role and added-on date for every non-system user
**And** at 1024–1279 px the sidebar collapses to icons, and below 1024 px the list stays readable

**Given** **Add user**
**When** I enter an email and pick exactly one role (owner/designer, account/sales/social, admin)
**Then** a profile is created with that role and the person can sign in with the chosen sign-in method; the `system` role can't be picked
**And** a database constraint allows the `system` role only on the seeded system profile, so neither this action nor a role change can assign it (follow-up from the Story 2.3 review, `deferred-work.md`)

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
⚑ Interim: IR-PERM (every matrix cell is tested, including "any sharer turns off any link")

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

### Story 6.5: Permission check for intros, client packs and collections

As the team,
I want the permission suite to cover the new actions,
So that no role gets more than the matrix allows.

Covers: NFR3, NFR7, AR5, AR11 ([Sprint Change Proposal 2026-10-16, client intro and collections](sprint-change-proposal-2026-10-16-client-intro-and-collections.md))
Order: MVP, Sprint 3, last before the demo: after 6.4 (owner amendment 2026-10-16)

**Acceptance Criteria:**

**Given** signed-in test users of each role
**When** the permission suite runs
**Then** every new matrix cell (section 4.3) is checked end to end: allowed actions succeed, denied ones return 403
**And** it proves account/sales/social can't edit collection text (IR-COLL-EDIT), can't edit clients or intros, and see only clients with an approved case history
