# Reconcile: A3 deck extraction (MAC Recap_Modello A3.pdf)

Source: `docs/sources/MAC Recap_Modello A3.pdf` (26 slides, Italian; authors Castillo, Casu, Iorio, Pivato 2026). English paraphrase for PRD reconciliation. Slides 15-20 and 22-23 are UI screenshots (read visually); all other slides are text.

## Slides 1-3: Problem and baseline numbers
- Product: "MAC Recap - case history configurator", MAC 2026.
- Problem: when a project closes there is never time to tell its story; sales/account have nothing to show clients. Cost is also external: invisible projects mean missed upsell and missing inbound contacts.
- Baseline:
  - 24-60 hours per project to build a case study.
  - 4 teams affected: creative, sales, project manager, social.
  - 4 of 11 closed projects publicised externally in last 12 months.
  - 2 commercial levers lost: upsell and inbound contacts.
  - ~2 months average delay before a case reaches social channels.
  - 0% of cases cover both the technical and the graphic side of the project.

## Slides 4-5: Current context (AS IS)
- Three roles today: Sales/Account requests the case; Creative team produces and uploads materials; PM plans the work. Art Director also involved.
- Everything goes through OneDrive, controlled by art director and account. Asset choices are decided case by case with no standard or file categorisation - called the most fragile point.
- Data sources already in use: Wrike (project timelines), OneDrive (materials history).
- Scope boundary: from initial brief to the salesperson using the case. Excluded: before (project strategy) and after (impact on inbound contacts).
- Discovery method: each role interviewed one by one on real steps.
- AS IS swimlane: Sales requests case -> PM plans -> Creative defines narrative and deliverables -> "material complete?" loop (no -> produce material for case; yes -> produce case) -> Sales uses case.

## Slides 6-8: Goals, targets, TO BE
- Goal: treat the case as a whole (technical + graphic); reduce layout time; more autonomy for sales; more flexible outputs than today.
- Timeline goals: by end of October work in a way preparatory to producing cases with this method; at 8 weeks a working AI tool integrated with MAC Productive; at 6 months less organisational burden and the case becomes an upsell/inbound lever.
- Main KPIs (slide 7):
  - Layout time: 1-2 hours -> 15-20 minutes.
  - Cases with technical + graphic layout: 0% -> 100%.
- TO BE swimlane lanes: Client/Prospect, Sales/Account, PM, Creative, Social team. Flow: brief collection -> team planning -> project development -> project closure -> material collection for the case -> (additional graphic material from creative) -> case generation -> publication of case via the tool -> case download (sales) -> case publication (social) -> inbound and outbound with client/prospect.
  - Note: the Social team is a new lane in TO BE (absent in AS IS).

## Slides 9-10: Root cause and countermeasures
- Root cause: no standardised, shared process for uploading and tagging assets during the project.
- Time factor: without a structured process, time to produce content (narrative included) is simply never allocated.
- Out of scope root cause: internal communication, to be addressed separately.
- Countermeasure matrix (impact/effort):
  - Gold mine (high impact, low effort - test immediately): tag system, template library, narrative mechanism, asset upload process.
  - Moon shot (high impact, high effort - test later): AI guardrails, automatic trigger.
  - Quick win / Questionable: none.
  - PRD implication: AI guardrails and auto-trigger are explicitly "later", yet the MVP relies on AI generation - reconcile.

## Slides 11-13: Plan, testers, MVP scope
- Three fixed dates: until 29-30 Sept analysis/planning only; from 2 Oct MVP development; from 31 Oct merge into company system MAC Productive.
- Testers: Art Director, CEO, Sales. CEO is final validator.
- Timeline (slide 12):
  - 01-29 Sept: research, analysis, planning.
  - 2 Oct: MVP development.
  - 31 Oct: testing and integration with MAC Productive.
  - Oct-Nov: validation - check cases created, average creation time, AI hallucinations.
  - March 2027: impact - % of jobs with a case, hours saved, upsell, inbound contacts.
- MVP happy path:
  1. On job (commessa) closure, the task owner uploads materials and approves the generated case.
  2. Owner approves the generated case.
  3. User (account or sales) exports the case per their output needs.
  4. Case exported in desired format.
- Inputs: images, video, text files. Outputs: link, PDF, video, social formats.

