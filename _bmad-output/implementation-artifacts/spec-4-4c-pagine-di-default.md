---
title: 'Story 4.4c: Pagine di default, lay a page out as a template page filled with the generated texts'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_commit: '53e2a9099af5fec321046b667e0c3022a8595ae5'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A template page that has been deleted or reworked can't be brought back. **Pagine di default** lists the format's default pages in the left panel, but they are inactive (Story 4.4, C31).

**Approach:** Clicking a default page lays out the tools' page as that template page, in the format in view only. Texts come from the case's `generated_doc`, images from the page itself first, as one undo step through 4.3a's `doc.change`.

**Decisions (owner):**
- 2026-10-30: split from Story 4.4 (4.4a Layout, Mescola, Sfondo; 4.4b resize; 4.4c Pagine di default).
- 2026-10-30: a restored page is filled with the case's generated texts (`generated_doc`), not texts rebuilt from the form.

**Decisions (drafting, to confirm with the owner):**
- Images come from the page itself first, then the case's other images that the document or `generated_doc` already uses, oldest first. `saveRevisionDoc` refuses any other asset (`ASSET_NOT_ALLOWED`) until 4.5 brings the media guardrail.
- The page keeps its `pageKey`, name and section, as the mockup does, so it stays where it is in the list.
- No default page shows as pressed: the document doesn't record which one a page came from.

## Boundaries & Constraints

**Always:**
- **Pagine di default** lists `defaultPages(formatId, template)` (as today). The tools act on the selected page, or the page in view (as Layout).
- Clicking one builds that default page with:
  - **texts:** each template text key's words in this format's `generated_doc`, a missing one `""`;
  - **images:** the page's images first (page and block image backgrounds, image elements, animation assets, in document order, without repeats), then the rest of the pool described above;
  - **result rows and testimonial:** the case's current `values.case.results.length` and `values.case.testimonial !== null`.
- The selected page takes the built page's blocks, grid, background, margin, decoration and role, with fresh ids, keeping its `pageKey`, name and section. A restored generated text keeps that text's `sourceRefs` and `aspect`, with provenance `generated`.
- **Carosello Intro** builds three pages. The page becomes the cover. The format's pages keyed `{pageKey}-sfida` and `{pageKey}-idea` are removed, and the built Sfida and Idea pages are inserted right after the cover with those keys, the template's names ("Sfida", "Idea") and the cover's section. No other default page adds or removes a page.
- A default page that builds nothing (Risultati e testimonial on a case with neither results nor a testimonial) changes nothing. The message is "Questo caso non ha né risultati né testimonianza.".
- After a change the page is selected. The whole change is one undo step, and only the format in view changes.
- When not `editable`, the buttons say "arriva presto" (as now), and nothing changes.
- Strings go in `it.ts`, pinned in `it.test.ts`. Follow the house rules from `mac-recap-ui`, and check light and dark.

**Never:**
- No change to `src/modules/generation`, `src/modules/rendering`, `src/worker` or the database. `src/modules/case-study` only exports its existing `referencedAssetIds`.
- No storing which default page a page came from, no texts rebuilt from the form, and no images outside the pool. No dragging default pages (4.3e), and no page tools (4.13).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Presentazione 3 immagini | Contenuti page, own images B, C; pool A, B, C, D | `content_3` grid, images B, C, A; output texts from `generated_doc` | N/A |
| Edited texts | Intro whose title was edited | the title is the generated title again, with its `sourceRefs` | N/A |
| Carosello Intro, first time | page `intro`, Sfida and Idea deleted | cover, then `intro-sfida` and `intro-idea` inserted after it | N/A |
| Carosello Intro, again | `intro-sfida` and `intro-idea` already exist, one moved to the end | both removed, two new ones after the cover; page count unchanged | N/A |
| Intro on another page | Carosello page `content` | `content` becomes the cover, `content-sfida` and `content-idea` added after it | N/A |
| No results | Risultati e testimonial, 0 rows, no testimonial | nothing changes | "Questo caso non ha né risultati né testimonianza." |
| No generated text | `generated_doc` lacks a key (v1 upgrade) | that text is `""` | N/A |
| Undo | after a restore, ⌘Z then ⇧⌘Z | page (and Sfida/Idea) back, then again | N/A |
| Not editable | approved case, or no revision | nothing | "Pagine di default arriva presto." |

