---
title: "Sprint Change Proposal: store files in Supabase Storage instead of AWS S3"
date: 2026-10-14
status: approved
approved: 2026-10-14 (Sonja, product owner)
owner: Sonja (product owner)
scope: moderate
triggers: [S1]
---

> **Addendum (2026-10-14, Story 2.11 review, owner decision C):** the hosted plan caps uploads at 50 MB (a 60 MB PUT returned 413), so the per-file limit is **50 MB** until the organization moves to Pro. Where this proposal says 100 MB / 104857600, read 50 MB / 52428800 for now.

# Sprint Change Proposal: Supabase Storage, 2026-10-14

## 1. Issue summary

| ID | Decision | Conflicts with |
|---|---|---|
| S1 | Project files, renditions and exports are stored in **Supabase Storage** (a private bucket in the same EU Supabase project), not in a separate AWS S3 bucket. | PRD §5 "file storage on an AWS S3 bucket" and PRD Story 2.1 ("AWS S3 storage"), AD-8 (adopted S3), Story 2.7 (bucket, presigned POST, `S3_*` env), deferred-work L91 (bucket and CORS infrastructure), the S3 adapter (#17) |

Trigger: the owner can't set up an AWS account and an S3 bucket with CORS to test uploads. Her previous project worked with Supabase alone. The S3 choice protected nothing the owner needs that Supabase Storage can't also provide: a private bucket, EU data residency, time-limited signed access and server-side limits.

Type: a stakeholder constraint (operability for a non-developer owner). This isn't a defect.

## 2. Impact analysis

- **What stays the same:**
  - The `material` module already reaches storage only through the `ObjectStorage` port (`ports/object-storage.ts`). Only the adapter and its wiring change.
  - The asset table, the use cases (presign → upload → confirm → list → remove) and the 2.7 / 2.9 UI flow stay as they are.
- **What we gain:**
  - No AWS account, no credentials and no CORS rule.
  - The bucket is created by a migration, so CI and every environment get it automatically, and deferred-work L91 is resolved.
  - One vendor and one set of keys (`SUPABASE_*`).
- **What we lose:**
  - **Bucket versioning.** Supabase Storage has none.
    - Mitigation: objects are never deleted by the app. Removing a file is a soft delete in the database (AR18), and the object stays.
  - **`content-length-range` in the signed upload itself.** It is replaced by the bucket's `file_size_limit` (100 MB) and `allowed_mime_types`, which Supabase enforces on every upload, plus the existing server checks at presign and at confirm (HEAD-style metadata check).
- **Epics:**
  - Epic 2: Story 2.7's technical ACs change wording; the behaviour is unchanged. A new **Story 2.11 "Store project files in Supabase Storage"** carries the code change.
  - Epics 3 and 5: renditions and exports use the same bucket and prefixes ("S3" → "storage" wording). Nothing is built yet.
- **Artifacts:**
  - PRD §5 and PRD Story 2.1.
  - AD-8, rewritten.
  - `epics.md`: Story 2.1, Story 2.7 ACs, AR8, and the S3 wording in Epics 3/5.
  - `epic-2-context.md`, `.env.example`, README (env and storage).
  - deferred-work L91 (resolved) and L97 (ListBucket / orphan lifecycle: re-scoped).
- **Code (Story 2.11):**
  1. A migration creates the private bucket `material` with `file_size_limit = 104857600` and the allowlist as `allowed_mime_types`. No public access. Only the service role reads and writes.
  2. A `adapters/supabase/object-storage.ts` adapter:
     - signed upload URL (`createSignedUploadUrl`), which the browser PUTs to
     - object metadata check at confirm (size and type)
     - signed GET valid for ≤ 15 min
  3. The S3 adapter, the `@aws-sdk/*` dependencies and `S3_BUCKET` / `S3_REGION` are removed.
  4. The browser upload helper accepts the signed-upload shape (method, URL and headers, not POST fields).
  5. Tests are updated, and the DB tests run against the bucket in CI.

## 3. Recommended approach

**Direct adjustment: swap the adapter behind the existing port, in one new story (2.11) after the 2.7 UI lands.** The 2.7 UI isn't redone: its upload helper gets the new request shape in 2.11. Effort is about half a day to a day. Risk is low, because the port boundary already exists and is tested.

Rejected alternative: keep S3 and walk the owner through AWS setup. It's heavier to operate and adds a second vendor for no MVP benefit.

## 4. Detailed changes (proposed)

- **PRD §5 (line 151):**
  - OLD: "Dedicated database on Supabase, file storage on an AWS S3 bucket"
  - NEW: "Dedicated Supabase project (EU) for the database and for file storage (a private Supabase Storage bucket)"
- **PRD Story 2.1:** "a Supabase database and AWS S3 storage" becomes "a Supabase database and Supabase Storage"; "Uploaded files are stored on AWS S3" becomes "Uploaded files are stored in a private Supabase Storage bucket".
- **AD-8, rewritten:** "Binaries live only in Supabase Storage, behind signed requests".
  - The bucket `material` is private, in the project's EU region. Its limits are enforced by Supabase: `file_size_limit` 100 MB, plus `allowed_mime_types` from `material/domain/files.ts`.
  - The browser uploads directly to a signed upload URL that the server issues after `authorize`. The server re-checks size and type from the object's metadata at confirm.
  - The 20-file cap, the key layout and soft delete are unchanged.
  - Reads use signed URLs valid for ≤ 15 min.
  - The service role is the only reader and writer.
  - There is no versioning, so objects are never deleted by the app.
  - Prevents: binaries spread across two stores, uploads through the app server, public URLs.
- **`epics.md`:**
  - Story 2.1: storage wording.
  - Story 2.7 ACs: "bucket is private, in the EU, … CORS" becomes the bucket created by migration with limits. "presigned POST with `content-length-range`" becomes "signed upload URL; size and type limits enforced by the bucket and re-checked at confirm". "HEAD-checks" becomes "checks the object's metadata".
  - AR8: same rewrite.
  - Epics 3 and 5: "S3" becomes "storage".
  - **New Story 2.11** "Store project files in Supabase Storage" (team story) with the Code list above as ACs, plus: `check`, `db` and `image` pass, and no `@aws-sdk` import remains.
- **Tracking:**
  - `sprint-status.yaml`: add `2-11-store-project-files-in-supabase-storage: backlog`.
  - deferred-work: L91 resolved by 2.11; L97 re-scoped (orphaned uploads cleanup).
  - `.env.example` and README: drop `S3_*` and the AWS credential note.

## 5. Implementation handoff

**Scope: Moderate.** One new story and wording changes in documents; no replan.

| Role | Responsibility |
|---|---|
| Owner (Sonja) | Approve S1. Connect the Supabase connector so the dev project can be created. |
| PO/Dev (this session) | Apply the doc edits in one docs PR. |
| Developer (`bmad-build`) | Story 2.11, after the 2.7 UI PR merges. |

**Success criteria:**
- With only `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` set, the wizard uploads, lists, favourites and removes files.
- The repo has no AWS dependency.
- CI is green.
