---
title: 'Story 2.12: Clients as records, with readable case history codes'
type: 'feature'
created: '2026-10-15'
status: 'done'
baseline_commit: 'b7d7444a834c509eb756e8425108a385a9166597'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-MAC Recap-2026-10-08/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-15.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Clients are free text (spelled several ways) and people see a 36-character uuid as a case's ID (SCP 2026-10-15, C9/C10/C12).

**Approach:** One forward-only migration adds `client` and `case_number_counter`, gives every case `client_id`, `number` and an immutable `code` (`LUM-2026-01`, AD-21), backfills existing rows and drops `case_study.client`. Step 0 picks a client from a select; the wizard top bar and the Case history table show the code. Delivers the amended ACs of Stories 2.5 and 2.6.

## Boundaries & Constraints

**Always:** AD-21 rules 1–8 exactly, defined once in SQL (`client_code_letters`, `create_client`, `rename_client`, `create_case_study(p_name, p_client_id, p_year, p_locale, p_actor_id)`); TS never computes codes. uuid stays the key in URLs, FKs, `wizardHref`. New tables: RLS on, revoked from anon/authenticated; functions `set search_path = ''`, service_role execute only, `unaccent` in schema `extensions` (call `extensions.unaccent`). Errors `CLIENT_NOT_FOUND` 404, `CLIENT_NAME_TAKEN` 409, `CLIENT_CODE_EXHAUSTED` 409 in `STATUS_BY_CODE`. Policy gains `list clients` (owner_designer only); step 0 authorizes it. All copy in `it.ts`. Old `case_created` events stay untouched.

