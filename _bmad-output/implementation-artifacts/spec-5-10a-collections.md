---
title: 'Story 5.10a: collections (create, list, arrange)'
type: 'feature'
created: '2026-11-10'
status: 'in-progress'
baseline_commit: 'f04c6fb51ef878f2d3ab6689d76b476f129ce36b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-12a-client-file-configurator.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-9a-client-pack-download.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no way to gather approved case histories from different clients into one named set for a pitch, arrange them, and come back to it later.

**Approach:** Add a new `collection` module. In the library, users select cards and press **Crea raccolta**, giving a name and tags. A sidebar **Raccolte** page lists, filters, opens, renames and deletes collections. A collection opens in the configurator's file view (4.12a), with every page read-only for now. Its **Pagine** panel arranges the cases (grouped by client) and adds or removes them.

## Boundaries & Constraints

**Owner decisions (2026-11-10):**
- **Scope:** this is part 1. Part 2 (5.10b, deferred) adds **Esporta**.
- **Client intro:** a client's approved intro and closing wrap that client's cases only when 2 or more of them are in the collection. A client with one case shows that case with its own intro and closing.
- **Who:** every role can create, see and change every collection, including admin. This replaces the story's "admin → FORBIDDEN". New policy action `manage collections`, allowed for all roles.
- **Defaults approved with the spec:** creation keeps selection order with each client's cases gathered at its first selected case; an added case joins the end of its client's group or a new group at the end; the spec is kept whole (~2,400 tokens).

**Always:**
- **Data:**
  - A forward migration adds `collection` (id, name 1–120 characters, `version` for compare-and-set, `created_by`, timestamps, soft-delete `deleted_at`), `collection_item` (collection, case, position) and `collection_tag` (collection, kind `business_line` | `industry`, key).
  - It also adds an append-only `collection_event` log.
  - Every write goes through a `security definer` function executable only by `service_role`. RLS denies anon and authenticated, the same pattern as `client_case_order`.
  - Every change to items, order, name or tags is a compare-and-set on `collection.version`, and a stale write gets `STALE_COLLECTION`.
  - Items must be approved, non-deleted cases. A collection holds 1–200 of them, and the same case is never in it twice.
- **Tags:** at least one business line and at least one industry, taken from the same lists as the case wizard (`BUSINESS_LINES`) and the client panel (`client_sector`).
  - Every role needs to read the industry list here, so add a read for it that `manage collections` allows.
  - The industry picker is multi-select, styled like `BusinessLinePills`.
