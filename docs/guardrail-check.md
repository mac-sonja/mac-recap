# Guardrail check (Stories 5.8, 6.4, 6.5)

The checklist for the guardrail check before the demo: what the automated suite proves for
each guardrail, what a person still checks by hand, and what is not built yet.

## Run it

```sh
npm run test:guardrails   # one result per guardrail: NFR1, NFR2, NFR3, NFR6, NFR7
npm test                  # the same tests, with everything else (CI runs this)
npm run test:db           # the database tests named below (local Supabase stack)
```

`npm run test:guardrails` runs only the tests whose name holds `NFRn guardrail` and ends
with a table of guardrails, each `passed`, `FAILED` or `NO TEST RAN`; any guardrail that
isn't `passed` fails the run. The files it reads are listed in `test/guardrails/suite.ts`;
`test/guardrails/suite.test.ts` fails when a tagged test sits in a file that isn't listed.

## Each guardrail and its tests

### NFR1: the AI never changes graphic assets, technical substance or template design

| What is proved | Test |
|---|---|
| The case narrative and the client intro output schemas have no asset, layout, template, slot or image field: the AI returns text only | `test/guardrails/nfr1-ai-boundary.test.ts` |
| Only the upload flow writes an original: the browser's PUT to a signed upload URL (case files, client files, client logo), then the confirm action. No other Storage write exists; the server's one material upload refuses every key but a rendition's | `test/guardrails/nfr1-ai-boundary.test.ts`, `src/modules/material/adapters/supabase/object-storage.test.ts` |
| The rendition job never writes the original's key | `src/modules/material/application/make-renditions.test.ts` |
| Renditions only downscale: every spec fits inside without enlarging and has no crop, focal point, filter or watermark; real sharp downscales and never enlarges | `src/modules/material/domain/rendition.test.ts`, `src/modules/material/adapters/sharp/image-processor.test.ts` |

### NFR2: a person checks every claim before approval

The per-block check was removed for the demo (SCP 2026-10-28), so NFR2 is tested as the
approval rules built today.

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

The permission suite itself (`test/permissions.test.ts`, Stories 6.4 and 6.5) runs every
server action for every role through the real `getActor` and `authorize`: allowed past the
policy, denied 403; no session, no profile, a disabled profile or the system profile 401. It
finds every `"use server"` file under `src/app` on disk (except the sign-in actions in
`(auth)`) and fails, naming it, on any file or export missing from its list. For intros,
client packs and collections it also proves that account/sales/social edits a collection's
text, pages and order through the collection only (no revision, intro, case or client
write), can't edit a client or an intro, and sees on Clienti only the clients with an
approved case.

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
| A collection's own text edits never write the original case, revision, client or intro | `test/db/collection.db.test.ts` (`npm run test:db`) |

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

- **Share links and `/s/{token}`** (Stories 5.5 to 5.7): after the demo (2026-11-03). Their
  NFR7 checks (no link without an approved revision; never a working or superseded revision
  served) are not tested because nothing exists to test.
- **The per-block check** (Story 4.7): removed for the demo (SCP 2026-10-28). NFR2 is
  tested as the approval rules above.
- **The signed-in database run** (B9 part 2): the permission matrix against the local
  database, with a signed-in test user per role. Today the suite runs the real actor
  resolver and policy with the database adapters stubbed.

## Record

NFR3 re-checked after Epic 6 (login, users and roles): `npm run test:guardrails` and the
permission suite pass on the post-login build, 2026-11-11. The manual checks above are still
to run before the demo.
