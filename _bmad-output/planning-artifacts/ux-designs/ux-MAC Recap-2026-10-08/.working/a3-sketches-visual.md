# A3 deck: UI sketches, visual and behavioral read

Source: `docs/sources/MAC Recap_Modello A3.pdf` (26 pages). This file covers pages 14-23 in detail, with a skim of pages 1-13 for deck identity.
Method: pages rendered to PNG with PDFKit, then read visually, with zoomed crops of p20 and p23. Hex values come from pixel sampling of compressed screenshots, so treat them as approximate (about ±10 per channel).
Notation: "verbatim" (English). [?] means uncertain or partly legible.

Two different products appear in the sketches:
- **MAC Productive** is the existing company PM/ERP tool. It uses a light theme with a purple accent and appears on p15 and p22.
- **MAC Recap** is the new tool. It uses a dark theme with a lime accent and appears on p16-p20 and p23.

---

## p14: Flow diagram "FLUSSO UTENTE: CREAZIONE CASE STUDY" (User flow: case study creation)
Eyebrow: "PROSEGUIMENTO OPERATIVO" (Operational follow-up). This is a flow diagram, not a UI screen. It uses square boxes in three styles:
- **dashed outline**: an external or trigger step.
- **solid dark**: a user step.
- **light grey fill**: a system or automatic step, or an end state.

Top row (user path):
1. [dashed] "Chiusura commessa da MAC Productive" (Job/order closure in MAC Productive)
2. "CTA "Crea case"" (Create case CTA)
3. "Login"
4. [light] "Caricamento materiale" (Material upload)
5. "Creazione case con materiale visivo e info tecniche" (Case creation with visual material and technical info)
6. "Approvazione case o modifiche tramite configuratore" (Case approval or edits via the configurator)
7. [light] "Disponibilità della case su MAC Productive" (Case available in MAC Productive)

Middle (backend, grey text): "Passaggio di dati a database esterno (Supabase)" (Data passed to external DB, Supabase), dashed link to "Creazione di record in backend" (Record created in backend).

Bottom branch (automatic, light boxes):
- "Estrapolazione automatica delle info tecniche e brief (MCP)" (Automatic extraction of technical info and brief via MCP). It drops from the CTA step.
- "Creazione automatica di case con info tecniche" (Automatic creation of case with technical info), then "Disponibilità della case su MAC Productive".

Implication: there are two parallel outputs, a technical-only case created automatically and a graphic case created by the user.

## p15: FLUSSO 1.1 "Creazione case" (Case creation), entry from MAC Productive
- **Browser chrome**: URL "macproductive.com". The browser frame is light grey.
- **Background (dimmed)**: the MAC Productive project page "C2026-0003 · PROVA – Nuovo e-commerce", with subtitle "PROVA – Acme Retail · A corpo" (fixed-price). It has a green pill "Progetto Chiuso" (Project closed) and two alerts:
  - "Migrazione Dati Prodotto: in attesa di …" (waiting on …)
  - "Gestione commessa: in attesa di …"
  Each alert has a "Dettagli" link.
- **Stepper** in the background page: "1. Apertura, 2. Brief, 3. Deliverable e stima, 4. Preventivo, 5. Firma, 6. Calendario" (Opening, Brief, Deliverable & estimate, Quote, Signature, Calendar).
- **Tabs** in the background page: "Riepilogo, Brief, Deliverable e stima (active, purple underline), Calendario, Attività, Ore, Costi, File".
- **Filters**: "Solo i miei (accountable o responsabile)", "Stato [Tutti ▾]", "Mostra archiviati".
- **Table header**: "DELIVERABLE / PERSONE / STATO / ATTESA (INTESA)". The left nav is collapsed and dark, with a purple active item.
- **Right drawer (white, foreground)**:
  - Title "Sito E-commerce" with a green badge "Chiuso" (Closed) and a close "×" (purple, outlined).
  - Meta line: "Responsabile unico: Intra Francesca · completato il 27/11/2026 · stimato: 72"
  - Callout card (lavender tint, purple border): icon plus "Deliverable completato" (Deliverable completed). Body: "Il lavoro è stato approvato e chiuso. Pronto per essere convertito in un case study aziendale." (Work approved and closed. Ready to be converted into a company case study.) Primary purple button **"Crea case"** (Create case).
  - Info card: "Le attività per questo deliverable sono state interamente consuntivate e archiviate con successo." (All activities for this deliverable were fully logged and archived.) It includes the link "Segui gli aggiornamenti" (Follow updates).
  - Section "INTESTAZIONE" (Header): "Titolo: Sito E-commerce", "Descrizione: Realizzazione del sito e-commerce con catalogo e carrello, pronto per la vendita online." A further section is cut off [?].
