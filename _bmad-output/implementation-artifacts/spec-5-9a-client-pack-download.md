---
title: 'Story 5.9a: client pack download'
type: 'feature'
created: '2026-11-10'
status: 'in-progress'
baseline_commit: '7e0d869dc2720532053eb913c49338e88fabf78c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-3-export-a-format.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-4-several-formats-one-zip.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A client's whole track record can't be downloaded. Today the export (5.3, 5.4) works one case at a time, and the client pack button on the Clienti list is inactive.

**Approach:** **Scarica** on a client opens the same export dialog as a case. For each ticked format, the server builds the client's pack: the client's approved intro, then its approved cases in the client's order (4.12b), then the approved closing. It exports the pack through the existing export job. Several formats come as one ZIP, and the same inputs return the stored file.

## Boundaries & Constraints

**Owner decisions (2026-11-10):**
- **Scope:** this is part 1, for owner/designers. Part 2 (5.9b, deferred) gives account/sales/social users a read-only Clienti list with Scarica.
- **Intro with one case:** when the client's intro is approved, the pack is intro, then case(s), then closing, whatever the number of cases. This replaces the story's "1 case → its own pages".
- **Case order:** the client's saved order, as set in 4.12b (`listClientCasesInOrder`), replaces the story's "newest first". With no saved order, newest first is still the result.

**Always:**
- **Pack contents, per format:**
  - **Intro approved:** the intro's `intro` pages, then each approved case without its own `intro` pages and, in Carosello, without its own Chiusura (Risultati e testimonial stay), then the intro's `outro` pages once.
  - **Intro missing or not approved:** each approved case with all its own pages, in order, and the dialog says "L'introduzione del cliente non è approvata: ogni case tiene la sua intro e la sua chiusura."
  - Page numbers run on across the whole pack.
  - Each part is read from its **approved** revision only (`getLiveRevision`), never a working, superseded or unapproved one.
  - Deleted cases are left out.
- **Building the pack:** `composeParts` gets a pack mode, or an option, for the intro-with-any-count rule. Single-case exports and the configurator's `clientFile` mode stay unchanged.
- **Export pipeline (5.3/5.4), widened rather than duplicated:**
  - The export subject can be a client.
  - The payload holds all of the pack's parts, in order.
  - The content hash covers every part's subject, approved revision and bound values, plus the client's fields.
  - The same inputs return the stored export, and any change to an approved revision, the order or the client's fields gives a new one.
  - Files are named from the client's code and name. Several formats download as one ZIP.
  - The worker re-reads the pack and refuses with `EXPORT_STALE` when a part has changed since the request.
- **Refusals:** a client with no approved case has no **Scarica**, and a direct call fails with `NOT_APPROVED`. A format that a part lacks behaves as for cases (`FORMAT_NOT_IN_REVISION`).
- **Where Scarica appears:** on each Clienti row with at least one approved case (the existing button, now active), and on the client page. Both are owner/designer only for now.
- **Dialog:** the same component and polling as the case dialog, with the note above when the intro isn't approved.
- **Activity:** each successful pack download records an event, using the existing export event pattern.

**Never:**
- Account/sales/social access (5.9b).
- Video export (after the demo).
- Collections (5.10).
- Changing single-case exports or their hashes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Full pack | Intro approved, 3 approved cases (saved order C,A,B), Presentazione | Intro pages, C, A, B (own intros dropped), closing once; continuous numbers | — |
| One case | Intro approved, 1 case | Intro, the case without its intro, closing | — |
| No intro | Intro Da approvare, 2 cases | Both cases with all their own pages; dialog note | — |
| Carosello | Intro approved, 2 cases | Each case's own Chiusura dropped; client closing once | — |
| Two formats | Presentazione + Carosello | One ZIP with both files | — |
| Again | Same inputs, Scarica again | Stored export returned, no new job | — |
| Changed | One case's approved revision updated | New export | — |
| Working copy | A case has an unpublished working copy | Pack uses its approved revision | — |
| No approved case | Client with only Bozza cases | No Scarica; direct call → `NOT_APPROVED` | `NOT_APPROVED` |
| Stale | A case updated between request and job | Job refuses | `EXPORT_STALE`, as for cases |

