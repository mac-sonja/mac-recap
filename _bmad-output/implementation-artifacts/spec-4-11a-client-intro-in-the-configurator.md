---
title: 'Story 4.11a: client intro and outro in the configurator (open, edit, approve)'
type: 'feature'
created: '2026-11-06'
status: 'in-review'
baseline_commit: 'abe5489a0948c3c33fd1197dfaf1eb25d9c2ad20'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-11-client-intro-and-outro-with-test-text.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-8-approva.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A client's intro-and-outro draft (Story 3.11) lands in Da approvare, but nothing can open, edit or approve it: the configurator, its save and approve paths, its Media tab and its field edits all assume a case.

**Approach:** Open the intro in the same configurator, in a client mode. The intro's pages are edited with the same tools, saved to its revision with compare-and-set, and approved with Story 4.8's rules. The Media tab shows "Del cliente" (uploads go to the client) and "Dalle sue case", and the client's fields write back to the client.

## Boundaries & Constraints

**Owner decisions (2026-11-06):**
- **Split:** this is part 1. Part 2 (4.11b, deferred) is editing an approved intro, as in Story 4.9.
- **Pages shown:** only the client's own pages, under **Introduzione** (role `intro`) and **Chiusura** (role `outro`). A8 (4.12) adds the cases between them.
- **Images:** keep upload order (`position`). There are no client favourites.
- **Media:** include "Dalle sue case".
- **Size:** kept whole at about 1,900 tokens (owner approved the spec as it stands).

**Always:**
- **Route:** `/clients/{clientId}/configurator`, owner/designer only, under the same surface as the case configurator.
  - An intro in `in_review` opens editable.
  - An `approved` intro opens read-only, with no fork; that comes in part 2.
  - No intro, or one in `draft` or `generating`, redirects to the client page.
- **Header:** title "{Client} · Pagine cliente" with the client code. Back goes to the client page.
- **Save:** the intro's working revision, with compare-and-set on its version and head, only while the intro is `in_review`. It writes a `client_event`, never a `case_event`.
- **Approva** (Story 4.8 rules):
  - no overflow in any format;
  - every referenced asset is still live, where the allowed set is the client's files plus the live assets of the client's non-deleted cases.
  - On success the intro and its revision become `approved`, `approved_revision_id` is set, and a `transition` event and a `revision_approved` client event are written. The page then returns to the client page, which shows the badge as Approvato.
- **Media tab in client mode:**
  - "Del cliente" lists the client's files and uploads to the client's material, respecting the client file limit.
  - "Dalle sue case" lists the images and videos of the client's non-deleted cases. They can be placed, but there is no upload or star there.
  - The drop hint reads "Finiscono nei Media di questo cliente."
- **Field edits:** client bindings (name, sector, description, results, testimonial) save through the existing client actions. No case binding is offered.
- **Pagine di default** fills the client template's texts, including `introHead`, `introBody`, `outroHead` and `outroBody`.
- **Links:** the client page gets an **Apri** link next to the intro badge when the intro is `in_review` or `approved`. The intro ready toast opens the configurator.
- Case mode behaves exactly as today.

**Never:** No fork, update-approved or discard for intros (part 2). No cases in the client view (A8). No client favourites. No change to case documents or case actions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Open | Intro `in_review` | Configurator, client mode, Introduzione + Chiusura pages, editable | — |
| Not ready | No intro / `draft` / `generating` | Redirect to client page | — |
| Approved | Intro `approved` | Opens read-only, no Approva, no save | — |
| Save | Edit a text | Saved to intro revision; version bumps; `client_event` | stale version → `STALE_REVISION`, reload message as for cases |
| Approve | No overflow, all assets live | Intro + revision `approved`; back to client page | — |
| Approve blocked | Overflow, or a placed case image since deleted | Not approved | `OVERFLOW_NOT_CLEARED` / `MATERIAL_MISSING` as in 4.8 |
| Upload | Drop an image in client mode | Added to "Del cliente"; client file count rises | over the client limit → the existing limit message |
| Case media | Client has 2 cases with images | "Dalle sue case" lists them; placing one saves | — |
| Case unchanged | Open a case configurator | Same as before this story | — |

</frozen-after-approval>

## Code Map

