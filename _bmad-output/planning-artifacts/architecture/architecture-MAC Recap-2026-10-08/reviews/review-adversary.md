# Adversarial Review: ARCHITECTURE-SPINE.md (MAC Recap MVP)

- **Reviewed:** `ARCHITECTURE-SPINE.md` (draft, 2026-10-08)
- **Method:** For each hole, two units one level down (epics or stories) that each follow every AD to the letter and still build things that don't fit together. Each hole ends with a proposed new or tightened AD rule.
- **Verdict:** **NOT READY: fix before epics are sharded.** The spine handles the module boundaries well (AD-1, AD-5, AD-8, AD-11). It leaves the **revision** underspecified: who owns it, how it is versioned and where its status lives. It also defines no concurrency contract between the configurator, the generation jobs and the export jobs. Epics 3, 4 and 5 all write to or depend on the revision, so they will conflict.

Severity: **Critical** = data loss, leaked client material, or approval or guardrail bypass. **High** = two epics ship code that can't be merged or integrated. **Medium** = rework or a latent bug. **Low** = something to clarify.

---

## H1 — Lifecycle status lives on the case, but export and share links check it on the revision [Critical]

**Unit A, Epic 3 / Story 3.x (generation + approval):** AD-3 says "Only `case-study` changes state" and draws a state machine for the case. The team adds `case_study.status` and `case_study.current_revision_id`. `approve` sets `case_study.status = approved` and marks the revision frozen with `revision.frozen_at`.

**Unit B, Epic 5 / Story 5.1-5.2 (export, share):** AD-3 says "Export and share links accept only the id of an `approved` revision", and AD-13 says "`revisionId` (must be `approved`)". The team asks `case-study.index` "is revision R approved?" and implements that as `case.status === 'approved' && case.currentRevisionId === R`.

**Clash:** After "approved → in_review: edit → new revision", the case is `in_review`, so Unit B's check now **rejects the old approved revision**. AD-3 explicitly says that revision "stays valid for links that already point to it". If another team reads it the other way and checks `revision.frozen_at IS NOT NULL`, then a revision frozen and later superseded can still be exported, which may be what's wanted. Nothing says which. There is also no named owner of the `revision` table. AD-1's module list has no `revision` owner. AD-4 puts the document schema in `generation/domain`, but says writes go "through `case-study`", so `generation` and `case-study` can each claim the table.

**Proposed rule (tighten AD-3):** `case-study` owns the `revision` table. Each revision carries its own `revision.status` ∈ `working|approved|superseded`, and `case_study.status` plus `case_study.current_revision_id` describe only the working head. "Approved revision" always means `revision.status = 'approved'` (an approved revision stays approved after it is superseded), and `case-study.index` exposes `isRevisionApproved(revisionId)` as the only check.

---

## H2 — A configurator edit and a regenerate job overwrite each other [Critical]

**Unit A, Epic 4 (configurator):** AD-4 says "the configurator changes only this document, through `case-study`". The team implements `updateDocument(caseId, patch)`, which loads the current revision, applies the patch and saves it. Status isn't checked because AD-3 only covers *transitions*, and an edit within `in_review` isn't a transition.

**Unit B, Epic 3 / Story 3.x (regenerate):** `in_review → generating: regenerate` enqueues a job (AD-10). The job is idempotent, as AD-10 requires: it rebuilds the whole `CaseStudyDocument` and overwrites the current revision, then fires `job ok`.

**Clash:** A designer clicks Regenerate, then keeps tweaking variants and tokens while the job runs. That takes about a minute with Opus. The job's write replaces the tweaks. Or the tweak lands after the job's write and silently mixes old narrative with new layout state. Two regenerate clicks can also queue two jobs, and the older one can finish last and win. Separately, `generating → draft: job failed` means a failed *regenerate* on a reviewed case drops it back to `draft`, so it loses its review state.

**Proposed rule (new AD-17, document concurrency):** Every revision has a monotonic `version` integer. Every document write (configurator patch or job result) is a compare-and-set on `(revisionId, expectedVersion)` and fails with `STALE_REVISION` on mismatch. Document edits are rejected while the case is `generating`. Regenerate always writes a **new** revision, keeping template, variants, slots and tokens unless the user resets them, and a job's result is accepted only if its `targetRevisionId` is still the case's pending head. Failure returns the case to its pre-job state (`draft` or `in_review`), not always to `draft`.

---

## H3 — `materialId` has no namespace, and material can change under a revision [High]

