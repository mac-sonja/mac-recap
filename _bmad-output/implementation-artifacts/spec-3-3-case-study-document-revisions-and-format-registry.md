---
title: 'Story 3.3: The case study document, revisions and the format registry'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_commit: '975c6e1c7040eda4a67b0efa350e7164ccd0300b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing yet holds a generated case study. The generator (3.6/3.7), the test draft (3.10), the templates and renderers (3.4/3.5) and the configurator (Epic 4) all need one validated document per revision, with stable block ids, and one list of formats.

**Approach:** Add three pieces:
- the format registry in `rendering/domain/formats.ts`;
- the versioned `CaseStudyDocument` zod schema with `upgrade(doc)` in `generation/domain`;
- the `revision` table owned by `case-study`.

`case-study` gets the subject-based reads `getLiveRevision` / `getEditableRevision`, plus one write that creates a working revision and moves the head pointer by compare-and-set. All later writers use that write.

## Boundaries & Constraints

**Always:**
- **The format registry** lists exactly three formats and is the only list of formats anywhere. No type has a canvas-ratio field. Each entry has `id`, `name`, `ratio`, `pixelSize`, `pageModel` (`pages` | `slides`), `fileType` (`pdf` | `zip_png`) and `static: true`:
  - `deck_16_9`: "Deck 16:9", 1920×1080, PDF;
  - `social_carousel_4_5`: "Carosello social 4:5", 1080×1350, ZIP of PNGs;
  - `pdf_a4`: "PDF A4", A4 portrait (2480×3508 at 300 dpi), PDF.
- **The document schema**, `CaseStudyDocument`, has `schemaVersion: 1`, `kind` (`case_history` | `client_intro`) and `template: "{id}@{version}"`.
  - **The shared part** holds `blocks` (and `selectedMedia: assetId[]`). Each block has:
    - a stable `blockId` (uuid) and a `section`;
    - `text`;
    - `claims[]`, each with `claimId`, `text`, `aspect` (`technical` | `graphic`), `provenance` (`generated` | `human_edited` | `human_added`) and optional `sourceRefs: MaterialRef[]`;
    - `check: { by, at, textHash } | null`.
  - **`formats`** is a record keyed by registry id, each entry with `variant`, `slots: Record<slotId, assetId | null>`, `spacing`, `textScale` and `fontPairing`.
  - **Section rules:**
    - for `case_history`, the first three sections must be `challenge`, `approach` and `result`, in that order, each exactly once;
    - other sections (e.g. `title`, `subtitle`) may follow;
    - `client_intro` skips the rule.
  - **No client values:** the document holds no client values at all (no About block, no logo, name, industries or description).
  - **`upgrade(doc)`** takes any known older version to the current one. A v0 fixture is defined and tested. An unknown or newer version fails with `DOCUMENT_SCHEMA_UNSUPPORTED`.
- **The `revision` table** (owned by `case-study`):
  - **Columns:**
    - `id`;
    - `case_id` and `client_intro_id`, both nullable, with a check that exactly one is set (`client_intro_id` stays null and gets no FK until 3.9);
    - `status` (`working` | `approved` | `superseded`), `version` int (default 0);
    - `generated_doc` and `doc` jsonb, `manifest` jsonb;
    - `model`, `fell_back` bool, `prompt_version`, `schema_version` int;
    - `created_by`, `created_at`, `updated_at`.
  - **Guards:** a trigger rejects any change to `generated_doc`, `case_id`, `client_intro_id` or `created_*` after insert. RLS is on, there is no access for anon or authenticated, the service role can only read, and writes go through security-definer functions.
  - **Pointers:** FKs from `case_study.head_revision_id`, `approved_revision_id` and `case_event.revision_id` to `revision`.
- **`createWorkingRevision`** — `create_working_revision(p_case_id, p_doc, p_manifest, p_meta, p_expected_head_version, p_actor_id)`:
  - it validates nothing in SQL beyond the shape checks; zod validates `doc` in TS before the call;
  - it inserts with `generated_doc = doc`, status `working`;
  - it sets `head_revision_id` and increments `head_version` only if `head_version = p_expected_head_version`, otherwise raising `STALE_HEAD` and writing nothing;
  - it marks the previous head `superseded` if it was `working`;
  - it writes one `revision_created` case event with `revision_id`.
- **Format entries:** a new revision's `formats` keys must equal the registry ids exactly, or `FORMAT_NOT_IN_REVISION` (TS). The helper `requireFormat(revision, formatId)` raises the same code for later operations.
- **The reads** `getLiveRevision({ kind: 'case', id })` (the approved revision, or none) and `getEditableRevision({ kind: 'case', id })` (the head, or none):
  - they return the revision with `doc` and `generatedDoc` passed through `upgrade` on read, never written back;
  - the `client_intro` subject returns `SUBJECT_NOT_SUPPORTED` until 3.9;
  - both skip soft-deleted cases.
- **Module boundaries:** `generation/domain` and `rendering/domain` are pure (zod and `@/shared` only) and safe for web. Their indexes export the schema, `upgrade` and the registry.

