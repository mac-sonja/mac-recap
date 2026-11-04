---
title: 'Story 4.3d: client and case fields on the page'
type: 'feature'
created: '2026-11-03'
status: 'done'
baseline_commit: '3afc6f03a4799c16fd83436e0748e4d48c143402'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In the configurator, texts bound to the client or the case can't be changed: the client name, the meta line (sector · year), the services, the logo, and the result rows and testimonial on the Risultati e testimonial page. Double-clicking one only says "Questo testo si potrà modificare presto." Once a case is Da approvare, the Details step no longer opens, so nothing in the app can change these values.

**Approach:** Edit these fields from the configurator. Each change goes through the client's or the case's own update use case, with that use case's validation and permission. After the save, the page reloads the bound values, so every page and format shows the new value at once. The document stores only the binding, never the value.

**Decisions (owner, 2026-11-03):**
- Year and services can be edited while the case is Da approvare. This needs one forward-only migration with a narrow SQL function. The case code never changes, even when the year does.
- The sector is picked from the shared list, with "add a sector", as in the client panel. It isn't free text.
- Texts are typed on the page like an own text (double-click or Enter; saved on blur or Enter; Esc cancels): the client name, each result row's number and label, and the testimonial quote and author.
- The sector, the year, the services (business-line pills) and the logo ("Sostituisci logo") are set in the left panel when their element is selected. The year is only shown inside the meta line ("sector · year"), so double-clicking the meta line selects it and focuses the year field.
- (owner, 2026-11-04, after review) The server refuses a result-row or testimonial save from the configurator unless the case is still Da approvare (`STALE_STATUS`, then the page reloads), so a configurator left open after approval elsewhere can't rewrite an approved case.

## Boundaries & Constraints

**Always:**
- The client name, sector and logo save through `updateClient` (`manage clients`), and the logo through its existing upload (`requestClientLogoUpload` → `confirmClientLogoUpload`).
- Result rows save through `saveCaseResults`, and the testimonial through `saveCaseTestimonial` (`fill details`).
- The year and services save through the new `updateCaseFields` (`fill details`).
- Client values are live for every case of that client, approved ones included.
- A failed save puts the old value back and shows the action's error message at the top of the canvas.
- These controls exist only where the canvas is editable (`editable` true, not Anteprima).
- Field edits aren't document edits: ⌘Z doesn't undo them, and they don't touch the revision version.

**Never:**
- Write a value into the document.
- Edit the MAC logo or a template's own words.
- Add a confirm dialog.
- Edit anything while the case is approved or the revision isn't writable (4.9).
- Renumber a case's code.
- Edit the client's description or the client's own results and testimonial (4.11).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rename the client | Type a new name on the page | `updateClient` with the client's other fields unchanged. Every page shows it. | `CLIENT_NAME_TAKEN` / `CLIENT_FIELD_INVALID` → message, old name back |
| Change the year | Meta line → year field 2026 | `updateCaseFields`. The meta line reads "sector · 2026", and the code stays the same. | `INVALID_INPUT` → message, old year back |
| Services | Toggle a business-line pill | `updateCaseFields` with the new list. The services element updates. | Last pill turned off → refused: "Serve almeno un servizio." |
| Result row | Type a new number in row 2 | `saveCaseResults` with the stored rows, only row 2's value changed | Number over 20 / label over 80 characters → message, old text back |
| Testimonial | Type a new author | `saveCaseTestimonial` with the stored quote and the new author | Author without a quote → message, old text back |
| Replace the logo | Choose a file | Upload, confirm, then `updateClient` with the new `logoId` | Upload failure or `CLIENT_LOGO_INVALID` → message, old logo stays |
| Client without a logo | Rename the client | Refused: `updateClient` requires a logo | "Aggiungi prima il logo del cliente." |
| Not editable | Approved case | No controls. Double-click shows `editSoon`. | N/A |
| Anteprima (owner, 2026-11-04) | Editable case in Anteprima, click or double-click on a bound text or the meta line | No controls, nothing saved. A message at the top of the canvas says to change it from the editor ("Modificalo dall'editor.") | N/A |

</frozen-after-approval>

## Code Map

