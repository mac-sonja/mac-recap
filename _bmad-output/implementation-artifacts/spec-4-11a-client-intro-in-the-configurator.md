---
title: 'Story 4.11a: client intro and outro in the configurator (open, edit, approve)'
type: 'feature'
created: '2026-11-06'
status: 'in-progress'
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
- [ ] `supabase/migrations/20261107120000_case_study_intro_edit_approve.sql` -- `save_intro_revision_doc`, `approve_client_intro`; then `npm run db:types`.
- [ ] `src/modules/case-study/**` (+ unit and db tests) -- `saveIntroRevisionDoc`, `approveIntro` with the intro allowed set; the exports.
- [ ] `src/app/(wizard)/clients/[clientId]/configurator/page.tsx`, `actions.ts` (+ tests) -- the client-mode page and actions: save, approve, render assets, case media list.
- [ ] `src/app/(wizard)/_components/configurator/*` (+ tests) -- the subject in place of `caseId`; client mode for the header, back, Pagine groups, Media tab, field edits, default-page texts and approve redirect.
- [ ] `src/app/_lib/routes.ts`, `draft-ready-notifier.tsx`, `clients/[clientId]/page.tsx`, `intro-status.tsx` (+ tests) -- the links.
- [ ] `src/shared/i18n/it.ts` -- client-mode copy.
- [ ] `test/permissions.test.ts` -- the new actions.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 4.11 stays `in-progress`, with a note that 4.11a is in review.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given the case configurator's existing tests, when they run, then they pass with no expectation changed except the `caseId` → subject rename.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass (local Supabase), including the new intro save and approve tests.
- `npm run build` -- expected: pass.
