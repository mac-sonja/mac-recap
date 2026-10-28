---
title: 'Story 3.5: one renderer per format (Presentazione, Carosello, Video)'
type: 'feature'
created: '2026-10-28'
status: 'in-progress'
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
- [ ] `templates/types.ts` -- render input types.
- [ ] `mac-case/v1/render/*` and `v1/index.ts` -- the three renderers.
- [ ] `rendering/overflow.ts`, `templates/index.ts`, `rendering/index.ts` -- overflow helper and public API.
- [ ] `templates/render.test.tsx` (happy-dom where needed) -- I/O matrix, element coverage, SSR hydration, snapshots; `hashes.json` regenerated.
- [ ] `sprint-status.yaml` -- 3.5 to review; note composeParts split.

**Acceptance Criteria:**
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass.

## Design Notes

The star sits as the mockup's `.page-deco` (inset 10.9% -20.6% -24.2% 39.1%). Fonts: `font-family: Inter, sans-serif`; embedding Inter for exports is Epic 5. Video room for Instagram's bar is the template's info block `paddingTop: 220` (3.4).

## Verification

**Commands:**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` -- expected: pass
