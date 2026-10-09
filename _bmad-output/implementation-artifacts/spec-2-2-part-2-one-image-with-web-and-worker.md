---
title: 'Story 2.2 (part 2): One image with web and worker, smoke-tested in CI'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '28c2931a583db59b5c61bc9717af5332a96db090'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-one-gated-image-deployable-to-staging.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app can't be deployed: there is no image, the worker isn't bundled, and an ungated web process still opens its port briefly before exiting.

**Approach:** One Docker image on the pinned Playwright base with pinned ffmpeg and two start commands, a bundled idle worker, a bundled preflight that refuses to start before the port opens, a CI job that builds and smoke-tests the image, and README deploy/migration docs.

## Boundaries & Constraints

**Always:** Base `mcr.microsoft.com/playwright:v1.63.0-noble` for build and runtime (Node 24 + npm, user `pwuser`, no system ffmpeg); `apt-get install ffmpeg=7:6.1.1-3ubuntu5`. Runtime runs as `pwuser`, `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=3000`. Web: `node --require ./dist/preflight.js server.js` (default `CMD`); worker: `node dist/worker.js`. Preflight reuses the part-1 env and gate rules (no second copy). Migrations forward-only; `supabase db push` to staging before the new image starts; prod only after staging. **Decision (probes):** the gate stays total (part 1: no unauthenticated path). No image `HEALTHCHECK` (the worker shares the image); the docs tell the host to probe the web process by TCP on 3000 or HTTP with an `Authorization: Basic` header, and the worker by process liveness. **Decision (caching):** docs state no shared cache/CDN may sit in front of the web process.

**Never:** No host-specific config (IR-HOST). No job loop. No unauthenticated path. No Next/Playwright bumps. No staging deploy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Web, gate vars missing | default command, Supabase vars only | exits 1 naming the var; the port never opens | N/A |
| Web, gated | gate + Supabase vars | `/` and `/s/x` → 401 without creds; `/` with creds → not 401 | N/A |
| Worker start | `node dist/worker.js`, Supabase vars only | one readiness JSON log line, keeps running | invalid env → exit 1 |
| Worker stop | SIGTERM or SIGINT | exits 0 | N/A |
| ffmpeg | `ffmpeg -version` in the image | reports 6.1.1 | N/A |
| User | `id -un` in the image | `pwuser` | N/A |

</frozen-after-approval>

## Code Map

- `src/instrumentation-node.ts` -- `assertEnvOrExit()` (getEnv + getGateCredentials, exit 1); reuse from the preflight entry. `register()` stays for `next dev`/`next start`.
- `src/shared/env.ts` -- gate rule: required unless `NODE_ENV` is development/test; unset counts as required, so a preflight running before `server.js` sets `NODE_ENV` still fails closed.
- `src/worker/index.ts` -- placeholder (`getEnv()` + one log). Put the idle/shutdown logic in a testable function (signals injected); keep `index.ts` a thin entry.
- `.next/standalone/server.js` -- sets `NODE_ENV='production'` then listens before `register()`; hence the `--require` preflight. Standalone needs `.next/static` copied next to it; no `public/` dir exists.
- `package.json` -- exact pins (`test/scaffold.test.ts`). esbuild `0.28.2` resolves `@/*` from tsconfig; entry syntax `worker=src/worker/index.ts preflight=src/preflight.ts` with `--outdir=dist`. `dist/` is git- and lint-ignored.
- `src/*.{ts,tsx}` lint layer covers a new `src/preflight.ts`; `./` relative imports are allowed, `..` is not.
- `.github/workflows/ci.yml` -- one `check` job today; add a separate `image` job. Runners have Docker; local machine does not.

## Tasks & Acceptance

**Execution:**
- [x] `src/preflight.ts` -- calls `assertEnvOrExit()`
- [x] `src/worker/*.ts` + test -- readiness log via `@/shared/log`, idle keep-alive, SIGTERM/SIGINT exit 0 (test with injected signals, no real process exit)
- [x] `package.json`, `package-lock.json` -- `esbuild` 0.28.2 dev dep; `build:dist` bundles `dist/worker.js` + `dist/preflight.js` (platform node, target node24, cjs, all deps bundled); `build` = `next build && npm run build:dist`
- [x] `Dockerfile`, `.dockerignore` -- multi-stage per Boundaries; runtime copies standalone, `.next/static`, `dist/`; ignore `node_modules`, `.next`, `dist`, `.git`, `.env*`, `_bmad*`, `docs`, `.claude`
- [x] `scripts/smoke-image.sh` -- runs every I/O matrix row against a given image tag with dummy Supabase vars; asserts the port never opened for the ungated case (no listening line in logs, container exited 1); exits non-zero on any failure
- [x] `.github/workflows/ci.yml` -- `image` job: `docker build`, then `scripts/smoke-image.sh`
- [x] `README.md` -- Deploy section: build, run both commands with one env, migrations (`supabase link`, `supabase db push` staging first, forward-only, prod after staging), probes and no-shared-cache per Decisions

