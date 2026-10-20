---
name: MAC Recap
status: final
created: 2026-10-08
updated: 2026-10-19
sources:
  - {planning_artifacts}/prds/prd-MAC Recap-2026-10-08/prd.md
  - {planning_artifacts}/prds/prd-MAC Recap-2026-10-08/addendum.md
  - {planning_artifacts}/prds/prd-MAC Recap-2026-10-08/reconcile-a3-deck.md
  - {planning_artifacts}/briefs/brief-MAC-Recap-2026-10-08/brief.md
  - docs/sources/MAC Recap_Modello A3.pdf (slides 14-23)
---

# MAC Recap: Experience Spine

> Final (fast path), 2026-10-08. Visual identity deferred to DESIGN.md Update mode. `[ASSUMPTION]` marks a UX call made without confirmation. `[OPEN n]` points to a PRD open point; this spine offers options and does not decide it. `[CONFLICT]` marks a tension between sources that goes back to the PRD owner. The PRD wins on product scope; this spine wins on behaviour; DESIGN.md wins on visuals.

## Vision

MAC Recap turns a closed project's verified material into a finished, on-brand case study. The tool does not invent: it assembles and structures what the team already made and checked. The experience follows from that. Uploading material is the only way to start generation. The owner/designer's review is a claim-by-claim check against that material, not a skim. Only what passes review can leave the tool. Success is a designer going from upload to approval in 15 minutes of hands-on time without skipping the check, and an account manager finding that case study and sending it to a client in under a minute.

## Foundation

