---
title: 'Story 5.2 (part): approved case detail page and Modifica'
type: 'feature'
created: '2026-10-28'
status: 'in-review'
baseline_commit: '0d8abf2547b6c95c25bc1903f9a2bb336b719446'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An Approvato row opens the configurator straight away, and there is no read-only page for an approved case. Owner decisions (2026-10-28): there is no Delete on table rows (a draft is deleted only inside the draft); an approved case opens a detail page, which will also hold **Elimina** (next spec); and the table gets a **Modifica** button on approved rows.

**Approach:** Build a minimal Story 5.2: a full-screen, read-only detail page at `/case-studies/{id}` that shows each format of the approved case with the configurator's Anteprima pieces and has **Modifica** to open the configurator. Approvato rows, from the Case table and from Home, open this page, and the table shows **Modifica** on them. Story 4.1 closes and its row Delete criterion is dropped.

**Decisions:** When an approved case has no approved revision yet (nothing sets one before Story 4.8), the page shows the template's starter pages read-only with the *Bozza di prova* note, as the configurator does. Once 4.8 sets one, the page shows the live revision on its own.

## Boundaries & Constraints

**Always:** Access goes through `requireSurface` and `can` from `@/modules/access`. The page reads `getLiveRevision`, never the working head. Italian copy comes only from `it.ts`. Follow the mac-recap-ui house rules. The Configurator's own behaviour stays as it is.

**Never:** No Delete on any table row, and no Elimina in this spec. No zoom, full screen, pager label, 1024–1279 dropdown, Share or working Export: these stay in Story 5.2's backlog. Scarica stays the existing inactive `DownloadButton`. No migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open approved | Approvato row, any role that may `list cases` | Detail page: back, name, code, badge, format switch, Scarica, read-only preview; **Modifica** only with `edit` | N/A |
| No approved revision | Approvato, `approvedRevisionId` null | Starter pages, read-only, *Bozza di prova* note | N/A |
| Open non-approved | `/case-studies/{id}` for Bozza, In elaborazione or Da approvare | Redirect: Bozza goes to the wizard; Da approvare with `edit` goes to the configurator; anything else goes to `/case-studies` | An unknown or deleted id goes to `/case-studies` |

</frozen-after-approval>

## Code Map

