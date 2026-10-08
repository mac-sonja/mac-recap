---
id: SPEC-mac-recap
companions:
  - success-metrics.md
  - delivery-plan.md
  - ui-flows.md
  - '../../planning-artifacts/architecture/architecture-MAC Recap-2026-10-08/ARCHITECTURE-SPINE.md'
sources:
  - '../../planning-artifacts/briefs/brief-MAC-Recap-2026-10-08/brief.md'
  - '../../planning-artifacts/briefs/brief-MAC-Recap-2026-10-08/addendum.md'
  - '/Users/Sonja/Downloads/MAC Recap-PRD-EN v1.pdf'
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# MAC Recap MVP

## Why

The pain is that MAC's finished work goes unseen. Only 4 of the 11 projects closed in the last 12 months were shown externally. Those took about two months to reach social channels, and none told both the technical and the graphic story, so upsell and inbound leads are lost. A case study takes 24–60 hours end to end, 1–2 hours of which is layout alone, and no one has time for it when a project closes. There is also a mandate: a working standalone MVP must be demoed to the CEO, the final validator, on October 30, 2026. MAC Recap turns a closed project's verified material into an on-brand case study in 15–20 minutes of the owner's time. It assembles what already exists and never invents content. It affects four teams: creative, sales, PM and social.

## Capabilities

- **CAP-1**
  - **intent:** The owner creates a case study, and it gets a unique, permanent ID that a project order can later be linked to.
  - **success:** Every new case study has an ID that never changes, is never reused, and is the only identifier other systems see.
- **CAP-2**
  - **intent:** The owner uploads images, video and text to a case study and tags each deliverable with tags, properties and flags.
  - **success:** Up to 20 files of up to 100 MB each are stored with the case study, each carrying its own tags, properties and flags. Anything over those limits, or of a type not allowed, is rejected.
- **CAP-3**
  - **intent:** The owner fills in a short form on business context, solution and results that feeds the narrative.
  - **success:** The form's answers are saved with the case study and show up as sources the narrative can cite.
- **CAP-4**
  - **intent:** The owner generates a graphic case study by applying MAC templates to the uploaded material, with a layout that adapts to how many media items there are.
  - **success:** Generation runs in the background and the case shows "In elaborazione" until the draft is ready. The draft uses an unchanged template design and unchanged assets. For each media count in the template's supported range, generation uses that count's slot mapping. Generation is refused when the case has no visual material or fewer media items than the template's minimum.
- **CAP-5**
  - **intent:** The narrative tells challenge, approach and result, covers both the technical and the graphic side, and is built only from uploaded material.
  - **success:** Every generated claim carries links to its source material, and any claim without a valid link is flagged for the reviewer. A draft missing either the technical or the graphic side is flagged MISSING_ASPECT and cannot be approved.
- **CAP-6**
  - **intent:** The owner/designer sees all case studies and their status on a review dashboard.
  - **success:** The dashboard lists cases with the statuses Bozza, In elaborazione, Da revisionare and Approvato, and shows the ones awaiting review.
- **CAP-7**
  - **intent:** The owner/designer refines a generated case study in a configurator: channels and formats, shuffle layout, replace media, template variants, canvas ratio, typography and spacing.
  - **success:** The configurator preview matches the exported files exactly, and edits can use only options the template defines.
- **CAP-8**
  - **intent:** The case owner approves the case study after checking every claim against its sources, which makes it available to sales.
  - **success:** Only the case owner can approve. Approval is blocked while any claim has neither a valid source nor explicit reviewer sign-off, or while a MISSING_ASPECT flag is open. The approved version stays fixed, and editing it again creates a new version to review.
- **CAP-9**
  - **intent:** Account, sales and social staff find approved case studies and download them in the format they need.
  - **success:** They can list approved case studies and download the same case in several formats, including a 16:9 deck, a PDF and a social carousel. Unapproved content cannot be exported.
- **CAP-10**
  - **intent:** Account, sales and social staff publish an approved case study as a shareable link, such as a hosted presentation.
  - **success:** The link shows the approved version and does not change if the case is edited later. It can be revoked or set to expire, and a revoked or expired link returns not found.
- **CAP-11**
  - **intent:** Users sign in with one of three roles (owner/designer, account/sales/social, admin), and the admin manages users and roles.
  - **success:** Every action follows the role permission matrix in the architecture spine (AD-11). The admin can manage users and reassign case owners but cannot view or change guardrails.
