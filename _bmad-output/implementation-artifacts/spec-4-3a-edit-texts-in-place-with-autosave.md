---
title: 'Story 4.3a: edit texts in place, with autosave, undo/redo and the overflow marker'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_commit: '151e3a6652d843cf41976950933cc23b8c8f9582'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The configurator (4.2a/4.2b) shows a case's pages but nothing can be changed, and no path writes `revision.doc`. Every Epic 4 editing story (4.3b–d, 4.4, 4.5, 4.13, 4.11) needs one save path, one undo history and the overflow marker first.

**Approach:** Owner/designers edit a text in place on the canvas and in Anteprima. The document then saves by compare-and-set on `revision.version`, through a new security-definer function, with the save state, retries and stale reload. ⌘Z / ⇧⌘Z and the top bar's undo and redo work on every edit. A block whose text no longer fits shows a marker. This is split from Story 4.3 by the owner (2026-10-29). 4.3b (text panel), 4.3c (elements and blocks) and 4.3d (client and case fields) are in deferred-work.

**Decisions (owner, 2026-10-29):**
- The spec stays whole (about 2,000 tokens, over the 1,600 target).
- Subagents may be used for this story's review step.

## Boundaries & Constraints

**Always:**
- Editing a text:
  - In the editor, double-click a text, or press Enter with it selected, to edit it as plain text with line breaks. Esc or a click outside finishes. In Anteprima, a click places the cursor (mockup).
  - Each editing session is one undo step. The change applies only to the format in view.
- Only texts with their own words (`text`) are editable, inside Testi groups too. Bound texts (`binding`/`bindings`) are 4.3d: a double-click shows the "arriva presto" message.
- Editing is on only when the head revision is `working` and the case is `in_review`. On an approved case (4.9) or the trial pages, a double-click shows "arriva presto".
- An edited `generated` text becomes `human_edited`; `human_added` stays. `generated_doc` never changes.
- Saving:
  - The save runs 800 ms after the last change, and again on finishing an edit. Writes go one at a time, the latest document after the one in flight. Each write sends the whole document with the expected `version` and receives the new one.
  - The top bar shows "Salvataggio…" then "Salvato".
  - On a network or server error it shows "Non salvato. Nuovo tentativo…" and retries after 2 s, 4 s, 8 s, then every 15 s. After 3 failures a banner says "Le modifiche non si salvano. Tieni aperta questa scheda." It goes away on the next success.
  - `STALE_REVISION`, `STALE_HEAD`, `REVISION_NOT_WRITABLE` and `CASE_NOT_EDITABLE` are not retried: the page reloads from the server, the history is cleared and no message is shown (IR-A5).
- The server action authorizes `edit`. The use case validates with `generation.validateNewDocument`, and refuses (`ASSET_NOT_ALLOWED`) a document that references an asset id the stored `doc` does not reference. The real media guardrail comes with 4.5.
- The function `save_revision_doc` (forward-only migration):
  - In one transaction, it locks the revision and the case and checks, in this order:
    - the case exists and isn't deleted (`NOT_FOUND`);
    - the revision is the case's head (`STALE_HEAD`);
    - the case is `in_review` (`CASE_NOT_EDITABLE`);
    - the revision is `working` (`REVISION_NOT_WRITABLE`);
    - its `version` equals the expected one (`STALE_REVISION`).
  - It then writes `doc`, `schema_version` and `version + 1`, and one `revision_saved` case event (`{ version }`, not shown in Attività).
- Undo and redo:
  - The history holds snapshots of every format's pages, at most 100.
  - ⌘Z and ⇧⌘Z (Ctrl on other systems) work outside a text being edited. Inside one, the browser's own text undo applies.
  - An undo or redo switches to the format it changed, and saves like any edit. Undo and redo are disabled when there is nothing to undo or redo.
- The overflow marker:
  - `measureOverflow` runs on each canvas page after it renders. An overflowing block gets an orange ring and a "Il testo non entra" tag, shown in the editor only.
  - The Video pages are measured from a still render, never mid-loop.
- Strings go in `it.ts` and are pinned in `it.test.ts`. Check light and dark, and respect reduced motion.