**Never:**
- LLM calls, templates, renderers, or any UI.
- Approval, editing `doc`, or `forkHead` (those are Epic 4).
- Client info in documents or the manifest.
- Editing an applied migration, or running `supabase db push`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid doc | case_history with challenge, approach, result + title | Accepted | N/A |
| Missing/out of order | approach before challenge, or no result | Rejected | zod issue naming `blocks` |
| Client intro | kind client_intro without the three | Accepted | N/A |
| Client value | Doc with an `about` block or client name field | Rejected | zod unknown-key error |
| Format set | formats missing `pdf_a4` or with `story_9_16` | Rejected | `FORMAT_NOT_IN_REVISION` |
| v0 doc | Stored v0 on an approved revision | Read upgraded to v1; row unchanged | N/A |
| Future doc | `schemaVersion: 99` | — | `DOCUMENT_SCHEMA_UNSUPPORTED` |
| Create revision | head_version 0, expected 0 | Revision working; head set; head_version 1; event written | N/A |
| Stale head | expected 0, actual 1 | Nothing written | `STALE_HEAD` |
| Change generated_doc | Direct UPDATE | Refused | Trigger error |
| Live read, none approved | Case with only a working head | `null` | N/A |

</frozen-after-approval>

## Code Map

- `src/modules/generation/index.ts` and `src/modules/rendering/index.ts`: placeholders (`export {}`) with only `.gitkeep` folders. The `eslint.config.mjs` `domainImports` rule allows only zod and `@/shared` in `domain/`.
- `src/modules/material/domain/details-form.ts` L81–88: `MATERIAL_REF_KINDS` and `materialRefSchema`. Generation imports `MaterialRef` through `@/modules/material` (`index.ts` exports it). Keep the ref schema in sync; `client_field` comes in 3.6.
- `supabase/migrations/20261009140000_case_study.sql`:
  - L18–21: the pointer columns, with no FKs yet;
  - L32: `case_event.revision_id`;
  - L65–80: the immutable-column trigger pattern.
- `supabase/migrations/20261020120000_material_rendition.sql` L33–35 and L87–88: the read-only plus security-definer write pattern.
- `supabase/migrations/20261012120000_case_study_transition.sql` L10–35: the CAS and event pattern (`STALE_STATUS`).
- `src/modules/case-study/domain/case-study.ts` L311–325 (`caseStudySchema` pointers), `adapters/supabase/case-study-repository.ts` L19 and L64–66: add a revision repository, a revision domain type, and use cases `createWorkingRevision`, `getLiveRevision` and `getEditableRevision` (index exports).
- New migration: `supabase/migrations/20261020160000_case_study_revision.sql`.

## Tasks & Acceptance

**Execution:**
- [x] `rendering/domain/formats.ts` with the registry and `requireFormat`, plus tests.
- [x] `generation/domain/document.ts`: the schema v1, v0 fixture types, `upgrade`, and a `validateNewDocument(doc)` that also checks the format keys. Tests for every matrix row on the schema side.
- [x] The migration (table, checks, trigger, RLS and grants, FKs, `create_working_revision`), with DB tests for the table rows of the matrix plus grants and RLS.
- [x] The case-study revision repository, use cases and index exports, with use-case tests (upgrade on read with no write-back; live versus editable; deleted case; `client_intro` subject).
- [x] `db.types.ts`: commit CI's file on drift.

**Acceptance Criteria:**
- Given `src/app`, when the web-imports test runs, then the generation and rendering indexes are reachable and still pass.
- Given CI, when `check`, `db` and `image` run, then they pass.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all pass.
- `npm run test:db` -- runs in CI only.

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | blind, edge-case | `revision` has no delete or truncate guard, unlike case_study and case_event | medium | patch | Grants only; the pattern exists in the case_study migration. |
| 2 | blind | Nothing in the DB prevents two `working` revisions per case | medium | patch | Only the RPC's supersede step enforces it. |
| 3 | blind | `status` can move in any direction (superseded or approved back to working) | medium | patch | The immutability trigger leaves `status` free. |
| 4 | edge-case, blind | Pointer checks: uppercase ids fail, a mispointed head gets the generic lookup code with no log, and `approvedRevisionId` isn't checked to be approved | medium | patch | `revisions.ts` compares raw strings and doesn't check status. |
| 5 | blind, edge-case | Slot asset ids aren't required to be in `selectedMedia` | low | patch | Direct superRefine. |
| 6 | edge-case | Block text, claims and block counts are unbounded | medium | patch | Documents are stored twice (`doc` and `generated_doc`). |
| 7 | verification-gap | Meta and manifest never go through the real adapter in a test | medium | patch | The fake echoes input; DB tests use raw SQL. |
| 8 | verification-gap | `createWorkingRevision`'s `NOT_FOUND` mapping is untested through the adapter | low | patch | Only raw SQL is tested. |
| 9 | blind | The compare-and-set isn't tested under concurrency | medium | patch | Sequential tests only; helpers exist. |
| 10 | blind | FK columns pointing at `revision` have no indexes | low | patch | Direct DDL. |
| 11 | blind | The `generated_doc` schemaVersion check is never tested alone | low | patch | The test binds the same value to both. |
| 12 | blind | `REVISION_CREATED` and the SQL literal have no drift test | low | patch | Direct test. |
| 13 | blind, edge-case | Doc comments are wrong or incomplete (malformed subject → `INVALID_INPUT`; missing codes; manifest claim; post-commit errors) | low | patch | Direct correction. |
| 14 | edge-case | `expectedHeadVersion` and meta lengths aren't bounded in zod, so DB range and check errors become generic | low | patch | Direct schema bounds. |
| 15 | edge-case | The extra-format-keys error details are unbounded | low | patch | Cap the count. |
| 16 | blind | Unknown actor gives a generic write error | low | reject | Actors come from `getActor`/the system actor only. |
| 17 | edge-case | `recordEvent` can point at another case's revision | low | reject | No caller passes a revision id yet; Epic 4 adds them. |
| 18 | edge-case | Template ref isn't checked against kind | low | reject | Templates arrive in Story 3.4. |
| 19 | blind | Spec and tracker statuses differ | false | reject | Normal workflow states. |
