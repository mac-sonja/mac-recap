---
title: 'Story 3.3 v2: document schema v2 and the C28 format registry'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_commit: 'd9464f31bc9857a59b242fa990590c478333ea12'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-28-configurator.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The document a revision holds (schema v1: one shared text part plus a per-format layout part) and the format registry (Deck 16:9, Carosello 4:5, PDF A4) no longer match the configurator the owner approved (SCP 2026-10-28, C28–C30, answers 2–3, 5–17). In that configurator each format has its own pages and blocks hold elements, and an edit in one format never reaches another.

**Approach:** Replace the registry with Presentazione 16:9, Carosello 1:1 and Video 9:16. Add `CaseStudyDocument` schema v2: one page list per registry format, pages made of blocks, blocks made of typed elements, and client or case fields stored as bindings, never values. Read v0 and v1 documents through `upgrade` (v0 → v1 → v2, in memory only), and make v2 the only version a new revision accepts.

## Boundaries & Constraints

**Always:**
- Registry, in this order, with id, name, ratio, pixel size, page model, file type and `motion: boolean`:
  - `presentazione_16_9`: "Presentazione", 16:9, 1920×1080, slides, pdf, static.
  - `carosello_1_1`: "Carosello", 1:1, 1080×1080, slides, zip_png, static. Its Figma frame width is 1000 px; record that in a comment.
  - `video_9_16`: "Video", 9:16, 1080×1920, slides, `mp4_webm`, motion.
- Document v2 has `schemaVersion: 2`, `kind`, `template` (`id@version`), and `formats: Record<formatId, { pages: Page[] }>`. There is no shared text part, no `selectedMedia`, no `check` (C39, answer 11), and no required challenge/approach/result (answer 5).
- A page has `pageKey` (unique within its format), `name`, `role` (intro|body|outro), `section` (intro|output|risultati), `background`, `grid` (`layoutId` plus `rows` and `cols` positive track sizes), and `blocks`.
  - A background is `{kind:'colour', value:#rrggbb} | {kind:'transparent'} | {kind:'image', assetId}`.
