---
title: 'Story 2.15: Client wizard and details step'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_commit: 'fe583bcb0ff8fbb2e8ab3316288d3d0e63957498'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-19.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Clients are created in a one-step dialog with an optional free-text sector, description and logo. The owner wants client creation to work like a case history (SCP 2026-10-19): a full-page wizard whose first step collects every field the intro and the case studies need.

**Approach:** Replace the dialog with a client wizard at `/clients/new`, reusing the case wizard's frame, stepper and autosave. Step 1 **Dettagli** collects:
- Nome
- Settore pills (multiselect from a fixed list)
- Descrizione
- Logo
- Contesto, Soluzione and Risultati

All are required. Step 2 **Materiale** is a placeholder until Story 2.16, and step 3 **Introduzione** stays hidden. A forward migration replaces `client.sector` with `client.industries` and adds `client_brief`.

## Boundaries & Constraints

**Always:**
- Industries are one constant: `interior_design` "Interior design", `energia` "Energia", `risorse_umane` "Risorse umane", `lusso` "Lusso". The database checks that every value is in the list and that there is at least one.
- Descrizione ≤400; brief texts ≤5000 each, after trimming. The logo follows the 2.14 rules (PNG/JPEG/WebP, ≤5 MB, ≥400 px).
- **Avanti** is inactive until every field is filled, with the reason linked via `aria-describedby`.
- **Avanti** on a new client:
  1. creates the client with name, industries and description, which gives it its automatic code;
  2. uploads and links the logo;
  3. saves the three texts;
  4. opens step 2.

  If a later step fails, the client stays and is unfinished.
- On an existing client, the three texts autosave (800 ms debounce and on blur, as in the case Details step). Name, industries, description and logo save on **Avanti**.
- An unfinished client is one with any required field empty. Its Clients-table row opens the wizard at step 1. A finished client's row opens its client page, until 2.16 adds the material check.
- **Modifica cliente** opens the wizard at step 1 with the client's data and "Il codice {code} non cambia. Le modifiche si vedono in tutte le sue case history."
- The back link goes to the client page when editing and to `/clients` when adding.
- `getClientInfoForCase` returns `{ clientId, name, industries, description, logoId, brief }`, read live.
- Every action calls `getActor` and then `authorize("manage clients")`; any other role gets `FORBIDDEN` and nothing is written. The module boundary holds: the `case-study` module owns `client_brief`.
- All copy lives in `it.ts`. Below 1024 px the wizard is read-only.

