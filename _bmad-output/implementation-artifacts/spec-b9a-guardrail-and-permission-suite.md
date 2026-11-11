---
title: 'B9 part 1: guardrail suite and complete permission check (Stories 5.8, 6.5, 6.4 checklist)'
type: 'chore'
created: '2026-11-11'
status: 'in-progress'
baseline_commit: '02a05a08c73e1f5d2122fa7b6b22cf8395eb7f18'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The guardrails (NFR1, NFR2, NFR3, NFR6, NFR7) are tested in scattered files with no single command or checklist for the guardrail check. The permission suite lists server actions by hand with a hard-coded count, so 3 case-configurator actions (`saveRevisionDoc`, `approveCase`, `getRenderAssets`) are silently untested and a new action file would be too.

**Approach:** One `npm run test:guardrails` command running one named test per guardrail, a permission suite that discovers every server action and fails on any it doesn't list, and a short checklist doc mapping each test to its NFR plus the manual checks.

## Boundaries & Constraints

**Owner decisions (2026-11-11):** B9 in two parts; this is part 1. Part 2 (deferred) runs the permission matrix against the local database with a signed-in test user per role.

**Scope changes already decided:** share links and `/s/{token}` are after the demo (2026-11-03), so link guardrails are listed as "not built" in the checklist, not tested. The per-block check was removed for the demo (SCP 2026-10-28): NFR2 is tested as approval rules today (no bulk approve, overflow and missing-material checks before any write).

**Always:**
- **`npm run test:guardrails`** runs one named test (or describe) per guardrail and reports each separately, in CI as part of the normal test run too:
  - **NFR6:** generation fails with `NO_MATERIAL` from the UI action and from the worker when the details form is filled in and there is no material; a client intro fails with `NO_CLIENT_IMAGES` with fewer than 2 images.
  - **NFR1:** the case and client-intro LLM output schemas have no asset, layout, template, slot or image fields; no code path other than upload confirmation writes an asset original; renditions only downscale.
  - **NFR7:** single-case export, client pack and collection export fail without an approved revision, and never read a working revision.
  - **NFR2:** approval rules as built (no bulk approve, each approve has one caller, checks before any write, no way out of approved except through its use cases).
  - **NFR3:** the matrix denies `change permissions or guardrails` to every role and to system; no server action, route, environment variable or table name offers a guardrail or permission setting.
- Reuse existing tests where they already prove a guardrail (tag or move them), rather than duplicating them. Fix the NFR1 labels on what are NFR7 tests.
- **Permission suite** (`test/permissions.test.ts`):
  - discovers every `"use server"` file under `src/app` (except the sign-in actions in `(auth)`) and fails if any export is missing from EXPECTED; no hard-coded counts;
  - covers the 3 missing case-configurator actions with their roles;
  - covers every intro, client pack and collection action (6.5), including the proof that account/sales/social edit collection text without writing any revision or client row, can't edit clients or intros, and see only clients with an approved case.
- **Checklist doc** `docs/guardrail-check.md`: each guardrail → its named tests, plus the manual checks (hallucinations in technical content on a real case; template design unchanged by eye; a first real AI client intro fits its boxes) and what is not built for the demo (links, per-block check).

**Never:**
- Changing production behaviour, the policy matrix or any guardrail.
- The database-backed signed-in run (part 2).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Guardrails | `npm run test:guardrails` | One reported result per NFR1, NFR2, NFR3, NFR6, NFR7 | — |
| New action | A new export in any `"use server"` file, not in EXPECTED | Permission suite fails naming it | — |
| New file | A new `"use server"` file | Discovered; fails until listed | — |
| Missing three | `saveRevisionDoc`, `approveCase`, `getRenderAssets` | Checked for every role | — |
| Guardrail change | Any role or system asks to change guardrails | Denied | `FORBIDDEN` |

</frozen-after-approval>

## Code Map

- `package.json:16-17`: add `test:guardrails` (e.g. a `test/guardrails/*.test.ts` include, or `vitest run -t "NFR"` over named describes). `vitest.config.mts:10-12` already includes `test/**`.
- Existing guardrail tests to reuse: `test/approval-guardrail.test.ts` (NFR2: approve/approveIntro only, one caller each, check order l.31-64); `test/permissions.test.ts` NFR3 l.208-242 and approved-only export blocks mislabelled NFR1 at l.282, l.310, l.433 (they're NFR7); `test/authorize-guard.test.ts` + `test/helpers/authorize-guard.ts` (static AST scan, reusable for discovering `"use server"` files).
- NFR6: UI `src/app/(tool)/case-studies/actions.ts:229` (+ `actions.test.ts:617`), worker `src/modules/generation/application/generate-case.ts:232,238` (+ `generate-case.test.ts:165,171`), client `case-study/application/client-intro.ts:131`, worker `generate-case.ts:353`.
- NFR1: case schema `generation/adapters/anthropic/narrative-generator.ts:28`, client schema `client-intro-writer.ts:28`; originals `material/application/make-renditions.test.ts:122`; downscale `material/domain/rendition.test.ts:37`, `adapters/sharp/image-processor.test.ts:37`. Add a forbidden-field assertion on both schemas and a static scan that only upload confirmation writes an original key.
- NFR7: `rendering/application/request-export.ts:207,357,517`, `export-handler.ts:405`.
- NFR3: `access/domain/policy.ts:34,93`.
- Permission suite: `test/permissions.test.ts` imports 10 action files by hand (l.80-93), EXPECTED l.104, completeness check with `+ 6` l.162-165; case configurator `src/app/(wizard)/case-studies/[caseId]/configurator/actions.ts` (9 exports, 6 listed).

## Tasks & Acceptance

**Execution:**
- [ ] `test/guardrails/` (or tagged describes) + `package.json` -- `test:guardrails` with one named block per NFR.
- [ ] `test/permissions.test.ts` -- discovery, no hard-coded count, the 3 missing actions, 6.5 coverage.
- [ ] `docs/guardrail-check.md` -- the checklist.
- [ ] `sprint-status.yaml` -- 5.8 and 6.5 to `review`; 6.4 note: checklist done, signed-in DB run is B9 part 2.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:guardrails`, `test:db` and `build`, when they run, then they pass.
- Given a temporary new export in a `"use server"` file, when the permission suite runs, then it fails naming it (checked once, not committed).

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:guardrails` -- expected: pass, one result per NFR.
- `npm run test:db` -- expected: pass.
- `npm run build` -- expected: pass.
