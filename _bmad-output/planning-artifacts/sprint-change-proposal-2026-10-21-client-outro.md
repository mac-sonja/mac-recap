# Sprint Change Proposal — Client outro and "Modifica layout" (2026-10-21)

Status: **approved by the owner (Sonja), 2026-10-21.** Applied in the docs PR.

## 1. Issue summary

On 2026-10-21 the owner (Sonja) decided two things:

- **C20 — Client outro.** When I create a client I'm also creating the intro **and the outro** of its case histories. The AI drafts both from the client data and images; I refine them in the configurator.
- **C21 — Modifica layout.** **Modifica cliente** now opens the client side panel (data only; PR A, `spec-client-side-panel.md`). Editing the layout of a client's case histories is a separate button, **Modifica layout**, on the client page. It ships inactive now and opens the client overview configurator (4.12) once it exists.

Type: new requirement from the stakeholder. Evidence: owner messages, 2026-10-21. Nothing in the plan defines an outro today. A page's `role` is only `intro | body` (AD-23, Story 3.4). C16, UX-DR35 and Story 4.12 tie the client overview to **Modifica cliente**.

## 2. Impact analysis

- **Epic 3:**
  - 3.4: templates gain `outro` pages.
  - 3.5: renderers and `composeParts` place them.
  - 3.9: the draft covers intro and outro.
  - 3.1–3.3 are unaffected. The document kind stays `client_intro`, so no migration rework.
- **Epic 4:**
  - 4.11: the configurator edits intro and outro pages.
  - 4.12: opened by **Modifica layout**; its left pane gains **Chiusura**.
- **Epic 5:** 5.9 (client pack), 5.10 (collections) and 5.11 (hide page) apply the outro rule.
- **Epic 2 / UI:** UX-DR35, C16 and the client wizard's step 3 are replaced by the side panel. The configurator is reached from **Modifica layout**.
- **Architecture:** AD-23 and AD-24 rule 3, plus `composeParts`. There is one client document (kind `client_intro`) with page roles `intro | outro`. There is no second document, revision or lifecycle, so one review and one approval cover both.
- **Design team:** the client template needs outro pages in every format. Story 3.9 is already blocked on that template, so this adds no new blocker, but the brief to the designers changes.
- **MVP:** still in scope. It adds about 1 day across 3.4, 3.5, 3.9, 4.11 and 5.9–5.10. No change to the demo criteria.

## 3. Recommended approach

**Direct adjustment.** Amend existing stories; add none. The outro lives in the same client document as the intro, so it inherits generation, review, approval (NFR7), revisions and export without new tables.

The outro rule mirrors the intro rule (owner, 2026-10-21):

- A client's outro comes **once, after its last case history** wherever its case histories appear together (pack, collection, overview).
- A single case history exported on its own ends with its client's approved outro.
- An outro that isn't approved is never included (NFR7). The case history then ends on its own last page.

Effort: low–medium. Risk: low; the template brief is the dependency.

## 4. Detailed change proposals

**PRD (prd.md):**
- **Glossary L108.** OLD: "**Client intro.** Pages that introduce a client…". NEW: "**Client intro and outro.** The pages that open and close a client's case histories, drafted by the AI from the client's data, brief and material, laid out with its 2–3 images, and approved together like a case study."
- **FR11 L149.** OLD: "…drafts the client's intro pages…". NEW: "…drafts the client's intro and outro pages…"
- **FR12 L151.** OLD: "Editing a client opens the client overview…". NEW: "**Modifica layout** on the client's page opens the client overview: the intro, every case study and the outro of the client in one preview. **Modifica cliente** edits the client's data in a side panel."
- **FR13 L153.** Append: "Its approved outro comes once after the last of them; a single case study ends with its client's approved outro."

**Epics (epics.md):**
- **3.4 L1219.** `role` (`intro` or `body`) → (`intro`, `body` or `outro`). Templates: "a client template in every format for 2–3 images, with intro and outro pages".
- **3.5 L1254.** Add AC: "`composeParts` places a client's outro once after its last part, and after a single case history exported on its own."
- **3.9.** Title → "Client intro and outro template and draft". L1388 → "…draft the client's intro and outro pages…". L1408 → "intro and outro text blocks (headline and short paragraph each)". L1409 → "…in the template's intro and outro slots…"
- **4.11.** Title → "Client intro and outro in the configurator". L1815 ("step 3 Introduzione of the client wizard") → "opened from the client's page; the left pane lists **Introduzione** and **Chiusura**". L1823 → "the intro's and outro's text blocks".
- **4.12.** L1833 → "I want **Modifica layout** to open…". L1843 → "lists **Introduzione**, every case history, then **Chiusura**". Add AC: "Given a client page before 4.12 ships, **Modifica layout** shows inactive with 'Arriva con il configuratore'."
- **5.9 L2160, 5.10 L2193 and 5.11 L2249.** Add the outro to the intro rule, as in FR13 above.
- **UX-DR12, UX-DR35, UX-DR38 and UX-DR39.** Add **Chiusura** wherever **Introduzione** is listed. In UX-DR35, replace the client wizard steps with the side panel (C21).

**Architecture (ARCHITECTURE-SPINE.md):**
- **AD-23 L381–389.** "A client has one intro" → "A client has one intro-and-outro document (kind `client_intro`, pages with role `intro` or `outro`)". L387 → "intro and outro text blocks".
- **AD-24 rule 3 L398.** Add: "…and its approved outro after them."
- **L131.** Page `role` gains `outro`.

**UX (EXPERIENCE.md):**
- **L55.** Remove client wizard step 3; the client is added in the side panel.
- **L249–253.** Client mode covers intro and outro.
- **L321–331.** Add the outro rule.
- **Conflicts log.** Add C20 and C21. Mark C16's "**Modifica cliente** opens…" as superseded by C21.

**Sprint status:** add notes on 3.4, 3.5, 3.9, 4.11, 4.12, 5.9 and 5.10 ("outro per SCP 2026-10-21"). No new or removed stories.

## 5. Implementation handoff

- **Scope: Moderate.** These are backlog edits only; no story is in progress.
- **Developer (this session):** after approval, apply the edits above to the PRD, epics.md, the architecture spine, EXPERIENCE.md and sprint-status.yaml in one docs PR.
- **Owner:** brief the design team that the client template needs outro pages in every format (story 3.9's blocker).
- **Success:** every mention of the client intro names the outro where it applies, **Modifica layout** is the configurator entry, and no doc says **Modifica cliente** opens the configurator.
