---
title: 'Story 3.8: tell me when the draft is ready'
type: 'feature'
created: '2026-11-04'
status: 'in-progress'
baseline_commit: 'c8bf867976f6746e8622eb9dfd15952d11ef4f02'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After pressing Generate, a person only learns that the draft is ready by staying on the wizard's "generating" screen or by checking the Case studies list.

**Approach:** Wherever the person is in the app (tool pages, wizard, configurator), a small poller asks the server every 15 seconds whether any case they started generating has reached Da approvare since this page session began. For each one, a toast says «{Name} è pronta da rivedere.» with **Apri**, which opens that case in the configurator (4.2 retargeted **Apri** there).

## Boundaries & Constraints

**Always:**
- Only cases whose latest `generate` transition was made by the current actor, and that reached `in_review` (a `generation_succeeded` transition) after this page session's start time.
- One toast per case, never twice in a session.
- The toast is announced politely (`role="status"`, `aria-live="polite"`) and never takes focus. It has a close button and goes away by itself after 10 seconds, pausing while hovered or focused.
- With reduced motion it appears without movement.
- Polling pauses while the tab is hidden and asks once when the tab is shown again.
- Only roles that may `generate` poll at all.
- Italian copy from `it.ts`, house voice of `mac-recap-ui`.

**Never:**
- Replaying past drafts: a new page load starts a new session from now.
- Email, Slack or any external notification.
- A toast for a failed generation (the wizard's step 3 already shows failures).
- A migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ready while elsewhere | I pressed Generate, then went to Clienti; the case reaches Da approvare | Within 15 s, a toast «{Name} è pronta da rivedere.» with **Apri** | N/A |
| Apri | Click **Apri** | The case's configurator opens and the toast closes | N/A |
| Someone else's | Another person's generation finishes | No toast for me | N/A |
| Two at once | Two of my cases finish in the same interval | Two toasts, stacked, newest at the bottom, at most 3 shown | N/A |
| Came back later | The draft finished while I was away; I open the app | No toast; the case is in the table as Da approvare | N/A |
| Not again | The toast was shown, then the next poll runs | Not shown again | N/A |
| Failed | My generation fails | No toast | N/A |
| Poll error | The server action fails or the network is down | Nothing shown; the next interval tries again | Logged once, never a toast |
| Not allowed | A role that can't `generate` (account/sales/social) | No polling | N/A |

</frozen-after-approval>

## Code Map

- `src/modules/case-study/domain/transition.ts` -- `TRANSITION_EVENTS` (`generate`, `generation_succeeded`). Transitions are `case_event` rows of type `transition` with `data.event`. The worker writes `generation_succeeded` as the system actor, so "mine" comes from the latest `generate` event's `actor_id`.
- `src/modules/case-study/adapters/supabase/case-study-repository.ts` -- `enteredAt(...)` (around line 130) reads transition events by case. Add a repository read: the cases whose `generation_succeeded` is after `since` and whose latest `generate` is by `actorId`, returning `{ id, name, readyAt }` and ignoring deleted cases. Expose it as `case-study.listReadyDrafts(actor, { since })` through `index.ts`.
- `src/app/(wizard)/_components/generating-screen.tsx` -- the existing polling pattern (`router.refresh` on an interval, `GENERATING_REFRESH_MS`). Don't change it.
- `src/app/(tool)/layout.tsx` and `src/app/(wizard)/layout.tsx` -- mount one `<DraftReadyNotifier />` in each, only when `can(actor, "generate")`.
- `src/app/(wizard)/_components/configurator/status-message.tsx` -- the canvas's status message: a pattern for `role="status"` and the house motion, not to be reused for the toast.
- New `src/app/_components/draft-ready-notifier.tsx` + `src/app/_lib/draft-ready.ts` (pure: dedupe by id, cap at 3, the session's `since`) + a server action `src/app/_lib/draft-ready-actions.ts` (`getActor`, `authorize(actor, "generate")`, then `listReadyDrafts`).
- `src/shared/i18n/it.ts` + `it.test.ts` -- `draftReady.title: "{name} è pronta da rivedere."`, `draftReady.open: "Apri"`, `draftReady.close`.
- `test/permissions.test.ts` -- a row for the new action.

## Tasks & Acceptance

**Execution:**
- [x] `src/modules/case-study` -- `listReadyDrafts` (port, Supabase adapter, use case, index), with unit tests for: mine vs others, after `since`, failed generation excluded, deleted case excluded.
- [x] `src/app/_lib/draft-ready-actions.ts` + test -- the server action, with 403 for roles without `generate`.
- [x] `src/app/_lib/draft-ready.ts` + test -- the session's `since`, dedupe and the cap.
- [x] `src/app/_components/draft-ready-notifier.tsx` + test -- the 15-second poll (fake timers), pausing while hidden, the toasts (announced, no focus taken, close, 10-second timeout paused on hover or focus, reduced motion) and **Apri** to `/case-studies/{id}/configurator`.
- [x] `src/app/(tool)/layout.tsx`, `src/app/(wizard)/layout.tsx` (+ their tests) -- mount it for roles that may `generate`.
- [x] `src/shared/i18n/it.ts` + `it.test.ts`; `test/permissions.test.ts`; `test/db/case-study.db.test.ts`: `listReadyDrafts` against real events.

**Acceptance Criteria:**
- Given I'm in the configurator of another case when my draft finishes, when the next poll runs, then the toast shows there too and my typing isn't interrupted.

## Implementation Notes

- The selection rule is a pure domain function, `selectReadyDrafts` (`domain/ready-draft.ts`); the Supabase adapter only fetches the `generation_succeeded` events after `since`, then those cases' `generate` events and rows, and hands them to it. The unit tests exercise that function through the use case.
- The session's `since` is the server's time when the layout rendered (`startedAt` prop), so a skewed browser clock neither replays nor misses drafts. The session (start, seen ids) and the toasts on screen live at module level in the notifier, so client navigation between `(tool)` and `(wizard)` keeps them; only a new page load starts a new session.
- A new toast's message fills in one tick after its `role="status"` element mounts, so screen readers announce it. **Apri** is described by the message (`aria-describedby`), since several toasts can be on screen.
- A failed poll (`ok: false` or a thrown network error) is logged once per session with `console.warn` and never shown.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` (Node 24) -- expected: all green
- `npm run test:db` (CI) -- expected: green, including `listReadyDrafts`

**Manual checks:**
- On mac-recap-dev: press Generate on a case, go to Clienti, and see the toast arrive; **Apri** opens the configurator.