</frozen-after-approval>

## Code Map

- `src/modules/rendering` -- read only: `defaultPages(formatId, template)` (`key`, `name`, `build(ctx)`; Carosello `intro` builds `[cover "intro", "intro-sfida", "intro-idea"]`, `results` builds `[]` with neither results nor testimonial); `starterPages(template, "case_history", formatId, ctx)`; `TEMPLATE_TEXT_KEYS`; `TemplateContext`. The builders (`mac-case/v1/pages.ts`) write each `ctx.texts[key]` verbatim into a text element's `text`.
- `src/modules/case-study/index.ts` -- export `referencedAssetIds` (in `application/revisions.ts`, the same walker `saveRevisionDoc` checks against).
- `configurator/default-pages.ts` (new, + test) -- pure. Two functions:
  - `generatedTextsOf(doc)` → per format, key → `{ text, sourceRefs?, aspect? }`. It rebuilds the format's starter pages with a unique marker as each key's text (no images, 0 rows, no testimonial), matches pages by `pageKey`, and walks blocks, elements and `text_group`/`row` items side by side. Where the starter's text is a marker and the generated element at the same place is a text with `text`, it records that key (first match wins). A shape mismatch records nothing.
  - `applyDefaultPage(pages, pageKey, defaultPage, { texts, pool, resultRows, hasTestimonial, newId })` → `PageEdit` (4.3c's type, in `page-editing.ts`, gains the refusal reason `empty`). It builds with marker texts, then swaps each marker for the generated text and its refs.
- `case-studies/[caseId]/configurator/page.tsx` -- passes `generatedTexts` (from `head.generatedDoc`; `{}` with no head) and `images` (the case's image ids, oldest first, from `listed`, kept when `referencedAssetIds(head.doc)` or `(head.generatedDoc)` has them; `[]` with no head).
- `configurator/configurator.tsx` -- new props `generatedTexts` and `images`; `onDefaultPage(dp)` uses `applyDefaultPage` on the tool page through `applyPageEdit` (page selected), which says `edit.defaultEmpty` for `empty`.
- `configurator/left-panel.tsx` -- the Pagine di default buttons become active when editable (`onDefaultPage`), with a plain eyebrow heading and hover/`PRESSABLE` as the Layout thumbnails.
- `src/shared/i18n/it.ts` + `it.test.ts` -- `configurator.edit.defaultEmpty`.

## Tasks & Acceptance

**Execution:**
- [x] `it.ts` / `it.test.ts` -- string.
- [x] `case-study/index.ts` -- export `referencedAssetIds`.
- [x] `default-pages.ts` (+ test) -- `generatedTextsOf` against `buildTestDraft` documents (every key found in each format, refs kept); `applyDefaultPage` for each matrix row; results pass `validateNewDocument`; ids unique.
- [x] `page.tsx` (+ `page.test.tsx`), `configurator.tsx`, `left-panel.tsx` (+ `configurator.test.tsx`) -- wiring, a click restores the page, one undo step, message, not editable.
- [x] `sprint-status.yaml` -- on the 4.4 line: 4.4c in review.

**Acceptance Criteria:**
- Given Story 4.4's Pagine di default criteria in `epics.md`, when checked on the running page in each format, then each is met: the page is laid out as the template page, filled from the case with its own images first; Carosello Intro replaces its Sfida and Idea pages; no other default page adds a page.
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass.

## Implementation Notes

- Owner (2026-10-29, 4.3): subagents only for the review step, so the implementation was done in the main session.
- The image pool is `imagePoolOf` in `_lib/configurator-data.ts` (with its own test), not inline in `page.tsx`; the page test takes the real `referencedAssetIds` through `vi.importActual`.
- Markers are `⟦mac-recap:{key}⟧`. They are used for both reading `generated_doc` and building, so a restored text never keeps a marker (tested), and fixed template copy is never mistaken for a generated text.
- A page's own images are its asset ids that are also in the pool, so a video on the page, or an asset that isn't one of the case's images, is never placed as an image.
- Carosello Intro's extra pages are keyed by swapping the built cover's key prefix (`intro-sfida` → `{pageKey}-sfida`).
- Review: own images go to the indexes the default page actually reads (a probe build with stand-in ids), so Presentazione Risultati keeps its visual at `imageAt(1)`.
- Node 24 (the repo's engine) was fetched into the scratchpad to run the checks; the container has Node 22.
- Not done: the browser check against the local stack (as in 4.4a/b, the configurator needs Supabase). Covered by `default-pages.test.ts` (on `buildTestDraft` and `buildCaseDocument` documents) and `configurator.test.tsx` (happy-dom, the real renderer).
- Files: new `default-pages.ts` (+ test), `_lib/configurator-data.test.ts`; `page-editing.ts` (`empty`), `configurator.tsx`, `left-panel.tsx`, `configurator.test.tsx`, `_lib/configurator-data.ts`, `page.tsx`, `page.test.tsx`, `case-study/index.ts`, `it.ts` / `it.test.ts`, `sprint-status.yaml`.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Presentazione Risultati restored on its own page loses its visual (edge) | medium | The builder reads `imageAt(1)`; own images went to index 0, so the visual became pool[0] | patch (own images go to the indexes the default page reads, found by a probe build; test) |
| 2 | Own images compared case-sensitively with the pool (edge, blind, verify-gap other) | low | `imagePoolOf` matches lowercased, `applyDefaultPage` used `Set.has` | patch (match lowercased, keep the pool's id; test with an uppercase id) |
| 3 | `page.tsx`'s `generatedTexts`/`images` wiring untested (verify-gap, blind) | medium | Static markup can't show them; `doc` and `generatedDoc` were the same fixture | patch (`page.test.tsx` captures the props: texts from `generatedDoc`, the pool, `{}`/`[]` with no revision) |
| 4 | Configurator never checks the pool or result rows reach `applyDefaultPage` (verify-gap, blind) | medium | `pool: []` or `resultRows: 0` would pass every UI test | patch (cover photo from the pool; Risultati with 2 rows) |
| 5 | `fill` names three things (blind) | low | Inner mapper in `fillTexts` shadows the idea of the `fill` parameter | patch (renamed `fillElement`) |
| 6 | A format with no lined-up generated texts blanks the page (blind) | false | Only a v1 upgrade lacks them, and its generated texts are `""` too (`upgradeContext`); matrix row "No generated text" | reject |
| 7 | Empty restored text marked `generated` (blind) | false | Frozen intent: a missing key is `""`; the generated document had the same | reject |
| 8 | Intro on a Sfida/Idea page nests keys; on page X removes a cover keyed `X-sfida`; keys may pass 64 chars (blind, edge) | low | Needs repeated Intro on derived pages; fix adds guards | reject |
| 9 | Active buttons silent when the format has no page (blind, edge) | low | Same as Layout (4.4a); a format without pages needs 4.13 | reject |
| 10 | Empty `sourceRefs` dropped (edge) | false | `buildCaseDocument`'s `cite` never writes an empty array | reject |
| 11 | Markers from `generated_doc`'s template, list from `doc`'s (blind) | false | Both are written from one template at generation; there is one registered template | reject |
| 12 | Pool order relies on `listAssets` order (blind) | low | `asset-repository.ts` orders by `created_at`, as `starterPagesOf` already relies on | reject |
| 13 | No message after a restore (blind) | low | The mockup shows none; the canvas redraws and ⌘Z undoes | reject |
| 14 | Browser check not done; drafting decisions unconfirmed (blind) | low | Process: both are called out to the owner at hand-off | reject |

## Design Notes

Why markers: `generated_doc` doesn't store texts by key, but it was built by these same builders (`buildCaseDocument` → `starterPages`). The same build with markers gives each key's place in the page. Images, rows and the testimonial change backgrounds, asset lists and the Risultati page, but not where the Intro and Contenuti texts sit. Every key a format's default pages use appears in that format's starter pages: Presentazione `intro` and `content`, Carosello `intro`, `intro-sfida` and `intro-idea`, Video `intro`.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test && npm run build` -- expected: all pass.

**Manual checks:**
- In Chromium, in each format: restore every default page on a page with edited texts and a few images; Carosello Intro twice; Risultati on a case without results; ⌘Z/⇧⌘Z; reload keeps the result; light and dark.
