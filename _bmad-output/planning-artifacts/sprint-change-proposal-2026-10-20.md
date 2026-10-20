---
title: "Sprint Change Proposal: build the configurator before the AI generation"
date: 2026-10-20
status: approved
approved: 2026-10-20 (owner)
owner: Sonja (product owner)
scope: moderate
mode: batch
triggers: [C21]
source: "Owner decision of 2026-10-20: the graphic template is ready, the narrative guidelines (.md) are not"
---

# Sprint Change Proposal, 2026-10-20: the configurator before the AI generation

## 1. Issue summary

On 2026-10-20 the owner asked to build the Bento configurator, where case studies are reviewed, edited and approved, before the generation. The graphic template is ready. The narrative guidelines and quality criteria (NFR5) are not: they are the .md files the AI writing step needs.

**C21.** Today's order is all of Epic 3 (3.2–3.9), then Epic 4. Only the AI stories need the guidelines:
- 3.6, the narrative generator;
- 3.7, generate a case study;
- 3.8, the "draft ready" notice;
- 3.9, the client intro draft.

Stories 3.2–3.5 need only the uploaded media and the graphic template.

**Type:** an external dependency is late (the narrative guidelines). The owner reorders to keep working.

## 2. Impact analysis

- **Epic 3** is split in time:
  - 3.2–3.5 run now, with the graphic template as input to 3.4;
  - 3.6–3.9 run when the guidelines arrive.
- **Epic 4.** Stories 4.1–4.8 run after 3.5 and before 3.6. They need a draft to work on, and without 3.7 there is none. A new dev-only story, **3.10 Test draft without AI**, creates one (see section 4).
- **Epic 4 design.** The owner and Claude design the Bento configurator together before Story 4.2 (owner, 2026-10-20). Until then, 4.1 (the review dashboard) can be built from the existing UX.
- **NFR10** ("epics run one after another") is relaxed for Epics 3 and 4 only: 4.1–4.8 sit between 3.5 and 3.6. Every story still depends only on stories built before it.
- **Demo criteria:** unchanged. Every demo-path story is still built (3.2–3.8, 4.1–4.8, 5.1–5.4). The risk moves to the guidelines: if they arrive late, the AI stories are late too, and the demo needs generation.
- **PRD, architecture, UX:** no requirement changes. The order lives in `sprint-status.yaml` and in the epics' Story conventions paragraph.

## 3. Recommended approach

**Direct adjustment.** Build in this order:

3.2 → 3.3 → 3.4 → 3.5 → **3.10** → (design session) → 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.8 → 3.6 → 3.7 → 3.8 → 3.9 → 4.11 → 4.9 → 4.12

**Why:**
- The configurator gets built and reviewed by the owner on a real layout while the guidelines are written.
- Nothing is thrown away: the AI stories write into the same document (3.3) that the configurator edits.

**Effort:** Story 3.10 is about half a dev day. Nothing else is added.

**Risk:** the guidelines become the critical path for the demo. Mitigation: the owner sets a date for them at the next checkpoint.

## 4. Detailed change proposals

**New story (epics.md, Epic 3, after 3.9):**

> ### Story 3.10: Test draft without AI (dev only)
>
> As the team,
> I want to turn a case with material into a reviewable draft without calling the AI,
> So that the configurator (Epic 4) can be built and tried before the narrative guidelines exist.
>
> Order: after 3.5, before 4.1 (owner, 2026-10-20).
>
> **Given** a case in Bozza with at least one file
> **When** the dev command runs for it (e.g. `npm run dev:test-draft -- <caseId>`), against mac-recap-dev or a local database only
> **Then**:
> - it moves the case through the normal transitions (generate, then generation_succeeded) with the dev actor;
> - it writes a `working` revision built by Story 3.3's document schema, with placeholder challenge, approach and result text marked "[bozza di prova]", each claim citing the case's own form answers or files;
> - it lays the revision out with Story 3.4's templates and 3.5's renderers for every MVP format;
> - the case appears in **Da approvare**.
>
> **And** the command refuses to run against the production project ref, and there is no UI entry point
> **And** no LLM is called

**Story conventions paragraph (epics.md):** append "Owner, 2026-10-20 (SCP 2026-10-20): Sprint 2 runs 3.2–3.5 → 3.10 → 4.1–4.8 → 3.6–3.9 → 4.11 → 4.9 → 4.12; the Bento configurator is designed with the owner before 4.2."

**sprint-status.yaml:**
- add `3-10-test-draft-without-ai: backlog`;
- add order comments on 3.6, 4.1 and 4.2.

## 5. Implementation handoff

- **This session:** apply section 4 in one docs PR, then build 3.2.
- **Owner:**
  - send the graphic template before Story 3.4;
  - hold the Bento design session before 4.2;
  - set a date for the narrative guidelines.
- **Success criteria:** the owner can open a test draft in the configurator, edit it and approve it before the AI stories start.
