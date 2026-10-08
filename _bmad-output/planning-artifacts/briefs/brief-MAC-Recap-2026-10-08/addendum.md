---
title: "MAC Recap — Brief Addendum"
created: 2026-10-08
updated: 2026-10-08
---

# MAC Recap — Brief Addendum

This addendum holds detail that belongs downstream (PRD, UX, architecture) rather than in the brief.

## Source material

- A3 deck (Italian): `docs/sources/MAC Recap_Modello A3.pdf`
- PRD draft v1 (English): `docs/sources/MAC Recap-PRD-EN v1.pdf`. It holds the FRs, NFRs, epics and stories, and is the primary input for `bmad-prd`.

## Baseline data (from the A3 deck)

- 24-60 hours spent per project to build a case study (end to end, including material production)
- 1-2 hours of layout time per case study today; target 15-20 minutes
- 4 of 11 closed projects publicised externally in the last 12 months
- About 2 months on average before a case study reaches social channels
- 0% of case studies tell both the technical and the graphic side of the project
- 4 teams affected: creative, sales, PM, social

## Current process (AS-IS)

Sales/account requests the case study → PM plans the work → creative team defines narrative and deliverables → if material is incomplete, the creative team produces it → the creative team builds the case study → sales uses it. Material lives on OneDrive (controlled by the art director and account); project timing lives on Wrike. Which assets to produce is decided case by case, with no standard or file categorisation.

## Countermeasures matrix (from the A3 deck)

- Gold mine (high impact, low effort, test now): tag system, template library, narrative mechanism, asset upload process
- Moon shot (high impact, high effort, test later): AI guardrails, automatic trigger

## UI flows already sketched (A3 deck, slides 14-23)

- Creation: project closes in MAC Productive → "Crea case" CTA → login → upload materials (up to 20 files, max 100 MB each) → details form (business context, solution, …) → generate (async, notify when draft ready) → dashboard (statuses: Bozza / In elaborazione / Approvato) → configurator (channels and formats, shuffle layout, replace media, layout template variants, canvas ratio, typography, spacing) → approve.
- Download: project page in MAC Productive → "Scarica / visualizza case" → access to technical and graphic case studies → download / share link.
- Export formats shown: 16:9 presentation deck, whitepaper (A4), image carousel 1080×1350, square post, social video 1080×1920, LinkedIn cover 1200×675, HD PNG pack, ZIP.

## Changes to PRD v1 decided during the brief

For `bmad-prd` to apply when updating the PRD:

- **Standalone MVP.** MAC Productive integration (Epic 7) and text-only case studies (Epic 8) move from "Backlog from November 2" to "after MAC Productive is ready", with no date. The 8-week goal of an integrated tool no longer applies.
- **Roles.** Owner and designer are one role (owner/designer): upload, tagging, templates, review, approval. Account/sales and the social team share one role (account/sales/social), which can download files and publish shareable links. It gets its own login in Sprint 3 alongside the other roles, so FR8 and Stories 6.1-6.2 need updating.
- **"Publish" (FR7, Story 5.2)** means publishing a case study as a shareable link, for example a hosted presentation. It does not mean posting to social channels or the website from the tool.
- **New guardrails.** These rules are stated in the A3 deck but missing from PRD v1: if no material is uploaded, nothing is generated; human review before publication is mandatory and belongs to whoever uploaded the visual material.
- **NFR2 (hallucination check)** is done in the MVP by a person during review, not by an automated feature.
- **NFR4 (15-20 minutes)** should be defined as the owner's hands-on time from upload to approval.
- **October 30** is a demo on one real past project's material, not a pilot. The "Pilot test and onboarding" item and open point 6 (test or real data) need rewording. The confidentiality and NDA status of the demo material must be cleared before upload, since there is no login until Sprint 3.
- **Case study creation is manual.** The owner opens MAC Recap and creates the case study; there is no trigger at project close.
- **Epic 1 (BMAD setup)** is a team setup task, not product scope. Consider removing it from the epic list.
- **Story 7.2** mentions "Lovable" without context. Clarify or remove.
- **The MVP deadline is October 30, 2026,** the demo date. PRD v1 says October 31; correct that throughout, including the Goals section and the FR heading "MVP (by October 31)".
