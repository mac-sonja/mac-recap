---
title: "Story 4.12a: the client's whole file in the configurator"
type: 'feature'
created: '2026-11-10'
status: 'in-review'
baseline_commit: '61a3e0f68d86b32edf333e7c389b668b7bc5a5ab'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-11a-client-intro-in-the-configurator.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-9-edit-approved-case.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The client configurator (4.11) edits only the client's intro and closing. The owner can't see the client's whole story (intro, its cases, closing) or fix a case page in place. **Modifica layout** on the client page is still inactive.

**Approach:** The client configurator becomes the client's file. Per format, the canvas shows Introduzione, then one group per approved case history, then Chiusura. Every page is editable in place and saves to the document it belongs to: the intro, or that case's own revision. The file references the case's pages and never copies them (AD-25). **Modifica layout** opens it.

## Boundaries & Constraints

**Owner decisions (2026-11-10):**
- **Scope:** this is part 1. Part 2 (4.12b, deferred) adds reordering of the cases.
- **Which cases:** only **approved** cases appear in the file. Cases in Bozza, In elaborazione or Da approvare are not shown.
- **Publishing:** the top bar's Approva / Aggiorna / Scarta act on the client's intro only, as in 4.11. Cases are published from their own configurator.
- **Intro and closing:** Introduzione and Chiusura always show, whatever the number of cases. Whether a one-case client pack includes the intro is decided with the pack (B5).
- **Size and defaults:** kept whole at about 2,400 tokens; the case order (newest created first) and the other-case image refusal approved with the spec.

**Always:**
- **Route and entry points:** the route stays `/clients/{clientId}/configurator`.
  - **Modifica layout** on the client page becomes a link to it, for owner/designer.
  - The intro badge's **Apri** and the ready toast open the same route.
- **Canvas, per format, in order:**
  - **Introduzione:** the intro's `role: intro` pages.
  - **Cases:** one group per approved case, labelled "{code} · {name}", newest case first by creation date until 4.12b. Each group holds that case's pages, without its own `role: intro` pages and, in Carosello, without its Chiusura. Its Risultati e testimonial stays.
  - **Chiusura:** the intro's `role: outro` pages.
- **When the intro isn't ready:** if the intro doesn't exist or is in Bozza or In elaborazione, Introduzione and Chiusura show "Introduzione non ancora pronta" with no pages, and the cases still show. If there are no approved cases either, the route goes back to the client page.
- **Right panel, Pagine:** Introduzione thumbnails, then **Progetti del cliente** with one row per case (first page thumbnail, name, "{code} · {n} pagine"), then Chiusura thumbnails. Clicking a row scrolls the canvas to that case. Rows are not draggable yet.
- **Saving:** each part saves to its own document: the intro's working or approved-copy revision as in 4.11, or the case's editable revision with that revision's own version (AD-17).
- **Editing a case:**
  - The first edit to an approved case forks its working copy, as in Story 4.9.
  - The case's group heading then shows "Modifiche non ancora pubblicate" and a link **Apri la case** to that case's configurator, where Aggiorna and Scarta publish or drop the copy.
  - An edit made here shows when the case is opened on its own, and an edit made there shows here.
- **Stale part:** `STALE_REVISION` or `STALE_HEAD` on one part reloads that part only. The other parts keep their state and their unsaved edits.
- **Undo:** ⌘Z undoes the last edit across the whole file, whichever part it touched.
- **Deleting a case page** asks "Eliminare la pagina?", "Questa pagina fa parte della case {code} · {name}: eliminandola qui sparisce anche dalla case. Puoi annullare con ⌘Z.", **Elimina** / **Annulla**. Deleting an intro page stays as in 4.11.
- **Fields:**
  - The client's fields (name, sector, logo and the rest from 4.11a) write to the client record from any part.
  - Case fields stay read-only on approved cases, as in 4.9.
- **Media tab:** "Del cliente" and "Dalle sue case", as in 4.11a.
  - A file from another case placed on a case's page is refused with "Questa immagine è di un'altra case", because a case can hold only its own and the client's files.
- **Approvals:** Approva and Aggiorna's blockers (overflow, missing material) are measured on the intro alone. There is no bulk approve.
- **Small screens:** below 1024 px, the existing "The configurator needs a larger screen."

