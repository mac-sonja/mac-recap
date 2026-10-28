---
title: 'Story 3.5: one renderer per format (Presentazione, Carosello, Video)'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_commit: '7b0f4d29234b8253eb97a63e39c86de80702c812'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-4-templates-pages-layouts-and-default-pages.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.4 gave each format its pages as v2 data (`mac-case@1`), but nothing draws them. The configurator (4.2+), the case study view, shared links and exports (Epic 5) need one implementation per format so the preview the owner approves is exactly what is exported (AR9, CAP-7).

**Approach:** Add to `mac-case@1` one React renderer per format: a pure function of that format's pages, the template, asset URLs and the current bound field values, drawing the bento grid, block backgrounds and every v2 element as the configurator mockup does, with Video's text loop and the four animations. Add a DOM helper that reports overflow per block and page. `composeParts` is split out (owner, 2026-10-28; deferred-work).

## Boundaries & Constraints

**Always:**
- Values come from the mockup `ux-designs/ux-MAC Recap-2026-10-08/mockups/configurator.html` (`renderPage`, `renderBlock`, `renderItem`, `animHTML`, its CSS) and the template's styles; never tool UI tokens.
- Sizes in units of the Figma frame width (1920 / 1000 / 1080): the page is a size container, `1u = 100cqw / frame`. Page margin default: Presentazione 64, Carosello and Video 24; gutter 24; block padding 28; per-page `margin` and per-block `padding`/`paddingTop` override.
- Page: background (colour, transparent, image cover), optional star decoration (lime, as the mockup), grid from `page.grid.rows/cols` and the layout's areas for `grid.layoutId` (unknown id or fewer areas than blocks: blocks fill an even 1-column grid, never crash).
- Block: background (default `#EDEDF0`; image cover with a dark gradient, text white), radius 20u, `ink` sets the default text colour; a block whose only element is an image with `fit: fill` ignores its padding.
- Elements: every v2 type, including the 3.4 amendments: text (style size for the format, or its own `size`; colour, `#rrggbbaa`; align; 2 columns; wraps and grows; a `num` inside a row stays on one line), `binding` and `bindings` (joined " · ") read from the bound values (missing → empty), text_group alignment (top grows and pushes what follows down; centre; bottom; split after `splitAt`), row (centre|top, `wide`), image/video (Riempi cover, Adatta contain, Ritaglia cover positioned by `crop` x/y and scaled by zoom), services as tags, logos (client logo via `<img>`, divider, MAC logo; white on a photo), divider (`colour` or currentColor at 20 %), animation (Carousel 01, 03, 04, Wheel 02; 9:16 cards; three empty cards with no media; Adatta/Riempi; `size` 50–150 %).
- Options: `still` (exports: no animation, videos show their poster), `animateTexts` (Video only, default true), `startPage` (each page carries `data-page-key`, `data-role`, `data-section`, `data-page-number`). Reduced motion stops every animation (CSS media query).
- Video texts come in one after the other on a loop, as the mockup's `.vin`.
- `renderToString` output hydrates on the client with no mismatch (test), and `renderToStaticMarkup` is stable (snapshot).
- `measureOverflow(root)` returns `{ pages: [{ pageKey, overflow, blocks: [{ blockId, overflow }] }] }` from the rendered DOM.
- The v1 folder is not published until #109 merges: adding files there is allowed; regenerate `hashes.json`.

**Never:**
- No data fetching, `useEffect` data loading, or module state in a renderer; no tool tokens or Tailwind classes in template output.
- No configurator UI, Instagram overlay or Anteprima (4.x), no export pipeline or font embedding (Epic 5), no `composeParts`.
- No schema or DB change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Starter pages | each format's starter pages, full context, all assets and values | one page element per page, blocks in layout areas | N/A |
| Missing asset | element asset id not in URLs, or `null` | empty media cell (transparent); no `<img>` with an empty src | N/A |
| Missing value | binding with no bound value | empty text, no crash | N/A |
| No animation media | animation `assetIds: []` | three empty 9:16 cards | N/A |
| Still | `still: true`, a video element | `<img>` of its poster, no animation CSS on tracks or texts | N/A |
| Texts off | Video, `animateTexts: false` | no text animation class | N/A |
| Page numbers | `startPage: 7`, 3 pages | numbers 7, 8, 9 | N/A |
| Overflow | a block whose content is taller than it | that block and its page `overflow: true` | N/A |
| SSR | any input above | hydrates without a mismatch | test failure |

</frozen-after-approval>

## Code Map

