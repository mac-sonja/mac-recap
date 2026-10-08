---
title: "MAC Recap – MVP PRD (v2)"
status: draft
created: 2026-10-07
updated: 2026-10-08
version: 2
supersedes: "docs/sources/MAC Recap-PRD-EN v1.pdf"
---

# MAC Recap – MVP PRD (v2)

Oct 8, 2026 · @Sonja

This version updates PRD v1 (Oct 7, 2026) with the decisions taken in the product brief (`_bmad-output/planning-artifacts/briefs/brief-MAC-Recap-2026-10-08/`). FR, NFR and epic numbers are unchanged from v1. Retired items are marked, not renumbered.

**Changes from v1**

- The MVP is standalone. The MVP deadline is October 30, 2026, the demo date, not October 31.
- MAC Productive integration (FR9, Epic 7) and text-based case studies (FR10, Epic 8) have no date. They start when MAC Productive is ready, not on November 2.
- Owner and designer are one role. Account/sales and the social team share one role, which gets its own login in Sprint 3.
- "Publish" means publishing a case study as a shareable link. The tool does not post to social channels or the website.
- New guardrails NFR6 (no material, no generation) and NFR7 (human review before export or sharing). NFR2 and NFR4 are redefined.
- October 30 is a demo on material from one real past project, not a pilot.
- Epic 1 (BMAD setup) is now a team setup task, not product scope.
- New sections: success criteria, out of scope, known risks. The open points now include the brief's open questions.

## 1. Goals and context

MAC Recap is an internal web tool that turns a closed project's verified material into a finished case study. It does not generate content from scratch. It assembles, organizes and structures material that already exists and has been verified.

Only 4 of the 11 projects closed in the last 12 months were shown externally. Those took about two months to reach social channels, and none told both the technical and the graphic side of the work. Layout alone takes 1-2 hours per case study.

Goals:

- Reduce the owner's time to produce a case study to 15-20 minutes.
- Release the standalone MVP by October 30, 2026, and present it to the CEO as a demo that day.
- Validate the tool over 8 weeks after the demo and measure its business impact at 6 months.
- Integrate with MAC Productive once that system is ready. No date is set.

### 1.1 Success criteria

**October 30 demo (go / no-go with the CEO).** One real past project goes through MAC Recap live. Ideally it is one of the seven never published.

- From upload to approved case study in 15-20 minutes of the owner's hands-on time (NFR4).
- The same case study exported in several formats, such as deck, social carousel and PDF (FR7).
- The text covers both the technical and the graphic side of the project (NFR5).
- A person checks during review that every claim in the text can be traced back to the uploaded material (NFR2).

**8-week validation (after a go).** Real closed projects run through the standalone tool. Measures:

- Number of case studies generated
- Average owner time per case study, against a target of 15-20 minutes
- Amount of manual editing needed after generation
- Hallucinations or guardrail violations caught in review, against a target of zero

MAC closes about one project a month, so 8 weeks yields only a few case studies. Running the backlog of unpublished past projects through the tool gives a meaningful sample.

**6-month impact (around March 2027).**

- Share of closed projects that get a case study (baseline: 4 of 11, about 36%)
- Time from project close to first external use (baseline: about 2 months)
- Layout hours saved (baseline: 1-2 hours per case study). The 24-60 hour end-to-end baseline also includes producing material, which the MVP does not address.
- Inbound contacts and upsells attributed to a case study. The attribution method is open (open point 10).

**Counter-metric.** Owner time must not fall because the review gets shorter. A faster case study that skips the claim check (NFR2) is a failure, not a gain. [NOTE FOR PM: proposed in v2, not in the brief. Confirm.]

## 2. User roles

| Role | What they do in the tool |
|---|---|
| Owner/designer | Creates the case study, uploads project material, assigns tags, properties and flags, maintains templates, reviews, edits and approves the case study |
| Account/sales/social | Finds approved case studies, exports them as files, and publishes them as shareable links. Does not create, edit or approve case studies |
| Admin | Manages users and permissions, with no access to guardrails |

- Requests for a case study happen outside the tool, as today. MAC Recap has no request feature.
- The social team shares the account/sales/social role. It posts on its own channels outside the tool.
- The CEO is the final validator of the October 30 demo and has no role in the tool.

### 2.1 Terms