## AI guardrails / hard rules (every rule stated in the deck)
1. Human review before publication is mandatory.
2. That review belongs to whoever uploaded the visual material (the uploader/owner approves).
3. If there is no material, the system must generate nothing.
4. (Implicit, from metrics) Technical hallucinations and guardrail violations are monitored as a validation metric - i.e. the AI must not invent technical facts.
5. (Implicit, from upload copy) quality of output depends on context and quantitative metrics supplied - more input, deeper and more accurate case.
- Note: the deck lists "AI guardrails" as a moon-shot countermeasure without enumerating a full ruleset; the above is everything stated.

## Slide 14: User flow - case creation (overview)
Main path: Job closed in MAC Productive -> CTA "Crea case" -> Login -> Material upload -> Data passed to external DB (Supabase) -> Backend record created -> Case created from visual material + technical info -> Approve case or edit via configurator -> Case available on MAC Productive.
Parallel/automatic path: Automatic extraction of technical info and brief (via MCP) -> Automatic creation of case with technical info -> Case available on MAC Productive.

## Slides 15-20: UI screens step by step
### 1.1 Create case (slide 15) - inside MAC Productive
- Job page (e.g. "C2026-0003 - PROVA - Nuovo e-commerce", client Acme Retail, "A corpo"), status "Progetto Chiuso". Job stepper: Apertura, Brief, Deliverable e stima, Preventivo, Firma, Calendario.
- Deliverable side panel: title + "Chiuso" badge; single owner, completion date, estimate.
- Purple card "Deliverable completato": work approved and closed, ready to be converted into a company case study; button **Crea case**.
- Info: activities fully consumed and archived. Link "Segui gli aggiornamenti" (follow updates).
- Header section: Title, Description.
- Trigger is per **deliverable**, not only per job.

### 1.2 Upload material (slide 16)
- Wizard with 3 steps: 1 Materiali, 2 Dettagli, 3 Genera case. Status badge top right: "Bozza" (draft). Header label "Nuovo case study" + case name.
- "Add project materials": upload presentations, deliverables, documents or screenshots; hint that more context and quantitative metrics give a deeper, more accurate case.
- Drag-and-drop zone or browse. Suggested: strategic decks, summary documents, impact metrics.
- **Limits: up to 20 files, max 100 MB each.**

### 1.3 Add details (slide 17)
- Heading: add details on process and strategy.
- Collapsible section **"Contesto & background"** (why the project was born and its surroundings) with completion counter "0 di 4" -> 4 fields in this section; visible ones:
  - **Contesto di business** (business context) - placeholder: describe the initial context. Textarea.
  - **La soluzione** (the solution) - placeholder: what did you actually design and release? Textarea.
  - Remaining 2 fields of the section are cropped off-screen; further sections may exist below. Not fully specified by the deck.

### 1.4 Generate case (slide 18)
- Step 3 "Genera case": "Elaborazione in corso..." (processing). Copy: case will soon be ready for approval; **you will receive a notification as soon as the draft is available**.
- Button "Torna alla Dashboard". Generation is asynchronous.

### 1.5 Dashboard (slide 19)
- Sidebar: "+ Nuovo case study" button (create outside the MAC Productive trigger), "Tutti i case", "Da approvare" with count badge (3), "Template" marked SOON. Notification bell.
- Main: "Tutti i case" with search (project or client) and filter tabs: Tutti / Approvato / In elaborazione / Bozza.
- Table columns: ID progetto (e.g. C2026-0036), Commessa/Nome, Cliente, Anno, Stato.

### Statuses observed across screens
- Bozza (draft), In elaborazione (processing), In approvazione (in approval - slide 20 header), Approvato (approved), Pubblicato (published - slide 23). Dashboard filters only show 3 + All; "In approvazione"/"Da approvare" and "Pubblicato" need reconciling into one lifecycle.

### 1.6 Approval and edits - configurator (slide 20)
- Header: back, case name, status "IN APPROVAZIONE", **version + autosave indicator ("v2.4 - Salvato")**, buttons **Salva bozza** and **Approva**.
- Left "Canali e formati" (channel/format selector):
  - Presentazione 16:9 - 1920x1080 - Deck
  - Social 16:9 - labelled 1080x1920 - 9:16 (label inconsistency: it is vertical 9:16)
  - Carosello Social - 1080x1350 - 4:5
  - One-Pager / PDF - A4 dynamic - Executive
