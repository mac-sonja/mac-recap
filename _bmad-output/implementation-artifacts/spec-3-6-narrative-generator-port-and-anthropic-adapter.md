---
title: 'Story 3.6: Narrative generator port and Anthropic adapter'
type: 'feature'
created: '2026-10-29'
status: 'draft'
route: 'dispatch'
baseline_commit: '755ab1e929cf29bbca852fc186217cd9b02e28be'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/copywriting-case-mac.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Generate (Story 3.7) fills every draft with the marked test text "[bozza di prova]" behind the `TextSource` seam. No text comes from the case's material yet.

**Approach:** Add a `NarrativeGenerator` port and an Anthropic adapter, registered only in the worker. The adapter reads the job's material and returns one set of texts per format, each fitted to that format's space and following the copywriting guide. When `ANTHROPIC_API_KEY` is unset, the worker keeps the test text.

**Decisions (owner, 2026-10-29):**
- Build now, before 4.8. The demo has moved.
- Material rules (closes IR-OP2):
  - The details form and the client info are sent as text.
  - Images are sent as their `image.display` renditions, at most 20, favourites first.
  - PDFs are sent whole.
  - DOCX, TXT and MD are sent as text extracted on our side.
  - Videos are skipped for now.
- `copywriting-case-mac.md` is the NFR5 checklist (closes IR-NFR5). Its §7 examples are used as they are.

## Boundaries & Constraints

**Always:**
- Only `generation/adapters/anthropic/` imports `@anthropic-ai/sdk`, and only `generation/worker.ts` wires it in (AD-10; `test/web-imports.test.ts`).
- The call uses:
  - `client.beta.messages.parse` with `betaZodOutputFormat`, and the model from one constant, `claude-opus-5-5`;
  - `thinking: { type: "adaptive" }` and `output_config: { effort: "high", format }`;
  - `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`;
  - no tools and no Files API.
- The prompt is a versioned module in `generation/adapters/prompts/` (`PROMPT_VERSION`). It asks for Italian (`locale` defaults to `it`) and carries the guide's rules and §7 examples.
- The output schema has text only. Per format it has the template keys that format shows, each `{ text, aspect?, sourceRefs }`. There is no layout, asset, `about` or check field.
- Each `sourceRef` is checked against the manifest (`asset`), the form fields (`context`, `solution`) and the client fields. A ref outside them fails the attempt (`INVALID_SOURCE_REF`, not retried).
- Every text gets `provenance: generated` and carries no check state (C39).
- If no text is tagged `technical`, or none `graphic`, the `job_ok` event records `missingAspect` in its data. This does not block (IR-A3).
- The revision meta records the served `response.model`, `fellBack`, `promptVersion` and `schemaVersion`.
- No prompt, material or response text appears in logs. Only ids, codes and sizes are logged.
- The request stays under 32 MB and 600 PDF pages.

**Never:**
- No changes to the screens, the job queue or the templates, and no migration.
- No web or server tools, and no uploads to the Files API.
- The AI never writes client or case fields; those stay bindings.
- Numbers in the texts come only from the material. Risultati stays as typed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Form, client, 3 images, 1 PDF, 1 DOCX | One working revision with the AI texts in every format, `model` and `promptVersion` set, case `in_review` | N/A |
| No key | `ANTHROPIC_API_KEY` unset | Test text, as today; meta stays null | N/A |
| More than 20 images | 25 images, 3 favourites | The 3 favourites plus the 17 oldest others | N/A |
| Video only | One video, form filled | The text comes from the form and the client only | N/A |
| Rendition not ready | An image without `image.display` | That image is skipped and its id logged | N/A |
| Refusal | `stop_reason: "refusal"` after fallbacks | The attempt fails with `LLM_REFUSAL` and the case goes back to `draft` | Not retried |
| Bad ref | A ref to an unknown asset | The attempt fails with `INVALID_SOURCE_REF` | Not retried |
| API down | 5xx, 429 or a timeout | Retryable failure; the job retries (max 3) | `LLM_UNAVAILABLE` |
| Missing aspect | No `graphic` text | The revision is written; `job_ok` data has `missingAspect: "graphic"` | N/A |

</frozen-after-approval>

## Open Questions

