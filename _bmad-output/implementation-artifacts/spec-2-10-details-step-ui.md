---
title: 'Story 2.10 UI: wizard step 2 Details, first-incomplete-step, clickable stepper'
type: 'feature'
created: '2026-10-14'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/mockups/details-step.html'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Wizard step 2 is a placeholder. A *Bozza* row always reopens step 1, even when the case already has files. The stepper can't be used to go back.

**Approach:** Build the Details step from EXPERIENCE.md Step 2 and `mockups/details-step.html`:
- heading "Racconta il progetto" plus the intro line
- three textareas, *Contesto*, *Soluzione* and *Risultati*, each showing its prompt as a placeholder
- autosave on pause (debounced) and on blur, through the merged `saveDetailsField`, with values loaded through `getDetailsForm`
- the footer counter "{n} di 3 compilati"
- **Avanti** active from the start, going to a step-3 placeholder

Two navigation changes come with it:
- **First incomplete step:** the wizard opens at step 2 when the case has material, and at step 1 otherwise. *Bozza* rows reach it through the unchanged `wizardHref(id)`.
- **Clickable stepper:** visited steps become links. Dettagli and Genera are reachable only while the case has at least one file.

## Boundaries & Constraints

**Always:**
- Copy lives in `it.ts`. The 5,000-character limit is counted in code points, as the server does, and the field shows the limit when it's reached.
- A save never runs twice at once for the same field: the latest text wins, and any text typed during a save is saved after it.
- A failed save keeps the typed text, shows an inline error, and retries on the next edit or blur.
- Leaving the step, by Avanti or a stepper link, flushes pending saves first.
- Details never count as material (NFR6): Avanti on step 2 doesn't need any field.
- Accessibility: labelled textareas, the error tied to its field, save failures announced politely, and stepper links named with the step and its state.

**Never:**
- No Generate content (Epic 3); step 3 is a placeholder.
- No backend changes.
- No "Salvato" indicator beyond what's needed for errors.
- No change to the case-list query (no per-row material lookup).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Load | case with saved context | that textarea filled; counter "1 di 3 compilati" | N/A |
| Type, pause | text in Soluzione, ~800 ms idle | one `saveDetailsField`; counter updates | N/A |
| Blur | leave a changed field | saved at once (pending debounce flushed) | N/A |
| Clear | empty a filled field | saved as `""`; counter drops | N/A |
| Unchanged | blur with no change | no request | N/A |
| Typing during save | edit while a save is in flight | after it returns, one more save with the latest text | N/A |
| Save fails | 4xx/5xx or throw | text kept; inline error under the field; announced | retry on next edit/blur |
| Too long | over 5,000 code points | limit message; no request beyond the limit | inline |
| Avanti | any state, even all empty | flush pending saves → `?caseId=…&step=3` placeholder | N/A |
| Reopen, material | no `step`, case has ≥ 1 file | redirect to `&step=2` | N/A |
| Reopen, no material | no `step`, 0 files | step 1 | N/A |
| `step=1` explicit | any | step 1 | N/A |
| `step=2` or `3`, no material | 0 files | redirect to step 1 (`&step=1`) | N/A |
| Stepper | on step 2 with files | Materiale links to `&step=1`; Genera links to `&step=3`; current step not a link | N/A |
| Stepper, 0 files | on step 1 | Dettagli and Genera not links | N/A |

</frozen-after-approval>

## Code Map

- **Routes** `src/app/_lib/routes.ts`: `wizardHref(id, step?: 1 | 2 | 3)`. Step 1 is written explicitly as `&step=1`; with no step there is no param.
- **Page** `src/app/(wizard)/case-studies/new/page.tsx`:
  - after loading the case, compute `material.hasMaterial(id)` once
  - with no `step`: material → `redirect(wizardHref(id, 2))`; otherwise step 1
  - `step=1` → step 1
  - `step=2` → needs material (else `redirect(wizardHref(id, 1))`). Load `material.getDetailsForm({caseId:id})` (throws into the error boundary on failure) and render `<DetailsStep caseId initial maxChars={MAX_FORM_FIELD_CHARS}>`.
  - `step=3` → needs material; render the placeholder (`it.wizard.generatePlaceholder`) with an inactive Avanti and `aria-describedby`
  - pass `reachable = hasMaterial` to the frame for the stepper
  - Replace `it.wizard.detailsPlaceholder`. Extend `page.test.tsx` mocks (`hasMaterial`, `getDetailsForm`, constants) and rewrite the test "renders step 1 for any other step value".
