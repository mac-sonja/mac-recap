---
review: currency
round: 2
target: ARCHITECTURE-SPINE.md (update of 2026-10-08, PPTX removed, text/DOCX uploads added)
date: 2026-10-08
verdict: 'PASS WITH FIXES: every Stack version is real and checked, AD-7 is now correct against SDK 0.132.1, but the ffmpeg row is not true of the base image and AD-18 has an unstated size gap for native PDF input'
---

# Currency and Reality-Check Review, round 2

**Question asked:** after this update, is every committed technology decision checked against reality rather than stated from memory? Focus: what the update introduced or changed, versions that may be stale, the AD-7 Anthropic SDK features, and whether the Anthropic API takes PDFs natively (AD-18).

**Method (2026-10-08):** `npm view <pkg> version`, `time`, `engines` and `peerDependencies` for every Stack row. Downloaded and read the `@anthropic-ai/sdk@0.132.1` tarball's type definitions. Read the Anthropic PDF support docs (platform.claude.com/docs/en/build-with-claude/pdf-support). Read the Playwright v1.63.0 `Dockerfile.noble`, `nativeDeps.ts` and `browsers.json` on GitHub. Listed the Playwright tags on MCR. Compared the spine diff (`git diff`) with the round-1 review (`review-currency.md`) and the memlog.

## What changed in this update (technology-relevant)