**Never:** Clients page, sidebar item, `manage clients` action, TS `createClient`/`renameClient`/`getClient`, `list(scope)` with `clientId`, preselect via URL, a link to `/clients` (all Story 2.13). No free-text or "add client" in step 0. No edit of applied migrations. No code on share pages/exports. No change to `project_order_ref`, status writes or URLs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Code letters | `create_client` in order: "Lumen Srl", "Lumina S.p.A.", "Lume", "Città di Torino", "A2A", "3M" | `LUM`, `LUMI`, `LUME`, `CIT`, `AAX`, `MXX`; "S.p.A." alone keeps `SPA` (rule 1 fallback) | — |
| Name taken | "lumen  srl" after "Lumen Srl" (trim, collapse, lower, unaccent) | nothing written | `CLIENT_NAME_TAKEN` |
| Candidates exhausted | first 3, first 4, and first 3 + `A`–`Z` all taken | nothing written | `CLIENT_CODE_EXHAUSTED` |
| Concurrent clients | two `create_client` with same letters at once | different codes (advisory xact lock; unique index backstop) | — |
| Create case | known client, year 2026 | next number for (client, year), `LUM-2026-01`; event data adds `clientId`, `clientCode`, `code` | — |
| Year rollover / ≥100 | `LUM-2025-01..02` exist → first 2026 case; 100th case | `LUM-2026-01`; `LUM-2026-100` | — |
| Concurrent cases | 2 parallel creates, same client+year | consecutive numbers, no duplicate | rolled-back create leaves no gap |
| Unknown client | random `clientId` | nothing written | `CLIENT_NOT_FOUND` |
| Immutability | UPDATE `case_study.code/number`, `client.code`; DELETE/TRUNCATE `client` | rejected by trigger | P0001 |
| Backfill | free-text cases incl. soft-deleted; "Lumen Srl" + "lumen  srl" | one client per name key, name = earliest case's trimmed spelling, codes by earliest `created_at`; cases numbered by `created_at`, `id`; counter = max per pair; `updated_at` unchanged | any case left without `client_id`/`code` → migration raises, nothing applied |
| Dev data | "Test Lumen" / "Lumen Srl" / 2026 | client `LUM`, case `LUM-2026-01` | — |
| Picker | clients exist / none | select sorted by name, option "{name} ({code})", empty first option; none → "Nessun cliente. Aggiungilo nella pagina Clienti.", Avanti inactive | no client picked → "Scegli il cliente." |
| Table | rows with codes | ID column = code (mono); search over name, client name, client code, case code; ID sort natural (`LUM-2026-9` < `LUM-2026-10`); Client = current name | — |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261009140000_case_study.sql` -- old `create_case_study(text,text,integer,text,uuid)`, trigger/RLS/revoke patterns to copy; do not edit.
- `supabase/migrations/20261012120000_case_study_transition.sql` -- `transition_case_study` returns `public.case_study` (no client join); P0001-message → error mapping pattern.
- `src/modules/case-study/domain/case-study.ts` -- `caseStudySchema` (`client` becomes `{id,name,code}`, add `code`, `number`), `createCaseStudyInputSchema` (`clientId: z.uuid()`), add `clientSchema`, client name 1–120 schema.
- `src/modules/case-study/adapters/supabase/case-study-repository.ts` -- `CASE_STUDY_COLUMNS`, `toCaseStudy`, `create`, `transition`; reads embed `client(id,name,code)`; RPC rows lack the join, so re-read by id after create/transition.
- `src/modules/case-study/{ports,application,index.ts}` -- add `listClients()` (by name) with a client port/adapter; export `Client` type.
- `src/modules/access/domain/policy.ts` + `src/modules/access/index.ts` (`STATUS_BY_CODE`) -- new action and codes.
- `src/app/(wizard)/case-studies/new/page.tsx` -- loads clients for `NameStep`; `wizardCase` adds `code`.
- `src/app/(wizard)/_components/name-step.tsx` -- client `<input>` → native `<select>`; sends `clientId`.
- `src/app/(wizard)/_components/wizard-frame.tsx` -- `WizardCase` gets `code`, shown instead of `id`.
- `src/app/(tool)/case-studies/page.tsx`, `_components/filter-sort.ts`, `_components/case-studies-table.tsx` -- `CaseStudyRow` gets `code`, `clientName`, `clientCode`; reuse `collator` (numeric) for `id` sort on code; keep `row.id` for keys/hrefs.
- `src/app/(tool)/case-studies/actions.ts` -- `createCaseStudy` doc: input `{ name, clientId, year, locale? }`.
- `src/shared/i18n/it.ts` -- search label "Cerca nome, cliente o codice", `wizard.errors.client`, `wizard.noClients`, option template.
- `src/shared/db.types.ts` -- hand-edit; replace with CI `db-types` artifact if drift fails.
- `test/db/case-study.db.test.ts`, `test/db/material.db.test.ts` -- create cases with a client; `test/case-status-writes.test.ts` must stay green.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261015120000_case_study_clients_and_codes.sql` -- extension, tables, columns, functions (drop old `create_case_study` signature), backfill (disable `case_study_touch_updated_at` around it), completeness check, then NOT NULL/unique keys, drop `client`, then immutability triggers -- AD-21 single definition.
- [x] `src/shared/db.types.ts` -- new tables/columns/functions.
- [x] case-study domain, port, adapter, use case, `index.ts` -- client shape, `clientId` input, `listClients`, error mapping from P0001 messages.
- [x] `src/modules/access/domain/policy.ts`, `src/modules/access/index.ts` -- `list clients`, three error codes; tests.
- [x] wizard `page.tsx`, `name-step.tsx`, `wizard-frame.tsx` -- picker, empty state, code in top bar.
- [x] case-studies `page.tsx`, `filter-sort.ts`, `case-studies-table.tsx`, `it.ts` -- code column, search, natural sort.
- [x] unit tests next to each changed file -- string `client` → record; matrix rows for picker, table, use case.
- [x] `test/db/case-study.db.test.ts` (+ material) -- matrix rows: code letters, name taken, exhausted, concurrency (two pg connections), immutability, `CLIENT_NOT_FOUND`, backfill.

**Acceptance Criteria:**
- Given the migration on a DB with free-text cases, when it runs, then every case (soft-deleted included) has `client_id`, `number`, `code`, `case_study.client` is gone, and `client`/`case_number_counter` deny anon and authenticated.
- Given step 0 with clients, when I enter a name, pick a client and press Avanti, then the case is created and the top bar shows its code in mono, not the uuid; while name is empty or no client is picked, Avanti does not submit and names the missing field.
- Given CI, when `check`, `db` and `image` run, then all pass and `db.types.ts` matches the generated types.

## Implementation Notes