**Acceptance Criteria:**
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass and `dist/worker.js`, `dist/preflight.js` exist.
- Given the CI `image` job, when it runs on the PR, then the build and every smoke check pass.

## Implementation Notes

- No local Docker: `scripts/smoke-image.sh` was exercised against a throwaway fake `docker` shim that runs the local standalone build as "containers"; every web and worker row passed (16 checks). The ffmpeg 6.1.1 and `pwuser` rows, the `apt-get` pin and the multi-stage build itself are proven only by the CI `image` job.
- The preflight evaluates the gate as production (`assertEnvOrExit({ assumeProduction: true })`), since it only ever runs in front of `server.js`, which forces `production`; a container started with `NODE_ENV=development` or `test` still exits 1 before the port opens (review fix).
- The smoke script needs `docker`, `curl` and `jq` (all on `ubuntu-latest`).

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | blind, edge-case | curl calls in the smoke script and the CI `image` job have no timeout | medium | patch | A server that accepts but never answers hangs the job until GitHub's 6-hour limit. |
| 2 | blind, edge-case | `NODE_ENV=development`/`test` makes the preflight pass ungated; server.js then forces production and listens before `register()` exits | medium | patch | `resolveGateCredentials` makes the gate optional for development/test; `server.js` line 5 overrides `NODE_ENV` only after the preflight ran. |
| 3 | blind | "Port never opened" check passes vacuously if Next changes its banner | low | patch | Negative grep with no positive control; one assertion in `web_gated`. |
| 4 | blind | "With credentials" smoke check accepts 5xx | low | patch | Only `!= 401` is checked. |
| 5 | blind | Deploy docs lack migration compatibility, corrective-migration recovery, `db push` credentials, prod-link hazard, `--platform linux/amd64`, host-injected `HOSTNAME` | medium | patch | README Deploy section; each item is a direct doc addition. |
| 6 | blind | `.dockerignore` misses `*.tsbuildinfo`, `coverage`, `.DS_Store`, `supabase/.temp` | low | patch | `supabase link` writes the project ref to `supabase/.temp`, which enters the build context. |
| 7 | blind | No init process; Node as PID 1 won't reap Chromium/ffmpeg children | medium | defer | No child processes yet; needed when rendering or the job loop spawns them. |
| 8 | blind | Playwright version in `FROM` and `package.json` kept in sync by hand | low | defer | Drift appears only at a version bump; a scaffold test can enforce it then. |
| 9 | blind | Base image not pinned by digest; ffmpeg exact pin can go stale | medium | defer | Mutable tag; Launchpad shows no newer noble ffmpeg today. |
| 10 | blind | Worker bundles every dependency; native deps (playwright, sharp) can't be bundled | medium | defer | The worker imports none yet; the job-loop story must choose externals plus a pruned `node_modules`. |
| 11 | blind | CI image job has no layer cache | low | defer | Cost only; no correctness harm. |
| 12 | blind | No web SIGTERM row in the smoke script | low | reject | Next's standalone server installs its own SIGTERM/SIGINT handlers; the matrix covers the worker only. |
| 13 | edge-case | SIGTERM before the worker installs handlers is ignored | false | reject | Handlers are installed in the same synchronous tick as `getEnv()`; Node dispatches signals through the event loop, so none is delivered before they exist. |
| 14 | blind | Worker repeats the env-failure message and uses `console.error` | low | reject | Mirrors `assertEnvOrExit`; the rules themselves are shared through `getEnv()`. |
| 15 | blind | `worker_invalid_env` doesn't check log contents | low | reject | Exit 1 is the matrix row; extra assertions add little. |
| 16 | blind | The spec's manual bundle checks could also run in the `check` job | low | reject | The CI `image` job already runs both bundles via the smoke script. |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0
- `env -i PATH="$PATH" SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISHABLE_KEY=x SUPABASE_SECRET_KEY=x node --require ./dist/preflight.js .next/standalone/server.js` -- expected: exits 1 naming `BASIC_AUTH_USER`, no "Ready"/listening line
- Same env, `node dist/worker.js`, then Ctrl+C -- expected: readiness line, exit 0

**Manual checks (if no CLI):**
- No local Docker: the image rows are proven only by the CI `image` job on the PR.