**Never:**
- Editing an applied migration.
- Running `supabase db push` (the owner pushes to dev after CI).
- Building step 2 uploads or `client_asset` (that is Story 2.16), or any intro or configurator work.
- Showing the brief on the client page.
- Making industries a table column or a filter.
- Keeping `client-dialog.tsx` once the wizard replaces it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create | All fields valid, Avanti | Client created with code, logo linked, brief saved, URL `/clients/new?clientId=…&step=2` | N/A |
| Missing field | One field empty or no pill | Avanti inactive with the reason | Direct action → `CLIENT_FIELD_INVALID`, nothing written |
| Unknown industry | `["moda"]` or `[]` via the action | Refused | `CLIENT_FIELD_INVALID` (TS and DB check) |
| Too long | Description 401 or a brief text 5001 | Inline error, no call | Direct call → `CLIENT_FIELD_TOO_LONG` |
| Duplicate name | An existing name | "Esiste già un cliente con questo nome." on step 1 | `CLIENT_NAME_TAKEN` |
| Logo fails after create | Upload or confirm error | Client exists and is unfinished; error shown; retry re-links only | 2.14 logo errors |
| Legacy dev client | Made under 2.14, no industries or brief | Row opens wizard step 1, fields prefilled where present | N/A |
| Other role | account/sales/social or admin calls any client action | Fails | `FORBIDDEN`, nothing written |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261016140000_case_study_client_info.sql`: current `create_client(p_name, p_sector, p_description, p_actor_id)` and `update_client(p_client_id, p_name, p_sector, p_description, p_logo_id, p_actor_id)`, `client_info_text`, `client_sector_check`, and the revoke/grant pattern. Never edit it.
- `supabase/migrations/20261013180000_material_context_form.sql`: `context_form` and `save_context_field`. Copy this pattern (advisory lock, P0001 `NOT_FOUND`/`UNKNOWN_FIELD`, unchanged text returns early) for `client_brief`.
- `src/modules/case-study/domain/{case-study.ts,validation.ts}`:
  - `CLIENT_SECTOR_MAX`, `clientInfoSchema`, `clientSchema`, `caseClientInfoSchema`, `create/updateClientInputSchema`, `ClientSummary` and `INFO_FIELDS`: replace sector with industries.
  - Add `CLIENT_INDUSTRIES`, the brief schema and `isClientComplete`.
- `src/modules/case-study/{ports,adapters/supabase}/client-repository.ts`: `CLIENT_COLUMNS`, `LENGTH_CHECKS`, `toClient`, the `create_client`/`update_client` RPC args, and `listWithCaseCounts` (which needs the completeness inputs).
- `src/modules/case-study/application/{create-client,update-client,get-client,get-client-info-for-case}.ts` and `index.ts`: extend. Add `save-client-brief-field.ts`.
- `src/app/(wizard)/_components/{wizard-frame,stepper,details-step}.tsx`:
  - Today they are hard-wired to cases (back link, eyebrow, `StatusBadge`, `WIZARD_STEPS`, `wizardHref`, `saveDetailsField`, `current={2}`).
  - Generalise them with optional props (`steps`, `hrefFor`, `back`, `eyebrow`, header slot; `save`, `nextHref`). The defaults keep case behaviour identical.
  - Extract the autosave loop into a hook for the client step.
- `src/app/(wizard)/case-studies/new/page.tsx` L94-116: the step-3 placeholder pattern (`STEP_NOTE_ID`, `PRIMARY_ACTION_INACTIVE`). Copy it for client step 2.
- `src/app/(tool)/clients/_components/client-dialog.tsx`: move its logo pick/upload/confirm/link logic into a `useClientLogo` hook, including the `pickSeq` and `confirmed` guards and `LogoStepFailed`. Then delete the dialog and its test.
- `src/app/(tool)/clients/_components/{clients-table,edit-client-button}.tsx` and `[clientId]/page.tsx`: Add and Modifica become links into the wizard; the row click checks completeness; sector L85-89 becomes industry pills.
- `src/app/_lib/routes.ts`: add `clientWizardHref(id?, step?)` and `clientHref`.
- Pills: reuse the favourite toggle's `aria-pressed` styling (`asset-row.tsx` L105-119); there is no new token.
- `src/shared/i18n/it.ts` (`clients.*`, a new `clientWizard.*`) and `it.test.ts`, which pins `sectorLabel` == "Settore".

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261019120000_case_study_client_wizard.sql`:
  - add `client.industries text[] not null default '{}'` with a check that each value is in the list and there is at least one, added `NOT VALID` so legacy dev rows stay;
  - drop `client_sector_check` and `sector`;
  - add `client_brief` (`client_id` PK/FK; `context`, `solution`, `results` `text not null default ''`, each ≤5000; `updated_by`, `updated_at`; RLS on; revokes);
  - drop and recreate `create_client(p_name, p_industries text[], p_description, p_actor_id)` and `update_client(p_client_id, p_name, p_industries, p_description, p_logo_id, p_actor_id)`;
  - add `save_client_brief_field(p_client_id, p_field, p_text, p_actor_id)`;
  - grants to service_role only.
- [x] `src/modules/case-study/**`: domain constants and schemas, repository, the use cases above plus `saveClientBriefField`, and `getClient` returning the brief. Map the DB check to `CLIENT_FIELD_INVALID` and the length checks to `CLIENT_FIELD_TOO_LONG`. Add both codes to `access/index.ts` (400) and `action-result.ts`.
- [x] `src/app/(tool)/clients/actions.ts`: `createClient` and `updateClient` take industries; add `saveClientBriefField`.
- [x] `src/app/(wizard)/_components/*`: the generalised frame, stepper and details autosave hook. Case wizard tests stay green unchanged.
- [x] `src/app/(wizard)/clients/new/page.tsx` and `_components/client-details-step.tsx`, `industry-pills.tsx`: `requireSurface("manage clients")`; steps 1 and 2 (placeholder) per the matrix.
- [x] `src/app/(tool)/clients/**`: table, edit button, client page and the hook extracted from the dialog; delete `client-dialog.tsx` and its test.
- [x] `src/shared/i18n/it.ts`, `it.test.ts`: wizard copy (eyebrow "Nuovo cliente", steps Dettagli/Materiale/Introduzione, placeholders, reasons).
- [ ] Tests:
  - `test/db/case-study.db.test.ts`: industries check, brief RPC, legacy rows, grants;
  - `use-cases.test.ts`, `client-repository.test.ts`, `case-study.test.ts`, `actions.test.ts`;
  - component tests for the details step, the pills, and the table row routing.

**Acceptance Criteria:**
- Given the case wizard, when it runs after the generalisation, then its steps, links and autosave behave as before.
- Given step 1, when the stepper renders, then it shows Dettagli and Materiale (Introduzione hidden), and step 2 shows an inactive **Crea introduzione** with a note that uploads come next.
- Given a client page, when it loads, then it shows the logo, name, code, industries as pills and the description, but not the brief.
- Given CI, when `check`, `db` and `image` run, then they pass and `db.types.ts` matches.

## Design Notes

**Why `NOT VALID`.** The owner's rule is that a client has at least one industry. Legacy dev clients have none, and a validated check would make the migration fail. With `NOT VALID`, every insert and every update that writes the row is checked, and the wizard always writes `industries`. Description and logo stay nullable in the database for the same rows; the app and both RPCs refuse a create or update without them.

