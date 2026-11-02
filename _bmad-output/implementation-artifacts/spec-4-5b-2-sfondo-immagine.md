---
title: 'Story 4.5b-2: Sfondo · Immagine'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '02dbef2dff6885b833e5d0c8062c83e4686bd502'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sfondo's **Immagine** button in the left panel is still an inactive "Arriva presto": a page or block can only take a colour, though the document and the renderer already draw an image background (`{ kind: "image", assetId }`).

**Approach:** Make **Immagine** work as in the mockup (`bgTools`, `wireBgTools`): it shows a grid of the case's images (no videos); picking one makes it the background of the selected block, else of the page in view; **Togli immagine** and **Tinta unita** put back the default colour (page white, block `#EDEDF0`). Each change is one undo step, saved through the autosave, in the format in view. Only the case's images for now: client images come with the client-file soft delete (owner, 2026-11-02). Split from Story 4.5b at the owner's choice (2026-10-30).

**Decisions:** case images only (owner, 2026-11-02); the colour field and swatches hide while the image grid shows (mockup); a case with no images says so in the grid's place; inactive with "Arriva presto" when the case isn't editable, as the rest of Sfondo.

</frozen-after-approval>

## Implementation Notes

- Implemented directly in the session. Changed: `left-panel.tsx` (`BackgroundImage`, `ImageTile`), `it.ts`, `configurator.test.tsx` (two 4.4a tests updated: the colour field hides on the image grid, and Immagine is no longer "arriva presto").
- The open image grid is local UI state keyed by format, page and block, so it closes when the selection moves; Tinta unita on a colour background only closes it (nothing saved).
- Picking calls the existing `onBackground` → `setBackground` (one undo step); the server guardrail already accepts the case's live files; the renderer already draws image backgrounds.
- **Togli immagine** shows whenever the background is an image, even when its file is no longer listed.

## Review Triage Log

| # | Finding | Verdict | Route / evidence |
|---|---------|---------|------------------|
| 1 | Image grid stays open after the selection moves | medium | patch: keyed by format/page/block; test added |
| 2 | Togli immagine hidden when the case has no images (background on a deleted file) | medium | patch: shown whenever the background is an image; test added |
| 3 | Expired thumbnail URLs show empty tiles | low | patch: per-tile fallback to the icon, as the Media tab |
| 4 | "Arriva presto" names Immagine or Sfondo depending on the control | low | patch: the grid's controls say Immagine; test added |
| 5 | Missing tests (selection change, locked image background, …) | low | patch: tests for the main ones; the rest are covered by the shared helpers' tests |
| 6 | Spec unfinished | false | it is finalized at this step |
| 7 | Grid has no height limit | low | patch: `max-h-56` with its own scroll |