| Change | Reality check | Status |
| --- | --- | --- |
| pptxgenjs removed (Stack, AD-9, paradigm vendor list, pipeline diagram) | No remaining reference in the spine. Deck exports as PDF via Playwright. | Clean |
| AD-8: presigned **PUT** replaced by presigned **POST** with `content-length-range` | `@aws-sdk/s3-presigned-post@3.1147.0` exists (published 2026-10-06) and is `latest`. This closes round-1 F5 (size not enforceable on PUT). | Confirmed |
| AD-8: `requestChecksumCalculation: "WHEN_REQUIRED"` | Fix came from round 1 for PUT. `createPresignedPost` does not add `x-amz-checksum-*` query parameters, so the setting is harmless but not strictly needed for POST. Keep it if the same client also signs GETs. | Confirmed (low note N4) |
| AD-8: allowlist adds plain text, Markdown, DOCX `[ASSUMPTION]` | No library bound. See the AD-18 section below for what the API accepts. | OK as an assumption |
| AD-7: `client.beta.messages.parse`, adaptive thinking, `effort: "high"`, beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`, record `response.model` + `fellBack` | All confirmed in SDK 0.132.1 types (details below). Closes round-1 F1. | Confirmed |
| Stack: TS 6.0.3, Next 16.3.8, Playwright 1.63.0 pins; starter note about Tailwind 3.4 / TS 5 / `cacheComponents` | Matches round-1 findings and today's registry. The spine now says the first story pins and upgrades, and sets `cacheComponents` off. | Confirmed |
| Stack: `sharp / ffmpeg ... 7.x from the base image` | **Not true of the Playwright base image** (F1 below). | Not confirmed |
| Deferred: "Text extraction for DOCX and PDF ... library chosen in Story 2.3 ... and verified then" | Fine as a deferral; no unchecked library is committed. | OK |

## Stack table: versions against npm today

| Row | Spine | npm `latest` (2026-10-08) | Pinned version published | Status |
| --- | --- | --- | --- | --- |
| Node.js | 24 LTS | 24.x (Node 26 becomes LTS 2026-10-28) | n/a | OK. Every package's `engines` accepts 24 (`next >=20.9`, `sharp >=20.9`, `supabase-js >=22`). The Playwright 1.63.0 image ships Node 24 (`ARG NODE_VERSION=24`), which closes a round-1 open item. |
| TypeScript | 6.0.3 | 7.0.2 | 2026-04-16 | Deliberate pin (typescript-eslint support). The spine still gives no reason in the table (N2). |
| Next.js | 16.3.8 | 16.4.0 (2026-10-06) | 2026-09-30 | Deliberate pin, one minor behind. Peer React `^19` matches. |
| React | 19.3.0 | 19.3.0 | | Current. `react-dom` is not listed; pin it to the same version. |
| Tailwind / shadcn | 4.3.3 / 4.21.4 | same | | Current |
| supabase-js / ssr / CLI | 2.117.3 / 0.12.7 / 2.120.0 | same | | Current |
| `@aws-sdk/client-s3`, `s3-presigned-post`, `s3-request-presigner` | 3.1147.0 | 3.1147.0 for all three | 2026-10-06 | Current. `s3-presigned-post` is new in this update and was not in the memlog's version event; now checked. |
| `@anthropic-ai/sdk` | 0.132.1 | 0.132.1 | 2026-10-08 03:20 UTC | Current. Peer `zod ^3.25 \|\| ^4` matches zod 4.6.5. Released today: expect a newer patch soon, keep the exact pin. |
| zod | 4.6.5 | 4.6.5 | | Current |
| Playwright | 1.63.0 | 1.64.0 (2026-10-07) | 2026-09-04 | Deliberate pin. MCR has `v1.63.0`, `-noble`, `-jammy` and `-resolute` tags. The spine names the image but not the tag (N3). |
| sharp | 0.35.5 | 0.35.5 | | Current |
| ffmpeg | 7.x from the base image | n/a | n/a | **Wrong** (F1) |

No version in the table is fabricated or stale beyond the deliberate pins already recorded.

## AD-7: Anthropic SDK features, checked in the 0.132.1 type definitions

- `client.beta.messages.parse(params)` exists (`resources/beta/messages/messages.d.ts`, returns `ParsedBetaMessage`). `betaZodOutputFormat(zodSchema)` exists in `helpers/beta/zod`. **Confirmed.**
- `fallbacks?: BetaFallbacksParam | null` with `BetaFallbacksParam = Array<BetaFallbackParam> | 'default'` is on the beta params. It is absent from the GA `messages.d.ts`, so the spine's switch to the beta surface is required and correct. **Confirmed.**
- `'server-side-fallback-2026-07-01'` is in the `AnthropicBeta` union. So is an older `'server-side-fallback-2026-06-01'`, plus `'fallback-credit-2026-0x-01'`. The spine names the right (newer) one. Round 1 reported from the docs that `"default"` needs the 07-01 header specifically and that mixing forms returns 400. **Confirmed (header exists); pairing rule taken from round 1's docs read.**
- `effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null` is on `BetaOutputConfig` (and GA `OutputConfig`). So the call must pass it as `output_config: { format, effort: "high" }`, not as a top-level `effort`. The spine writes `effort: "high"` without a location (N1).
- Adaptive thinking: `thinking: { type: 'adaptive' }` exists on both surfaces. **Confirmed.**
- `stop_reason: 'refusal'` is in `StopReason`. **Confirmed.** The fallback signal is a `fallback_message` entry in `usage.iterations` (type comment at line 3668 of the beta types), which is what `fellBack` should be derived from.
- `claude-opus-5-5` is in the `Model` union. **Confirmed.**

Not confirmed: whether this org's account has default fallback targets for `claude-opus-5-5` (needs a live Models API call), and the Opus 5.5 effort default (round 1 reported `medium` from docs; not re-read).

## AD-18: does the Anthropic API take PDF natively?

**Yes, PDF is native and GA.** The GA SDK has `DocumentBlockParam` with `source: Base64PDFSource ('application/pdf') | PlainTextSource ('text/plain') | ContentBlockSource | URLPDFSource | FileDocumentSource`. The docs mark PDF support GA on the Claude API, AWS, Bedrock, Google Cloud and Foundry, with no beta header (the old `pdfs-2024-09-25` beta is no longer needed). Each page is processed as text plus an image, so charts and layouts in client PDFs are visible to the model.

Facts that matter for AD-18 and are not in the spine:

- **Request size limit is 32 MB, but AD-8 allows 100 MB uploads.** The limit applies to the whole request, so a base64-inlined PDF larger than about 24 MB (base64 adds a third) fails. The docs' answer is the Files API (`file_id`), which needs the `files-api-2025-04-14` beta and stores client material on Anthropic's side (check retention against the NDA clearance in the memlog). Even with the Files API, the docs warn large PDFs can fail. See F2.
- **Page limit:** 600 pages per request, or 100 when the request's context window is under 1M tokens. Text costs about 1,500 to 3,000 tokens per page plus image tokens. A case with several long PDFs can exceed the context or cost budget.
- **DOCX is not accepted.** The docs say binary formats such as .docx must be converted to text or PDF first. So DOCX always needs an extraction step (the spine's Deferred item is correct and necessary).
- **Plain text and Markdown** go in as `text/plain` document blocks or as ordinary text. No library needed.
- **Video is not an API input.** Only images, PDF and text. The spine already routes video handling to OP 2; it will need poster frames or transcripts produced in the worker.
- Note: the Deferred section names the extraction item "Text extraction for DOCX and PDF". Given native PDF input, PDF extraction is optional (only for oversized files or cost control). Worth saying so, so Story 2.3 does not add a PDF text library by default.

## Findings

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| F1 | Medium | Stack row "ffmpeg 7.x from the base image" is not confirmed and looks wrong. The Playwright image (`Dockerfile.noble`, v1.63.0) installs Chromium's system deps and Playwright's own ffmpeg build (`browsers.json` revision 1011, in `/ms-playwright/ffmpeg-*`). That build exists for Playwright's video recording and is not a general-purpose ffmpeg for MP4/MOV poster frames and transcodes. The Ubuntu 24.04 deps list for Chromium does not include the `ffmpeg` apt package. Ubuntu 24.04's own `ffmpeg` package is 6.1.x, not 7.x (from distro knowledge, not checked today). | In the Dockerfile, install ffmpeg explicitly: `apt-get install ffmpeg` on `-noble` (6.1.x) or a pinned static build. Then record that version in the Stack table. Alternatively use the `v1.63.0-resolute` tag (Ubuntu 26.04) and check which ffmpeg it ships. Do not call Playwright's bundled ffmpeg. |
| F2 | Medium | AD-8 allows 100 MB uploads, but an Anthropic request is capped at 32 MB (whole payload) and 600/100 pages. AD-18 hands "how PDF becomes LLM input" to OP 2 without noting that large PDFs cannot be sent inline. | Add one line to AD-18 or Deferred: PDFs go in as native `document` blocks while under the request limit; larger ones need the Files API (beta `files-api-2025-04-14`, data stored at Anthropic) or splitting/text extraction in the worker. Decide with OP 2. Note that DOCX always needs conversion and video is not an API input. |
| N1 | Low | AD-7 says "`effort: "high"`" without saying where. In SDK 0.132.1, `effort` lives in `output_config`, next to `format`. | Write `output_config: { format: betaZodOutputFormat(schema), effort: "high" }`. |
| N2 | Low | The TS 6.0.3, Next 16.3.8 and Playwright 1.63.0 pins have no reason in the spine (the memlog has them). Round-1 F4 asked for the reason and the upgrade trigger. | One line under the Stack table: Next and Playwright pinned one minor behind as releases under a week old; TS 6.0.3 because typescript-eslint does not support 7 yet. Pin `react-dom` with `react`. |
| N3 | Low | The base image has no tag. MCR offers `-jammy`, `-noble` and `-resolute` per version, and they differ in OS packages (ffmpeg, fonts). | Name `mcr.microsoft.com/playwright:v1.63.0-noble` (or the chosen one) so it moves with the `playwright` pin. |
| N4 | Info | `requestChecksumCalculation: "WHEN_REQUIRED"` was a fix for presigned PUT. With presigned POST it is harmless. | Keep it. No change needed. |

## Closed since round 1

- F1 (AD-7 `fallbacks` on GA parse): fixed. Beta parse, the correct beta header, `response.model` and `fellBack` recorded, refusal handled.
- F2 (starter mismatch): fixed. The Stack note says the first story pins, moves Tailwind to 4, and turns `cacheComponents` off.
- F3 (standalone vs worker): fixed. `node server.js` plus a bundled `dist/worker.js` with full deps.
- F5 (presigned PUT size and checksum): fixed by presigned POST with `content-length-range`.
- F6 (pptxgenjs maintenance): moot, the library is removed.
- Round-1 open item "Node major in the Playwright image": checked, it is Node 24.

## Not confirmed

- ffmpeg version in any Playwright image tag (F1). Read from the Dockerfile and deps list, not from a pulled image.
- Opus 5.5's context window (decides 600 vs 100 PDF pages) and its effort default.
- Whether the account has default fallback targets for `claude-opus-5-5`.
- Anthropic Files API retention terms against the client NDA.
- `supabase gen types` flags on CLI 2.120.0 (carried from round 1).

## Sources

- npm registry (`npm view`), 2026-10-08
- `@anthropic-ai/sdk@0.132.1` tarball: `resources/messages/messages.d.ts`, `resources/beta/messages/messages.d.ts`, `resources/beta/beta.d.ts`, `helpers/beta/zod.d.ts`
- https://platform.claude.com/docs/en/build-with-claude/pdf-support
- https://raw.githubusercontent.com/microsoft/playwright/v1.63.0/utils/docker/Dockerfile.noble
- https://raw.githubusercontent.com/microsoft/playwright/v1.63.0/packages/playwright-core/src/server/registry/nativeDeps.ts and `browsers.json`
- https://mcr.microsoft.com/v2/playwright/tags/list
- `reviews/review-currency.md` (round 1), `.memlog.md`, `git diff` of the spine
