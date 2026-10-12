---
title: 'Story 2.4 (part 2): Accessible single-level Dialog'
type: 'feature'
created: '2026-10-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2b63318d65f0356baa15776d1e421b6520ec6fd2'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-app-shell-navigation-tokens-italian-copy-status-badge.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The confirm dialogs in Epics 2–4 (Delete, Approve, Update approved version, Remove user, Turn off link) need one accessible dialog that never stacks (UX-DR1, UX-DR27), and the repo has no DOM test environment to prove keyboard behaviour, so the user menu's Escape handling is untested too.

**Approach:** A shared `Dialog` client component on the native `<dialog>` with `showModal()`, plus a DOM test environment used only by tests that opt in, covering the Dialog and the user menu.

## Boundaries & Constraints

**Always:** Native `<dialog>` opened with `showModal()` (the browser makes the rest of the page inert, which is the focus trap). Controlled API: `open`, `onClose`, a required `title` that labels the dialog (`aria-labelledby`), optional `description` (`aria-describedby`), `children`, and `actions` supplied by the caller. On open, focus moves into the dialog (first focusable element, else the dialog); on close, focus returns to the element that was focused when it opened. Esc (the native `cancel` event) calls `onClose` instead of closing on its own. At most one Dialog is open at a time: opening a second while one is open is refused — it stays closed and logs a development warning. Styling from tokens only (`surface-raised`, `border`, `foreground`, `rounded-md`; backdrop from `foreground` at reduced opacity); no animation. The DOM environment is per file (`// @vitest-environment …` docblock); the default stays `node`. New dev dependencies pinned exactly, latest version published at least two weeks ago. **Decision (no built-in close button):** callers supply Cancel/confirm actions, so the Dialog adds no string of its own. **Decision (backdrop):** clicking the backdrop does not close the dialog.

**Never:** No dialog callers or confirm flows (Stories 4.1, 4.8, 4.9, 5.7, 6.3 add them). No portal or third-party dialog library. No new dictionary strings. No lint rule for hard-coded strings (Story 2.4 part 3). No change to the user menu's behaviour, only tests for it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | `open` false → true, focus on a button | dialog opened modally, labelled by `title`; focus inside it | N/A |
| Esc | open dialog, Escape | `onClose` called once; stays open until the caller sets `open` false | N/A |
| Close | `open` true → false | dialog closed; focus back on the opener | N/A |
| Second dialog | one open, another set `open` | the second stays closed; development warning | N/A |
| After close | first closed, second opened | second opens normally | N/A |
| Unmount while open | component removed | the single-dialog slot is released | N/A |
| User menu | click button; then Escape | `aria-expanded="true"`, panel shown; Escape hides it and focuses the button | N/A |

</frozen-after-approval>

## Code Map

- `src/app/_components/` -- shared app components (`status-badge.tsx`, `no-actor.tsx`); put `dialog.tsx` here as a `"use client"` component. Read tokens via Tailwind theme utilities only; `test/tokens.test.ts` rejects raw colours and font stacks in `src/app/**/*.tsx`.
- `src/app/(tool)/_components/user-menu.tsx` -- disclosure with `aria-expanded`, Escape closes and refocuses the button; test it, don't change it.
- `vitest.config.mts` -- `environment: "node"`, includes `src/**/*.test.{ts,tsx}`; keep the default, opt in per file.
- `package.json` -- exact pins only (no `^`/`~`). Candidates: `jsdom` (or `happy-dom`), `@testing-library/react`, `@testing-library/user-event`. Check that the chosen environment implements `HTMLDialogElement.showModal`, `close` and the `cancel` event; if it doesn't, pick the one that does, or stub only the missing method in the test file and say so in Implementation Notes.
- `src/shared/i18n/it.ts` -- untouched; test strings come from props.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `package-lock.json` -- DOM test dev dependencies, exact pins
- [x] `src/app/_components/dialog.tsx` -- the Dialog per Boundaries, with a small single-open registry
- [x] `src/app/_components/dialog.test.tsx` -- every Dialog row of the matrix, plus `aria-labelledby`/`aria-describedby` wiring and that the backdrop click doesn't close
- [x] `src/app/(tool)/_components/user-menu.test.tsx` -- the User menu matrix row
- [x] `README.md` -- one line under "UI": the Dialog is the only dialog; one level deep; callers supply actions

