---
title: 'Story 3.6: Narrative generator port and Anthropic adapter'
type: 'feature'
created: '2026-10-29'
status: 'done'
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
- A PDF too big for the request (over the byte budget left after the other material, or over 600 pages) is sent as its text, extracted on our side (option A). Its pictures and layout don't arrive; the log records it by id.
- Spec kept whole at about 1,900 tokens.

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
| Oversized PDF | A 40 MB PDF, or one over 600 pages | Sent as its extracted text; logged by id | N/A |
| Bad ref | A ref to an unknown asset | The attempt fails with `INVALID_SOURCE_REF` | Not retried |
| API down | 5xx, 429 or a timeout | Retryable failure; the job retries (max 3) | `LLM_UNAVAILABLE` |
| Missing aspect | No `graphic` text | The revision is written; `job_ok` data has `missingAspect: "graphic"` | N/A |

</frozen-after-approval>

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
- New `src/modules/generation/adapters/docx/` -- DOCX to text (`mammoth`, pinned). New `adapters/pdf/` -- PDF page count and text (`unpdf`, pinned), for an oversized PDF.
- `src/modules/generation/worker.ts` -- wires the source when the key is set, otherwise the test source.
- `src/modules/material/index.ts`:
  - `buildManifest` adds `isFavourite` and `kind` to each asset. The input hash and the stored manifest are unchanged (zod strips the extra keys).
  - New `readAssetBytes(assetId, "original" | "image.display")` downloads the bytes through the object storage. It is module-only and has no action.
- `src/modules/case-study/index.ts` -- `getClientInfoForCase`, used as is.
- `src/shared/env.ts` -- optional `ANTHROPIC_API_KEY` (empty counts as unset). Add it to `.env.example` and the README env table.

## Tasks & Acceptance

**Execution:**
- [x] `env.ts`, `.env.example`, README -- add the key -- the fallback switch.
- [x] material -- the `buildManifest` fields and `readAssetBytes`, with tests.
- [x] `test-draft.ts`, `text-source.ts`, `generate-case.ts` -- per-format texts, aspect, meta and `missingAspect`; keep the existing tests green and extend them.
- [x] `narrative-text-source.ts` and its test -- every matrix row, with a fake port and fake readers.
- [x] The Anthropic adapter, the prompt and the DOCX adapter -- a request-shape test with a mocked client (params, betas, no tools, budget), plus a refusal and a fallback test.
- [x] `generation/worker.ts`, plus a `test/web-imports.test.ts` control -- the SDK is reachable from the worker only.
- [x] Planning:
  - 3.6 to `review` in sprint-status;
  - in `epics.md`, mark IR-OP2 and IR-NFR5 decided (owner, 2026-10-29) and drop the ⛔ on 3.6 and 3.7;
  - correct 3.7 to `done`.

**Acceptance Criteria:**
- Given the worker with a key, when a case is generated, then its draft has no "[bozza di prova]" text and the revision names the served model and the prompt version.
- Given lint, when anything outside `generation/adapters/` imports `@anthropic-ai/sdk`, then lint fails.

## Implementation Notes

