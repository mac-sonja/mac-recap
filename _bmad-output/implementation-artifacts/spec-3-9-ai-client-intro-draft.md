---
title: 'Story 3.9: the AI writes the client intro and closing'
type: 'feature'
created: '2026-11-11'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-11-client-intro-and-outro-with-test-text.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Saving a client starts its intro draft (3.11), but the intro and closing pages carry marked test text, so every client intro has to be written by hand.

**Approach:** When `ANTHROPIC_API_KEY` is set, the worker asks the AI for the four client texts (intro headline and short paragraph, closing headline and short paragraph) from the client's current data and its PDFs, the same way 3.6 does for cases, and lays them into the existing 3.11 template. Without the key, the test text stays, as today.

## Boundaries & Constraints

**Owner decisions:** **OP 2 for clients (owner, 2026-11-11):** the AI reads the client's text fields and its PDF files; images, videos and other files are not sent (images are still used in the layout). 3.11 already built the trigger (**Aggiungi** / **Salva**), the background job, the template, the images and the statuses; this story only replaces the text (owner, 2026-11-06). The cover/outro design still replaces only the template later.

**Always:**
- **Input:**
  - the client's current name, sector (its label), description and brief (context, solution, results, testimonial), as labelled lines;
  - its PDF files from client material, following 3.6's case rules: whole while they fit the page and size budget, otherwise as their extracted text;
  - nothing else: no images, videos or other files.
- **Output:** exactly four texts, `introHead`, `introBody`, `outroHead`, `outroBody`, the same in every format, each with `aspect` and `sourceRefs` that point only at the client fields and PDFs it was given. A headline is short; a body is one short paragraph. Lengths fit the template's text boxes in every format.
- **Rules from 3.6:**
  - Italian, following the copywriting guide.
  - Only facts from the client's data and PDFs: no invented numbers, names, awards or dates.
  - The AI never writes client fields: name, sector, logo and results stay bound to the client.
  - A ref to anything not sent fails the job for good (`INVALID_SOURCE_REF`).
  - Empty or too-long texts are refused (`LLM_OUTPUT_INVALID`).
  - Logs carry no prompt, client text or response, only ids, codes and sizes.
  - The SDK is imported only in `adapters/anthropic/`.
- **Versioned prompt:** a new published prompt `client-intro@1`; the revision's `meta` records the model, the prompt version and whether the model fell back.
- **Failure:** as 3.11: retried by the queue, then the intro goes back to Bozza with the client untouched, and **Salva** starts it again.
- **No key:** without `ANTHROPIC_API_KEY`, the 3.11 test text, unchanged.

**Never:**
- Layout, image choice, page or element changes (template and images stay as 3.11 built them).
- A migration.
- Writing case histories or client records.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| AI draft | Key set, client saved | Intro in Da approvare; four AI texts on intro and closing pages in every format; meta has model and `client-intro@1` | — |
| No key | Key unset | 3.11 test text, as today | — |
| Bad ref | AI cites a field not sent | Job fails for good; intro back to Bozza | `INVALID_SOURCE_REF` |
| Too long | A text over its limit | Refused, retried by the queue | `LLM_OUTPUT_INVALID` |
| AI down | Provider unavailable | Retried, then Bozza | `LLM_UNAVAILABLE` |
| Sparse client | No brief or PDF, only name, sector, description | Texts from those only, no invented facts | — |
| PDF | Client has a PDF and two images | The PDF is sent and may be cited; images are not sent | — |
| Large PDF | PDF over the case budget | Sent as its extracted text | — |
| Edited later | Client renamed after the draft | Bound name changes; AI text stays as written | — |

</frozen-after-approval>

## Code Map

All under `src/modules/generation/` unless noted.
- `application/generate-case.ts` `runIntro` (:315-377): always calls `buildClientIntroTestDraft` (:340) and writes `meta` with nulls (:355). Add an injected client text source; call `buildClientIntroDocument({texts})` (`application/client-intro-draft.ts:246`, already shared for 3.9) and write real `meta`. `ClientIntroGenerateDeps.getClient` (:115) narrows to description and brief: widen to name, industry, description, brief; the sector label via `listClientSectors` / `sectorLabelKey` (case-study module index).
- `application/client-intro-draft.ts` `clientIntroTestTexts` (:226): becomes the no-key text source. Keys `introHead/introBody/outroHead/outroBody` (`rendering/templates/types.ts:42`); template `rendering/templates/mac-client/v1/pages.ts` (`clientBlock` :35-50, `outroText` :218, Carosello Chiusura :283-303) sets where they land and their box sizes.
- Case AI to mirror: port `ports/narrative-generator.ts` (refs :6-9, request/result :19-41); prompt `adapters/prompts/case-narrative.v1.ts` (`PROMPT_VERSION`, `FORMAT_TEXT_BUDGETS` :9, `GUIDE` :51, `systemPrompt` :155); adapter `adapters/anthropic/narrative-generator.ts` (model :11, `beta.messages.parse` + `betaZodOutputFormat` :117-126, error mapping :128-146, `contextText` :39); `application/narrative-text-source.ts` (`knownRef` :157, `FINAL_CODES` :57). Add `adapters/prompts/client-intro.v1.ts` and a client writer next to the case one; reuse the guide and error mapping, don't edit `case-narrative@1`.
- PDFs: the case path in `application/narrative-text-source.ts` (`MAX_PDF_PAGES` :23, `MAX_EXTRACTED_CHARS` :29, PDF loop :117-130, `deps.documents.pdfPageCount`, extraction) and the adapter's `document` block (`narrative-generator.ts:70-72`). Client files are `client_asset` rows (`case-study` index `listClientAssets` :906, `getClientAsset` :559), stored at `clients/{clientId}/material/{assetId}.{ext}` (`material/adapters/supabase/object-storage.ts:17`); `material.readAssetBytes` (:211) is case-only, so add a client-file original reader through the material module's index. Refs to a PDF use kind `asset` with the client asset id.
- Keep `client_field` refs in the client document (`domain/document.ts:38` `MATERIAL_REF_KINDS`), unlike cases.
- `worker.ts:21-36` `workerTextSource()`: choose the client text source the same lazy way (key unset → test text).
- Tests to mirror/flip: `adapters/anthropic/narrative-generator.test.ts`, `application/narrative-text-source.test.ts`, `generate-case.test.ts:255-341` (flip "always test text" :304 to "test text without the key"), `src/worker/text-source.test.ts`, `test/web-imports.test.ts:28`.

## Tasks & Acceptance

**Execution:**
- [ ] `ports/` + `adapters/prompts/client-intro.v1.ts` + `adapters/anthropic/` client writer (+ tests with a fake client) -- the AI call.
- [ ] `application/` client text source and `runIntro` (+ tests) -- AI texts or test text, refs checked, real meta.
- [ ] `worker.ts` (+ `text-source.test.ts`) -- lazy choice by key.
- [ ] `sprint-status.yaml` -- 3.9 to `review`.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given the case AI (3.6) and the 3.11 intro tests, when they run, then they pass, apart from the flipped "always test text" test.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass.
- `npm run build` -- expected: pass.
