# Source digest for UX — MAC Recap

Sources (all under `_bmad-output/planning-artifacts/`): `prds/prd-MAC Recap-2026-10-08/prd.md` (PRD v2, status final, authoritative), `.../addendum.md`, `.../reconcile-a3-deck.md`, `.../.memlog.md`, `briefs/brief-MAC-Recap-2026-10-08/brief.md`. Where documents differ, the PRD wins. Legend: **[UX]** = has direct UX implications.

## 1. Product, users, stakes, demo constraints

**One-liner (PRD §1):** "MAC Recap is an internal web tool that turns a closed project's verified material into a finished case study. It does not generate content from scratch. It assembles, organizes and structures material that already exists and has been verified."
A3 deck product name: "MAC Recap - case history configurator", MAC 2026.

**Roles (PRD §2, exact names):**
| Role | In the tool |
|---|---|
| Owner/designer | Creates the case study, uploads project material, assigns tags, properties and flags, maintains templates, reviews, edits and approves. Can also export and share approved case studies |
| Account/sales/social | Finds approved case studies, exports them as files, publishes them as shareable links. Does not create, edit or approve |
| Admin | Manages users and assigns them to roles. Cannot change role permissions or the guardrails |
- Requests for a case study happen outside the tool; no request feature.
- Social team shares the account/sales/social role; posts on its own channels outside the tool.
- CEO = final validator of the Oct 30 demo; no role in the tool.

**Terms (PRD §2.1):** Case study (graphic layouts + text structured as challenge, approach, result; unique ID) · Material (uploaded images, videos, texts, PDFs; details form alone is not material) · Deliverable (one uploaded item of material with its tags, properties, flags) · Approved case study (only these can be exported/shared) · Shareable link (link to hosted version, e.g. hosted presentation; access = open point 11) · Configurator (editing screen: text, layout, media, typography before approving) · Review dashboard (list of case studies and statuses, incl. those waiting for review).

**Stakes / baseline:** 4 of 11 closed projects shown externally in 12 months (~36%); ~2 months to reach social; 0% cover both technical and graphic side; layout 1-2 h per case study; 24-60 h end to end; 4 teams affected (creative, sales, PM, social); 2 commercial levers lost (upsell, inbound contacts). Goal: owner/designer time 15-20 min.

**Demo constraints (PRD §1.1, §8):** Oct 30, 2026, live for the CEO, go/no-go. One real past project, ideally one of the seven never published; confidentiality/NDA cleared before upload. Go only if all four pass:
1. Upload → approved in 15-20 min owner/designer hands-on time (NFR4).
2. Same case study exported in several formats, e.g. deck, social carousel, PDF (FR7).
3. Text covers technical and graphic side (NFR5).
4. A person checks during review that every claim traces to uploaded material (NFR2).
No-go → fix gaps, re-demo on new date. Dry run before demo with creative director and sales, feedback in person. Onboarding and feedback happen in person, outside the tool.
**Counter-metric:** owner/designer time must not fall because review gets shorter; a faster case study that skips the claim check is a failure.
8-week validation measures: # case studies; avg owner/designer time; amount of manual editing after generation; hallucinations/guardrail violations reaching approved (target zero); hallucinations caught in review (tracked, no target).
Sprint 3 (Epic 6) brings login; before then tool runs without authentication in a dev environment.

## 2. FRs and NFRs

**MVP (by Oct 30, 2026)**
- **FR1** [UX] — Every case study gets a unique ID (ready to link to project order later); owner/designer creates it manually; no trigger at project close.
- **FR2** [UX] — Owner/designer uploads material (images, videos, texts, PDFs), assigns tags, properties, flags per deliverable, fills short details form on context, solution, results. Limit: 20 files, ≤100 MB each.
- **FR3** [UX] — Generates graphic case studies by applying templates to material; text as challenge, approach, result using only uploaded material and form answers. No material → generation not available (NFR6).
- **FR4** [UX] — Templates adapt layout to number of available media items.
- **FR5** [UX] — Owner/designer reviews and edits via review dashboard and configurator; editing covers generated text, layout, media, typography, so a claim failing the NFR2 check can be corrected before approval.
- **FR6** [UX] — Approval makes it an approved case study; approval is the mandatory human review (NFR7); any owner/designer can approve.
- **FR7** [UX] — Owner/designer and account/sales/social can export an approved case study as files in MVP formats, or publish as shareable link (e.g. hosted presentation). Only approved; no posting to social/website; formats = open point 1; until open point 11, anyone with the link can open it.
- **FR8** [UX] — Owner/designer, account/sales/social, admin sign in via login with distinct roles/permissions. Sprint 3.