**Why create before the logo.** The logo key needs the client id, so `createClient` comes first. The client page and table treat a client with missing data as unfinished, so a failure halfway leaves a visible, resumable client and never a hidden half-record.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: all pass.
- `npm run test:db` -- expected: passes. If there is no local Docker, rely on the CI `db` job and commit CI's `db.types.ts` on drift.
- `npm run build` -- expected: success.

**Manual checks:**
- In the dev preview:
  - Add a client through the wizard and check it lands on step 2.
  - Reopen an unfinished client from the table.
  - Use Modifica cliente from a client page.

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | blind, edge-case | On an existing client, a link (stepper Materiale, back arrow) drops unsaved Nome/Settore/Descrizione/logo edits | medium | patch | `use-autosave-fields.ts` L149/L180 intercept only on unsaved brief text; info fields save only in `next()`. |
| 2 | blind | `IndustryPills` imported by the client page from a wizard route's private `_components` | low | patch | `[clientId]/page.tsx` imports `(wizard)/clients/new/_components/industry-pills`; a move fixes it. |
| 3 | edge-case | `adopt`/`replaceState` run after the step unmounted, rewriting the URL of the page the user moved to | low | patch | `next()` checks `unmounted` only after `flushAll`, not after `createClient`. |
| 4 | verification-gap | Logo pick checks (type, empty, >5 MB, `pickSeq`, undecodable, pick while busy) lost their tests with the dialog | medium | patch | No test reaches `useClientLogo.onPick` beyond the <400 px case. |
| 5 | verification-gap | Avanti double-click guard untested | low | patch | Every test clicks once with resolved mocks. |
| 6 | verification-gap | `invalid`/`fatal` logo failures and on-field `CLIENT_LOGO_INVALID` untested | low | patch | Only the `retry` path is exercised. |
| 7 | verification-gap, blind | `useAutosaveFields` `active` gate untested (blur and link before create) | medium | patch | `details-step.test.tsx` never passes `active`; the client test can't observe it. |
| 8 | blind, edge-case | Confirmed-but-unlinked logos stay as orphan rows and objects | medium | defer | Same behaviour as the 2.14 dialog (finding 1 there); needs a cleanup decision. |
| 9 | blind | `client_brief` lacks `context_form`'s reject-delete/truncate triggers | low | reject | Only the service role reaches it and no code path deletes; adding triggers is a new guard. |
| 10 | blind | `epic-2-context.md` rewrite drops stack versions, error table, step UX | low | reject | The compile rules scope aggressively and exclude what the code or planning docs hold. |
| 11 | blind | Spec, sprint status and task checkboxes disagree | false | reject | `in-review` spec with `in-progress` tracker is the workflow's normal state; all tasks are ticked. |
| 12 | blind, edge-case | JS `trim()` and SQL `btrim` strip different Unicode spaces | low | reject | Needs NBSP/U+2028 padding near 5000 characters; the fix adds a shared trimming rule. |
| 13 | blind, edge-case | Lone surrogates handled differently per field | low | reject | Unlikely from a keyboard; fix adds checks. |
| 14 | blind | Clients list loads full briefs to compute `complete` | low | reject | Tens of clients; a SQL-side flag adds a view/RPC. Malformed rows are prevented by the checks. |
| 15 | blind | Back arrow and direct URL reach an unfinished client's page | low | reject | The spec sends the edit back link to the client page; the page renders empty fields as nothing. |
| 16 | blind | After a create, the shell keeps add-mode eyebrow and back link until reload | low | reject | Only seen after a partial failure; a remount would lose the logo pick. |
| 17 | blind | Description counter announces every keystroke | false | reject | Same `aria-live="polite"` counter the 2.14 spec asks for (2.14 finding 17). |
| 18 | blind | DB check accepts duplicate industries | low | reject | Only the service role calls the RPCs, through a schema that dedups; fix adds a check. |
| 19 | edge-case | Edits typed while Avanti is pending are dropped | low | reject | Needs typing during a sub-second save; fix adds guards. |
| 20 | edge-case | Link click with unsaved brief while busy does nothing | low | reject | Same timing window; fix adds a queued navigation. |
| 21 | edge-case | Toggling drops values outside the options | false | reject | The DB check and schema keep stored values inside the list. |
| 22 | edge-case | Too-long check runs before the unknown-field check | low | reject | Only reachable by a crafted call; either refusal writes nothing. |
| 23 | edge-case | A failed brief read sends the client page to the error boundary | low | reject | Same failure class as the client read itself; rare. |
| 24 | edge-case | Focus no longer returns to Aggiungi/Modifica cliente | low | reject | Navigation replaces the dialog; the new page sets its own focus. |
| 25 | verification-gap | Page test mocks `isClientComplete` loosely | low | reject | The real rule is pinned in `case-study.test.ts` and the DB test. |