</frozen-after-approval>

## Code Map

- `src/modules/rendering/domain/export.ts`:
  - `exportSubjectSchema` L58 is `case` only, with a comment saying "5.9 and 5.10 add…".
  - `exportPayloadSchema` L77–83 has `parts.length(1)`.
  - `exportStatusInputSchema` L98 is keyed by `caseId`.
  - `contentHashInput` L168: multi-part, with a case block.
  - `bundleHashInput` L190.
  - File names L209–236.
  - Widen all of these for a client subject.
- `src/modules/rendering/application/export-source.ts`: `ExportSourceDeps` L350, `readExportSources` L389, `bundleHashOf` L449. Add a pack reader: the client, its intro's live revision, `listClientCasesInOrder`, and each case's live revision, values and media.
- `src/modules/rendering/application/request-export.ts`: `makeRequestExport` L178, `deliver` L120, `makeExportStatus` L217 (single-part checks L250–253). Add the client subject path and the client status.
- `src/modules/rendering/application/export-handler.ts`: `run` L286 (`parts[0]`), `draw` L163 (hard-coded single `case_history` part, page-count check L193/198), `caseIdOf` L94. Draw N parts, count pages from `composeParts`, and return `caseIdOf` null for a client.
- `src/modules/rendering/compose.tsx` L79 (default mode: intro only with 2+ cases, L98–123) and `export-html.ts` L12: add the pack rule (intro with any count of cases when an intro part is given). Default and `clientFile` stay as they are.
- `supabase/migrations/20261105140000_rendering_export.sql`: `parts jsonb` holds 1–200 entries with no `case_id` column, so no migration should be needed. Confirm the parts check accepts the new subject kinds; if it doesn't, add a forward migration.
- `src/app/(tool)/case-studies/export-actions.ts` (L20, L37, deps L25–41): mirror these as `src/app/(tool)/clients/export-actions.ts` (`requestClientExport`, `getClientExportStatus`), authorized `export` for owners.
- `src/app/(tool)/case-studies/_components/case-download.ts` (`caseDownload`, `refusalFor`): mirror as `clientDownload(clientId)`.
- `src/app/_components/download-button.tsx` (props L42–60): add an optional note line.
- `src/app/(tool)/clients/_components/clients-table.tsx` L265–275 (inactive pack button, `packLabel`/`packTitle`/`packDescription` in `it.ts` L641–645) and `src/app/(tool)/clients/[clientId]/page.tsx`: wire Scarica.
- `test/permissions.test.ts`:
  - `EXPECTED` L92–121 and the count at L146 need the new actions.
  - The guardrail L252–276 is the pattern for a client pack test: no role exports a pack with a non-approved revision, and `getEditableRevision` is never called.

## Tasks & Acceptance

**Execution:**
- [ ] `src/modules/rendering/**` (+ unit tests) -- the pack rule in `composeParts`, the pack source, hash, payload, handler and status.
- [ ] Migration only if the export table's parts check refuses the new subject kinds; then `npm run db:types`.
- [ ] `src/app/(tool)/clients/export-actions.ts`, `_components/client-download.ts` (+ tests) -- the actions and dialog wiring.
- [ ] `download-button.tsx`, `clients-table.tsx`, `clients/[clientId]/page.tsx` (+ tests) -- Scarica and the intro note.
- [ ] `src/shared/i18n/it.ts`, `test/permissions.test.ts` (new actions and the pack guardrail).
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.9 stays `in-progress`, with a note that 5.9a is in review.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:db` and `build`, when they run, then they pass.
- Given a single-case export, when it is requested, then its hash and output are unchanged (existing tests pass as they are).

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:db` -- expected: pass.
- `npm run build` -- expected: pass.
