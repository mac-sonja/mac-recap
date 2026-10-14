---
title: 'Story 2.9 (backend): Tag, property and flag deliverables'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
baseline_commit: '6f05aa0e1b6f53e8039ff0f6e256660f38ea806a'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

> **Superseded 2026-10-14** by the [Sprint Change Proposal](../planning-artifacts/sprint-change-proposal-2026-10-14.md). This code is retired by Story 2.8 (Retire pasted text and the taxonomy); favourites replace tagging in Story 2.9 (Mark images and videos as favourite). Kept as a historical record.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Deliverables (files and text items) can't be described with tags, properties or flags, so material isn't described consistently for generation or for finding case studies later, and there is no place for the OP 3 taxonomy values to land.

**Approach:** Add `taxonomy_term` (reference data, written only by migrations) and `material_term` links to the `material` module, with use cases and server actions to read the terms and to set one deliverable's terms of one kind, always by stable `key`.

## Boundaries & Constraints

**Always:** `taxonomy_term` (uuid id, `kind` ∈ tag | property | flag, unique `key` matching `^[a-z][a-z0-9_]*$`, `label`); only migrations write it — revoke insert/update/delete from every API role including `service_role`. `material_term` (`ref_kind` ∈ asset | text, `ref_id`, `term_id` FK, unique per ref and term); a deliverable is a live asset or live text item of the given case. Code refers to terms only by `key`; labels are display-only. Reading terms works with zero terms seeded (an empty kind returns `[]`). Setting terms replaces that deliverable's terms of one kind in one Postgres function (case and deliverable live, every key exists and is of that kind), then records `terms_set` through `case-study.recordEvent` with `{ refKind, refId, kind, keys }` — keys only; if the event write fails, the previous set is put back (as in 2.7/2.8). Every server action calls `getActor` then `authorize(actor, "tag")` first. Any case status; status never changes. Works without S3. A removed deliverable keeps its links (restore brings them back).

**Decision (cardinality):** a deliverable can have several terms of every kind (tag, property, flag); no per-kind limit. A later migration can narrow a kind once OP 3 is decided.

