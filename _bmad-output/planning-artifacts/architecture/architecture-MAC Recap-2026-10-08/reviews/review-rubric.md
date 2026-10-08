---
title: 'Rubric review — MAC Recap MVP architecture spine'
reviewed: 'ARCHITECTURE-SPINE.md (status: draft, 2026-10-08)'
date: '2026-10-08'
lens: 'good-spine checklist, feature altitude (governs Epics 2-6)'
verdict: 'pass with fixes'
---

# Rubric review — MAC Recap MVP architecture spine

## Verdict

**Pass with fixes.** The spine is strong. It covers module boundaries, a single lifecycle owner, a canonical document, guardrails written as code, async jobs, an auth seam from day one and a pre-login gate, and most Rules are concrete enough to check in code review. But two divergence points are still open and will cause rework between epics: (1) how the worker's Chromium reaches the print route and how that route is authenticated, and (2) whether status lives on the case or on the revision. The job queue as written also can't run on Supabase as specified, and nothing recovers jobs stranded by a crash. Fix those three before Epic 3 starts. The other items are medium or low.

## Checklist scorecard

| Criterion | Result | Notes |
| --- | --- | --- |
| Fixes the real divergence points for Epics 2-6, misses none | Partial | Misses: print-route auth and topology (F1), case vs revision status (F2), material mutability after it is referenced (F4), video handling (F4), rendition job kind (F4) |
| Every AD's Rule is enforceable and prevents its divergence | Mostly | AD-3 is ambiguous (F2). AD-10 "must be idempotent" is a wish, not a rule (F3). AD-8's "checked on the server" can't be enforced with a presigned PUT (F5) |
| Nothing under Deferred can let two units diverge | Pass | Q1, Q2, Q5 and notifications are absorbed by registry, table and schema seams. The container host deferral is safe only if F1 is fixed with `setContent`; otherwise the host choice decides worker-to-web networking |
| Every dimension the altitude owns is decided, deferred or open | Partial | Deployment and environments: decided. Provider: deferred with a deadline. Security: mostly decided. Gaps: deploy/migration pipeline, Anthropic as a processor of client material, S3 CORS, the service-role key (F5) |
| Not over-engineered for a 3-week solo MVP | Mostly | Nine modules, each with a full ports-and-adapters layout, is heavy. AD-2 is close to obvious (F6) |
| Mermaid diagrams valid | Pass (manual check) | All five diagrams parse by inspection; no mermaid CLI was available. The deployment diagram is missing an edge (F1) |

## Findings

### F1 — High — The print route has no auth decision, and the diagram is missing the worker-to-web edge

**Where:** AD-9, AD-12, AD-13, Structural Seed deployment diagram, `src/app/print/[revisionId]/[format]`.

AD-9 has the worker's Chromium load "the internal print route". That route lives in the web app. As a result:

- The worker must reach `web` over HTTP. The deployment diagram has no `WK --> WEB` edge, and the host deferral doesn't mention this dependency.
- Before Epic 6 the route sits behind the `proxy.ts` basic-auth gate (AD-12), so Chromium needs those credentials. After Epic 6, AD-12 says the only unauthenticated route is `/s/{token}`, so the print route must authenticate somehow. A Chromium session has no Supabase cookie. If nothing is decided, Epic 3 (preview) and Epic 5 (export) will each make up their own approach, or the route ships open as `print/{revisionId}` and serves any revision to anyone who has a uuid.

**Fix (pick one and write it into AD-9):**
- *Preferred, simplest:* drop the print route. The worker calls `renderToStaticMarkup(renderer(document, template, presignedAssetUrls))` and passes the result to `page.setContent(html)` with an inline stylesheet. This removes the worker-to-web hop, the auth question and a public surface.
- *Alternative:* the print route requires a render token: an HMAC over `revisionId|format|exp` with a secret from `env.ts`, valid for at most 60 seconds. `proxy.ts` exempts `/print/*` only when the token is valid. Add `WK -->|render token| WEB` to the diagram.

