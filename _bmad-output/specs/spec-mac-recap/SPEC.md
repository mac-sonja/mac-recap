---
id: SPEC-mac-recap
companions:
  - success-metrics.md
  - delivery-plan.md
  - ui-flows.md
  - '../../planning-artifacts/architecture/architecture-MAC Recap-2026-10-08/ARCHITECTURE-SPINE.md'
  - '../../planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/EXPERIENCE.md'
  - '../../planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/DESIGN.md'
sources:
  - '../../planning-artifacts/prds/prd-MAC Recap-2026-10-08/prd.md'
  - '../../planning-artifacts/briefs/brief-MAC-Recap-2026-10-08/brief.md'
  - '../../planning-artifacts/briefs/brief-MAC-Recap-2026-10-08/addendum.md'
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# MAC Recap MVP

## Why

The pain is that MAC's finished work goes unseen. Only 4 of the 11 projects closed in the last 12 months were shown externally. Those took about two months to reach social channels, and none told both the technical and the graphic story, so upsell and inbound leads are lost. A case study takes 24–60 hours end to end, 1–2 hours of which is layout alone, and no one has time for it when a project closes. There is also a mandate: a working standalone MVP must be demoed to the CEO, the final validator, on October 30, 2026. MAC Recap turns a closed project's verified material into an on-brand case study in at most 20 minutes of the owner/designer's hands-on time, target 15. It assembles what already exists and never invents content. It affects four teams: creative, sales, PM and social.

## Capabilities

- **CAP-1**
  - **intent:** The owner/designer creates a case study by hand, and it gets a unique, permanent ID that a project order can later be linked to, and a readable code, under a client from the client list. Clients carry industries (from a fixed list), a description, a logo and a brief (context, solution, results), all required, and are created in a wizard like a case study (SCP 2026-10-16, SCP 2026-10-19).
  - **success:** Every new case study has an ID that never changes, is never reused, and is the only identifier other systems see (AD-2).
- **CAP-2**
  - **intent:** The owner/designer uploads material (images, videos, text documents and PDFs) to a case study and can mark any number of images and videos as favourite.
  - **success:** Up to 20 files of up to 50 MB each are stored with the case study, and each image or video can carry an optional favourite mark. A file over the limits, or of a type not on the allowlist, is rejected without blocking the others.
- **CAP-3**
  - **intent:** The owner/designer fills in a short details form on context, solution and results that feeds the narrative.
  - **success:** The answers are saved with the case study and can be cited as claim sources. The fields are optional, and the form never counts as material.
- **CAP-4**
  - **intent:** The owner/designer generates a graphic case study by applying MAC templates to the uploaded material, with a layout that adapts to how many media items there are.
  - **success:** Generation runs in the background and the case shows "In elaborazione" until the draft is ready; a failure returns it to Bozza with material and details intact. The draft uses an unchanged template design and unchanged assets, and the slot mapping for its media count. Generation is refused with no material, even when the details form is filled in.
- **CAP-5**
  - **intent:** The narrative tells challenge, approach and result, covers both the technical and the graphic side, and is built only from the uploaded material and form answers.
  - **success:** The challenge, approach and result sections are always present and cannot be removed or reordered. Any source references a claim carries point only to this case's material or form answers, and are never shown as "verified". A draft missing the technical or the graphic side is marked MISSING_ASPECT and the warning is shown in the configurator (whether it blocks approval is conflict A3).
- **CAP-6**
  - **intent:** The owner/designer sees all case studies and their status, with a queue of those waiting for review.
  - **success:** The list shows every case with its status (labels per OP 8; interim Bozza, In elaborazione, Da approvare, Approvato) and a To review queue, oldest first. Only Bozza cases can be deleted.
- **CAP-7**
  - **intent:** The owner/designer refines a generated case study in a configurator: generated text, layout variant, shuffle, spacing, media replace, reorder and remove, font pairing and text scale, per export format.
  - **success:** Every text block can be edited in place, and each edited block needs its claim check again. Layout, spacing and typography accept only values the template defines; media come only from this case's material. The preview matches the exported files exactly. There is no canvas-ratio control; each format sets its ratio.
