---
title: 'Story 2.13: Clients page'
type: 'feature'
created: '2026-10-15'
status: 'done'
baseline_commit: 'ffe93d114ef9bb870ba5790fdefb9990470e73ae'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/EXPERIENCE.md'
---

> **Amended 2026-10-16** by the [Sprint Change Proposal](../planning-artifacts/sprint-change-proposal-2026-10-16.md): the dialogs gain sector, description and logo, see Story 2.14 (Client info).

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Since 2.12, clients are records, but nobody can add or rename one in the app, and no view shows one client's case histories (SCP 2026-10-15, C11).

**Approach:** Owner/designers get a **Clienti** sidebar item and a `/clients` table with add and rename dialogs. `/clients/{clientId}` shows the client and the Case history table filtered to that client. **Nuova case history** opens step 0 with `?clientId=` preselected. Code and name rules stay in the existing SQL `create_client` / `rename_client`.

## Boundaries & Constraints

**Always:** Add the AD-11 action `manage clients`, owner_designer only. Pages use `requireSurface("list clients")`. Server actions run `getActor` → `authorize(…, "manage clients")` → use case, so `test/authorize-guard.test.ts` stays green. The TS domain only validates names (`clientNameSchema`, 1–120 after trimming). Map SQL P0001 messages to `CLIENT_NAME_TAKEN` / `CLIENT_CODE_EXHAUSTED` / `CLIENT_NOT_FOUND`. The uuid stays in URLs and keys, and the code is display only. All copy goes in `it.ts`. Dialogs use `src/app/_components/dialog.tsx`, one level deep. Below 1024 px, add and rename are hidden (read-only), but load, search and sort still work.

**Never:** No client delete anywhere (UI, action, use case, port). No code field or code edit. No merge of clients. No database migration, and no edit to `db.types.ts` (the RPC types exist). No change to AD-21 SQL. No rename events in `case_event`. No refactor of `CaseStudiesTable` beyond its empty-state props.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Add | "Lumen Srl" on an empty DB | row `LUM` · Lumen Srl · 0; dialog closes; focus returns to **Aggiungi cliente** | — |
| Add, name taken | "lumen  srl", "LUMEN SRL", "Lùmen Srl" after Lumen Srl exists | nothing written; dialog stays open with the typed name | 409 `CLIENT_NAME_TAKEN` → "Esiste già un cliente con questo nome." under the field (`aria-invalid`, `aria-describedby`) |
| Add, invalid | "   " or 121 characters after trimming | no server call | inline error under the field; focus stays in the field |
| Code exhausted | every candidate taken | nothing written; dialog stays open | 409 `CLIENT_CODE_EXHAUSTED` → its own inline message |
| Rename | Lumen Srl → "Lumen S.r.l." | name changes in the list, the client page, Case history and the step 0 picker; `LUM` and every case code stay the same; the dialog shows "Il codice LUM non cambia." | — |
| Rename to same / own variant | "Lumen Srl" or "lumen srl" on itself | saved as typed, code unchanged | — |
| Rename, taken | another client's name key | nothing written, dialog stays open | `CLIENT_NAME_TAKEN` copy, as on add |
| Rename, unknown id | forged `clientId` | nothing written | 404 `CLIENT_NOT_FOUND` → generic dialog error |
| Forbidden | account_sales_social / admin: action call, or `/clients` / `/clients/{id}` URL | action → 403 `FORBIDDEN`, nothing written; URL → redirect to the role's landing | — |
| Client page, unknown | malformed or unknown `{clientId}` | redirect to `/clients` | — |
| Client, no cases | client with 0 non-deleted cases (soft-deleted only counts too) | count 0; page shows "Nessuna case history per questo cliente." + **Nuova case history** | — |
| Preselect | `/case-studies/new?clientId={known}` | that client is selected in the picker | — |
| Preselect, bad | unknown, malformed or repeated `clientId` | picker loads with nothing selected, and no error | — |
| Empty / no results | no clients; search with no match | "Nessun cliente. Aggiungi il primo." + **Aggiungi cliente**; no-results line in a live `role="status"` region + clear search | — |
| Picker empty | step 0 with no clients | "pagina Clienti" in `wizard.noClients` is a link to `/clients` | — |