**Never:** No UI (deferred until the wizard exists). No seed values (OP 3 decides them; a later seed migration adds them). No API that creates, renames or deletes a term. No free-text terms. No `form_field` refs, no library facets/search (Epic 5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List terms | terms seeded for tag only | `{ tag: [{key,label}…], property: [], flag: [] }` ordered by label | N/A |
| Set | live asset, kind tag, keys `[a, b]` | links = a, b; `terms_set` recorded; status unchanged | N/A |
| Replace | asset has tag a; set tag `[b]` | tag links = b only; property/flag links untouched | N/A |
| Clear | set tag `[]` | no tag links; event recorded | N/A |
| Unknown key | key not in `taxonomy_term` | nothing changes | `UNKNOWN_TERM` (400) naming the key |
| Wrong kind | a property key sent as kind tag | nothing changes | `UNKNOWN_TERM` (400) |
| Text item | live text item | same as asset | N/A |
| Removed deliverable | soft-deleted asset or text item | nothing changes | `NOT_FOUND` (404) |
| Other case | deliverable of another case | nothing changes | `NOT_FOUND` (404) |
| Read | case with tagged and untagged deliverables | per deliverable `{ refKind, refId, tag[], property[], flag[] }` keys; untagged → all empty | N/A |
| Label renamed | migration changes a term's label | set/read by key still work | N/A |
| Forbidden | account/sales/social actor | nothing queried | `FORBIDDEN` (403) |

</frozen-after-approval>

## Code Map

- `src/modules/material/**` -- mirror Stories 2.7/2.8: `domain/` (`taxonomy.ts`: kinds, key regex, schemas, `TERMS_SET`), `ports/taxonomy-repository.ts`, `adapters/supabase/taxonomy-repository.ts` (+ `stubClient` test), `application/{list-terms,set-deliverable-terms,get-case-terms}.ts` with the compensation pattern from `application/edit-text-item.ts`, `deps.ts` (`MaterialDeps.taxonomy`), `index.ts` exports `listTerms`, `setDeliverableTerms`, `getCaseTerms` (no storage needed, see 2.8's text paths), `index.test.ts` wiring.
- `supabase/migrations/2026101316xxxx_material_taxonomy.sql` -- both tables; RLS on + `revoke all … from anon, authenticated`; `revoke insert, update, delete on taxonomy_term from service_role`; reject delete/truncate on `taxonomy_term`; `set_material_terms(p_case_id, p_ref_kind, p_ref_id, p_kind, p_keys text[])` (security invoker, `search_path=''`, service_role only) raising P0001 `NOT_FOUND` / `UNKNOWN_TERM`, returning the previous keys of that kind for compensation. No seed rows. Then `src/shared/db.types.ts` (CI diffs it).
- `src/modules/access` -- `authorize(actor, "tag")` (owner_designer); add `UNKNOWN_TERM` → 400 to `httpStatusFor`.
- `src/app/(tool)/case-studies/actions.ts` (+ test) -- `listTaxonomyTerms`, `setDeliverableTerms`, `getCaseTerms`; authorize-first is enforced by `test/authorize-guard.test.ts`.
- `test/db/material.db.test.ts` -- seed test terms with the `postgres` pool (as a migration would) and clean up; RLS lockout; `service_role` can't write `taxonomy_term`; set/replace/clear/unknown/wrong-kind/other-case/removed; a label rename leaves key-based set and read working.

## Tasks & Acceptance

**Execution:**
- [x] migration + `src/shared/db.types.ts` -- tables, grants, triggers, `set_material_terms`
- [x] `src/modules/material/**` + unit tests -- every matrix row with fakes
- [x] `src/modules/access` + test -- `UNKNOWN_TERM`
- [x] `src/app/(tool)/case-studies/actions.ts` + test -- three actions, authorize first
- [x] `test/db/material.db.test.ts` -- DB rows above
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 2.9 stays `in-progress` (UI part and OP 3 seed open)

**Acceptance Criteria:**
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.
- Given the PR, when the CI `db` job runs, then the new DB tests and the db-types diff pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | verification-gap | No verification gaps | — | — | Reviewer found every behaviour covered, incl. DB order, rename and lockout. |
| 2 | blind | `service_role` keeps REFERENCES/TRIGGER on `taxonomy_term` | low | patch | Only insert/update/delete/truncate revoked; direct `revoke all` + `grant select`. |
| 3 | blind, edge | `keys` unbounded in count and length | low | patch | No `.max()`; whole array reaches the DB and the event; direct bound. |
| 4 | blind | Key order differs between event, return and read | low | patch | Caller order vs sorted previous keys; sort before writing. |
| 5 | blind | `TAXONOMY_INVALID` returned without a log | low | patch | `invalid()` silent; one log line with the issue path. |
| 6 | blind | `textDeps` name no longer fits | low | patch | Also serves taxonomy paths; rename only. |
| 7 | blind, edge | Undo overwrites a concurrent set | low | reject | Needs an event-write failure plus a concurrent set; same trade-off as 2.7/2.8. |
| 8 | blind, edge | Concurrent removal makes the undo fail | low | reject | Same window; logged; fix needs the event in the DB transaction (AD-11). |
| 9 | blind | `material_term.ref_id` unchecked; service role can write links directly | low | reject | Only the material module holds the key; `set_material_terms` is security invoker and needs write rights. |
| 10 | blind | `UNKNOWN_TERM` echoes the malformed key | low | reject | Max 64 chars, rendered as text by React; no injection path. |
| 11 | blind | Re-setting the same keys records an event | low | reject | Harmless; same as 2.8 no-op edit. |
| 12 | blind | Read schema doesn't run `isTermKey` | low | reject | Keys come from the DB, whose check constraint is the same pattern. |
| 13 | blind | Missing DB tests (lock concurrency, DB-level undo, text-id-as-asset) | low | reject | Unit tests cover undo; the reverse ref-kind case is symmetric SQL. |
| 14 | blind | Cleanup `disable trigger` locks `taxonomy_term` | false | reject | `vitest.db.config.mts` sets `fileParallelism: false`. |
| 15 | blind | Spec Verification omits the DB command | — | reject | Fix would edit this build's spec. |
| 16 | edge | `getCaseTerms` returns `[]` if the case is deleted mid-request | low | reject | Needs a delete between two calls; reads only. |
| 17 | edge | `data` null without error → TypeError | false | reject | supabase-js returns `data: null` only together with `error`. |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0