### F2 — High — Lifecycle status is ambiguous between case and revision

**Where:** AD-3, AD-13, AD-11 matrix ("list and view approved").

AD-3 puts one `status` on the case, but approval, freezing and share links all work per revision. "Editing an approved case creates a new revision with status `in_review`" mixes the two. Epic 4 (review) and Epic 5 (listing, export, share) will diverge on these points:

- Is a case being re-edited after approval visible to account/sales/social? If Epic 5 filters on `case.status = 'approved'`, the case disappears while it is re-edited, even though its old approved revision "stays valid".
- Does `regenerate` overwrite the current `in_review` revision or create a new one? If the job fails, `generating --> draft` throws away a reviewable revision.
- What happens to configurator autosaves while a regenerate job is writing the document?

**Fix:** Make the lifecycle explicit in AD-3:
- Each `revision` has `status ∈ draft|generating|in_review|approved|superseded`.
- `case_study` holds `current_revision_id` and `approved_revision_id` (latest approved, nullable). The case status shown in the UI is derived from the current revision.
- `regenerate` always creates a new revision. A failed job returns to the previous state (`in_review` if a revision existed, otherwise `draft`). The configurator writes only to the current revision while it is `in_review`, and the worker writes only to the revision its job created.
- "Approved" listings and the AD-11 matrix read `approved_revision_id IS NOT NULL`.

Update the state diagram to match: `generating --> in_review: job failed (had revision)`. Add the AD-6 guard to the approve transition: `approve [no unsupported claims]`.

### F3 — Medium-high — The job queue as specified won't run on supabase-js and has no crash recovery

**Where:** AD-10, Stack.

- `FOR UPDATE SKIP LOCKED` can't be issued through `@supabase/supabase-js` (PostgREST). The stack lists no Postgres driver, so the worker author will improvise.
- The spine has no lease or timeout. If the worker crashes after claiming a job, the job stays `running` and the case stays `generating`. A stuck case is the most likely failure in the demo week.
- "A job may run more than once, so it must be idempotent" isn't enforceable as written.

**Fix:** Add to AD-10:
1. Claim through a SQL function `claim_job(worker_id)` (migration) called with `supabase.rpc`, or add the `postgres` driver to the Stack with the session-pooler connection string, used only in `jobs/adapters`.
2. Add `locked_until timestamptz` and `max_attempts` (3) to the `job` table. Claiming sets the lease, and expired leases can be reclaimed. When attempts run out, the worker calls `case-study.transition(..., 'job_failed')`.
3. Enforce idempotency with a unique constraint: `revision.job_id UNIQUE` and `export (revision_id, format) UNIQUE`. The worker upserts, and the S3 export key is deterministic (it already is per AD-8).

### F4 — Medium — The material contract is incomplete: mutability after reference, video, renditions

**Where:** AD-4, AD-6, AD-8, AD-9, AD-10, `material`.

- **Mutability.** Approved revisions are frozen, but the material they point to is not. Slot `assetId`s, claim `sourceRefs` and cached exports all reference `asset` and `text_item` rows that Epic 2 code could delete or edit. That would break frozen revisions and share links, and make citations wrong.
- **Video.** The brief includes video uploads and a 1080×1920 social video format. The pipeline is image-only: sharp renditions, Chromium PDF and PNG, and PPTX built from PNGs. Epic 2 (upload) and Epic 3/5 (render) will each guess how video shows up: poster frame, playable only in the HTML link, or excluded.
- **Renditions.** AD-8 defines a `renditions/` key layout, but AD-10 has only `generate` and `export` job kinds. It isn't decided who produces renditions, or when.

**Fix:**
- In AD-8, add: material rows are append-only once uploaded. Deletion is a soft delete (`deleted_at`). Editing a text item creates a new id. S3 originals are never overwritten. Renderers resolve soft-deleted assets for older revisions.
- Add a `rendition` job kind to AD-10, queued on upload confirmation.
- Add a video line to AD-5 and AD-9: the MVP extracts a poster frame (ffmpeg in the worker image, deterministic), and video plays only in `/s/{token}` HTML. Social video export goes under Q1 as deferred.