</frozen-after-approval>

## Code Map

- `src/modules/access/domain/policy.ts` (+ `policy.test.ts`) -- add `"manage clients"` after `"list clients"` in `ACTIONS` and `MATRIX`, owner_designer only.
- `src/modules/case-study/ports/client-repository.ts`, `adapters/supabase/client-repository.ts` -- currently only `list()`. Add `listWithCaseCounts()` (non-deleted cases only, e.g. embedded `case_study(count)` filtered on `case_study.deleted_at` is null), `findById(id)`, `create(name, actorId)` → rpc `create_client`, and `rename(id, name, actorId)` → rpc `rename_client`. Copy the P0001-message mapping from `case-study-repository.ts` (`refusalFor`, `CREATE_REFUSALS`).
- `src/modules/case-study/application/` -- new `get-client.ts`, `create-client.ts`, `rename-client.ts` and `list-client-summaries.ts`, in the style of `list-clients.ts` (same `it` collator) and `parseInput`. Keep `listClients` for the picker.
- `src/modules/case-study/domain/case-study.ts` -- `clientNameSchema` exists. Add the input schemas `{ name }` / `{ clientId: z.uuid(), name }` and `ClientSummary = Client & { caseCount }`. Extend `listScopeSchema` with optional `clientId: z.uuid()`.
- `src/modules/case-study/adapters/supabase/case-study-repository.ts` `list(scope)` -- add `.eq("client_id", …)` when the scope has `clientId`.
- `src/modules/case-study/index.ts` -- export `getClient`, `createClient(actor, input)`, `renameClient(actor, input)`, `listClientSummaries` and the types.
- `src/app/(tool)/case-studies/actions.ts` -- `ActionResult` and the private `failure()`: move them to `src/app/_lib/action-result.ts` (a "use server" file can export only async functions) and import them from both action files.
- `src/app/(tool)/layout.tsx`, `_components/sidebar.tsx` -- `showClients={can(actor, "list clients")}`. NavLink `/clients` after Case history (Templates has no item yet), active on `/clients` and `/clients/*`.
- `src/app/(tool)/case-studies/_components/case-studies-table.tsx` -- add the optional props `emptyMessage` and `newHref` (defaults unchanged). Reuse `normalizeForSearch` and `SEARCH_DEBOUNCE_MS` in the clients table. `loading.tsx` is the skeleton pattern.
- `src/app/(wizard)/case-studies/new/page.tsx`, `_components/name-step.tsx` -- read `clientId` from `searchParams` only on step 0. Pass it as `initialClientId` only when it is in `clients`.
- `src/shared/i18n/it.ts` -- add a `clients.*` block. Reuse `shell.nav.newCaseStudy` ("Nuova case history").

## Tasks & Acceptance

**Execution:**
- [x] `src/modules/access/domain/policy.ts` + test -- `manage clients` -- AD-11.
- [x] `src/modules/case-study/{domain,ports,adapters/supabase,application,index.ts}` + colocated tests -- client port methods, the four use cases, `list` by `clientId` -- backend for the pages.
- [x] `src/app/_lib/action-result.ts`; `src/app/(tool)/case-studies/actions.ts` -- extract `ActionResult` / `failure` -- shared by both action files.
- [x] `src/app/(tool)/clients/actions.ts` + test -- `createClient`, `renameClient` only -- authorize `manage clients`; no delete export.
- [x] `src/shared/i18n/it.ts`; `src/app/(tool)/layout.tsx`, `_components/sidebar.tsx` + tests -- **Clienti** item.
- [x] `src/app/(tool)/clients/{page.tsx,loading.tsx,_components/clients-table.tsx,_components/client-name-dialog.tsx}` + tests -- the list (Codice mono, Nome, Case history; Name A–Z; header sort; search) and one dialog for add and rename. After success, `router.refresh()`.
- [x] `src/app/(tool)/clients/[clientId]/page.tsx` + test -- name, code, **Modifica nome**, **Nuova case history** (`/case-studies/new?clientId=…`), and `CaseStudiesTable` on `list({ ...scope, clientId })` -- the client's case histories.
- [x] `src/app/(wizard)/case-studies/new/page.tsx`, `_components/name-step.tsx` + tests -- preselect, and the `/clients` link in the empty-picker note.
- [x] `test/db/case-study.db.test.ts` -- the case count excludes soft-deleted cases.