- `src/modules/generation/domain/document.ts` -- read only. Bindings: client `name`, `sector`; case `year`, `resultLabel` and `resultValue` (with `index`), `testimonialQuote`, `testimonialAuthor`. The meta line is `bindings: [client.sector, case.year]`. `services` and `logos` are elements.
- `src/modules/rendering/templates/mac-case/v1/pages.ts` -- read only: where these bindings sit (meta line, `head`, results page).
- `supabase/migrations/20261021140000_case_study_details_client_and_services.sql` -- model for the new function. Business lines are a closed set (check constraint, at least one). It writes a `case_details_updated` event.
- `src/modules/case-study/application/update-case-study-details.ts`, `ports/case-study-repository.ts`, `adapters/supabase/*`, `index.ts` -- the pattern to follow for the new use case and repository call.
- `src/app/(tool)/case-studies/actions.ts` -- `saveCaseResults` (replaces the whole list) and `saveCaseTestimonial` (`{caseId, quote, author}`), reused as they are.
- `src/app/(tool)/clients/actions.ts` -- `updateClient` (needs every field: `clientId, name, industry, description, logoId`), `addClientSector`, and the logo upload actions, reused as they are. Reuse the client panel's logo upload and sector menu components from `src/app/(tool)/clients/_components` if they are free of their panel. Otherwise extract the shared part; don't copy it.
- `src/app/(wizard)/_lib/configurator-data.ts` -- `boundValuesOf` stays. Add `editableFieldsOf(...)`: `{ client: {id, name, industry, description, logoId}, case: {year, businessLines, results, testimonial} }`.
- `src/app/(wizard)/case-studies/[caseId]/configurator/page.tsx` -- pass `fields`, the sector list (`caseStudy.listClientSectors`) and the save callbacks. `key` excludes the values, so `router.refresh()` updates them without a remount.
- `src/app/(wizard)/_components/configurator/configurator.tsx` (the `editSoon` branch, around line 328), `canvas.tsx`, `in-place-text.ts`, `text-editing.ts` (`isOwnText`), `left-panel.tsx`.
- `src/shared/i18n/it.ts` + `it.test.ts` -- `configurator.fields.*`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261104120000_case_study_update_fields.sql` -- add `update_case_fields(p_case_id, p_year, p_business_lines, p_actor_id)`, service role only. It accepts only a case in `in_review` (anything else → `STALE_STATUS`; `NOT_FOUND`), and at least one known business line (else `INVALID_INPUT`). It never touches `code` or `number`. A changed save writes one `case_details_updated` event with `{year, businessLines}`; an unchanged one writes nothing. Then regenerate `src/shared/db.types.ts`.
- [x] `src/modules/case-study/{domain/case-study.ts,application/update-case-fields.ts,ports,adapters,index.ts}` -- add `updateCaseFields(actor, {caseId, year, businessLines})`, with the year validated as in `updateCaseStudyDetailsInputSchema`. Add unit tests.
- [x] `src/app/(wizard)/case-studies/[caseId]/configurator/actions.ts` -- add `updateCaseFields` (`fill details`). Add an action test and a row in `test/permissions.test.ts`.
- [x] `src/app/(wizard)/_lib/configurator-data.ts` + `page.tsx` -- add `editableFieldsOf` and pass `fields`, `sectors` and the actions.
- [x] `src/app/(wizard)/_components/configurator/bound-fields.ts` (new, + test) -- pure helpers:
  - which editor a bound element opens: `name`, `meta`, `resultLabel`, `resultValue`, `testimonialQuote`, `testimonialAuthor`, `services` or `logos`;
  - the full input for each save from `fields` plus one change (the client's other fields, the other result rows, the other half of the testimonial);
  - trimming, and a no-op when nothing changed.
- [x] `configurator.tsx` + `canvas.tsx` + `in-place-text.ts` -- in-place typing for bound texts. It shows the current value and, on commit, calls the matching save (not `doc.change`), then `router.refresh()`. On failure it restores the old value and calls `say(message)`. The meta line goes to the panel's year field instead.
- [x] `left-panel.tsx` (+ a `bound-field-panel.tsx` if it grows) -- "Dati del cliente" / "Dati della case" section for a selected meta line (sector menu with "Aggiungi settore", year field), services (business-line pills) or logos ("Sostituisci logo"). Saving state is shown inline.
- [x] `src/shared/i18n/it.ts` + `it.test.ts` -- copy: section titles, labels, "Serve almeno un servizio.", "Aggiungi prima il logo del cliente.", an error message per code, using the agency voice from the `mac-recap-ui` skill.
- [x] Tests: `bound-fields.test.ts` (matrix rows), `configurator.test.tsx` (typing a name calls `updateClient` with full input; failure restores and shows the message; not editable → `editSoon`; meta line focuses the year), and a DB test for `update_case_fields` (draft or approved → `STALE_STATUS`; code unchanged; event written).

**Acceptance Criteria:**
- Given a case Da approvare, when the person changes the client name on one page, then every page in every format shows the new name without a reload, and the document's saved JSON is unchanged.
- Given a client edited from one case, when another case of that client is opened, then it shows the new values.
- Given an approved case or Anteprima, when the person double-clicks a bound text, then nothing is editable and the existing message shows.

## Implementation Notes

- Bound editing is on only when the case is editable and the page passes `fields`, `fieldOptions` and `fieldActions`; without them (a later client file) a bound text still says `editSoon`.
- A change shows at once (an overlay on the loaded values and fields, dropped when `router.refresh()` brings new ones) and saves one at a time; a refused or failed save restores the previous overlay and says why. `STALE_STATUS` / `NOT_FOUND` also refresh.
- The sector's "Aggiungi settore" check is extracted to `clients/_components/new-sector.ts` and used by the client panel and the configurator. The logo reuses `useClientLogo`.
- The client's description, sector or logo being missing refuses a client save before the call (`needClientInfo`, `needLogo`): `updateClient` requires them. A rename is refused at the double-click when the client has no logo.
- `db.types.ts` was edited by hand for `update_case_fields` (no local Supabase): regenerate with `npm run db:types` to confirm.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | blind, edge | Results/testimonial saves accept an approved case (stale tab) | medium | `saveCaseResults`/`saveCaseTestimonial` accept any status; only `editable` guards the page | owner decided: server check (intent amended), fixed as patch |
| 2 | blind | `update_case_fields` ignores the head revision's state | low | An `in_review` case's head is `working` in every flow until 4.9; reachable only by a hand-made call; fix adds a guard | rejected |
| 3 | blind | Overlapping saves blink back when the first refresh lands | low | Real but cosmetic and brief; fix adds state | rejected |
| 4 | blind, edge, gap | A sector added with Aggiungi settore shows the old label until refresh | low | `shownValues` looks up `fieldOptions.sectors`, which lacks it; direct correction | patch |
| 5 | blind, edge | Rename typed then refused when the client lacks sector or description | medium | `requestEdit` pre-checks only `logoId`; the typed name is lost at commit | patch |
| 6 | blind, edge | Object URL revoked on panel unmount → broken logo until refresh | low | Needs a selection change inside the refresh window; fix moves ownership | rejected |
| 7 | blind | Permission suite counts the configurator with `+ 1` | low | `saveRevisionDoc`, `approveCase`, `getRenderAssets` were outside the suite before this story | defer |
| 8 | blind | Sprint status and migration records stale | low | Handled by the finalize step's sprint sync and the PR notes | rejected |
| 9 | blind | Untested: thrown save → `errors.failed` | low | No test drives a throw; direct test addition | patch |
| 10 | blind, edge | Year field reset/normalise/unmount edge cases ('02026', concurrent, unmount) | low | Rare; blur commits before unmount in normal use | rejected |
| 11 | blind | `fromEditor` uses a straight apostrophe | low | Every other new string uses ’ | patch |
| 12 | blind | `LogoField` fixed DOM id | low | Rest of the panel uses `useId()` | patch |
| 13 | blind | One double-click in Anteprima shows the message up to three times | low | Slide calls the pick on click and double-click | patch |
| 14 | blind | Approved cases' outputs change silently with client values | false | Intended: "Client values are live for every case of that client, approved ones included" | rejected |
| 15 | edge | Logo uploaded and confirmed, then refused for missing sector/description → orphaned logo | medium | `LogoField` uploads before `planFieldSave` checks the client | patch |
| 16 | edge | Empty `bindings` opens the meta editor | false | `textElementSchema` requires 2–3 bindings | rejected |
| 17 | edge | A service toggled on is appended, not in `BUSINESS_LINES` order | low | Shown order changes after refresh; one-line correction | patch |
| 18 | edge | A refresh while typing another bound text overwrites it | maybe-false | React only updates nodes whose value changed; the typed node's own value doesn't change from another field's save; would need a browser check | rejected (would be low) |
| 19 | edge | AC says Anteprima shows `editSoon` | low | Owner's matrix row (2026-11-04) supersedes; fix would edit this spec | rejected |
| 20 | gap | No test: `STALE_STATUS`/`NOT_FOUND` refresh | gap | Pre-verified by the layer | patch |
| 21 | gap | No test: two queued field saves | gap | Pre-verified by the layer | patch |
| 22 | gap | No test: refused year restores the field | gap | Pre-verified by the layer | patch |
| 23 | gap | No test: Aggiungi settore in the configurator | gap | Pre-verified by the layer | patch |
| 24 | gap | No test: Anteprima message on Carosello/Video | gap | Pre-verified by the layer | patch |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: all green
- `npm run test:db` (CI, or local Supabase) -- expected: green, including `update_case_fields`

**Manual checks:**
- On mac-recap-dev, once the migration is applied: open a case Da approvare, rename the client, change the year and a service, edit a result number and the author, and replace the logo. Check that all three formats update, and that the case code is unchanged in the top bar.