- `src/app/_lib/routes.ts:33` -- `caseHref`: `approved` returns the new `caseViewHref(id)` for every role; `in_review` keeps the configurator with `canEdit`. Used by the table (`case-studies-table.tsx:334`) and Home (`home/page.tsx:235`).
- `src/app/(wizard)/case-studies/[caseId]/configurator/page.tsx` -- the loader to mirror: case, client info, details, assets and renditions, `boundValuesOf`, `pagesOfDocument`, `starterPagesOf`, and the theme cookie. Swap `getEditableRevision` for `getLiveRevision`.
- `src/app/(wizard)/_components/configurator/canvas.tsx` -- reuse `Canvas` with `preview` on and no-op selection handlers. `configurator.tsx` holds the slideshow step and the ← → keys to copy. `top-bar.tsx` holds the back, name, code, badge and format switch styles (`styles.ts`) to reuse.
- `src/app/_components/download-button.tsx` -- Scarica, as on the table's approved rows.
- `src/app/(tool)/case-studies/_components/case-studies-table.tsx:375` -- the approved-row action cell, where Modifica goes.
- `src/shared/i18n/it.ts` -- add a `caseView` namespace and the row's Modifica label.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/_lib/routes.ts` and its tests -- add `caseViewHref` and the new `caseHref` rule.
- [x] `src/app/(wizard)/case-studies/[caseId]/page.tsx` and `page.test.tsx` -- server loader with the matrix redirects: `requireSurface("list cases")`, then `can(actor, "view", { status })`; pass `canEdit`.
- [x] `src/app/(wizard)/_components/case-view/case-view.tsx` and its test -- client frame. The top bar has: back to `/case-studies`, name, code, badge, the format switch, Scarica, and **Modifica** as a link to `configuratorHref` when `canEdit`. Below it, the read-only `Canvas`: Presentazione stacked, Carosello and Video as a slideshow with ← →, and the Instagram overlay on Video.
- [x] `src/app/(tool)/case-studies/_components/case-studies-table.tsx` and its test -- a **Modifica** link on Approvato rows when `canEdit`, next to Scarica. Clicking it does not also trigger the row's own open.
- [x] `src/shared/i18n/it.ts` -- the copy above.
- [x] Planning -- `epics.md`: a 4.1 owner note (2026-10-28) that drops the Delete criterion and says the To review entry shipped as the sidebar note (#115); a 5.2 note that this part is built and the rest is backlog. `sprint-status.yaml`: 4.1 done, 5.2 in-progress (part built), epic-5 in-progress.

**Acceptance Criteria:**
- Given the Case table or Home, when I click an Approvato row, then the detail page opens. With `edit`, the table row also shows **Modifica**, which opens the configurator.
- Given the detail page, when I switch format, then nothing on the page can be selected or edited.
- Given a role without `edit`, when it opens the detail page, then no Modifica shows.

## Implementation Notes

- `requireSurface` gained an optional `resource` (default `{}`): the sales role's `list cases` is approved-only, so `requireSurface("list cases")` would always send it to `/library`. The page calls `requireSurface("list cases", { status: "approved" })`, then `can(actor, "view", { status })`.
- `DocumentHeading` and `FormatSwitch` moved out of `TopBar` (same markup) and are shared by `CaseView`.
- Below 1024 px the page shows a larger-screen message, as the configurator does; noted as backlog on Story 5.2.
- The theme cookie is not read: the page has no theme switch.
- `case-details-step.test.tsx`: `@next/next/no-html-link-for-pages` turned off for that file, since its plain `<a href="/case-studies">` now matches the `/case-studies/[caseId]` page.
- Verified: typecheck, lint, `npm test` (123 files, 3536 passed, 2 skipped). Not checked in a browser.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | ← → inside the Scarica dialog's radios step the slideshow (blind, edge, verification) | medium | `case-view.tsx` keydown handler skips text fields only; `DownloadButton` radios sit in a modal dialog; `preventDefault` blocks radio navigation | patch |
| 2 | `useReducedMotion` untested (verification gap) | medium | No `CaseView` test stubs `matchMedia`; inverting the hook passes every test | patch |
| 3 | `CaseStudiesTable` JSDoc stale ("other rows are not links yet") | low | Doc block above the component contradicts the new row behaviour; direct correction | patch |
| 4 | `ROW_PILL` copies `DownloadButton`'s class string | low | Character-for-character copy; the two will drift; extracting one constant is a direct change | patch |
| 5 | File-wide eslint-disable in `case-details-step.test.tsx` | low | One `<a>` needs it; `eslint-disable-next-line` is a direct correction | patch |
| 6 | One non-"not ready" rendition failure throws the whole page into the error boundary | medium | `renderAssetsOf` over every listed asset, as the configurator; a broken unused upload blocks viewing | defer |
| 7 | Narrow screen message has no back link | low | Tool is desktop-first (1280 px min); browser back works; preview below 1024 px is 5.2 backlog | reject |
| 8 | Back link and redirects go to `/case-studies` for the sales role | low | `/case-studies` redirects that role to its landing; the role has no entry to this page yet | reject |
| 9 | Sales role cannot reach the page except by URL | low | Entry point is the Library (Story 5.1), outside this intent | reject |
| 10 | Starter pages shown for an approved case without approved revision | false | Owner decision in the frozen intent | reject |
| 11 | Arrow keys captured while the canvas is hidden below 1024 px | low | Narrow layout is a stopgap; no horizontal scroll to block there | reject |
| 12 | NOT_FOUND from later loads after a concurrent delete reaches the error boundary | low | Same as the configurator; needs a delete racing the page load | reject |
| 13 | Other missing tests (ArrowLeft clamp, alt/ctrl, sales back href) | low | Clamp and modifiers share the tested code path; sales back href follows #8 | reject |

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: all pass
