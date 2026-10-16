---
title: 'Story 2.14: Client info (description, sector and logo)'
type: 'feature'
created: '2026-10-16'
status: 'in-review'
baseline_commit: 'a6e6eb7be180938c333ae4d4dce76617b7d47c2f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-16.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A client holds only a name and code, so nothing introduces the client in its case histories; Epic 3's About the client block (AD-22) needs a sector, description and logo per client.

**Approach:** One forward migration adds the fields and an append-only `client_logo` table; the Clients dialogs become Add/Edit client with Settore, Descrizione and Logo (signed upload under `clients/{clientId}/logos/`); the client page shows the info; `case-study` exposes `getClientSnapshot(caseId)`.

## Boundaries & Constraints

**Always:** all three fields optional; lengths counted in characters (code points) after trimming, blank stored as `null`; logo PNG/JPEG/WebP, 1 B–5 MB, ≥400 px short side, checked in the browser, at presign (declared) and at confirm (stored size/type plus real dimensions); `client_logo` rows and objects never updated or deleted; every action runs `getActor` + `authorize('manage clients')` first; Italian copy only from `it.ts`; the logo key is built only in a `case-study` adapter.

**Never:** About block, document `about`, job/revision snapshot, LLM input or `client_field` refs (3.3/3.6/3.7); sector as a column, filter or fixed list; SVG logos; a new bucket or bucket-limit change; any client or object delete; editing applied migrations; touching codes, URLs or the Clients table.