- **Next**: "Crea case" leads (after Login per p14) to 1.2.

## p16: FLUSSO 1.2 "Caricamento materiale" (Material upload). MAC Recap wizard step 1
- **Header bar**: "←" back, "Helios Case Study", and a pill at top right "Bozza" (Draft). There is no sidebar.
- **Centered column (about 600px)**: eyebrow "NUOVO CASE STUDY" (New case study), H1 "Helios Case Study".
- **Stepper (3 steps)**: "1 Materiali" (active, lime ring), "2 Dettagli", "3 Genera case" (Materials, Details, Generate case).
- **Section**: "Aggiungi i materiali di progetto" (Add the project materials). Helper text: "Carica presentazioni, deliverable, documenti o screenshot. Più contesto e metriche quantitative fornisci, più approfondita e accurata sarà la generazione del case study." (Upload presentations, deliverables, documents or screenshots. The more context and quantitative metrics you provide, the deeper and more accurate the generation.)
- **Dropzone**: dashed border, rounded, with a cloud-upload icon in a circle. Text: "Trascina qui i file del tuo progetto, oppure **sfoglia**" (Drag your project files here, or browse). "sfoglia" is a lime link. Sub-text: "Deck strategici, documenti di sintesi, metriche di impatto. Fino a 20 file, max 100 MB ciascuno." (Strategy decks, summary docs, impact metrics. Up to 20 files, max 100 MB each.)
- Below the fold is cropped. No file list or "Avanti/Continua" (Next/Continue) button is visible [?].
- **Next**: 1.3.

## p17: FLUSSO 1.3 "Aggiunta dettagli" (Adding details). Wizard step 2
- Same header ("Bozza"), eyebrow and H1. Stepper: Materiali shows a check (done), "2 Dettagli" is active, "3 Genera case" is pending. The connector line from step 1 to step 2 is tinted lime.
- **Section**: "Aggiungi dettagli sul processo e la strategia" (Add details on the process and strategy).
- **Accordion card (expanded)**: "Contesto & background" with subtitle "Perché il progetto è nato e cosa lo circondava" (Why the project was born and its surroundings). It has a counter chip "0 di 4" (0 of 4) and a chevron "^".
  - Field "Contesto di business" (Business context), textarea placeholder "Descrivi il contesto iniziale." (Describe the initial context).
  - Field "La soluzione" (The solution), placeholder "Cosa hai effettivamente progettato e rilasciato?" (What did you actually design and ship?).
  - The other 2 of 4 fields and any further accordions are cropped [?].
- **Next**: 1.4.

