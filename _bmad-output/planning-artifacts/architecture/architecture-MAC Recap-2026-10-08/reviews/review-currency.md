---
review: currency
target: ARCHITECTURE-SPINE.md
date: 2026-10-08
verdict: 'PASS WITH FIXES: versions are current and real, but one AD-7 API claim is wrong and three stack assumptions need correcting'
---

# Currency and Reality-Check Review: ARCHITECTURE-SPINE.md

**Question asked:** were the committed decisions checked against reality (npm registry, vendor docs, the real starter repo, the real SDK), or written from memory?

**Method (2026-10-08):** `npm view <pkg> version|time|peerDependencies` for every Stack row. Downloaded the `@anthropic-ai/sdk@0.132.1` tarball and read its type definitions (`.d.ts`). Fetched the current `vercel/next.js` `examples/with-supabase` files from the canary branch on GitHub. Read the Next.js 16.4 docs for `proxy` and `output`. Listed the Playwright container tags on MCR. Read the Node.js release schedule. Ran web searches on TypeScript 7 with Next 16 and on S3 presigned PUT checksums.

## Verdict

**PASS WITH FIXES.** Every version in the Stack table exists on npm, and all but three are the current `latest`. The three that are behind (Next.js, Playwright, TypeScript) are behind by days or on purpose. Every named technology still exists. However:

- One rule as written will not work: AD-7 puts `fallbacks: "default"` on GA `messages.parse`.
- The chosen starter does not give us the stack the table claims (it ships Tailwind 3 and TS 5).
- The deploy model ("one image, standalone, plus a worker") has a gap the spine does not address.

## Stack table: version check

| Row | Spine | npm `latest` today | Status |
| --- | --- | --- | --- |
| Node.js | 24 LTS | 24.21.0 (Krypton); Node 26 becomes LTS 2026-10-28 | OK. Note: 24 moves to **maintenance on 2026-10-20**, 12 days from now. It stays supported until 2028-04. Fine for the MVP, but say on purpose 24 vs 26. |
| TypeScript | 6.0.3 | **7.0.2** (2026-07-08); 6.0.3 is the last 6.x | OK as a deliberate pin, but the spine gives no reason. See F4. |
| Next.js | 16.3.8 (2026-09-30) | **16.4.0** (2026-10-06) | Out of date by one minor. `create-next-app -e with-supabase` installs `next: "latest"`, which is 16.4.0, so the scaffold already contradicts the table. |
| React | 19.3.0 | 19.3.0 | Current |
| Tailwind / shadcn | 4.3.3 / 4.21.4 | 4.3.3 / 4.21.4 | Current on npm, **but not what the starter ships** (F2) |
| supabase-js / ssr / CLI | 2.117.3 / 0.12.7 / 2.120.0 | same | Current |
| @aws-sdk/client-s3 + presigner | 3.1147.0 | 3.1147.0 (2026-10-06) | Current |
| @anthropic-ai/sdk | 0.132.1 | 0.132.1 (published 2026-10-08 03:20 UTC) | Current. Peer `zod ^3.25 \|\| ^4` matches zod 4.6.5. |
| zod | 4.6.5 | 4.6.5 | Current |
| Playwright | 1.63.0 | **1.64.0** (2026-10-07) | Out of date by one minor (released yesterday). Both have `mcr.microsoft.com/playwright:v1.6x.0-noble` images. |
| pptxgenjs | 4.0.1 | 4.0.1 (2025-06-26) | Current, but **no release in about 15 months**. Fits the "PNG per slide" use. Note the maintenance risk; the PNG-per-slide design keeps it easy to replace. |
| sharp | 0.35.5 | 0.35.5 | Current |

## Technology fit: reality checks

### Next.js 16 `proxy.ts`: confirmed
The docs (v16.4.0) say `middleware` is deprecated and renamed `proxy`, and that proxy runs on the Node.js runtime by default (setting `runtime` throws). Basic auth or an allowlist in proxy (AD-12) works. Caveat from the docs: Server Functions are POSTs to their page route, so a matcher that excludes a path also skips its server actions. The docs say to authorize inside every Server Function anyway. AD-11 already requires that, so add one line to AD-12 saying the gate is a backstop, not the control.

### `output: "standalone"`: confirmed, but it does not cover the worker (F3)
The feature still exists and produces `.next/standalone/server.js`. `public/` and `.next/static` have to be copied in by hand. Standalone traces only what the Next app imports. The worker (`node src/worker`) is TypeScript source outside that trace, and it needs Playwright, Chromium, pptxgenjs and sharp. "One image, two start commands" then means a separate worker build step (for example esbuild or tsup to `dist/worker.js`) plus full production `node_modules` for the worker in the image. That cancels most of the reason for using standalone. The spine also says `web: next start`, which is not how you run a standalone build: you run `node server.js`.

