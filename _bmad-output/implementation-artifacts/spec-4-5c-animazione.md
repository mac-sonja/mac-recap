---
title: 'Story 4.5c: Animazione'
type: 'feature'
created: '2026-11-03'
status: 'done'
baseline_commit: 'b63f000003a72cb93274f193ea5767bafcf7a462'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Elementi's **Animazione** is an inactive "Arriva presto", so a page can't get a carousel or wheel of media, though the document (`animation` element) and the renderer (Carousel 01, 03, 04, Wheel 02) already support it.

**Approach:** The "Animazione" dialog (C35, mockup `#anModal`, `openAnim`, `drawAnim`): four live previews of the animations with the chosen media, the case's images and videos picked in order (numbered; a second click takes one out), **Inserisci** (new) or **Salva** (existing) disabled until a file is chosen, with the title "Carica almeno un’immagine o un video". It opens from Elementi · Animazione with a block selected (the animation goes at the end of that block) and, for an existing animation, from **Cambia animazione o media** or a double-click on it. A selected animation's left panel (mockup `renderBlockProps` anim branch) shows **Tipo** (select), the media count, **Cambia animazione o media**, **Adattamento** (Adatta, Riempi) and **Dimensione** 50–150 % (step 5).

**Decisions (owner, 2026-11-03):** case media only (client media with the client-file soft delete); the dialog's drop zone and upload are 4.5c-2 (deferred-work), so the dialog has no drop zone; a new animation is `fit: "fit"`, no `size` (100 %).

## Boundaries & Constraints

**Always:** The app's one `Dialog` (`src/app/_components/dialog.tsx`, `wide`); tokens and voice per `mac-recap-ui`, copy in `it.ts`. Previews draw with the shared renderer (preview equals export). Each insert, save, type, fit change and Dimensione slide is one undo step (a slide grouped by key, as Zoom in 4.5b-3), saved through `useDocument`, in the format in view. Cancel or Esc changes nothing. Only while `editable` and not in Anteprima; otherwise the panel shows its values inactive with "Arriva presto".

**Never:** No upload in the dialog, no client media, no animated page layouts, no new animation types, no renderer or schema change, no migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Insert | block selected, Animazione, Carousel 03, pick B then A, Inserisci | `{type:"animation", animation:"carousel_03", assetIds:[B,A], fit:"fit"}` at the block's end, selected | no block: `needBlock` message, no dialog; block full: `blockFull`, nothing |
| Unpick | A, B picked, A clicked again | order `[B]`, numbering follows | N/A |
| Nothing picked | dialog open, no file chosen | Inserisci/Salva disabled with the "Carica almeno…" title | N/A |
| Edit | double-click or Cambia… on an animation, change type and media, Salva | that element updated in place, fit and size kept | Annulla/Esc: unchanged |
| Panel | Tipo changed; Adatta/Riempi; Dimensione 50–150 | `animation` / `fit` / `size` set; same value again: no step | N/A |
| No media | case has no images or videos | dialog says so in the picker's place | N/A |

</frozen-after-approval>

## Code Map

- `page-editing.ts` -- pure `insertAnimation(pages, pageKey, blockId, {animation, assetIds}, newId)` → `PageEdit` (end of block, `blockFull`, selects it); `withAnimation(pages, pageKey, elementId, patch: Partial<{animation, assetIds, fit, size}>)` → pages itself when unchanged (top-level elements only; reuse `withPage`, `MAX_ELEMENTS_PER_BLOCK`).
- New `animation-dialog.tsx` -- `AnimationDialog({ open, formatId, template, assets, values, files, initial: {animation, assetIds} | null, onSubmit, onClose })`: four option buttons (`aria-pressed`), each a still-false preview: `renderFormat(template, formatId, { pages: [previewPage(el)], assets, values })` in a small box, `previewPage` = a one-block page (white, `grid {layoutId:"column", rows:[1], cols:[1]}`, block transparent) holding the animation; picker of `files` (images and videos; thumbnail, ▶ for video, its order number), "{n} scelti"; actions Annulla and Inserisci/Salva (`disabled`, `title`). State resets each open.
- New `animation-panel.tsx` (pattern of `media-panel.tsx`) -- Tipo `<select>` with the four names, "{n} file", Cambia… button, Adatta/Riempi `SEG`, Dimensione range 50–150 step 5 with "{n} %"; inactive props as `media-panel.tsx`.
- `left-panel.tsx` -- Elementi · Animazione active when editable (calls `onAddElement("animation")`); render `AnimationPanel` for `element.type === "animation"`; pass new props.
- `configurator.tsx` -- dialog state `{ target: {pageKey, blockId} , elementId?: string } | null`; `addFromElementi("animation")` opens it (needs a selected block, else `needBlock`); `requestEdit` on an animation element opens it for editing (it is not a text); submit → `insertAnimation` / `withAnimation` via `applyPageEdit` or `doc.change`; panel handlers (type, fit, size with a gesture key + flush on release, as `mediaDone`).
- `src/shared/i18n/it.ts` (+ `it.test.ts` if it lists them) -- `configurator.animation`: title, lead ("Scegli come scorrono i media. L’anteprima si adatta a quanti ne carichi."), names (Carousel 01, Carousel 03, Carousel 04, Wheel 02), "Dai Media", "{n} scelto/scelti", no-media line, insert, save, cancel, need-media title, panel labels (Tipo, Media "{n} file", Cambia animazione o media, Dimensione).
- Reuse: `ANIMATIONS`, `ANIMATION_FITS` from `@/modules/generation`; `renderFormat`, `ASPECT`; `SECONDARY_ACTION`/`PRIMARY_ACTION`; `fill`.