- **A PDF too big for the request** (over the 32 MB request budget left after the other material, or over 600 pages). The options:
  - **(A) Send its text instead.** We extract the text on our side and add a new PDF text dependency. Every word arrives, but the PDF's pictures and layout don't.
  - **(B) Send only its first pages that fit.** We cut the PDF with `pdf-lib`. Later pages are left out, and the log records it.
  - **(C) Split it across several AI calls and merge the results.** Every page arrives, but the cost and run time are higher, and this adds a summarise-then-write design.

  Recommended: (A).

## Code Map

- `src/modules/generation/application/text-source.ts` -- the seam. Its result becomes per format: `Record<FormatId, Record<TemplateTextKey, DraftText>>`, plus `meta`. `testDraftTextSource` returns the same texts for every format, with null meta.
- `src/modules/generation/application/test-draft.ts` -- `buildCaseDocument` takes per-format texts, and `formatPages` uses each format's own texts. `DraftText` gains an optional `aspect`, and the text elements get it. `buildTestDraft` and `src/worker/test-draft.ts` keep their output.
- `src/modules/generation/application/generate-case.ts` -- passes manifest assets with `isFavourite` and `kind`, plus the client info, to the source. It writes the source's `meta` and adds `missingAspect` to the `job_ok` data. It maps the new error codes, with the retryable flag from the source.
- New `src/modules/generation/application/narrative-text-source.ts` -- a `TextSource` built on the `NarrativeGenerator` port in `ports/narrative-generator.ts`. It:
  - picks the material (the rules above, up to 20 images, the byte budget);
  - reads the bytes through injected readers;
  - calls the port;
  - checks the refs and the aspects.
- New `src/modules/generation/adapters/anthropic/narrative-generator.ts`, `adapters/prompts/case-narrative.v1.ts` -- the call, the output schema and the per-format character budgets (title, subtitle, Sfida and Idea per format, measured against `mac-case@1` pages).
- New `src/modules/generation/adapters/docx/` -- DOCX to text (`mammoth`, pinned).
- `src/modules/generation/worker.ts` -- wires the source when the key is set, otherwise the test source.
- `src/modules/material/index.ts`:
  - `buildManifest` adds `isFavourite` and `kind` to each asset. The input hash and the stored manifest are unchanged (zod strips the extra keys).
  - New `readAssetBytes(assetId, "original" | "image.display")` downloads the bytes through the object storage. It is module-only and has no action.
- `src/modules/case-study/index.ts` -- `getClientInfoForCase`, used as is.
- `src/shared/env.ts` -- optional `ANTHROPIC_API_KEY` (empty counts as unset). Add it to `.env.example` and the README env table.

## Tasks & Acceptance

**Execution:**
- [ ] `env.ts`, `.env.example`, README -- add the key -- the fallback switch.
- [ ] material -- the `buildManifest` fields and `readAssetBytes`, with tests.
- [ ] `test-draft.ts`, `text-source.ts`, `generate-case.ts` -- per-format texts, aspect, meta and `missingAspect`; keep the existing tests green and extend them.
- [ ] `narrative-text-source.ts` and its test -- every matrix row, with a fake port and fake readers.
- [ ] The Anthropic adapter, the prompt and the DOCX adapter -- a request-shape test with a mocked client (params, betas, no tools, budget), plus a refusal and a fallback test.
- [ ] `generation/worker.ts`, plus a `test/web-imports.test.ts` control -- the SDK is reachable from the worker only.
- [ ] Planning:
  - 3.6 to `review` in sprint-status;
  - in `epics.md`, mark IR-OP2 and IR-NFR5 decided (owner, 2026-10-29) and drop the ⛔ on 3.6 and 3.7;
  - correct 3.7 to `done`.

**Acceptance Criteria:**
- Given the worker with a key, when a case is generated, then its draft has no "[bozza di prova]" text and the revision names the served model and the prompt version.
- Given lint, when anything outside `generation/adapters/` imports `@anthropic-ai/sdk`, then lint fails.

## Design Notes

The byte budget is 30 MB of base64, which leaves room under the 32 MB limit. Material goes in this order:
1. text (form, client, extracted documents), which always goes;
2. PDFs, oldest first, while they fit;
3. images, favourites first and then oldest first, while they fit and up to 20.

Every material item is labelled `[asset:<id>]` so the model can cite it.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: all pass

**Manual checks:**
- On `mac-recap-dev`, with a key set: generate a case that has images, a PDF and a filled form. The draft reads as Italian copy in the guide's voice, Video shows only the short title and subtitle, and nothing appears in the logs except ids.
