---
title: 'MAC intro and outro pages in Presentazione'
type: 'feature'
created: '2026-11-13'
status: 'in-progress'
baseline_commit: '8d79d3e5e854d87d95c64613781c5081bd9ae02e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Presentazione files have no MAC brand opening and closing. The final designs exist in Figma: the intro is "Our projects" (node 1047:291) and the outro is the company-details page with the "Mac" wordmark (node 1031:218), file `lUcMm0xOxW7Y50M93buTDb`.

**Approach:** Two fixed brand pages that the renderer adds around every Presentazione file. They are not stored in any case or client document. They show read-only in the case and client configurators, the approved-case view and exports. Their texts become editable only in a collection, through the collection's existing text edits.

**Decisions (owner, 2026-11-13):**
- In a collection only the "Our projects" title is editable. Every other MAC text (company name, addresses, P.I., C.F., site, W-Group line) is fixed.
- A collection can hide the MAC intro and outro like any other page.
- Collections never delete a page, they hide it, for every page:
  - The button is **Nascondi** (no "Elimina dalla raccolta").
  - A hidden page leaves the centre preview (no strip in its place).
  - It stays in the right sidebar at lower opacity, with **Mostra** to bring it back.
  - Removing a whole case from a collection is unchanged.
- The approved-case view shows the MAC pages; the library card cover keeps the case's own first page.

## Boundaries & Constraints

**Always:**
- Pixel-match the Figma frames at 1920×1080: radial gradient background, Inter, the lime star (three paths) and the "Mac" wordmark as inline SVG built from the exported paths.
- The pages are code constants with constant UUID element ids, so the collection edits can address them.
- Exports and the configurators draw the same pages. Page numbers and PDF page counts include them.

**Never:**
- Don't change a published template folder (`mac-case/v1`, `mac-client/v1`) or its `hashes.json` entries.
- Don't copy the pages into documents or revisions.
- No editing of these pages outside a collection.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single case | Case configurator, Presentazione | MAC intro, the case's pages, MAC outro; the MAC pages can't be typed into | N/A |
| Client file / pack | 1+ cases, client intro | MAC intro once first, MAC outro once last | N/A |
| Collection | Several clients | MAC intro once first, MAC outro once last; only "Our projects" editable | Any other MAC text: `TEXT_NOT_EDITABLE` |
| Collection hide | Nascondi on any page, MAC pages included | Gone from the centre preview and the export; faded in the sidebar with Mostra | A part's last shown page: existing `COLLECTION_LAST_PAGE` message |
| Other formats | Carosello, Video | Unchanged | N/A |
| Library card | Approved case | Cover is the case's own first page | N/A |

</frozen-after-approval>

## Code Map

- `src/modules/rendering/domain/formats.ts:9,37` -- `presentazione_16_9`, 1920×1080.
- `src/modules/rendering/templates/mac-case/v1/render/{page,art,css}.tsx` -- `FormatRender` emits `section.mr-page` with `data-page-number`; inline-SVG art pattern (`MacLogo`); Inter via `css.ts:40`. Reuse the page shell and classes; don't edit (hash-locked).
- `src/modules/rendering/compose.tsx:87-170` -- `composeParts` / `renderComposed`: add the brand segments here (new slots `brand_intro` / `brand_outro`, only for Presentazione) so client file, pack, collection and single-case export all get them.
- `src/modules/rendering/application/export-source.ts:178-191,296-357,477-571` and `export-handler.ts:154,237-262,340` -- page counts and drawing; single-case export goes through `exportHtml` → `renderComposed(composeParts(...))`.
- `src/modules/rendering/domain/export.ts:28` -- bump `EXPORT_RENDER_VERSION` so cached files re-render.
- `src/app/(wizard)/_components/configurator/{configurator.tsx:450,1457-1500,538-592, canvas.tsx:25-40,166-185}` -- case pages and client-file groups; `requestEdit` must refuse brand pages.
- `src/app/(tool)/case-studies/[caseId]/_components/case-viewer.tsx:409` -- approved-case view.
- `src/modules/rendering/collection-edits.ts:56,62,97,194-265` and `src/app/(tool)/collections/.../collection-file.ts:188-243`, `collection-view.tsx:295-300,583` -- part keys, free-text rule, applying edits.
- `src/modules/collection/application/edits.ts:130-170,279-285` -- `partPages` reads a live revision; it needs a branch for the brand part.
- `supabase/migrations/20261111120000_collection_edits.sql:24-55` -- `part_kind` CHECK in ('case','client_intro'); a new migration widens it to `'brand'`, with a fixed sentinel `part_id`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/modules/rendering/brand/{pages.ts,render.tsx,art.tsx}` -- the two fixed pages (constant ids, texts) and their renderer from the Figma context -- one source for every surface.
- [ ] `src/modules/rendering/compose.tsx` (+ test) -- brand segments first and last in Presentazione; `renderComposed` draws them.
- [ ] Case configurator, approved-case view -- show the brand pages read-only around the case's pages.
- [ ] `supabase/migrations/<ts>_collection_brand_part.sql`, `modules/collection` domain, repo and `edits.ts` (+ tests) -- `brand` part kind for text edits (and hidden pages per Q2).
- [ ] `collection-edits.ts`, `collection-file.ts`, `collection-view.tsx` (+ tests) -- the brand title editable in a collection only.
- [ ] `collection-view.tsx`, `collection-marks.tsx` (`HiddenPageStrip`), the Pagine sidebar component, `src/shared/i18n/it.ts` (+ tests) -- Nascondi / Mostra; no strip in the canvas; hidden pages faded in the sidebar.
- [ ] `library-card.tsx` -- keep the case's own first page as the cover.
- [ ] `export-source.ts`, `export-handler.ts`, `domain/export.ts` (+ tests) -- page counts, hash, render version.
- [ ] `test/permissions.test.ts` -- rows for any new action.

**Acceptance Criteria:**
- Given any Presentazione export, when the PDF is drawn, then page 1 is the MAC intro, the last page is the MAC outro, and the page count check passes.
- Given the case or client configurator, when the user clicks a MAC page text, then no editor opens.
- Given a collection, when the user edits a MAC text, then only that collection's page and export change.
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

The SVG paths are exported in frame coordinates: draw them in one `viewBox="0 0 1920 1080"` SVG, translating the star paths by their node x (1160, 1080, 1000) and the wordmark by y 478, with `overflow:hidden` on the page.

Figma is not reachable from this environment (figma.com is blocked). The exported paths, gradients, every text position and style, and the target screenshots are in `/tmp/claude-0/-home-user-mac-recap/2ea7a183-b0c9-5a9e-a1ea-eeaf84fe061c/scratchpad/figma-assets/brand-paths.md`: build the pages from that file only. Keep the art in TypeScript (no `public/` assets). The "Our projects" title is the one free text (constant UUID element id); every other MAC text is fixed markup, not a document element. The W-Group text is a link in the PDF.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass, including the widened `part_kind`.
- `npm run build` -- expected: pass.

**Manual checks:**
- Screenshot both pages at 1920×1080 next to the Figma renders.
