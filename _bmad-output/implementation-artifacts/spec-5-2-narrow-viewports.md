---
title: 'Story 5.2 (part): the approved case preview at 1024–1279 px and below 1024 px'
type: 'feature'
created: '2026-10-29'
status: 'draft'
baseline_commit: 'f393f196970821069d921a08589944b410bedc99'
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

- `src/app/(tool)/case-studies/_components/case-viewer.tsx` -- the viewer from #124.
  - Toolbar: render `FormatSwitch` from `xl:` up. Below that, add a `FormatSelect`: a native `<select>` with an `sr-only` label, styled like the Clienti sort (`clients-table.tsx`, the `<select>` with the `ChevronDown` icon).
  - Below `lg`, hide the zoom group.
  - The panel is `h-[calc(100dvh-16rem)] min-h-[560px]`. Below `lg` it becomes auto height. The slide fills the stage width (`w-full`, with no fit measuring), and the stage gets no `overflow-auto`.
  - Below `lg` swipe works through pointer events on the stage (`pointerdown`/`pointerup`, threshold 40 px, more horizontal than vertical). Add `touch-action: pan-y` so a vertical drag still scrolls the page.
  - Detect narrow vs wide with a `matchMedia("(min-width: 1024px)")` subscription (`useSyncExternalStore`, as `useReducedMotion` in `case-view.tsx` does). The server snapshot is wide.
- `src/app/(tool)/case-studies/_components/case-view.tsx` -- remove the `lg:hidden` narrow-screen message and the `hidden lg:flex` wrapper, so the viewer renders at every width. The ← → handler is unchanged.
- `src/app/(wizard)/_components/configurator/top-bar.tsx` -- `FormatSwitch`. Leave it alone; read `FORMATS` and `it.configurator.formats` from it for the options (`{name} · {ratio}`).
- `src/shared/i18n/it.ts` -- add `caseView.viewer.format`: "Formato" (the select's label). Remove `caseView.narrowScreen` if nothing else uses it.

## Tasks & Acceptance

**Execution:**
- [ ] `case-viewer.tsx` and its test: the select changes the format (slide 1, Adatta); the narrow layout has no zoom, a full-width slide and swipe (threshold, direction, ends, vertical ignored); the wide layout is unchanged. Stub `matchMedia` for both.
- [ ] `case-view.tsx` and its test, plus `[caseId]/page.test.tsx`: no narrow-screen message; the viewer renders at every width.
- [ ] `it.ts` copy.
- [ ] Planning: update the 5.2 note in `epics.md` (narrow viewports built; Share and a working Export are left, in 5.3–5.5), mark the deferred-work entry resolved, and move 5.2 in sprint-status to `review`, since this was the last part.

**Acceptance Criteria:**
- Given a 1100 px window, when the page loads, then the format is a dropdown and the toolbar fits on one line.
- Given a 390 px phone, when I swipe left on the slide, then the next slide shows and the counter updates.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: all pass

**Manual checks:**
- In a browser at 390, 800, 1100 and 1440 px: the dropdown at 1100, the full-width slide, swipe on touch, no horizontal page scroll.