**Post-MVP (after MAC Productive ready, no date)**
- **FR9** — Connects to MAC Productive via MCP using unique ID.
- **FR10** — Text-based case studies and whitepapers from project order data, for projects without visual material.

**NFRs / guardrails** (non-negotiable; contradicting requirements flagged, not implemented)
- **NFR1** [UX] — AI does not alter graphic assets, technical substance, or template design. [FLAG: possible conflict with FR4 and FR7 — layouts adapt, exports resize to 16:9, 4:5, 1:1, 9:16, A4; open point 12.]
- **NFR2** [UX] — In MVP a person checks generated technical content for hallucinations during review, before approval; every claim traces to uploaded material or form answers; manual step, not automated feature.
- **NFR3** [UX] — No role can configure guardrails, admin included (no such settings in UI).
- **NFR4** [UX] — Owner/designer hands-on time upload → approval ≤20 min, target 15; NFR2 wins if more time needed; waiting for generation doesn't count; generation time unbounded.
- **NFR5** [UX] — Texts follow challenge/approach/result and quality checklist (Sprint 2 non-dev deliverable "narrative structure and quality criteria"); cover technical and graphic side.
- **NFR6** [UX] — No material → nothing generated; details form alone not enough.
- **NFR7** [UX] — No export or shareable link without human review and approval by an owner/designer.

Relevant stories with UX-bearing ACs: 2.2 (manual create, unique ID), 2.3 (upload + details form), 2.4 (tags/properties/flags per deliverable), 3.1 (layouts generated for MVP export formats; generation unavailable without material), 3.2, 4.1 ("The dashboard shows case studies awaiting review"), 4.2 ("The configurator follows the designed Bento layout"; edit text, layout, media, typography), 4.3 (claim check before approving; any owner/designer approves; moves to **Approved** status; non-approved cannot be exported/shared; editing an approved case study updates it and its shareable links and it stays approved), 5.1, 5.2, 6.1 (login for each of three roles), 6.2 (fixed permissions — Owner/designer: create, upload and tag, manage templates, review, edit, approve, export and share; Account/sales/social: view approved case studies, export, publish as shareable links; Admin: users and role assignment), 6.3.

## 3. Decisions already made (UX must not reopen)

- MVP is standalone; no MAC Productive integration, no "Crea case" button, no case on project order page.
- Owner and designer are one role; account/sales/social is one role (social included) with own login from Sprint 3. Three roles total.
- Case studies created manually ("+ New case study"); no automatic trigger; no in-tool request feature.
- "Publish" = publishing as a shareable link only; tool never posts to social channels or website.
- Only approved case studies can be exported or shared.
- Any owner/designer can approve (overrides A3 rule that the uploader approves).
- Owner/designer can edit generated text (plus layout, media, typography) in the configurator.
- Editing an approved case study keeps it approved and updates its shareable links.
- Both owner/designer and account/sales/social can export and share (open point 9 resolved).
- Admin only assigns users to roles; permissions fixed; no guardrail settings for any role.
- Upload limit 20 files × 100 MB.
- Material = images, videos, texts, PDFs; form alone is not material; no material → no generation.
- Text structure: challenge, approach, result; only from material + form answers.
- Claim check (NFR2) is manual human review, not automated.
- Generation time unbounded; only hands-on time counts toward 15-20 min.
- Onboarding and feedback in person, outside the tool.
- Until open point 11 decided, shareable links open for anyone with the link.
- Demo uses one real past project (open point 6 resolved).
- Tech: Supabase DB, AWS S3 storage, Claude Code + BMAD; login arrives in Sprint 3.
- Configurator follows a Bento layout (Story 4.2; Sprint 2 non-dev "Configurator visual design (Bento)").