### `with-supabase` example: confirmed it exists and is on Next 16, but its contents differ from the spine (F2)
Current files on the canary branch:
- `proxy.ts` and `lib/supabase/proxy.ts` (renamed from middleware in PR #86105, 2025-11-18). Last touched 2026-10-08.
- `package.json` uses `next: latest`, `@supabase/ssr: latest`, **`tailwindcss: ^3.4.1` + `tailwindcss-animate` + `autoprefixer` + `tailwind.config.ts`**, **`typescript: ^5`**, `eslint-config-next: 15.3.1`, `@types/node: ^20`.
- `next.config.ts` sets **`cacheComponents: true`**, which the spine does not mention. It changes how dynamic data has to be wrapped (Suspense boundaries), and the configurator and review pages are fully dynamic.
- shadcn `components.json` uses the new-york style with neutral colours.

So "starter gives us Tailwind 4 and TS 6" is wrong. Upgrading to Tailwind 4 (`@tailwindcss/upgrade`) and to TS 6, and aligning eslint-config-next to 16.x, is a Story 1 task the spine does not list.

### Playwright PDF/PNG in a container: confirmed
`page.pdf()` is Chromium-only and works headless. The official images `v1.63.0-noble` and `v1.64.0-noble` exist. One unconfirmed point: the Node major bundled in the Playwright image has not been checked against the Node 24 pin. Either base the image on `node:24` and run `npx playwright install --with-deps chromium`, or use the Playwright image for both processes and check its Node version.

### pptxgenjs 4: confirmed
4.0.1 is the latest. Image-per-slide (`addImage` from a data URL or path) is core, stable API. Maintenance risk as noted above.

### Supabase RLS and `supabase gen types`: confirmed in principle
With RLS enabled and no policies, the Data API denies `anon` and `authenticated`. That is the backstop AD-11 describes. Two details are missing from the spine:
- The server-only client must use the **secret / service-role key**, which bypasses RLS. Say so in AD-11 and in `env.ts`. The key must never be `NEXT_PUBLIC_`, and nothing in the `with-supabase` client helpers (which use the publishable key plus the user session) should be reused for table access.
- The type command is `supabase gen types typescript --local` (or `--project-id`) `> src/shared/db.types.ts`. Add it as a script so it is not left to memory.

The flags for CLI 2.120.0 were not run here (no local stack). This is low risk.

### S3 presigned PUT: confirmed, but there is a known gotcha (F5)
The approach (private EU bucket, Block Public Access, presigned PUT and GET, HEAD to confirm) is standard and current. Since the SDK's 2025 data-integrity defaults, `S3Client` computes CRC32 checksums by default. Presigned PUT URLs can then carry `x-amz-checksum-*` parameters, and browser uploads fail with `SignatureDoesNotMatch`. Fix: create the presigning client with `requestChecksumCalculation: "WHEN_REQUIRED"`, or sign the checksum and have the browser send it.

Separately, a presigned PUT **cannot enforce the 100 MB limit**. Either sign `ContentLength` (exact size, declared by the client), use presigned **POST** with `content-length-range`, or rely on the HEAD check and delete oversized objects. AD-8 says the limit is "checked on the server" but not how.

### TypeScript 6.0.3 vs 7 with Next 16.3.8: pin is justified, but undocumented (F4)
Next 16.3 added TS 7 support to `next build` through the native `tsc` CLI (`experimental.useTypeScriptCli`; the docs disagree on whether it is on by default). Errors then lose Next-specific code frames. More decisive: **`typescript-eslint` currently declares peer `typescript >=4.8.4 <6.1.0`**. TS 7 breaks the lint toolchain, and TS 6.0.3 sits exactly at the edge of what typescript-eslint supports. 6.0.3 is the right choice today. The spine should record why, plus the trigger to move to 7 (typescript-eslint support).

### Anthropic `claude-opus-5-5`, structured outputs, `fallbacks: "default"` in @anthropic-ai/sdk 0.132.1: partly wrong (F1)
Checked against the SDK tarball's type definitions:
- Confirmed: `claude-opus-5-5` is in the `Model` union. `output_config.format` exists on GA `MessageCreateParams`. GA `client.messages.parse()` exists with `zodOutputFormat()` from `@anthropic-ai/sdk/helpers/zod`. Adaptive thinking (`{type: "adaptive"}`) exists.
- **Wrong as written:** `fallbacks` exists **only on the beta surface** (`resources/beta/messages/messages.d.ts`: `fallbacks?: BetaFallbacksParam | null`, where `BetaFallbacksParam = Array<...> | 'default'`). It is not on GA `messages.parse` or `messages.create`. Anthropic's docs say the `"default"` form needs `betas: ["server-side-fallback-2026-07-01"]`. Sending that header with the array form, or the array form's header with `"default"`, returns 400. It works on the Claude API and Claude Platform on AWS only, not Bedrock, Vertex or Foundry. The working call is `client.beta.messages.parse({ model: "claude-opus-5-5", betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { format: betaZodOutputFormat(schema), effort: ... }, thinking: { type: "adaptive" }, ... })`. Both `betaZodOutputFormat` (`helpers/beta/zod`) and `client.beta.messages.parse` exist in 0.132.1.
- **Follow-on for AD-7's audit rule:** with fallbacks on, a refused request can be **served by a different model**. Sticky routing can keep it on that model for about an hour. Recording the constant model id per revision would then be false. Record `response.model` (and whether `usage.iterations` contains a `fallback_message`), not the constant.
- **Not stated:** on Opus 5.5 thinking cannot be disabled, and **effort defaults to `medium`**. Set `output_config.effort` explicitly in the adapter. Also check `stop_reason === "refusal"` before reading parsed output, because a fallback can also refuse.

## Findings

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| F1 | High | AD-7: `fallbacks: "default"` is beta-only in SDK 0.132.1. It is not on GA `messages.parse`, and it needs the `server-side-fallback-2026-07-01` beta. With fallbacks on, "record model" would also record the wrong model. | Use `client.beta.messages.parse` + `betaZodOutputFormat` + `betas: ["server-side-fallback-2026-07-01"]`. Record `response.model` and a fallback flag per revision. Set `effort` explicitly (Opus 5.5 defaults to `medium`). Handle `stop_reason: "refusal"`. |
| F2 | Medium | The `with-supabase` starter ships Tailwind **3.4**, TS **^5**, eslint-config-next 15.3.1, `next: latest` (16.4.0) and `cacheComponents: true`. That does not match the Stack table, and the spine does not mention it. | Add a Story 1 scaffold step: pin `next` and `@supabase/*` exactly, run the Tailwind 4 upgrade, bump TS to 6.0.3 and eslint-config-next to 16.x. Decide on `cacheComponents` on purpose and record it. |
| F3 | Medium | `output: standalone` traces only the Next app. The worker (Playwright, Chromium, pptxgenjs, sharp, TS source) is not in it. The spine's `web: next start` is also not how a standalone build runs. | State the image layout: a standalone web (`node server.js` plus copied `public` and `.next/static`) and a separately bundled worker with full prod deps and Chromium. Or drop standalone and use `next start` with full `node_modules`. |
| F4 | Low | Versions behind by days: Next 16.3.8 (16.4.0 is out), Playwright 1.63.0 (1.64.0 is out). The TS 6.0.3 pin over 7.0.2 has no recorded reason. Node 24 goes to maintenance 2026-10-20. | Either bump to 16.4.0 / 1.64.0 or mark them as deliberate pins. Record the TS reason (typescript-eslint peer `<6.1.0`; Next's TS 7 path is CLI-only) and the trigger for moving to 7. Note that Node 24 vs 26 is a deliberate choice. |
| F5 | Low | AD-8 does not cover the AWS SDK v3 default CRC32 checksums, which break browser presigned PUTs. A presigned PUT also cannot enforce the 100 MB limit. | Use `requestChecksumCalculation: "WHEN_REQUIRED"` on the presigning client. Enforce size by signing `ContentLength` or using presigned POST `content-length-range`, plus the existing HEAD check (delete objects that are too large). |
| F6 | Low | AD-11 does not say which Supabase key the server-only client uses. RLS deny-all works only if that client bypasses RLS on purpose. `supabase gen types` is not scripted. pptxgenjs has not had a release since 2025-06. | Name the secret / service-role key (server-only, never `NEXT_PUBLIC_`) in AD-11 and `env.ts`. Add a `db:types` script. Note pptxgenjs maintenance risk under Deferred, with the PNG-per-slide design as the way out. |

## Not confirmed (out of reach in this review)
- `supabase gen types` flags on CLI 2.120.0 were not run (no local stack).
- The Node major inside the `mcr.microsoft.com/playwright:v1.63.0-noble` image was not checked.
- Whether `claude-opus-5-5` lists default fallback targets on this org's account was not checked against the live Models API (`allowed_fallback_models`), because no API call was made.

## Sources
- npm registry (`npm view`), 2026-10-08
- `@anthropic-ai/sdk@0.132.1` tarball: `resources/messages/messages.d.ts`, `resources/beta/messages/messages.d.ts`, `helpers/zod.d.ts`, `helpers/beta/zod.d.ts`
- https://github.com/vercel/next.js/tree/canary/examples/with-supabase (package.json, proxy.ts, next.config.ts, components.json)
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy (v16.4.0)
- https://nextjs.org/docs/app/api-reference/config/next-config-js/output (v16.4.0)
- https://nextjs.org/docs/app/api-reference/config/typescript ; https://www.achromatic.dev/blog/nextjs-16-3-typescript-7-upgrade
- https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- https://mcr.microsoft.com/v2/playwright/tags/list
- https://github.com/aws/aws-sdk-js-v3/issues/6994 ; https://docs.aws.eu/sdkref/latest/guide/feature-dataintegrity.html