### F5 — Medium — The operational and security envelope has gaps

**Where:** AD-8, AD-11, Structural Seed (environments), Deferred.

- **Upload limits aren't enforceable as written.** A presigned PUT can't enforce 100 MB or the content type unless `ContentLength` and `ContentType` are signed. A HEAD check after upload allows oversized files and then requires cleanup. Fix: use a presigned POST with the `content-length-range` and `Content-Type` conditions, and state the bucket CORS rule (allowed origins per environment, PUT/POST/GET only).
- **Client material is sent to Anthropic.** Every other store is pinned to the EU, but the Anthropic API is not EU-only. The brief flags NDA clearance for the demo material. Add this as an explicit Open item in AD-7 or Deferred, due before the demo upload: confirm commercial terms (no training on API data) and whether zero data retention is required. Asset bytes already never leave the system (AD-5); say that only text and metadata are sent.
- **Service-role key.** AD-11 implies the server uses the service-role key, because RLS denies `authenticated`. State that it is read only in `env.ts`, imported only by `adapters/`, and never in `proxy.ts` or client bundles.
- **Deploy and migration pipeline is unowned.** Say how `supabase/migrations` reach staging (for example `supabase db push` in CI before the image rolls out) and who runs it. One line is enough, but without it the first staging deploy in Sprint 1 decides it ad hoc.
- The pre-Epic-6 gate (AD-12), the environments line and the backup posture are fine for this altitude.

### F6 — Low — Some structure is heavier than a 3-week solo build needs

**Where:** Design Paradigm, AD-1, AD-2, AD-16.

- A full `domain/application/ports/adapters/index.ts` layout in nine modules is a lot of ceremony for one developer and Claude Code. The real value is the `index.ts` boundary plus vendor SDKs only in adapters. Fix: require ports only where a vendor sits behind them (LLM, object storage, renderer/Chromium, DB). Fold `taxonomy` into `material`. Don't create the `integration` folder until Epic 7; AD-16 already guards the seam as a rule.
- AD-2 is mostly obvious (a database-generated uuid primary key). The real decisions are "only external identifier" and the reserved `project_order_ref`. Keep it but shorten it, or merge it into the IDs convention.
- AD-7 hard-codes SDK parameter names (`output_config.format`, `fallbacks: "default"`). Check them against the pinned SDK version before Epic 3. At this altitude, "structured output validated by the zod schema; refusals are stored as job errors" is enough. The single-constant model id and per-revision `model/promptVersion/schemaVersion` are the parts that prevent divergence.
- Not over-engineered, and worth keeping: AD-5, AD-6, AD-9, AD-11 and AD-12 each prevent a concrete cross-epic failure.

## Mermaid check (manual)

| Diagram | Syntax | Content |
| --- | --- | --- |
| Layer flowchart | Valid (`-.implements.->`, cylinder node) | OK |
| Generation pipeline | Valid | OK; could show the `unsupported` claim path from AD-6 |
| Lifecycle `stateDiagram-v2` | Valid | Needs the F2 changes (failure-from-review path, approve guard) |
| `erDiagram` | Valid | Missing `PROFILE` relations to `REVISION` (approver) and `SHARE_LINK` (`createdBy`); the join tables are implied by `}o--o{` |
| Deployment flowchart | Valid (subgraph title with spaces is accepted) | Missing `WK --> WEB` if the print route stays (F1) |

## Things done well

- AD-11 puts the auth seam in place from day one with a fixed dev actor, so Epic 6 swaps one resolver instead of touching every endpoint.
- AD-6 makes "traceable to uploaded material" enforceable: required `sourceRefs`, server validation, an `unsupported` state and an approval block.
- AD-9's single renderer with a format registry turns open question Q1 into a safe deferral.
- AD-12 directly handles the brief's "real client data before login" risk.
- The Deferred items carry owners and deadlines, and none of them hides a divergence point.
