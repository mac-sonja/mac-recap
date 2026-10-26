# Sprint Change Proposal — Client pages, case outro and test drafts (2026-10-26)

Status: **draft, waiting for the owner (Sonja).** The edits in section 4 are applied in a follow-up docs PR once approved.

## 1. Issue summary

On 2026-10-26 the owner answered five questions about the client intro and outro (SCP 2026-10-21):

- **C23 — Same rule for intro and outro.** The client's outro appears only where its intro does: with 2 or more of its case histories in one file. A single case history keeps its own intro **and its own outro**. This reverses the SCP 2026-10-21 rule "a single case history ends with its client's approved outro".
- **C24 — A case history has its own outro.** Today a case history has no outro page. It needs one, and the case Details step gets **Risultati** and **Testimonial**, as in the client panel (#88, #94).
- **C25 — Social carousel.** A carousel always ends with the case history's own outro, never the client's.
- **C26 — Where the client draft starts.** **Aggiungi** in the client panel saves the client, starts its intro-and-outro draft and opens it in the configurator. There is no separate **Crea introduzione** or **Genera introduzione** button.
- **C27 — Test text first.** The client intro and outro are built first with test text instead of AI text, as Story 3.10 does for case histories, so the owner can see and lay them out before the AI stories.

Type: new requirement and a change of rule from the stakeholder. Evidence: owner message, 2026-10-26.

## 2. Impact analysis

- **Epic 2:** a new Story **2.21**, Risultati and Testimonial in the case Details step. It needs a migration on `case_study`, as #88 did for clients. The fields are optional, as for clients.
- **Epic 3:**
  - 3.4: the case history template gains `outro` pages in every format, fed by Risultati and Testimonial. The client template's outro pages stay.
  - 3.5: `composeParts` uses one rule for intro and outro (C23). The SCP 2026-10-21 criterion "after a single case history exported on its own" is removed.
  - 3.9: the trigger becomes **Aggiungi** (C26). The table, the trigger and the layout move to the new 3.11; 3.9 keeps only the AI text.
  - New Story **3.11**, client intro and outro with test text, after 3.10 (C27).
  - 3.6: the narrative output gains the case outro text, from Risultati and Testimonial (only when 3.6 is built).
- **Epic 4:** the case configurator lists the outro page like any other. 4.11 is opened by **Aggiungi** as well as from the client page.
- **Epic 5:** 5.9, 5.10 and 5.11 apply C23. With 2+ case histories of a client, the client outro replaces their own outro pages, as the client intro replaces their intro pages.
- **Architecture:** AD-23 rule 4 and AD-24 rule 3 use one rule for intro and outro.
- **Design team:** the case history template needs outro pages in every format (Risultati and Testimonial). The brief to the designers changes again.
- **MVP:** still in scope. About 2–3 days in total: 2.21 (≈1 day), 3.11 (≈1 day), the case outro in 3.4/3.5 (≈½ day).

## 3. Recommended approach

**Direct adjustment.** Amend existing stories and add 2.21 and 3.11. The case outro is a page role inside the case history document, so it needs no new table or lifecycle.

The rule for intro and outro becomes one rule (owner, 2026-10-26):

- With **2 or more** case histories of one client in a file (pack, collection, overview): the client's approved intro comes before them and its approved outro after them. Their own intro and outro pages are left out.
- With **1** case history, or when the client's intro and outro aren't approved: the case history keeps its own intro and its own outro.
- The social carousel is always a single case history, so it always ends on its own outro.

Effort: low–medium. Risk: low. The case template's outro pages are a new item for the designers.

## 4. Detailed change proposals

**PRD (prd.md):**
- **FR13 L155.** OLD: "Its approved outro comes once after the last of them; a single case study ends with its client's approved outro (SCP 2026-10-21)." NEW: "Its approved outro comes once after the last of them, replacing their own outro pages; otherwise each case study keeps its own intro and outro (SCP 2026-10-26)."
- **L306.** OLD: "…also when there is only one (SCP 2026-10-21)". NEW: "…when there are 2 or more (SCP 2026-10-26)".
- **FR11 L151.** Append: "**Aggiungi** in the side panel saves the client and starts its intro and outro draft."
- **Glossary.** Add: "**Case outro.** The closing pages of a case study, with its results and testimonial."

**Epics (epics.md):**
- **New Story 2.21 — Risultati and Testimonial in the case Details step.** Acceptance criteria: the Details step shows **Risultati** (3 rows of label and value) and **Testimonial** (quote and author) in their own cards after Soluzione, both optional, with the same limits, autosave and messages as the client panel; a forward migration adds them to `case_study`; they feed the case outro (3.4) and the narrative (3.6).
- **3.4 L1223.** Add: "the case history template has `outro` pages in every format for Risultati and Testimonial".
- **3.5 L1260–1262.** OLD: "…places the client's outro once after its last part, and after a single case history exported on its own (SCP 2026-10-21)". NEW: "…with 2+ case histories of the client, places the client's intro before them and its outro after them and leaves out their own `intro` and `outro` pages; with 1, the case history keeps its own (SCP 2026-10-26)".
- **3.9 L1406–1408.** The trigger becomes **Aggiungi** in the client panel. The migration, the trigger, the waiting screen and `relayout` move to 3.11; 3.9 replaces 3.11's test text with the AI's.
- **New Story 3.11 — Client intro and outro with test text.** After 3.10, before 4.1. Acceptance criteria: the forward migration for `client_intro` and `client_event` (from 3.9); **Aggiungi** checks the 2-image rule (`NO_CLIENT_IMAGES`), creates the `client_intro` and a `working` revision of kind `client_intro` with test text marked "[bozza di prova]" from the client's own fields, laid out with 2–3 of its images in every format; the intro moves to Da approvare; no LLM call.
- **5.9 L2172.** OLD: "…then the client's approved outro once after the last of them, also when there is only one (SCP 2026-10-21)". NEW: "…then, with 2+ case histories, the client's approved outro once after the last of them, replacing their own outro pages; with 1, the case history's own outro (SCP 2026-10-26)".
- **5.9 L2159–2162.** `composeParts` also leaves out the `outro` pages of each case history followed by its client's outro.
- **5.10 L2205.** "each client's approved outro comes once after its last case history" → "…for each client with 2 or more case histories…".
- **UX-DR38, UX-DR39.** Same change as 5.10.

**Architecture (ARCHITECTURE-SPINE.md):**
- **AD-23 rule 4 L389.** Add: "…otherwise case histories keep their own intro and outro pages."
- **AD-24 rule 3 L398.** OLD: "…also when it has only one (SCP 2026-10-21)". NEW: "…when it has 2+ case histories, and their `outro` pages are left out (SCP 2026-10-26)."

**UX (EXPERIENCE.md):**
- **L319.** Remove **Crea introduzione**: **Aggiungi** in the side panel saves the client and starts the intro and outro draft, then opens the configurator (the client page until 4.11).
- **L322, L331.** Apply the 2+ rule to the outro.
- **Case Details step.** Add the **Risultati** and **Testimonial** cards after Soluzione.
- **Conflicts log.** Add C23–C27. Mark C21's "a single case history exported on its own ends with its client's approved outro" as superseded by C23.

**Sprint status:** add `2-21-case-results-and-testimonial: backlog` and `3-11-client-intro-and-outro-with-test-text: backlog` (after 3.10); add notes on 3.4, 3.5, 3.9, 4.11, 5.9 and 5.10 ("per SCP 2026-10-26").

## 5. Open points for the owner

1. **C26, Aggiungi:** I read "con CTA aggiungi, genera case e ti porta al configuratore" as: **Aggiungi** saves the client, starts its intro and outro, and opens them in the configurator. Is that right?
2. **C24, the case outro:** does it hold only Risultati and Testimonial, or also a closing line written by the AI?
3. **C24, required or optional:** are Risultati and Testimonial optional for a case history, as for a client? (Proposed: optional.)
4. **C24, missing data:** if a case history has neither Risultati nor Testimonial, does it still get an outro page? (This depends on the template.)

## 6. Implementation handoff

- **Scope: Moderate.** These are backlog edits plus two new stories; no story is in progress.
- **Developer (this session):** after approval, apply section 4 in one docs PR, then build 2.21 (it doesn't wait for the template).
- **Owner:** answer section 5; brief the design team that the case history template needs outro pages.
- **Success:** no doc says a single case history ends with its client's outro; every client intro trigger is **Aggiungi**; 2.21 and 3.11 are in the plan.
