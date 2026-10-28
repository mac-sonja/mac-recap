---
title: 'Story 3.10: test draft without AI (dev only)'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_commit: '9477c610a9264de404215289118e983883a1815a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-4-templates-pages-layouts-and-default-pages.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The configurator (4.2+) needs real drafts to open, but nothing turns a case into a revision yet: the AI generator (3.6, 3.7) is blocked on the narrative guidelines.

**Approach:** A dev-only command, `npm run dev:test-draft -- <caseId>`, builds a v2 document from each format's default pages (Story 3.4), filled from the case and its client with test text marked "[bozza di prova]". It writes the document as a new working revision and moves the case to Da approvare through the normal transitions. The document builder is a pure function that 3.7 later reuses with the AI's texts.

## Boundaries & Constraints

**Always:**
- Pages per format, in order:
  - Presentazione: `intro`, `content_3`, `results` (the template's starter pages).
  - Carosello: `intro` (3 pages), then a Contenuti page, then `results`, then `closing`. The Contenuti page is the mockup's sample: key `content`, name Contenuti, role body, section output, white, margin 24, layout `three_a`, three grey image blocks with `images[0..2]` (fit fill). It is built in the builder, not added to the template.
  - Video: `intro`, `results`.
- No result rows and no testimonial means no Risultati e testimonial page in any format (C24; the template already does this).
- Context passed to the template:
  - `images`: the case's non-deleted image assets, oldest first (videos and other kinds are left out; favourites are ignored).
  - `resultRows` and `hasTestimonial`: from the details form.
  - `texts`: every `TEMPLATE_TEXT_KEYS` entry, each starting with "[bozza di prova] " and each distinct.
- Client and case values stay bindings, as the template already makes them. No client value goes into the document or the manifest.
- Each test text gets `sourceRefs`:
  - Sfida texts: built from the `context` form answer, citing `{ kind: "form_field", id: "context" }`.
  - Idea texts: built from the `solution` form answer, citing `{ kind: "form_field", id: "solution" }`.
  - Every other text, and a Sfida or Idea text whose form answer is empty: a fixed test sentence citing the case's first asset (`{ kind: "asset", id }`).
- Command flow:
  1. Refuse anything but mac-recap-dev or a local stack (`checkDevProject`).
  2. Load the case and check that it is `draft` and `hasMaterial`.
  3. Transition `generate`.
  4. Create the working revision (`expectedHeadVersion` = the case's head version; manifest `{ testDraft: true, assetIds }`; meta nulls).
  5. Transition `generation_succeeded`.
- If step 4 fails after `generate` succeeded, transition `generation_failed` so the case returns to Bozza.
- The command acts as the system actor (the dev actor is disabled since Story 6.1) and authorizes `job work` first.
- Exit code 0 on success, 1 on any refusal or failure; the error code is logged, never the texts.

**Never:**
- No LLM call, no `@anthropic-ai/sdk` import, no UI entry point, no server action, no job.
- No template change: `mac-case/v1` stays frozen and `hashes.json` stays the same.
- No migration or schema change.
- No `composeParts` and no configurator code (other chats are building them).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | draft, 4 images, form filled, 2 results, testimonial | revision with the pages above; case `in_review` | N/A |
| No results, no testimonial | as above, neither | no `results` page in any format | N/A |
| Fewer images | 1 image | the later image blocks hold `null` | N/A |
| Only a PDF | 1 PDF, no images | every image `null`; the texts cite the PDF | N/A |
| Empty form | no context or solution | Sfida and Idea texts are fixed test text citing the first asset | N/A |
| No material | draft with no asset | nothing written | exit 1, `NO_MATERIAL` |
| Not a draft | `in_review` | nothing written | exit 1, `INVALID_TRANSITION` |
| Production | prod `SUPABASE_URL` | nothing read or written | exit 1, `PRODUCTION_REFUSED` |
| Revision fails | `createWorkingRevision` errors | case back to `draft` | exit 1, its code |
| Bad argument | no or non-uuid id | nothing | exit 1, usage message |

</frozen-after-approval>

## Code Map

- `src/worker/renditions-backfill.ts`, `renditions-backfill-entry.ts`, `package.json` `dev:renditions-backfill` -- the pattern to copy: injected deps, `checkDevProject` from `@/modules/material/worker` before anything loads, esbuild to `dist/`, `node --env-file=.env.local`.
- `src/modules/rendering/templates/index.ts` -- `starterPages(CASE_TEMPLATE, "case_history", formatId, ctx)`, `defaultPages`, `layouts(formatId)` (has `three_a`), `TEMPLATE_TEXT_KEYS`. `mac-case/v1/pages.ts` `kit()` shows the block, image and colour shapes (`GREY #EDEDF0`, `WHITE #FFFFFF`); the texts come out with `provenance: "generated"` and no `sourceRefs`.
- `src/modules/rendering/domain/formats.ts` -- `FORMAT_IDS`.
- `src/modules/generation/index.ts` -- pure and web-safe; already imports rendering at runtime. Add the builder here and in `generation/application/test-draft.ts`, and export `validateNewDocument`.
- `src/modules/case-study/index.ts` -- `get` (status, `headVersion`), `transition(caseId, event, actor)`, `createWorkingRevision(actor, { caseId, doc, manifest, meta, expectedHeadVersion })`.
- `src/modules/material/index.ts` -- `hasMaterial`, `listAssets({ caseId })` (oldest first, `kind`), `getDetailsForm({ caseId })` (`context`, `solution`, `results`, `testimonialQuote`).
- `src/modules/access/index.ts` -- `getSystemActor`, `authorize(actor, "job work")`.
- `test/lint-boundaries.test.ts`, `test/web-imports.test.ts` -- module boundary rules the new files must pass.

## Tasks & Acceptance

**Execution:**
- [x] `src/modules/generation/application/test-draft.ts` -- `buildTestDraft({ images, assetIds, form, newId })` → `CaseStudyDocument`: the test texts, the starter pages per format, the Carosello Contenuti page inserted after the intro pages, `sourceRefs` set on each test text by walking the pages (text, text_group and row items). Export it from `generation/index.ts`.
- [x] `src/modules/generation/application/test-draft.test.ts` -- the matrix's build rows; the result passes `validateNewDocument`; the page keys in order for every format; every placeholder is marked and cites; no client value anywhere.
- [x] `src/worker/test-draft.ts`, `test-draft-entry.ts` -- `runTestDraft(deps, argv)` with the flow above; real deps loaded after the project check.
- [x] `src/worker/test-draft.test.ts` -- the matrix's command rows with fake deps, including the rollback on a revision failure.
- [x] `package.json` -- `dev:test-draft`, built like `dev:renditions-backfill`.
- [x] `README.md` -- a short "Test draft (dev only)" section near the backfill's.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.10 to review; 3.4 and 3.5 to done (#107, #111 merged).

**Acceptance Criteria:**
- Given `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`, when they run, then they pass.
- Given the built bundle, when it is searched for `@anthropic-ai/sdk`, then there is no match.

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Rollback after a revision write that may have committed (blind) | medium | `createWorkingRevision` docs: `REVISION_WRITE_FAILED` and returned-row errors may have committed; the command then sends `generation_failed`, leaving a Bozza case with a new head | patch |
| 2 | `attempt()` drops the thrown error (blind, edge) | low | Only the code is logged; the fix is one log line | patch |
| 3 | `generation_succeeded` failure branch untested (gap, blind, edge) | medium | No test fails only the last transition | patch |
| 4 | Rollback-failure branch untested (gap, blind) | medium | The default `transition` fake always succeeds | patch |
| 5 | `--env-file-if-exists` differs from the backfill (blind, edge) | low | Deliberate, so the usage message prints without `.env.local`; `checkDevProject` still refuses production | reject |
| 6 | Same text on two keys overwrites refs (blind, edge) | low | 3.10's texts are distinct by construction (tested); 3.7 owns its AI texts; a guard adds code for an unreached path | reject |
| 7 | No direct tests of `buildCaseDocument`, `testDraftTexts` (blind) | low | Both run through every `buildTestDraft` test | reject |
| 8 | Weak "no client value" test (blind) | low | Each test also passes `validateNewDocument`, whose strict schema refuses client values | reject |
| 9 | Worker test doesn't check form texts reach the doc (blind) | low | A wiring slip would pass; one assertion | patch |
| 10 | Spec `in-review` vs sprint `review` (blind) | false | The workflow's two vocabularies differ by design (3.5 log #23) | reject |
| 11 | Service types looser than the real use cases (blind) | low | No wrong output; the real functions type-check against them | reject |
| 12 | A re-run supersedes the working head (blind) | low | Intended: every result is a new revision (3.3) | reject |
| 13 | `listAssets` fails on a signing error (edge) | low | Dev tool, re-run; a storage-free lookup is new surface | reject |
| 14 | No asset left between `hasMaterial` and `listAssets` (edge) | low | Needs a delete in the same second on a dev database | reject |
| 15 | `excerpt` can split a surrogate pair (edge) | low | Real with an emoji at the cut; direct fix | patch |

## Design Notes

The texts carry no sourceRefs from the template, so the builder adds them afterwards: it maps each distinct marked text to its refs and fills in `sourceRefs` on the matching text elements. Story 3.7 can call the same builder with the AI's texts and refs.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test && npm run build` -- expected: pass
- `npm run dev:test-draft` -- expected: usage message, exit 1

**Manual checks (if no CLI):**
- On mac-recap-dev, with `.env.local` set: run it for a draft with images, then check that the case shows in Da approvare and its head revision has the pages above.
