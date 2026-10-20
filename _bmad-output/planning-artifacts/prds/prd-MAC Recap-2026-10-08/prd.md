---
title: "MAC Recap – MVP PRD (v2)"
status: final
created: 2026-10-07
updated: 2026-10-19
version: 2
supersedes: "docs/sources/MAC Recap-PRD-EN v1.pdf"
---

# MAC Recap – MVP PRD (v2)

Oct 8, 2026 · @Sonja

Updated Oct 14, 2026: favourites replace tags, properties and flags, there is no pasted text, and removing a file has no undo ([Sprint Change Proposal 2026-10-14](../../sprint-change-proposal-2026-10-14.md)). Files are stored in Supabase Storage, not AWS S3 ([storage proposal](../../sprint-change-proposal-2026-10-14-storage.md)).

Updated Oct 15, 2026: case studies belong to client records managed on a Clients page, and show a readable code such as LUM-2026-01 next to the permanent ID ([Sprint Change Proposal 2026-10-15](../../sprint-change-proposal-2026-10-15.md)).

Updated Oct 16, 2026: clients have a description, sector and logo, shown in every case study as an About the client block and used by the AI; client info is live, so every case study, approved ones included, always shows the client's current info ([Sprint Change Proposal 2026-10-16](../../sprint-change-proposal-2026-10-16.md), with its owner amendment of the same day).

Updated Oct 16, 2026 (second): before the October 30 demo (owner amendment the same day: "Tutto. dovremmo farcela"), a client gets AI-drafted intro pages from its data and 2–3 images; editing a client opens an overview of its intro and case histories; users can download a client's intro and approved case histories in one file, or build named collections of approved case histories ([Sprint Change Proposal 2026-10-16, client intro and collections](../../sprint-change-proposal-2026-10-16-client-intro-and-collections.md)).

Updated Oct 19, 2026: Add client is a three-step wizard (Dettagli, Materiale, Introduzione). Client fields: name, industries (fixed list, multiselect), description, logo, context, solution, results, all required. Client material: up to 3 files, any type, at least 2 images ([Sprint Change Proposal 2026-10-19](../../sprint-change-proposal-2026-10-19.md)).

This version updates PRD v1 (Oct 7, 2026) with the decisions taken in the product brief (`_bmad-output/planning-artifacts/briefs/brief-MAC-Recap-2026-10-08/`). FR, NFR, epic, story and open-point numbers are unchanged from v1. Retired items are marked, not renumbered, and new items are added at the end.

**Changes from v1**

- The MVP is standalone. The MVP deadline is October 30, 2026, the demo date, not October 31.
- MAC Productive integration (FR9, Epic 7) and text-based case studies (FR10, Epic 8) have no date. They start when MAC Productive is ready, not on November 2.
- Owner and designer are one role. Account/sales and the social team share one role, which gets its own login in Sprint 3.
- "Publish" means publishing a case study as a shareable link. The tool does not post to social channels or the website.
- New guardrails NFR6 (no material, no generation) and NFR7 (human review before export or sharing). NFR2 and NFR4 are redefined.
- October 30 is a demo on material from one real past project, not a pilot. Onboarding and feedback happen in person, outside the tool.
- Epic 1 (BMAD setup) is now a team setup task, not product scope.
- The owner/designer creates case studies manually. Requests for a case study happen outside the tool.
- FR2 adds the details form, FR3 limits the text to uploaded material, and NFR5 requires both the technical and the graphic side.
- The owner/designer can edit generated text and can export and share. Any owner/designer can approve, not only the one who uploaded the material, which relaxes the A3 deck's rule.
- Story 8.3: the owner/designer generates the whitepaper and account/sales/social users download or share it. Story 7.2 no longer mentions Lovable.
- New sections: success criteria, terms, out of scope, known risks. The open points now include the brief's open questions, plus two from the A3 deck (points 8 and 9).

## 1. Goals and context