**Acceptance Criteria:**
- Given an owner/designer, when the sidebar renders, then **Clienti** sits right after Case history, and other roles don't render it.
- Given the Clients page, when it loads, then it is sorted by name A–Z, header clicks sort Code naturally, Name and count, and search matches name and code ignoring case and accents after ~250 ms.
- Given a viewport under 1024 px, when Clients or a client page renders, then **Aggiungi cliente** and **Modifica nome** are not shown, and search and sort still work.
- Given the policy tests, when they run, then `list clients` and `manage clients` allow owner_designer only.

## Implementation Notes

- `src/app/_components/dialog.tsx` (shared): the native `close` handler now ignores a `close` event while the dialog is open, so a late event queued by React StrictMode's first effect cleanup no longer calls `onClose` right after opening. Affects every dialog; regression test in `dialog.test.tsx`.
- `src/modules/case-study/adapters/supabase/refusal.ts`: the P0001 refusal mapping (`refusalOf`, `Refusals`) was extracted here and is used by both `case-study-repository.ts` and `client-repository.ts`, instead of being copied.
- `src/app/_lib/routes.ts`: new `newCaseForClientHref(clientId)` builds `/case-studies/new?clientId=…` for the client page.
- `src/shared/i18n/it.ts`: `wizard.noClients` is now a `{link}` template ("Nessun cliente. Aggiungilo nella {link}.") with `wizard.noClientsLink` ("pagina Clienti") rendered as the link to `/clients`.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | edge-case | Cancel/Esc during a pending save closes the dialog though the save still lands | low | patch | `onClose` is wired to Annulla and the dialog's cancel regardless of `inFlight`. |
| 2 | verification-gap | Add dialog's single-flight guard untested | low | patch | Every dialog test awaits a resolved mock before the next click. |
| 3 | blind, edge-case | Stale refocus flag can steal focus later | low | patch | `refocusAdd` clears only when `rows` changes. |
| 4 | blind, edge-case | Empty state invites adding when the add button is hidden or absent | low | patch | Button is `hidden lg:inline-flex` and omitted without `manage clients`; the line is unconditional. |
| 5 | blind | No `/` shortcut on the Clients search | low | patch | `CaseStudiesTable` has it; spec says the clients table reuses that search behaviour. |
| 6 | blind | Forbidden-role redirect untested on both pages | low | patch | Tests only cover `requireSurface` returning null. |
| 7 | blind, verification-gap | "unknown"/"malformed" test ignores its parameter | low | patch | Both rows call `renderPage("LUM")`. |
| 8 | blind | Small test gaps: client page loading, create → 409, rename to own name | low | patch | No such tests in the diff. |
| 9 | blind | Changes beyond the Code Map not recorded (Dialog fix, refusal.ts, routes helper, noClients template) | low | patch | Implementation Notes empty; the Dialog change affects every dialog. |
| 10 | blind, edge-case | Server "too long" refusal shows the "required" message | low | reject | Input has `maxLength`; only reachable if limits drift; fix adds a branch. |
| 11 | blind | Client list sorted in three places | false | reject | No named harm; the table's sort is what people see. |
| 12 | blind | `clientHref` lives in the table component | false | reject | Cosmetic; one caller family. |
| 13 | blind | Spec in review, tracker in progress | false | reject | Normal workflow states. |
| 14 | blind | Unchanged rename still calls the server | false | reject | The spec allows the save; harmless. |

## Design Notes

**Modifica nome** lives on the client page (UX-DR35), and a row click on the list opens that page. The SCP's schedule fallback (drop the client page) would move **Modifica nome** to a row action. Use it only if the owner calls it.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- all pass.
- CI `db` job -- green; drift check clean (no schema change expected).

**Manual checks:**
- On mac-recap-dev in the Browser pane, check each of these:
  - add "Acme" → `ACM`; add "acme" → the duplicate error, and the dialog stays open.
  - rename Lumen Srl → "Lumen S.r.l." → Case history shows the new name, and `LUM-2026-01` is unchanged.
  - the client page → **Nuova case history** → step 0 with Lumen preselected.