- **Creating from the library:**
  - Cards get a selection mode (a checkbox, outside the card's link).
  - **Crea raccolta** opens a dialog for the name and tags. It saves the selected cases in the order they were selected, grouped by client (each client's group sits where its first selected case was), then opens the collection.
- **Raccolte list** (sidebar item for every role, `/collections`):
  - Each row shows the name, tags, number of cases, last update and who created it.
  - The list can be filtered by business line and by industry.
  - From the list you can open a collection, rename it (1–120 characters), or delete it (asks to confirm; soft delete).
- **The collection page:**
  - It is the configurator file view (4.12a) with every part read-only. B7 (5.11) makes texts editable.
  - Per format, the canvas shows the parts through `composeParts`, default mode. For each client group: the intro and its cases and the closing when 2+ cases and an approved intro; otherwise the case alone with its own pages.
  - Approved revisions only (`getLiveRevision`).
  - The title is the collection's name. The top bar has editable tags.
- **Pagine panel:**
  - One project row per case, inside its client's group.
  - A locked row for a client's intro and a locked row for its closing whenever they're shown.
  - Groups move as a whole. Cases move only within their group. Moving works by drag or by a row menu with "Sposta su" / "Sposta giù".
  - Each move is saved at once with compare-and-set. On failure the previous order comes back with "Ordine non salvato. Riprova."
  - A row's menu has **Rimuovi dalla raccolta**, which asks to confirm. Removing the last case is refused with "Una raccolta ha almeno una case."
- **Aggiungi casi** dialog:
  - It lists approved cases not already in the collection.
  - Cases whose business line or client industry matches a tag of the collection are listed first.
  - Search follows the library's rules (`matchesCaseSearch`).
  - Pick several and press **Aggiungi**: each joins its client's group, at the end of the group, or as a new group at the end.
- **Changing the client count:** when a client goes from 1 case to 2 or more in the collection, its intro and closing appear (if its intro is approved). When it goes back to 1, they disappear.
- **Cases no longer approved:**
  - A case that no longer has an approved revision (deleted or unapproved) stays in the list, greyed, as "Non disponibile", with no pages.
  - It can still be removed.
  - A deleted case leaves every collection: a soft-deleted case is dropped from reads.
- **Always current:** the collection always shows each case's current approved version and the client's current info. It never copies them.
- **Module rules:**
  - The new module must be registered in `eslint.config.mjs` `MODULES` and `test/scaffold.test.ts` `MODULES`.
  - It reaches other modules only through their `index.ts`.

**Never:**
- Exporting (5.10b).
- Editing texts or pages inside a collection (5.11, B7).
- Copying case pages into the collection.
- Collections of unapproved cases.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Create | Select A1 (client A), B1 (B), A2 (A); name "Pitch moda"; tags | Saved as group A [A1, A2], group B [B1]; collection opens | name empty/>120 or no tag → field error |
| Intro rule | Group A has 2 cases, A's intro approved | A intro, A1, A2 (own intros dropped), A closing; B1 whole | — |
| Single | Group B has 1 case | B1 with its own intro and closing | — |
| Move group | Drag group B above A | B, then A; saved | stale → order restored, message |
| Move case | "Sposta giù" on A1 | A2, A1 | — |
| Cross-group | Drag A1 into group B | Refused (stays in A) | — |
| Add | Add B2 | Joins group B; B intro appears if approved | — |
| Remove | Remove A2, confirm | A1 alone, A intro gone | last case → refused |
| Unavailable | A1 unapproved later | Row "Non disponibile", no pages | — |
| List | Raccolte, filter industry "Moda" | Only collections tagged Moda | — |
| Rename/delete | Rename; delete + confirm | Updated; gone from list | — |
| Any role | Admin or account user | Allowed | — |

</frozen-after-approval>

## Code Map

- **New module** `src/modules/collection/` (`domain/`, `ports/`, `adapters/supabase/`, `application/`, `index.ts`): mirror `src/modules/jobs/` and 4.12b's `client-case-order` files. Register it in `eslint.config.mjs:11` `MODULES` and `test/scaffold.test.ts:7`.
- **Migrations** to follow: `20261110140000_case_study_client_case_order.sql` (RLS, revokes, `security definer` writer), `20261106120000_case_study_client_intro.sql` L36–62 (append-only event table) and `20261029120000_case_study_save_revision_doc.sql` L73 (compare-and-set). Add a new migration `20261110160000_collection.sql`.
- **Policy:** `src/modules/access/domain/policy.ts` (`ACTIONS` L11, `MATRIX` L58, `owners()` L56). Add `manage collections` for all roles, and update `policy.test.ts`'s `EXPECTED`.
- **Library:**
  - `src/app/(tool)/library/page.tsx` L96, `_components/library-grid.tsx` L64, `library-card.tsx` L34 (the whole card is a `<Link>`): add selection and **Crea raccolta**.
  - Reuse `_lib/library-data.ts` (`filterCases` L78, `facetOptions` L99) and `matchesCaseSearch` (`case-studies/_components/filter-sort.ts:81`).
- **Tags:** `BUSINESS_LINES` (`case-study/domain/case-study.ts:53`), `listClientSectors` (case-study index L385, `list clients` only today: add a read allowed to `manage collections`), `BusinessLinePills` (`(wizard)/_components/business-line-pills.tsx:30`) and `CHOICE_PILL` (`clients/_components/industry-pills.tsx:18`). A case's client industry isn't in `ListedCaseStudy.client` (L196), so add a read for it, used by the suggestions.
- **Sidebar:** `src/app/(tool)/layout.tsx` L44–51 and `_components/sidebar.tsx` (`SidebarProps` L17, items L165–191). Add `showCollections`; update `sidebar.test.tsx`, `layout.test.tsx` and `it.shell.nav`.
- **Collection page:**
  - Reuse the 4.12a file view: `src/app/(wizard)/clients/[clientId]/configurator/file-parts.ts` (`introPartOf` L28, `casePartOf` L67; lift what's shared to a shared `_lib`, with no client-only assumptions), `configurator/client-file.ts` (`fileSegments` L190, `moveKey` L108), `use-client-file.tsx`, `right-panel.tsx` (`ProjectRow` L52, `FilePagine` L65, row drag L336–420).
  - Every part is `editable: false`, and groups are passed to `composeParts` already grouped by client, because `compose.tsx:87` keeps the given order.
- **Dialogs:** `src/app/_components/dialog.tsx` (`Dialog` L48). Confirm patterns are in `case-studies/_components/delete-case-button.tsx`.
- **Tests:** `test/permissions.test.ts` (stubs L63, `EXPECTED` L85–117, count L147) and `test/authorize-guard.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] Migration, then `npm run db:types`.
- [x] `src/modules/collection/**` (+ unit and db tests): create, list (with filters), get, rename, delete, retag, add items, remove items, move group, move item, all with compare-and-set; reads that resolve each item to its case and live revision.
- [x] Policy (`manage collections`) and the industry read for collections.
- [x] Library selection and **Crea raccolta** (+ tests).
- [x] `/collections` list page and the sidebar item (+ tests).
- [x] The collection page: file view read-only, Pagine groups and rows, moves, Aggiungi casi, Rimuovi, Non disponibile, tags in the top bar (+ tests).
- [x] `src/shared/i18n/it.ts`, `test/permissions.test.ts`.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.10 stays `in-progress`, with a note that 5.10a is in review.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given the case configurator, the client file (4.12a/b) and client pack export tests, when they run, then they pass unchanged, apart from shared helpers that moved.

## Implementation Notes

- **Data.** `20261110160000_collection.sql`: `collection` (name 1–120, `version`, `created_by`, timestamps, `deleted_at`), `collection_item` (PK collection+case, unique position), `collection_tag` (kind `business_line` | `industry`), append-only `collection_event` (with the version after each change). RLS on, revoked from anon/authenticated, service role read-only. Writers (service role only): `create_collection`, `set_collection_items` (whole ordered list, CAS), `rename_collection`, `set_collection_tags`, `delete_collection` (soft, no CAS). Helpers check 1–200 ids, no repeat, non-deleted cases, new ids approved (kept ones may have lost approval), and each client's cases contiguous (a cross-group move is refused in SQL too). `STALE_COLLECTION`, `COLLECTION_NOT_FOUND`, `CASE_NOT_COLLECTABLE` mapped to 409/404/409, plus `COLLECTION_FULL`, `COLLECTION_LAST_ITEM` (409).
- **Module.** `src/modules/collection`: pure order rules in `domain/collection.ts` (create order, add, remove, move group, move item); use cases read cases only through `case-study`'s index (`list({})`, `getLiveRevision`). A soft-deleted case is dropped from reads and from the next items write; a case without a live approved revision reads with `revision: null` ("Non disponibile"). Deleting a collection is not a compare-and-set.
- **Case-study.** New `listClientIndustries()` (client id → sector key) for the Aggiungi casi suggestions; `listClientSectors` documented as allowed after `manage collections`.
- **Policy.** `manage collections` for owner/designer, admin and account/sales/social. The permissions suite stubs the collection module and exempts collection actions from the "account/sales/social writes nothing" check (collections hold ids only).
- **UI.** Library cards get a checkbox (sibling of the link) and a "{n} selezionate" bar with **Crea raccolta** (name + tags dialog) for roles that may manage collections. `/collections` (tool shell, sidebar **Raccolte** after Clienti) lists, filters (business line, industry), renames and deletes. `/collections/{id}` (wizard group, full screen) is a dedicated read-only view built from the configurator's pieces (`Canvas`, `FormatSwitch`, `StatusMessage`, styles) rather than the editing `Configurator`: per format `composeParts` default mode over the groups; Pagine with group rows, locked intro/closing rows, case rows (drag within group, Alt+↑/↓, menu Sposta su/giù, Rimuovi), **Aggiungi casi**, and **Modifica tag** in the top bar. Moves are optimistic and queued; a failure restores the confirmed order. Add/remove save then `router.refresh()` (view remounts on the new version). A client's intro is read on the server only when 2+ of its cases can be drawn.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass.
- `npm run build` -- expected: pass.
