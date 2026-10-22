---
title: 'Client Racconto: structured Risultati and a Testimonial'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_commit: '0feee957a37381b4e39780a0db4a7539f54dd756'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A client's Risultati is one free-text box, and there is no place for a client quote. The owner's mock asks for up to 3 numbers with a label, and a Testimonial.

**Approach:** In the client panel's **03 Racconto** card, after Contesto and Soluzione, replace the Risultati textarea with **Risultati**: up to 3 rows of label + value. Add **Testimonial**: a quote and its author. Both are optional and autosave like the other brief texts. The old free-text `results` column and its data are dropped.

## Boundaries & Constraints

**Always:**
- Owner decisions 2026-10-21/22: the titles are exactly **Risultati** and **Testimonial** (not "Voce del cliente"); there is no "I numeri sono Del progetto / Di un deliverable" toggle; both are optional; the old results text is deleted; both live in the 03 Racconto card.
- Risultati: 3 fixed rows, each a label input (wide) and a value input (narrow), side by side as in the mock. Placeholders by row: "Candidature ricevute" / "+180%", "Visualizzazioni video" / "2,4M", "Follower su LinkedIn" / "+35%". Hint: "Fino a 3 numeri. Facoltativo." Label ≤ 80 characters, value ≤ 20 (code points, trimmed). A row is saved only when both parts are filled; a half-filled row shows "Scrivi sia cosa misuri sia il numero." under it and doesn't count. Empty rows are skipped; the saved order is the filled rows top to bottom.
- Testimonial: a quote textarea (placeholder "Una frase del cliente, tra virgolette nel suo stile", ≤ 600) and an author input (placeholder "Nome Cognome, ruolo", ≤ 120). Hint: "Facoltativo." An author without a quote shows "Manca la frase." and is not saved as a testimonial.
- `isClientComplete` needs Contesto and Soluzione only, so the clients table badge, the panel's **Aggiungi**/**Salva** rule and its missing list no longer mention Risultati.
- On a new client, nothing saves before **Aggiungi**; on an existing one each field autosaves (blur and debounce) and failures show on the field, as Contesto does today. Unsaved results or testimonial entries count in the close confirm.
- One forward migration: add `results` as jsonb (an array of at most 3 `{label, value}`, checked in SQL), `testimonial_quote` and `testimonial_author` (text, default `''`, length checks), drop the old text `results` column, and update `save_client_brief_field` (or add a sibling function) so every new field saves through a service-role-only function with the same lock and audit as today. Update `db.types.ts` as CI generates it.
- Copy in it.ts, tokens only, both themes, `FIELD`/`TEXTAREA`/`FieldCard`.

