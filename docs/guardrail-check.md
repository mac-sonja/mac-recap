# Guardrail check (Stories 5.8, 6.4, 6.5)

The checklist for the guardrail check before the demo: what the automated suite proves for
each guardrail, what a person still checks by hand, and what is not built yet.

## Run it

```sh
npm run test:guardrails   # one result per guardrail: NFR1, NFR2, NFR3, NFR6, NFR7
npm test                  # the same tests, with everything else (CI runs this)
npm run test:db           # the database tests named below (local Supabase stack)
```

`npm run test:guardrails` (also a CI step) runs only the tests whose `it`/`describe` title
holds `NFRn guardrail`, plus the suite's own checks, and ends with a table of guardrails,
each `passed`, `FAILED` or `NO TEST RAN`; any line that isn't `passed` fails the run. The
files it reads are listed in `test/guardrails/suite.ts`; `test/guardrails/suite.test.ts`
fails when a tagged title sits in a file that isn't listed.

The rows below marked `npm run test:db` are tagged too but run only against the local
database, with `npm run test:db`: they are not counted in the `test:guardrails` table.
Rows marked `npm test` are untagged tests that run with everything else.

NFR4 (hands-on time) and NFR5 (narrative quality) are not guardrails (they aren't marked
"guardrail" in the PRD) and aren't in this suite: NFR4 is measured by hand on real cases,
NFR5 against the Sprint 2 quality checklist when a real draft is read.

## Each guardrail and its tests

### NFR1: the AI never changes graphic assets, technical substance or template design

| What is proved | Test |
|---|---|
| The case narrative and the client intro output schemas have exactly the allowed fields (per format its texts; each text, its aspect and its cited sources), so no asset, layout, template, slot or image field: the AI returns text only | `test/guardrails/nfr1-ai-boundary.test.ts` |
| Only the upload flow writes an original: the browser's PUT to a signed upload URL (case files, client files, client logo), then the confirm action. A source scan finds exactly five Storage writes in `src`: those three signed upload URLs, the material upload (which refuses every key but a rendition's) and the export upload | `test/guardrails/nfr1-ai-boundary.test.ts`, `src/modules/material/adapters/supabase/object-storage.test.ts` |
| The rendition job never writes the original's key | `src/modules/material/application/make-renditions.test.ts` |
| Renditions only downscale: every spec fits inside without enlarging and has no crop, focal point, filter or watermark; real sharp downscales and never enlarges | `src/modules/material/domain/rendition.test.ts`, `src/modules/material/adapters/sharp/image-processor.test.ts` |

### NFR2: a person checks every claim before approval

The per-block check was removed for the demo by the sprint change proposal of 2026-10-28,
so NFR2 is tested as the approval rules built today.

| What is proved | Test |
|---|---|
| No bulk or automatic approve: the module has `approve` and `approveIntro` only | `test/guardrails/nfr2-approval.test.ts` |
| Each approve has one caller, a server action that takes the actor from the session and authorizes `approve` | `test/guardrails/nfr2-approval.test.ts` |
| The overflow and missing-material checks run before any write, for Approva and Aggiorna la versione approvata, on cases and intros | `test/guardrails/nfr2-approval.test.ts` |
| Nothing leaves Approvato except through its own use cases (fork, update, discard, soft delete) | `test/guardrails/nfr2-approval.test.ts` |

### NFR3: no role changes a guardrail or a permission, admin included

| What is proved | Test |
|---|---|
| The matrix denies `change permissions or guardrails` to every role and to system, on any resource | `test/guardrails/nfr3-no-guardrail-setting.test.ts`, `test/permissions.test.ts` |
| No server action (sign-in included), page or route, environment variable, table, column or database function names a guardrail or permission setting | `test/guardrails/nfr3-no-guardrail-setting.test.ts`, `test/permissions.test.ts` |
| Account/sales/social has no write action outside exports and collections | `test/permissions.test.ts` |
| Every server action, for every role, through the real actor resolver and policy (the role matrix below) | `test/permissions.test.ts` (`npm test`, untagged) |
| **The signed-in proof.** The same matrix end to end with one real signed-in test user per role (owner/designer, admin, account/sales/social) against the local database: every denied action `FORBIDDEN` with no row changed in any `public` table or stored object, every allowed action past the policy, the representative allowed actions run for real, a disabled profile and no session refused (401) | `test/db/permissions.db.test.ts` (`npm run test:db`) |