- Extra SQL helpers beyond the four named functions, still the single definition: `client_name_key` (rule 2, also used by the `client_set_name_key` trigger so `name_key` always follows `name`) and `case_study_code` (rule 6, used by the backfill and `create_case_study`).
- Rule 1 interpretation: words are runs of A–Z/0–9 after dot removal; a legal-suffix word is dropped wherever it appears, not only at the end.
- `unaccent` is called in its two-argument form (`extensions.unaccent('extensions.unaccent'::regdictionary, …)`) so it never depends on `search_path`.
- The counter seed runs after the completeness check, so a case left without `client_id` reaches the check instead of failing earlier on the counter's NOT NULL.
- `create_client` / `rename_client` store the name with whitespace collapsed and trimmed, matching what `name_key` normalises.
- `case_created` data keeps `client` (now the client's name) and adds `clientId`, `clientCode`, `code`.
- Shared DB-test helper `test/helpers/db-clients.ts` (random letter prefix per client, digit tags keep name keys unique).
- Migration SQL was exercised locally on PGlite 0.5 (Postgres 17 + unaccent): code-letter matrix, name taken, exhausted, numbering, rollover, ≥100, immutability, backfill and the aborting completeness check. Concurrency and PostgREST paths run only in CI.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | verification-gap, blind, edge-case | Re-read failure after a committed create/transition is untested | low | patch | Only successful re-reads are stubbed in `case-study-repository.test.ts`. |
| 2 | blind, edge-case | Re-read failure after a committed create shows "riprova"; a retry makes a second case | low | reject | Needs a read error right after a successful write on the same service; fixing it means a new result shape or a joined RPC return. Kept as is, now pinned by #1's tests. |
| 3 | blind | Moving a case to another client/year collides with `(client_id, year, number)` and the target counter | maybe-false | defer | No path changes client or year today (owner answer 4: not in this change). Real once an edit path exists. |
| 4 | blind | `case_number_counter` rows can be deleted or lowered | low | reject | Service role only, no app path; same trust as every other table. |
| 5 | blind, edge-case | `unaccent` installed in another schema breaks the migration | maybe-false | reject | Supabase installs extensions in `extensions`; the migration is one transaction, so it would abort cleanly. |
| 6 | blind | `CLIENT_NOT_FOUND` shows the generic error | low | patch | Maps to `CASE_STUDY_WRITE_FAILED` copy in `name-step.tsx`; a stale picker retries into the same failure. |
| 7 | blind | Picker's first option has no text | low | patch | `<option value="" />` renders blank. |
| 8 | blind | Column says "ID" while search says "codice" | false | reject | Matches amended UX-DR4: the ID column shows the code; the search placeholder names the code. |
| 9 | blind | Test fixtures' codes don't match client/year; `clientCode` search redundant | low | reject | Test hygiene only; the spec lists client code as a search field. |
| 10 | blind | Concurrency DB tests can pass without overlap (200 ms sleep) | medium | patch | Nothing proves connection b was waiting before a commits. |
| 11 | blind, edge-case | Stored client names keep inner/odd whitespace | low | patch | `btrim(p_name)` only; `name_key` collapses whitespace. |
| 12 | blind | Blank name gives a raw constraint error | low | reject | TS validates names (2.13 callers); the DB check is the backstop. |
| 13 | blind | Clients sorted twice | false | reject | No named harm; the TS collator gives Italian order, the DB order is the tie-break. |
| 14 | blind | Tracking status mismatch; context file not in the diff | false | reject | Workflow states (spec in review, story in progress); the context file is compiled planning, excluded on purpose. |
| 15 | edge-case | Picker capped at PostgREST `max_rows` (1000) | low | reject | Far beyond the expected client count; CI's database is fresh each run. |
| 16 | edge-case | Backfill aborts when > 28 legacy names share 3 letters | maybe-false | reject | Dev has a handful of cases; the abort is clean (one transaction) and would show before prod. |
| 17 | edge-case | Avanti with no clients gives no feedback | low | patch | Ensure the inactive Avanti is described by the empty-clients note. |

## Design Notes

- Backfill test: CI applies migrations to an empty DB, so the DB test creates a scratch database (`create database`), creates schema `extensions`, applies `20261009120000_access_profile.sql`, `20261009140000_case_study.sql`, `20261012120000_case_study_transition.sql`, inserts free-text cases (incl. a soft-deleted one and a name-key duplicate), applies the 2.12 file, asserts, drops the database. A second scratch run proves the completeness check aborts.
- Clients are never deleted and DB tests share one database: use distinct, random letter prefixes per test client (one prefix allows only 28 codes).
- `client.name` DB check is non-blank only; 1–120 is TS validation (2.13), so a long legacy name can't abort the backfill.
- Until 2.13 merges, new clients exist only through the backfill (and `create_client` in tests); an environment with no cases shows the empty picker. Expected.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- all pass.
- CI `db` job -- DB tests pass; drift check clean (else commit the `db-types` artifact: `gh run download <run> -n db-types`).

**Manual checks (if no CLI):**
- Apply to **mac-recap-dev** only (never `mac-recap`, prod): `npx supabase db push -p "$SUPABASE_DEV_DB_PASSWORD"` (from gitignored `.env.supabase-dev`). Then in the Browser pane: Case history shows `LUM-2026-01` for "Test Lumen"; search "lum" and "2026-01" find it; step 0 lists "Lumen Srl (LUM)"; a new case gets `LUM-2026-02` in the top bar.
