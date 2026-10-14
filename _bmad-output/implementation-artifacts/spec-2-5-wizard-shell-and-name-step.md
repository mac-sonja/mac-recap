---
title: 'Story 2.5 UI: wizard frame and step 0 (name)'
type: 'feature'
created: '2026-10-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '855f1081f55c02659399d2dea273e6a265581f30'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/mockups/material-step.html'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/case-studies/new` is a placeholder. The owner/designer can't create a case study from the UI, and the wizard frame that steps 1–3 need doesn't exist yet.

**Approach:**
- Build the focused wizard frame from EXPERIENCE.md's *Wizard layout*:
  - no sidebar
  - a slim top bar with a back arrow, the case name and the status badge
  - a centred column, about 820px, also centred vertically
  - an eyebrow and a large title
  - the segmented stepper *Materiale · Dettagli · Genera*
  - a footer with step dots and a lime **Avanti**
- Build step 0: name and client (required), year (prefilled with the current year, editable) and narrative language (*Italiano* default, *English*). It calls the merged `createCaseStudy` action.
- On success, the URL becomes `/case-studies/new?caseId={id}`. The header shows the ID in mono and the *Bozza* badge. Step 1 shows a placeholder until the Story 2.7 UI exists.
- Reopening with `?caseId=` loads the case and opens step 1.

## Boundaries & Constraints

**Always:**
- Owner/designer only (`requireSurface("create case")`).
- Every string comes from `it.ts`; the lint rule forbids hard-coded UI strings.
- Field errors use `fields` from `INVALID_INPUT`, mapped to Italian copy. English backend messages never reach the UI.
- The form can't submit while name or client is empty, and it names the missing field.
- No double submit: create is not idempotent.
- Below 1024px the wizard shows `caseStudies.narrowScreen` in place of the form.
- Tokens only, no raw colours. WCAG: labelled fields, errors tied to their fields, a visible focus ring, and a back arrow with an accessible name.

**Decisions (owner, 2026-10-14):** step 0 sits in the same frame: eyebrow and title read *Nuovo case study* until a name exists, the stepper shows with no step active, the form is the step content, and **Avanti** creates the case. An unknown or deleted `?caseId=` redirects to Case studies. Name and client aren't editable after creation for now.

**Never:**
- No editing of name or client after creation (no update backend exists).
- No Material, Details or Generate content (Stories 2.7 and 2.10 UI).
- No change to the case-study module or its policy.
- `project_order_ref` is never shown.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create | name, client, year default, Italiano | case created; URL `?caseId=`; header shows ID (mono) and Bozza; step 1 active | N/A |
| Missing field | name or client empty or blank | no request; field-level message naming the field | inline |
| Server rejects field | `INVALID_INPUT`, fields `["year"]` | message on that field | inline |
| Other failure | `FORBIDDEN` / 500 | form stays filled; generic error line | inline banner |
| Double click | Avanti pressed twice | one request (button busy while pending) | N/A |
| Reopen | `?caseId=` of own draft | top bar and title show the case; step 1 | N/A |
| Unknown or deleted id | `?caseId=` not found or malformed | redirect to `/case-studies` | N/A |
| Narrow screen | < 1024px | narrow-screen copy, no form | N/A |

</frozen-after-approval>

## Code Map

- **Routing:** move the wizard to `src/app/(wizard)/case-studies/new/page.tsx` with a new `src/app/(wizard)/layout.tsx`. The layout runs the `resolveShellActor()` / `<NoActor/>` check like `(tool)/layout.tsx`, with no Sidebar and a full-screen `bg-surface`.
  - Delete `src/app/(tool)/case-studies/new/page.tsx`, because two groups can't own one path.
  - Rewrite its test (`(tool)/case-studies/page.test.tsx:114-125`).
  - `requireSurface` is in `src/app/_lib/surface.ts`. Page `searchParams` is async (Next 16).
- **Reopen:** the server page calls `caseStudy.get(caseId)` (from `@/modules/case-study`). `NOT_FOUND` covers unknown, malformed and deleted ids. There's no get action, and none is needed: it's server-side after `requireSurface`.
- **Create:** `createCaseStudy(input)` in `src/app/(tool)/case-studies/actions.ts` returns `ActionResult<CaseStudy>` and authorizes `create case`.
  - Schema: `name` and `client` trimmed with min 1. `year` is an integer from `YEAR_MIN` to `YEAR_MAX` and **required**. `locale` comes from `LOCALES` and defaults to `it`.
  - It's importable from the wizard, since actions are module-scoped. If the lint boundary objects, move it to `src/app/_lib`.
- **Shared UI:**
  - Extract `PRIMARY_ACTION` (`case-studies-table.tsx:51`) to a shared module such as `src/app/_components/button-styles.ts`.
  - Input style: `rounded-md border bg-surface-control px-3 py-2 font-body text-sm text-foreground placeholder:text-foreground-muted` with `<label htmlFor={useId()}>`.
  - Mono ID: `font-mono text-xs text-foreground-muted`.
  - Also reuse `StatusBadge`, `cn`, and `ArrowLeft` from lucide-react.
- **New components:** `src/app/(wizard)/_components/`:
  - `wizard-frame.tsx` (server-friendly): top bar, column, eyebrow, title, stepper slot, footer slot. Layout comes from `mockups/material-step.html` (screen 1), colours from DESIGN.md tokens.
  - `stepper.tsx`: segmented, three steps, current one `surface-selected`, done ones marked ✓ in `foreground`.
  - `name-step.tsx` (`"use client"`): the form, with client-side required checks, pending state, field errors, and `router.replace` to `?caseId=`.
- **Copy:** add `it.wizard.*` to `src/shared/i18n/it.ts`:
  - the eyebrow
  - back-arrow label
  - step names
  - field labels: name, client, year, language
  - Italiano and English
  - missing-field messages
  - generic error
  - Avanti
  - step-1 placeholder
    
  Add assertions in `it.test.ts` and keep the no-"!" rule.
- **Table:** `draftHref` (`case-studies-table.tsx:30`) is unchanged. Update its "Until the Story 2.5 wizard" comment.
- **Tests:**
  - Client components with happy-dom and @testing-library, like `case-studies-table.test.tsx`.
  - Server page and layout with `renderToStaticMarkup` and mocks, like `page.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/(wizard)/layout.tsx` + test -- focused layout, no sidebar
- [x] `src/app/(wizard)/case-studies/new/page.tsx` + test -- surface check, `?caseId=` load, narrow-screen copy; delete the `(tool)` page and update its test
- [x] `src/app/(wizard)/_components/{wizard-frame,stepper,name-step}.tsx` + tests -- every matrix row
- [x] `src/app/_components/button-styles.ts` -- shared `PRIMARY_ACTION`; table imports it
- [x] `src/shared/i18n/it.ts` + `it.test.ts` -- wizard copy
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 2.5 comment: UI frame + step 0 done

**Acceptance Criteria:**
- Given an owner/designer on `/case-studies/new`, when the page renders, then no sidebar is present and the frame matches EXPERIENCE.md's wizard layout.
- Given the repo, when lint, typecheck, tests and build run, then all pass.

## Implementation Notes

- Local: lint, typecheck, 50 files / 1269 tests, build pass. Not browser-checked (no dev Supabase). Every matrix row has a component or page test (`name-step.test.tsx`, `case-studies/new/page.test.tsx`, `wizard-frame.test.tsx`).
- Beyond spec: `currentYear()` in `src/shared/i18n/format.ts` (Europe/Rome); client-side year range check; server passes default year and range so the client never imports `@/modules/case-study`; `PRIMARY_ACTION_INACTIVE` style. Italian copy drafted (back arrow "Torna ai case study", "Lingua del testo", errors, step-1 placeholder) for owner review. Non-draft `?caseId=` renders step 1 with its badge.

- Review patches applied (triage #1, #4–6, #8, #10, #11, #13–16): shared `wizardHref` in `src/app/_lib/routes.ts`, non-draft `?caseId=` redirects to Case studies, `h-dvh` on the frame only, flushSync before focus, Italian `(wizard)/error.tsx`. Full run: 51 files / 1279 tests, lint, typecheck, build pass.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, vg | `wizardHref` duplicates the table's `draftHref` | low | Real: same URL built twice | patch |
| 2 | blind | Retry after a lost create response makes a second case | medium | Real but rare; needs an idempotency key in the backend | defer |
| 3 | blind, edge | Busy button never resets if navigation after success fails | low | `router.replace` has no failure signal; a failed render shows the error boundary anyway | reject |
| 4 | blind, edge, vg | Non-draft `?caseId=` opens in the new-case wizard; only drafts tested | medium | Real: an approved case would sit under *Nuovo case study*; the table links only Bozza rows | patch (redirect non-drafts to Case studies) |
| 5 | blind, vg | Malformed-id path relies on mocks; module test lacks `null` | low | Real: page passes `null` for a repeated param | patch (module test) |
| 6 | vg, blind | Page never asserts year `min`/`max`/exact default | medium | Pre-verified gap | patch |
| 7 | blind | `(wizard)` imports `(tool)` actions | low | Lint allows it; moving the file is more than a direct fix | reject (revisit in 2.7) |
| 8 | blind | Two full-screen wrappers; `h-screen` | low | Real | patch (`h-dvh` on one element) |
| 9 | blind | Layout test misses other failure paths | low | Shared `resolveShellActor` is covered by surface tests | reject |
| 10 | blind | Step-1 Avanti has no `aria-describedby` reason | low | Real | patch |
| 11 | blind | `cursor-not-allowed` on a clickable inactive Avanti | low | Real: click validates | patch |
| 12 | blind | Spec in review without a visual check | false | Verification section states it; no dev DB | reject |
| 13 | blind | `errors.locale` path untested | low | Real | patch |
| 14 | edge | Focus moves before error attributes commit | low | Real: `setErrors` then `focus()` in one tick | patch |
| 15 | edge | Unknown server field names dropped silently | low | Real | patch (generic error too) |
| 16 | edge | No `error.tsx`: thrown lookup errors show Next's English page | low | Real: no error boundary in `src/app` | patch (Italian wizard error boundary) |
| 17 | edge | No loading fallback after leaving `(tool)` | low | Server `get` is fast; cosmetic | reject |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- all pass

**Manual checks (if no CLI):**
- Not possible locally without a dev Supabase project; the component tests stand in.
