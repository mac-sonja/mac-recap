---
title: "MAC Recap PRD v2 – Input reconciliation"
created: 2026-10-08
reviewed: prd.md (v2) + addendum.md
inputs: PRD v1 text, brief.md, brief addendum.md, brief .memlog.md, PRD-run .memlog.md (authoritative)
---

# Input reconciliation – PRD v2

## 1. Brief addendum checklist ("Changes to PRD v1 decided during the brief")

| # | Bullet | Status | Evidence in prd.md |
|---|---|---|---|
| 1 | Standalone MVP; Epic 7/8 move to "after MAC Productive is ready", no date; 8-week integrated-tool goal dropped | Applied | Changes L18-19; Goals L38 ("No date is set"); §3 "Post-MVP (after MAC Productive is ready, no date)"; §6 row "After MAC Productive is ready (no date)"; §7 items 7-8; §9 heading. 8-week goal is now validation of the standalone tool (L37, §1.1) |
| 2 | Roles: owner/designer merged (upload, tagging, templates, review, approval); account/sales/social can download and publish links; own login Sprint 3; update FR8 and Stories 6.1-6.2 | Applied | §2 table L71-73; FR8 L111 ("Delivered in Sprint 3"); Story 6.1 and 6.2 permissions L232-239; Changes L20 |
| 3 | "Publish" (FR7, Story 5.2) = shareable link, not posting to social/website | Applied | FR7 L106-109; Story 5.2; §2.1 Terms "Shareable link"; §10 out of scope; Changes L21 |
| 4 | New guardrails: no material, nothing generated; mandatory human review before publication, owned by whoever uploaded the visual material | Applied (see gap G3 on enforceability) | NFR6, NFR7; FR3 sub-bullet; FR6; Story 3.1 AC; guardrail check L247 |
| 5 | NFR2 is a human check during review, not automated | Applied | NFR2 ("manual step, not an automated feature"); Story 4.3 first AC; §1.1 demo criterion 4 |
| 6 | NFR4 = owner's hands-on time upload to approval | Applied | NFR4 (plus PRD-memlog decision that generation time is unbounded) |
| 7 | Oct 30 = demo on one real past project, not pilot; reword "Pilot test and onboarding" and open point 6; clear NDA before upload | Applied (onboarding dropped, see G2) | Changes L23; §8 closing activities "Demo preparation" / "Demo on October 30"; open point 6 resolved; §5 last bullet; §11 risk 3 |
| 8 | Case study creation is manual; no trigger at project close | Applied (not listed in "Changes from v1", see G1) | FR1; Story 2.2 AC 1; §10 "An automatic trigger at project close" |
| 9 | Epic 1 (BMAD setup) is team setup; consider removing from epic list | Applied | §7 item 1 struck through; §6 Sprint 1 non-dev "Team setup (formerly Epic 1)"; Changes L24 |
| 10 | Story 7.2 "Lovable": clarify or remove | Applied (not listed in "Changes from v1", see G1) | Story 7.2 now "data and formats coming from MAC Productive"; no "Lovable" left in prd.md |
| 11 | MVP deadline Oct 30 throughout, incl. Goals and FR heading | Applied | Goals L36; §3 heading "MVP (by October 30, 2026)"; no "October 31" left except in the Changes note |

**Totals: 11 applied, 0 partial, 0 missing.** Bullets 4, 7, 8 and 10 have follow-up notes below.

## 2. PRD v1 vs v2 – changes not listed in "Changes from v1"

Items present in v1 that v2 drops or alters without a matching bullet in the Changes list (L16-24). Most are justified by the brief or the PRD-run memlog; the gap is traceability, not substance.

