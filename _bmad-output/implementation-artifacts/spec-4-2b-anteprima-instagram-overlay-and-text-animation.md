---
title: 'Story 4.2b: Anteprima, the Instagram overlay and Animazione testi'
type: 'feature'
created: '2026-10-28'
status: 'ready-for-dev'
baseline_commit: '653c9a1c483fb3f83ddf2d4515cad5ef88488d4d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 4.2a's configurator shows each format's pages as an editor, but not as they will look once published: there is no Anteprima, no way to see where Instagram's interface sits over a Video, and Video's text loop never stops while working on a page.

**Approach:** On the 4.2a frame, add the top bar's **Anteprima** eye (C37): the same canvas without editing tools, Presentazione stacked, Carosello and Video as one social-style slideshow; in Anteprima on Video, the Nessuna / Reel / Storia switch draws Instagram's interface over the page (C34); in the editor on Video, the **Animazione testi** switch above the pages. Split from Story 4.2 by the owner (2026-10-28).

**Decisions (owner, 2026-10-28):**
- Texts are not editable in Anteprima yet: Story 4.3 makes them editable in the editor and in Anteprima together, so nothing typed is lost.
- The spec stays whole (about 1,900 tokens, over the 1,600 target).

## Boundaries & Constraints

**Always:**
- The mockup `ux-designs/ux-MAC Recap-2026-10-08/mockups/configurator.html` is the reference (CSS lines ~91–118, 293–296, 397–429; JS `igOverlay`, `renderCanvas`, `setPreview`, `stepSlide`, keydown at ~731). Tool UI on `globals.css` tokens (mac-recap-ui); pages only from the Story 3.5 renderer.
- The eye sits right of the format switch, `aria-pressed`; in Anteprima it becomes a pencil labelled "Torna all’editor". Esc in Anteprima goes back to the editor (not a selection step).
- Anteprima: both panels and their reopen buttons hidden; the format switch stays and works; section labels and page labels stay for Presentazione at 1600 px width; no selection frames, clicks select nothing; the selection held before entering is kept and shows again on return.
- Carosello and Video slideshow: one page at a time as big as the screen allows (mockup `.social-frame`), ‹ › buttons (disabled at the ends), dots, "{i} di {n} · {page name}", ← → keys. Entering starts at the selected page, else the first; switching format starts at the first page.
- Instagram overlay: Video in Anteprima only, **Nessuna** by default; Reel and Storia as in `igOverlay`, account `mac.creativetech`, friends' photos and counts blanked, the case name as the Reel caption, `aria-hidden`, pointer-events none. Drawn by the configurator over the rendered page, never by the renderer.
- Animazione testi: Video editor only, on by default; off renders with `options.animateTexts: false`. Anteprima always animates. Reduced motion: never animates (the renderer's own rule) and the slideshow switches without transition.
- Strings in `it.ts`, pinned in `it.test.ts`; light and dark checked.

**Never:**
- No change to `src/modules/**`, `src/worker`, `package.json` or migrations.
- No text editing (in the editor or Anteprima), saving, undo/redo or approval (4.3, 4.8); no keyboard selection of blocks (deferred).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enter on Presentazione | eye pressed | panels gone, pages stacked at 1600 px, pencil "Torna all’editor" | N/A |
| Enter on Carosello, page 3 selected | eye pressed | slideshow on page 3, "3 di n · name" | N/A |
| Slide ends | first / last page | ‹ / › disabled; ← / → do nothing | N/A |
| Format switch in Anteprima | Video → Presentazione | stays in Anteprima, stacked pages | N/A |
| Reel / Storia | Video, Anteprima | overlay over the page; Nessuna removes it | N/A |
| Leave | Esc or pencil | editor, panels as before, selection back | N/A |
| Animazione testi off | Video editor | texts still; thumbnails unchanged | N/A |
| Single page | format with one page | both buttons disabled, one dot | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(wizard)/_components/configurator/configurator.tsx` -- add `preview`, `slide`, `ig` (`"off" | "reel" | "story"`), `textAnim` state; panels and reopen buttons not rendered in preview (keep mounted with `hidden` like today); keydown: in preview Esc leaves, ←/→ step on non-Presentazione; `pickFormat` resets `slide` to 0.
- `top-bar.tsx` -- `preview`, `onPreview` props; eye/pencil (`lucide-react` `Eye`, `Pencil`) in the centre group after the format switch, `ICON_BUTTON`-style with pressed look (`bg-primary text-primary-foreground` per mockup `#previewBtn[aria-pressed]`).
- `canvas.tsx` -- `preview`, `animateTexts` props. `RenderedPage` passes `options: { startPage, animateTexts }` (memo key includes it). In preview: `CanvasPage` skips frames and `onSelect`; trial note stays. New `slideshow.tsx` for Carosello/Video preview; new `instagram-overlay.tsx` (mockup markup, sized in the page's frame units via `cqw`, as the renderer's `--u`). The meta row above the pages (Instagram switch / Animazione testi) lives in `canvas.tsx`.
- `styles.ts` -- `PREVIEW_WIDTH` (Presentazione `max-w-[1600px]`), slideshow frame widths (`w-[min(760px,calc(100dvh-250px),calc(100vw-200px))]`, Video `w-[min(460px,calc((100dvh-250px)*9/16))]`).
- `src/modules/rendering/templates/mac-case/v1/render/video.tsx` -- read only: `options.animateTexts === false` stops the loop; thumbnails already `still`.
- `src/shared/i18n/it.ts` + `it.test.ts` -- `configurator.preview.*` (Anteprima, Torna all’editor, Pagina precedente/successiva, "{i} di {n} · {name}", Anteprima Instagram, Nessuna, Reel, Storia, Segui, Per te, Amici, Invia messaggio…, "9 min"), `configurator.textAnimation`.
- `configurator.test.tsx` -- happy-dom tests next to the 4.2a ones.

## Tasks & Acceptance

**Execution:**
- [ ] `src/shared/i18n/it.ts`, `it.test.ts` -- strings.
- [ ] `styles.ts` -- preview widths.
- [ ] `instagram-overlay.tsx` -- Reel and Storia markup, case name caption.
- [ ] `slideshow.tsx` -- frame, ‹ ›, dots, caption, overlay slot.
- [ ] `canvas.tsx` -- preview mode, meta row, `animateTexts`.
- [ ] `top-bar.tsx` -- eye/pencil.
- [ ] `configurator.tsx` -- state, panels, keys.
- [ ] `configurator.test.tsx` -- every matrix row, reduced motion, Esc inside Cerca still not leaving the editor.
- [ ] `sprint-status.yaml` -- 4.2 note: 4.2b in review; `deferred-work.md` -- mark the 4.2b entry done.

**Acceptance Criteria:**
- Given Story 4.2's Anteprima, Instagram and Animazione testi criteria in `epics.md` (texts not editable, per the decisions), when checked on the running page, then each is met.
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass.

## Implementation Notes

- Owner (2026-10-28): subagents may be used for this story's review step.

## Verification

**Commands** (Node 24: `export NVM_DIR=/opt/nvm; . /opt/nvm/nvm.sh; nvm use 24`):
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` -- expected: pass

**Manual checks:**
- Playwright screenshots, light and dark: Presentazione Anteprima; Carosello slideshow; Video with Reel and with Storia; Video editor with Animazione testi off.