MAC Recap is an internal web tool that turns a closed project's verified material into a finished case study. It does not generate content from scratch. It assembles, organizes and structures material that already exists and has been verified.

Only 4 of the 11 projects closed in the last 12 months were shown externally. Those took about two months to reach social channels, and none told both the technical and the graphic side of the work. Layout alone takes 1-2 hours per case study.

Goals:

- Reduce the owner/designer's time to produce a case study to 15-20 minutes.
- Release the standalone MVP by October 30, 2026, and present it to the CEO as a demo that day.
- Validate the tool over 8 weeks after the demo and measure its business impact at 6 months.
- Integrate with MAC Productive once that system is ready. No date is set.

### 1.1 Success criteria

**October 30 demo (go / no-go with the CEO).** One real past project goes through MAC Recap live. Ideally it is one of the seven never published.

- From upload to approved case study in 15-20 minutes of the owner/designer's hands-on time (NFR4).
- The same case study exported in several formats, such as deck, social carousel and PDF (FR7).
- The text covers both the technical and the graphic side of the project (NFR5).
- A person checks during review that every claim in the text can be traced back to the uploaded material (NFR2).

The demo is a go only if all four criteria pass. After a no-go, the team fixes the gaps and presents again on a new date.

**8-week validation (after a go).** Real closed projects run through the standalone tool. Measures:

- Number of case studies generated
- Average owner/designer time per case study, against a target of 15-20 minutes
- Amount of manual editing needed after generation
- Hallucinations or guardrail violations that reach an approved case study, against a target of zero
- Hallucinations caught in review, tracked with no target. A high count signals weak generation, not a weak review.

MAC closes about one project a month, so 8 weeks yields only a few case studies. Running the backlog of unpublished past projects through the tool gives a meaningful sample.

**6-month impact (around March 2027).**

- Share of closed projects that get a case study (baseline: 4 of 11, about 36%)
- Time from project close to first external use (baseline: about 2 months)
- Layout hours saved (baseline: 1-2 hours per case study). The 24-60 hour end-to-end baseline also includes producing material, which the MVP does not address.
- Inbound contacts and upsells attributed to a case study. The attribution method is open (open point 10).

**Counter-metric.** Owner/designer time must not fall because the review gets shorter. A faster case study that skips the claim check (NFR2) is a failure, not a gain.

## 2. User roles

| Role | What they do in the tool |
|---|---|
| Owner/designer | Creates the case study, uploads project material, marks favourite images and videos, maintains templates, reviews, edits and approves the case study. Can also export and share approved case studies. Also creates and approves client intros, edits clients and their case histories from the client overview, builds collections and edits their text |
| Account/sales/social | Finds approved case studies, exports them as files, and publishes them as shareable links. Does not create, edit or approve case studies. Also downloads a client's pack from the Clients list and builds collections (reorder, hide pages; no text edits, decided by the owner on 2026-10-16) |
| Admin | Manages users and assigns them to roles. Cannot change role permissions or the guardrails |

- Requests for a case study happen outside the tool, as today. MAC Recap has no request feature.
- The social team shares the account/sales/social role. It posts on its own channels outside the tool.
- The CEO is the final validator of the October 30 demo and has no role in the tool.

### 2.1 Terms