**Acceptance Criteria:**
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass, and tests without the docblock still run in `node`.

## Implementation Notes

- DOM environment: `happy-dom` 20.14.5 (2026-09-12). `jsdom` 30.1.1 was tried and rejected: it has no `HTMLDialogElement.showModal`/`close`. happy-dom implements both but does not turn Escape into a `cancel` event, so the Dialog test dispatches a cancelable `cancel` event on the dialog (what browsers fire on Esc); nothing is stubbed. Also added, exact pins, latest ≥2 weeks old: `@testing-library/react` 16.3.3, its peer `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.7.
- Opt-in per file with `// @vitest-environment happy-dom`; `vitest.config.mts` unchanged (default `node`). Vitest globals are off, so the DOM tests call `cleanup()` in `afterEach`.
- The single-open registry is a module-level owner token in `dialog.tsx`, taken in the open effect and released in its cleanup (close or unmount). A refused Dialog stays closed until its `open` prop changes again.
- The "development warning" is an unconditional `console.warn`: client code may not read `process.env` (lint rule, `src/shared/env.ts` only), and a refused second dialog is a programming error in any build.
- A browser-initiated close (e.g. Chrome closing on repeated Esc without user activation, where `cancel` is not cancelable) also calls `onClose`, so the caller's state stays in sync.
- The dialog has `tabIndex={-1}` so it can take focus when it contains nothing focusable. Backdrop: `backdrop:bg-foreground/50`; no backdrop-click handler, matching native behaviour.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | verification-gap | Tests can't tell `showModal()` from `show()` | medium | happy-dom implements both as `setAttribute('open')`; swapping them passes every test, losing the focus trap unnoticed | patch |
| 2 | verification-gap | Browser-initiated `close` → `onClose` path untested | low | No test closes the dialog while the listener is attached; removing it passes | patch |
| 3 | edge | Slot claimed before `showModal()`; a throw holds it forever | low | Direct reorder; a stuck slot would refuse every later dialog | patch |
| 4 | edge, blind | Caller's `autofocus` overridden by the first focusable element | low | A confirm dialog couldn't put focus on Cancel; one-expression fix | patch |
| 5 | blind | README omits the caller rules (controlled `open`, no backdrop close, focus return) | low | Every future caller needs them; one sentence | patch |
| 6 | blind, verification-gap | Esc, backdrop and inertness only simulated; no real-browser check | low | happy-dom has no top layer or light-dismiss; needs a Playwright harness | defer |
| 7 | edge, blind | A refused dialog stays closed with the caller still `open` | low | Frozen matrix: "the second stays closed"; refusal is a programming error, signalled by the warning | reject |
| 8 | edge | Slot held if the browser closes the dialog and the caller ignores `onClose` | low | Caller bug; `onClose` is always called | reject |
| 9 | blind | `onClose` can fire twice (non-cancelable cancel, then close) | low | Callers set `open` false; a second call is a no-op | reject |
| 10 | edge | Hidden or disabled-fieldset elements matched as focusable | low | Callers supply simple actions; fix adds visibility checks | reject |
| 11 | edge | Opener removed before close (e.g. deleted row) loses focus | low | A fallback target belongs with Story 4.1's Delete flow | reject |
| 12 | edge, blind | Falsy `description` (0, "") dropped; empty `title` possible | low | Callers pass dictionary strings | reject |
| 13 | blind | Background still scrolls behind the modal | low | Native modal behaviour; not in the matrix | reject |
| 14 | blind | Module-level slot (HMR); warning also in production | low | `process.env` is banned in client code; the warning only fires on a programming error | reject |
| 15 | blind | DOM environment per file, not in config | false | Spec Boundaries: per-file docblock, default stays `node` | reject |
| 16 | blind | Lockfile, deferred-work and spec absent from the diff | false | By design: lockfile excluded for size; the spec goes only to the edge-case layer | reject |
| 17 | blind | User-menu test spies on `focus` redundantly; out of place | low | Harmless extra assertion; the spec includes the user-menu test | reject |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0
</content>
