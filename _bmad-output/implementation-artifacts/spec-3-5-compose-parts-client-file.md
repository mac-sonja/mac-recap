---
title: 'Story 3.5 follow-up: composeParts, the client file page order'
type: 'feature'
created: '2026-10-28'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-5-one-renderer-per-format.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.5 shipped one renderer per format, but nothing chains several documents into one file. The client configurator (4.12), client packs (5.9) and collections (5.10) need one rule for which pages of a client's intro document and of each case's revision appear, in what order, with continuous page numbers (C38, SCP 2026-10-28; split from 3.5 by the owner on 2026-10-28).

**Approach:** Add `rendering.composeParts(parts, formatId)`, a pure function over an ordered list of parts (case histories and client intro documents, each with its revision's v2 document, asset URLs and bound values). It returns, per case or client segment, the pages to draw (the same page objects as in the revision's document, never copies) and their starting page number. Add `renderComposed(composed, options)` to draw the result with each part's own renderer.

The rule, for each client with an intro document and 2 or more case histories in the parts:
- the client's intro pages (role `intro`) come before that client's first case;
- each of that client's cases leaves out its own intro pages (role `intro`) and, in Carosello, its own Chiusura (pageKey `closing`); its Risultati e testimonial pages stay;
- the client's closing pages (role `outro`, which includes the client's own Chiusura in Carosello) come once after that client's last case.

Otherwise (one case, or no intro document for that client), every case keeps all its pages and the client's intro document is left out. Cases keep the order of the parts. Numbering starts at 1 and runs on across segments.

Out of scope: collection edits and hidden pages (5.10/5.11), the export job and content hash (5.3/5.9), and any configurator UI (4.12).

</frozen-after-approval>

## Implementation Notes

- New `src/modules/rendering/compose.tsx` (pure; imports generation types only with `import type`, like the templates), exported from `src/modules/rendering/index.ts`. Unit tests in `src/modules/rendering/compose.test.tsx`.
- A part: `{ kind: 'case_history', caseId, clientId, doc, assets, values }` or `{ kind: 'client_intro', clientId, doc, assets, values }`; `doc` is the revision's upgraded v2 document. A segment in the output names its part, so an edit made in the client file can write back to the case's own revision (4.12).
- Bugs throw (a module error, like `renderFormat`): a format missing from a part's document (`FORMAT_NOT_IN_REVISION` in the message), a part whose document is of the other kind, the same `caseId` twice, or two intro documents for one client. Parts' `clientId`s are trusted (the caller builds them from the records).
- Each segment carries `slot` (`client_intro | case | client_closing`) and a stable `key` (`case:{caseId}`, `client_intro:{clientId}`, `client_closing:{clientId}`); `renderComposed` keys by it, so reordering cases in 4.12 moves their renderers instead of reusing slots.
- From the client's intro document only `intro` pages (before) and `outro` pages (after) are drawn; a `body` page there is not placed, and an intro document with no `outro` pages in a format gives no closing segment. The client template (3.9/3.11) defines only those two roles.
- A segment with no pages is skipped; numbering stays continuous. An intro document whose client has no case in the file is left out.
- Ran on Node 24 (nvm): `npm run typecheck`, `npm run lint`, `npm test` (116 files, 3397 passed, 1 skipped), `npm run build` all pass; compose tests 14.
- Tests: one case (all pages, numbered from 1); two cases of one client (client intro, case pages without intro or Carosello closing, Risultati kept, client closing, continuous numbers); mixed clients (rule applied per client; a client with one case keeps its own pages and its intro document is dropped); no intro document; page identity (`toBe` against the revision's pages); a missing format throws; `renderComposed` output carries continuous `data-page-number` values.

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | A case part's document kind is never checked | low | Only `client_intro` parts were checked; symmetric check is one line | patch |
| 2 | The same case twice reaches the 2+ threshold | medium | Nothing rejected a repeated `caseId`; it would wrap one case and draw it twice | patch (throws) |
| 3 | `renderComposed` keys segments by index | medium | Reordering cases in 4.12 would hand one case's renderer another's pages | patch (stable `key`) |
| 4 | A segment doesn't say intro or closing | low | Callers would compare page roles; `slot` added with the key | patch |
| 5 | Client intro `body` pages dropped; no-outro intro unreported | low | The client template defines only intro and outro roles (3.9/3.11) | reject (documented in Implementation Notes) |
| 6 | Carosello closing matched by `pageKey === "closing"` | maybe-false | Default pages restore only lost pages and keep their key; whether 4.13 can duplicate or re-key a Chiusura is undecided | defer |
| 7 | Missing tests (three cases, wrong kind, repeated case, intro without cases, empty format, mixed templates) | low | All added except mixed templates: only `mac-case@1` exists | patch |
| 8 | Presentazione/Video test compared copies with `toEqual` | low | Would pass if pages were cloned; now `toBe` per page | patch |
| 9 | Spec status, deferred-work and sprint-status not updated | false | Done at finalize, as the workflow orders | reject |
| 10 | An intro document's client isn't verified | low | `clientId` comes from the caller's records; now stated as trusted in the doc comment | patch (doc) |