- `src/app/(wizard)/case-studies/[caseId]/configurator/page.tsx`, `actions.ts` -- the case route to mirror: loads at L77–135; actions `saveRevisionDoc`, `approveCase`, `getRenderAssets` (L25, L43, L190), each keyed by `caseId`.
- `src/app/(wizard)/_components/configurator/configurator.tsx` (props L89–157; `caseId` L108; approve redirect L1013; `base.kind` L263; `fieldsOn` L280), `use-document.ts` (`SaveInput`/`ForkInput` hold `caseId`, L28/L41) -- replace `caseId` with a subject `{ kind: "case" | "client_intro", id }`. There is no mode prop yet.
- `_components/configurator/media-tab.tsx` -- case material actions (L5, L221–296) and the "Del cliente" group (L410–427). Client mode needs the client actions in `src/app/(tool)/clients/actions.ts` (`requestClientMaterialUpload`, `confirmClientMaterialUpload`, `listClientMaterial`, L169–202) and `CLIENT_MATERIAL_MAX_FILES` (`case-study/domain/client-material.ts:31`). Copy is in `it.ts` ~L1178–1200.
- `_components/configurator/right-panel.tsx` `runsOf` (L19) groups by `page.section`. Client mode groups by `role`; the labels go in `it.configurator`.
- `_components/configurator/default-pages.ts` `generatedTextsOf`/`MARKERS` (L53, L157) use `TEMPLATE_TEXT_KEYS` only. Add `CLIENT_TEMPLATE_TEXT_KEYS` (`rendering/templates`).
- `_lib/configurator-data.ts` (`boundValuesOf`, `editableFieldsOf` L19/L44) and `bound-fields.ts` (`EditableFields.case` required L26; client results/testimonial `null` L68; `planFieldSave` L180) -- add a client-only variant wired to `updateClient`, `saveClientResults` and `saveClientTestimonial` (`clients/actions.ts` L110/L126).
- `src/modules/case-study/application/revisions.ts` -- `makeSaveRevisionDoc` (L186) and `makeApprove` (L239) check `revision.caseId === caseId`; `allowedAssetIds`/`assetsOfCase` (L157/L165). Add intro paths, with the allowed set = client assets ∪ `material.liveAssetIds` of each of the client's cases. `index.ts`: L634, L657, the intro exports L733–783; `transitionIntro` keeps refusing `approve` because approval goes through `approve_client_intro`.
- `supabase/migrations/20261105160000_case_study_edit_approved.sql` `save_revision_doc` (L126) and `20261103120000_case_study_approve.sql` `approve_revision` (L24) -- case-only. Add `save_intro_revision_doc` and `approve_client_intro` (lock `client_intro`, `in_review` only, write `client_event`, `mac_recap.intro_transition` guard) in a new migration. Mirror `20261106120000_case_study_client_intro.sql`.
- `src/app/_components/draft-ready-notifier.tsx` `hrefOf` (L29, intro → `clientHref`); `src/app/_lib/routes.ts` (add the intro configurator href); `src/app/(tool)/clients/[clientId]/page.tsx` + `_components/intro-status.tsx` (the Apri link).
- `test/permissions.test.ts` -- a new actions file needs manual import, `EXPECTED` entries and the count (L91–126). `test/authorize-guard.test.ts` covers it automatically.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261107120000_case_study_intro_edit_approve.sql` -- `save_intro_revision_doc`, `approve_client_intro`; then `npm run db:types`.
- [x] `src/modules/case-study/**` (+ unit and db tests) -- `saveIntroRevisionDoc`, `approveIntro` with the intro allowed set; the exports.
- [x] `src/app/(wizard)/clients/[clientId]/configurator/page.tsx`, `actions.ts` (+ tests) -- the client-mode page and actions: save, approve, render assets, case media list.
- [x] `src/app/(wizard)/_components/configurator/*` (+ tests) -- the subject in place of `caseId`; client mode for the header, back, Pagine groups, Media tab, field edits, default-page texts and approve redirect.
- [x] `src/app/_lib/routes.ts`, `draft-ready-notifier.tsx`, `clients/[clientId]/page.tsx`, `intro-status.tsx` (+ tests) -- the links.
- [x] `src/shared/i18n/it.ts` -- client-mode copy.
- [x] `test/permissions.test.ts` -- the new actions.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 4.11 stays `in-progress`, with a note that 4.11a is in review.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given the case configurator's existing tests, when they run, then they pass with no expectation changed except the `caseId` → subject rename.

## Implementation Notes

- **Server.** Migration `20261107120000_case_study_intro_edit_approve.sql`: `save_intro_revision_doc` (lock the intro, head, `in_review` only, `client_event` `revision_saved`) and `approve_client_intro` (Story 4.8's checks and order, the `mac_recap.intro_transition` flag, `transition` + `revision_approved` client events). `db.types.ts` written by hand, then checked byte-identical against `npm run db:types`. `ClientIntroRepository` gains `saveDoc` and `approve`; `revisions.ts` gains `makeSaveIntroRevisionDoc` and `makeApproveIntro`, whose allowed set is the client's files plus `material.liveAssetIds` of each case from `cases.list({ clientId })`. A save also refuses a document not of kind `client_intro`. `index.ts` exports `saveIntroRevisionDoc` and `approveIntro`; `transitionIntro` still refuses `approve`.
- **Subject.** `use-document.ts` exports `Subject` (`{ kind: "case", id }` or `{ kind: "client_intro", id, clientId }`; the client id is for the Media tab) and `subjectKey`. Saves, Approva and render-asset reads send `caseId` for a case (unchanged) and `clientIntroId` for an intro; fork, Aggiorna and Scarta stay case-only. The configurator's `caseId` prop became `subject`; case tests changed only that prop.
- **Client mode** (`subject.kind === "client_intro"`): pages grouped by role (`page-groups.ts`, `it.configurator.clientSections`) on the canvas and in Pagine; the Media tab's own list is the client's ("Del cliente", no star, uploads through the client material actions, `CLIENT_MATERIAL_LIMIT` and the pixel refusal in the client panel's words), the second group its cases' ("Dalle sue case"); after Approva the page goes to `back.href`. Field edits: `ClientEditableFields` (`client` + `record`), `boundEditorOf(el, "client")` offers only client bindings (name, description, sector, own rows and testimonial, logos); rows and testimonial save through `saveClientResults` / `saveClientTestimonial`, the rest through `updateClient`; the panel hides Dati della case.
- **Pagine di default.** `default-pages.ts` reads `CLIENT_TEMPLATE_TEXT_KEYS` too, and builds the markers with each row count and testimonial, so the outro texts on the Risultati e testimonial page are found.
- **Route.** `src/app/(wizard)/clients/[clientId]/configurator/` (`page.tsx`, `actions.ts`, `case-media.ts` for "Dalle sue case"). `clientMediaOf` moved to `media-files.ts` (re-exported from `configurator-data.ts`) so the tab can map a fresh client listing; a client file not drawn yet keeps the tab polling until its rendition is read.
- **Links.** `clientConfiguratorHref`; the ready toast opens it (and stays quiet while it is open); `IntroStatus` shows **Apri** (outside the status region) for a role that may `edit`, while Da approvare or Approvato.
- **Guards.** `test/permissions.test.ts` lists the three new actions; `test/approval-guardrail.test.ts` now expects `approve` and `approveIntro`, and pins `approveIntro`'s only caller and its check order.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | One failing case listing takes down the configurator (blind, edge) | medium | `caseMediaOfClient` returns err for any case; `page.tsx` throws | patch |
| 2 | Initial client media never polls for a missing rendition (edge) | low | `page.tsx` builds the list without `thumbnailPending`; `relistClient` sets it | patch |
| 3 | Empty sector label when the sector list fails; wrong comment (blind) | low | `page.tsx` sets `sector: ""`; the comment says it falls back | patch |
| 4 | Client mode shows case wording in errors (blind) | low | `it.ts:970` `STALE_STATUS` "La case non è più da approvare"; client mode reuses it | patch |
| 5 | Empty `bindings` opens the sector editor (blind, edge) | low | `[].every()` is true in `clientEditorOf` | patch |
| 6 | Client name length in UTF-16 units (blind) | low | `planClientFieldSave` uses `.length`; the server counts code points | patch |
| 7 | 8 template builds per format for case documents too; rows hard-coded 0..3 (blind, edge) | low | `MARKER_SHAPES` in `default-pages.ts` runs for every kind | patch |
| 8 | Duplicate unused i18n keys (blind, gap) | low | `clientBack`/`clientTitle` under `wizard` and `caseView` are unused | patch |
| 9 | Client Chiusura default page source untested (gap) | medium | No test applies a default page in client mode | patch |
| 10 | Upload preview fetch under `clientIntroId` untested (gap) | medium | The upload test passes no `onRenderAssets` | patch |
| 11 | Client sector and logo saves untested (gap) | low | `bound-fields.test.ts` client mode has no sector/logo case | patch |
| 12 | Client pixel-size message untested (gap) | low | Only `CLIENT_MATERIAL_LIMIT` is tested | patch |
| 13 | Intro save lacks the format guard (blind) | false | `validateNewDocument` raises `FORMAT_NOT_IN_REVISION` (`generation/domain/document.ts:660`) for both kinds | reject |
| 14 | Case-only callbacks get the intro id (blind) | low | Unreachable: the client page passes no update/discard props | reject |
| 15 | Case media re-listed on each poll and autosave (blind) | low | A few small queries per call on a client with a handful of cases | reject |
| 16 | No confirmation after approving an intro (blind) | low | The client page badge reads Approvato on return | reject |
| 17 | An Approvato intro still accepts uploads (blind) | low | Uploads go to the client's material, which the client page allows anytime; the approved document is untouched and field edits are off (`fieldsOn` needs `editable`) | reject |
| 18 | SQL and use-case test gaps (deleted client, other intro's revision on approve) (blind) | low | The functions mirror the tested case versions; the save path is tested for another intro's revision | reject |
| 19 | Hard-coded `from` in the approve event (blind) | low | Correct by the check right before; cosmetic | reject |
| 20 | Spec bookkeeping (blind) | false | A spec edit, not a code defect | reject |
| 21 | Description typed then refused without logo or sector (edge) | false | Every client has a logo and a sector: the client panel requires both before Aggiungi | reject |
| 22 | Meta focus request left pending in client mode (edge) | low | Harmless: the panel opens; no wrong field is focused | reject |

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass (local Supabase), including the new intro save and approve tests.
- `npm run build` -- expected: pass.