| v1 item | v2 | Listed in Changes? | Justified by |
|---|---|---|---|
| FR1 / Story 2.2: no statement on how creation starts | Manual creation, no trigger (FR1, Story 2.2) | No | Brief addendum bullet 8 |
| Account/sales role "Requests case studies" | Dropped; requests happen outside the tool (§2 L75, §10) | No | PRD memlog L17 |
| Story 7.2 "coming from Lovable" | "coming from MAC Productive" | No | PRD memlog L16 |
| Story 8.3 "As an account, I want to generate text-based case studies in whitepaper format" | Owner/designer generates; account/sales/social downloads or shares | No | PRD memlog L14 |
| NFR5 (structure + quality checklist) | Adds "cover both the technical and the graphic side" | No (Changes says only NFR2 and NFR4 redefined) | Brief success criteria |
| FR2 (upload + tag) | Adds context/solution/results form and an upload-limit assumption (20 x 100 MB) | No | Brief Solution step 2; A3 sketch |
| FR3 (apply templates) | Adds "text as challenge/approach/result, using only uploaded material and form answers" | No | Brief Solution step 3 |
| Sprint 3 "Pilot test and onboarding: trial with creative director, sales and other roles; collect feedback for next development steps" | Replaced by "Demo preparation" + an [ASSUMPTION] dry run; **onboarding of the roles is gone entirely** | Partly ("demo, not a pilot") | Brief addendum bullet 7 covers the pilot, not onboarding |
| Open point 4 "how accounts reach approved case studies" | Partly resolved | Implicitly ("open points now include…") | Brief memlog L14 |
| Open point 5 (export formats and publishing channels) | Merged into 1 | Implicitly | – |
| New open points 8 (status lifecycle) and 9 (owner/designer export rights) | Added from A3 deck / PRD run, not from the brief | Changes says open points "now include the brief's open questions"; 8 and 9 are not brief questions | PRD memlog L23 |
| Section 2.1 Terms | New | No (New sections list omits it) | PRD memlog L19 |
| Story 1.1 AC "PRD is available as input for the following phases" | Dropped with Epic 1 | Yes (Epic 1 removal) | – |

Nothing from v1 is silently lost in substance except v1's **onboarding** activity (G2). All other omissions are traceable via the memlogs but not via the Changes list (G1).

## 3. Brief vs PRD

**Decisions.** All brief decisions are reflected: standalone MVP, roles, manual creation, share-link publishing, demo on a real past project, Sprint 3 logins, guardrails. No contradictions found.

**Guardrails.** All five brief guardrails map to NFR1, NFR2, NFR6, NFR7, NFR3. Wording aligns ("published or shared" vs NFR7 "exported or published as a shareable link").

**Success criteria.** §1.1 matches the brief point for point. Added beyond the brief: the counter-metric (L65), flagged [NOTE FOR PM] and recorded as an assumption in the PRD memlog. Needs confirmation before final.

**Known risks.** All four brief risks are in §11, essentially verbatim.

**Open questions.** Brief Q1→PRD 1, Q2→3, Q3→2, Q4→10, Q5→11. All present.

**Scope / out of scope.** §10 matches the brief's out-of-scope list, plus "Requesting a case study inside the tool" (PRD-run decision).

**Qualitative ideas missing or thin:**

- **Vision section absent.** The brief Vision ("Crea case" button at close, technical information and brief pulled in automatically via MCP, case study shown on the project order page for sales, every closed project gets a case study as an upsell/inbound lever). The PRD mentions the button and order page only as out-of-scope items (§10). Epic 7 stories (7.1, 7.2) cover only the connection and data check, not the auto-pull of technical info/brief or the order-page display.
- **Commercial motivation.** The brief says every unpublished project is a missed upsell and inbound contact, with 4 teams affected and 2 commercial levers lost. §1 context omits the upsell/inbound framing (it appears only as a 6-month metric).
- **Per-role success.** The brief's "what success looks like" column (owner: on-brand, done in one sitting; account/sales/social: material the week a project closes, without asking anyone) is not carried into §2. It is useful as UX acceptance intent.
- **Configurator capabilities.** The brief (Solution step 4) and §2.1 Terms say the configurator adjusts layout, media and typography. Story 4.2's only AC is "follows the designed Bento layout". The editing capabilities are not acceptance criteria.
- **Template maintenance.** The brief and the PRD role table say owner/designer "maintains templates", and Story 6.2 grants "manage templates". No FR or story defines what template management means in the MVP (upload a template? edit? or only the dev team?). This is inherited from v1, where the designer "manages templates" with no FR either.

## 4. Brief decision log vs PRD

Later entries are applied over earlier ones:

| Memlog entry | Superseded by | PRD state |
|---|---|---|
| L15 integration starts Nov 2 | L16 (override) no date | PRD: no date. Consistent |
| L25 assumption: owner OR designer approves; social has no MVP role | L27, L28, L31 | PRD: merged owner/designer approves; social in account/sales/social. Consistent |
| L27 social role download/export only, no publishing | L28 (change) share links allowed | PRD: export + shareable link. Consistent |
| L35 left Oct 31 vs Oct 30 as-is | L36 (change) Oct 30 | PRD: Oct 30. Consistent |
| L8 pilot testers art director, CEO, sales | L18 demo, not pilot | PRD: CEO validator; [ASSUMPTION] dry run with creative director and sales. Consistent, pending confirmation |
| L21 post-demo use follows deck flow minus MAC Productive steps | – | PRD addendum L13 states this; PRD body has no post-demo rollout plan (memlog: "no dated rollout plan yet"). Consistent |
| L30 hours-saved uses 1-2 h layout baseline | – | §1.1 6-month bullet 3. Consistent |
| L33 owner/designer maintains templates | – | Role table + Story 6.2. Consistent, but no FR (see §3) |

**No contradictions found.** PRD-run memlog decisions (Story 8.3, NFR4, Story 7.2, requests outside tool, Epic 1 removal) are all reflected in prd.md.

## 5. Gaps and suggested fixes

**G1 – The "Changes from v1" list is incomplete** (prd.md L16-24). Add bullets for: manual creation with no trigger (FR1); case study requests moving outside the tool (role change); Story 8.3 actor change; Story 7.2 Lovable reference removed; NFR5 extended to technical + graphic coverage; FR2/FR3 extended (details form, text from uploaded material only); new Terms section; new open points 8-9 coming from the A3 deck/PRD run, not the brief.

**G2 – v1 "onboarding" silently dropped** (§8 MVP closing activities, L246-249; §6 Sprint 3 row). v1 had "Pilot test and onboarding" with the creative director, sales and other roles. The brief replaced the pilot with a demo, but the 8-week validation after a go still needs onboarded owner/designer and account/sales/social users. Fix: add a post-go onboarding activity (owners and account/sales/social, with logins from Sprint 3) or list onboarding explicitly as out of scope for Oct 30.

**G3 – The NFR7 / FR6 "review belongs to the uploader" rule has no acceptance criterion** (FR6 L104, NFR7, Story 4.3, Story 6.2). Story 4.3 and the Story 6.2 permission list let any owner/designer approve. Before Sprint 3 there is no identity, so the rule can't be enforced in Sprint 2. Fix: add to Story 6.2 (or 4.3) "Only the owner/designer who uploaded the visual material can approve", and state that Epic 4 enforces it only once Epic 6 lands.

**G4 – Demo criteria pre-empt open point 1** (§1.1 L45 vs §12 point 1). The demo requires deck, social carousel and PDF, so those three are effectively the MVP minimum. Open point 1 still reads as fully open, and Epic 5 is due Oct 21. Fix: in open point 1, state that deck 16:9, 1080×1350 carousel and PDF/A4 are the floor set by the demo, and only the other five formats remain open.

**G5 – Open point 9 (owner/designer export rights) blocks the demo** (§12 point 9; §2 table; Story 6.2). Logins arrive Oct 28, so on Oct 30 someone must be logged in with export rights for the multi-format criterion. Fix: resolve before Sprint 3 starts. Either grant the owner/designer export/share in Story 6.2, or script the demo with a second account/sales/social login.

**G6 – The brief Vision and the configurator/template capabilities are under-specified** (no Vision section; Story 4.2; Epic 7 stories; role table). Fixes:
- Add a short Vision or "Post-MVP direction" paragraph, and extend Epic 7 with stories for the "Crea case" button, auto-pull of technical info and brief, and case study display on the project order page.
- Add Story 4.2 ACs for adjusting layout, media and typography.
- Add a story or an open point defining what "maintains templates" covers in the MVP.

**Also pending confirmation (already flagged in PRD):** the counter-metric (L65), the upload limits (FR2), and the dry run replacing the pilot (§8). Each is marked in the text and recorded as an assumption in the PRD-run memlog.
