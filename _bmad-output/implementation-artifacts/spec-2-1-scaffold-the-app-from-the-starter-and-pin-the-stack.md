---
title: 'Story 2.1: Scaffold the app from the starter and pin the stack'
type: 'chore'
created: '2026-10-09'
status: 'done'
baseline_commit: '5b88a22a18ed62e48dbfac3ce2e3db3ca549b306'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-MAC Recap-2026-10-08/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repo holds only planning docs. Every Epic 2+ story needs one shared, exactly pinned stack with module boundaries enforced by tooling, not by convention.

**Approach:** Generate the app with `npx create-next-app -e with-supabase` at the repo root, move it under `src/`, pin every Stack version exactly, upgrade Tailwind 3.4 → 4.3.3, create the module skeleton plus `src/shared` primitives, and add lint/typecheck/test scripts and a CI workflow that runs them.

## Boundaries & Constraints

**Always:** Exact versions only (no `^`, `~`, `latest`) for every dependency, dev deps included. Node 24 LTS via `.nvmrc` and `engines`. `next.config.ts`: `output: 'standalone'`, `cacheComponents: false`. `process.env` is read only in `src/shared/env.ts`. Keep existing repo content (`_bmad*`, `docs/`, `.claude/`) untouched.

**Never:** No `src/modules/integration` and no MCP client dependency. No DB tables or migrations (2.3+ create tables). No Dockerfile, basic-auth gate or worker bundling (Story 2.2). No app shell, tokens or dictionary (Story 2.4). No starter auth pages kept as product UI: delete the starter's demo/auth routes and components, leaving a minimal dynamic placeholder page.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| App imports module internals | `src/app/x.ts` imports `@/modules/material/domain/files` | `npm run lint` fails naming the rule | N/A |
| Module imports another's internals | `modules/generation/**` imports `modules/material/application/*` | lint fails | N/A |
| Vendor SDK outside adapters | `modules/case-study/application/a.ts` imports `@supabase/supabase-js` | lint fails | N/A |
| Domain impurity | `modules/x/domain/a.ts` imports `@/modules/*`, its own `application/` or any package except `zod` | lint fails; only `@/shared/*`, same-domain files and `zod` allowed (zod schemas live in `domain/` per architecture) | N/A |
| Integration reserved | any file under `src/modules/integration/` | lint fails | N/A |
| Allowed import | `src/app` imports `@/modules/material` (its `index.ts`) | lint passes | N/A |
| Env missing | required var absent | `env.ts` throws a zod error listing the var | fail fast at startup |
| Logger | `log.info('x', { caseId })` | one JSON line on stdout with `level`, `msg`, `time`, `caseId` | N/A |

</frozen-after-approval>

## Code Map

