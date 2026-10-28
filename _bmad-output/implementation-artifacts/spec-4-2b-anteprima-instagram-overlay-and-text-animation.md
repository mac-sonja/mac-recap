---
title: 'Story 4.2b: Anteprima, the Instagram overlay and Animazione testi'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_commit: 'f0da7b8e633115532516dfa86b5155d4972647c9'
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
- [x] `src/shared/i18n/it.ts`, `it.test.ts` -- strings.
- [x] `styles.ts` -- preview widths.
- [x] `instagram-overlay.tsx` -- Reel and Storia markup, case name caption.
- [x] `slideshow.tsx` -- frame, ‹ ›, dots, caption, overlay slot.
- [x] `canvas.tsx` -- preview mode, meta row, `animateTexts`.
- [x] `top-bar.tsx` -- eye/pencil.
- [x] `configurator.tsx` -- state, panels, keys.
- [x] `configurator.test.tsx` -- every matrix row, reduced motion, Esc inside Cerca still not leaving the editor.
- [x] `sprint-status.yaml` -- 4.2 note: 4.2b in review; `deferred-work.md` -- mark the 4.2b entry done.

**Acceptance Criteria:**
- Given Story 4.2's Anteprima, Instagram and Animazione testi criteria in `epics.md` (texts not editable, per the decisions), when checked on the running page, then each is met.
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass.

## Implementation Notes

- Owner (2026-10-28): subagents may be used for this story's review step.
- Baseline moved from 653c9a1 (4.2a head at planning) to f0da7b8 after #113 and #114 merged into main, so the diff holds 4.2b only.

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Esc does nothing while the Animazione testi checkbox has focus (edge) | low | `typing()` matches every `input`, checkboxes included | patch |
| 2 | Alt/⌘/Ctrl + ← → step the slideshow while the browser navigates (edge) | low | Keydown handler checks no modifier | patch |
| 3 | ‹ › at an end becomes `disabled` and drops focus to body (edge) | low | `disabled` on the focused button blurs it | patch |
| 4 | Esc from a slideshow or Instagram button drops focus to body (edge) | low | Those buttons unmount when Anteprima closes | patch |
| 5 | Slideshow scroll sets the page in view to the slide (edge) | false | That is the page being looked at; the next editor scroll re-measures; the page tools are inactive | reject |
| 6 | Format switch in Anteprima drops the held selection (edge, claim) | false | A format switch clears the selection in the editor too (4.2a); the old selection names another format's page | reject |
| 7 | Eye's label changes while `aria-pressed` toggles (blind) | low | Required by the spec and the mockup (`#previewBtn`); changing it edits the spec | reject |
| 8 | ← → don't `preventDefault`; canvas may scroll sideways (blind) | low | Handler steps without preventing the default | patch |
| 9 | Reduced motion doesn't stop the text loop in Anteprima (blind) | false | Renderer CSS `@media (prefers-reduced-motion:reduce){.mr-vin{animation:none}}` (`css.ts:138`) | reject |
| 10 | Reduced motion read once on entering Anteprima (blind) | low | A change mid-slideshow is rare; a listener adds a hook | reject |
| 11 | "Texts editable with 4.3" tracked nowhere (blind) | low | deferred-work marks 4.2b resolved; 4.3's sprint note doesn't say it | patch |
| 12 | Entering or leaving Anteprima loses the place on the canvas (blind) | low | Presentazione widens to 1600 px and the stacked pages remount with the old `scrollTop` | patch |
| 13 | Slideshow flag computed twice; zero pages (blind) | low | Zero pages unreachable with template pages (4.2a #21) | reject |
| 14 | Overlay `<style>` re-inserted per slide, global `.ig*` classes (blind) | low | Negligible cost; `ig-` names used only here | reject |
| 15 | `VIDEO_FRAME_WIDTH = 1080` duplicates a registry value (blind) | low | Instagram sizes follow the published 1080 px; `getFormat("video_9_16").pixelSize.width` is exported | patch |
| 16 | Slideshow buttons don't advertise ← → (blind) | low | No `aria-keyshortcuts`; a direct attribute | patch |
| 17 | Slide width collapses below ~250 px of height (blind) | low | The configurator needs ≥1024 px wide; such heights don't occur | reject |
| 18 | TopBar JSDoc line not re-wrapped (blind) | low | One ~150-character line | patch |
| 19 | "keeps the arrow keys away from the editor" cannot fail (gap) | low | `togglePreview` resets the slide on entry, so the assertion holds even without the guard | patch (test) |

## Verification

**Commands** (Node 24: `export NVM_DIR=/opt/nvm; . /opt/nvm/nvm.sh; nvm use 24`):
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` -- expected: pass

**Manual checks:**
- Playwright screenshots, light and dark: Presentazione Anteprima; Carosello slideshow; Video with Reel and with Storia; Video editor with Animazione testi off.
