# Sprint Change Proposal — The configurator as built in the mockup (2026-10-28)

Status: **approved by the owner (Sonja), 2026-10-28**, with the open points answered (section 6).

## 1. Issue summary

Between 2026-10-27 and 2026-10-28 the owner (Sonja) and the developer built the configurator as a clickable mockup:

- the mockup is `ux-designs/ux-MAC Recap-2026-10-08/mockups/configurator.html`, merged in #99;
- its sizes and layouts come from the design team's Figma file "MAC-TF-AI", with the Intro, Contenuti, Risultati e testimonial and Chiusura templates.

The owner now wants it built into the app ("integriamolo", 2026-10-28). The mockup changes many rules that the PRD, the architecture and Epics 3–5 assumed. Built as written, Stories 3.4, 3.5 and 4.2–4.6 would produce a different configurator.

Type: new requirements from the stakeholder, decided by building them. Evidence: the mockup, and the owner's messages 2026-10-27/28. Decisions recorded on 2026-10-27 in `sprint-status.yaml`: no per-block check (4.7), approval without it (4.8), and no "generated, not checked" marking (3.6).

## 2. The decisions (C28–C40)

- **C28 — Three formats.** Presentazione 16:9 (1920×1080), Carosello 1:1 (1080×1080; Figma frame 1000) and Video 9:16 (1080×1920). They replace Deck 16:9, Social carousel 4:5 and PDF A4 (IR-OP1). Video serves both Instagram Reels and Stories.
- **C29 — Each format has its own pages.** A format owns its page list: its pages, blocks, elements, texts and backgrounds.
  - An edit changes only the format in view. Nothing cascades from Presentazione to the others.
  - This replaces "one shared text part + per-format layout" (AR4, Story 3.3).
- **C30 — Bento blocks hold elements.** A page is a bento grid of blocks. A block holds elements stacked top to bottom.
  - **Element types:**
    - text, in one of the seven styles (C32);
    - **Testi**, a group of texts aligned in the block: top, centre, bottom or split (first text on top, the rest at the bottom);
    - image and video (Riempi, Adatta or Ritaglia);
    - **Animazione** (C35);
    - the case's services as tags;
    - the client and MAC logos;
    - a divider.
  - **Editing:**
    - drag elements into a block or between blocks;
    - drag a block onto another to swap them;
    - drag a border between blocks to resize them;
    - add a block with the **Blocco** element;
    - delete elements and blocks.
  - **Background:** a block's background is a brand colour, transparent, or an image from the case's or the client's media. A page's background is the same choice. The page default is white and the block default is `#EDEDF0`.
  - Template spacers are not elements. They become the alignment of a Testi group.
- **C31 — Layouts and default pages.**
  - **Layout** lists the bento grids of the templates the owner sends, per format. It grows as templates arrive.
    - Applying a grid with more cells adds empty blocks.
    - Applying a grid with fewer cells removes only empty blocks. If filled blocks would go, it refuses and says how many blocks the page has over the layout.
    - **Mescola** moves to the next grid of that format with the same number of blocks.
  - **Pagine di default** exist only to get a template page back if it gets lost. They're never a place to add pages.
    - Presentazione: Intro, Contenuti with 1, 3 or 5 images, Risultati e testimonial.
    - Carosello: Intro, Sfida, Idea, Risultati e testimonial, Chiusura.
    - Video: Intro, Risultati e testimonial.
  - These replace variants, Shuffle, spacing sliders and Reset (Story 4.4), and media-count rules (Story 3.4).