- A block has `blockId` (uuid), `name`, `background`, and ordered `elements`.
- Elements form a discriminated union on `type`, each with a uuid `elementId` that is unique within its format:
  - `text`: `style` is one of lab|xl|title|sub|text|num|quote, with optional `colour`, `align`, `columns` (1|2, answer 14) and `size` (the template's px). The text holds exactly one of `text` or `binding` (`{record: 'client'|'case', field}`, answer 2). It has `provenance`, and optional `aspect` and `sourceRefs`.
  - `text_group`: `align` (top|centre|bottom|split), `splitAt` (only when split), and `items` (text elements).
  - `image` and `video`: `assetId` (uuid or null; null exports transparent, answer 10), `fit` (fill|fit|crop), and optional `crop {x, y ∈ [0,1], zoom ∈ [1,4]}`, allowed only when `fit` is crop (answer 8).
  - `animation`: `animation` id, `assetIds`, `fit`, and optional `size`.
  - `services`: tags read from the case's services (answer 7).
  - `logos`: the client's and MAC's logos.
  - `divider`.
- All objects are strict, so a stray client value key is an error (AD-22).
- `validateNewDocument` accepts only v2 with exactly the registry's format keys (`FORMAT_NOT_IN_REVISION` otherwise). The error codes stay the same.
- `upgrade(v1)`:
  - drops format keys that are not in the registry;
  - gives every registry format the template's default pages from an injected `defaultPages(template, kind, formatId)`. Until Story 3.4 this returns `[]`.
  - The input is never mutated or written back.
- `getLiveRevision` and `getEditableRevision` keep their signatures and behaviour.
- The download picker lists Presentazione, then Carosello 1080×1080. Video stays under *In arrivo*, and the old "Post 1080×1080" upcoming entry goes.

**Never:**
- No migration, and no `supabase db push`: the `revision` table is format-agnostic.
- No renderer, template, configurator, or generator changes (Stories 3.4, 3.5, 4.x, 3.6).
- No `check`, claims list, `selectedMedia` or `about` in v2.
- Don't touch `.claude/worktrees/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid v2 | three formats with pages, every element type | `ok(doc)` | N/A |
| Bound text | text with `binding` and no `text` | ok; the document holds no value | `text` and `binding` both set, or neither → DOCUMENT_INVALID |
| Duplicate ids | same `pageKey`, `blockId` or `elementId` twice in one format | rejected | DOCUMENT_INVALID |
| Same ids across formats | one `blockId` in two formats | ok (the copies are independent) | N/A |
| Crop without crop fit | `fit:'fill'` with `crop` set | rejected | DOCUMENT_INVALID |
| Format keys | missing `video_9_16`, or an extra `deck_16_9` | rejected | FORMAT_NOT_IN_REVISION, naming them |
| v1 read | v1 fixture with old format keys | v2 with the three formats, pages from `defaultPages`; input unchanged | N/A |
| v0 read | v0 fixture | upgraded through v1 to v2 | N/A |
| v1 as new revision | `createWorkingRevision` with v1 | refused | DOCUMENT_SCHEMA_UNSUPPORTED |
| Client value | `about` or `clientName` key anywhere | rejected | DOCUMENT_INVALID |

</frozen-after-approval>

## Code Map

- `src/modules/rendering/domain/formats.ts` (+ `.test.ts`): the registry. Replace `static: true` with `motion: boolean` and add `mp4_webm` to `FILE_TYPES`. `requireFormat` and `formatNotInRevision` stay as they are.
- `src/modules/rendering/index.ts`: re-exports (check names still exported).
- `src/modules/generation/domain/document.ts`:
  - v1 schema → rename to `caseStudyDocumentV1Schema`. Keep v0 and `fromV0`.
  - Add the v2 schema, `fromV1`, and `CURRENT_SCHEMA_VERSION = 2`.
  - `upgrade` takes the bound `defaultPages` and the registry ids. Only domain imports are allowed: zod and `@/shared`.
- `src/modules/generation/index.ts`: binds `FORMAT_IDS` (already, for `validateNewDocument`) and a `defaultPages` stub returning `[]` (TODO Story 3.4) into `upgrade`.
- `src/modules/generation/domain/document-fixtures.ts`: add `caseHistoryV2` and `clientIntroV2` (every element type), and keep the v1 and v0 fixtures for the upgrade tests.
- `src/modules/generation/index.test.ts`: rewrite the matrix against v2. It keeps the `MaterialRef` sync test.
- `src/modules/case-study/application/revisions.ts`: no API change. `revisions.test.ts`: switch fixtures to v2, and add v1 → v2 on read with no write-back.
- `test/db/revision.db.test.ts`: use v2 fixtures. A stored v0 or v1 row reads as v2, and the row stays unchanged.
- `src/app/_components/download-button.tsx` L12 `FORMAT_ORDER`: change to `presentazione_16_9`, `carosello_1_1`.
- `src/shared/i18n/it.ts` L606–617:
  - `download.format`: Presentazione "Per presentazioni e call"; Carosello 1080×1080 "Instagram e LinkedIn".
  - `upcoming`: drop `post`.
- `src/app/(tool)/case-studies/_components/case-studies-table.test.tsx` L410: update the name expectation.

## Tasks & Acceptance

**Execution:**
- [x] `src/modules/rendering/domain/formats.ts` and its test: the new registry -- C28 and answer 3.
- [x] `src/modules/generation/domain/document.ts`: the v2 schema, the v1 → v2 step, and `upgrade` and `validateNewDocument` on v2 -- C29, C30 and answer 2.
- [x] `src/modules/generation/index.ts` and the fixtures: bind the registry ids and the `defaultPages` stub; add the v2 fixtures -- a seam that Story 3.4 fills.
- [x] `src/modules/generation/index.test.ts`: unit tests for every row of the I/O matrix.
- [x] `src/modules/case-study/application/revisions.test.ts` and `test/db/revision.db.test.ts`: v2 fixtures, and upgrade on read without write-back.
- [x] `download-button.tsx`, `it.ts` and `case-studies-table.test.tsx`: the picker shows the new formats.
- [x] `src/shared/db.types.ts`: no change expected. If CI's drift check fails, commit CI's file.

**Acceptance Criteria:**
- Given the repository, when `rg "deck_16_9|social_carousel_4_5|pdf_a4" src test` runs, then it matches only v0 and v1 fixtures and upgrade tests.
- Given `npm run typecheck`, `npm run lint` and `npm test`, when they run, then they pass.

## Implementation Notes

- Implemented by a subagent; typecheck, lint and `npm test` (2937 passed) green locally. The DB suite (`test/db/revision.db.test.ts`, `case-study.db.test.ts`) was updated to v2 but runs only in CI.
- Choices the spec left open: at most 6 blocks per page, 50 pages per format, 30 elements per block, 20 texts per group, 12 grid tracks, 30 animation media; animations are a closed list (`carousel_01`, `carousel_03`, `carousel_04`, `wheel_02`) with fit fill|fit and size 50–150 %; services, logos and divider carry only id and type; grid cells are not checked against blocks (Story 3.4).
- The old-id search also matches one test that adds an extra `deck_16_9`, which the matrix's format-keys row requires; `LEGACY_FORMAT_IDS` holds the v0/v1 fixture keys.
- The element type is exported as `DocumentElement` to avoid the DOM `Element`.

## Spec Change Log

- **Loop 1 (review, 2026-10-28).** Trigger: reviewers found that `binding.field` accepts any name, and that a binding can't address the typed Risultati rows or the testimonial, which the Risultati e testimonial page reads (epic context; Story 2.21 stores them on the client's brief and on the case's `context_form`). Amended: Design Notes now list the bindable fields per record and add `index` for result rows. Known-bad state avoided: documents that validate but render blank, and a Risultati page that can't be stored as v2. KEEP: everything else in the first implementation (registry, schema shape, limits, upgrade seam, fixtures, tests, picker). Applied on top of the existing code rather than reverted and re-derived, since the amendment touches only the binding schema, its fixtures and tests.

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Binding `field` accepts any name (edge, blind) | medium | `bindingSchema` only checks a pattern; `{record:'case', field:'anything'}` validates and renders blank | bad_spec (grouped with 2) |
| 2 | A binding can't address result rows or the testimonial (blind) | medium | Results live as typed rows on the client brief and the case's `context_form` (2.21); `{record, field}` can't name row 2's value | bad_spec |
| 3 | New v2 size limits are untested (gap) | medium | Only 6 blocks and 5000 chars are tested; dropping any other `.max` keeps the suite green | patch |
| 4 | The picker test doesn't pin order, Carosello, Video under In arrivo, or Post gone (gap, blind ×2) | low | `case-studies-table.test.tsx` checks only the count, the first radio checked and that the name appears | patch |
| 5 | A split group may omit `splitAt` (edge, blind) | low | `textGroupElementSchema` doesn't require it when `align` is `split` | patch |
| 6 | The independence test only tests the fixture (blind) | low | It compares two `casePages()` calls; no production code runs | patch (delete) |
| 7 | `fromV1` keeps the v1 template ref for `defaultPages` (blind) | low | `mac-case@1` may never have v2 default pages; a TODO at the seam is enough | patch (comment) |
| 8 | Blocks have no grid position (blind) | false | As in the mockup, `layoutId` names the layout's areas and blocks fill them in order; a span is part of the layout | reject |
| 9 | Video and animation elements are allowed in static formats (blind) | maybe-false | The mockup places video blocks in Presentazione; how a static export draws them belongs to the renderer (3.5) | defer |
| 10 | Bound and human texts may carry `aspect`, `sourceRefs`, `size` (blind) | low | Harmless extra metadata; enforcing needs new branches | reject |
| 11 | Upgraded v1 documents read as empty, and "no v1 exists" isn't checked (blind) | maybe-false | Only true if a v1 row exists; the SCP records none on mac-recap-dev and prod doesn't exist | reject (low) |
| 12 | The spec's logs are empty and the grep criterion matches a test (blind, edge) | low | The fix edits this spec; Implementation Notes already record both | reject |
| 13 | ARCHITECTURE-SPINE still mentions `relayout` and Deck/A4 (blind) | low | Pre-existing doc drift outside this code change | defer |
| 14 | Animation `assetIds` may be empty or repeat; image background has no fit (blind) | low | An empty animation is a valid editing state; background fit isn't in the mockup's model | reject |
| 15 | `defaultPages` throwing makes `upgrade` throw (edge) | low | The provider is in-repo code; a throw is a loud bug, not a reachable input | reject |

## Design Notes

Bindable fields (a text's `binding`; anything else is DOCUMENT_INVALID):
- `client`: `name`, `sector`, `description`, `resultLabel`, `resultValue`, `testimonialQuote`, `testimonialAuthor`.
- `case`: `year`, `resultLabel`, `resultValue`, `testimonialQuote`, `testimonialAuthor`.
- `resultLabel` and `resultValue` need `index` 0–2 (the row); no other field takes `index`.
- The logo and the services aren't text bindings: the `logos` and `services` elements read them.
- A bound text's `provenance` is what placed it (`generated` by a template or the generator, `human_added` by a person).

The v1 → v2 step doesn't carry v1 texts. No v1 revision exists on any environment: mac-recap-dev has none, and prod doesn't exist yet. The format change also makes v1 layouts meaningless. So the template's default pages are the honest v2 equivalent. Story 3.10 then fills them with test text.

Element example:
```ts
{ elementId, type: "text", style: "title", binding: { record: "client", field: "name" }, provenance: "generated" }
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm test` -- expected: all pass
- `npm run test:db` -- runs in CI only (no local Docker); expected green there