- **Code Map deviation:** `material.buildManifest` is unchanged. A new `material.listGenerationAssets` gives the handler `{ id, kind, contentType, sizeBytes, isFavourite }`. This keeps the job payload, its input hash and the stored manifest exactly as in 3.7 (the DB test's manifest assertion still holds).
- `material.readAssetBytes` lives on the material index (storage is material's). Application code doesn't build keys: the original's key is injected from `adapters/asset-key.ts`.
- The document's `materialRefSchema` has only `asset` and `form_field`. The AI may cite `client_field` (checked like the others), but those refs are dropped when the document is built: client values are bindings, never material refs.
- Structured outputs need every field required, so `aspect` in the output schema is `technical | graphic | none`; `none` is dropped before the document.
- `max_tokens` is 16,000 on a non-streaming `parse` (under the SDK's non-streaming limit). Thinking at high effort shares it. `LLM_TRUNCATED` is retryable if it is ever hit.
- The system prompt carries `cache_control` (stable across cases).
- Extracted text is capped at 600,000 characters for all documents together. Any cut is logged by asset id, never silent.
- Errors:
  - `LLM_REFUSAL`, `LLM_REQUEST_REJECTED` (other 4xx) and `INVALID_SOURCE_REF` are final.
  - `LLM_UNAVAILABLE` (408, 409, 429, 5xx, network), `LLM_OUTPUT_INVALID`, `LLM_TRUNCATED`, `MATERIAL_READ_FAILED` and `CLIENT_LOOKUP_FAILED` are retryable.
  - A permanent failure returns the case to `draft` through the existing `onPermanentFailure`.
- The worker chooses the text source on the first job, not at registration, so `workerHandlers()` needs no environment. `ANTHROPIC_API_KEY` is optional in `env.ts`.
- New lint rule: `@anthropic-ai/*` only in `src/modules/generation/adapters/anthropic/`, tested in `test/lint-boundaries.test.ts`. The web-import check now also guards `adapters/anthropic` and `adapters/documents`.
- New dependencies, pinned: `mammoth@1.13.0` and `unpdf@1.8.1`. A CJS esbuild bundle of the document reader was smoke-run: PDF text extracted, a non-DOCX rejected.
- **Planning:**
  - IR-OP2, IR-NFR5 and IR-OP14 are marked decided in `epics.md`; IR-OP14 follows from the owner's "favourites first" rule.
  - The ⛔ is dropped from 3.6 and 3.7.
  - 3.7 is set to `done` in sprint-status.
- **Not run here:**
  - a real API call (no key in this session);
  - `npm run test:db` (no local Supabase). `test/db/generate.db.test.ts` builds the handler without a key, so it keeps writing the test text.

## Spec Change Log

## Review Triage Log

Reviewed inline by the implementing session (owner's choice, 2026-10-29), from three angles: blind (bugs), edge cases and verification gaps.

| # | Layer | Finding | Verdict | Evidence / route |
|---|-------|---------|---------|------------------|
| 1 | edge | 600 whole PDF pages (text plus a page image each, about 1,500–3,000 tokens) can pass the 1M-token context, giving a 400 that fails the draft for good | medium | The API's page limit is below what the context allows. Patched: whole PDFs stop at 200 pages over all PDFs, and further PDFs go as text (test added). |
| 2 | edge | A display copy over the API's 5 MB image limit gives a 400 (`LLM_REQUEST_REJECTED`, final) | low | `image.display` is 2048 px WebP at q85, so this is rare, and the fix is a direct check. Patched: such an image is left out (test added). |
| 3 | blind | The job's abort signal does not reach the SDK call, so on worker shutdown the call runs on until the process exits | low | The job is released and retried, and the result of the cut-off call is never written. Only cost is lost, once per shutdown, and the fix adds a parameter through the seam. Rejected. |
| 4 | blind | Two keys with the same AI text in one format share refs and aspect (the document matches texts by value) | low | Cosmetic (refs and aspect are not shown for the demo, C39), unlikely, and the fix needs keyed matching in `buildCaseDocument`. Rejected. |
| 5 | verification | No test runs DOCX extraction on a real DOCX | low | `mammoth.extractRawText` is the library's main path. The adapter is three lines and its rejection path is tested. Building a DOCX in a test needs a zip writer that isn't a dependency. Rejected. |
| 6 | edge | The AI may cite a video's id (in the manifest) that it never saw | low | It passes the ref check by design: the spec checks refs against the manifest. Only the citation is affected, and the demo shows none (C39). Rejected. |

## Design Notes

The byte budget is 30 MB of base64, which leaves room under the 32 MB limit. Material goes in this order:
1. text (form, client, extracted documents), which always goes;
2. PDFs, oldest first, while they fit and their pages stay within 200 over all PDFs (this keeps the request inside the context; review #1);
3. images, favourites first and then oldest first, while they fit and up to 20, each at most 5 MB.

Every material item is labelled `[asset:<id>]` so the model can cite it.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: all pass

**Manual checks:**
- On `mac-recap-dev`, with a key set: generate a case that has images, a PDF and a filled form. The draft reads as Italian copy in the guide's voice, Video shows only the short title and subtitle, and nothing appears in the logs except ids.
