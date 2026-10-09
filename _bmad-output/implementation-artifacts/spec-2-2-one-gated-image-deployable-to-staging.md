---
title: 'Story 2.2 (part 1): Basic-auth gate and fail-fast start'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a2214b9fa5da338cf8af8fc72227491f8f351c05'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing stops a deployed URL from serving real client material to anyone who finds it, and nothing stops a deployment from starting without that protection.

**Approach:** HTTP basic auth on every request in `src/proxy.ts`, with credentials read only through `src/shared/env.ts`, and a web process that refuses to start in production when the credentials are missing.

## Boundaries & Constraints

**Always:** Gate covers every path incl. `/s/*`, `/_next/*` and 404s (IR-A2). Credentials `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` read only via `src/shared/env.ts`, never `NEXT_PUBLIC_`; compared in constant time. **Decision (when the gate is mandatory):** the web process requires both vars whenever `NODE_ENV=production` (standalone server, `next start`); under `next dev` they are optional and the gate applies only if both are set. The worker never needs them. **Decision (scope split):** this spec covers the gate and fail-fast only; the Docker image, worker bundle, CI image job and deploy/migration docs are deferred to Story 2.2 part 2. **Decision (blocked criterion):** the "deployed to staging" criterion (IR-HOST) does not hold the story open; it is tracked in deferred work.

**Never:** No login, sessions or Supabase Auth (Epic 6). No unauthenticated health or bypass path. No Dockerfile, worker or deploy changes (part 2). No Next version bump.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No credentials | any path, incl. `/s/abc`, `/_next/static/x.js`, unknown path | 401, `WWW-Authenticate: Basic realm="MAC Recap", charset="UTF-8"`, body with no app content | N/A |
| Wrong credentials | wrong user or password, malformed/non-Basic header, bad base64, no colon | 401 as above | never throws |
| Valid credentials | correct `Authorization: Basic` | request continues to the app | N/A |
| Password contains `:` | `user:pa:ss` | split on first colon; authenticates | N/A |
| Production, gate vars missing | `NODE_ENV=production`, either var unset or empty | web process exits 1 before serving, naming the missing var | N/A |
| Dev, gate vars unset | `NODE_ENV=development`, both unset | no gate | N/A |
| Dev, one var set | only one of the two set | treated as misconfigured: exit 1 naming the missing var | N/A |

</frozen-after-approval>

## Code Map

