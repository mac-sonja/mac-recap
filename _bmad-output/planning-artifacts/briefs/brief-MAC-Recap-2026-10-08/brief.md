---
title: "MAC Recap — Product Brief"
status: final
created: 2026-10-08
updated: 2026-10-08
---

# MAC Recap — Product Brief

## Executive Summary

MAC Recap is an internal web tool that turns a closed project's verified material into a finished case study in 15-20 minutes instead of 1-2 hours of layout work. The project owner uploads images, video and text and tags them. MAC Recap applies MAC's graphic templates and structures the story as challenge, approach and result. The owner refines the result in a configurator and approves it. Account, sales and social staff then download it as a deck, PDF or social format, or publish it as a shareable link. The tool assembles material that already exists; it does not invent content.

The problem is visibility, not just effort. Only 4 of the 11 projects closed in the last 12 months were ever shown externally. The ones that were shown took about two months to reach social channels, and none told both the technical and the graphic side of the work. Every unpublished project is a missed upsell and an inbound contact that never arrives.

The MVP is standalone. Integration with MAC Productive, the agency's project management system, will follow once that system is ready. No date is set. The MVP will be presented to the CEO on October 30, 2026, as a demo on prepared material from one real past project.

## The Problem

When a project closes, nobody has time to tell its story. Sales and account staff are left with nothing to show prospects, and the work stays invisible.

Today the process runs through three roles. Sales or account staff ask for a case study, the PM plans the work, and the creative team decides the narrative and deliverables, produces any missing material and lays out the case study. Material sits in OneDrive and project timing in Wrike. Which assets to produce is decided case by case, with no standard and no file categorisation.

What it costs:

- **24-60 hours per project** to build a case study end to end, 1-2 hours of which is layout alone.
- **4 of 11** closed projects publicised in the last 12 months.
- **About 2 months** on average before a case study reaches social channels.
- **0%** of case studies cover both the technical and the graphic side.
- **4 teams** affected: creative, sales, PM and social.
- **2 commercial levers** lost: upsell and inbound contacts.

The root cause, identified in the A3 analysis, is that there is no shared, standard process for uploading and tagging assets while a project is running. Without that structure, nobody sets aside time to produce case study content.

## The Solution

MAC Recap gives the end of every project one standard path:

1. **Create.** The project owner creates a case study, which gets a unique ID that will later link it to the project order.
2. **Upload and tag.** The owner uploads images, video and text, tags each deliverable, and fills in a short form on context, solution and results.
3. **Generate.** MAC Recap applies the graphic templates, adapting the layout to however many media items are available, and writes the text as challenge, approach and result using only what was uploaded.
4. **Review and approve.** The owner adjusts layout, media and typography in a configurator, then approves the case study. Human review before publication is mandatory.
5. **Export.** Account, sales and social staff download the approved case study in the format they need (a 16:9 deck, a PDF or social formats), or publish it as a shareable link, such as a hosted presentation.

**Guardrails are not negotiable:**

- The AI never alters graphic assets, the technical substance of the content, or template design.
- Generated technical content is checked for hallucinations by a person during review.
- If no material is uploaded, nothing is generated.
- No case study is published or shared without human review and approval.
- No role can change the guardrails, admin included.

## Who This Serves

| Role | What they do | What success looks like |
|---|---|---|
| **Owner/designer** (one role) | Creates the case study, uploads and tags material, maintains templates, reviews and approves | A case study that is on-brand and done in one sitting, without being laid out by hand |
| **Account/sales/social** | Find approved case studies, download them in the format they need, or publish them as a shareable link (for example a hosted presentation) | Material for prospects and social channels the week a project closes, without asking anyone |
| **Admin** | Manages users and permissions | — |

The social team shares the account/sales/social role and posts on its own channels outside the tool. The CEO is the final validator of the October 30 demo.

## Success Criteria

**October 30 demo (go / no-go with the CEO).** One real past project, ideally one of the seven never published, goes through MAC Recap live:

- From upload to approved case study in 15-20 minutes of the owner's time.
- The same case study exported in several formats (deck, social carousel, PDF).
- The text covers both the technical and the graphic side of the project.
- Every claim in the text can be traced back to the uploaded material, checked by a person during review.

**8-week validation (after a go).** Real closed projects run through the standalone tool:

- Number of case studies generated
- Average owner time per case study, against a target of 15-20 minutes
- Amount of manual editing needed after generation
- Hallucinations or guardrail violations caught in review, against a target of zero

MAC closes about one project a month, so 8 weeks will yield only a few real case studies. Running the backlog of unpublished past projects through the tool would give a meaningful sample.

**6-month impact (around March 2027).**

- Share of closed projects that get a case study (baseline: 4 of 11, about 36%)
- Time from project close to first external use (baseline: about 2 months)
- Layout hours saved (baseline: 1-2 hours per case study). The full 24-60 hour baseline also includes producing material, which the MVP does not address.
- Inbound contacts and upsells attributed to a case study. How to attribute them is not yet defined.

## Scope

**In the MVP (deadline October 30, 2026, the demo date):**

- Creating case studies, each with a unique ID
- Uploading files and text, with tags, properties and flags on each deliverable
- Generating case studies from templates, with layouts that adapt to the number of media items and text structured as challenge, approach and result
- A review dashboard and a configurator for editing and approval
- Exporting approved case studies as files, and publishing them as shareable links
- Logins and permissions for owner/designer, admin and account/sales/social (download and share links only), delivered in Sprint 3
- The guardrails listed under The Solution

**Out of the MVP:**

- **MAC Productive integration via MCP.** It starts when MAC Productive is ready; no date is set. This includes the "Crea case" button at project close and the case study appearing on the project order page.
- **Text-only case studies and whitepapers built from project order data.** These depend on the integration.
- **An automatic trigger at project close.** Owners start case studies manually.
- **Collecting and tagging material during the project,** and guidelines for mockups and assets.
- **Posting to social channels or the website from inside the tool.** Account, sales and social staff download files or share links, and post them elsewhere.
- **Internal communication,** which the A3 analysis scoped out.

## Known Risks

- **The root cause stays open.** The A3 analysis traced the problem to the lack of a standard process for tagging assets during the project. The MVP only acts at project close, and nothing prompts the owner to start. MAC Recap makes case studies fast, but on its own it may not make them happen; without a process owner, the 4-of-11 rate could persist.
- **Missing material still stops the flow.** If the mockups or screenshots don't exist at close, the owner has to produce them before the 15-20 minutes can start.
- **Real client data is used before login exists.** Until Sprint 3, the tool runs without authentication, and the demo uses a real past project. The confidentiality and NDA status of that material must be cleared first.
- **The schedule is tight.** Sprint 2 (due October 21) carries generation, review and export, and depends on non-development deliverables due at the same time: final templates, the narrative structure and quality criteria, and the configurator visual design.

## Open Questions

1. Which export formats are in the MVP? The deck shows eight; the PRD leaves this open.
2. What is the taxonomy of tags, properties and flags?
3. How exactly does the tool turn uploaded material into text?
4. How will inbound contacts and upsells be attributed to a case study for the 6-month review?
5. Who can open a shareable link: anyone who has it, only logged-in users, or a link that expires? This is a client confidentiality decision.

## Vision

Once MAC Productive is ready, closing a project order offers a "Crea case" button. Technical information and the brief are pulled in automatically via MCP, and the finished case study appears on the project order page for sales. Projects without visual material get text-only case studies and whitepapers built from project order data. The goal is that every closed project gets a case study that tells both its technical and its graphic story and becomes a lever for upsell and inbound contacts.
