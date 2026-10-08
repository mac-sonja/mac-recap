# Rubric Review v2: ARCHITECTURE-SPINE.md (MAC Recap MVP)

Reviewed: 2026-10-08, against PRD v2 (final). Rubric: good-spine checklist (divergence coverage, enforceable Rules, safe Deferred, FR/NFR coverage, altitude dimensions, internal consistency, leftovers from v1).

## Verdict

The update is clean. None of the listed v1 leftovers survive, and every FR and NFR has a home. What remains is a handful of divergence points that are still open, mostly around the new "fork an approved case" path, the system actor and the overflow gate. Fix the two Medium items before epics are written.

## 1. Leftover sweep (v1 → v2)

| Old concept | Status in v2 | Notes |
| --- | --- | --- |
| Owner-only approval | Gone | AD-19, the AD-11 matrix, the FR6 map row and A1 all say "any owner/designer". |
| Frozen-revision share links | Gone | AD-13 resolves the current `approved_revision_id` at request time. ERD links SHARE_LINK → CASE_STUDY. AD-20 and the OP 11 row agree. |
| approved → in_review transition | Gone | The state diagram has only `approved → approved`. The OP 8 row says "approved is terminal". |
| PPTX | Consistent | AD-9 says "No PPTX". Deferred lists "Editable PPTX" as post-MVP. They don't contradict each other. |
| Canvas ratio | Gone | AD-4 explicitly says "no canvas-ratio field" and the registry owns the ratio. |
| Visual-asset gate | Gone | AD-6 counts any material item, the pipeline diagram gate matches, and A4 records why it was dropped. |

Small residues:
- **AD-5 Binds** reads "NFR1–NFR7, NFR3". The duplicate NFR3 is cosmetic.
- **Pipeline diagram**: "Configurator edits doc" doesn't show the fork-on-approved path or that edits are blocked during `generating`. Optional.

## 2. Findings

### F1. The fork of an approved case has no concurrency rule (Medium)
AD-17 compare-and-set covers writes to `revision.doc` of a *working* revision. AD-3 and AD-17 say the "first edit on an approved case forks a new working head", but nothing guards the fork itself. Two owner/designers (A5 makes this explicitly possible), or two autosaves from one tab, can each fork from `approved_revision_id`. The result is two `working` revisions, with `head_revision_id` last-writer-wins and the other fork orphaned. "Discard" and "Update approved version" make the same head-pointer move without any stated guard.
**Fix:** make every head-pointer change (fork, discard, update approved, generate success) a compare-and-set on `case_study.head_revision_id` (or on a case `version`). A losing fork returns `STALE_REVISION`. State it in AD-17.

### F2. The system actor's permissions don't cover what jobs do (Medium)
AD-11 says `system` may perform "only job events (`job_ok`, `job_failed`, renditions and exports)", and the matrix gives `system` only "export jobs". But a `generate` job, through `case-study`, creates a new working revision, supersedes the old head and moves the case `generating → in_review`, and rendition jobs write `material` S3 keys. Epic 3 will have to either skip `authorize` in the worker or invent permissions, and both break the AD-11 promise that every route and job goes through one seam. A related gap: `case_event.actor_id` (AD-20) has no profile row for `system`. Either seed a system profile or make `actor_id` nullable with an actor kind.
**Fix:** add matrix rows for `system`: "apply generation result (new revision, job_ok/job_failed)", "produce rendition", "produce export". Also say how `system` is represented in `case_event`.

### F3. A worker crash after the last attempt can leave a case stuck in `generating` (Medium)
AD-10 lists "a case left in `generating` after a worker crash" under Prevents. The Rule makes an expired lease claimable again, but it doesn't say what happens when the lease expires with `attempts = max_attempts`. Nothing then emits `job_failed`, so the case sits in `generating` and every edit is rejected (AD-17). A related case: AD-17 says a generate result "is discarded" when the head moved, but it doesn't say which case transition follows. Today that's unreachable because edits are blocked during `generating`, but a retried duplicate after a lease expiry can hit it.
**Fix:** `jobs_claim()` (or a sweeper) marks jobs whose expired lease has exhausted their attempts as `failed`, and the worker then emits `job_failed` through `case-study.transition`. A discarded generate result emits `job_failed` with code `STALE_BASE`.

### F4. The overflow gate is client-only, and Deferred lets Epic 4 and Epic 5 diverge (Medium)
AD-19 says `approve` "is computed at approve time on the server", but overflow is detected only in the configurator, and the server re-check is Deferred. The spine doesn't say:
- how the server learns about overflow (a client flag can be bypassed or go stale), or
- whether overflow has to be clear for **every** registry format or only the ones the user opened.

"Export all" and per-format share links can then ship an overflowing format nobody looked at. This is a Deferred item that lets two units diverge: Epic 4's UI gate and Epic 5's exports have no shared contract.
**Fix (minimum):** state that approve requires the configurator to have measured every registry format for the head revision and recorded `overflow: false` per format in `doc` (cleared on any text or per-format change, like `check`). The server checks those flags. The worker-side measure stays Deferred.

### F5. New material on an approved case is unreachable (Low)
The matrix allows upload/tag on "any case" and AD-18 says "new material is used only by the next generation", but AD-3 forbids generation from `approved`. On an approved case, material can be added but never used, and the reviewer's drawer will show material the live text never saw. Epics 2 and 4 could diverge on whether upload is enabled after approval.
**Fix:** either block upload on approved cases, or allow `regenerate` on an approved case into a working head (the case stays `approved`, like the edit fork). Then update the state diagram.