**Unit A, Epic 2 (upload/text/form):** Assets and text items get uuids, as the IDs convention requires. `context_form` is one row per case (ER: `CASE_STUDY ||--|| CONTEXT_FORM`), so its fields have no ids. Taxonomy terms are global rows with stable `key`s (AD-14). Assets can be deleted or replaced, and nothing forbids it.

**Unit B, Epic 3 (generation):** AD-6 says the LLM gets "form fields, text inputs, asset metadata and taxonomy terms, each with its id", and claims cite `sourceRefs: materialId[]`. The team gives form fields synthetic ids like `form:challenge` and cites terms by `key`. It validates "unknown ids" by querying... whose table? AD-1 forbids reading `material` tables, so it builds its own lookup from the prompt payload.

**Clash:** `materialId[]` is untyped, so Epic 2's validator (uuid-only) and Epic 3's output (`form:challenge`, `term:hospitality`) disagree. Global term ids would let a claim "cite" a term that this case never used. Worse: after approval, a designer deletes asset X in Epic 2. The approved revision's slot assignment and `sourceRefs` now point at a missing row, and its S3 object is gone, unless S3 versioning saves it. The share link (AD-13) renders a broken image, and the reviewer evidence behind NFR2 has disappeared.

**Proposed rule (tighten AD-6, add to AD-8):** A source reference is a typed `MaterialRef = { kind: 'asset'|'text_item'|'form_field'|'term', id }`, with form fields keyed by a fixed field-key enum and terms allowed only if linked to this case. It is resolved only through `material.index.resolveRefs(caseId, refs)`. Assets and text items referenced by any non-working revision are immutable and soft-deleted only (tombstone; S3 objects kept), and generation records a material manifest (ids and content hashes) on the revision.

---

## H4 — The internal print route is either unreachable or a public bypass [Critical]

**Unit A, Epic 5 / Story 5.1 (export job):** AD-9 has Chromium in the worker "loading the internal print route" `print/[revisionId]/[format]`. The worker has no user session, so the team adds the route to the `proxy.ts` allowlist and skips `authorize` because "it's internal".

**Unit B, Epic 6 / Story 6.x (auth):** AD-11 says "every server action and route handler calls `access.authorize`", and AD-12 says after Epic 6 "the only unauthenticated route is `/s/{token}`". The team enforces that, so export jobs start getting 401 and PDF/PNG/PPTX break in prod. If the team keeps Unit A's exemption instead, any revision uuid becomes publicly renderable at `/print/…`, with presigned media and no expiry or revocation. That bypasses AD-13.

**Proposed rule (tighten AD-9/AD-12):** The print route accepts only a single-use render token, minted by `rendering` in the worker per (revisionId, format) with a lifetime of 5 minutes or less and checked by `access` as a `system` actor. Alternatively the worker renders via `page.setContent()` with no network route at all. The print route is not reachable from the public ingress either way.

---

## H5 — Two owners of the `renditions/` S3 prefix and of the `export` row [High]

**Unit A, Epic 2 / Story 2.1 (material):** AD-8's key layout puts `cases/{caseId}/assets/{assetId}/renditions/{name}.{ext}` under the asset, and AD-1 says each module owns its S3 prefixes. `material` generates thumbnails and web-size renditions with sharp on upload confirm, named `thumb`, `web`.

**Unit B, Epic 4/5 (rendering):** AD-5 says the allowed processing is a "fit, crop or resize *defined by the template slot*", which is template knowledge that lives in `rendering`. `rendering` writes slot crops `renditions/{templateId}-{slot}.webp` into the same prefix, because that's the layout AD-8 mandates.

**Clash:** Two modules write into one prefix with clashing name schemes, which breaks AD-1. Cleanup on asset tombstone can't tell whose files are whose. The same pattern applies to exports: the `EXPORT` entity in the ER is claimed by `rendering` (AD-9: "cached per (revisionId, format)") and by `jobs` (the export job records "the outcome"). Two concurrent export requests can create two `export` rows for one (revisionId, format) when there's no unique constraint, and only one of them points at the final S3 object.

**Proposed rule (tighten AD-8/AD-9):** `material` owns `assets/**`, including renditions, and exposes `getRendition(assetId, spec)`, where `spec` is a deterministic fit/crop/resize spec that `rendering` derives from the slot. Renditions are named by the hash of that spec. `rendering` owns the `export` table and `revisions/*/exports/**`, with a unique key on `(revision_id, format)`. The export job only calls `rendering.ensureExport()`, and `jobs` stores only job status.