- **Form factor:** desktop web, internal tool, standalone MVP. Primary viewport 1440px wide, minimum supported 1280px. The one exception is the **shared link page** (the hosted presentation), which clients and prospects open on any device and so must be responsive. See Responsive & Platform.
- **UI system:** shadcn/ui (new-york style, neutral base), as set up in the codebase (`components.json`). This spine names behaviour only; DESIGN.md holds the visual deltas.
- **Visual identity:** see [DESIGN.md](DESIGN.md) (updated 2026-10-13): dark grey chrome on black, blue calls to action, lime details, Inter + JetBrains Mono. Where this spine needs a visual hook it names a token (for example `{colors.status-approved}`). The UI references in `imports/ui-refs/` are look-only; this spine's behaviour wins over them (no card-ratio control, no duration/timeline, no template restyling).
- **Two separate visual systems:** the **tool UI** (DESIGN.md) and the **case study templates** (MAC's graphic templates, owned by the design team). The tool chrome never restyles template output.
- **UI language:** Italian (decided 2026-10-08), matching the A3 sketches and the team. Copy in this spine is written in English for the spec, with the Italian sketch label next to it where one exists; final Italian microcopy is written from these English lines.
- **Terminology:** the Italian UI says *case history* (PR #38); "case study" stays the internal term in these documents, story keys, tables (`case_study`) and code.
- **Authentication:** login arrives in Sprint 3 (FR8). Until then the tool runs unauthenticated in a dev environment. Role-dependent surfaces below assume login exists, as it will by the Oct 30 demo.

## Roles and what each one sees

| Role (PRD name) | Lands on | Sees | Can do |
|---|---|---|---|
| Owner/designer | Case studies (table view) | Every case study, every status | Create, upload, mark favourites, fill details, generate, edit in configurator, check claims, approve, export, share, maintain templates, manage clients, client intros, client overview, collections (including text edits) |
| Account/sales/social | Case studies (library view) | Approved case studies only | Browse, search, filter, preview, export, create shareable links, client packs from a read-only Clients list, collections (reorder, hide pages, export; no text edits) |
| Admin | Users | Users and their roles | Add and remove users, assign one role per user. Nothing else: no permission or guardrail settings exist anywhere in the UI (NFR3) |

Permissions are fixed (PRD Story 6.2). A control a role can't use is **absent**, not disabled. The exception is the guardrail controls below, which are shown disabled with a reason so the owner/designer knows why.

## Information Architecture

The A3 entry steps inside MAC Productive (slides 15 and 22) are out of the MVP. The owner/designer starts from **+ New case study** on the Case studies surface.

| Surface | Reached from | Roles | Purpose |
|---|---|---|---|
| Sign in | App URL (from Sprint 3) | All | Login. One screen, no self-sign-up. |
| Case studies | Sidebar, default landing | Owner/designer, account/sales/social | One list of case studies. Owner/designer gets a table with status filters and the review queue. Account/sales/social gets a library of approved case studies. |
| To review | Sidebar item with count | Owner/designer | The approval queue: the Case studies table pre-filtered to status *To review*, oldest first. |
| New case study wizard | **+ New case study** | Owner/designer | Three steps: 1 Material, 2 Details, 3 Generate (A3 1.2–1.4). |
| Configurator | Click a row in *To review* or *Approved* (owner/designer) | Owner/designer | Review, edit, check claims, approve. Three panes: formats · canvas · edit and check (A3 1.6). |
| Case study view | Click a card (account/sales/social) or **View** (owner/designer) | Owner/designer, account/sales/social | Read-only preview of an approved case study in every MVP format; export and share (A3 2.2). |
| Clients | Sidebar | Owner/designer; account/sales/social read-only | Client list with automatic codes; add and edit; open a client to see its case studies. Account/sales/social see clients with an approved case study and **Scarica** (client pack). |
| Client wizard | **Aggiungi cliente**; **Modifica cliente** on the client page until Story 4.12 | Owner/designer | Three steps, like the case history wizard: 1 Dettagli, 2 Materiale, 3 Introduzione (the configurator in client intro mode; hidden until it is designed with the owner). (SCP 2026-10-19) |
| Client overview | **Modifica cliente** (from Story 4.12) | Owner/designer | The client's intro and every case study as one preview; edit any part in place; **Dati cliente**. |
| Collections | Sidebar **Raccolte** | Owner/designer, account/sales/social | Saved, named collections: open, rename, delete. |
| Collection configurator | **Crea raccolta** in the library, or a collection row | Owner/designer, account/sales/social | Reorder, hide pages, edit text (owner/designer only), export. |
| Templates | Sidebar | Owner/designer | Maintain templates. See *Templates* below for the MVP meaning. |
| Users | Sidebar | Admin | User list and role assignment. |
| Shared link page | A shareable link, outside the app | Anyone with the link (interim, [OPEN 11]) | Hosted presentation of one approved case study in one format. No app chrome. |

**Navigation:** a left sidebar holds **+ New case study** (owner/designer only), Case studies, To review (owner/designer only), Clients (owner/designer only), Templates (owner/designer only), Users (admin only), and the **Account** menu with sign-out. The wizard and the configurator are full-screen task surfaces with a back arrow to the list; they hide the sidebar. Dialogs stack at most one level deep. **Raccolte** is in the sidebar for owner/designer and account/sales/social, and **Clients** shows for account/sales/social as a read-only list.

**Surface closure check:** every PRD capability (FR1–FR8) maps to a surface above. FR1 → wizard (ID assigned on create). FR2 → wizard steps 1–2. FR3/FR4 → wizard step 3 and the configurator. FR5/FR6 → configurator. FR7 → case study view and the shared link page. FR8 → sign in and Users.

## Case study lifecycle [OPEN 8]

The A3 sketches use six names for what may be four states: *Bozza*, *In elaborazione*, *Da approvare*, *IN APPROVAZIONE*, *Approvato*, *PUBBLICATO*. The PRD defines only **Approved**. UX needs one vocabulary used on every screen, in one case style. Three options follow; the PRD owner decides.

**Option A: four states, sharing is not a status (recommended).**

| State | EN label | IT label | Entered when | Who sees it |
|---|---|---|---|---|
| Draft | Draft | Bozza | Case study created in the wizard; or generation failed | Owner/designer |
| Generating | Generating | In elaborazione | **Generate** pressed with material present | Owner/designer |
| To review | To review | Da approvare | Generation finished | Owner/designer |
| Approved | Approved | Approvato | An owner/designer approves after the claim check | All except admin |

Shared links are shown as a count on Approved case studies ("2 links"), not as a status. This matches the PRD rule that editing keeps a case study *approved*, and it avoids a *Published* state that would have to be per case study or per link.

**Option B: five states, Published is a status.** As A, plus *Published* (*Pubblicato*), entered when the first shareable link is created. Clear for browsing ("what's already out there"), but the PRD has editing keep the case study "approved", so editing a Published case study would have to keep it Published, and it's unclear what happens when the last link is revoked.

**Option C: three states.** Draft → To review → Approved, with *Generating* shown as a progress indicator on a Draft row instead of a status. Fewest names, but the review queue then mixes "being generated" with "nothing generated yet".

Rules that hold under every option:
- There is no path back from Approved to an earlier state. Editing an approved case study keeps it Approved (PRD Story 4.3).
- A status badge always pairs colour with the text label (`{colors.status-draft}`, `{colors.status-generating}`, `{colors.status-review}`, `{colors.status-approved}`).
- The A3 sketch's "Bozza while generating" inconsistency (slide 18) is resolved: the wizard header shows the current state, so *Generating* during generation.

## Component Patterns

Behavioural. Visual specs live in `DESIGN.md.Components`.

### Case studies: owner/designer table view

| Element | Behaviour |
|---|---|
| Columns | ID (the case history code, e.g. `LUM-2026-01`, FR1, monospace, `{typography.mono}`), Name, Client, Year, Status, Updated, Links (count, Approved only). |
| Search | One field, placeholder "Search name, client or ID" (*Cerca progetto o cliente…*). Matches as you type (debounce ~250 ms), case- and accent-insensitive, over name, client name, client code and case code. |
| Status filter | Segmented control: All · Draft · Generating · To review · Approved (names follow whichever [OPEN 8] option is chosen). Each segment shows its count. Combines with search (AND). |
| Sort | Default: Updated, newest first. Column headers sort on click. |
| Row click | Draft → reopens the wizard at the first incomplete step. Generating → no-op with tooltip "Still generating". To review → configurator. Approved → configurator (edit) with a **View** action to the case study view. |
| Row actions | Overflow menu: View (Approved), Export (Approved), Share (Approved), Delete (Draft only, with confirm). `[ASSUMPTION]` Deleting non-draft case studies is out of MVP. |
| Live status | Rows in *Generating* update without a page reload when generation finishes. |
| Empty | No case studies yet: "No case studies yet. Start with the material from a closed project." + **New case study**. |
| No results | "Nothing matches '{query}'." + **Clear search and filters**. |

### To review (approval queue)

The Case studies table, pre-filtered to *To review* and sorted oldest first so nothing sits waiting. The sidebar count shows how many are waiting. Any owner/designer can open and approve any item (PRD: approver is not limited to the uploader). `[ASSUMPTION]` No assignment or claiming of review items in the MVP.

### Case studies: account/sales/social library view [settles OPEN 4]

`[ASSUMPTION]` Account/sales/social users browse visually, because they are choosing something to show a client.

| Element | Behaviour |
|---|---|
| Layout | Card grid. Each card: cover thumbnail (first slide of the 16:9 deck), name, client, year. |
| Content | Approved case studies only. No status filter, no status badge (everything here is approved). |
| Search | Same field and matching as the table view. |
| Filters | Client and Year facets. Facets are multi-select chips; active filters show above the grid with a single **Clear all**. |
| Sort | Newest approved first. |
| Card click | Opens the case study view. |
| Empty | "No approved case studies yet." No action (they can't create). |
| Owner/designer access | `[ASSUMPTION]` Owner/designers can switch Case studies to the library view with a Table / Library toggle, so they see what account/sales/social see. |
| Multi-select | Each card has a checkbox (Space on a focused card). With one or more selected, a bar shows "{n} selezionate" with **Crea raccolta** and **Annulla selezione**. |

### New case study wizard

A three-step stepper: **1 Material · 2 Details · 3 Generate**, horizontal, above the content (decided 2026-10-13). `[ASSUMPTION]` The wizard is a focused mode: the sidebar is hidden on every wizard step (decided for the Material step 2026-10-13); the back arrow in the wizard header returns to Case studies. The footer button on each step reads **Avanti** (no step name).

**Wizard layout** (every step; from the team's first hi-fi mock, layout only: [`imports/ui-refs/ref-hifi-material-layout.webp`](imports/ui-refs/ref-hifi-material-layout.webp)):

- A slim top bar: back arrow, case study name and its code (mono) on the left, status badge on the right.
- One content column (about 820px), centred horizontally and **vertically** in the space under the top bar. When the content is taller than the viewport, the column starts at the top and scrolls; the top bar stays.
- In the column, top to bottom: eyebrow *Nuovo case study*, the case study name as a large title, the stepper, the step heading and a one-line intro, the step's content, then a footer under a divider with step dots in the centre and **Avanti** on the right (inactive until the step's condition is met). The case study is created, and its unique ID assigned (FR1), when the wizard opens with a name entered. It is saved as a Draft from that moment, so leaving and returning loses nothing.

**Step 0: Name.** A short header form: case study name (required) and client (required), picked from a list of existing clients showing name and code. Clients are added only on the Clients page; with none, the field says so and links there. `[ASSUMPTION]` Year defaults to the current year and is editable.

**Step 1: Material** (FR2, NFR6). Files only: text-document files are uploaded here like any file, but there's no pasted-text entry in this step; text is entered in step 2 (C7, resolved).

→ Visual reference: [`mockups/material-step.html`](mockups/material-step.html). This spine wins on conflict.

| Element | Behaviour |
|---|---|
| Dropzone | Drag and drop or **browse**. Accepts images, videos, text documents, PDFs; the accepted types show as small chips inside the empty dropzone. Copy: "Up to 20 files, 50 MB each." Once files are in, the dropzone compacts above the rows. |
| Limits | A 21st file or a file over 50 MB is rejected inline on that file ("Over 50 MB. Not uploaded.") without blocking the others. A wrong file type gets "This file type isn't supported. Use images, videos, texts or PDFs." |
| Upload progress | Per-file progress bar; files upload in parallel; the user can mark a file as favourite as soon as it has uploaded. |
| Deliverable rows | Each uploaded file is a deliverable row: thumbnail, file name, size (mono), remove. No tags, properties or flags (decided 2026-10-13, C6, resolved). |
| Favourite | Image and video rows carry a **Preferito** toggle (star); PDFs and documents don't. Any number of files can be favourites; it's optional and never blocks **Avanti**. Saves at once; a toggle button with `aria-pressed`. What a favourite means for generation is open ([OPEN 14]). |
| Remove | Each row has a remove action (✕). The file is removed at once: no confirm and no Undo toast (decided 2026-10-14, C8, resolved). |
| Continue | **Avanti** is enabled as soon as one file has finished uploading. With 0 files, step 2 (and so step 3) can't be reached by any route: **Avanti** is inactive and the *Dettagli* and *Genera* stepper segments aren't clickable (decided 2026-10-14). |

**Step 2: Details** (FR2). A short form in three sections that mirror the PRD: **Context**, **Solution**, **Results** (*Contesto*, *Soluzione*, *Risultati*). Each is a textarea whose one-line prompt is its placeholder (for example "What did the client need, and why?"), decided 2026-10-14. These three fields are the only place for project text in the wizard: there is no extra free field and no pasted-text block (C7, resolved). A counter in the footer's left slot shows how many are filled ("2 di 3 compilati"); **Avanti** is active from the start. Each field autosaves. `[ASSUMPTION]` Visited steps are clickable in the stepper, so Materiale can be reopened; Dettagli and Genera are clickable only while step 1 has at least one file.

→ Visual reference: [`mockups/details-step.html`](mockups/details-step.html). This spine wins on conflict. The fields are optional (decided 2026-10-08); the form alone never enables generation (NFR6). The A3 sketch's "0 di 4" counter and its four-field "Contesto & background" section are replaced by the PRD's three topics.

**Step 3: Generate** (FR3, NFR6).

→ Visual reference: [`mockups/generate-step.html`](mockups/generate-step.html) (ready, generating, failed; the blocked state below can't be reached from the UI, because step 1 gates the wizard, and stays as a server-side safety). This spine wins on conflict. The summary panel lists Materiale and Dettagli with a **Modifica** link back to each step; **Genera** is the main call to action. While generating, the stepper and footer give way to the processing message and an indeterminate bar (no percentage).

| Element | Behaviour |
|---|---|
| Summary | "{n} files, {m} of 3 details filled." |
| Generate button | Enabled only when at least one material file has uploaded. Otherwise disabled with the reason visible next to it: "Add at least one file of project material. The details form alone isn't enough to generate." |
| After Generate | Status becomes *Generating*. Screen shows a processing state with "Generating your case study. You can leave this page; it will appear in To review when it's ready." and **Back to case studies**. |
| Waiting time | Generation time is unbounded and doesn't count toward the 15–20 minute budget (NFR4). No progress percentage is promised. |
| Completion | The row moves to *To review*; the To review count goes up; `[ASSUMPTION]` an in-app toast appears if the user is anywhere in the app: "{Name} is ready to review." with **Open**. No email in MVP. Notifications aren't in any FR ([CONFLICT] C3). |
| Failure | The case study returns to *Draft* with a banner in the wizard: "Generation didn't finish. Your material and details are saved." + **Try again**. |

### Configurator (FR5, FR6, NFR2, NFR7)

Three panes, as in A3 1.6, with the changes noted. The canvas is a Bento-style template layout (PRD Story 4.2).

→ Layout reference: [`wireframes/flow-configurator-2026-10-08.excalidraw`](wireframes/flow-configurator-2026-10-08.excalidraw) (Edit tab, Check tab with material drawer, Approve confirm, editing an approved case study). Low fidelity, greyscale; open in Excalidraw. Placeholder content in it (file names, KPI values) is illustrative. This spine wins on conflict.

→ Visual references (look only): [`imports/ui-refs/ref-templates-panel.png`](imports/ui-refs/ref-templates-panel.png) (left pane), [`imports/ui-refs/ref-properties-panel.png`](imports/ui-refs/ref-properties-panel.png) (right pane), [`imports/ui-refs/ref-canvas-toolbar-timeline.png`](imports/ui-refs/ref-canvas-toolbar-timeline.png) (canvas toolbar only; the timeline doesn't apply). Their controls for card ratio, duration and background aren't part of this product.

**Top bar.** Back arrow · case study name · status badge · save state ("Saved" / "Saving…") · **Approve** (To review) or **Update approved version** (Approved). `[ASSUMPTION]` Edits autosave; there is no **Save draft** button (the A3 sketch shows one). Version history ("v2.4", "Cronologia Versioni") is out of MVP.

**Left pane: Formats.** One entry per MVP export format ([OPEN 1]); the same list, names and order as the case study view. Selecting a format switches the canvas. Each entry: name, ratio, pixel size, and a check mark once its layout has been looked at.

- Resolves the A3 inconsistencies: the "Social 16:9" label becomes "Story 9:16" (if that format is in the MVP), and the canvas ratio control (16:9 / 4:5 / 1:1) is **removed**. The format sets the ratio; there is no second control that could disagree with it.
- `[ASSUMPTION]` **Content is shared, layout is per format.** Text and the choice of media are one set across all formats; layout variant, typography scale and spacing are set per format. Editing a headline in the deck changes it in the carousel too.

**Centre: Canvas.** Live preview of the selected format at fit-to-pane zoom. Click a text block to edit it in place. Click a media slot to select it. Multi-page formats (deck, carousel) show a page strip under the canvas.

**Right pane: two tabs, Edit and Check.**

#### Configurator acceptance criteria: editing

**Text**
- Every generated text block is editable in place on the canvas: click to edit, Escape or click outside to finish. Changes autosave.
- The challenge / approach / result structure (NFR5) is locked: section headings can be reworded but sections can't be deleted or reordered.
- Plain text with line breaks only. No font, colour or size control inside a text block; those belong to typography.
- Overflow: if text no longer fits its slot, the block shows an overflow marker and the Check tab lists it. The tool does not shrink text silently below the template's minimum size.
- Every edited block is marked "edited" and needs its claim check again (see Check below).
- **About the client block** (decided 2026-10-16, amended the same day): logo, name, industries and description, always the client's current info (industries since SCP 2026-10-19). Read-only, with the hint "Modifica i dati nella pagina del cliente. Le modifiche si vedono in tutte le sue case history." It isn't in the Check tab; claims the AI based on the client's description are checked like any other.

**Layout**
- **Layout variant:** pick one of the template's designed variants for this format (thumbnail grid; the A3 sketch shows "10 varianti").
- **Shuffle layout:** steps to the next designed variant that fits the number of media items (FR4). It never generates a new layout. Undo returns to the previous variant.
- **Spacing:** outer padding and gap between boxes, as sliders limited to the range the template allows (A3 sketch: 24 px and 16 px defaults).
- **Reset:** returns this format's layout to the generated default.
- Status of shuffle as "altering" is [OPEN 12].

**Media**
- **Replace media:** swaps the selected slot's media for another file **from this case study's uploaded material only**. No upload from the configurator, no stock or generated images. `[ASSUMPTION]` To add new material, go back to the wizard's Material step; the case study keeps its status.
- **Reorder:** drag a media item onto another slot to swap them.
- **Remove from layout:** hides a media item; the layout adapts to the new count (FR4).
- **Fit:** media is placed whole within its slot (fit, no stretching). Whether cropping or a focal point is allowed depends on [OPEN 12]. Until then the controls for crop, recolour, filters and effects don't exist.

**Typography**
- Choose one of the font pairings the template allows (A3 sketch: Plus Jakarta Sans, Inter Sans, Editorial Serif). No font upload, no free font picker.
- **Text scale:** S / M / L per format, within template limits.
- No per-word or per-block styling.

#### Configurator acceptance criteria: claim check (NFR2)

The owner/designer checks every claim against the material before approving. This is a manual step; the tool supports it but doesn't automate it or judge claims.

- The **Check** tab lists every text block by section (challenge, approach, result, headline, KPI tiles), each with a checkbox "Checked against material".
- Selecting a block in the list highlights it on the canvas, and vice versa.
- **Material drawer:** from the Check tab, open the uploaded material and the details answers side by side with the canvas, to look up the source of a claim. Files open in a viewer (images, PDFs, text); video shows a player.
- If a claim can't be traced, the owner/designer edits or deletes the claim, and the block needs checking again.
- Editing a checked block unticks it.
- **Approve** is disabled until every block is ticked and no block overflows. The disabled button names what's left: "3 blocks still to check."
- Approving shows a confirm dialog: "Approve {Name}? Every claim has been checked against the material. Once approved, it can be exported and shared." **Approve** / **Cancel**. On confirm: status → Approved, toast "Approved. It's now in the library.", and the user goes back to To review if more items are waiting, otherwise to Case studies.
- No "approve all" and no "tick all" shortcut. The counter-metric (PRD) is that time must not drop by skipping the check.

#### Editing an approved case study (PRD Story 4.3)

The PRD decides that editing an approved case study updates it and its shareable links, and that it stays approved. `[ASSUMPTION]` UX keeps NFR2 intact by staging the edits:

- Opening an Approved case study in the configurator shows a banner: "Approved, with {n} live links. Changes go live when you update the approved version."
- Edits autosave to a working copy. The live version and its links don't change yet.
- Edited blocks are unticked in the Check tab. **Update approved version** is enabled when every edited block is ticked again.
- Confirm dialog: "Update the approved version? {n} links will show the new version." On confirm, the live version and every link update; status stays Approved.
- **Discard changes** returns to the live version.
- [CONFLICT] C1: if the PRD intends edits to go live immediately, an unchecked claim could reach clients through a live link, which goes against NFR2 and NFR7. This staging is the proposed resolution.

#### Configurator modes

Added by the [Sprint Change Proposal 2026-10-16, client intro and collections](../../sprint-change-proposal-2026-10-16-client-intro-and-collections.md). The same frame serves three modes:

- **Case history:** as above.
- **Client intro:** the same panes for the client's intro pages. Text, designed layout variants, image order and typography are edited as for a case history. The Check tab lists the intro's blocks; the material drawer shows the client's data and images. **Approve** and **Update approved version** work as for a case history.
- **Client overview** (from **Modifica cliente**): the left pane lists **Introduzione** (with its badge), then every case history of the client, newest first, with code, name and badge. Bozza case histories are greyed ("Non ancora generata"). The centre shows the selected format as one continuous preview of every part, with a divider per part, and the format switch moves to the top bar. Editing a block edits that case history itself, through its own save state. For an Approvato case history the change goes live only through that part's **Update approved version**. **Dati cliente** in the top bar holds the client's data and images. There is no reordering and no bulk approve. Below 1024 px: "The configurator needs a larger screen."

### Case study view (FR7)

Read-only. Available only for Approved case studies (NFR7); a non-approved case study has no view, export or share entry point at all.

| Element | Behaviour |
|---|---|
| Top bar | Back · name · status badge · **Share** · **Export**. |
| Format list | Left pane, same list and names as the configurator's Formats pane. |
| Preview | Page pager ("Slide 1 of 12"), zoom − / 100% / +, fit, full screen. |
| Export | Exports the **selected format** as a file. File types: deck → PDF only (decided 2026-10-08; no PPTX), A4 → PDF, `[ASSUMPTION]` carousel and other image formats → ZIP of PNGs. Shows progress, then the browser download. **Export all** gives one ZIP with every format. |
| Share | Opens the Share dialog (below). |
| Owner/designer | Also sees **Edit**, which opens the configurator. |

The About the client block shows in every format, with the client's current info: logo, name, industries and description (SCP 2026-10-19). A change to the client shows here at once, approved case studies included.

The A3 "Asset e Risorse" tab and the "Pacchetto PNG HD" source-material pack are out of MVP unless [OPEN 1] adds them.

### Share dialog and shareable links [OPEN 11]

- **Create link:** choose a format (default: 16:9 deck). Creates a link to a hosted presentation of that format. The link URL is copied automatically, with a "Link copied" toast.
- **Who can open it:** shown as a plain sentence above the link, never hidden. Interim (PRD): "Anyone with the link can view."
- **Link list:** every link for this case study, with format, created by, created on, and **Copy**. `[ASSUMPTION]` **Turn off link** is included; a turned-off link shows "This case study is no longer available."
- Links always show the current approved version (PRD Story 4.3).

Options for [OPEN 11], with their UX cost:

| Option | What the viewer sees | UX cost |
|---|---|---|
| A. Anyone with the link (interim) | Opens straight away | None. Relies on "Turn off link" for control. |
| B. Logged-in MAC users only | Sign-in screen first | Clients can't open links, so sharing with clients means exporting a file instead. Changes the purpose of links. |
| C. Expiring link | Opens until the date, then an "expired" page | Share dialog gets an expiry picker (7 / 30 / 90 days / never). Link list shows expiry. |
| D. A with an optional password | Password prompt if set | Share dialog gets a password field; the password has to be sent separately. |

### Shared link page

- A full-screen presentation of one format: pager, keyboard arrows, full screen. No sign-in (Option A), no MAC Recap navigation, no editing, no download button. `[ASSUMPTION]` No download, so sharing a link isn't a side door around export.
- Responsive: fits any viewport; on phones, slides scale to width and swipe.
- Turned-off or expired link: "This case study is no longer available. Contact the person who shared it."

### Templates: what "maintains templates" means [settles addendum item]

`[ASSUMPTION]` In the MVP, templates are designed by MAC's design team and built into the tool by the developers. Inside the tool, the owner/designer:

- **Browses** the template set: each template's layout variants per format, previewed with sample content.
- **Turns variants on or off.** An off variant is never used by generation or Shuffle. At least one variant per format stays on.
- **Sees where a template is used:** how many case studies use each variant.

Out of MVP: uploading new templates, editing template design in the tool, template versioning. Changing a template's design goes through the design team and a release.

Recommendation for the PRD: give template maintenance its own FR with this scope, because Story 6.2 grants "manage templates" but no FR says what it does ([CONFLICT] C4). The A3 sidebar marks Templates "SOON"; this proposal makes the MVP version small so it can ship.

### Clients

Owner/designer only. Decided 2026-10-15 ([Sprint Change Proposal 2026-10-15](../../sprint-change-proposal-2026-10-15.md)). Codes are always automatic (spine AD-21).

| Element | Behaviour |
|---|---|
| List | Table of clients: ID (the client code, mono; owner 2026-10-19), Name, Case histories (count). Default sort Name A–Z; header sort. |
| Search | Over name and code, with the Case studies table's rules. |
| Add client | **Aggiungi cliente** opens the client wizard, full-page like the case history wizard, at step 1 (SCP 2026-10-19). The stepper shows **Dettagli**, **Materiale** and **Introduzione**. **Dettagli**, in this order: Nome; Settore as pills (multiselect, at least one, from a fixed list: *Interior design, Energia, Risorse umane, Lusso*); Descrizione (up to 400 characters, live counter); Logo (upload with preview; PNG, JPEG or WebP); Contesto, Soluzione and Risultati (textareas with one-line placeholder prompts, up to 5000 characters each, as in the case history Details step). Every field is required: **Avanti** stays inactive until they are filled, with the reason linked via `aria-describedby`. **Avanti** creates the client (or saves it, if it exists) and opens step 2. The code is assigned automatically; there is no code field. A duplicate name shows "Esiste già un cliente con questo nome." on step 1. |
| Edit client | Until Story 4.12, **Modifica cliente** opens the client wizard at step 1 with the client's data (SCP 2026-10-19; it replaces the **Edit client** dialog). It states that the code stays the same and that changes apply to all the client's case studies, approved ones included ("Il codice {code} non cambia. Le modifiche si vedono in tutte le sue case history."). Contesto, Soluzione and Risultati autosave as in the case history Details step; name, industries and description save on **Avanti**. Replacing or removing the logo deletes the old one. A new name shows everywhere, including the client's case studies. From Story 4.12, **Modifica cliente** opens the client overview (below). |
| Client page | Row click opens the client page: logo, client name and code, industries as pills, description, **Edit client**, and the Case studies table limited to that client, with **New case history** preselecting the client. Contesto, Soluzione and Risultati aren't shown on the page. Every row opens this page, finished or not; an unfinished client is completed through **Modifica cliente**, which reopens the wizard (owner, 2026-10-19). |
| Absent | No delete. |
| Below 1024 px | Read-only list. |
| Add client: material and intro | Step 2 **Materiale** (SCP 2026-10-19): up to 3 files of the case history's material types (images, videos, PDF, TXT, MD, DOCX; up to 50 MB; images also at least 1600 px on the short side), at least 2 of them images. Copy above the drop zone: "Carica fino a 3 file, almeno 2 immagini. Le immagini servono per le pagine di introduzione." A 4th file is refused inline ("Massimo 3 file.") without blocking the others. Removing a file is immediate, with no undo. **Crea introduzione** stays inactive until at least 2 images are uploaded ("Carica almeno 2 immagini.", linked via `aria-describedby`). It starts the intro draft and shows "Stiamo preparando l'introduzione di {client}." with **Torna ai clienti**. The screen waits and opens the intro by itself when it is ready: the client page until Story 4.11, then the configurator. Before the intro draft exists (Story 3.9), it goes to the client page at once. If the user leaves, the ready toast still shows. Step 3 **Introduzione** is the configurator in client intro mode, with the stepper still visible; it is designed with the owner first and isn't shown until then, so the wizard ends on step 2. |
| Edit client: client overview | From Story 4.12, **Modifica cliente** opens the client overview (Configurator modes). The step 1 fields and the step 2 material are edited in **Dati cliente** with the wizard's rules (SCP 2026-10-19): **Sostituisci**, **Rimuovi** (an image can't be removed when only 2 remain: "Servono almeno 2 immagini."), reorder by drag or menu. |
| Client page: intro | Also shows the intro's status and **Apri introduzione**. |
| Account/sales/social | A read-only list of clients with at least one approved case study, with **Scarica** per row and on the client page: one file (Deck 16:9 or PDF A4) with the approved intro and the approved case studies, newest first. With 2+ case studies the client intro replaces their own intro pages; otherwise, or when the intro isn't approved, each keeps its own ("L'introduzione di {client} non è ancora approvata: le sue case history usano la propria introduzione."). |

### Collections

Decided 2026-10-16 by the owner ([Sprint Change Proposal 2026-10-16, client intro and collections](../../sprint-change-proposal-2026-10-16-client-intro-and-collections.md)). Owner/designer and account/sales/social.

| Element | Behaviour |
|---|---|
| Create | Select approved cards in the library, **Crea raccolta**, enter a name. The collection configurator opens. Only approved case studies can be added. |
| Left pane | The parts in order. A client with 2+ case studies gets its approved intro in front of them, shown locked, and its case studies stay together as a group. Reorder groups and case studies within a group by drag handle or "Sposta su / giù". **Aggiungi** adds approved case studies; removing one is in its menu. |
| Centre | Continuous preview of the selected format through the shared renderer. |
| Right pane | **Testo:** edit the selected block, only in this collection, owner/designers only (account/sales/social see "Solo i designer possono modificare i testi. Puoi nascondere le pagine o riordinare."). Edited blocks show "Modificato in questa raccolta" and **Ripristina testo originale**; if the original changed, "Il testo originale è cambiato" with **Vedi originale** and **Usa originale**. **Pagine:** hide or show the selected page; hidden pages show as a collapsed strip with **Mostra**. |
| Absent | Layout, media, typography, section and About block controls. |
| Top bar | Name (editable), save state, **Esporta** and **Esporta tutto**, Deck 16:9 and PDF A4 only, with progress and the browser download. |
| Follows the originals | Untouched text shows the current approved version and the client's current info; a case study with no approved version shows "Non disponibile" and is left out of exports. |
| **Raccolte** list | Every collection (name, number of case studies, updated, created by); open, rename, delete with confirm. Everyone who can export sees and changes every collection. |


### Users (admin)

| Element | Behaviour |
|---|---|
| List | Name, email, role, added on. |
| Add user | Email + role (one of the three). |
| Change role | Role dropdown in the row; takes effect at the user's next page load. |
| Remove user | Confirm dialog. Their case studies and links stay. |
| Guard | An admin can't remove their own admin role if they're the last admin. |
| Absent | No permission matrix, no guardrail settings, no case study access (NFR3). |

## Export formats [OPEN 1]

The Formats pane, the case study view and export all use **one list with one name per format**, which resolves the 4-versus-7 mismatch in the A3 sketches.

| Option | Formats | Notes |
|---|---|---|
| A. Demo minimum | Deck 16:9 (1920×1080) · Social carousel 4:5 (1080×1350) · PDF A4 portrait | Exactly what the demo has to prove. Smallest template workload. |
| B. A + vertical and square | A + Story 9:16 (1080×1920, static, not video) + Square post 1:1 (1080×1080) | Covers the main social placements. Two more template variants per layout. |
| C. Everything in the A3 deck | B + LinkedIn cover 1200×675 + social video 9:16 + HD PNG pack + ZIP | Video needs motion templates; the highest risk for Oct 30. |

Recommendation: A for the demo, B straight after. Whatever is chosen, each format gets a name, a ratio and a pixel size, and the "Social 16:9" label is retired.

## What counts as altering assets [OPEN 12]

NFR1: the AI doesn't alter graphic assets, technical substance or template design. The design team sets the boundary. The UX guarantees below hold under every option; the open question is which operations go beyond them.

**UX guarantees.** No crop, recolour, filter, retouch, generative fill or upscaling of uploaded media. Media is never stretched. Replace only uses this case study's own material. Shuffle only uses the template's designed variants. Text edits are done by a person.

| Operation | Option A: not altering | Option B: altering unless constrained | Option C: altering |
|---|---|---|---|
| Layout adapts to media count (FR4) | Choosing among designed variants | Allowed only among designer-approved variants per count | Not applicable: FR4 requires it |
| Shuffle | Same as picking a variant | Allowed, limited to approved variants | Removed; owner picks a variant explicitly |
| Replace media | Swaps within own material | Allowed | Allowed (person-driven, not AI) |
| Resize for export formats | Scaling whole, no crop | Fit with letterbox, or a focal point set by the designer | Each format needs designer-supplied media |

## Voice and Tone

Microcopy. Brand voice will live in DESIGN.md once defined.

| Do | Don't |
|---|---|
| "3 blocks still to check." | "Almost there! 🎉" |
| "Add at least one file of project material. The details form alone isn't enough to generate." | "Error: missing input." |
| "Approved. It's now in the library." | "Success!" |
| "Anyone with the link can view." | Hiding who can open a link |
| "Generation didn't finish. Your material and details are saved." | "Something went wrong." |
| Plain verbs, the case study's name, the number of things left. | AI hype ("magic", "instantly"), exclamation marks. |

Never describe generated text as verified until the owner/designer has checked it. The tool says "generated", the person says "checked".

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| First load | Case studies | Skeleton rows or cards matching the layout. |
| Empty, owner/designer | Case studies | "No case studies yet. Start with the material from a closed project." + **New case study**. |
| Empty, account/sales/social | Case studies (library) | "No approved case studies yet." |
| Queue empty | To review | "Nothing to review." |
| No results | Case studies | "Nothing matches '{query}'." + **Clear search and filters**. |
| No material | Wizard step 3 | **Generate** disabled with reason (see wizard). |
| Upload rejected | Wizard step 1 | Inline on the file row; others continue. |
| Generating | Wizard step 3, table row | Processing message; row badge *Generating*; no ETA. |
| Generation failed | Wizard, table row | Back to Draft, banner with **Try again**. |
| Unchecked claims | Configurator | **Approve** disabled with count of blocks left. |
| Text overflow | Configurator | Marker on the block; listed in Check; blocks approval. |
| Autosave failed | Configurator | Save state shows "Not saved. Retrying…"; after 3 failures, a banner: "Changes aren't saving. Keep this tab open." |
| Approved with unpublished edits | Configurator | Banner + **Update approved version** / **Discard changes**. |
| Export in progress | Case study view | Progress on the button; the user can keep browsing. |
| Export failed | Case study view | Toast "Export didn't finish." + **Try again**. |
| Link turned off or expired | Shared link page | "This case study is no longer available." |
| Not permitted | Any surface | Surface absent from navigation; a direct URL returns to the role's landing page. |
| Viewport too narrow | Configurator, wizard | Below 1024px: "The configurator needs a larger screen." Case studies list still works. |

## Interaction Primitives

- **Pointer-first, keyboard-complete.** Every action is reachable by keyboard; mouse is the main mode for designers.
- Configurator shortcuts: `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z` undo and redo (layout, media and text changes); `Esc` ends text editing or closes a dialog; `[` and `]` move between pages; `J` and `K` move between blocks in the Check list; `Space` ticks the selected block.
- Global: `/` focuses search on Case studies.
- Drag and drop: file upload, and swapping media between slots. Every drag has a keyboard or menu alternative.
- Confirm dialogs only for Approve, Update approved version, Delete, Remove user, and Turn off link. Everything else is undoable.
- **Banned:** "approve all", "tick all", bulk approve, auto-approve; any control that changes a guardrail; posting to social channels; infinite scroll (the library paginates at 24 cards); dialogs stacked more than one deep.

## Accessibility Floor

Behavioural. Visual contrast will live in DESIGN.md.

- WCAG 2.2 AA for the app and the shared link page.
- Status is never colour alone: every badge carries its text label.
- Disabled **Generate** and **Approve** expose their reason in text, linked by `aria-describedby`.
- Configurator: the canvas blocks are reachable by Tab in reading order; the Check list is a keyboard-operable list; the claim counter announces changes via `aria-live="polite"`.
- Upload: the dropzone has a **browse** button; upload progress and rejections are announced.
- Focus is visible on every control (`{colors.focus-ring}`); dialogs trap focus and return it on close.
- Shared link page: each slide has its text available to screen readers; pager works with arrow keys.
- Respect reduced motion: no animated transitions between slides or variants when it's set.

## Responsive & Platform

| Surface | ≥1280px | 1024–1279px | <1024px |
|---|---|---|---|
| Case studies, Users, Templates | Full layout | Sidebar collapses to icons | Usable list, read only for owner/designer tasks |
| Wizard, Configurator | Full layout | Configurator panes narrow; right pane can collapse | "Needs a larger screen" message |
| Case study view | Full | Format list collapses to a dropdown | Preview and Share work; export works |
| Shared link page | Full | Full | Fully responsive, swipe between slides |

## Inspiration & Anti-patterns

- **From the A3 sketches (kept):** the three-step wizard, the async "Back to dashboard" generation, the three-pane configurator with Shuffle and Replace media, the formats panel, the read-only export view with pager and zoom.
- **From the A3 sketches (dropped or changed):** MAC Productive entry points; the canvas ratio control; "Save draft" (autosave instead); version number and version history; "Esporta ZIP" as a separate primary; the share icon on the Export button (Export and Share are separate actions).
- **Rejected: confidence scores or "AI verified" labels on claims.** NFR2 is a person's check. The tool doesn't rate claims.
- **Rejected: posting to social channels or a website.** Publishing is a shareable link only (PRD).
- **Rejected: free-form canvas editing** (Canva-style move/resize any element). It would let the template design drift (NFR1).

## Key Flows

### Flow 1: First case study for the demo (Giada, owner/designer, Oct 30 dry run)

1. Giada signs in and lands on Case studies. She clicks **+ New case study**, enters the project name and picks the client. The code appears in the header.
2. **Material:** she drags in 14 files (final screens, the strategy deck as PDF, a results sheet, two videos). While they upload she stars the two key screens as favourites. One 140 MB video is rejected; she leaves it out.
3. **Details:** she writes three short paragraphs: context, solution, results ("3 of 3").
4. **Generate:** she presses **Generate**, sees "Generating your case study…", and goes back to Case studies. The wait doesn't count toward her hands-on time (NFR4).
5. A toast says "{Name} is ready to review." She opens it from **To review**. The configurator shows the 16:9 deck.
6. She switches to the Check tab and opens the material drawer. She ticks blocks one by one, looking up each claim. One KPI tile says "+40% conversions"; the results sheet says 34%. She edits the tile and ticks it.
7. She presses **Shuffle layout** once on the cover, prefers it, then checks the carousel and the A4 formats.
8. **Climax:** the counter reaches "All blocks checked", **Approve** turns on, and she confirms. The badge turns Approved, the toast says "Approved. It's now in the library." About 14 minutes of hands-on time, with every claim checked.

Failure: generation fails → the case study is back in Draft with "Generation didn't finish. Your material and details are saved." She presses **Try again** without re-uploading.

### Flow 2: A case study for tomorrow's pitch (Daniele, account/sales/social)

1. Daniele has a pitch with a utility company tomorrow. He signs in and lands on the library.
2. He types "energy" and filters by industry (an industry filter stays out of the MVP library; SCP 2026-10-19); three cards remain. He opens the first.
3. The case study view shows the 16:9 deck; he pages through it, then switches to the carousel.
4. He presses **Export**, deck selected, and gets the PDF for his slides.
5. He presses **Share**, keeps "16:9 deck", and the link is copied. The dialog says "Anyone with the link can view."
6. **Climax:** he pastes the link into his follow-up email draft and opens it once to check: the hosted deck opens full screen with no login, exactly as the client will see it. Under a minute from search to link.

Failure: nothing matches → "Nothing matches 'energy'." He clears filters and browses by year.

### Flow 3: Fixing an approved case study that's already out (Giada, a week later)

1. Daniele tells Giada the client's name is misspelled on slide 3.
2. Giada opens the Approved case study. The banner reads "Approved, with 2 live links. Changes go live when you update the approved version."
3. She fixes the name; the block unticks; she checks it against the material and ticks it again.
4. **Climax:** she presses **Update approved version**, confirms "2 links will show the new version", and the fix is live everywhere. The status never left Approved.

### Flow 5: A custom case for a pitch (Daniele, account/sales/social)

1. Daniele selects four approved case studies in the library, two of them for Lumen, and presses **Crea raccolta**. He names it "Pitch energia".
2. The collection configurator shows Lumen's intro in front of its two case studies, grouped, and the other two with their own intros.
3. He hides a gallery page he doesn't need and moves the Lumen group to the end.
4. **Climax:** he presses **Esporta**, keeps the 16:9 deck, and gets one PDF. A week later he reopens "Pitch energia" from **Raccolte**, adds one case study and exports again.

### Flow 4: Giving Daniele access (Alessandro, admin)

1. Alessandro signs in and lands on Users.
2. **Add user**: Daniele's email, role account/sales/social.
3. **Climax:** Daniele appears in the list with his role. When Daniele signs in, he lands in the library and sees only approved case studies. Alessandro sees no case study content and no permission settings, because there aren't any.

## Conflicts and open questions

**Conflicts flagged for the PRD owner (not resolved here):**
- **C1. Live edits vs the claim check.** PRD Story 4.3 has edits to an approved case study update its links while it stays approved. If edits go live immediately, unchecked text can reach clients (NFR2, NFR7). Proposed: staged edits with **Update approved version** (see Configurator).
- **C2. Text editing missing from the sketch.** FR5 requires text editing; the A3 configurator sketch has no text controls. This spine follows the PRD (in-place text editing).
- **C3. Notifications, autosave and versioning** appear in the sketches but in no FR. This spine adds an in-app toast and autosave (needed for the time budget and to avoid losing work) and leaves out versioning and email.
- **C4. Template maintenance** is in the role permissions (Story 6.2) but in no FR; the sketch marks it "SOON". Proposed MVP scope above; recommend its own FR.
- **C6. Tags replaced by favourites (2026-10-13). Resolved 2026-10-14 by the owner** ([Sprint Change Proposal](../../sprint-change-proposal-2026-10-14.md)): favourites per AD-14 (`asset.is_favourite`, images and videos only); no taxonomy; library facets are Client and Year. Original note: The owner wants no tags, properties or flags on deliverables, only a favourite mark on images and videos. FR2 and Story 2.9 require tags, properties and flags from a fixed list (2.9 backend merged, #19; OP 3 seed due 2026-10-14). Favourites exist in no FR or story. The library's tag facets and card tags (Case studies: library view) also depend on tags; that view isn't changed here. Route: `bmad-correct-course`.
- **C7. Pasted text moved to Details (2026-10-13). Resolved 2026-10-14 by the owner:** Details text is not material (NFR6 unchanged); generation needs at least one uploaded file; Story 2.8 is repurposed to retire pasted text. Original note: The owner wants text entered in step 2, not pasted in step 1. Story 2.8 / AR6 count pasted text as material (it can unlock generation, backend merged, #18); FR2 / NFR6 say the details form never counts as material. The PRD owner decides whether step-2 text counts as material. Route: `bmad-correct-course`.
- **C8. No undo on file removal (2026-10-14). Resolved 2026-10-14 by the owner:** removal is immediate; soft delete stays; the restore backend is removed. Original note: The owner wants removal without the Undo toast. Stories 2.7 and 2.8 specify soft-delete with a 5 s **Undo** toast. Soft-delete can stay in the backend; the UI drops the toast. Route: `bmad-correct-course` with C6 and C7.
- **C9. Readable case code. Resolved 2026-10-15 by the owner** ([Sprint Change Proposal](../../sprint-change-proposal-2026-10-15.md)): people see a code such as `LUM-2026-01` (client code, year, number) instead of the uuid; the uuid stays in URLs and keys (spine AD-21).
- **C10. Client as a record. Resolved 2026-10-15 by the owner:** every case study belongs to one client record; free-text clients were migrated to records with codes.
- **C11. Clients page. Resolved 2026-10-15 by the owner:** owner/designers list, add and rename clients and open a client's case studies; codes never change and clients can't be deleted.
- **C12. Picking the client. Resolved 2026-10-15 by the owner:** step 0 offers only existing clients; clients are added only on the Clients page.
- **C13. Client info. Resolved 2026-10-16 by the owner** ([Sprint Change Proposal](../../sprint-change-proposal-2026-10-16.md)): clients have a description, sector and logo; every case study shows them in an About the client block and the AI uses them. Amended the same day by the owner: client info is live, so every case study, drafts and approved ones alike, always shows the client's current info, and a replaced or removed logo is deleted. Amended 2026-10-19 by the owner (C20): the sector became industries, and every client field is required.
- **C14. Client intro. Resolved 2026-10-16 by the owner** ([Sprint Change Proposal 2026-10-16, client intro and collections](../../sprint-change-proposal-2026-10-16-client-intro-and-collections.md); before the demo, owner amendment the same day): adding a client asks for 2–3 images; the AI drafts the client's intro pages, which the owner/designer refines, checks and approves like a case study. Amended 2026-10-19 by the owner (C19): adding a client is a wizard, and its material step takes up to 3 files, at least 2 of them images.
- **C15. Client page.** Confirmed 2026-10-16: the client page lists its case studies and creates new ones (already built).
- **C16. Client overview. Resolved 2026-10-16 by the owner** (before the demo): **Modifica cliente** opens the intro and every case study as one preview; editing there edits the case study itself. Until Story 4.12, **Modifica cliente** opens the client wizard (C19).
- **C17. Downloads. Resolved 2026-10-16 by the owner** (before the demo): approved case studies download from the library; account/sales/social also download a client pack (approved intro plus approved case studies) from a read-only Clients list.
- **C18. Collections. Resolved 2026-10-16 by the owner** (before the demo): named, saved collections of approved case studies, reorderable, with hidden pages and text edits that apply only to the collection; a client with 2+ case studies gets its intro in front, grouped. Open point 15 resolved: only owner/designers edit collection text (IR-COLL-EDIT). Assumption: "PM" means an owner/designer.
- **C19. Add client wizard. Resolved 2026-10-19 by the owner** ([Sprint Change Proposal 2026-10-19](../../sprint-change-proposal-2026-10-19.md)): **Aggiungi cliente** opens a full-page wizard like a case history: **Dettagli**, **Materiale** (up to 3 files of any material type, at least 2 images), then **Introduzione**, the intro in the configurator to preview and edit. Step 3 is designed with the owner first and stays hidden until then.
- **C20. Client fields. Resolved 2026-10-19 by the owner:** Nome, Settore (pills, multiselect, at least one, from a fixed list: *Interior design, Energia, Risorse umane, Lusso*, replacing the free-text sector), Descrizione (up to 400 characters), Logo (PNG, JPEG, WebP or SVG; an SVG with script or external links is refused with "Il file SVG non è sicuro: contiene script o collegamenti esterni."; owner, 2026-10-19), and Contesto, Soluzione and Risultati (up to 5000 characters each). All are required.
- **C5. Brief vs PRD:** the brief limits export to account/sales/social and puts the hallucination target on "caught in review". The PRD (both roles export; zero reaching approved) wins; noted only.

**PRD open points with options above:** [OPEN 1] export formats · [OPEN 8] status lifecycle · [OPEN 11] link access · [OPEN 12] what counts as altering. **[OPEN 14]** what a favourite means for generation. [OPEN 3] taxonomy resolved 2026-10-14: dropped.

**UX questions resolved (2026-10-08):**
- **Q1.** UI language: Italian.
- **Q2.** Deck export: PDF only, no PPTX.
- **Q3.** The tool does not record hands-on time. The 8-week measures ([OPEN 13]) are captured outside the tool; no timer or time-tracking UI.
- **Q4.** Details form fields (Context, Solution, Results) are optional.