**Never:**
- Don't run `supabase db push` or change any hosted database; the owner pushes to dev after CI and her OK.
- No Settore change (follow-up B), no configurator, intro or outro work, no case-side Risultati change (`context_form.results` is a different table).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Two results | rows 1 and 3 filled, row 2 empty | saved as 2 items in that order; reopening shows them in rows 1–2 | N/A |
| Half row | label only in row 2 | row 2 shows the half-row message; other rows save | not saved, no generic error |
| Too long | value of 21 chars | field message with the limit | not saved |
| Quote only | quote, no author | saved | N/A |
| Author only | author, no quote | "Manca la frase." | not saved |
| Nothing filled | all empty | client can be complete; badge "Profilo completo" if the rest is filled | N/A |
| Old data | client with old results text | after migration the text is gone, Risultati shows 3 empty rows | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261019120000_case_study_client_wizard.sql:40-52` -- `client_brief` columns and `<field>_check`s; `20261019180000_case_study_client_delete.sql:146-210` -- latest `save_client_brief_field` (field list :170, read :175, update :191, insert :195-200; grants :460/:469). New migration after `20261021170000_case_study_delete.sql`.
- `src/modules/case-study/domain/case-study.ts` -- `CLIENT_BRIEF_FIELDS` :58, `CLIENT_BRIEF_MAX` :66, `clientBriefSchema` :180-185, `emptyClientBrief` :187, `isClientComplete` :212-221, `caseClientInfoSchema.brief` :234, `saveClientBriefFieldInputSchema` :268-276.
- `src/modules/case-study/application/save-client-brief-field.ts`, `ports/client-repository.ts:93-99`, `adapters/supabase/client-repository.ts` (`BRIEF_COLUMNS` :30, check map :93-95, `BriefRow` :146, `toClientBrief` :169, `saveBriefField` :375-393, case client info :520), `index.ts:301-307` docs.
- `src/app/(tool)/clients/actions.ts:66-79` -- brief save action; add the results/testimonial save the same way (`manage clients`).
- `src/app/(tool)/clients/_components/client-panel.tsx` -- `BRIEF_FIELDS` :31, `useAutosaveFields` :171-180, submit over-long check :321, `flushAll` :379, `missing` :404-412, `unsaved()` :417-429, 03 card :649-686.
- `src/shared/i18n/it.ts` `clientPanel` (:398-447) -- remove `labels.results`/`placeholders.results`, add the new copy.
- Tests to update: `domain/case-study.test.ts:346-370`, `adapters/supabase/client-repository.test.ts`, `application/use-cases.test.ts`, `client-panel.test.tsx`, `test/db/case-study.db.test.ts` (:947-1009, 1754-1772, 1975-2063), `it.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<timestamp>_case_study_client_results_testimonial.sql` -- columns, checks, drop old `results`, save function(s), grants.
- [x] Domain, port, adapter, use case, `index.ts` -- new brief shape (`results: {label, value}[]`, `testimonialQuote`, `testimonialAuthor`), validation, completeness without results.
- [x] `actions.ts` -- save action(s) for the new fields.
- [x] `client-panel.tsx` (+ a small `client-results-fields.tsx` if it keeps the panel readable) -- Risultati rows and Testimonial in card 03, autosave, half-row and author-only messages, unsaved/close, submit order on **Aggiungi**.
- [x] `it.ts`, `db.types.ts` -- copy; types as CI generates.
- [x] Tests for the matrix rows, the migration (db tests: columns, checks, function, old column gone), completeness and the badge.

**Acceptance Criteria:**
- Given an existing client, when a result row's label and value are filled and the value field loses focus, then it is saved and still shown after reopening the panel.
- Given the clients list, when a client has name, settore, description, logo, 2 images, Contesto and Soluzione, then it shows "Profilo completo" with no Risultati or Testimonial.
- Given light and dark themes at 1280/1440 px, the Risultati rows match the mock's two-column layout inside the 500 px panel.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Clearing one part of a saved result row autosaves the list without it, deleting the stored row | medium | `filledResults` drops half rows from the saved JSON (`client-results-fields.tsx`), autosaved on blur (`client-panel.tsx` changeRow) | patch |
| 2 | Clearing a saved quote with the author kept saves an empty testimonial, deleting the stored author | medium | `testimonialOf` returns `""/""` when the quote is empty; blur saves it | patch |
| 3 | One over-long row blocks saving the valid rows; an over-long author blocks a valid quote | medium | `storyTooLong` marks the whole results/testimonial value too long | patch |
| 4 | Half-row/lone-author message shows again while typing once revealed | low | `revealed` only grows | patch |
| 5 | A failed results save focuses row 1's label regardless of the failing row | low | `focusUnsavedText` | patch |
| 6 | Tests miss: Aggiungi stopping at an over-limit value/half row/lone author before `createClient`; label > 80; author > 120; failed testimonial save; cases 1–3 | medium | grep of `client-panel.test.tsx` (verification-gap, blind) | patch |
| 7 | Misleading adapter comment on key order; `ERROR`/`charCount` redefined in `client-results-fields.tsx` | low | adapter comment; duplicate constants | patch |
| 8 | No migration test seeding old text `results` | medium (unverified) | no harness for testing a migration against older data; drop + re-add with default is low risk | defer |
| 9 | No live counter on the quote; limits not shown up front | low | message shows once over; mock has none | reject |
| 10 | Result/testimonial inputs have no visible labels, placeholders only | low | matches the owner's mock; `aria-label` on each input | reject |
| 11 | Spec sections empty, verification should name CI for db tests | false | process notes; fix would edit the spec | reject |
| 12 | Old migration comments outdated; `7.5rem` arbitrary width | low | applied migrations are not edited; tokens rule covers colour/type, not widths | reject |

## Verification

**Commands:**
- `npx vitest run` -- expected: all pass
- `npx tsc --noEmit` -- expected: no errors
- `npx eslint .` -- expected: no errors

**Manual checks (if no CLI):**
- After the owner pushes the migration to dev: fill two results and a quote on an existing client, reload, check they persist.
