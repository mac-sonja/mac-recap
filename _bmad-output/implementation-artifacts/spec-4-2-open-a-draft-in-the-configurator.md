---
title: 'Story 4.2a: open a draft in the configurator (frame, canvas, panels)'
type: 'feature'
created: '2026-10-28'
status: 'in-progress'
baseline_commit: 'b654cdc7df752e8c48660fc3b3437539a1aa4a55'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 3.3–3.5 give a case a v2 document and a renderer per format, but nobody can see it: a case in Da approvare or Approvato has no link in the table and no screen. Epic 4's editing stories all build on one configurator frame (C40).

**Approach:** A full-screen route `/case-studies/{id}/configurator` that reads the case's editable revision and draws the selected format's pages with the Story 3.5 renderer inside the mockup's frame: top bar, left panel (312 px), canvas, right panel (224 px, Pagine with live thumbnails), hideable panels, selection with Esc stepping and a top-of-canvas status message. Table rows in Da approvare or Approvato open it. Anteprima, the Instagram overlay and the Animazione testi switch are Story 4.2b (owner, 2026-10-28; deferred-work).

**Decisions (owner, 2026-10-28):**
- A case with no revision yet shows the template's starter pages for each format, built from the case's images and bound values with empty texts, and a "Bozza di prova" note; nothing is saved.
- Tools of later stories render in place, disabled, with a short "Arriva presto" hint: Layout, Pagine di default, Elementi, Sfondo, Elimina pagina (left), the Media tab (right), undo, redo and Approva (top bar). The save state reads "Salvato".

## Boundaries & Constraints

**Always:**
- The mockup `ux-designs/ux-MAC Recap-2026-10-08/mockups/configurator.html` is the reference for layout, sizes and copy; tool UI uses `globals.css` tokens only (mac-recap-ui); template output only the renderer.
- Data is read in the server page through existing exports only: `caseStudy.get`, `getEditableRevision({ kind: "case", id })`, `getClientInfoForCase`, `getClient(clientId).logoUrl`, `material.getDetailsForm`, `material.listAssets` + `getRendition` (`image.display`; `video.display` + `video.poster`). The server page builds `assets` and `BoundValues` and passes them with the pages to one client component. A rendition that isn't ready leaves its asset out (empty cell).
- Access: `requireSurface("edit")`. Status `draft` or `generating`, or not found → redirect to `/case-studies`.
- The frame takes a neutral header (name, code, status) so 4.11/4.12 can reuse it; no case-only logic below the top bar.
- Pages grouped Intro / Output / Risultati by `page.section`, labelled "{n} · {name}"; the format switch shows each format's own pages.
- Selection: click a block → framed with "⠿ Sposta"; click an element → selected, block framed; Esc steps element → block → page → nothing. Clicking a thumbnail selects that page and scrolls it to centre.
- Panels hide from their own bar and reopen from the canvas edge, by pointer and keyboard, focus moved to the button that appears.
- Status message `role="status"` at the top of the canvas for 3.5 s (used here for the disabled tools' hint).
- Below 1024 px: only "The configurator needs a larger screen." (Italian in the dictionary).
- Strings in `it.ts`, pinned in `it.test.ts`; no literals in JSX; light and dark checked; reduced motion respected.

**Never:**
- No change to `src/modules/generation`, `src/worker`, `package.json`, `src/modules/case-study/index.ts` or `src/modules/material/index.ts` (Story 3.10 is in flight there).
- No save, undo/redo, approval, text editing, page/block mutation, upload; no Anteprima (4.2b); no migration; no `MISSING_ASPECT` message (nothing produces it until 3.6).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | in_review case with a revision | frame; Presentazione pages grouped and labelled | N/A |
| No revision | approved/in_review, head null | starter pages + "Bozza di prova" note | N/A |
| Switch format | press Carosello | that format's own pages and thumbnails | N/A |
| Wrong status | draft or generating | redirect `/case-studies` | N/A |
| Not found / not owner | unknown id / other role | redirect `/case-studies` / landing | load error → error boundary |
| Rendition not ready | `RENDITION_NOT_READY` | asset omitted, empty cell | N/A |
| Disabled tool | press Layout | hint message, nothing changes | N/A |
| Narrow | width < 1024 | larger-screen message only | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(wizard)/layout.tsx` -- full-screen group (actor only, no sidebar). New route `src/app/(wizard)/case-studies/[caseId]/configurator/page.tsx` (+ test); redirect pattern from `(wizard)/case-studies/new/page.tsx`; error boundary `(wizard)/error.tsx`.
- `src/app/(wizard)/_components/configurator/` (new) -- `configurator.tsx` (client: format, selection, panels), `top-bar.tsx`, `left-panel.tsx`, `right-panel.tsx` (thumbnails = `renderFormat` of one page with `still`), `canvas.tsx`, `status-message.tsx`; happy-dom + testing-library tests.
- `src/modules/rendering` -- `renderFormat`, `starterPages`, `CASE_TEMPLATE`, `FORMATS`, `BoundValues`, `RenderAsset` (read only). `TemplateContext`: images = case image ids oldest first, `resultRows`/`hasTestimonial` from the details form.
- `src/app/_components/status-badge.tsx`, `button-styles.ts` -- reuse. `src/app/(tool)/_components/theme-switch.tsx` -- move to `src/app/_components/` (sidebar import updated) for the left panel foot.
- `src/app/_lib/routes.ts` -- `configuratorHref(id)`. `src/app/(tool)/case-studies/_components/case-studies-table.tsx:312` -- in_review/approved rows link to it.
- `BoundValues` sources: `getClientInfoForCase` (name, `industry.label`, description, `brief.results`, `brief.testimonialQuote/Author`), `getClient(clientId).logoUrl`, `get` (`year`, `businessLines` → `it.businessLines` labels as services), `getDetailsForm` (results, testimonial).
- `src/shared/i18n/it.ts` + `it.test.ts` -- `configurator.*`.

## Tasks & Acceptance

**Execution:**
- [x] `routes.ts`, `case-studies-table.tsx` (+ test) -- configurator link for in_review/approved rows.
- [x] `it.ts` (+ test) -- strings.
- [x] theme switch move to `src/app/_components/`.
- [x] `configurator/page.tsx` (+ test) -- guard, load, assets, values, starter-page fallback.
- [x] `_components/configurator/*` (+ tests) -- frame, panels, canvas, selection, message, narrow guard.
- [x] `sprint-status.yaml` -- 4.2 in progress, note the split.

**Acceptance Criteria:**
- Given Story 4.2's criteria in `epics.md` other than Anteprima, Instagram, Animazione testi, `MISSING_ASPECT` and the toast (3.8 not built), when checked on the running page, then each is met.
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass.

## Implementation Notes

## Verification

**Commands** (Node 24: `export NVM_DIR=/opt/nvm; . /opt/nvm/nvm.sh; nvm use 24`; dependencies already installed):
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` -- expected: pass

**Manual checks:**
- Screenshot the page (Playwright, page rendered with fixture data) in light and dark, each format, with a block selected and a panel hidden.