### F6. The "Export all" artifact has no identity (Low)
AD-9 says `export` is unique on `(revision_id, format)` and the S3 key is `exports/{format}.{ext}`, but "Export all" is not a registry format. It's "built from exports already rendered", which reads as "skip formats not yet rendered" rather than "ensure all, then zip". Epic 5 implementers will choose differently.
**Fix:** define `all` as a pseudo-format key (or not persisted, streamed on request), and specify that it calls `ensureExport` for every registry format first.

### F7. ERD and capability-map drift (Low)
- The ERD has `CASE_STUDY ||--o{ JOB`, but `job.subject_id` is polymorphic (a case for generate, a revision for export, an asset for rendition).
- PROFILE has no links to SHARE_LINK.createdBy or CASE_EVENT.actor_id.
- `template_variant_state` is absent (fine, it's conditional, but note it).
- In the capability map, NFR7 omits AD-9/AD-10. Export jobs run as `system`, so the approved-revision precondition has to be checked when the job is **enqueued**, by the user's use case. Say so in AD-10 or AD-9.

### F8. The "manage templates" permission has no concrete action (Low)
The AD-11 matrix grants owner/designer "manage templates", but AD-15 makes templates code. The only in-tool template action is the C4-conditional variant on/off. Until C4 is decided, Epic 6 has nothing to bind this row to. Mark it "variant on/off (only if C4)" and note that per-case choices are covered by "edit".

### F9. Module dependency cycle risk (Low)
`case-study` uses `material.index` (the AD-6 gate, `resolveRefs`). `material`, `rendering` and `sharing` must call `case-study` to append `case_event` rows (AD-20), and `material` probably checks that the case exists. AD-1 doesn't forbid the cycle or give a direction.
**Fix:** state the allowed dependency direction, or make `case_event` append a narrow `case-study` port that other modules call without `case-study` depending back on them.

## 3. Coverage check

| Item | Covered | Comment |
| --- | --- | --- |
| FR1 | AD-2 | ok |
| FR2 | AD-8, AD-14, AD-18 | ok. Text types `[ASSUMPTION]`. |
| FR3 | AD-4/5/6/7/10/17 | ok |
| FR4 | AD-15 | ok. Zero-media rule deferred to design (A4). |
| FR5 | AD-3/4/17/19 | ok. Dashboard "awaiting review" vs "approved with unpublished edits" indicator not specified (UX). |
| FR6 | AD-19 | ok |
| FR7 | AD-9/10/11/13 | ok. See F6. |
| FR8 | AD-11/12 | ok. Sign-in method deferred, harmless. |
| NFR1/NFR3 | AD-5/11 | ok |
| NFR2 | AD-19 | ok. Manual, with no auto-verify. |
| NFR4 | AD-10/20 | ok. Measurement is OP 13. |
| NFR5 | AD-6/7 | ok. A3 flags the warning-vs-block choice. |
| NFR6 | AD-6 | ok |
| NFR7 | AD-3/13/19 | ok. See F7 on export-job enqueue. |
| OP table | | **OP 4** (account/sales browse and find) is missing from *Open-point dependencies*. It affects the library and list queries for `account_sales_social`. Add a row. |

## 4. Altitude dimensions (decided / deferred / open)

| Dimension | State |
| --- | --- |
| Module boundaries, data ownership | Decided (AD-1). See F9. |
| Lifecycle / state | Decided (AD-3). See F1, F3, F5. |
| Data model / schema evolution | Decided (AD-4, AD-12 forward-only) |
| Storage, upload limits | Decided (AD-8) |
| Async work | Decided (AD-10). See F3. |
| AuthN/AuthZ | Decided (AD-11). See F2, F8. |
| External exposure pre-login | Decided plus flagged (AD-12, A2) |
| Environments | Decided: local / staging / prod, separate Supabase and bucket |
| Deployment / host | Deferred with a deadline (end of Sprint 1). Ok. |
| Migrations / release order | Decided (staging then prod, migrate before deploy). **Missing:** web/worker version skew. Old jobs' payloads after a deploy need a `payload` version or a drain step. Low. |
| Observability / backups | Deferred with a stated baseline. Ok. |
| Secrets | Decided (env.ts, no `NEXT_PUBLIC_`). Who holds the basic-auth and service-role secrets per environment is unstated. Fine at this altitude. |
| **Third-party data processing** | **Open, not listed.** The spine pins S3 and Supabase to the EU for client confidentiality, but sends client material to the Anthropic API with no statement on region, retention or zero-data-retention. Given the PRD's NDA risk, add this as an open question (owner: PRD owner or legal). AD-5 says "asset bytes never go to an AI transform", but AD-18 leaves open whether image or video bytes go to the LLM as **input**. Say explicitly whether vision input is allowed. |
| Orphan cleanup | Not addressed: a presigned POST with no confirm leaves S3 objects without rows, and soft-deleted assets keep their bytes. A lifecycle rule on unconfirmed keys is enough. Low. |
| Presigned GET expiry on `/s/{token}` | A share page left open longer than 15 minutes loses its media. Low. A UX note or refresh-on-error is enough. |

## 5. Rules: enforceability spot-check

- AD-1, AD-5, AD-11: enforceable by lint (import boundaries) and tests. Consider naming the mechanism (eslint `no-restricted-imports` or dependency-cruiser) so Epic 2 sets it up.
- AD-3: enforceable, with the F1 gap on the head pointer.
- AD-13: enforceable, and it prevents serving working or superseded revisions.
- AD-17: enforceable for doc writes. It doesn't cover fork, discard or update (F1).
- AD-19: check clearing is enforceable on the server. The overflow half isn't (F4).
- AD-20: enforceable. Every listed event has an owner path, once F2 (system actor) and F9 (call direction) are settled.

## 6. Conflicts section

A1–A5 are well formed, each has an owner and an interim rule, and none is stale after the update. A4 correctly records the dropped v1 visual-asset gate.
