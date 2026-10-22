---
title: 'Client Settore: one sector, from a shared list anyone can add to'
type: 'feature'
created: '2026-10-22'
status: 'in-review'
baseline_commit: '9c8c078bf2b10562a80b8a2f505dbb18844ed547'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A client can have several sectors, picked only from a fixed list of four. The owner wants exactly one sector per client, and a way to add a sector that isn't in the list.

**Approach:** Sectors move to a shared table, seeded with today's four. In the client panel's 01 Dettagli card, **Settore** becomes single-select pills plus a text field that adds a new sector to the shared list (everyone sees it next time) and selects it. A client stores one sector.

## Boundaries & Constraints

**Always:**
- Owner decisions 2026-10-21/22: single select; a new sector goes to the shared list; existing clients with several sectors keep the first in today's list order (Interior design, Energia, Risorse umane, Lusso); remove the hint "Puoi sceglierne più di uno.".
- Pills: one selected at a time, selecting another switches; the selected look stays (lime tint + check). Accessible as a single-choice group (`radiogroup`/`radio`, arrow keys), keyboard and screen-reader friendly. Pills in shared-list order: the four seeded first, then added ones by creation date.
- Add a sector: a text field under the pills, placeholder "Per esempio: Nautica", and **Aggiungi** (inactive while empty). Label 2–40 characters, trimmed. If a sector with the same name already exists (ignoring case, accents and extra spaces), it is selected instead of adding a duplicate. A new sector is saved to the shared list at once, also while adding a new client (it doesn't need the client), and selected. Errors show under the field.
- Only `manage clients` (owner/designer) can add sectors; reading the list follows `list clients`.
- Settore stays required for a complete client. A client whose old list was empty stays without a sector ("Profilo da completare").
- The client page shows the one sector as before (read-only pill); labels of all sectors, seeded ones included, come from the table.
- One forward migration: sector table (stable key, label, order, who/when added; the four seeded with today's keys and Italian labels), `client.industry` referencing it (backfilled as decided), old `industries` array and its check dropped, `create_client`/`update_client` taking one sector, a service-role-only function to add a sector that returns the existing one on a duplicate name. `db.types.ts` as CI generates it.
- Copy in it.ts, tokens only, both themes.

**Never:**
- Don't run `supabase db push` or change any hosted database; the owner pushes to dev after CI and her OK.
- No renaming or deleting sectors, no sector filter or search in the Clienti list, no change to the case's Servizi pills.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pick one | Energia selected, click Lusso | only Lusso selected | N/A |
| Add new | type "Nautica", Aggiungi | "Nautica" pill appears selected; another panel later lists it | N/A |
| Duplicate | type " energia " | existing Energia selected, no new pill | N/A |
| Too short/long | "N" or 41 chars | message under the field, nothing saved | field error |
| Old multi | client had [lusso, energia] | after migration shows Energia only | N/A |
| Old empty | client had [] | no sector, "Profilo da completare" | N/A |
| Add fails | network/server error | message "Non siamo riusciti ad aggiungerlo. Riprova." | field error, typed text kept |

</frozen-after-approval>

## Code Map

- Migrations: `20261019120000_case_study_client_wizard.sql:23-28` (`industries text[]`, `client_industries_check`, NOT VALID); latest `create_client` `20261019180000_case_study_client_delete.sql:32-87` (insert :71-75), `update_client` :90-135 (:131), grants :458-468. New migration after `20261022120000_case_study_client_results_testimonial.sql`.
- Domain `src/modules/case-study/domain/case-study.ts`: `CLIENT_INDUSTRIES` :26, `ClientIndustry` :27, `isClientIndustry` :29-31, `industriesSchema` :172-175, `clientInfoSchema` :178-182, `clientSchema.industries` :221, `isClientComplete` :238-246, `caseClientInfoSchema.industries` :257, create/update inputs :273, :281-286; `domain/validation.ts:29` `INFO_FIELDS`.
- Application: `create-client.ts:22-23`, `update-client.ts:24,30`, `get-client-info-for-case.ts:9-16`; new list/add sector use cases. `index.ts` exports :83, :105, docs :273-286, :412.
- Adapter `adapters/supabase/client-repository.ts`: `CLIENT_COLUMNS` :29, `CASE_CLIENT_COLUMNS` :40, check map :100, `ClientRow` :167, `toClient` :187, RPC create :337, update :358, case info :572.
- UI: `src/app/(tool)/clients/_components/industry-pills.tsx` (editable :57-66 → single choice; read-only :41-44; `CHOICE_PILL` also used by `business-line-pills.tsx`, keep it), `client-panel.tsx` (`InfoFields.industries` :64, `sameInfo` :73-78, prop :94-95, state :177, `toggleIndustry` :403-408, errors :420, `currentInfo` :437, `missing` :549, `unsaved` :563, JSX :681-700, hint :695). Pages pass `caseStudy.CLIENT_INDUSTRIES` at `clients/page.tsx:67`, `[clientId]/page.tsx:162`; read-only pills `[clientId]/page.tsx:112-113`.
- `src/app/(tool)/clients/actions.ts` -- `createClient` :28, `updateClient` :44 (`manage clients`); add an add-sector action.
- i18n `it.ts`: `clients.industries` :365-371 (labels move to the table), `clientPanel.details.labels.industries` :432, `industriesHint` :473.
- Tests: domain :236-330, :418-424; use-cases; client-repository; actions; client page/panel/pills; `it.test.ts:68-70`; `test/db/case-study.db.test.ts` (:1894-1951 and other industry uses); `test/helpers/db-clients.ts:35-48`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<timestamp>_case_study_client_sector.sql` -- table, seed, column + backfill, drop old array/check, create/update/add functions, grants.
- [x] Domain, port, adapter, use cases (list sectors, add sector), `index.ts` -- one sector key; options loaded from the table.
- [x] `actions.ts` -- add-sector action (`manage clients`).
- [x] Pages -- load the sector list for the panel and the read-only pill.
- [x] `industry-pills.tsx`, `client-panel.tsx` -- single choice group, add field, errors, unsaved/missing.
- [x] `it.ts`, `db.types.ts`, tests for the matrix and the migration (db tests).

**Acceptance Criteria:**
- Given the client panel, when a sector pill is chosen with the keyboard (arrow keys), then only that one is selected and announced as selected.
- Given two browsers, when a sector is added in one panel, then opening a panel in the other lists it.
- Given light and dark themes at 1280/1440 px, the pills and add field fit the 500 px panel.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

Work only in this checkout: `/Users/Sonja/Downloads/mac-recap/.claude/worktrees/client-sector` (branch `feat/client-sector-single`). `/Users/Sonja/Downloads/mac-recap` itself runs the owner's app on `main`; don't edit it.

**Commands:**
- `npx vitest run` -- expected: all pass (db suite runs in CI)
- `npx tsc --noEmit` -- expected: no errors
- `npx eslint .` -- expected: no errors

**Manual checks (if no CLI):**
- After the owner pushes to dev: pick a sector, add "Nautica", reopen another client's panel and see it; a client that had two sectors shows the first.
