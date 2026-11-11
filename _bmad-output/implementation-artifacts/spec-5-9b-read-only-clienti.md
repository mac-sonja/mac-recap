---
title: 'Story 5.9b: read-only Clienti and client pack for account/sales/social'
type: 'feature'
created: '2026-11-11'
status: 'in-review'
baseline_commit: 'feda38aadda9726df2187f06803b1e7f6175a4f5'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-9a-client-pack-download.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 5.9a lets owner/designers download a client pack, but account, sales and social users, who send material to clients, can't see Clienti at all: /clients redirects them to Libreria and the pack actions answer 403.

**Approach:** A new policy action, `download client pack`, held by every role. Account/sales/social get a **Clienti** nav item that opens a read-only list of the clients with at least one approved case, each with **Scarica**, and a read-only client page with the client's profile, its approved cases and **Scarica**. Owner/designer and admin screens stay as they are.

## Boundaries & Constraints

**Owner decisions (2026-11-10):** this is part 2 of B5; part 1 (5.9a, merged #160) built the pack download. **2026-11-11:** the 3-file client limit stays for the demo (not touched here).

**Always:**
- **Policy:** `download client pack` is allowed for owner/designer, admin and account/sales/social, approved status only (like `export`). `list clients` and `manage clients` stay owner/designer and admin only.
- **Read-only list** (when the actor can't `list clients` but can `download client pack`):
  - only clients with at least one approved case, counted by approved cases (no draft counts, no "Profilo da completare");
  - no **Aggiungi cliente**, no add panel, search and sort work as today;
  - **Scarica** per row opens the 5.9a pack dialog.
- **Read-only client page:**
  - the client's profile (as owners see it, without edit controls), its approved cases only, and **Scarica**;
  - no intro status or configurator link, no **Modifica layout**, no edit panel, no **Nuova case history**;
  - each case opens the approved case page (as Libreria does);
  - a client with no approved case redirects to /clients.
- **Pack actions:** `requestClientExport` and `getClientExportStatus` authorize `download client pack` (replacing `list clients`) and `export` (approved). The pack's content and hash are unchanged.
- **Nav:** the Clienti item shows for anyone who can `list clients` or `download client pack`.
- **UI rules:** decide with `can()`, never role names in UI code.

**Never:**
- Changing owner/designer or admin screens, the pack content, or the client configurator.
- Writing anything for account/sales/social (no client or case writes).
- Showing non-approved cases, drafts or intro status to read-only users.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Nav | Account user signs in | Sidebar shows Libreria and Clienti | — |
| List | Clients A (2 approved), B (only drafts) | Only A, "2 case", Scarica | — |
| Add | Account user opens `/clients?nuovo=1` | List without the add panel | — |
| Client page | Account user opens A | Profile, approved cases, Scarica; no edit, intro or new-case controls | — |
| No approved | Account user opens B | Redirect to /clients | — |
| Download | Scarica on A | 5.9a pack (same file as owners get) | — |
| Owner | Owner/designer opens Clienti | Unchanged | — |
| Direct write | Account user calls a client write action | Refused | `FORBIDDEN` |

</frozen-after-approval>

## Code Map

- `src/modules/access/domain/policy.ts:11-34,63-77`: add `download client pack` (owners + account_sales_social, approved scope like `export` :77). `policy.test.ts:9-32` EXPECTED row; :77-80 stays true.
- `src/app/(tool)/layout.tsx:47` + `layout.test.tsx:64-68`: show Clienti for `list clients` OR `download client pack`; flip the account-role assertion.
- `src/app/_lib/surface.ts:42-47` `requireSurface`: the client routes use `list clients` today (`clients/page.tsx:28,31`, `clients/[clientId]/page.tsx:48,51`, `clients/page.test.tsx:72`). Let read-only actors in with `download client pack` (approved), keep `authorize` before any module call (`test/authorize-guard.test.ts`).
- `clients/page.tsx`: `listClientSummaries()` (:33) returns all clients with all-status `caseCount`; approved map (:36-45) only for unscoped `list cases`. For read-only: `caseStudy.list({status:"approved"})` (`case-study/index.ts:288`) → client ids and approved counts, filter summaries. Add panel gate (:73) and `clients-table.tsx` `canManage` (:106,137,150-157) already hide add; Scarica shows when `approvedCount > 0` (:265).
- `clients/[clientId]/page.tsx`: actions at :134 (intro), :146 (pack, `export`), :149-171 (layout, edit), :172 (new case), :183 Progetti (`CaseStudiesTable` with `canCreate`/`canEdit`; `listScopeFor` :69-71 already scopes to approved). Hide by `can()`; links via `caseViewHref` (`app/_lib/routes`), the case page allows approved viewers (`case-studies/[caseId]/page.tsx:32`).
- `clients/export-actions.ts:19-46`: swap `list clients` for `download client pack`; fix comments in `rendering/server.ts` (~85) and `request-export.ts:304`.
- `test/permissions.test.ts`: `client-export.*` OWNERS → SHARERS (:134), add `client-export.` to `ownsNoContent` (:225), an account-role pack case near :305-366.
- `src/shared/i18n/it.ts:403-445` (`clients`), :633-658 (pack strings): add a read-only lead if needed (current lead says "Apri un cliente per vedere il suo profilo", fine for both).

## Tasks & Acceptance

**Execution:**
- [x] `policy.ts` (+ `policy.test.ts`) -- new action.
- [x] `layout.tsx`, `surface` use on client routes (+ tests) -- nav and route access.
- [x] `clients/page.tsx`, `clients-table.tsx` (+ tests) -- read-only list of clients with approved cases.
- [x] `clients/[clientId]/page.tsx` (+ tests) -- read-only client page, redirect without approved cases.
- [x] `export-actions.ts`, `test/permissions.test.ts` -- pack actions for every role.
- [x] `sprint-status.yaml` -- 5.9 to `review`.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given owner/designer and admin, when they use Clienti and the client page, then existing tests pass unchanged.

## Implementation Notes

- **Policy.** `download client pack`: owners and account/sales/social, approved only (as `export`). `list clients` / `manage clients` unchanged.
- **Surface.** `requireSurface` also takes a list of uses (`{ action, resource? }[]`) and lets the actor in when any is allowed. `clients/_lib/clients-surface.ts` holds `CLIENTS_SURFACE` (`list clients`, or `download client pack` approved) and `clientsAccess(actor)` (`full` / `read-only` / `null`), used by both client routes and the sidebar (Clienti shows when not `null`). Pages authorize `list clients` (full) or `download client pack` (read-only), and `list cases` approved, before any module call.
- **List.** Read-only lists `caseStudy.list({ status: "approved" })`, keeps only clients with an approved case and counts approved cases; `ClientsTable` gets `showProfileStatus` (default on, off read-only) to hide "Profilo completo/da completare". The add link and `?nuovo=1` panel stay behind `manage clients`. No new i18n string: the current lead and `emptyReadOnly` fit.
- **Client page.** Read-only lists `{ status: "approved", clientId }`, redirects to `/clients` with no approved case, filters rows to approved, hides the intro status; layout, Modifica, edit panel and Nuova case history were already behind `edit` / `manage clients` / `create case`. Scarica now shows on `download client pack` (approved) instead of `export` (same roles for owners).
- **Pack actions.** `requestClientExport` / `getClientExportStatus` authorize `download client pack` + `export` (approved); module comments updated. Pack content and hash untouched.
- **Tests.** `policy.test.ts` (row, approved-only, every role), `surface.test.ts` (list of uses), `layout.test.tsx` (account sees Clienti), page tests (read-only list, `?nuovo=1`, empty; read-only client page, `?modifica=1`, redirect), `test/permissions.test.ts` (`client-export.*` for SHARERS, `ownsNoContent`, pack guardrails for account too, account client writes → `FORBIDDEN`). Owner tests change only in the `requireSurface` argument (now `CLIENTS_SURFACE`).
- **Not run:** `npm run test:db` (no Docker here); no migration or DB change in this story.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass.
- `npm run build` -- expected: pass.