- Canvas toolbar: **Shuffle layout**, **Sostituisci media** (replace media), current size indicator (1920x1080).
- Right "Modifica" panel (with reset icon):
  - **Layout Template**: 10 variants (thumbnail grid).
  - **Proporzione Canvas**: 16:9 / 4:5 / 1:1.
  - **Tipografia & Scala Testo**: font family Plus Jakarta Sans (selected) / Inter Sans / Editorial Serif.
  - **Composizione & Spaziatura**: Padding esterno (slider, 24 px), Gap tra i box (slider, 16 px).
- Canvas content example shows structure: client logo + "Case study - sector (domain)", eyebrow, headline, subtitle, tag chips (site, service lines), KPI card (e.g. "Conversioni" with progress bar), image tiles.

## Slides 21-23: Download / share flow
### Overview (slide 21)
Job page on MAC Productive -> CTA "Scarica / visualizza case" -> Project page -> Access to both technical and graphic cases -> Download / share link.

### 2.1 View case (slide 22)
- On closed deliverable panel: message that deliverable is completed and archived; one can now review the final report, final metrics and project documentation. Button **Visualizza Case**; "Segui gli aggiornamenti".

### 2.2 Export case (slide 23)
- Header: case name, status **PUBBLICATO**, tabs **Asset e Risorse**, **Cronologia Versioni** (version history), buttons **Esporta ZIP** and **Esporta** (share icon).
- Preview: slide pager ("Slide 1 di 12"), zoom -/100%/+, fit, fullscreen.
- "Formati disponibili" with exact dimensions:
  - Documents: Presentazione Slide 16:9 - 1920x1080 - 12 slides; Whitepaper - 2480x3508 - 1 page (A4 @300dpi).
  - Social & communication: Carosello di Immagini - 1080x1350 - 6 slides; Post Quadrato - 1080x1080; Video social - 1080x1920 - looping video; Copertina LinkedIn - 1200x675 - header.
  - Source materials: Pacchetto PNG HD - 8 files, 42 MB.
  - Plus "link" output from slide 13.

## Slide 24: Product metrics
- During 8 weeks of validation: number of cases generated; average generation time (target 15-20 min); amount of manual editing after generation; technical hallucinations or guardrail violations.
- At 6 months: % of closed jobs receiving a case; person-hours saved vs baseline 24-60 h/project; inbound contacts generated; cases where a case acted as upsell lever.

## Slide 25: Open points
- How the management system (MAC Productive) will expose data for automatic technical-case creation.
- Current structure of fields, tags and metadata to be extracted from MAC Productive via MCP.
- Non-functional constraints: client data confidentiality and possible NDAs.

## Sprint / test / pilot plan
- No sprint breakdown in the deck. Pilot = Oct-Nov validation by Art Director, CEO, Sales; CEO final validator; metrics as slide 24.

## Things a PRD could easily drop
- Narrative quality: case must tell both technical and graphic story (0% -> 100% KPI); "narrative mechanism" is a gold-mine countermeasure; the details form asks for context/why, solution, process and strategy.
- Tag system and standardised asset upload/categorisation during the project (the actual root cause) - not just at closure.
- Template library (Template "SOON" in dashboard; 10 layout variants).
- Two case types: technical vs graphic, both accessible from project page; automatic technical case via MCP as a parallel path.
- Deliverable-level trigger from MAC Productive, plus standalone "+ Nuovo case study".
- Async generation with notification; "Da approvare" queue with count; "Segui gli aggiornamenti" follow.
- Versioning with autosave and version history; Asset e Risorse tab; ZIP export of all assets.
- Login step and Supabase as external DB.
- Social team as consumer/publisher; ~2-month social delay as baseline.
- Approver must be the uploader of visual material, not any user.
- Confidentiality/NDA as NFR (still open).
- Scope exclusions: project strategy and inbound-impact measurement tooling; internal communication.
- Inconsistencies to resolve: "Social 16:9" labelled 1080x1920 9:16; canvas ratios (16:9/4:5/1:1) vs export formats (incl. 9:16, A4); status set differs between screens; AI guardrails marked "test later" while MVP uses AI.