- **CAP-8**
  - **intent:** Any owner/designer approves a case study after checking every claim against the material and form answers, which makes it available for export and sharing.
  - **success:** Approve stays disabled until every text block carries a current, manual check, no block overflows in any format, and no referenced material is deleted. There is no bulk check or bulk approve. Editing an approved case keeps it approved; edits go live, links included, only when an owner/designer re-checks the edited blocks and runs Update approved version (interim, conflict A1).
- **CAP-9**
  - **intent:** Owner/designer and account/sales/social users find approved case studies and export them in the format they need.
  - **success:** Account/sales/social users see approved case studies only. Both roles can export the same approved case in each MVP format (OP 1), at least a 16:9 deck as PDF, a social carousel and an A4 PDF. Unapproved content has no view, export or share entry point.
- **CAP-10**
  - **intent:** Owner/designer and account/sales/social users publish an approved case study as a shareable link to a hosted presentation.
  - **success:** Each link shows one format of the current approved version, never a working copy, and offers no file download. Who can open it is stated in the share dialog. A link can be turned off, and a turned-off or expired link shows "no longer available".
- **CAP-11**
  - **intent:** Users sign in with one of three fixed roles (owner/designer, account/sales/social, admin), and the admin adds and removes users and assigns their role.
  - **success:** Every action follows the permission matrix in AD-11. The admin can manage users and roles only: no case content, no permission settings, no guardrail settings, and the last admin cannot drop their own admin role.
- **CAP-12**
  - **intent:** The team can reconstruct each case's lifecycle and editing effort for the 8-week validation.
  - **success:** Every transition, upload, save, block check, claim edit, approval, export and link change is an append-only, timestamped event with its actor, and the generated draft is kept next to the approved version. The tool does not record hands-on time; how the measures are recorded is OP 13.
- **CAP-13** (before the demo; [Sprint Change Proposal 2026-10-16, client intro and collections](../../planning-artifacts/sprint-change-proposal-2026-10-16-client-intro-and-collections.md); amended by [Sprint Change Proposal 2026-10-19](../../planning-artifacts/sprint-change-proposal-2026-10-19.md))
  - **intent:** A client gets AI-drafted intro pages from its data, its brief and up to 3 files of material, at least 2 of them images, laid out with its 2–3 images (SCP 2026-10-19); editing a client shows its intro and case studies as one file; users download a client pack or build named collections of approved case studies.
  - **success:** The intro is checked and approved like a case study. A client with 2+ case studies in a combined file gets its intro in front of them. Collection text edits (any user who manages collections) and hidden pages never change the original case studies or clients, and no combined file contains an unapproved case study or intro (text written in a collection is the exception; NFR7 amended 2026-10-28).

## Constraints

- These guardrails are not negotiable, and any requirement that contradicts them is flagged, not built:
  - NFR1: the AI never alters graphic assets, the technical substance of the content, or template design. Where adaptation, shuffle and resize stand is OP 12.
  - NFR2: a person checks every generated claim against the uploaded material or form answers during review, before approval.
  - NFR3: no role can view or change the guardrails, admin included.
  - NFR6: with no material, nothing is generated. The details form alone is not enough.
  - NFR7: nothing is exported or shared before review and approval by an owner/designer. Exception (owner, 2026-10-28): text written inside a collection by any user who manages collections is exported without a separate approval.
- NFR4: the owner/designer's hands-on time from upload to approval is at most 20 minutes, target 15. If the claim check needs more time, NFR2 wins. Waiting for generation does not count, and generation time has no limit.
- Owner/designer time must not fall by shortening the review. A faster case study that skips the claim check is a failure.
- NFR5: the narrative follows challenge, approach and result, meets the Sprint 2 quality checklist, and covers both the technical and the graphic side.
- The MVP is due on **October 30, 2026**, the demo date. The sprints are due October 14, 21 and 28. Epics run one after another, never in parallel (see `delivery-plan.md`).
- The MVP is standalone from MAC Productive. Any future link runs through MCP and is keyed only on the case study's unique ID.
- Data and files live in Supabase: the database and a private Supabase Storage bucket, both in the EU. The system is built with Claude Code and the BMAD method. The architecture spine's AD-1 to AD-20 are binding.
- Login arrives only in Sprint 3. Until then every deployed environment, shareable links included, is gated (AD-12), because the demo uses real client material. That material's NDA was confirmed cleared by Sonja on 2026-10-08, including processing through the Anthropic API. Each project run in the 8-week validation needs the same clearance.
- Case studies are created by hand. There is no trigger at project close, and requests for a case study happen outside the tool.