- `src/modules/rendering/templates/types.ts` -- add `RenderInput` (`pages`, `assets: Record<assetId, { url, kind: 'image'|'video', posterUrl? }>`, `values: BoundValues`, options) and optional `render` on `TemplateVersion`.
- `src/modules/rendering/templates/mac-case/v1/render/` (new) -- `page.tsx` (page, grid, block), `elements.tsx`, `animation.tsx`, `css.ts` (static stylesheet string: keyframes, container units), `art.tsx` (MAC logo, divider, star as inline SVG from the mockup's `assets/`), `presentazione.tsx`, `carosello.tsx`, `video.tsx`.
- `src/modules/rendering/templates/mac-case/v1/index.ts` -- add `render`.
- `src/modules/rendering/overflow.ts` (new) -- `measureOverflow`.
- `src/modules/rendering/templates/index.ts`, `src/modules/rendering/index.ts` -- export `renderFormat(template, formatId, input)`, `measureOverflow`, types.
- `BoundValues`: `client { name, sector, description, logoUrl|null, results[{label,value}], testimonial{quote,author}|null }`, `case { year, services[], results, testimonial }`.

## Tasks & Acceptance

**Execution:**
- [x] `templates/types.ts` -- render input types.
- [x] `mac-case/v1/render/*` and `v1/index.ts` -- the three renderers.
- [x] `rendering/overflow.ts`, `templates/index.ts`, `rendering/index.ts` -- overflow helper and public API.
- [x] `templates/render.test.tsx` (happy-dom where needed) -- I/O matrix, element coverage, SSR hydration, snapshots; `hashes.json` regenerated.
- [x] `sprint-status.yaml` -- 3.5 to review; note composeParts split.

**Acceptance Criteria:**
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass.

## Implementation Notes

- Implemented by a subagent. `RenderInput` is `{ pages, assets, values, options? }` with `options: { still?, animateTexts?, startPage? }`; `TemplateVersion.render?(formatId, input)`; `renderFormat(template, formatId, input)` throws for an unregistered template or one without a renderer.
- Output: a `div.mr-root` holding one `<style>` (static CSS from `css.ts`, the format's seven text styles generated from `styles.ts`, and the stepped keyframes the pages' Carousel 03/04 need) and one `section.mr-page` per page. Every class is prefixed `mr-`; elements carry `data-element-id`, blocks `data-block-id`.
- Choices the spec left open: shared render helpers live in `render/media.tsx` (context, `Media`, `assetOf`) to avoid an import cycle. A row holding a `num` text is a result row (mockup `.kpirow` widths). A Video block with `paddingTop` gets the mockup's `.vinfo` spacing. A coloured divider (results' lines) uses opacity 1 and margins that reproduce the mockup's kpi gaps per format. A block whose image background is missing renders its default grey without the on-photo styling (its stored white ink stays). Animation loop copies (the seamless repeat) are marked `mr-ac-copy`/`aria-hidden`; with no media, three empty cards plus the loop copy, as the mockup. Empty bound values in `bindings` are left out of the " · " join. The testimonial quote is shown between « » (quotes already present are dropped), as the mockup.
- `measureOverflow` compares `scrollHeight/scrollWidth` with `clientHeight/clientWidth` (1 px slack) on each `[data-block-id]`; a page overflows only when one of its blocks does (its own clipped decoration, e.g. the closing star, is not overflow); measure a render made with `animateTexts: false`. Tested in happy-dom with stubbed sizes (no layout engine).

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Text style rules unscoped: two formats in one document share sizes (blind) | medium | `textStyleCss` emits `.mr-t-*` with no format selector; the last `<style>` wins | patch |
| 2 | Closing page always reported as overflowing (blind, edge) | medium | `overflows(page)` counts the star's negative insets | patch |
| 3 | Video texts mid-loop skew the measure (edge) | low | `.mr-vin` translates texts; callers should measure with texts off | patch (doc) |
| 4 | `measureOverflow(root)` misses a root that is itself a page (edge) | low | `querySelectorAll` excludes root; one-line fix | patch |
| 5 | Unknown `formatId` at runtime gives an opaque React error (blind, edge) | low | Parameter is typed `FormatId`; callers read registry ids | reject |
| 6 | Still video without poster: photo styling over grey, cell not marked empty (edge, gap) | medium | `Media` returns null but block/page background still treated as photo | patch |
| 7 | Page grid track count may differ from the layout's (edge) | low | Grids come from the layout; 4.4's resize keeps the counts | reject |
| 8 | Page photo background keeps dark text (edge) | false | The mockup's `.page-bg` doesn't invert text either | reject |
| 9 | Wheel 02 spins with one or no card (blind, edge) | low | Checks `still` only; direct fix | patch |
| 10 | Quote stripping misses ‘ ’ „ (edge) | low | Users type “ ” or none; adding cases is noise | reject |
| 11 | Video info spacing keyed on any `paddingTop` (edge) | low | `paddingTop: 0` would match; direct fix | patch |
| 12 | Reduced motion doesn't stop autoplay videos (blind, edge) | low | Same as the mockup; videos are media, not CSS animations | reject |
| 13 | Client-record result/testimonial bindings untested (gap) | medium | All tests bind `case` | patch |
| 14 | Still video without poster untested (gap) | low | Only poster videos tested | patch |
| 15 | Empty-value " · " join untested (gap) | low | Only full values tested | patch |
| 16 | Page and width overflow untested (gap) | low | Only one block's height is stubbed | patch |
| 17 | Snapshot file untracked (blind, gap) | false | Committed with the change | reject |
| 18 | `BoundValues` required fields vs defensive reads (blind) | low | No wrong output | reject |
| 19 | Riempi bleed only for images (blind) | low | The mockup's video is an `img` item, so it bleeds too | patch |
| 20 | `alt=""` on every image (blind) | low | No alt or caption exists in the product's media | reject |
| 21 | Global keyframes may collide across template versions (blind) | low | Only `mac-case@1` exists | reject |
| 22 | `startPage` accepts 0 or negative (blind) | low | Callers pass counts from 1 | reject |
| 23 | Spec `in-review` vs sprint `review` (blind) | false | The workflow's spec and sprint vocabularies differ by design | reject |
| 24 | Template without `render` untested (gap, blind) | low | Bug path only | reject |

## Design Notes

The star sits as the mockup's `.page-deco` (inset 10.9% -20.6% -24.2% 39.1%). Fonts: `font-family: Inter, sans-serif`; embedding Inter for exports is Epic 5. Video room for Instagram's bar is the template's info block `paddingTop: 220` (3.4).

## Verification

**Commands:**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` -- expected: pass
