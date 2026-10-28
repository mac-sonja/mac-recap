---
title: 'Story 3.4: templates as versioned code — pages, layouts and default pages per format'
type: 'feature'
created: '2026-10-28'
status: 'in-progress'
baseline_commit: 'ccf8b674388c7c36ece34d0cc10ba1f1f056c419'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-3-v2-document-model-and-format-registry.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Document v2 (Story 3.3 v2, PR #107, not merged; this branch stacks on it) has no template: `upgrade` gets `[]` from a `defaultPages` stub, and nothing lists a format's layouts or default pages. Generation (3.7), the test draft (3.10) and the configurator's **Layout** and **Pagine di default** (4.4) need one coded source for them, taken from the Figma "MAC-TF-AI" frames as the mockup reproduces them.

**Approach:** Code the case history template `mac-case` v1 under `src/modules/rendering/templates/mac-case/v1/`: per format, its layout grids, its default pages as builders of v2 `Page`s filled from a context (texts, images, result rows, testimonial), and the seven text styles with their sizes. Amend the v2 schema only where a Figma template page can't be stored (rows, alpha colours, margins, paddings, block ink, the closing star, multi-binding meta). Wire `upgrade`'s seam to the template.

## Boundaries & Constraints

**Always:**
- The mockup `ux-designs/ux-MAC Recap-2026-10-08/mockups/configurator.html` (BENTO + `addLayout`, `PRESETS_BY_FMT`, `applyIntro`, `DEFAULT_PAGES`, `applyOutro`, `closingPage`, the `.t-*` CSS) is the source of every value.
- `layouts(formatId)` is the only layout list, in this order, each `{ layoutId, name, rows, cols, areas }` (`areas[i]` = `[rowStart, colStart, rowEnd, colEnd]` of block i, 1-based, end exclusive):
  - Presentazione: `intro` (5), `content_1`, `content_3`, `content_5`, `only_layout` (Intro grid without images), `results` (= caro3b).
  - Carosello: `one`, `two`, `three_a`, `three_b`, `four`, `stack`.
  - Video: `one`, `stack`, `intro`, `results`.
  - New grids append; an id never moves or changes within v1.
- `defaultPages(formatId)` lists `{ key, name, build(ctx) → Page[] }` in this order: Presentazione `intro`, `content_1`, `content_3`, `content_5`, `results`; Carosello `intro` (3 pages: Copertina, Sfida, Idea), `sfida`, `idea`, `results`, `closing`; Video `intro`, `results`.
- Page keys are stable per default page (`intro`, `intro-sfida`, `intro-idea`, `content`, `results`, `closing`, …); `role` and `section`: intro pages `intro`/`intro`, Contenuti `body`/`output`, Risultati `outro`/`risultati`, Chiusura `outro`/`risultati`.
- `ctx`: `newId()`, `texts` (title, subtitle, challengeHead, challengeBody, ideaHead, ideaBody, outputHead, outputBody; missing → `""`), `images` (asset ids in order; missing → `null`), `resultRows` (0–3), `hasTestimonial`.
- Client name, sector, case year, result rows and testimonial are bindings; services and logos are their elements. Fixed template copy (labels "01 Progetto"…, "06 — Risultati", "08 — Voce del cliente", "Al prossimo progetto" and its line) are `text` with provenance `generated`.
- Risultati: one row per `resultRows` (divider in `#B0B0B1`, then a row of label and lime `#DEFE56` number) in a `#2977FF` block with white ink; testimonial block only if `hasTestimonial`; `build` returns `[]` when both are absent. Presentazione adds an image block first; Video starts with the Intro's info block.
- Text style sizes per format (desktop = Presentazione, mobile = Carosello, Video) as C32; a template text's own Figma size goes in `size`.
- Every built page passes `pageSchema`; every page's block count equals its layout's `areas` length.
- Published version folders are immutable: a test hashes every file under `templates/*/v*/` against a committed list.

**Never:**
- No template value in the DB or editable at runtime; no migration.
- No renderer (3.5), no generation or test-draft wiring (3.7, 3.10), no configurator UI (4.x), no client intro template (`client_intro` gets `[]`; 3.9/3.11).
- No sector-length or overflow test here: it needs the renderer (3.5).
- Don't touch `.claude/worktrees/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Full case | 5 images, 3 rows, testimonial | every default page builds, valid, blocks match layout | N/A |
| No media | `images: []` | image elements `assetId: null`, animation `assetIds: []` | N/A |
| Results only | 2 rows, no testimonial | Risultati with 2 rows, no Voce del cliente block | N/A |
| Neither | 0 rows, no testimonial | Risultati `build` → `[]` | N/A |
| Two builds | same ctx shape, fresh `newId` | no id shared; ids unique within the format | N/A |
| v1 read | v1 fixture | each format gets the template's starter pages (deterministic ids), valid v2 | N/A |
| Version folder edited | a v1 file changes | hash test fails naming it | test failure |

</frozen-after-approval>

## Code Map

- `src/modules/generation/domain/document.ts` -- v2 schema; amend (Design Notes). `DefaultPages` seam `(template, kind, formatId) => Page[]`.
- `src/modules/generation/index.ts` -- replace the `defaultPages` stub with the template's starter pages and a deterministic `newId`.
- `src/modules/generation/domain/document-fixtures.ts`, `src/modules/generation/index.test.ts` -- extend fixtures/tests for the amendments.
- `src/modules/rendering/templates/mac-case/v1/` (new) -- `styles.ts`, `layouts.ts`, `pages.ts`, `index.ts`.
- `src/modules/rendering/templates/index.ts` (new) -- registry `templates[id@version]`, `layouts`, `defaultPages`, `starterPages`; `hashes.json` + `templates.test.ts`.
- `src/modules/rendering/index.ts` -- export the template API. Templates import generation types with `import type` only (generation's index imports rendering at runtime; no cycle).

## Tasks & Acceptance

**Execution:**
- [ ] `src/modules/generation/domain/document.ts` + fixtures + tests -- schema amendments -- Figma pages must be storable.
- [ ] `src/modules/rendering/templates/mac-case/v1/*` -- styles, layouts, default pages from the mockup.
- [ ] `src/modules/rendering/templates/index.ts`, `rendering/index.ts` -- template API.
- [ ] `src/modules/rendering/templates/templates.test.ts`, `hashes.json` -- I/O matrix, layout lists, schema validity, immutability.
- [ ] `src/modules/generation/index.ts` + tests -- upgrade uses the template's starter pages.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.4 to review.

**Acceptance Criteria:**
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass.

## Design Notes

Schema amendments (v2 stays `schemaVersion: 2`; nothing stored yet):
- Colours (text, divider) accept `#rrggbbaa`: muted text `#01223499`, labels on blue `#ffffffa6`, on grey `#012234a6`.
- Text may hold `bindings` (2–3, shown joined by " · ") instead of `text`/`binding`: the meta line "sector · year".
- `row` element: `align` (centre|top), optional `wide`, `items` of text, text_group, logos, services.
- `divider.colour?`; block `padding?`, `paddingTop?`, `ink?`; page `margin?`, `decoration?: 'star'` (all px on the Figma frame).

Starter pages (the v1 → v2 seam, and the default set for 3.10): Presentazione intro, content_3, results; Carosello intro (3 pages), results, closing; Video intro, results. Deterministic ids for upgrade: `00000000-0000-4000-8000-` + 12-digit counter per format.

Mockup quirk followed: Carosello Risultati uses `two` (side by side), as `applyOutro` does.

## Verification

**Commands:**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` -- expected: pass
