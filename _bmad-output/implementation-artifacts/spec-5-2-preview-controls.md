---
title: 'Story 5.2 (part): pager, zoom and full screen on the approved case page'
type: 'feature'
created: '2026-10-29'
status: 'in-review'
baseline_commit: 'fe0e315eedd0185e794e83e38688728ef7a2ddf8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** UX-DR21 and Story 5.2 ask for a pager, zoom −/100%/+, fit and full screen on the approved case page. Today Presentazione's preview is a stack of slides you scroll through. Carosello and Video page one slide at a time, but have no zoom and no full screen.

**Approach:** On the approved case page, every format shows one slide at a time in the preview panel. A toolbar holds the format switch, zoom and full screen; a pager sits under the slide. Full screen shows only the slides, like presenting.

**Decisions (owner, 2026-10-29):**
- **Pager:** Presentazione pages like Carosello and Video: ‹ ›, dots, "{i} di {n} · {name}" and ← →.
- **Zoom:** opens at **Adatta**, where the slide fits the panel. − and + step through 50, 75, 100, 125, 150 and 200% of that fit size. The middle shows the current % and returns to Adatta when clicked. When the slide is larger than the panel, you pan by scrolling.
- **Full screen:** shows only the slide, as big as the screen, on black. ‹ › and the counter fade in when the mouse moves. ← → page, and Esc leaves.

## Boundaries & Constraints

**Always:** The configurator's Canvas, Slideshow and Anteprima behave exactly as now; shared files may only gain exports. Slides are drawn by the same renderer (`renderFormat`, one page at a time), read-only. Switching format goes back to slide 1 and Adatta. Keep the Instagram switch and overlay on Video, the *Bozza di prova* note, reduced motion (no fade), ← → ignored in text fields and dialogs, and the narrow-screen message. Italian copy only from `it.ts`. Follow the mac-recap-ui house rules.

**Never:** No changes to the configurator. No dropdown at 1024–1279 px and no preview below 1024 px (next spec). No pinch or wheel zoom, no thumbnails, no URL state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Zoom limits | At 50% or 200% | − or + inactive (`aria-disabled`) | N/A |
| Ends | First or last slide | ‹ or › inactive, keeps focus | N/A |
| No pages | The format has no pages | The canvas's empty line; pager and zoom inactive | N/A |
| No Fullscreen API | `document.fullscreenEnabled` false | No full-screen button | N/A |
| Leave full screen | Esc or the browser's own exit | Back to the panel on the same slide, at Adatta | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(tool)/case-studies/_components/case-view.tsx`: today it renders `Canvas` with `preview`, the slide state and the ← → handler. Replace that with a new `CaseViewer`, and remove `FormatSwitch` from above the panel, since it moves into the viewer's toolbar. The ← → handler now pages every format.
- New file `src/app/(tool)/case-studies/_components/case-viewer.tsx`, a client component.
  - **Panel:** the same as today, `h-[calc(100dvh-16rem)] min-h-[560px]`, bordered and rounded.
  - **Toolbar row:** `FormatSwitch`; the Instagram switch on Video; zoom −, %, +; full screen.
  - **Stage:** `overflow-auto`, centering the slide. Fit width is `min(stageW − 2·pad, (stageH − 2·pad) · w/h)`, measured with `ResizeObserver` and taking the aspect from the format's `pixelSize`. The slide width is fit × zoom.
  - **Pager row:** ‹ ›, dots and the counter, styled like `Slideshow`'s `NAV`.
  - **Full screen:** `requestFullscreen` on the viewer root. Listen to `fullscreenchange` to switch layout: black, controls auto-hiding after ~2 s still (always visible with reduced motion), and zoom reset to Adatta.
- `src/app/(wizard)/_components/configurator/canvas.tsx`: export `RenderedPage` and `InstagramSwitch` unchanged.
- `src/app/(wizard)/_components/configurator/slideshow.tsx`: reuse its `NAV` button style (export it) and the counter copy `it.configurator.preview.slide`, previous and next.
- `src/app/(wizard)/_components/configurator/instagram-overlay.tsx`: `InstagramOverlay` goes over a Video slide.
- `src/modules/rendering`: `getFormat(formatId).pixelSize` gives the aspect (the module index exports it).
- `src/shared/i18n/it.ts`: add to `caseView.viewer`: `zoomOut` "Riduci", `zoomIn` "Ingrandisci", `zoom` "{n}%", `fit` "Adatta" (the %'s accessible name: "Zoom {n}%, torna ad Adatta"), `fullscreen` "Schermo intero", `exitFullscreen` "Esci dallo schermo intero".

## Tasks & Acceptance

**Execution:**
- [x] Add the exports in `canvas.tsx` and `slideshow.tsx`, with no behaviour change.
- [x] Write `case-viewer.tsx` and its test: paging and the ends, the dots and counter, zoom steps and limits, clicking the % to return to Adatta, a format change resetting slide and zoom, the Instagram overlay on Video, the trial note, the empty format, full screen entering and leaving (stubbed API), and hiding the button without the API.
- [x] Wire `case-view.tsx` and update its test: the viewer replaces `Canvas`, and ← → page Presentazione too.
- [x] Add the `it.ts` copy.
- [x] Planning: update the 5.2 note in `epics.md` (pager, zoom and full screen built) and mark the deferred-work entry resolved.

**Acceptance Criteria:**
- Given an approved case's Presentazione, when I press → twice, then the third slide shows and the counter reads "3 di N · {name}".
- Given + pressed twice, when I click the %, then the slide is back at Adatta.
- Given full screen, when I press →, then the next slide shows filling the screen; Esc returns to the page.
- Given the configurator's Anteprima, when I use it, then it looks and works exactly as before.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: all pass

**Manual checks:**
- In a browser at 1280 and 1440 px, light and dark: the slide fits at Adatta for all three formats, the zoomed slide pans, and full screen presents.