- **CAP-12**
  - **intent:** The team can measure each case's owner time, editing effort and review findings for the 8-week validation.
  - **success:** For any approved case, the system reports the owner's hands-on time from first upload to approval and the difference between the generated draft and the approved version. Every step is recorded as a timestamped event with who did it.

## Constraints

- These guardrails are not negotiable, and any requirement that contradicts them is flagged, not built:
  - The AI never alters graphic assets, the technical substance of the content, or template design.
  - With no visual material, nothing is generated.
  - Nothing is shared or exported before human review and approval.
  - A person checks the generated technical content for hallucinations during review.
  - No role can view or change the guardrails, admin included.
- The MVP is due on **October 30, 2026**, the demo date (not October 31). The sprints are due October 14, 21 and 28. Epics run one after another, never in parallel (see `delivery-plan.md`).
- The MVP is standalone from MAC Productive. Any future link runs through MCP and is keyed only on the case study's unique ID.
- Data lives in Supabase and files in an AWS S3 bucket. The system is built with Claude Code and the BMAD method. The architecture spine's AD-1 to AD-20 are binding.
- Login arrives only in Sprint 3. Until then every deployed environment must be gated (AD-12), because the demo uses real client material. That material's NDA was confirmed cleared by Sonja on 2026-10-08, including processing through the Anthropic API.
- NFR4: the owner's hands-on time from upload to approved case study is 15–20 minutes at most.
- The narrative follows challenge, approach and result, and meets the quality checklist (NFR5).
- Case studies are created by hand. The owner opens MAC Recap and starts one; there is no trigger when a project closes.

## Non-goals

- MAC Productive integration via MCP. This includes the "Crea case" button at project close and the case appearing on the project order page. It starts when MAC Productive is ready; no date is set.
- Text-only case studies and whitepapers built from project order data (Epic 8).
- An automatic trigger at project close.
- Collecting or tagging material while the project is running, and guidelines for mockups and assets.
- Posting to social channels or the website from inside the tool.
- Internal communication.
- Automated hallucination detection. The NFR2 check is done by a person during review.
- Creating or editing templates inside the tool. Templates change only in code.

## Success signal

- At the October 30 demo, one real past project, ideally one of the seven never published, goes live from upload to an approved case study in 15–20 minutes of the owner's time. It is exported as a deck, a social carousel and a PDF. The text covers both the technical and the graphic side, and the CEO can trace every claim to the uploaded material. The 8-week and 6-month targets are in `success-metrics.md`.

## Assumptions

- Epic 1 (BMAD setup) is team setup that is already done, not product scope.
- Allowed upload types are JPEG, PNG, WebP, MP4, MOV and PDF.
- PPTX export is one rendered image per slide; editable slides are deferred.
- Templates are coded from the designer's specs. In the tool, owner/designer only picks a template, variant and settings.
- The UI is in Italian, and each case's narrative is in Italian or English (default Italian).
- The social team shares the account/sales/social role and has no separate login.
- Development and staging in Sprints 1–2 use the demo project's real material, but only inside environments gated under AD-12.
- Where this spec differs from PRD v1, the difference is deliberate, following the brief or the architecture spine:
  - Owner and designer are one role, and account/sales/social is one role.
  - "Publish" means a share link.
  - Templates change only in code.
  - Generation requires visual material.
  - The "Da revisionare" status is added.
  - Deployed environments are gated before login exists.

## Open Questions

- Q1: Which export formats are in the MVP? The deck shows eight (see `ui-flows.md`). This must be decided before the Epic 3 templates are final.
- Q2: What are the values of the tag, property and flag taxonomy? They must be seeded before Story 2.4.
- Q3: What are the narrative prompt and quality checklist? They are due with Sprint 2's "narrative structure and quality criteria".
- Q4: How will inbound contacts and upsells be attributed to a case study for the 6-month review?
- Q5: Who can open a shareable link by default: anyone with the link, only signed-in users, or anyone until the link expires? This must be decided before Epic 5 ships.
- Which EU container host will run the app? It must be chosen by the end of Sprint 1.
- What does "Lovable" mean in PRD Story 7.2? Clarify or remove it before Epic 7.