- **Case study.** The output for one project: graphic layouts plus text structured as challenge, approach and result. Each has a unique ID.
- **Deliverable.** One uploaded item (image, video or text) with its tags, properties and flags.
- **Approved case study.** A case study the owner/designer has reviewed and approved. Only approved case studies can be exported or shared.
- **Shareable link.** A link to a hosted version of an approved case study, such as a hosted presentation. Who can open it is open point 11.
- **Configurator.** The editing screen where the owner/designer adjusts layout, media and typography before approving.
- **Review dashboard.** The list of case studies and their statuses, including those waiting for review.

## 3. Functional requirements

### MVP (by October 30, 2026)

**FR1** – The system creates every case study with a unique ID, ready to be linked to the project order later. The owner/designer creates the case study manually. There is no trigger at project close.

**FR2** – The owner/designer uploads files and text, assigns tags, properties and flags to each deliverable, and fills in a short form on context, solution and results.
- [ASSUMPTION: upload limits follow the A3 sketch, up to 20 files of at most 100 MB each. Confirm.]

**FR3** – The system generates graphic case studies by applying templates to the uploaded material. It writes the text as challenge, approach and result, using only the uploaded material and form answers.
- If no material is uploaded, generation is not available (NFR6).

**FR4** – Templates adapt their layout to the number of available media items.

**FR5** – The owner/designer reviews and edits case studies through the review dashboard and the configurator.

**FR6** – When the owner/designer approves a case study, it becomes an approved case study. Approval is the mandatory human review (NFR7). It belongs to the owner/designer who uploaded the visual material.

**FR7** – Account/sales/social users can export an approved case study as files in the MVP formats, or publish it as a shareable link, such as a hosted presentation.
- Only approved case studies can be exported or shared.
- The tool does not post to social channels or the website.
- Which formats are in the MVP is open point 1.

**FR8** – Owner/designer, account/sales/social and admin users sign in through a login, with distinct roles and permissions. Delivered in Sprint 3.

### Post-MVP (after MAC Productive is ready, no date)

**FR9** – The tool connects to MAC Productive via MCP, using the case study's unique ID.

**FR10** – The system generates text-based case studies and whitepapers from project order data, for projects without visual material.

## 4. Non-functional requirements and guardrails

Guardrails are non-negotiable constraints. Any requirement that contradicts them must be flagged, not implemented.

**NFR1** – The AI does not alter graphic assets, the technical substance of the content, or template design.

**NFR2** – In the MVP, a person checks generated technical content for hallucinations during review, before approval. Every claim must trace back to the uploaded material. This is a manual step, not an automated feature.

**NFR3** – No role can configure the guardrails, admin included.

**NFR4** – The owner's hands-on time from upload to approval is 15-20 minutes at most. Time spent waiting for the draft to generate does not count, and generation time has no limit.

**NFR5** – Texts follow the defined narrative structure (challenge, approach, result) and the quality checklist. They cover both the technical and the graphic side of the project.

**NFR6** – If no material is uploaded, nothing is generated.

**NFR7** – No case study is exported or published as a shareable link without human review and approval. The review belongs to the owner/designer who uploaded the visual material.

## 5. Technical assumptions

- Dedicated database on Supabase, file storage on an AWS S3 bucket
- Development with Claude Code and the BMAD method
- Tool kept separate from MAC Productive. The future connection will run via MCP using the case study's unique ID.
- Development epics run one after another, in epic order, never in parallel
- Login, users and permissions arrive at the end of the MVP, in Sprint 3. Until then the tool runs without authentication in a development environment. Any real client material uploaded before then needs its confidentiality and NDA status cleared first (see Known risks).

## 6. Release plan by sprint

The order follows the development plan. Non-dev activities are prerequisites for the epics in the same sprint or the next one.

| Sprint | Due | Development | Non-dev activities |
|---|---|---|---|
| Sprint 1 | October 14 | Epic 2 – Asset upload and tagging | Team setup: Claude Code with the BMAD method (formerly Epic 1); tool design definition; template wireframes; data processing logic |
| Sprint 2 | October 21 | Epic 3 – Graphic case study generation; Epic 4 – Review and approval; Epic 5 – Download and publishing | Configurator visual design (Bento); account/sales/social user journey; final case study templates; narrative structure and quality criteria |
| Sprint 3 | October 28 | Epic 6 – Login, users and permissions | Mockups and assets for case studies; guardrail check; demo preparation; demo (October 30) |
| After MAC Productive is ready (no date) | — | Epic 7 – MAC Productive integration; Epic 8 – Text-based case study generation | — |
| Post-MVP (no date) | — | — | Mockup and asset guidelines |