## 4. Open points (PRD §12, verbatim-ish)

1. **Export formats** (Epics 3, 5; before Sprint 2). Which formats MVP produces. Demo minimum: 16:9 deck, social carousel, PDF. A3 shows eight: 16:9 deck, A4 whitepaper, 1080×1350 carousel, square post, 1080×1920 social video, 1200×675 LinkedIn cover, HD PNG pack, ZIP. Publishing channel settled as shareable link.
2. **Data processing logic** (Epic 3; before Sprint 2). How material becomes text.
3. **Tag, property and flag taxonomy** (Epic 2; before Oct 14).
4. **Account/sales/social user journey** (Epic 5). Partly resolved: they reach approved case studies inside MAC Recap with own login from Sprint 3. Still open: how they find and browse case studies.
5. *Merged into point 1.*
6. **Test or real data.** Resolved: one real past project; NDA cleared.
7. **Data exposure from MAC Productive** (Epic 7).
8. **Case study status lifecycle** (Epic 4; before Sprint 2). A3 screens use Draft, Processing, Awaiting approval, Approved and Published; names differ across screens. v1 names only Approved.
9. **Owner/designer export rights.** Resolved: both roles export and share.
10. **Attribution** (6-month review).
11. **Shareable link access** (Epic 5). Options: anyone with the link, only logged-in users, or link expires. Client confidentiality decision. Interim: anyone with link.
12. **What counts as altering** (Epics 3, 4, NFR1; before Sprint 2). Whether layout adaptation to media count (FR4), configurator **shuffle** and **replace**, and resizing for export formats count as altering graphic assets or template design. Design team defines boundary.
13. **Recording the 8-week measures.** How owner/designer time, editing, hallucinations are recorded.
Owners for open points not assigned; decide-by dates still missing for 4, 7, 10, 11, 13 (memlog).

## 5. Explicitly left to UX

From addendum "Left for the UX phase":
- A Vision paragraph carried over from the brief.
- What "maintains templates" means for the owner/designer (upload, edit, versioning), and whether it needs its own FR.
- Acceptance criteria for the configurator (text, layout, media, typography) and the review dashboard (search, status filter).
From addendum "Inconsistencies in the sketches to settle in UX": status names (open point 8), "Social 16:9" label, canvas ratios vs export formats, A3 "AI guardrails" as test-later.
Also implied by PRD/sprint plan: open point 4 (how account/sales/social find and browse); Sprint 1 non-dev "tool design definition", "template wireframes"; Sprint 2 "Configurator visual design (Bento)", "account/sales/social user journey"; Sprint 3 "Mockups and assets for case studies". Open point 12 is owned by the design team.

## 6. A3 sketch screen inventory (slides 14-23)

Addendum note: "These are design sketches, not decisions." In standalone MVP, MAC Productive steps drop out; owner/designer starts from "+ New case study" in the review dashboard. A3 labels are Italian (English in parentheses).

**1.1 Create case (slide 15) — inside MAC Productive (out of MVP).** Job page "C2026-0003 - PROVA - Nuovo e-commerce", client Acme Retail, "A corpo", status "Progetto Chiuso". Job stepper: Apertura, Brief, Deliverable e stima, Preventivo, Firma, Calendario. Deliverable side panel: title + "Chiuso" badge; owner, completion date, estimate. Purple card "Deliverable completato" with button **Crea case**. Link "Segui gli aggiornamenti". Trigger is per deliverable.

**1.2 Upload material (slide 16).** Wizard 3 steps: 1 Materiali, 2 Dettagli, 3 Genera case (addendum: Materials → Details → Generate). Status badge top right "Bozza". Header "Nuovo case study" + case name. "Add project materials" — presentations, deliverables, documents, screenshots; hint that more context and quantitative metrics give a deeper, more accurate case. Drag-and-drop or browse. Suggested: strategic decks, summary documents, impact metrics. Limits up to 20 files, max 100 MB each.

