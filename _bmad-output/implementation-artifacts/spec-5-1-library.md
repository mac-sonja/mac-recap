---
title: 'Story 5.1: library of approved case studies'
type: 'feature'
created: '2026-11-04'
status: 'done'
baseline_commit: '4f9427681766e791dc2571a41c4cf1df6641399c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Account/sales/social users land on `/library`, which is still a placeholder ("La libreria è in arrivo"). They have no way to find an approved case to show a client. The owner/designer also can't see what those users see.

**Approach:** Build the library at `/library`: a card grid of approved cases only, read through `getLiveRevision`. Each card has a cover (page 1 of the 16:9 Presentazione, drawn with the shared renderer), name, client and year, and opens the case view (5.2). The grid has the table's search, Client and Year facet chips, newest approved first, 24 cards per page and skeleton cards while loading. Owner/designers reach the same page through a Tabella / Libreria toggle on Case studies.

## Boundaries & Constraints

**Always:**
- Approved only. The listing uses the `list cases` policy scope `{ status: "approved" }`, and each cover reads only `getLiveRevision`, never a working or superseded revision.
- Search matches what the table matches: name, client name, client code and case code (`filterRows`/`normalizeForSearch` in `filter-sort.ts`).
- Facets: values in one facet combine with OR; facets combine with each other and with search by AND.
- Active filters show above the grid as removable chips, with **Azzera tutto**.
- Sort: newest approval first.
- 24 per page, with numbered pages and no infinite scroll. Search, facets and page live in the URL (`?q=`, `?cliente=`, `?anno=`, `?pagina=`), so Back and reload keep them.
- Italian copy from `it.ts`, in the house voice of the `mac-recap-ui` skill.