- **Stepper** `src/app/(wizard)/_components/stepper.tsx` and `wizard-frame.tsx`:
  - `Stepper({ current, caseId?, reachable })`. A step other than the current one is a `next/link` to `wizardHref(caseId, step)` when it is done (`step < current`) or when `reachable && step > 1`.
  - Step 1 is always a link once a case exists.
  - Keep `aria-current="step"` on the current one, keep the ✓ on done steps, and add sr-only text for links.
  - `WizardFrame` gets `reachable` and forwards `caseStudy.id`.
  - Update `stepper.test.tsx`.
- **New** `src/app/(wizard)/_components/details-step.tsx` (`"use client"`):
  - Three fields from `FORM_FIELDS` order: label, `<textarea>` styled per the mockup (`rounded-md bg-surface-control p-3 min-h-[120px]`, placeholder in `foreground-muted`, lime focus ring from global `:focus-visible`), and an inline error.
  - Per-field save state is held in refs: a debounce timer (`DEBOUNCE_MS = 800`), the in-flight flag, the last saved text and any pending text.
  - Actions come from `@/app/(tool)/case-studies/actions` (`saveDetailsField`), each call in try/catch, as in `material-step.tsx`.
  - A polite live region and errors use the patterns in `material-step.tsx`.
  - The code-point count uses `[...text].length`.
  - The footer uses `WizardFooter`. `start` = `fill(copy.counter, {n})` in `font-mono`. `action` = an Avanti button that awaits `flushAll()` and then `router.push(wizardHref(caseId, 3))`.
  - Stepper links also flush through an `onNavigate` hook, or a `beforeunload` plus link click handler, whichever is smaller.
  - Flush on unmount when possible.
- **Copy** `src/shared/i18n/it.ts` `wizard.details.*`, from the mockup:
  - heading "Racconta il progetto"
  - intro "Tre campi facoltativi. Servono come fonte, ma da soli non bastano per generare."
  - labels: Contesto, Soluzione, Risultati
  - placeholders:
    - "Di cosa aveva bisogno il cliente, e perché?"
    - "Cosa avete fatto, e come?"
    - "Cosa è cambiato? Indica i numeri dove li hai."
  - counter "{n} di 3 compilati"
  - errors: save failed "Non salvato. Riprova modificando il testo." and too long "Massimo {max} caratteri."
  - `wizard.generatePlaceholder` "La generazione non è ancora disponibile in questa versione."
  - stepper sr-only "vai a"
  - add `it.test.ts` assertions
- **Table:** `case-studies-table.tsx:182` is unchanged (`wizardHref(row.id)`); update its comment to say the wizard picks the first incomplete step. Add the deferred link-click test from deferred-work L86 if it's small.
- **Tests:** `details-step.test.tsx` (happy-dom, `vi.useFakeTimers`, mocked actions and `next/navigation`) covering every matrix row through "Avanti"; page tests for the reopen, explicit-step and redirect rows; stepper tests.

## Tasks & Acceptance

**Execution:**
- [ ] `src/app/_lib/routes.ts` -- step 1/2/3
- [ ] `src/app/(wizard)/_components/stepper.tsx`, `wizard-frame.tsx` + tests -- clickable reachable steps
- [ ] `src/app/(wizard)/_components/details-step.tsx` + test -- autosave form
- [ ] `src/app/(wizard)/case-studies/new/page.tsx` + test -- first-incomplete redirect, step 2 with data, step 3 placeholder
- [ ] `src/shared/i18n/it.ts` + test -- copy
- [ ] `case-studies-table.tsx` -- comment (+ optional link test)
- [ ] `sprint-status.yaml` -- 2.10 and 2.5 comments (wizard steps 0–2 done; step 3 waits on Epic 3)

**Acceptance Criteria:**
- Given a Bozza case with files, when its row is clicked in Case studies, then the wizard opens at Dettagli with saved answers filled in.
- Given the repo, when lint, typecheck, tests and build run, then all pass. In the Browser pane on mac-recap-dev, typing in a field, reloading, and finding the text kept works.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- all pass

**Manual checks (if no CLI):**
- On mac-recap-dev (Browser pane): open the test case "Test Lumen" from Case studies. It should land on Dettagli. Type in Contesto, wait, reload, and the text is kept with the counter at "1 di 3 compilati". Click Materiale in the stepper and step 1 opens.