**1.3 Add details (slide 17).** Heading: add details on process and strategy. Collapsible section "Contesto & background" (addendum: "Context & background") with counter "0 di 4". Visible fields: "Contesto di business" (business context; textarea, placeholder: describe initial context), "La soluzione" (the solution; textarea, placeholder: what did you actually design and release?). Other 2 fields and any further sections cropped/unspecified. (PRD form topics: context, solution, results.)

**1.4 Generate case (slide 18).** Step 3 "Genera case": "Elaborazione in corso..." (processing). Copy: ready for approval soon; notification when draft available. Button "Torna alla Dashboard". Async.

**1.5 Dashboard (slide 19).** Sidebar: "+ Nuovo case study", "Tutti i case", "Da approvare" with count badge (3), "Template" marked SOON. Notification bell. Main: "Tutti i case", search (project or client), filter tabs Tutti / Approvato / In elaborazione / Bozza. Columns: ID progetto (e.g. C2026-0036), Commessa/Nome, Cliente, Anno, Stato.

**1.6 Configurator (slide 20).** Header: back, case name, status "IN APPROVAZIONE", version + autosave "v2.4 - Salvato", buttons **Salva bozza**, **Approva**. Left "Canali e formati": Presentazione 16:9 – 1920x1080 – Deck; Social 16:9 – 1080x1920 – 9:16; Carosello Social – 1080x1350 – 4:5; One-Pager / PDF – A4 dynamic – Executive. Canvas toolbar: **Shuffle layout**, **Sostituisci media** (replace media), size indicator 1920x1080. Right "Modifica" panel (reset icon): **Layout Template** (10 variants, thumbnail grid); **Proporzione Canvas** 16:9 / 4:5 / 1:1; **Tipografia & Scala Testo** Plus Jakarta Sans (selected) / Inter Sans / Editorial Serif; **Composizione & Spaziatura** Padding esterno (slider, 24 px), Gap tra i box (slider, 16 px). Canvas example: client logo + "Case study - sector (domain)", eyebrow, headline, subtitle, tag chips (site, service lines), KPI card ("Conversioni" with progress bar), image tiles. Note: no text-editing control is described on the sketch, yet PRD FR5 requires text editing.

**2.1 View case (slide 22) — MAC Productive (out of MVP).** Closed deliverable panel; button **Visualizza Case**; "Segui gli aggiornamenti". Overview (slide 21): CTA "Scarica / visualizza case" → project page → technical and graphic cases → download/share link.

**2.2 Export case (slide 23).** Header: case name, status **PUBBLICATO**, tabs **Asset e Risorse**, **Cronologia Versioni**, buttons **Esporta ZIP**, **Esporta** (share icon). Preview: pager "Slide 1 di 12", zoom −/100%/+, fit, fullscreen. "Formati disponibili": Documents — Presentazione Slide 16:9 1920x1080 12 slides; Whitepaper 2480x3508 1 page (A4 @300dpi). Social & communication — Carosello di Immagini 1080x1350 6 slides; Post Quadrato 1080x1080; Video social 1080x1920 looping; Copertina LinkedIn 1200x675 header. Source materials — Pacchetto PNG HD 8 files, 42 MB. Plus "link" output (slide 13).

**Status names per screen (exact):**
| Screen | Status label(s) |
|---|---|
| 1.2 Upload (slide 16) | "Bozza" (badge) |
| 1.4 Generate (slide 18) | "Elaborazione in corso..." (processing copy) |
| 1.5 Dashboard (slide 19) | Filter tabs: Tutti / Approvato / In elaborazione / Bozza; sidebar queue "Da approvare" (3) |
| 1.6 Configurator (slide 20) | "IN APPROVAZIONE" |
| 2.2 Export (slide 23) | "PUBBLICATO" |
English set used in PRD/addendum: Draft, Processing, Awaiting approval, Approved, Published. Dashboard filters show only 3 + All; "In approvazione"/"Da approvare" and "Pubblicato" not in filters. PRD names only **Approved** as a defined status (Story 4.3).