- **C32 — Seven text styles.**

  | Style | Desktop (Presentazione) | Mobile (Carosello, Video) |
  |---|---|---|
  | Etichetta | 13 Semibold, uppercase | 16 |
  | Titolo XL | 56 Bold | 68 |
  | Titolo | 26 Semibold | 30 |
  | Sottotitolo | 20 | 26 |
  | Testo | 16 / 24 | 18 |
  | Numero | 56 Bold | 75 |
  | Citazione | 39 Medium | 40 |

  - A text keeps its template's Figma size where that differs from its style, until the style is changed.
  - Colour, alignment (left, centre, right) and two columns are settings of the text.
  - The colour palette is white, `#EDEDF0`, `#012234`, `#DEFE56`, `#2977FF` and transparent, plus a manual field. Text defaults to `#012234`.
  - Texts wrap to their block and grow in height. Only a result's number stays on one line.
  - This replaces font pairings and the S/M/L scale (Story 4.6).
- **C33 — Templates as decided.** The pages are built from the Figma frames:
  - **Intro:**
    - Presentazione: one page of five blocks (Progetto, Cliente, Servizi, Sfida, Idea).
    - Carosello: three pages (Copertina, Sfida, Idea).
    - Video: two blocks, info above and Carousel 04 below, at 105%.
  - **Contenuti** (Presentazione): images in grey blocks plus a text block "06 Deliverable — Output".
  - **Risultati e testimonial:**
    - a blue results block, with what each result measures and the number in lime under a thin line;
    - a grey "Voce del cliente" block.

    The Presentazione version adds a visual and the Video version starts with the Intro's info section. These texts come from Story 2.21 as typed, with no AI.
  - **Chiusura** (Carosello only): "Al prossimo progetto", the same for every carousel and editable per carousel.
  - The company is **MAC**.
- **C34 — Video.**
  - Texts animate in one after the other on a loop. The editor has an "Animazione testi" switch to stop them while editing.
  - Video pages keep room at the top for Instagram's bar.
  - Anteprima can overlay Instagram's Reel or Story interface (account `mac.creativetech`), with friends' photos and counts blanked out.