**Never:**
- None of these: the text panel, Elementi, block or page edits, Approva, or the fork of an approved case.
- No change to `src/modules/rendering` beyond reading, and none to `src/worker`.
- No keyboard path to select blocks.
- The migration is not applied to mac-recap-dev before CI is green and the owner agrees.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Edit | double-click a generated text, type, Esc | text shown, `human_edited`, saved version n+1 | N/A |
| Fast typing | edits while a save is in flight | one more save of the latest doc afterwards | N/A |
| Network down | save throws | "Non salvato. Nuovo tentativo…", banner after 3 | retries with backoff |
| Colleague saved first | `STALE_REVISION` | page reloads with the server content | no retry |
| Case regenerating | `CASE_NOT_EDITABLE` | reload; page redirects to the table | no retry |
| Undo in another format | ⌘Z after switching format | switches back, text restored, saved | N/A |
| Bound or approved | double-click | "arriva presto" message, nothing edited | N/A |
| Too long | text overflows its block | ring + tag on that block | N/A |
| Foreign asset | doc names an asset not in stored doc | 400 `ASSET_NOT_ALLOWED`, nothing written | client treats as failure |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261029120000_case_study_save_revision_doc.sql` (new) -- `save_revision_doc(p_revision_id, p_doc, p_expected_version, p_actor_id)`; model on `create_working_revision` in `20261020160000_case_study_revision.sql` (shape checks, P0001 messages, grants). `test/db/revision.db.test.ts` -- every refusal plus success.
- `src/modules/case-study/{ports/revision-repository.ts,adapters/supabase/revision-repository.ts}` -- `saveDoc`, refusals via `refusalOf`; `REVISION_SAVED` in `domain/revision.ts`; `application/revisions.ts` -- `makeSaveRevisionDoc` (parse, validate, asset subset, call, `upgraded`); `index.ts` -- `saveRevisionDoc` with JSDoc listing errors. `src/shared/db.types.ts` -- rpc type.
- `src/modules/access/index.ts` -- `STALE_REVISION`, `STALE_HEAD`, `REVISION_NOT_WRITABLE`, `CASE_NOT_EDITABLE` → 409; `ASSET_NOT_ALLOWED` → 400 (+ `index.test.ts`).
- `src/app/(wizard)/case-studies/[caseId]/configurator/actions.ts` (new, `"use server"`) -- `saveRevisionDoc` (getActor, `authorize(…, "edit", { status })`). `page.tsx` -- pass `revision: { id, version, editable }`; key `Configurator` by `${id}:${version}` so a refresh resets it.
- `src/app/(wizard)/_components/configurator/` -- new `use-document.ts` (doc state, history, save queue, retry, stale → `router.refresh()`), `text-editing.ts` (find/replace a text by `elementId` in a page, provenance), `overflow-marker.tsx`; `canvas.tsx` (contentEditable `plaintext-only` on the rendered node, read `innerText` on finish, remount `RenderedPage` by an edit counter so React never reconciles typed DOM), `configurator.tsx` (keys Enter, ⌘Z, ⇧⌘Z), `top-bar.tsx` (save state, enable undo/redo), `selection.ts` (`findElement` reuse).
- `src/app/(wizard)/_components/use-autosave-fields.ts` -- read only (`DEBOUNCE_MS` 800 reused).
- `src/shared/i18n/it.ts` + `it.test.ts` -- `configurator.save.*`, `configurator.overflow`, `configurator.editSoon`.

## Tasks & Acceptance

**Execution:**
- [x] Migration + DB test.
- [x] case-study port, adapter, use case (+ `revisions.test.ts`), index, db types.
- [x] access status codes (+ test).
- [x] configurator `actions.ts` (+ test; `test/authorize-guard.test.ts` passes), `page.tsx` (+ test).
- [x] `it.ts` / `it.test.ts`.
- [x] `use-document.ts`, `text-editing.ts` (+ unit tests: queue, backoff, stale, history cap, provenance).
- [x] canvas editing, overflow marker, top bar, keys (+ `configurator.test.tsx` for every matrix row).
- [x] `sprint-status.yaml` -- 4.3 in progress, note the 4.3a–d split.

**Acceptance Criteria:**
- Given Story 4.3's criteria for in-place text editing, save, provenance, undo/redo, overflow, save failure, stale save and `generating` in `epics.md`, when checked on the running page, then each is met.
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass; `npm run test:db` passes in CI.

## Design Notes

The rendered page is the renderer's markup. Editing switches the node's `contentEditable` imperatively. On finishing, the new text goes into the doc state and the page remounts (key bump), so React rebuilds that markup from the doc.

## Implementation Notes

- Owner (2026-10-29): subagents only for the review step, so the implementation was done in the main session.
- Action: `authorize(actor, "edit")` with no status. `test/authorize-guard.test.ts` forbids any module call (such as `caseStudy.get`) before `authorize`, and `edit` doesn't depend on status. `save_revision_doc` enforces `in_review` (`CASE_NOT_EDITABLE`), and the use case refuses a revision of another case (`NOT_FOUND`).
- The client keeps each format as a page list. A save sends each format as `{ pages }`, as stored. A browser check caught this (every save was `DOCUMENT_INVALID`), and `configurator.test.tsx` now runs the sent document through `validateNewDocument`.
- The typed words are read from the DOM (`typedText`: text nodes, `<br>`, wrapped `<div>`), not `innerText`, which applies the template's CSS: an Etichetta was saved in capitals.
- The overflow marker uses a new `warning` token (`#e07800` light, `#ffa031` dark, in all three theme blocks).
- From the first unsaved edit the save state reads "Salvataggio…", during the debounce too, so "Salvato" always means saved.
- Line breaks show only in a `text`-style text (the renderer's `white-space: pre-line`). In a title they are saved but don't show. That's renderer behaviour (Story 3.5), unchanged here.
- Verified in Chromium against the local stack (`next dev` on localhost):
  - typing in place with line breaks, saved and reloaded;
  - ⌘Z and ⇧⌘Z saved;
  - typing in Anteprima on Carosello;
  - Esc inside a text doesn't leave Anteprima;
  - the banner appears with save requests aborted and clears when saving recovers;
  - the overflow marker, in light and dark.

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Save state stuck on "Salvataggio…" after undoing back to the saved document (blind, edge) | medium | `show()` set "saving"; `run()` returned early on `current === saved` without resetting it | patch |
| 2 | Deterministic refusals (`DOCUMENT_INVALID`, `ASSET_NOT_ALLOWED`, a text over 5,000 characters) retried forever (blind, edge) | medium | Every non-stale refusal entered the backoff loop; the same document fails each time | patch (no timed retry; the next edit tries again) |
| 3 | Leaving through the in-app back link inside the debounce drops the edit; a save in flight could reload after unmount (verify-gap other, edge) | medium | Unmount cleared the timers without sending; `beforeunload` doesn't fire on client navigation | patch |
| 4 | Double-click inside the open text splits the session into several undo steps (blind, edge) | low | `onDoubleClick` lacked the `[contenteditable]` guard that `onClick` has; direct fix | patch |
| 5 | No focus indicator on a text typed in during Anteprima (blind) | medium | `TYPING` removed the outline there, and Anteprima draws no selection frame | patch (focus ring in Anteprima) |
| 6 | Overflow measured before web fonts load (blind) | low | Font swap changes the text's size without resizing the host; direct fix (`document.fonts.ready`) | patch |
| 7 | Asset allow-list from the stored doc only: an undo bringing back a removed asset is refused (blind, edge) | low | No 4.3a path removes assets; a one-line union with `generatedDoc` | patch |
| 8 | Browser placeholder `<br>` saved as a trailing newline, an emptied text as "\n" (edge) | low | `typedText` counted every `<br>`; direct fix at the text's top level | patch |
| 9 | `undo()` after a stale stop pops and drops a step (edge) | low | Order of the checks; direct fix | patch |
| 10 | `saveRevisionDoc` JSDoc asks for `authorize(…, { status })`, the action authorizes `edit` alone (blind) | low | The guard forbids a module call before `authorize`; the database enforces `in_review`; doc corrected | patch |
| 11 | Missing tests: Carosello Anteprima typing, adapter refusal mapping, `beforeunload`, `NOT_FOUND` reload, a vacuous trial test (verify-gap, blind) | medium | Each could regress without a failing test | patch (tests added) |
| 12 | A stale save silently drops unsaved edits with no message (blind) | false | Required by the spec (IR-A5: reload, no "someone else changed this" state) | reject |
| 13 | Remount key includes `head.version` (blind) | false | Only a stale reload refreshes the page; without the version a stale reload of the same head would not reset the stopped document | reject |
| 14 | Action authorizes without the case's status (blind) | false | `edit` has no status rule; `save_revision_doc` refuses a case not `in_review`; the use case refuses another case's revision | reject |
| 15 | Leaving a text without typing marks it `human_edited` (blind) | false | `typedText` reads the text nodes the renderer wrote from `text`; `withText` returns the same pages for the same words | reject |
| 16 | `REVISION_WRITE_FAILED` after a commit leads to `STALE_REVISION` and a reload (blind) | low | Rare; the reload shows what was committed; handling needs a re-read path | reject |
| 17 | Esc drops focus to `<body>` (blind) | low | Enter and ⌘Z still work from `<body>`; restoring focus needs a focusable page | reject |
| 18 | Undo/redo hints show ⌘ only (blind) | low | Mockup copy; platform detection adds code | reject |
| 19 | Undo/redo natively `disabled`, Approva `aria-disabled` (blind) | low | Undo/redo are real controls now; Approva is a placeholder until 4.8 | reject |
| 20 | Save state announced on every save (blind) | low | `aria-live="polite"` on a short label; quieter announcing needs another region | reject |
| 21 | One `revision_saved` event per save (blind) | false | The spec asks for an event per save; it is not shown in Attività | reject |
| 22 | Hidden still copy repeats ids inside the host (verify-gap other) | low | It comes after the visible copy, so `querySelector` finds the visible one; `pointer-events: none` | reject |
| 23 | Edit cleared while focused leaves a stuck session (edge) | false | Every way to clear it (format switch, undo button) moves focus first, firing `focusout`; ⌘Z is ignored while typing | reject |
| 24 | `editing` set for an element missing from the host (edge) | low | `requestEdit` only opens elements found in the rendered page | reject |
| 25 | `flush()` waits while failing (edge) | low | By design: the retry timer paces saves | reject |

## Verification

**Commands** (Node 24: `export NVM_DIR=/opt/nvm; . /opt/nvm/nvm.sh; nvm use 24`):
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` -- expected: pass

**Manual checks:**
- Playwright screenshots, light and dark: a text being edited, "Salvataggio…", the retry banner, an overflowing block.