**Never:**
- Reordering cases (4.12b).
- Showing non-approved cases.
- Approving or updating a case from the file.
- Copying case pages into the intro.
- Changing the case configurator.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Open | Intro Da approvare, 2 approved cases + 1 in Bozza | Introduzione, 2 case groups (newest first), Chiusura; Bozza case absent | — |
| One case | 1 approved case | Introduzione, the case, Chiusura | — |
| Intro not ready | Intro In elaborazione, 1 approved case | Placeholder in Introduzione/Chiusura; case shown | — |
| Nothing | No intro ready, no approved case | Back to client page | — |
| Edit case | Type in an approved case's page | Fork, then save to the case's copy; heading shows "Modifiche non ancora pubblicate" + Apri la case; the case opened alone shows the edit | — |
| Edit intro | Type in an intro page | Saves to the intro, as in 4.11 | — |
| Stale one part | Case B saved elsewhere meanwhile, then edit B | Only B reloads; edits on A and the intro are kept | — |
| Undo | Edit case A, then intro, then ⌘Z twice | The intro edit, then the A edit, are undone | — |
| Delete case page | Bin on a case page | Confirmation naming the case; Elimina deletes from the case | Annulla → nothing |
| Other case's image | Drop case A's image on case B's page | Not placed; "Questa immagine è di un'altra case" | — |
| Row click | Click a project row | Canvas scrolls to that case | — |
| Approva | Intro clean | Approves the intro only | as 4.11 |

</frozen-after-approval>

## Code Map

Paths under `src/app/(wizard)/_components/configurator/` unless stated.

- `configurator.tsx` (one `useDocument` at L284; `approvedCase`/`editable`/`copyPending` L296–300; approve/update/discard L1015/1072/1120; undo/redo L1191; `removePage`/`reorderPage`/`addNewPage` L939–968; `selectPage` L416; one `OverflowReport` L1309) -- the single-document core. Add a multi-part layer:
  - one document state per part, keyed by part key (`client_intro:<id>`, `case:<id>`);
  - a page→part map so every edit is routed to that part's change;
  - a shared undo stack of `{ partKey, formats }` entries;
  - the top bar's save state as the aggregate of all parts;
  - approve/update/discard and the `OverflowReport` bound to the intro part.
- `use-document.ts` (`useDocument` L165–441: formats, version, revisionId, fork state, undo, autosave queue; `subjectKey` L36) -- the per-part document. It can't be called in a loop, so either lift it into a keyed store (`useDocuments`) or mount one child per part that registers upward. A part's stale result reloads that part through a server read of its revision, not `router.refresh()`.
- `page-groups.ts` (`PageGroups`, `groupLabelOf` L9–13), `canvas.tsx` (group headings L787–801, page numbering L809, bin L518–528), `right-panel.tsx` (`runsOf` L22, thumbnails and drag L197–257) -- feed them a groups list `{ key, label, partKey, pages, note? }`. Prefix page DOM keys with the part key, since keys like `closing` repeat across parts. Add project rows. `page-editing.ts` handles add, move and delete within a part.
- `src/modules/rendering/compose.tsx` (`composeParts` L66; the intro only with 2+ cases L81–82; the case drop rules L44–46, L107) -- the source of the file's page list. Add an option to always include the intro, and leave the export behaviour unchanged.
- `src/app/(wizard)/clients/[clientId]/configurator/page.tsx`, `actions.ts`, `case-media.ts` -- load the approved cases (`caseStudy.list({ clientId, status: "approved" })`, created newest first), each case's editable revision (4.9 rules) and the render assets. Reuse the case actions as they are: `saveRevisionDoc`, `forkCaseHead` and `getRenderAssets` in `src/app/(wizard)/case-studies/[caseId]/configurator/actions.ts` (L25, L69, L190) are case-keyed and route-independent. Add a read action for reloading one stale part.
- `src/app/(tool)/clients/[clientId]/page.tsx` L138–148 -- the inert **Modifica layout** (`it.clientPanel.layoutReason`): make it a link, shown to roles that may `edit`.
- `src/shared/i18n/it.ts` -- the delete confirmation, "Modifiche non ancora pubblicate", "Apri la case", "Introduzione non ancora pronta", "Progetti del cliente", "{code} · {n} pagine", and the other-case image message (deletion toast at L1257 for reference).
- `test/permissions.test.ts` -- any new action.