**Never:**
- A status badge or a status filter.
- Card selection or **Crea raccolta** (5.10).
- Share or Export on cards.
- Changes to the table view's behaviour.
- A migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Load | 30 approved cases, others in Bozza or Da approvare | Only the 30, newest approval first, 24 on page 1 and 6 on page 2. Skeleton cards on the first load. | N/A |
| Card | A card is clicked, or Enter on a focused card | The case view `/case-studies/{id}` opens | N/A |
| Cover | The first Presentazione page uses an image | The cover draws it from its display rendition, read-only and scaled to the card | Rendition not ready → empty cell, as on the case page; the card still shows |
| No Presentazione page | The live revision has no 16:9 pages | Neutral cover placeholder; the name, client and year still show | N/A |
| Search | `lum` | Cases whose name, client name, client code or case code match, as in the table | N/A |
| Facets | Client A + Client B, Year 2025 | (A or B) and 2025, together with the search | N/A |
| No results | Filters match nothing | «Nessun risultato per "{query}"» (or a facet-only version), with **Azzera ricerca e filtri** | N/A |
| None approved | No approved case at all | «Ancora nessuna case history approvata.» and no action | N/A |
| Owner/designer | On Case studies | A Tabella / Libreria toggle. Libreria opens `/library`, which shows the same toggle back to Tabella. | N/A |
| Account/sales/social | Policy suite | Listing returns approved cases only. Working or superseded revisions never reach a cover. | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(tool)/library/page.tsx` -- the placeholder to replace. It already redirects roles that can't `list cases` with `{ status: "approved" }`.
- `src/modules/case-study/index.ts` -- `list({ status: "approved" })` returns `ListedCaseStudy` (newest `updated_at` first, `inReviewSince` only). Add `approvedAt` (when the case entered `approved`) to the listing, the same way `inReviewSince` is derived from the case's transition events. No migration. Sort by it.
- `getLiveRevision({ kind: "case", id })` -- one call per case on the page shown (at most 24). Covers render from the live doc's `presentazione_16_9` page 1 only.
- `src/app/(wizard)/_lib/configurator-data.ts` -- `boundValuesOf`, `pagesOfDocument`, `renderAssetsOf`. Sign renditions only for the assets page 1 references (`referencedAssetIds` on that page), not the whole case.
- `src/modules/rendering` -- `RenderedPage` / `renderFormat` with `options.still`. Scale the page into the card the way 4.13's Pagine thumbnails or the case viewer do.
- `src/app/(tool)/case-studies/_components/filter-sort.ts` -- reuse `normalizeForSearch` and the table's match rules. If they're row-shaped, move the matcher into a shared function rather than copying it.
- `src/app/(tool)/case-studies/page.tsx` + `case-studies-table.tsx` -- add the Tabella / Libreria toggle to the header (owner/designer only), styled like the existing segmented controls.
- `src/app/(tool)/case-studies/[caseId]/` -- the case view the cards open (5.2). Don't change it.
- `src/shared/i18n/it.ts` + `it.test.ts` -- `library.*`: drop `soon`; add search, facets, Azzera tutto, empty and no-results text, pager and toggle.
- `test/permissions.test.ts` -- an account/sales/social row for the library listing.

## Tasks & Acceptance

**Execution:**
- [x] `src/modules/case-study` -- `approvedAt` on approved listings (repository, domain type, tests).
- [x] `src/app/(tool)/library/_lib/library-data.ts` (new, + test) -- pure helpers:
  - parse and serialise the URL state;
  - filter by search and facets;
  - build the facet options from the approved list;
  - paginate 24 per page, clamping an out-of-range page;
  - sort by `approvedAt` descending.
- [x] `src/app/(tool)/library/page.tsx` + `loading.tsx` + `_components/library-grid.tsx`, `library-card.tsx`, `library-filters.tsx` -- the page as in the matrix: covers through the shared renderer, skeleton cards in `loading.tsx`, and keyboard-reachable cards that are links.
- [x] `src/app/(tool)/case-studies/page.tsx` (+ header component) -- the Tabella / Libreria toggle for owner/designer.
- [x] `src/shared/i18n/it.ts` + `it.test.ts` -- the copy.
- [x] Tests: `library-data.test.ts` (every matrix row that's pure), `page.test.tsx` (approved only, card link, cover from the live revision page 1, empty, no results, toggle, role redirect) and the permissions row.

**Acceptance Criteria:**
- Given a case approved after another, when the library loads, then it comes first.
- Given an approved case whose head was later edited (working revision), when the library loads, then its cover shows the approved page, not the edit.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | blind, edge, gap | A pending search debounce replaces the URL after a chip click within 250 ms, dropping the chip | medium | The timer closes over the old `state`; `go()` doesn't cancel it | patch |
| 2 | edge | The render-phase resync puts the old query back in the field during navigation | medium | `setSent` runs while `state.q` still holds the old value | patch |
| 3 | blind | One failed client lookup blanks every cover of that client | low | `logoOf` caches a rejecting promise | patch |
| 4 | blind, edge | The approve-event lookup runs on every list and sends every approved id in one `.in()` | medium | Table and Home pay an extra query; hundreds of ids risk the URL limit | patch |
| 5 | blind | About 5 reads per card, up to 24 cards | low | Accepted at demo scale | defer |
| 6 | blind | Out-of-range page and unknown facets stay in the URL | low | The page renders the clamped result correctly | rejected |
| 7 | blind | No facet counts | false | The spec doesn't ask for counts | rejected |
| 8 | blind | Search also matches business lines | false | The spec says "matches what the table matches"; the table matches Servizi | rejected |
| 9 | blind | Search chip label built inline | low | Copy rule: strings from `it.ts` | patch |
| 10 | blind, gap | Stale "until it ships" JSDoc in `it.ts` | low | Direct deletion | patch |
| 11 | blind | Disabled pager arrow is a `role="link"` that can't be focused | low | Direct correction | patch |
| 12 | gap | `LibraryFilters` has no interaction tests | gap | Pre-verified | patch (test) |
| 13 | gap | `approvedAt` has no DB test | gap | Pre-verified | patch (test) |
| 14 | blind | An approved case with no approve event sorts by `updatedAt`, so an edit moves it up | low | One-line change: such cases sort last | patch |
| 15 | blind | The toggle shows to admin too | false | Admin has every owner permission (owner, 2026-10-28) | rejected |
| 16 | blind | The skeleton lacks the toggle and shows chips when nothing is approved | low | Cosmetic layout shift | rejected |
| 17 | blind | Spec sections empty | false | The workflow fills them | rejected |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` (Node 24) -- expected: all green

**Manual checks:**
- On the Vercel preview, signed in as an owner and as an account/sales/social user: the grid, covers, search, facets, pages and the toggle, in light and dark.