- `src/shared/env.ts` -- `envSchema`, `parseEnv()`, cached `getEnv()`; the only `process.env` reader (lint-enforced). Add the two gate vars (optional strings, non-empty when present) and `NODE_ENV`; add the production/pairing rule so `getEnv()` callers stay unchanged. Keep worker-safe: the worker (`src/worker/index.ts`) calls `getEnv()` and must not require gate vars — put the gate requirement in a separate web-only function (e.g. `getGateCredentials()` / `assertWebEnv()`).
- `src/shared/env.test.ts` -- existing table of env cases; extend.
- `src/instrumentation-node.ts` -- `assertEnvOrExit()` runs at web boot and calls `process.exit(1)` on error; extend it with the web-only gate check. `src/instrumentation.test.ts` has the `vi.stubEnv` + spied `process.exit` pattern to reuse.
- `src/proxy.ts` (new) -- Next 16.3 convention: `export function proxy(request: NextRequest)`; Node.js runtime by default (setting `runtime` throws), so `node:crypto` `timingSafeEqual` is fine; with no `config.matcher` it runs on every request incl. `/_next/static`. Return `NextResponse.next()` when allowed. Lint layer `src/*.{ts,tsx}` already applies; keep the decode/compare logic as plain exported functions so `src/proxy.test.ts` can test them without a server.
- `.env.example`, `README.md` -- document the two vars and the dev/production rule. Do not touch the deploy sections (part 2).
- `test/secret-key.test.ts` exists only on the unmerged Story 2.3 branch; don't depend on it.

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/env.ts`, `src/shared/env.test.ts` -- gate vars, pairing rule, web-only production requirement
- [x] `src/instrumentation-node.ts`, `src/instrumentation.test.ts` -- exit 1 on the production/pairing rows of the matrix
- [x] `src/proxy.ts`, `src/proxy.test.ts` -- basic-auth gate; tests cover every request row of the matrix, plus constant-time compare of differing lengths
- [x] `.env.example`, `README.md` -- vars and the rule, no `NEXT_PUBLIC_`

**Acceptance Criteria:**
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.
- Given `grep -rn "BASIC_AUTH" src`, then matches are only in `env.ts`, `proxy.ts`, `instrumentation-node.ts` and their tests, and none carry `NEXT_PUBLIC_`.
- Given a production build started without the gate vars, when `node .next/standalone/server.js` runs, then it exits 1 before listening.

## Implementation Notes

- AC "exits 1 before listening" holds only as "before serving": Next's standalone `server.js` opens the port, then runs `register()`, which exits 1; requests in that window hang and are never answered. Verified: no-gate start exits 1 naming both vars. A strict pre-listen check needs a custom entry or an image-level check, carried into Story 2.2 part 2 (deferred-work).

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | verification-gap | Nothing checks that Next routes every path through the proxy (a `config.matcher` or renamed export would pass all tests) | medium | patch | Pre-verified: `gate()` ignores the path; tests call it directly. Add a module-shape test (no `config` export, `proxy` is a function). |
| 2 | blind, edge-case | Gate turns off for any `NODE_ENV` other than exactly `production` | low | patch | Standalone `server.js` sets `NODE_ENV='production'` (line 5), so the planned path is safe; a custom part-2 entry or odd `next start` value would fail open. One-condition fix: optional only for `development`/`test`. |
| 3 | blind, edge-case | Empty `BASIC_AUTH_*` crashes the worker and dev via zod `min(1)`; the pairing rule's empty branch is dead | low | patch | Uncommenting `.env.example` as written gives `BASIC_AUTH_USER=` → `getEnv()` throws in the worker, contradicting "Worker: never needs them". Treat empty as unset. |
| 4 | blind | 401 response's `Cache-Control`/`Content-Type` unasserted | low | patch | `expectChallenge` checks status, header, body only; one-line assertion. |
| 5 | blind | README env table column "Local value (from `npx supabase status`)" now holds descriptions | low | patch | README line 32; rename the column. |
| 6 | blind | Failed attempts not logged or rate-limited | medium (unverified) | defer | Feature beyond the gate; per-asset 401s would need noise control. |
| 7 | blind | `/_next/static` responses are `public, immutable`; a shared cache could replay them unauthenticated | low | defer | No cache/CDN in front today; becomes a part-2 host constraint. |
| 8 | blind | Part 2 needs a plan for host health probes and the CI smoke test under the gate | medium | defer | "No unauthenticated path" means probes get 401; decide with IR-HOST. |
| 9 | edge-case | Local `next/image` optimization sub-request lacks credentials | maybe-false | defer | No `next/image` use yet; settle by trying a local optimized image behind the gate (Story 2.4+). |
| 10 | blind, edge-case | "Exits 1 before listening" AC unmet | low | reject | Fix would edit this spec; recorded in Implementation Notes and deferred to part 2. |
| 11 | blind | Part 2 not on the sprint board | low | reject | Tracking choice for the user, not a code defect; raised in the summary. |
| 12 | blind | Spec `in-review` vs sprint `in-progress` | false | reject | Sprint sync happens at step 5. |
| 13 | blind, edge-case | `proxy()` throws when credentials misconfigured at request time | low | reject | Fails closed (500, no app content); boot check exits first. |
| 14 | blind | Missing tests for header whitespace, null header in `isAuthorized`, per-request re-read | low | reject | Behaviour is covered through `gate`/`parseBasicAuth`; `getEnv()` is cached by design. |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0
- `env -i PATH="$PATH" SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISHABLE_KEY=x SUPABASE_SECRET_KEY=x node .next/standalone/server.js` -- expected: exits 1 naming `BASIC_AUTH_USER`
- Same with `BASIC_AUTH_USER=u BASIC_AUTH_PASSWORD=p`, then `curl -si localhost:3000/s/x` -- expected: 401 with `WWW-Authenticate`; `curl -si -u u:p localhost:3000/` -- expected: not 401