- **C35 — Animations.**
  - **Types:** Carousel 01, Carousel 03, Carousel 04 and Wheel 02 (owner's references).
  - **Cards:** 9:16, adapting to the number of media.
  - **Picking media:** a picker takes media from the case and the client and accepts uploads. An uploaded file joins the case's Media.
  - **Fit:** Adatta or Riempi, plus a size from 50% to 150%.
  - There are no animated page layouts.
- **C36 — Pages.**
  - **Add:** **Aggiungi pagina** adds an empty page after the selected one.
  - **Delete:** a page can be deleted, and ⌘Z brings it back. A page shared between a case and the client file asks before deleting. A case's own intro and closing pages are not shared, so they don't ask.
  - **Reorder:** drag pages in the right panel, within the same list.
  - **Sections:** a case's pages are grouped as Intro, Output and Risultati.
  - **Thumbnails:** they draw the real page, small.
  - **Sample case:** Presentazione has no separate Sfida or Approccio page, because the intro holds them. Video keeps only Intro and Risultati e testimonial.
- **C37 — Anteprima.**
  - The same canvas without editing tools, opened from an eye icon next to the formats. The icon turns into a pencil to go back.
  - The formats stay switchable.
  - Carosello and Video show one social-style slideshow of every page.
  - Texts stay editable in Anteprima.
- **C38 — The client file shows its cases.**
  - The client tab shows:
    - the client's intro;
    - each case's pages, without the case's own intro and closing;
    - the client's closing, plus the client's own Chiusura in Carosello.
  - A case's pages there are the case's own pages: an edit in either place shows in both.
  - Cases reorder by dragging their row in the right panel, and their pages move with them.
  - Case "Risultati e testimonial" pages stay in the client file (owner, 2026-10-27). This reverses C23 for the outro.
- **C39 — Approval for the demo.** **Approva** needs only no overflow and the material present. There is no per-block check (Story 4.7 not needed) and no "generated, not checked" marking (owner, 2026-10-27).
- **C40 — The editor frame.**
  - **Left panel (312 px):** the selected block's or element's settings, then always Layout, Pagine di default, Elementi, Sfondo and Elimina pagina.
  - **Right panel (224 px):** Pagine and Media.
  - Both panels hide from their own bar and reopen from the canvas edge.
  - **Selection:** selecting an element frames its block. A double click edits a text.
  - **Messages** show at the top of the canvas.

## 3. Impact analysis

- **Epic 3:**
  - **3.3 (done) changes.** The format registry and the document schema need a v2: per-format pages, blocks and elements.
    - The existing v1 documents are upgraded on read (AR4 `upgrade(doc)`).
    - There are none on dev beyond tests: no case has a revision yet.
  - **3.4 is rewritten:** templates as code from the Figma frames, layout grids and default pages per format.
  - **3.5 is rewritten:** one renderer per format for document v2, Video with animations.
  - **3.10 fills the default pages** from the case and the client with test text.
  - **3.6 and 3.7 are mostly unchanged.** The AI writes the texts that the templates place; the copywriting guide applies (#100).
- **Epic 4:**
  - **4.2–4.5 are rewritten** around C29–C40.
  - **4.6 is folded into 4.3** (C32).
  - **4.7 is not needed for the demo.**
  - **4.8 is simplified** (C39).
  - **4.11 and 4.12 follow C38.**
  - **A new story 4.13** covers pages: add, delete, reorder, sections and thumbnails (C36).
- **Epic 5:**
  - The export formats change (C28). 5.3 and 5.4 add Video as MP4 or WebM, after the demo (open point 1).
  - 5.9 and 5.10 apply C38: case outros stay in the client file.
- **PRD:**
  - FR3, FR4 and FR5 change: formats, per-format pages, a free bento layout within templates, and media fit.
  - IR-OP1 is answered (C28). IR-OP12 is reversed: Ritaglia exists (C30).
- **Architecture:**
  - AR4 / AD (document model) becomes per-format pages.
  - AR9 (format registry) gets the new formats.
  - A new rule: the client file references case pages and doesn't copy them (C38).
  - AD-22 changes: client fields on a page are editable and write back to the client's record (open point 2).
- **UX:**
  - EXPERIENCE.md's configurator section points to the mockup as the source of truth, with C28–C40 added to the conflicts log.
  - DESIGN.md takes the seven text styles and the palette.
- **Effort:**
  - About 2 days of planning-document edits.
  - The build is about 8–10 days: 3.3 v2, 3.4, 3.5, 3.10, 4.2–4.5, 4.13, 4.8, 4.11 and 4.12.
  - Migrations reach mac-recap-dev only after CI is green and the owner agrees.
- **Risk:**
  - Medium. Reworking a done story (3.3) and adding a Video renderer.
  - CI is blocked until GitHub billing is fixed, so no code PR can be checked before then.

## 4. Recommended approach

**Direct adjustment, with the mockup as the UX source of truth.**

- Rewrite the affected stories rather than patching them.
- Bump the document schema to v2 instead of keeping v1 and translating.
- Keep everything that still holds:
  - the revision model;
  - autosave with compare-and-set;
  - the job queue;
  - the media renditions;
  - one renderer per format;
  - "preview equals export".

**Build order:**
1. 3.3 v2;
2. 3.4;
3. 3.5;
4. 3.10;
5. 4.2;
6. 4.3;
7. 4.4;
8. 4.5;
9. 4.13;
10. 4.11 and 4.12;
11. 4.8;
12. then 3.6 and 3.7.

## 5. Detailed change proposals

- **Stories:**
  - Replace the acceptance criteria of 3.4, 3.5, 4.2, 4.3, 4.4, 4.5, 4.11 and 4.12 with criteria derived from C28–C40. Each criterion cites the decision and the mockup behaviour it comes from.
  - Mark 4.6 "folded into 4.3".
  - Mark 4.7 "not for the demo".
  - Amend 3.3 (format registry and document v2), 3.10 (default pages), 4.8 (C39), and 5.3, 5.4, 5.9 and 5.10 (formats, C38).
  - Add Story 4.13 (pages).
  - The full old → new text is written in the docs PR that applies this proposal, one commit per story, so each can be reviewed.
- **PRD:** FR3, FR4 and FR5 as in section 3; the IR-OP1 answer; IR-OP12 reversed.
- **Architecture (ARCHITECTURE-SPINE.md):**
  - the document model v2;
  - the format registry;
  - a new AD for case pages referenced by the client file;
  - AD-22: client fields bound to the client's record, editable on the page (open point 2).
- **UX (EXPERIENCE.md, DESIGN.md):** as in section 3, and a copy of the type and colour table from C32.
- **Sprint status:** a note on each affected story ("per SCP 2026-10-28"); Story 4.13 added as backlog.

## 6. Open points, answered by the owner (2026-10-28)

1. **Video export.** For the demo, Video is **Anteprima only**. When it is exported, the file is **MP4 or WebM** with the animations. Stories 5.3 and 5.4 get a Video entry marked "after the demo".
2. **Client info in the templates.** The client's fields on the pages (name, sector, logo and the like) are **editable on the page, and an edit updates the client's record**. The change then shows on every page and in every case that uses that field.
   - This replaces AD-22's "not editable on the page; filled at render time".
   - These texts are bound to a client field, not copied. Case fields (year, services) follow the same rule on the case's record.
3. **Carosello.** For now only **1080×1080**. The 4:5 carousel and PDF A4 are dropped from the registry.
4. **Ritaglia.** **Yes**: images can be cropped (Riempi, Ritaglia), reversing IR-OP12.

Later the same day, the owner settled four points left open in the stories:

5. **Deleting.** Blocks and pages, including Sfida, Idea and Risultati, can be deleted freely. They are recovered from **Pagine di default** or with ⌘Z, so document v2 doesn't require them (Stories 3.3, 4.3).
6. **AI texts per format.** The AI writes **three texts, one per format**, each fitted to that format's space. An edit in one format doesn't reach the others, and each copy carries its own claims (Stories 3.3, 3.6).
7. **Services.** Picked as a **multiselect when the case is created** and stored on the case as a list. The Intro shows them as tags (Story 3.4).
8. **Ritaglia control.** The person **drags the image inside its block** and sets the **zoom with a slider** (Story 4.5).

Then the remaining nine:

9. **Client closing page.** It uses the **Risultati e testimonial** template in Presentazione and Video (Stories 3.4, 4.11).
10. **Empty image block.** It is **transparent** in an approved export (IR-A4; Stories 3.4, 3.7).
11. **`check` field.** **No**, not after the demo either (Story 3.3).
12. **Client fields on the page.** The sector is **free text** (no longer picked from the shared list); the logo is replaced by **uploading a file**. Both update the client's record (Story 4.3).
13. **Keyboard alternative to dragging.** **Not for now**, for elements, blocks and pages (UX-DR26 deferred; Stories 4.3, 4.13).
14. **Two columns.** **Yes**, as a control in the text panel (Story 4.3).
15. **Client media.** The **3-file limit goes**. The intro and closing use the first 3 images in upload order, and favourite images come first (Stories 2.16, 4.11).
16. **Client pack order.** **Newest first** by default; once reordered in the client configurator, the pack follows that order (Stories 4.12, 5.9).
17. **Packs and collections.** In **every format**. Building one opens the **configurator**. Owner/designers and account/sales/social users can both create them, and all of them sit in **one shared space**. Some features are hidden or locked for account/sales/social users; the list is still to be written, and until then IR-COLL-EDIT applies (Stories 5.9–5.11, UX-DR39, FR13).

## 7. Implementation handoff

- **Scope: Major.** A done story is reworked, and more than ten stories are rewritten.
- **Owner:** answers the open points and approves this proposal.
- **Developer (this session):**
  - applies section 5 in one docs PR;
  - then builds the stories in the order of section 4, one PR each;
  - migrations go to dev only after green CI and the owner's agreement.
- **Success:**
  - the planning docs describe the configurator in the mockup;
  - each story's criteria can be checked against the mockup;
  - the demo opens a real case in the configurator with its template pages, edits saved per format, and Approva working as in C39.