**Decision (owner, 2026-10-16):** every logo is shown on a small white tile, on the client page and in the add/edit dialog preview, so dark logos with a transparent background stay visible on the black UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Existing client | migrated client, no info | page shows name and code only, no placeholders; edit dialog fields empty | N/A |
| Add with info | name + sector + description + valid logo | client created with code, then logo uploaded and linked; list shows it | logo step fails after create: client kept, dialog switches to edit mode with inline logo error; Save retries the logo only |
| Description limit | 400 chars (emoji = 1) | saves; counter "400/400" | 401: inline error, no request; direct action → `CLIENT_FIELD_TOO_LONG`, nothing written; DB check backstop |
| Sector limit | 60 / 61 chars | saves / inline error | as above |
| Blank fields | "   " | stored `null` | N/A |
| Logo wrong type | SVG, GIF, PDF | inline "PNG, JPEG o WebP", nothing uploaded | presign/confirm → `CLIENT_LOGO_INVALID` |
| Logo too big/small | >5 MB, or 399 px short side | inline message, nothing uploaded | confirm re-checks; stored object over limits → `CLIENT_LOGO_INVALID`, no row |
| Replace / remove logo | new file or **Rimuovi**, then Save | new `client_logo` row and `logo_id` → it, or `logo_id` null; old row/object stay | upload fails: `logo_id` unchanged |
| Foreign logo id | `logoId` of another client or unknown | refused | `CLIENT_LOGO_INVALID`, nothing written |
| Signed URL fails | storage error on page load | page renders without the logo | logged with clientId only |
| Permissions | account/sales/social, admin | no edit UI | update/presign/confirm → 403 `FORBIDDEN`, nothing written |
| Small screen | <1024 px | info read-only, no **Modifica cliente** | N/A |
| Accessibility | keyboard / screen reader | every control labelled; counter `aria-live="polite"`; errors via `aria-describedby`; logo `alt="Logo {name}"`; Rimuovi reachable; focus trapped and returned | N/A |
| Snapshot | `getClientSnapshot(caseId)` | `{ clientId, name, sector, description, logoId }`, current values | unknown/deleted case → `NOT_FOUND` |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261015120000_case_study_clients_and_codes.sql` -- `create_client`/`rename_client`, lock, P0001 refusals, grants: patterns to copy; never edit.
- `src/modules/case-study/{domain/case-study.ts,ports/client-repository.ts,adapters/supabase/client-repository.ts,adapters/supabase/refusal.ts,application/*-client.ts,index.ts}` -- extend; keep `CaseStudy.client` as `{ id, name, code }`.
- `src/modules/material/adapters/supabase/object-storage.ts`, `application/{presign,confirm}-upload.ts` -- signed-upload/`head`/confirm pattern: copy into `case-study`, never import (module boundary); same bucket `material`.
- `src/app/(wizard)/_lib/upload.ts` -- reuse `uploadFile` as is.
- `src/app/(tool)/clients/{actions.ts,_components/*,[clientId]/page.tsx}`, `src/shared/i18n/it.ts` (`clients.*`) -- extend. No change: `dialog.tsx`, `policy.ts`, Clients table columns/search.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261016140000_case_study_client_info.sql` -- add `client.description`, `sector` (checks: null or trimmed length 1–400 / 1–60), `client_logo` (mime check on the 3 types, `size_bytes` 1–5242880, RLS, revokes, reject update/delete/truncate triggers), `client.logo_id` FK; recreate `create_client(p_name, p_sector, p_description, p_actor_id)`; drop `rename_client`, add `update_client(p_client_id, p_name, p_sector, p_description, p_logo_id, p_actor_id)` keeping name rules and raising `CLIENT_LOGO_INVALID` for a logo of another client; grants to service_role -- AR24.
- [x] `src/modules/case-study/domain/case-study.ts` -- `CLIENT_SECTOR_MAX=60`, `CLIENT_DESCRIPTION_MAX=400`, `LOGO_*` limits/types, `clientInfoSchema`, `updateClientInputSchema`, logo presign/confirm schemas; `Client` gains `sector`, `description`, `logoId`; `ClientDetail = Client & { logoUrl: string | null }` -- single definition.
- [x] `src/modules/case-study/{ports,adapters/supabase}/{client-repository,logo-storage}.ts`, `adapters/logo-key.ts` -- repo `update`, `insertLogo`, snapshot read; storage presign upload/download (≤15 min), `head`, `dimensions` (`sharp`) -- vendor code only in adapters.
- [x] `src/modules/case-study/application/{update-client,request-client-logo-upload,confirm-client-logo-upload,get-client-snapshot}.ts`, edit `create-client.ts`, `get-client.ts`, delete `rename-client.ts`; `index.ts` exports -- confirm inserts the row only after re-checks; Save links it via `updateClient`.
- [x] `src/app/(tool)/clients/actions.ts` -- `updateClient`, `requestClientLogoUpload`, `confirmClientLogoUpload`; `createClient` takes the info.
- [x] `src/app/(tool)/clients/_components/client-dialog.tsx` (rename from `client-name-dialog.tsx`), `edit-client-button.tsx` (from `rename-client-button.tsx`), `clients-table.tsx`, `[clientId]/page.tsx`, `it.ts` -- fields, counter, preview, Rimuovi, browser checks via `createImageBitmap`, info block above the table.
- [x] `test/db/case-study.db.test.ts`, `src/modules/case-study/application/use-cases.test.ts`, `src/app/(tool)/clients/actions.test.ts` and the dialog/page tests -- every matrix row, append-only `client_logo`, `FORBIDDEN`; commit CI's `db.types.ts` on drift.

**Acceptance Criteria:**
- Given the migration has run on mac-recap-dev, when CI `check`, `db` and `image` run, then they pass and `db.types.ts` matches.
- Given a client with a logo, when I replace it, then the previous `client_logo` row and its object still exist and the DB refuses to update or delete that row.
- Given the Clients table, when it loads, then columns and search are unchanged.
- Given the edit dialog, when it opens, then it reads "Il codice {code} non cambia. Le case history già approvate mantengono i dati con cui sono state generate."

## Implementation Notes

- **No `sharp` at confirm.** AD-10 forbids `sharp` in web code (`test/web-imports.test.ts`), and confirm runs in a server action. The real format and pixel size come from a small header reader instead (`case-study/adapters/image-size.ts`: PNG, JPEG, WebP lossy, lossless and extended), tested against `sharp`-encoded images in test code only. A header alone can't vouch for an image, so the reader also needs the format's end (PNG `IEND` chunk, JPEG `FFD9`, WebP RIFF size equal to the byte length), and confirm refuses any side over 8000 px (`LOGO_MAX_SIDE_PX`), so a tiny file can't claim a huge size.
- **Logo URL lifetime.** The client page signs its logo for 10 minutes (`LOGO_URL_TTL_SECONDS`, within AD-8's 15-minute cap). When a link has expired, the tile hides itself on the image's `onError` instead of showing a broken image.
- **White tile token.** The theme clears Tailwind's default colours, so `bg-white` doesn't exist. A `--color-logo-tile` token (`#ffffff`) in `globals.css` backs `bg-logo-tile`, used by `LogoTile` on the client page and in the dialog preview.
- `updateClient` requires `sector`, `description` and `logoId` (each may be null), so a missing key never erases stored data. U+0000 in sector or description is refused as a field error.
- The browser treats an image it can't decode (e.g. WebP on older Safari) as unknown size and leaves the decision to the server. A logo already confirmed when its link failed is only linked again on retry, so no extra `client_logo` row is created.

## Spec Change Log

## Review Triage Log

Note: the 2.14 migration was applied to mac-recap-dev by the implementation run before review, so every fix below avoids editing it.

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | blind | Retry after a failed link re-uploads and leaves a permanent orphan logo row | medium | patch | Dialog keeps `logo.kind === "new"` after confirm succeeds. |
| 2 | blind | A missing sector/description key in `updateClient` erases stored data | medium | patch | Both `.nullish()`; repository writes `?? ""`. |
| 3 | blind, edge-case | Server checks only the image header: truncated bodies pass, no max dimensions | medium | patch | `image-size.ts` reads headers only (sharp is barred from web code by AD-10). |
| 4 | blind | `findSnapshotByCaseId` returns unvalidated rows | low | patch | Other reads go through `clientSchema`; Epic 3 copies the snapshot. |
| 5 | edge-case | DB length refusal lacks `details.fields`, so the dialog shows a generic error | low | patch | Only the TS path sets fields. |
| 6 | edge-case | U+0000 in sector/description fails as a generic write error | low | patch | Postgres rejects NUL in text. |
| 7 | blind | `aria-invalid` on a button; hidden file input duplicates the control name | low | patch | Unsupported attribute; `aria-label` on the hidden input. |
| 8 | edge-case | Older logo pick can overwrite a newer one | low | patch | No sequence check around `createImageBitmap`. |
| 9 | edge-case | Logo buttons work during a save; change silently dropped | low | patch | No `inFlight` guard on Scegli/Sostituisci/Rimuovi. |
| 10 | edge-case | A valid WebP refused where the browser can't decode it | low | patch | Decode failure maps to "unreadable". |
| 11 | edge-case | Presign NOT_FOUND/FORBIDDEN tells the user to retry | low | patch | Falls into `logoFailed`. |
| 12 | edge-case | Expired signed URL shows a broken image | low | patch | 10-minute TTL, no `onError`. |
| 13 | blind | `findLogo` failure log has no `clientId` | low | patch | Other new logs carry it. |
| 14 | verification-gap, blind | Untested: logo-invalid messages, getClient logo lookup failure, double confirm, save-in-progress guards, SQL trimming in `update_client` | low | patch | No such assertions in the suite. |
| 15 | blind | Spec tasks unticked; sharp deviation, TTL and tile token unrecorded | low | patch | Implementation Notes empty. |
| 16 | blind | No edit trail for client info; foreign logo only blocked in the function | low | defer | Needs a new migration; service-role only today. |
| 17 | blind | Counter announced on every keystroke | false | reject | The spec asks for `aria-live="polite"` on the counter. |
| 18 | blind | Character counting duplicated; name counted differently | low | reject | Name rule is from 2.13; no user-visible divergence named. |
| 19 | blind | `getClient` makes three round trips | low | reject | One client page view; not a hot path. |
| 20 | blind | Spec in review, tracker in progress | false | reject | Normal workflow states. |

## Design Notes

Save order: save fields → (new file) presign → PUT → confirm (returns `logoId`) → `updateClient` with it; on add the key needs the new client id. The bucket's 50 MB limit is bucket-wide, so the 5 MB cap is the app's; a rejected object stays orphaned, harmlessly.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- all pass.
- CI `db` job -- green; on drift, `gh run download <run> -n db-types` and commit.

**Manual checks:**
- Apply to **mac-recap-dev** only (`npx supabase db push`); in the Browser pane add a client with all fields, replace and remove the logo, try 401 characters, a GIF and a 300 px PNG, and check the page at 900 px.