---

## H6 — The approval gate checks a stale flag, and the worker has no actor [High]

**Unit A, Epic 3 (generation):** AD-6 says the server stores a claim as `unsupported` when refs don't validate. The team stores `claim.status ∈ supported|unsupported` at generation time. `approve` blocks while any claim has `status = 'unsupported'`.

**Unit B, Epic 4 (configurator):** AD-6 says approval is allowed if "the reviewer edits or deletes" unsupported claims. The team makes any text edit of a claim set it `supported` (it was "edited"). Reviewers can also add new claims or rewrite supported ones, and the text then has no source at all while still marked `supported`.

**Clash:** The NFR2 gate becomes "type a space and approve". Rewritten text inherits a stale `supported` flag and old `sourceRefs` that no longer back it. Related: AD-3's `transition(caseId, event, actor)` requires an actor, and the worker fires `job ok` and `job failed` with none. Epic 3 uses the dev `owner_designer` (AD-11). Epic 6 swaps the resolver, and the worker then fails `authorize` or gets a fake human identity in the audit trail.

**Proposed rule (tighten AD-6/AD-11):** Claim support is computed at approve time, not stored. A claim passes only if `resolveRefs` (H3) confirms one or more refs **or** it carries `attestedBy: actorId` set by the reviewer on that exact text hash, and editing the text clears the attestation. AD-11 adds a non-human `system` actor that is allowed only the job events (`job ok`, `job failed`, export completion) and nothing else in the policy matrix.

---

## Further holes (lower severity)

| # | Sev | Hole (two units that clash) | Proposed rule |
| --- | --- | --- | --- |
| H7 | Medium | AD-4 migration functions vs AD-3 frozen revisions: Story X "bump schemaVersion + migrate" writes the migrated jsonb back, which breaks "approved revisions are read-only". Renderers that assume the latest schema then fail on unmigrated frozen rows. | Migrations run on read only (`upgrade(doc) → latestDoc` in `generation/domain`) and are never persisted onto non-working revisions. Renderers always receive the upgraded doc. |
| H8 | Medium | Material edits during `generating`/`in_review`/`approved`: Epic 2 upload doesn't call `transition`, because it isn't a state change. Epic 3 reads live material in the worker, so an upload mid-job either gets included or doesn't, at random. No rule decides whether uploading to an approved case reopens it. | Generation reads a material snapshot taken when the job is enqueued (manifest in the job payload). Material mutations on a case with an `approved` head are allowed and do not transition. They appear only on the next generate. |
| H9 | Medium | AD-15 says a revision pins `templateId@version`, while the repo holds only the current template code. A template refactor in Epic 4 deletes v1, and Epic 5 re-exports or share-links an old approved revision on v1 and crashes. AD-9's export cache doesn't help a format that was never exported. | Template versions are additive: published `{templateId}/v{n}` folders are never deleted or edited, and CI fails if a version referenced by a migration-era fixture is removed. |
| H10 | Medium | AD-11 lets `account_sales_social` "create/revoke share link". Epic 5 implements revoke for any link, and a later story assumes revoke by creator only. There is also no case-level ownership: `PROFILE owns CASE_STUDY`, but the policy is role-only, and the dev actor's fixed id will dangle once real profiles exist. | The policy matrix states resource scope per action (any vs own). The Epic 6 migration reassigns rows owned by the dev actor to a named real profile. |
| H11 | Low | AD-10 says the UI "polls job and case status". Epic 3 polls `job` by jobId, and Epic 4 polls `case.status`. A failed export job doesn't change case status, so the Epic 4 UI never surfaces export errors. | `jobs.index` exposes `getJobsFor(subject)`. The UI reads job status for job outcomes and case status only for the lifecycle. Export failures never change case status. |
| H12 | Low | Job idempotency (AD-10) has no dedupe key. Double-click export or regenerate creates N jobs. | A partial unique index on `job(kind, subject_id, input_hash) WHERE status IN ('queued','running')`. Enqueue is an upsert that returns the existing job. |

---

## What holds up

AD-1's index-only imports, AD-5's guardrails as code, AD-8's S3 layout and presign lifetimes, AD-11's single policy seam with a dev resolver, and AD-13's token entropy and revocation are all well formed. Most holes above come from one missing concept: **a versioned revision entity with an explicit owner, its own status and a concurrency contract.** Adding H1 and H2 as ADs would close or simplify H5-H8 and H11-H12.