The role-matrix tests of the permission suite are not tagged: they run in `npm test` (and
CI), not in the `test:guardrails` table. The permission suite (`test/permissions.test.ts`,
Stories 6.4 and 6.5) runs every
server action for every role through the real `getActor` and `authorize`: allowed past the
policy, denied 403; no session, no profile, a disabled profile or the system profile 401. It
finds every `"use server"` file under `src/app` on disk (except the sign-in actions in
`(auth)`) and fails, naming it, on any file or export missing from its list, and on any
inline `"use server"` function under `src/app`. For intros, client packs and collections it
also proves that account/sales/social's collection edits reach the collection's use cases
and call no case-study or material function, that the role can't edit a client or an intro,
and that it sees on Clienti only the clients with an approved case. That the collection's
use cases write no revision, intro, case or client row is proved against the database by
`test/db/collection.db.test.ts` (`npm run test:db`, as an owner/designer) and, as a signed-in
account/sales/social user, by `test/db/permissions.db.test.ts`.

**The signed-in run** (`test/db/permissions.db.test.ts`, `npm run test:db`, tagged
`NFR3 guardrail`; Story 6.4, B9 part 2) is the signed-in proof of NFR3. It reads the same
EXPECTED list as the permission suite (`test/helpers/permission-matrix.ts`), so the two can't
drift, and runs it with nothing of the access path stubbed: one Auth user and profile per role
(owner/designer, admin, account/sales/social), each signed in once per run
(`test/db/global-setup.ts`), resolved by the real `getActor` and checked by the real
`authorize`, against the real modules and tables. For each role it proves:

- every action EXPECTED denies returns 403 `FORBIDDEN`, called with real ids, and a snapshot
  of every `public` table and of the stored objects is the same before and after;
- every action it allows gets past the policy (never 401 or 403);
- `change permissions or guardrails` is denied to the signed-in actor.

On seeded data (a client, an approved case, a draft case, a collection) owner/designer and
admin create and edit a client, create a case, save a case in review and approve it; the admin
opens Organizzazione and changes a job title, which sends anyone else to their landing.
Account/sales/social exports the approved case and the client's pack (an export job is
enqueued, never drawn), is refused every read of the draft, sees on Clienti only the clients
with an approved case, and edits a collection's text with no revision, case, client or intro
row changed. With no session, or with a disabled profile, every action is 401.

### NFR6: no material, nothing generated

| What is proved | Test |
|---|---|
| Generate from the UI fails `NO_MATERIAL` without a file, the details form filled in or not; no job, no transition | `src/app/(tool)/case-studies/actions.test.ts` |
| The worker re-checks: `NO_MATERIAL` with the form filled in and no material, or with the manifest's files removed since | `src/modules/generation/application/generate-case.test.ts` |
| A client intro fails `NO_CLIENT_IMAGES` with fewer than 2 client images, when started and again in the worker | `src/modules/case-study/application/client-intro.test.ts`, `src/modules/generation/application/generate-case.test.ts` |
| The details form is not material in the database (`has_material` false with a filled form) | `test/db/material.db.test.ts` (`npm run test:db`) |

### NFR7: nothing is exported before approval

| What is proved | Test |
|---|---|
| Single-case export, client pack and collection export fail `NOT_APPROVED` without an approved revision, for every role, read live revisions only (never a working one) and enqueue nothing | `test/permissions.test.ts` |
| The export worker re-checks approval before it draws; an intro that isn't approved is left out of a pack | `src/modules/rendering/application/export-handler.test.ts` |
| A collection's own text edits, restores, hidden pages and page orders never write the original case's revision, client or intro (the database rows) | `test/db/collection.db.test.ts` (`npm run test:db`) |

## Manual checks before the demo

- [ ] **Hallucinations in technical content (NFR1, NFR2).** On a real case, generate the
  draft and read every technical claim against the uploaded material and the form: nothing
  invented, nothing changed in substance.
- [ ] **Template design unchanged (NFR1).** Compare the generated pages with the templates
  by eye in every format: same layout, type, colours and image placement; only the texts
  differ.
- [ ] **A first real AI client intro fits its boxes (NFR1).** Generate a client intro with
  the AI on a real client and check that every text fits its box in every format, without
  overflow.

## Not built for the demo

- **Share links and `/s/{token}`** (Stories 5.5 to 5.7): moved to after the demo by owner
  decision of 2026-11-03. Their
  NFR7 checks (no link without an approved revision; never a working or superseded revision
  served) are not tested because nothing exists to test.
- **The per-block check** (Story 4.7): removed for the demo by the sprint change proposal
  of 2026-10-28. NFR2 is
  tested as the approval rules above.

## Record

NFR3 re-checked after Epic 6 (login, users and roles) on 2026-11-11: `npm run
test:guardrails` and the permission suite pass on the post-login build, and the signed-in run
(`test/db/permissions.db.test.ts`) passes against the local database. The manual checks above are still
to run before the demo.
