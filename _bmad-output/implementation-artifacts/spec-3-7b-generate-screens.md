---
title: 'Story 3.7b: Generate a case study, screens'
type: 'feature'
created: '2026-10-29'
status: 'in-progress'
route: 'dispatch'
baseline_commit: 'dab4a0375a9bb12808fb08bed410a20c7e69f2bf'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-7-generate-a-case-study.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.7a made `generateCaseStudy` and the `generate` job work, but wizard step 3 is still a placeholder, a generating case redirects away from the wizard, the Case table never updates by itself, and nothing says why a click on an In elaborazione row does nothing.

**Approach:** Step 3 shows what the case has and a **Genera** button that runs the 3.7a action. A generating case shows a waiting screen; a draft whose last generate job failed shows the failure and **Riprova**. The Case table refreshes itself while a row is generating, and clicking such a row says it is still generating.

## Boundaries & Constraints

**Always:**
- The step 3 counter reads "{n} file, {m} di 2 dettagli compilati": Contesto and Soluzione, the same two as step 2's counter (owner, 2026-10-29); Risultati and Testimonial are not counted.
- Genera is disabled without material, its reason linked by `aria-describedby`; client info never enables it. The action re-checks everything.
- Riprova runs the same `generateCaseStudy` action; nothing is re-uploaded.
- The wizard page, for a `generating` case, renders the waiting screen instead of redirecting; other non-drafts still redirect to `/case-studies`. The waiting screen refreshes itself, so when the case leaves `generating` the page follows the existing rules (done → `/case-studies`; failed → draft, step 3 with the failure).
- Failure = the newest `generate` job of a draft case (`jobs.getJobsFor`, after `requireSurface`) has `status: "failed"`; a lookup error means no failure shown.
- No ETA, percentage or progress bar. The waiting screen has **Torna ai casi**.
- The Case table refreshes (`router.refresh()` about every 5 s) only while some row is `generating`, and stops when none is.
- All copy in `it.ts`; house UI rules from the mac-recap-ui skill; no hard-coded strings.

**Never:**
- No change to `generateCaseStudy`, the job handler or `caseHref`; no ready toast (3.8); no migration.
- Do not touch configurator files or steps 1–2 gating.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Step 3, material | draft, ≥1 file, details complete | counter; Genera enabled | N/A |
| Step 3, no material | step 3 reached with no file | Genera disabled, reason linked | N/A |
| Press Genera | enabled | busy state, action runs, waiting screen shown | `NO_MATERIAL` / `STALE_STATUS` / other: message in the alert line, stays on step 3 |
| Reload while generating | case `generating` | waiting screen, no redirect | N/A |
| Job finishes | `generating` → `in_review` | waiting screen follows the redirect rules to `/case-studies` | N/A |
| Job fails | case back to draft, newest generate job failed | step 3 with failure text and Riprova | lookup error: no failure shown |
| Table | a row is `generating` | refresh every ~5 s; stops once none generating | N/A |
| Click In elaborazione row | no href | polite message "Ancora in elaborazione" in the table's status region | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(wizard)/case-studies/new/page.tsx` -- step 3 block (~l.124-143) and the non-draft redirect (~l.78). Add `listAssets`, `getDetailsForm` and `jobs.getJobsFor` for step 3 only; render the waiting screen for `generating`. `STEP_NOTE_ID` pattern stays.
- `src/app/(wizard)/_components/generate-step.tsx` (new, client) -- counter, Genera (pattern of `case-details-step.tsx`: `ActionResult`, alert line, polite status, `aria-busy`), failure banner + Riprova; `generating-screen.tsx` (new, client) -- waiting text, **Torna ai casi** (`it.wizard.back` exists), `router.refresh()` interval.
- `src/app/(wizard)/_components/wizard-frame.tsx`, `wizard-footer.tsx` -- reuse as is.
- `src/app/(tool)/case-studies/_components/case-studies-table.tsx` -- refresh effect while any row is `generating`; onClick on such a row sets a message in the existing `role="status"` region (l.~310). Row `href` logic stays.
- `src/shared/i18n/it.ts` -- replace `wizard.generatePlaceholder`; add counter, reasons, waiting, failure, Riprova and "Ancora in elaborazione" copy; `it.test.ts` pins them (no `!` anywhere in `it`).
- Tests: `case-studies/new/page.test.tsx` (step 3 block l.383-421 asserts the placeholder and that `getDetailsForm`/`listAssets` are not called: rewrite; mock `generateCaseStudy` and `@/modules/jobs`), `case-studies-table.test.tsx` (`useRouter` mock gets `refresh`; fake timers), new component tests.

## Tasks & Acceptance

**Execution:**
- [ ] `it.ts` + `it.test.ts` -- copy.
- [ ] `generate-step.tsx`, `generating-screen.tsx` + tests for every matrix row.
- [ ] wizard `page.tsx` + `page.test.tsx` -- step 3, generating render, failure lookup.
- [ ] `case-studies-table.tsx` + test -- refresh and message.

**Acceptance Criteria:**
- Given a draft with material at step 3, when I press Genera and reload, then I still see the waiting screen until the case leaves `generating`.
- Given a screen reader, when Genera is disabled or an error appears, then the reason and the error are announced (`aria-describedby`, `role="alert"`).

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npx vitest run` -- expected: all pass.

**Manual checks:**
- Walk the flow with the 3.7a worker running locally if a stack is available (press Genera, leave, return); otherwise say it was not looked at.

## Implementation Notes

## Spec Change Log

- 2026-10-29, owner at approval: the counter counts two details (option B), like step 2.

## Review Triage Log