**Listed inconsistencies:**
- Status names differ between screens (open point 8).
- Configurator lists "Social 16:9" but size is 1080×1920 = 9:16.
- Configurator canvas ratios 16:9 / 4:5 / 1:1, but export formats also include 9:16 and A4 (and 1200×675 LinkedIn cover). Configurator channel list (4) ≠ export format list (8).
- A3 lists "AI guardrails" as high-effort "test later" (moon shot); PRD makes NFR1-NFR7 MVP.

## 7. Brand / visual / tech hints

- No brand guide, colours, logo or tone of voice defined in any source. Only visual hints are from A3 sketches: a **purple** card ("Deliverable completato", MAC Productive screen); fonts offered in configurator: Plus Jakarta Sans (selected default), Inter Sans, Editorial Serif; spacing defaults 24 px outer padding, 16 px box gap; **Bento** layout for configurator.
- Brief: case studies must be "on-brand"; templates are "MAC's graphic templates"; template design must not be altered by AI.
- A3 sketches are in Italian; PRD/brief in English. UI language not decided anywhere.
- Tech: Supabase (DB), AWS S3 (files), Claude Code + BMAD, MCP for future MAC Productive link, no auth until Sprint 3. Wrike and OneDrive are current-state tools (AS-IS). No frontend framework/UI library named. Internal web tool (no mobile requirement stated).

## 8. Conflicts / tensions (flagged, not resolved)

- **Approver:** A3 rule "review belongs to whoever uploaded the visual material"; memlog entry once added uploader-only approval to Story 4.3, later overridden — PRD final: any owner/designer.
- **NFR1 vs FR4/FR7 and configurator shuffle/replace/resizing** — open point 12.
- **Status "Published":** PRD defines publish as creating a shareable link and Story 4.3 says editing keeps it "approved"; unclear if Published is a status distinct from Approved, and whether it is per-case or per-link.
- **Brief vs PRD export rights:** brief Solution step 5 says account/sales/social export (owner not mentioned) and scope says account/sales/social "download and share links only"; PRD lets owner/designer export/share too.
- **Brief vs PRD hallucination metric:** brief "caught in review, target zero"; PRD splits reaching approved (target zero) vs caught (tracked, no target).
- **Templates:** owner/designer "maintains templates" / "manage templates" (Story 6.2) but no FR and A3 dashboard shows "Template" as SOON.
- **Notifications / versioning / autosave / version history / Asset e Risorse tab / ZIP export:** present in A3 sketches, not in any FR. Async generation implies a notification, but PRD has none.
- **Text editing:** PRD requires text editing in configurator; A3 configurator sketch shows no text-edit controls.
- **Details form:** PRD says context, solution, results; A3 shows "Contesto & background" with 4 fields (2 visible) and heading about "process and strategy".
- **Dashboard scope:** Story 4.1 says dashboard shows awaiting review (owner/designer); account/sales/social browsing is open point 4 — unclear whether they use the same dashboard.
- **Root cause:** tagging during the project (A3 root cause) is out of MVP; nothing prompts the owner to start.
- **Sprint vs pre-auth:** until Sprint 3 everything is unauthenticated; demo (Oct 30) is after Sprint 3 so login should exist — but shareable links remain open to anyone (open point 11), exposure risk.
- **Brief "Admin manages users and permissions"** vs PRD "cannot change role permissions".
- **A3 timeline** (31 Oct integration, 8 weeks integrated with MAC Productive) superseded by PRD (no date).

## 9. People and demo project

- @Sonja — PRD author (Oct 8, 2026).
- A3 deck authors: Castillo, Casu, Iorio, Pivato (2026).
- Roles named: CEO (final validator), creative director and sales (demo dry run), Art Director (A3 tester/AS-IS), PM, creative team, social team.
- Demo project: not named — "one real past project, ideally one of the seven never published". Sketch sample data only: "C2026-0003 - PROVA - Nuovo e-commerce", client "Acme Retail"; dashboard row ID "C2026-0036".
