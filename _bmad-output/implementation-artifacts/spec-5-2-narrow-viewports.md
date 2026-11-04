---
title: 'Story 5.2 (part): the approved case preview at 1024–1279 px and below 1024 px'
type: 'feature'
created: '2026-11-03'
status: 'done'
baseline_commit: '3afc6f03a4799c16fd83436e0748e4d48c143402'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 5.2 says the format list becomes a dropdown at 1024–1279 px and the preview still works below 1024 px. Today, between 1024 and 1279 px the viewer's toolbar is cramped: the three-segment format switch, the Instagram switch, zoom and full screen all share one row next to the icon-only sidebar. Below 1024 px the page shows "L'anteprima ha bisogno di uno schermo più grande." instead of the preview.

**Approach:** Below 1280 px, the viewer's format switch becomes a native `<select>`. Below 1024 px, the narrow-screen message is replaced by a simplified viewer:
- the format dropdown;
- the slide fitted to the panel width;
- ‹ › and the counter;
- horizontal swipe to page;
- full screen.

There is no zoom below 1024 px, and the panel height follows the slide.

**Decisions (owner, 2026-10-29):** Below 1024 px only the preview changes. The header, Raccolte, Attività and Elimina stack as they already do, and the shell stays desktop-first.

**Decision (owner, 2026-11-04, on PR #146):** below 1024 px the slide's height is capped at the viewport less the toolbar and pager (`100dvh − 10rem`), so a 9:16 Video shrinks and stays centred instead of running past the screen.

## Boundaries & Constraints

**Always:** Keep everything the ≥1280 px viewer does today, including keys, zoom, full screen, the Instagram switch on Video, the trial note and reduced motion. A dropdown change works exactly like a switch click: slide 1, at Adatta. Italian copy comes from `it.ts` only, and the dropdown reuses the format names with their ratios. Follow the mac-recap-ui house rules (native `<select>` styled like the Clienti sort).

**Never:** No changes to the configurator, the shell, the sidebar or the other sections. No pinch zoom. No swipe at 1024 px and up.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 1024–1279 px | Viewer toolbar | A labelled `<select>` ("Formato") replaces the segments; zoom, Instagram and full screen stay | N/A |
| < 1024 px | Page loads | The simplified viewer shows instead of the message; the slide fits the width with no horizontal scroll | N/A |
| Swipe | Horizontal drag of ≥ 40 px that is more horizontal than vertical, on the slide below 1024 px | Next slide (left) or previous (right), stopping at the ends | A vertical drag scrolls the page |
| Zoom set, then narrowed | Zoomed at ≥ 1024 px, window shrinks below 1024 px | The slide fits the width (zoom ignored); widening again returns to Adatta | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(tool)/case-studies/_components/case-viewer.tsx` -- the viewer (pager, zoom, full screen from spec-5-2-preview-controls). All layout changes go here.
  - Toolbar: wrap `FormatSwitch` in `hidden xl:block`. Add a local `FormatSelect` shown below `xl` (`xl:hidden`): native `<select>` + `ChevronDown`, classes copied from the Clienti sort (`src/app/(tool)/clients/_components/clients-table.tsx:196-208`), `sr-only` `<label>` with `it.configurator.formats.label` ("Formato", already exists), options `FORMATS` from `@/modules/rendering`, text `{it.configurator.formats[id]} · {ratio}`. `onChange` → existing `pickFormat`.
  - Zoom group: `hidden lg:flex`. Instagram switch and full screen stay at every width.
  - Panel (not full screen): `lg:h-[calc(100dvh-16rem)] lg:min-h-[560px]`; below `lg` auto height. Stage: `lg:overflow-auto` + scrollbar gutter only from `lg`, `p-4 lg:p-6`, `touch-action: pan-y` (`touch-pan-y`) below `lg`.
  - `useNarrow()`: `useSyncExternalStore` on `matchMedia("(max-width: 1023.98px)")` (pattern: `useReducedMotion` in `case-view.tsx`), server snapshot `false`.
  - Narrow and not full screen: the slide is `w-full` with no `style.width` (no fit measuring). Full screen keeps measured fit at every width.
  - When `narrow` flips (either way), reset zoom to `FIT` (render-time state adjust, like `shownIndex`).
  - Swipe: `onPointerDown`/`onPointerUp` (plus `onPointerCancel` to clear) on the stage, only while `narrow`; start point in a ref; on up, `dx = x1 - x0`, act when `|dx| >= 40 && |dx| > |dy|`: `dx < 0` → `onStep(1)` unless `atEnd`, `dx > 0` → `onStep(-1)` unless `atStart`. Export `SWIPE_PX = 40`.
- `src/app/(tool)/case-studies/_components/case-view.tsx` -- delete the `lg:hidden` narrow message and the `hidden flex-col lg:flex` wrapper; render `CaseViewer` directly. Update the doc comment. ← → handler untouched.
- `src/app/(wizard)/_components/configurator/top-bar.tsx` -- read-only (Track A's area): reuse `FormatSwitch` as is.
- `src/shared/i18n/it.ts` -- remove only `caseView.narrowScreen` (and its line in `it.test.ts`). No new strings. Leave `caseStudies.narrowScreen` and `configurator.narrowScreen` alone.

## Tasks & Acceptance

**Execution:**
- [x] `case-viewer.tsx` + `case-viewer.test.tsx` -- the toolbar select, narrow layout, zoom reset and swipe as in the Code Map -- tests stub `matchMedia` for wide and narrow: select picks a format (calls `onFormat`, zoom back to 100%); select shows the current format; narrow: slide has no inline width, swipe left/right steps, < 40 px or mostly vertical does nothing, no step past the ends; zoomed then narrowed → `data-zoom` 100; wide: no swipe, existing tests pass unchanged.
- [x] `case-view.tsx` + `case-view.test.tsx` (+ `[caseId]/page.test.tsx` if it asserts the message) -- the viewer renders with no narrow message.
- [x] `src/shared/i18n/it.ts` + `it.test.ts` -- drop `caseView.narrowScreen`.
- [x] Planning -- `epics.md`: append a Note under Story 5.2 (owner, 2026-11-03, spec-5-2-narrow-viewports): the dropdown at 1024–1279 px and the preview below 1024 px are built; Share and a working Export are left to 5.3–5.7. `deferred-work.md`: mark the narrow-viewports entry resolved (as the preview-controls entry above it). `sprint-status.yaml`: only the 5-2 line → `review`, comment updated.

**Acceptance Criteria:**
- Given a 1100 px window, when the page loads, then the format is a dropdown and the toolbar fits on one line.
- Given a 390 px phone, when I swipe left on the slide, then the next slide shows and the counter updates.
- Given a 390 px phone, when the page loads, then there is no horizontal page scroll and no zoom control.

## Implementation Notes

- Review patches (2026-11-04): the slide's width in the panel comes from CSS `max-lg:w-full`; the JS query is `(width < 64rem)`, matching Tailwind's `lg`; swipe tracks one primary left-button pointer, with pointer capture. Tests cover narrow and full screen together and stray pointers.
- Not done: the Playwright checks at 390/800/1100/1440 px. The detail page needs a signed-in session and an approved case from Supabase, which this container doesn't have.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|---|
| 1 | verification-gap | No test is narrow and full screen at once: measured fit and full-screen swipe below 1024 px are unguarded | medium | patch | Pre-verified: no test calls both `stubWidth(true)` and `stubFullscreen()`; dropping `&& !full` stays green. |
| 2 | blind | 9:16 Video below 1024 px is taller than the viewport; pager below the fold | false | reject | The frozen intent chooses it: "the slide fitted to the panel width … the panel height follows the slide". |
| 3 | blind, edge | Before hydration on a phone the slide has neither `w-full` nor an inline width (`fluid` is JS-gated, server snapshot wide) | medium | patch | `fluid` reads `narrow`, which is `false` on the server; `size` is 0, so `slideWidth` is undefined and the class is absent. |
| 4 | blind, edge | Swipe ignores `isPrimary`/`pointerId`/button: a second finger or a right-drag overwrites the start and can page | medium | patch | `swipeStart` stores any pointer; `swipeEnd` never compares ids; a pinch's last `pointerup` can pass the threshold. |
| 5 | blind, edge | No pointer capture: mouse/pen released outside the stage leaves a stale start, so a later `pointerup` pages | low | patch | No capture and no reset besides `pointercancel`; the fix is a one-line capture plus the id check from #4. |
| 6 | blind | `case-view.tsx` doc comment still says "a panel of fixed height" | low | patch | The comment at the `CaseView` doc block; below 1024 px the panel is now auto height. |
| 7 | blind | Swipe gives no visual feedback or hint | low | reject | The intent asks only for swipe to page; adding drag-follow is new behaviour, not a direct fix. |
| 8 | blind | Two-pointer and mouse-drag cases untested; the 390 px criterion is only class-checked | low | patch | Folded into #1 and #4 tests; CSS layout is checked manually (jsdom has no CSS). |
| 9 | blind | `case-view.test.tsx` asserts on `parentElement.className` not containing "hidden", which is brittle | low | patch | Direct correction: assert the viewer renders and the narrow message is absent. |
| 10 | blind | Spec `created` and `baseline_commit` rewritten; Implementation Notes empty; line-number ref in Code Map | false | reject | The fix edits this build's spec; the baseline was recaptured on resume after the old one went stale. |
| 11 | blind | `useNarrow` builds a new `MediaQueryList` each snapshot read | low | reject | Same pattern as `useReducedMotion`; negligible cost, and caching adds module state. |
| 12 | edge | JS query `(max-width: 1023.98px)` disagrees with Tailwind's `lg` (64rem) when the browser's default font size isn't 16 px | medium | patch | Tailwind v4 `lg` is `64rem`; media-query rem follows the browser default font size, px does not. The fix is to use the same rem query. |

## Design Notes

- Layout uses Tailwind breakpoints, not the JS flag, so a phone's first paint is already the narrow layout (the server snapshot is wide). JS `narrow` only gates swipe, the inline slide width and the zoom reset.
- The Instagram switch stays below 1024 px: the intent removes only zoom there, and at 1024–1279 it says Instagram stays.
- Swipe in full screen below 1024 px also works (same stage); the ‹ › stay too.
- `FormatSelect` stays local to the viewer, not in `top-bar.tsx` (Track A owns the configurator).

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: all pass

**Manual checks:**
- Playwright at 390, 800, 1100 and 1440 px, light and dark: the dropdown at 1100 and 800, segments at 1440, full-width slide and no horizontal scroll at 390 and 800, swipe pages at 390.