- **Case study.** The output for one project: graphic layouts plus text structured as challenge, approach and result. Each has a unique ID and a readable case history code, and belongs to one client. In the Italian UI a case study is called a *case history* (PR #38); "case study" stays the internal term in these documents, story keys, tables (`case_study`) and code.
- **Client.** A company MAC worked for. Each has an automatic short code (e.g. LUM). Clients are managed on the Clients page. Each has industries, a description, a logo, a brief (context, solution, results) and up to 3 files of material (SCP 2026-10-19).
- **About the client block.** The part of every case study that shows the client's logo, name, industries and description, always as they currently are on the client. A change to the client shows in all its case studies, drafts and approved ones alike.
- **Case history code.** Client code, year and a number per client and year, e.g. LUM-2026-01. Fixed once the case study is created.
- **Material.** Uploaded files: images, videos, text documents and PDFs. The details form is not material.
- **Asset.** A single uploaded material file. Images and videos can be marked as favourite.
- **Approved case study.** A case study the owner/designer has reviewed and approved. Only approved case studies can be exported or shared.
- **Shareable link.** A link to a hosted version of an approved case study, such as a hosted presentation. Who can open it is open point 11.
- **Configurator.** The editing screen where the owner/designer adjusts text, layout, media and typography before approving.
- **Review dashboard.** The list of case studies and their statuses, including those waiting for review.
- **Client intro.** Pages that introduce a client, drafted by the AI from the client's data, its brief and its material, laid out with its 2–3 images, and approved like a case study. They show the client's current info.
- **Client overview.** The configurator view of a client's intro and all its case studies as one file.
- **Client pack.** One file with a client's approved intro and approved case studies.
- **Collection.** A named, saved set of approved case studies in a chosen order, with its own text edits and hidden pages.

## 3. Functional requirements

### MVP (by October 30, 2026)

**FR1** – The system creates every case study with a unique ID, ready to be linked to the project order later, and a readable case history code. The owner/designer picks the case study's client from the client list. The owner/designer creates the case study manually. There is no trigger at project close. Amended (owner, 2026-10-20, Story 2.17): every case study also has a business line from a fixed list (Branding, Social media, Video, Web design, Advertising, Eventi), chosen when it is created, together with its name, client, year and language.

**FR2** – The owner/designer uploads material (images, videos, text documents and PDFs), can mark any number of images and videos as favourite, and fills in a short details form on context, solution and results. The details form is the only place for typed project text. Amended (owner, 2026-10-20, Story 2.17): the details form is filled in first, together with the case's name, client, year, language and business line, and the material is uploaded after it.
- Upload is limited to 20 files of at most 50 MB each. (50 MB is the hosted Supabase plan's upload cap; it returns to 100 MB when the plan is upgraded. Owner decision 2026-10-14.)

**FR3** – The system generates graphic case studies by applying templates to the uploaded material. It writes the text as challenge, approach and result, using only the uploaded material, the form answers and the client's description, industries and brief. Every case study shows the client's info in an About the client block.
- If no material is uploaded, generation is not available (NFR6).

**FR4** – Templates adapt their layout to the number of available media items.

**FR5** – The owner/designer reviews and edits case studies through the review dashboard and the configurator. Editing covers the generated text as well as layout, media and typography, so a claim that fails the review check (NFR2) can be corrected before approval.

**FR6** – When the owner/designer approves a case study, it becomes an approved case study. Approval is the mandatory human review (NFR7). Any owner/designer can approve.

**FR7** – Owner/designer and account/sales/social users can export an approved case study as files in the MVP formats, or publish it as a shareable link, such as a hosted presentation.
- Only approved case studies can be exported or shared.
- The tool does not post to social channels or the website.
- Which formats are in the MVP is open point 1.
- Until open point 11 is decided, anyone with a shareable link can open it.

**FR8** – Owner/designer, account/sales/social and admin users sign in through a login, with distinct roles and permissions. Delivered in Sprint 3.

### Post-MVP (after MAC Productive is ready, no date)

**FR9** – The tool connects to MAC Productive via MCP, using the case study's unique ID.

**FR10** – The system generates text-based case studies and whitepapers from project order data, for projects without visual material.

### Client intros and collections (MVP, Sprints 2–3)

Added by the [Sprint Change Proposal 2026-10-16, client intro and collections](../../sprint-change-proposal-2026-10-16-client-intro-and-collections.md). By the owner's amendment of the same day, these are built before the October 30 demo, in Sprints 2 and 3, and nothing else is cut.

**FR11** – Creating a client is a wizard: details (all required), then up to 3 files with at least 2 images, then the intro in the configurator (SCP 2026-10-19). The system drafts the client's intro pages from the client's name, industries, description, brief and material, and the owner/designer edits, checks and approves them in the configurator.

**FR12** – Editing a client opens the client overview: the intro and every case study of the client in one preview. Editing a case study there edits that case study.

**FR13** – Owner/designer and account/sales/social users download a client pack, or build, save and export collections of approved case studies (16:9 deck and A4 PDF). A client with 2 or more case studies in a file gets its intro in front of them; otherwise each case study keeps its own intro. Text edits and hidden pages in a collection apply only to that collection. Only owner/designers edit text in a collection (decided by the owner on 2026-10-16).

## 4. Non-functional requirements and guardrails

Guardrails are non-negotiable constraints. Any requirement that contradicts them must be flagged, not implemented.

**NFR1** – The AI does not alter graphic assets, the technical substance of the content, or template design.
- [FLAG: possible conflict with FR4 and FR7. Layouts adapt to the number of media items, and exports resize to 16:9, 4:5, 1:1, 9:16 and A4. What counts as "altering" is open point 12.]

**NFR2** – In the MVP, a person checks generated technical content for hallucinations during review, before approval. Every claim must trace back to the uploaded material or the form answers. This is a manual step, not an automated feature.

**NFR3** – No role can configure the guardrails, admin included.

**NFR4** – The owner/designer's hands-on time from upload to approval is at most 20 minutes, with a target of 15. If the claim check (NFR2) needs more time, NFR2 wins. Time spent waiting for the draft to generate does not count, and generation time has no limit.

**NFR5** – Texts follow the defined narrative structure (challenge, approach, result) and the quality checklist, which is defined in the Sprint 2 non-dev deliverable "narrative structure and quality criteria". They cover both the technical and the graphic side of the project.

**NFR6** – If no material is uploaded, nothing is generated. A filled-in details form without material is not enough. For a client intro, the same rule: fewer than 2 client images, no intro.

**NFR7** – No case study is exported or published as a shareable link without human review and approval by an owner/designer. This includes client intros, client packs and collections. A collection contains only approved content and text written by an owner/designer (decided by the owner on 2026-10-16).

## 5. Technical assumptions

- Dedicated Supabase project (EU) for the database and for file storage (a private Supabase Storage bucket)
- Development with Claude Code and the BMAD method
- Tool kept separate from MAC Productive. The future connection will run via MCP using the case study's unique ID.
- Development epics run one after another, in epic order, never in parallel
- Login, users and permissions arrive at the end of the MVP, in Sprint 3. Until then the tool runs without authentication in a development environment. Any real client material uploaded before then needs its confidentiality and NDA status cleared first (see Known risks).

## 6. Release plan by sprint

The order follows the development plan. Non-dev activities are prerequisites for the epics in the same sprint or the next one.

| Sprint | Due | Development | Non-dev activities |
|---|---|---|---|
| Sprint 1 | October 14 | Epic 2 – Asset upload | Team setup: Claude Code with the BMAD method (formerly Epic 1); tool design definition; template wireframes; data processing logic |
| Sprint 2 | October 21 | Epic 3 – Graphic case study generation (with the client intro draft); Epic 4 – Review and approval (with client intro review and the client overview); Epic 5 – Download and publishing (continues into Sprint 3) | Configurator visual design (Bento); account/sales/social user journey; final case study templates (with page names and intro pages); client intro template (by October 20); narrative structure and quality criteria; first guardrail check |
| Sprint 3 | October 28 | Epic 5 – Download and publishing (with client packs and collections), then Epic 6 – Login, users and permissions | Mockups and assets for case studies; final guardrail check; demo preparation; demo (October 30) |
| After MAC Productive is ready (no date) | — | Epic 7 – MAC Productive integration; Epic 8 – Text-based case study generation | — |
| Post-MVP (no date) | — | — | Mockup and asset guidelines |

## 7. Epic list

1. ~~Epic 1 – Setup with BMAD~~. Removed from the epic list. It is team setup, not product scope, and now sits in Sprint 1's non-dev activities.
2. Epic 2 – Asset upload: create the case study with a unique ID and a readable code for a client from the client list, and handle file upload, favourites and the details form
3. Epic 3 – Graphic case study generation: generate case studies by applying graphic templates to the uploaded material
4. Epic 4 – Review and approval: review, edit and approve case studies through the configurator and review dashboard
5. Epic 5 – Download and publishing: export approved case studies as files and publish them as shareable links
6. Epic 6 – Login, users and permissions: introduce authentication and role-based permissions for the three roles
7. Epic 7 – MAC Productive integration (post-MVP, no date): connect the tool to the project management system via MCP
8. Epic 8 – Text-based case study generation (post-MVP, no date): generate text-based case studies and whitepapers from project order data

## 8. Epic details

### Epic 2 – Asset upload (Sprint 1)

Prerequisites: tool design definition, template wireframes (asset dimensions, formats).

**Story 2.1** – As the team, I want a Supabase database and Supabase Storage to save case studies and assets.
- Case study data is stored on Supabase
- Uploaded files are stored in a private Supabase Storage bucket

**Story 2.2** – As an owner/designer, I want to create a case study with a unique ID.
- I create the case study manually in MAC Recap
- Every case study receives a unique ID on creation
- The ID is ready for the future link to the project order
- I pick the client from the existing clients
- The case study shows a readable code, e.g. LUM-2026-01, that never changes

**Story 2.3** – As an owner/designer, I want to upload files to the case study.
- The file upload flow is complete
- Uploaded material is associated with the case study
- I can fill in the details form on context, solution and results

**Story 2.4** – As an owner/designer, I want to mark images and videos as favourite.
- The favourite mark is saved for each image or video; it's optional and any number can be marked

**Story 2.5** – As an owner/designer, I want to manage the client list.
- I can add a client and edit its name
- The client code is automatic and never changes
- I can open a client to see only its case studies
- I add a client's industries, a description, a logo, a brief (context, solution, results) and up to 3 files of material, all required
- A change to a client's info (name, logo, industries, description, brief, material) shows in all its case studies, approved ones included
- Replacing or removing a logo deletes the old one
- Creating a client is a wizard like a case study: details, then material, then the intro
- Editing a client opens the client overview

**Story 2.6** – As an owner/designer, I want to add material to each client.
- Adding a client asks for up to 3 files of any material type, at least 2 of them images (PNG, JPEG or WebP, at least 1600 px on the short side)
- Replacing or removing a file deletes the old one; a client keeps at least 2 images

### Epic 3 – Graphic case study generation (Sprint 2)

Prerequisites: graphic template layouts, final case study templates (each with an About the client area), narrative structure and quality criteria, data processing logic.

**Story 3.1** – As an owner/designer, I want to generate a case study by applying graphic templates to the uploaded material.
- The case study is generated from the graphic templates
- Graphic assets and template design remain unchanged
- Texts follow the challenge, approach, result structure and use only the uploaded material, form answers and the client's info
- The case study shows an About the client block (logo, name, industries, description)
- Layouts are generated for the MVP export formats (open point 1)
- If no material is uploaded, generation is not available

**Story 3.2** – As an owner/designer, I want the template to adapt to the number of available media items.
- The adaptation rules defined in the final template are applied

**Story 3.3** – As an owner/designer, I want the AI to draft a client's intro pages.
- The draft is made from the client's name, industries, description and brief, plus its material as open point 2 allows (a headline and one short paragraph), and laid out with its 2–3 images
- With fewer than 2 images, no intro is generated

### Epic 4 – Review and approval (Sprint 2)

Prerequisite: configurator visual design (Bento).

**Story 4.1** – As an owner/designer, I want a review dashboard for generated case studies.
- The dashboard shows case studies awaiting review

**Story 4.2** – As an owner/designer, I want to edit a case study through the configurator.
- The configurator follows the designed Bento layout
- I can edit the generated text, layout, media and typography

**Story 4.3** – As an owner/designer, I want to approve a case study.
- Before approving, I check that every claim in the text traces back to the uploaded material or the form answers
- Any owner/designer can approve
- The approved case study moves to the Approved status and becomes available for export and sharing
- A case study that is not approved cannot be exported or shared
- An owner/designer can still edit an approved case study. Saved changes update the case study and its shareable links, and it stays approved.

**Story 4.4** – As an owner/designer, I want to review, edit and approve a client intro like a case study.
- The intro opens in the configurator as the last step of the Add client wizard (designed with the owner first)
- Every block is checked before approval; only an approved intro appears in downloads

**Story 4.5** – As an owner/designer, I want editing a client to open the client overview.
- The intro and every case study of the client show as one preview
- Editing a case study there edits that case study; an approved one goes live only when its approved version is updated

### Epic 5 – Download and publishing (Sprint 2)

Prerequisite: account/sales/social user journey.

**Story 5.1** – As an owner/designer or account/sales/social user, I want to export an approved case study as files.
- Only approved case studies can be exported
- Export produces files in the MVP formats (open point 1)

**Story 5.2** – As an owner/designer or account/sales/social user, I want to publish an approved case study as a shareable link.
- The approved case study can be published as a shareable link, such as a hosted presentation
- Only approved case studies can be shared
- The tool does not post to social channels or the website

**Story 5.3** – As an owner/designer or account/sales/social user, I want to download a client pack from the Clients list.
- One file with the client's approved intro and approved case studies; with only one case study, or no approved intro, each case study keeps its own intro

**Story 5.4** – As an owner/designer or account/sales/social user, I want to build a collection.
- I pick approved case studies, name the collection, reorder it and export it as a 16:9 deck or A4 PDF
- A client with 2 or more case studies gets its intro in front of them, and its case studies stay together
- Collections are saved, visible to everyone who can export, and can be reopened, changed and exported again

**Story 5.5** – As the person preparing a collection, I want to hide pages and, as an owner/designer, edit texts only in that collection.
- The original case studies never change; untouched text follows the current approved version, and an edited block whose original changed is flagged

### Epic 6 – Login, users and permissions (Sprint 3)

**Story 6.1** – As an owner/designer, account/sales/social user or admin, I want to sign in through a login.
- There is a login for each of the three roles

**Story 6.2** – As an admin, I want to assign users to roles.
- Each role's permissions are fixed. The admin cannot change what a role can do
- Owner/designer: create, upload and mark favourites, manage templates, review, edit, approve, export and share
- Account/sales/social: view approved case studies, export them, publish them as shareable links
- Admin: users and role assignment

**Story 6.3** – As the team, I want no role to be able to configure the guardrails.
- No role, admin included, has a setting that disables or changes NFR1-NFR7

### MVP closing activities (Sprint 3, non-dev)

- **Final guardrail check.** A first check runs at the end of Sprint 2, leaving time for fixes. Verify that the AI does not alter graphic assets, technical substance or template design. Verify that nothing is generated without material. Check technical content for hallucinations.
- **Demo preparation.** Select one real past project, ideally one of the seven never published. Clear the confidentiality and NDA status of its material before upload. Prepare the material for the live run. Run a dry run with the creative director and sales before the demo, collecting their feedback in person. This replaces v1's pilot test.
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
- **Text-based case studies and whitepapers from project order data** (FR10, Epic 8). These depend on the integration.
- **An automatic trigger at project close.** The owner/designer starts case studies manually.
- **Collecting and tagging material during the project.**
- **Mockup and asset guidelines.**
- **Posting to social channels or the website from inside the tool.** Account/sales/social users download files or share links and post them elsewhere.
- **Requesting a case study inside the tool.**
- **Onboarding and feedback collection inside the tool.** Both happen in person. v1's "pilot test and onboarding" is replaced by the demo dry run.
- **Internal communication,** which the A3 analysis scoped out.
- **A shareable link to a collection or a client pack.** These are downloads only.

## 11. Known risks

- **The root cause stays open.** The A3 analysis traced the problem to the lack of a standard process for tagging assets during the project. The MVP acts only at project close, and nothing prompts the owner/designer to start. MAC Recap makes case studies fast, but on its own it may not make them happen. Without a process owner, the 4-of-11 rate could persist.
- **Missing material still stops the flow.** If mockups or screenshots don't exist at close, the owner/designer has to produce them before the 15-20 minutes can start.
- **Real client material is used before login exists.** Until Sprint 3, the tool runs without authentication, and the demo uses a real past project. The confidentiality and NDA status of that material must be cleared first. Until open point 11 is decided, shareable links open for anyone who has them, so a forwarded link exposes client material.
- **The schedule is tight.** Sprint 2 (due October 21) carries generation, review and export. It depends on non-dev deliverables due at the same time: final templates, the narrative structure and quality criteria, and the configurator visual design. Epics run strictly one after another, so Epic 3 can't start until those land. Since October 16 the MVP also carries client intros, the client overview, client packs and collections (about 15 more dev days, owner amendment), so Epic 5 continues into Sprint 3 and the October 30 demo criteria are at risk if the dates slip. The "graphic template layouts" prerequisite of Epic 3 has no sprint.

## 12. Open points

These points must be resolved before the epics that depend on them. Owners are not yet assigned.

1. **Export formats** (Epics 3 and 5; decide before Sprint 2). Which formats the MVP produces. The demo criteria set a minimum: 16:9 deck, social carousel and PDF. The A3 deck shows eight: 16:9 deck, A4 whitepaper, 1080×1350 carousel, square post, 1080×1920 social video, 1200×675 LinkedIn cover, HD PNG pack and ZIP. Merges v1 points 1 and 5. The publishing channel is now settled as the shareable link.
2. **Data processing logic** (Epic 3; decide before Sprint 2). How the tool turns uploaded material into text.
3. **Tag, property and flag taxonomy.** Resolved 2026-10-14: no taxonomy. Tags, properties and flags are dropped; favourites replace them (Story 2.4).
4. **Account/sales/social user journey** (Epic 5). Partly resolved: these users reach approved case studies inside MAC Recap, with their own login from Sprint 3. Still open: how they find and browse case studies.
5. *Merged into point 1.*
6. **Test or real data.** Resolved: the demo uses material from one real past project. Its confidentiality and NDA status must be cleared before upload (Known risks).
7. **Data exposure from MAC Productive** (Epic 7). The data structure via MCP and client data confidentiality requirements.
8. **Case study status lifecycle** (Epic 4; decide before Sprint 2). The A3 screens use Draft, Processing, Awaiting approval, Approved and Published, and the names differ from screen to screen. v1 names only Approved.
9. **Owner/designer export rights.** Resolved: both owner/designer and account/sales/social users can export and share approved case studies.
10. **Attribution** (6-month review). How inbound contacts and upsells are attributed to a case study.
11. **Shareable link access** (Epic 5). Until this is decided, links open for anyone who has them (FR7). Can anyone with the link open it, only logged-in users, or does the link expire? This is a client confidentiality decision.
12. **What counts as altering** (Epics 3 and 4, NFR1; decide before Sprint 2). Whether adapting the layout to the number of media items (FR4), the configurator's shuffle and replace, and resizing for export formats count as altering graphic assets or template design. The design team defines the boundary.
13. **Recording the 8-week measures.** How owner/designer time, editing and hallucinations are recorded during validation.
14. **What a favourite means for generation** (Epic 3; decide before Sprint 2). Whether generation must use, prefers, or simply shows favourites first.
15. **Who may edit text in a collection** (Epic 5). Resolved 2026-10-16 by the owner: only owner/designers edit text in a collection; account/sales/social reorder, hide pages and export. If sales people need to change wording, the planned upgrade is an owner/designer approval of their edits before export. Assumption: "PM" in the owner's request means an owner/designer in the tool.