- No application code exists. Repo root holds `_bmad/`, `_bmad-output/`, `docs/`, `.claude/`, `.gitignore` (only `.DS_Store`). Remote is GitHub (`mac-sonja/mac-recap`), so CI is GitHub Actions.
- Starter (`with-supabase`) ships `app/`, `components/`, `lib/supabase/*`, `middleware.ts`/`proxy.ts`, Tailwind 3.4 config, `next: latest`, `cacheComponents: true`. Move needed bits under `src/`; Supabase client helpers go to `src/modules/access/adapters/supabase/` (vendor SDK → adapters only).
- All Stack versions verified on npm 2026-10-09. Decided tooling (not in architecture): Vitest 5.0.3 for tests, ESLint 10 flat config with `no-restricted-imports` overrides per path glob (or `eslint-plugin-boundaries` 7.2.0 if globs can't express the rules), GitHub Actions on Node 24.
- Local machine has Node 24.18 / npm 11.16 but no Docker and no global Supabase CLI; `supabase@2.120.0` is a pinned devDependency.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `package-lock.json` -- scaffold from starter, then pin: next 16.3.8, react/react-dom 19.3.0, typescript 6.0.3, tailwindcss + @tailwindcss/postcss 4.3.3, shadcn 4.21.4, @supabase/supabase-js 2.117.3, @supabase/ssr 0.12.7, supabase (dev) 2.120.0, @aws-sdk/client-s3 + s3-presigned-post + s3-request-presigner 3.1147.0, @anthropic-ai/sdk 0.132.1, zod 4.6.5, playwright 1.63.0, sharp 0.35.5; `engines.node ">=24 <25"`; scripts `dev`, `build`, `lint`, `typecheck`, `test`, `db:start`, `db:types` -- one stack for all stories
- [x] `.nvmrc`, `.npmrc` (`save-exact=true`), `.gitignore` -- Node 24, keep pins exact, ignore `node_modules`, `.next`, `dist`, `.env*.local`
- [x] `next.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `tsconfig.json` -- standalone, cacheComponents off, Tailwind 4 CSS-first setup, `@/*` → `src/*`
- [x] `src/app/{layout,page}.tsx` -- minimal dynamic placeholder; starter demo/auth removed
- [x] `src/modules/{case-study,material,generation,rendering,sharing,access,jobs}/{domain,application}/.gitkeep` + `index.ts` -- skeleton with empty public surfaces
- [x] `src/worker/index.ts` -- placeholder entry (bundled in 2.2)
- [x] `src/shared/env.ts` -- zod schema for Supabase URL, publishable and secret keys; the only `process.env` reader
- [x] `src/shared/result.ts` -- `Result<T, AppError>`, `ok`, `err`, `AppError { code, message, details? }` with SCREAMING_SNAKE code type
- [x] `src/shared/log.ts` -- JSON stdout logger accepting `caseId`, `jobId`, `actorId`
- [x] `eslint.config.mjs` -- boundary rules from the I/O matrix
- [x] `test/lint-boundaries.test.ts`, `src/shared/*.test.ts`, `vitest.config.ts` -- lint fixtures for every matrix row (via ESLint Node API on in-memory code), unit tests for result/env/log
- [x] `supabase/config.toml` -- `supabase init` output; `db:types` writes `src/shared/db.types.ts`
- [x] `.github/workflows/ci.yml` -- `npm ci`, lint, typecheck, test on Node 24
- [x] `README.md` -- documented local setup (Docker, `npm run db:start`, `db:types`, env vars)

**Acceptance Criteria:**
- Given `package.json`, when any dependency spec is checked, then none contains `^`, `~` or `latest` (enforced by a test).
- Given the scaffold, when `src/` is listed, then it has `app/`, `worker/`, `shared/` and the seven modules each with `domain/`, `application/`, `index.ts`, and no `integration` module or MCP dependency.
- Given a clean checkout, when `npm ci && npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.
- Given Docker running, when `npm run db:start && npm run db:types` run, then `src/shared/db.types.ts` is written.

## Implementation Notes

- Lint stack: `eslint` 10.12.0 + `@eslint/js`, `typescript-eslint`, `@next/eslint-plugin-next` 16.3.8 and `eslint-plugin-react-hooks`. `eslint-config-next` was not used: its `eslint-plugin-react` dependency declares a peer of ESLint <=9.
- Boundaries use `no-restricted-imports` regex patterns per path glob (no `eslint-plugin-boundaries`). To make cross-module checks possible without a resolver, `src/modules/**` allows only `./` relative imports; cross-folder imports use the `@/modules/...` alias. `process.env` outside `src/shared/env.ts` is also a lint error.
- Env vars are server-only: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (no `NEXT_PUBLIC_`). `src/instrumentation.ts` validates them at server boot and exits 1 if invalid; `next build` does not need them.
- `vitest.config.mts` (not `.ts`) so Vite loads it as ESM without `"type": "module"` in package.json.
- Starter `proxy.ts`, browser client and session-refresh helper were dropped; only the cookie-aware server client moved to `src/modules/access/adapters/supabase/server.ts`. Story 2.2 writes `proxy.ts` (basic auth).
- `components.json` points shadcn at `src/app/globals.css`, `@/app/_components` and `@/shared/utils` (`cn`, keeps `clsx` + `tailwind-merge`); Story 2.4 may move these.
- Review pass 1: boundary rules now reject any `..` segment, dynamic `import()`/`require`, all `process.env` spellings, and cover a `src/**` catch-all; CI runs `npm run build`. `register()` loads `src/instrumentation-node.ts` only when `NEXT_RUNTIME === "nodejs"` (the one lint-exempted `process.env` read, a Next build-time constant); verified the standalone server exits 1 with no env.

## Spec Change Log

## Review Triage Log

Pass 1 (blind-hunter, edge-case-hunter, verification-gap):

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| `./../` relative and `@/x/../` alias paths bypass module/domain rules | high | patch | Probed with repo ESLint: all three forms lint clean. |
| Dynamic `import()` / `require` bypass boundaries | medium | patch | Probed: `import("@supabase/ssr")` in src/app lints clean. |
| `process["env"]`, `const {env}=process` bypass PROCESS_ENV | medium | patch | Probed: both lint clean. |
| Files in src/ outside known layers get no import rules | medium | patch | Probed: src/lib/x.ts importing vendor SDK + module internals lints clean. |
| `@playwright/*` not in VENDOR_SDK | low | patch | Probed: `@playwright/test` in src/app lints clean; one-regex fix. |
| src/shared may import @/app, @/worker; no shared-layer fixtures | low | patch | Shared layer bans only modules; direct pattern add. |
| No fixture for known-module adapter → other module internals | medium | patch | verification-gap, pre-verified. |
| Fail-fast `register()` untested | medium | patch | verification-gap, pre-verified; matrix row "Env missing". |
| Only `info` log level asserted | low | patch | verification-gap, pre-verified; cheap it.each. |
| Env error naming several missing vars untested | low | patch | Matrix says "listing the var"; only single-missing case tested. |
| CI doesn't run `npm run build` | medium | patch | ci.yml stops after test; AC requires build. |
| `.gitignore` misses `.env.production` etc. | medium | patch | Only `.env` and `.env*.local` ignored; secret leak risk. |
| `db:types` redirect truncates file on failure | low | patch | Shell `>` truncates before gen runs; direct fix. |
| `seed.sql` referenced but missing; no migrations dir | low | patch | config.toml `[db.seed]` path absent; README lists migrations/. |
| tsconfig includes `_bmad*`, docs, .claude | low | patch | `**/*.ts` with only node_modules/supabase excluded. |
| `register()` exits during `next build` without env | false | — | `npm run build` passed with no .env file present. |
| `register()` has no NEXT_RUNTIME guard for edge | medium | patch | Confirmed after pass-1 patches: `next build` warned "process.exit ... not supported in the Edge Runtime". Fixed by splitting to `instrumentation-node.ts` behind a `NEXT_RUNTIME === "nodejs"` check. |
| `db.types.ts` commit policy undecided | medium | defer | First adapter importing it is Story 2.3; CI has no Docker. |
| No service-role Supabase client | false | — | Not in 2.1 scope; Story 2.3 creates the first table access. |
| Logger has no level threshold / error-code field | low | reject | Feature request; no current caller harmed. |
| `ErrorCode = Uppercase<string>` admits `NO-MATERIAL`, `""` | low | reject | Codes are authored constants; full SCREAMING_SNAKE typing needs extra machinery. |
| Logger crashes in edge/client; non-string ids via cast | low | reject | Server-only module; ids typed as string. |
| Cookie `setAll` swallows all errors | low | reject | Starter pattern, unused until Epic 6. |
| `z.url()` accepts non-http; whitespace-only keys | low | reject | Unlikely config; adds validation branches. |
| config.toml enables unused Storage/Realtime/Studio | low | reject | Local-only defaults; no harm shown. |
| Pin regex rejects prereleases; no NEXT_PUBLIC_ test | low | reject | No prerelease deps; schema keys visible in env.ts. |
| sprint-status `in-progress` vs spec `in-review`; task names vitest.config.ts | false | — | Sprint sync happens at step 5; fix would edit the spec. |

## Verification

**Commands:**
- `npm ci && npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0
- `grep -rn "process.env" src --exclude=env.ts` -- expected: no matches

**Manual checks (if no CLI):**
- `db:start`/`db:types` can't run here (no Docker); the human verifies on a machine with Docker or in CI later.