## 7. Epic list

1. ~~Epic 1 – Setup with BMAD~~. Removed from the epic list. It is team setup, not product scope, and now sits in Sprint 1's non-dev activities.
2. Epic 2 – Asset upload and tagging: create the case study with a unique ID and handle file and text upload with tags, properties and flags
3. Epic 3 – Graphic case study generation: generate case studies by applying graphic templates to the uploaded material
4. Epic 4 – Review and approval: review, edit and approve case studies through the configurator and dashboard
5. Epic 5 – Download and publishing: export approved case studies as files and publish them as shareable links
6. Epic 6 – Login, users and permissions: introduce authentication and role-based permissions for the three roles
7. Epic 7 – MAC Productive integration (post-MVP, no date): connect the tool to the project management system via MCP
8. Epic 8 – Text-based case study generation (post-MVP, no date): generate text-based case studies and whitepapers from project order data

## 8. Epic details

### Epic 2 – Asset upload and tagging (Sprint 1)

Prerequisites: tool design definition, template wireframes (asset dimensions, formats).

**Story 2.1** – As the team, I want a Supabase database and AWS S3 storage to save case studies and assets.
- Case study data is stored on Supabase
- Uploaded files are stored on AWS S3

**Story 2.2** – As an owner/designer, I want to create a case study with a unique ID.
- I create the case study manually in MAC Recap
- Every case study receives a unique ID on creation
- The ID is ready for the future link to the project order

**Story 2.3** – As an owner/designer, I want to upload files and text to the case study.
- The file and text upload flow is complete
- Uploaded material is associated with the case study
- I can fill in the form on context, solution and results

**Story 2.4** – As an owner/designer, I want to assign tags, properties and flags to deliverables.
- Tags, properties and flags are saved for each deliverable

### Epic 3 – Graphic case study generation (Sprint 2)

Prerequisites: graphic template layouts, final case study templates, narrative structure and quality criteria, data processing logic.

**Story 3.1** – As an owner/designer, I want to generate a case study by applying graphic templates to the uploaded material.
- The case study is generated from the graphic templates
- Graphic assets and template design remain unchanged
- Texts follow the challenge, approach, result structure and use only the uploaded material and form answers
- If no material is uploaded, generation is not available

**Story 3.2** – As an owner/designer, I want the template to adapt to the number of available media items.
- The adaptation rules defined in the final template are applied

### Epic 4 – Review and approval (Sprint 2)

Prerequisite: configurator visual design (Bento).

**Story 4.1** – As an owner/designer, I want a review dashboard for generated case studies.
- The dashboard shows case studies awaiting review

**Story 4.2** – As an owner/designer, I want to edit a case study through the configurator.
- The configurator follows the designed Bento layout

**Story 4.3** – As an owner/designer, I want to approve a case study.
- Before approving, I check that every claim in the text traces back to the uploaded material
- The approved case study moves to the Approved status and becomes available for export and sharing
- A case study that is not approved cannot be exported or shared

### Epic 5 – Download and publishing (Sprint 2)

Prerequisite: account/sales/social user journey.

**Story 5.1** – As an account/sales/social user, I want to export the final material of an approved case study.
- Only approved case studies can be exported
- Export produces files in the MVP formats (open point 1)

**Story 5.2** – As an account/sales/social user, I want to publish an approved case study as a shareable link.
- The approved case study can be published as a shareable link, such as a hosted presentation
- Only approved case studies can be shared
- The tool does not post to social channels or the website

### Epic 6 – Login, users and permissions (Sprint 3)

**Story 6.1** – As an owner/designer, account/sales/social user or admin, I want to sign in through a login.
- There is a login for each of the three roles

**Story 6.2** – As an admin, I want to manage roles and permissions.
- Owner/designer: create, upload and tag, manage templates, review, edit and approve
- Account/sales/social: view approved case studies, export them, publish them as shareable links
- Admin: users and permissions

**Story 6.3** – As the team, I want no role to have access to the guardrails.
- Not even the admin can view or edit the guardrails

### MVP closing activities (Sprint 3, non-dev)