## p18: FLUSSO 1.4 "Generazione case" (Case generation). Wizard step 3, processing state
- Header pill is still "Bozza". Stepper: both steps 1 and 2 are checked, "3 Genera case" is active.
- **Card (centered)**: a sparkle/AI icon in a lime-tinted rounded square with a soft glow. H2 "Elaborazione in corso..." (Processing...).
- Body: "Il tuo case study sarà pronto a breve per l'approvazione. Riceverai una notifica non appena la bozza sarà disponibile." (Your case study will soon be ready for approval. You'll get a notification as soon as the draft is available.)
- Button (white pill, dark text): "Torna alla Dashboard →" (Back to Dashboard).
- Behavior implied: generation is asynchronous, the user is notified (bell in the dashboard, p19), and the user leaves the wizard.
- **Next**: 1.5 Dashboard.

## p19: FLUSSO 1.5 "Dashboard". MAC Recap home
- **Left sidebar (about 230px)**:
  - Logo "mac." in lime, set in a serif/display face. Bell icon at right.
  - Outlined lime pill button "+ Nuovo case study" (New case study) with a subtle glow.
  - Nav:
    - "Tutti i case" (All cases), active, with a raised dark fill and a folder icon.
    - "Da approvare" (To approve), clock icon, count badge "3".
    - "Template", grid icon, with a "SOON" chip.
- **Main**:
  - H1 "Tutti i case".
  - Search field "Cerca progetto o cliente..." (Search project or client).
  - Segmented filter: "Tutti" (selected, white pill), "Approvato", "In elaborazione", "Bozza".
  - Table columns: "ID PROGETTO / COMMESSA / NOME / CLIENTE / ANNO / STATO" (Project ID / Job / Name / Client / Year / Status). IDs are set in monospace.
- **Rows (verbatim)**:
  - C2026-0036 · Fibre Connect · Fibre Connect · 2026 · Approvato
  - C2026-0035 · RDS - ALI Lavoro · Ali Lavoro spa · 2026 · Approvato
  - C2026-0003 · Nuovo e-commerce · Acme Retail · 2026 · In elaborazione
  - C2026-xxx · Gotaway Odoo · Gotaway · 2025 · In elaborazione
  - C2026-0004 · Supporto evolutivo · Acme Retail · 2025 · Bozza
  - C2026-0005 · Assistenza mensile · Acme Retail · 2024 · Approvato
- **Status badges** (pill with leading dot):
  - "Approvato" (Approved): lime/olive text on dark olive fill, lime border.
  - "In elaborazione" (Processing): blue text and dot on dark navy fill.
  - "Bozza" (Draft): grey on dark, grey border.
- Row actions are not visible. Clicking a row presumably opens the editor (1.6) [?].

## p20: FLUSSO 1.6 "Approvazione e Modifiche" (Approval and edits). Configurator/editor
- **Top bar**:
  - Left: "←", "| Helios Case Study".
  - Center: status pill with a yellow dot "IN APPROVAZIONE" (In approval), then a clock icon and "v2.4 • Salvato" (v2.4 • Saved).
  - Right: secondary dark pill "Salva bozza" (Save draft) and primary lime pill with glow "Approva ✓" (Approve).
- **Left panel "CANALI E FORMATI"** (Channels and formats). Each entry has an icon tile and a 2-line label:
  - "Presentazione 16:9" / "1920 × 1080 • Deck". This entry is selected: lime-outlined card with a lime play-in-square icon.
  - "Social 16:9" / "1080 × 1920 • 9:16". The icon is a vertical phone rectangle.
  - "Carosello Social" / "1080 × 1350 • 4:5" (Social carousel)
  - "One-Pager / PDF" / "A4 Dinamico • Executive" (Dynamic A4)
- **Canvas area**:
  - Toolbar: "Shuffle layout" (shuffle icon), "Sostituisci media" (Replace media, image icon), and a readout "1920 × 1080" at right in monospace.
  - Canvas: a dark navy card with a blue glow at top right and a green glow at bottom left. It shows a "helios energia" logo chip and "CASE STUDY • UTILITY & GREEN ENERGY (HELIOSENERGIA.IT)".
  - Bento layout:
    - Main tile: eyebrow in lime "NUOVO SITO WEB & PORTALE CLIENTI", headline "RE-DESIGN ECOSISTEMA DIGITALE HELIOS" (uppercase, heavy), and body "Nuova esperienza digitale per Helios S.p.A.: fornitura 100% green, preventivatore fotovoltaico interattivo e portale clienti omnicanale."
    - Chips: "heliosenergia.it", "Luce & Gas Green", "Configuratore Solare", "Area Riser…" (truncated).
    - Image strip below the main tile.
    - Metric tile: "PERFORMANCE E-COMMERCE & LEAD" with a trend-up icon, then "Conversioni" (Conversions) and "Richieste pacchetti Solar Shock e contratti energia con switch digitale diretto in 3 passaggi." It ends in a lime progress bar.
    - Two image tiles: a binder mockup and a blue "b" graphic.
- **Right panel "MODIFICA"** (Edit), with a sliders icon and a reset/refresh icon:
  - "Layout Template", "10 varianti" (10 variants). Shows 4 thumbnails; the 1st is selected (lime fill and border).
  - "Proporzione Canvas" (Canvas ratio): segmented "16:9" (selected), "4:5", "1:1".
  - "Tipografia & Scala Testo" (Typography & text scale), "Famiglia Tipografica" (Font family): "Plus Jakarta Sans ✓" (selected, outlined), "Inter Sans", "*Editorial Serif*" (shown in an italic serif).
  - "Composizione & Spaziatura" (Composition & spacing): "Padding esterno" (Outer padding) "24 px" and "Gap tra i box" (Gap between boxes) "16 px", each with a slider track.
  - The rest is cropped.
- **Next**: Approva (approved), then the case is available (p14) and exportable (2.2).

## p21: Flow diagram "FLUSSO UTENTE: DOWNLOAD CASE STUDY" (User flow: download case study)
Eyebrow "IL CONTESTO" (The context). Note that p14 uses "PROSEGUIMENTO OPERATIVO" for the equivalent slide. Steps:
1. [dashed] "Pagina della commessa su MAC Productive" (Job page in MAC Productive)
2. [dashed] "CTA "Scarica / visualizza case"" (Download / view case CTA)
3. "Pagina progetto" (Project page)
4. "Accesso sia a case tecniche che grafiche" (Access to both technical and graphic cases)
5. [light] "Download / link di condivisione" (Download / share link)

## p22: FLUSSO 2.1 "Visualizzazione Case" (Case view), entry from MAC Productive
- **Browser chrome**: macOS traffic lights, back/forward/reload, URL "macproductive.com", share and "+" icons.
- **MAC Productive sidebar (dark)**:
  - Logo "mac. PRODUCTIVE" in white.
  - "Dashboard", "Da fare" (To do).
  - Group "STIMARE E VENDERE" (Estimate & sell): "Commesse" (Jobs, active, purple fill), "Le mie stime" (My estimates).
  - Group "PIANIFICARE" (Plan): "Assenze" (Absences).
  - Group "CONSUNTIVARE" (Log actuals): "Attività", "Le mie ore" (My hours).
  - Group "GOVERNARE" (Govern): "Impostazioni" (Settings), "Guida" (Guide).
- **Background**: the same project page as p15, dimmed. Table rows include "Sito E-commerce … In corso … 27/11/2026" and "Analisi Funzionale … In corso … 02/10/2026".
- **Right drawer (white)**:
  - "Sito E-commerce" with badge "Chiuso" and a close "×".
  - Meta: "Responsabile unico: Intra Francesca · atteso il 27/11/2026 · stimato : 72". This says "atteso" (expected), where p15 says "completato".
  - Card: "Il deliverable è stato completato e archiviato con successo. È ora possibile esaminare il resoconto consuntivo, le metriche finali e la documentazione del progetto." (Deliverable completed and archived. You can now review the final report, metrics and documentation.) Full-width purple button with an eye icon: **"Visualizza Case"** (View case).
  - Outlined button with bell icon: "Segui gli aggiornamenti".
  - "INTESTAZIONE": Titolo / Descrizione, the same as p15.
  - "STIME" (Estimates): "Le stime del PM e le persone assegnate si sistemano nel Calendario: qui ognuno conferma o corregge la propria." It links "Calendario". Then "Automazione QA …" (cropped).
- **Next**: "Visualizza Case" leads to 2.2 (MAC Recap).

## p23: FLUSSO 2.2 "Esportazione Case" (Case export)
- **Top bar**:
  - Left: "←", "Helios Case Study", and a status pill with a lime dot "PUBBLICATO" (Published).
  - Text tabs/links: "Asset e Risorse" (Assets & resources) and "Cronologia Versioni" (Version history).
  - Right: secondary dark pill with download icon "Esporta ZIP" (Export ZIP), and primary green pill with a **share** icon "Esporta" (Export).
- **Left panel "FORMATI DISPONIBILI"** (Available formats), grouped:
  - "DOCUMENTI" (Documents):
    - "Presentazione Slide 16:9" / "1920×1080 • 12 slide". Selected, with a lime dot after the label.
    - "Whitepaper" / "2480×3508 • 1 pag".
  - "SOCIAL E COMUNICAZIONE" (Social & communication):
    - "Carosello di Immagini" / "1080×1350 • 6 slide" (Image carousel)
    - "Post Quadrato" / "1080×1080 • Post" (Square post)
    - "Video social" / "1080×1920 • Video in loop" (Looping video)
    - "Copertina Linkedin" / "1200×675 • Header" (LinkedIn cover)
  - "MATERIALI SORGENTE" (Source materials):
    - "Pacchetto PNG HD" / "8 file • 42 MB" (HD PNG pack). More entries may be below the crop [?].
- **Preview toolbar**: "‹ Slide 1 di 12 ›" (Slide 1 of 12) in the center; at right "−  100%  +", fit-to-screen, and fullscreen icons.
- **Canvas**: the same Helios bento as p20. In this version the chip reads "Area Riservata" in full, and the headline breaks over 2 lines because of a wider main tile.
- There are no edit controls, so this is a read-only, published view.

---

## Deck identity (pages 1-13, skim)
- **Cover**: "MAC Recap" as a large light-weight sans title, with the uppercase grey subtitle "CONFIGURATORE DI CASE HISTORY" (Case history configurator). The footer has "MAC" at left and "2026" at right above a thin rule.
- **Recurring layout**:
  - Near-black slide background, about #1A1A1A to #1F1F1F.
  - Small letter-spaced uppercase grey eyebrow (for example "DEFINIZIONE OBIETTIVO" or "CONTROMISURE") above a large uppercase light-weight white title.
  - Footer: thin grey rule, "MAC RECAP" at left (tracked caps) and the page number at right.
  - Generous margins (about 84px at 1600px width) and left-aligned content.
- **Type**: a neo-grotesk sans, very likely **Inter** [?, inferred from glyph shapes]. Display sizes are set in Light/Regular. Small labels use bold, tracked caps.
- **Color**: monochrome. White and greys on near-black, with light-grey fill (about #D9D9D9 to #F4F4F2) used to highlight boxes and quadrants (for example the "GOLD MINE" quadrant on p10 and the system steps on p14/p21). The deck has no brand accent color. Numbers on p07 use grey for "before" and white for "after".
- **Shapes**: diagram boxes are sharp-cornered with 1px borders. Tag chips (p10) are fully rounded pills, black on light.
- **Logo**: the deck shows no logo mark, only the wordmark text "MAC Recap". The "mac." logo appears only inside the UI sketches: lime serif on p19, white "mac. PRODUCTIVE" on p22.

## Visual language cues (MAC Recap UI sketches, p16-p20 and p23)
- **Theme**: dark-only. Near-black navy surfaces with a faint blue cast, not neutral grey:
  - App background about **#0E1019**
  - Panels and sidebar about **#12141C** to **#161821**
  - Raised cards and inputs about **#1E2029**
  - Hairline borders a slightly lighter navy-grey
- **Accent**: acid lime / chartreuse.
  - Primary "Approva" fill about **#E0F56E**. Selected template thumbnail about **#D1F28C**.
  - The 2.2 "Esporta" button samples greener and more muted, about **#B1D575** to **#BDDC75** [?, possibly compression; may be the same token].
  - Lime is used for primary CTAs, active stepper rings and checks, the selected format card outline, eyebrows on the canvas, progress bars, the "sfoglia" link, the logo, and the "Approvato"/"PUBBLICATO" dots.
  - Primary CTAs have a soft lime outer glow.
- **Status colors**:
  - Approved / published: lime on dark olive (about #333D09).
  - Processing: blue on navy (about #1A2C58 fill).
  - In approval: yellow dot.
  - Draft: grey (about #87898D).
- **MAC Productive (host app)**: light theme with white drawers and a **purple** accent (about **#6D4FC0 to #7554BD**) on buttons, the active tab underline and the active nav item. The "Chiuso" badge is green. This is a separate visual system from Recap.
- **Typography**: UI text uses a geometric-humanist sans, consistent with **Plus Jakarta Sans** (the default family selected in the p20 editor) [?]. Headings are medium weight and tightly tracked ("Helios Case Study", "Tutti i case"). Small uppercase tracked eyebrows ("NUOVO CASE STUDY", "CANALI E FORMATI", "FORMATI DISPONIBILI") are muted grey. IDs and dimension readouts ("C2026-0036", "1920 × 1080", "100%") are in **monospace**.
- **Density**: wizard screens are airy, with a single narrow centered column and lots of empty dark space. The dashboard is medium density, with about 52px table rows and no row dividers beyond hairlines. The editor (p20/p23) is dense and three-pane: about 210px left panel, flexible canvas, about 300px right panel.
- **Corner radius**:
  - Buttons, badges, chips, segmented controls and search: fully rounded **pills**.
  - Cards, inputs, dropzone and format items: rounded rectangles of about **8-12px**.
  - Canvas tiles: about 12-16px.
  - Template thumbnails: about 8px.
  - Deck diagrams, by contrast, are square.
- **Iconography**: thin-stroke outline icons (Lucide/Feather-like) [?]. Format icons sit in small dark rounded-square tiles. The AI state uses a sparkle icon. Status pills use a leading dot.
- **Elevation**: flat, with no drop shadows. Differentiation comes from slightly lighter fills and 1px borders, plus glow on the lime CTAs and the AI icon.

## Observed inconsistencies
1. **"Social 16:9" label on a vertical format** (p20): the label says 16:9, but the specs read "1080 × 1920 • 9:16" and the icon is a vertical rectangle. The label should read 9:16.
2. **Canvas ratio control does not cover the formats** (p20): "Proporzione Canvas" offers only 16:9 / 4:5 / 1:1. The format list on the same screen includes 9:16 (Social) and A4 (One-Pager). Export (p23) adds 1080×1920 (9:16), 2480×3508 (A4 portrait, about 1:1.414) and 1200×675 (16:9 LinkedIn). There is also a redundancy: the format choice and the canvas ratio both define the aspect, and it is unclear which wins.
3. **The format sets differ between editor and export**:
   - p20 has 4 formats: Presentazione 16:9, Social 16:9, Carosello Social, One-Pager / PDF.
   - p23 has 7 formats: Presentazione Slide 16:9, Whitepaper, Carosello di Immagini, Post Quadrato, Video social, Copertina Linkedin, Pacchetto PNG HD.
   - Names drift: "Carosello Social" vs "Carosello di Immagini"; "One-Pager / PDF, A4 Dinamico • Executive" vs "Whitepaper 2480×3508 • 1 pag".
   - Post Quadrato, Copertina Linkedin and Video social cannot be edited in p20.
   - Grouping labels differ: "CANALI E FORMATI" vs "FORMATI DISPONIBILI".
4. **Status names differ between screens**:
   - Dashboard filter and badges: Approvato / In elaborazione / Bozza.
   - Sidebar: "Da approvare".
   - Editor pill: "IN APPROVAZIONE".
   - Export pill: "PUBBLICATO".
   - Wizard header: "Bozza".
   "In approvazione" and "Pubblicato" have no dashboard filter. It is unclear whether "Approvato" equals "Pubblicato". Dashboard badges use Title case while editor and export pills use UPPERCASE.
5. **Status during generation**: on p18 the header still shows "Bozza" while processing, but the dashboard would list the case as "In elaborazione". The copy says the draft ("bozza") will be available after processing, which implies Bozza is the *post*-generation state. This conflicts with the wizard showing Bozza before generation.
6. **The CTA label in flow 2 differs**: the p21 diagram says CTA "Scarica / visualizza case", but the p22 button reads "Visualizza Case". Download happens only later, in p23.
7. **Login step not sketched**: p14 has a Login step between "Crea case" and "Caricamento materiale". No login screen appears in 1.1-1.6.
8. **The technical case branch is not represented in the UI**: p14/p21 mention automatic "case tecniche" (MCP extraction) and access to "case tecniche che grafiche". No sketch shows a technical case or a switch between technical and graphic.
9. **Upload copy vs MVP scope**: p13 lists inputs as images, video and text files. The p16 dropzone copy lists decks, docs, screenshots and metrics, with no mention of video [?, accepted file types not shown].
10. **Drawer meta inconsistency (MAC Productive)**: p15 says "completato il 27/11/2026", while p22 for the same deliverable says "atteso il 27/11/2026". The background table on p22 also shows "In corso" (In progress) for the deliverable whose drawer says "Chiuso".
11. **Dashboard data quirks (p19)**: one ID is a placeholder, "C2026-xxx". IDs prefixed C2026 are paired with years 2025/2024 (for example C2026-0005 · 2024), so the ID year and ANNO (year) disagree. "COMMESSA / NOME" sometimes repeats the client name ("Fibre Connect").
12. **Chip overflow**: the p20 canvas chip "Area Riser…" is clipped at the tile edge. On p23 the same chip shows in full ("Area Riservata"), so the layout differs between editor and export preview for the same 16:9 format (headline wrap also differs).
13. **Layout Template count**: the label says "10 varianti" but only 4 thumbnails are visible. There is no scroll or "more" affordance [?].
14. **Primary accent hue drift**: the editor "Approva" (yellow-lime, about #E0F56E) and the export "Esporta" (greener, about #B5D578) differ [?, possibly rendering].
15. **Icon semantics**: "Esporta" uses a *share* icon while "Esporta ZIP" uses a download icon. The primary export action looks like a share-link action (compare p21 "link di condivisione").
16. **Two visual systems**: MAC Productive (light/purple) and MAC Recap (dark/lime), plus the logo treatment differs: lime serif "mac." vs white "mac. PRODUCTIVE". The integration handoff (p15 to p16, p22 to p23) switches theme abruptly. This may be intentional.
17. **Deck eyebrow inconsistency**: the p21 flow slide uses "IL CONTESTO", while the parallel p14 uses "PROSEGUIMENTO OPERATIVO".