## Tasks & Acceptance

**Execution:**
- [x] `src/modules/rendering/compose.tsx` (+ test) -- the always-include-intro option.
- [x] `src/app/(wizard)/_components/configurator/*` (+ tests) -- the multi-part layer, groups and project rows, per-part save, fork, stale reload and undo, the case-page delete confirmation, the other-case image refusal.
- [x] `src/app/(wizard)/clients/[clientId]/configurator/*` (+ tests) -- load the parts, the part-reload action, the redirect rules.
- [x] `src/app/(tool)/clients/[clientId]/page.tsx` (+ test) -- **Modifica layout** link.
- [x] `src/shared/i18n/it.ts`, `test/permissions.test.ts`.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 4.12 stays `in-progress`, with a note that 4.12a is in review.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given the case configurator's existing tests, when they run, then they pass unchanged.
- Given an export of a single case, when it renders, then its output is unchanged.

## Implementation Notes

- **Compose.** `composeParts(parts, formatId, { clientFile: true })`: the intro is included with any number of cases (none: intro and closing only), and cases are trimmed as in a file even with no intro part. Without the option (exports) the output is unchanged.
- **Parts.** `client-file.ts`: `FilePartData` (one per intro or approved case: its own formats, revision, `headVersion`, values, template, own asset ids, case href) and `ClientFile` (the parts and their actions). `fileSegments` builds each format's segments (`client_intro`, `case:{id}`, `client_closing`) from `composeParts` and prefixes page keys with the segment (`{segment}|{pageKey}`, cached so untouched pages keep their identity). `splitFile`/`mergePart`/`partsChanged` cut an edit back into each changed part's whole formats (hidden pages kept; a new page joins the segment before it, taking `intro`/`outro` in the intro's runs); a page moved across segments returns null (refused).
- **Multi-part document.** `use-client-file.tsx`: one hidden `PartDocument` per part runs the unchanged `useDocument` (own compare-and-set, fork, autosave) and registers into state. The file's `DocumentState` routes `change` to the parts touched, keeps one undo stack of part-key steps (text sessions mapped to per-part groups), aggregates the save state, and reloads a stale part alone through `reloadFilePart` (remounted with a new generation; its undo steps dropped; NOT_FOUND / null drops the part).
- **Configurator.** `file` prop and `subject.kind: "client_file"` (`subjectKey` → `{ clientId }`). The single `useDocument` stays idle in file mode. Approva/Aggiorna/Scarta, the overflow report and the missing-file blocker use the intro part's document and pages; Scarta and stale approvals reload the intro part only. Per-page template and values come from the page's part. `commit` refuses an edit that adds another case's file to a case's page ("Questa immagine è di un’altra case") or moves a page across parts; canvas drags across parts are refused. A case page's bin asks first. **+ Aggiungi pagina** counts the part's own pages against the 50-page limit. Client fields stay editable from any part. With no intro ready, Introduzione and Chiusura show the placeholder and Approva is hidden.
- **Canvas / Pagine.** `Canvas` takes optional `groups` (`data-canvas-group`, note, empty text), numbering on across groups; case mode builds the same runs as before. `RightPanel` takes `file` (Introduzione thumbnails, **Progetti del cliente** rows, Chiusura thumbnails) and `onSelectGroup` (scrolls the canvas). `ConfiguratorHeader.status` is optional (no badge without an intro).
- **Route.** `page.tsx` loads the intro part (`introPartOf`, null unless Da approvare/Approvato with a head) and the approved cases (`casePartsOf`: `list({ clientId, status: "approved" })`, newest created first, a failing case left out and logged); redirects to the client page with neither. Case parts save through the case route's `saveRevisionDoc`/`forkCaseHead`. New actions: `reloadFilePart`, `getClientFileRenderAssets` (both `edit`, reads only). **Modifica layout** is a link for roles that may `edit`; `clientPanel.layoutReason` removed.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass.
- `npm run build` -- expected: pass.