- **Guardrail check.** Verify that the AI does not alter graphic assets, technical substance or template design. Verify that nothing is generated without material. Check technical content for hallucinations.
- **Demo preparation.** Select one real past project, ideally one of the seven never published. Clear the confidentiality and NDA status of its material before upload. Prepare the material for the live run. [ASSUMPTION: a dry run with the creative director and sales collects feedback before the demo, replacing v1's pilot test. Confirm.]
- **Demo on October 30.** Run the project live for the CEO against the success criteria in section 1.1.

## 9. Post-MVP backlog (after MAC Productive is ready, no date)

### Epic 7 – MAC Productive integration

**Story 7.1** – As the team, I want to connect the tool to MAC Productive via MCP.
- Case study and project order are linked through the unique ID

**Story 7.2** – As the team, I want to verify the data and formats coming from MAC Productive.
- Data received from MAC Productive is compatible with the tool's data model

### Epic 8 – Text-based case study generation

**Story 8.1** – As an owner/designer, I want to build the narrative from the project order data uploaded to the tool.

**Story 8.2** – As an owner/designer, I want to generate mainly text-based case studies for projects without visual material.

**Story 8.3** – As an owner/designer, I want to generate text-based case studies in whitepaper format, so account/sales/social users can download or share them.

### Non-dev activities (post-MVP, no date)

- **Mockup and asset guidelines.** Decide how to standardize the assets included in case studies.

## 10. Out of scope for the MVP

- **MAC Productive integration via MCP** (FR9, Epic 7). This includes the "Crea case" button at project close and the case study appearing on the project order page.
- **Text-only case studies and whitepapers from project order data** (FR10, Epic 8). These depend on the integration.
- **An automatic trigger at project close.** Owners start case studies manually.
- **Collecting and tagging material during the project,** and mockup and asset guidelines.
- **Posting to social channels or the website from inside the tool.** Account/sales/social users download files or share links and post them elsewhere.
- **Requesting a case study inside the tool.**
- **Internal communication,** which the A3 analysis scoped out.

## 11. Known risks

- **The root cause stays open.** The A3 analysis traced the problem to the lack of a standard process for tagging assets during the project. The MVP acts only at project close, and nothing prompts the owner to start. MAC Recap makes case studies fast, but on its own it may not make them happen. Without a process owner, the 4-of-11 rate could persist.
- **Missing material still stops the flow.** If mockups or screenshots don't exist at close, the owner has to produce them before the 15-20 minutes can start.
- **Real client data is used before login exists.** Until Sprint 3, the tool runs without authentication, and the demo uses a real past project. The confidentiality and NDA status of that material must be cleared first.
- **The schedule is tight.** Sprint 2 (due October 21) carries generation, review and export. It depends on non-dev deliverables due at the same time: final templates, the narrative structure and quality criteria, and the configurator visual design.

## 12. Open points

These points must be resolved before the epics that depend on them.

1. **Export formats** (Epics 3 and 5). Which formats the MVP produces. The A3 deck shows eight: 16:9 deck, A4 whitepaper, 1080×1350 carousel, square post, 1080×1920 social video, 1200×675 LinkedIn cover, HD PNG pack and ZIP. Merges v1 points 1 and 5. The publishing channel is now settled as the shareable link.
2. **Data processing logic** (Epic 3). How the tool turns uploaded material into text.
3. **Tag, property and flag taxonomy** (Epic 2). The list and meaning of the values that can be assigned to deliverables.
4. **Account/sales/social user journey** (Epic 5). Partly resolved: these users reach approved case studies inside MAC Recap, with their own login from Sprint 3. Still open: how they find and browse case studies.
5. *Merged into point 1.*
6. **Test or real data.** Resolved: the demo uses material from one real past project. Its confidentiality and NDA status must be cleared before upload (Known risks).
7. **Data exposure from MAC Productive** (Epic 7). The data structure via MCP and client data confidentiality requirements.
8. **Case study status lifecycle** (Epic 4). The A3 screens use Draft, Processing, Awaiting approval, Approved and Published, and the names differ from screen to screen. v1 names only Approved.
9. **Owner/designer export rights** (Epics 5 and 6). Can the owner/designer also export and share, or only account/sales/social users? The demo needs someone to export the case study in several formats.
10. **Attribution** (6-month review). How inbound contacts and upsells are attributed to a case study.
11. **Shareable link access** (Epic 5). Can anyone with the link open it, only logged-in users, or does the link expire? This is a client confidentiality decision.