## Tasks & Acceptance

**Execution:**
- [x] `page-editing.ts` + test -- `insertAnimation`, `withAnimation`; pure matrix rows.
- [x] `animation-dialog.tsx`, `animation-panel.tsx`, `left-panel.tsx`, `it.ts` -- dialog and panel.
- [x] `configurator.tsx` -- wiring.
- [x] `configurator.test.tsx` -- insert (order, saved, one undo step), unpick, disabled Inserisci, edit via double-click and via Cambia… (Salva), cancel changes nothing, panel Tipo/fit/Dimensione (one step per slide), no block selected, no media, inactive when not editable.

**Acceptance Criteria:**
- Given Animazione with a block selected, when I pick media and press Inserisci, then the animation shows on the page with the media in the order picked, and ⌘Z removes it.
- Given a selected animation, when I change Tipo, Adattamento or Dimensione, then the canvas redraws at once and autosave saves it.

## Implementation Notes

- Implemented directly in the session. New `animation-dialog.tsx` (mounted only while open, so each opening starts from `initial`) and `animation-panel.tsx`; `insertAnimation`/`withAnimation` in `page-editing.ts`; wiring in `left-panel.tsx` and `configurator.tsx`.
- Previews: `renderFormat` of a one-block page (template page white, column grid) holding the animation, so they draw with the shared renderer; ids are fixed placeholders (not the system actor's, which a guard test forbids outside `access`).
- A double-click on an animation goes through `requestEdit`, which now opens the dialog for an animation (and says "arriva presto" when not editable).
- The Dimensione slide reuses 4.5b-3's gesture key (`mediaGesture`, moved up with the other refs) and `mediaDone`.
- After review: keys inside the dialog no longer reach the page; a full block is refused before the dialog; picks stop at 30 (`MAX_ANIMATION_MEDIA`); the dialog starts from listed, de-duplicated media; edit previews keep the element's fit and size.
- The 4.3c test that expected Animazione to say "arriva presto" now checks it asks for a block.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route / evidence |
|---|---------|---------|------------------|
| 1 | Keys pressed in the dialog (Backspace, ⌘Z, ⌘V, Esc) act on the page below | medium | patch: the configurator's key handler ignores events inside a `dialog`; test added |
| 2 | Full block refused only after picking media | medium | patch: Elementi · Animazione says `blockFull` before opening; test added |
| 3 | No cap on picks; >30 media fail the schema on save | medium | patch: picker stops at `MAX_ANIMATION_MEDIA` (held to the schema by a test), unpicked tiles disabled |
| 4 | Media no longer listed stay chosen, unremovable; duplicates | medium | patch: the dialog starts from the listed, de-duplicated ids |
| 5 | Edit previews ignore the element's fit and size | low | patch: `initial` carries fit and size into the previews |
| 6 | Previews never checked for the picked media | medium | patch: test asserts the picked image appears in a preview |
| 7 | Tests missing: Esc, Cambia… + Salva as one undo step, full block | low | patch: tests added |
| 8 | Video with a thumbnail has no ▶ marker | low | patch: badge added |
| 9 | Adatta/Riempi order depends on `ANIMATION_FITS`'s order | low | patch: explicit `["fit", "fill"]` |
| 10 | Option group labelled like the dialog | low | patch: labelled "Tipo" |
| 11 | Copy "carichi"/"Carica…" speaks of uploading | low | rejected: the frozen intent quotes "Carica almeno un’immagine o un video" (story AC); the drop zone returns with 4.5c-2 |
| 12 | Four previews share placeholder ids | false | the renderer keys nothing by element id but `data-element-id` (keyframes are named by axis and count) |
| 13 | Preview media inside a `<button>` | low | rejected: the renderer's media carry no controls; still frames would break "live previews" |
| 14 | Page white from a swatch | low | rejected: same template value as 4.4a/4.5b-2 |
| 15 | Dialog reachable in Anteprima | false | the canvas takes no double-click in Anteprima and the left panel is hidden |
| 16 | Salva after the animation was removed meanwhile is silent | low | rejected: needs an undo while the modal is open, which keys can no longer reach (finding 1) |
| 17 | "Dai Media· 1 scelto" runs together | false | `EYEBROW` is a flex row with a gap |
| 18 | Deferred 4.5c-2 says `source_spec: none` | false | split in step 1, before this spec existed (the format asks for `none`) |
| 19 | `it.test.ts` not updated | false | it lists only `configurator.edit`; no new key there |
| 20 | Dimensione keyboard close and Adatta/Riempi soon message untested | low | rejected: same handlers as 4.5b-3's Zoom (tested) and the shared inactive props |
| 21 | Dialog refused by another open Dialog leaves stale state | false | the configurator opens no other Dialog |

## Verification

**Commands:**
- `npm run typecheck` -- no errors
- `npm run lint` -- no errors
- `npm test` -- all pass, including the new tests