## Non-goals

- MAC Productive integration via MCP (FR9, Epic 7), including the "Crea case" button at project close and the case appearing on the project order page. No date is set.
- Text-only case studies and whitepapers built from project order data (FR10, Epic 8).
- An automatic trigger at project close, and requesting a case study inside the tool.
- Collecting or tagging material while the project is running, and mockup and asset guidelines.
- Posting to social channels or the website from inside the tool.
- Onboarding and feedback collection inside the tool. Both happen in person.
- Internal communication.
- Automated hallucination detection, and confidence scores or "AI verified" labels on claims.
- Creating or editing template design inside the tool. Templates change only in code.
- Editable PPTX export, version history, and email or Slack notifications.

## Success signal

- At the October 30 demo, one real past project, ideally one of the seven never published, goes live from upload to an approved case study in at most 20 minutes of the owner/designer's hands-on time, target 15. It is exported as a deck, a social carousel and a PDF. The text covers both the technical and the graphic side, and a person has checked every claim against the uploaded material. The demo is a go only if all four pass; after a no-go the team fixes the gaps and presents again on a new date. The 8-week and 6-month measures are in `success-metrics.md`.

## Assumptions

- Allowed upload types are JPEG, PNG, WebP, MP4, MOV, PDF, plain text, Markdown and DOCX. There is no pasted text: typed project text lives only in the details form, which is not material.
- The deck exports as PDF only. Image formats export as a ZIP of PNGs.
- Text and media selection are shared across formats; layout variant, spacing and text scale are set per format.
- Templates are coded from the design team's specs. In the tool, the owner/designer only picks variant, shuffle, spacing, text scale and font pairing.
- Each case's narrative is in Italian or English (default Italian). The UI is in Italian.
- Favourites are optional, and any number of images and videos can be marked. There is no review assignment: any owner/designer can open any case.
- Anyone who can share can turn off any link.
- An in-app toast announces a ready draft.
- Development and staging in Sprints 1–2 use the demo project's real material, but only inside environments gated under AD-12.

## Open Questions

PRD v2 open points (decide before the epics that depend on them; see `delivery-plan.md`):

- OP 1: Which export formats are in the MVP? UX recommends the demo minimum (deck, carousel, A4) first.
- OP 2: How does the tool turn uploaded material into text, including which material types the LLM reads?
- OP 3: Resolved 2026-10-14: no taxonomy. Tags, properties and flags are dropped; favourites replace them.
- OP 4: How do account/sales/social users find and browse case studies? UX proposes a card library with search and facets.
- OP 8: Which case study states and labels are used?
- OP 10: How are inbound contacts and upsells attributed to a case study?
- OP 11: Who can open a shareable link: anyone with it, only signed-in users, or until it expires?
- OP 12: Do media-count adaptation, shuffle, replace and resizing for export count as altering?
- OP 13: How are owner/designer time, editing and hallucinations recorded during the 8-week validation? UX has decided the tool records no hands-on time.
- OP 14: What does a favourite mean for generation: must generation use favourites, prefer them, or simply show them first? Decide before Sprint 2.
- OP 7 (post-MVP): MAC Productive data structure and confidentiality.

Other open items:

- What is the narrative quality checklist (NFR5)? Due with Sprint 2's "narrative structure and quality criteria".
- Which EU container host runs the app? Choose by the end of Sprint 1.
- When in Sprint 2 the graphic template layouts and final templates land. Both are scheduled for Sprint 2 (decided 2026-10-09), but Epic 3 can't start until they do.

Conflicts carried from the architecture spine and UX, not decided here:

- A1 / C1 (PRD owner): Story 4.3 says saved edits to an approved case update it and its links. The spine and UX stage edits until Update approved version, so unchecked text never reaches a link.
- A2 (PRD owner): FR7 says anyone with a link can open it, but AD-12 gates `/s/{token}` until Epic 6 ships.
- A3 (UX): Should MISSING_ASPECT block approval? It is a warning in the interim.
- A4 (design team): What does a template render when the material has no images or videos?
- A5 (UX): The server rejects a concurrent save, but UX has no "someone else changed this" state.
- C3 (PRD owner): Autosave and the in-app toast are in the UX but in no FR.
- C4 (PRD owner): "Maintain templates" is in the role permissions but in no FR. UX proposes browse, turn variants on and off, and see usage.
