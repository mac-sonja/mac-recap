# UI Flows — MAC Recap MVP

Summary of `EXPERIENCE.md`, which supersedes the A3 sketches (slides 14–23) and wins on any behaviour conflict. Labels are English with the Italian UI label where one exists.

## AS-IS (for reference)

1. Sales or account requests a case study.
2. The PM plans the work.
3. The creative team defines the narrative and deliverables, and produces any missing material.
4. The creative team lays out the case study.
5. Sales uses it.

Material lives on OneDrive (managed by the art director and account) and project timing on Wrike. Which assets to produce is decided case by case, with no standard.

## Surfaces by role

| Role | Lands on | Surfaces |
| --- | --- | --- |
| Owner/designer | Case studies (table) | + New case study wizard, Case studies table (Table / Library toggle), To review queue, configurator, case study view, Templates (scope is conflict C4) |
| Account/sales/social | Case studies (library of approved cases) | Library, case study view |
| Admin | Users | Users only |
| Anyone with a link | Shared link page | One format of one approved case, no app chrome, no download |

A control a role can't use is absent, not disabled. Guardrail controls are shown disabled with the reason.

## Lifecycle labels (OP 8, interim Option A)

Bozza → In elaborazione → Da approvare → Approvato. Shared links are a count on Approvato cases, not a status. There is no path back from Approvato.

## Flow 1 — Create and approve (owner/designer)

1. **+ New case study:** enter name and client; the case is created with its ID and saved as Bozza (CAP-1).
2. **Material:** drop up to 20 files of up to 50 MB; oversized or unsupported files are rejected per file. Optionally mark images and videos as favourite; removing a file is immediate, with no undo (CAP-2).
3. **Details:** Context, Solution, Results, all optional (CAP-3).
4. **Generate:** enabled only once one material file has uploaded; otherwise disabled with the reason. The case moves to In elaborazione, and the user can leave. On failure it returns to Bozza with **Try again** (CAP-4).
5. A toast says the draft is ready; the case appears in **To review**, oldest first (CAP-6).
6. **Configurator:** Formats pane, canvas, and Edit and Check tabs. Edit text in place and adjust layout variant, shuffle, spacing, media, font pairing and text scale per format (CAP-7).
7. **Check tab:** tick each block against the material drawer. Editing a block unticks it. Approve stays disabled while any block is unchecked or overflows ("3 blocks still to check") (CAP-8).
8. **Approve**, confirm, and the case moves to Approvato.

## Flow 2 — Find, export, share (account/sales/social, also owner/designer)

1. The library shows approved cases only, with search, client and year facets (OP 4).
2. The case study view previews each MVP format (OP 1).
3. **Export** the selected format, or **Export all** as one ZIP (CAP-9).
4. **Share:** pick a format; the link is copied, and the dialog states who can open it (CAP-10, OP 11). The link list allows **Turn off link**.

## Flow 3 — Edit an approved case (owner/designer)

A banner shows the number of live links. Edits autosave to a working copy, and links keep showing the approved version. Re-check the edited blocks, then **Update approved version** (links update, the case stays Approvato) or **Discard changes**. This is the interim reading of Story 4.3 (conflict A1).

## Flow 4 — Give access (admin)

Add a user with an email and one role, change a role, or remove a user (their cases and links stay). The admin sees no case content and no permission or guardrail settings.

## Candidate export formats (OP 1)

One list, one name per format, shared by the configurator, case study view and share dialog. There is no canvas-ratio control.

| UX option | Formats |
| --- | --- |
| A. Demo minimum (UX recommends) | Deck 16:9 (1920×1080) · Social carousel 4:5 (1080×1350) · PDF A4 portrait |
| B. A + vertical and square | A + Story 9:16 (1080×1920, static) + Square post 1:1 (1080×1080) |
| C. Everything in the A3 deck | B + LinkedIn cover 1200×675 + social video 9:16 + HD PNG pack + ZIP |

The demo needs at least the deck, a social carousel and a PDF.
