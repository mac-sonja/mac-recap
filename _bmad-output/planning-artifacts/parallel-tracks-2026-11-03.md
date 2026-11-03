# Parallel tracks to the demo (2026-11-03)

The remaining demo stories, split into two tracks that run as two Claude Code sessions
at the same time. The owner reviews and merges for both.

**Scope decisions (owner, 2026-11-03):** share links (5.5, 5.6, 5.7) move to after the
demo, along with the `/s/{token}` page that 6.2 left for 5.6. Drag-and-drop (4.3e) stays in.
Video export was already after the demo.

**Estimate:** each track takes 7–10 working days. With a shared day at the end for
migrations and staging, the demo is about **2–2.5 weeks** away, provided the owner keeps
up with reviewing both tracks.

## Track A: configurator and client pages

Tickets: RECAP-26, RECAP-23, RECAP-70. Main code: `src/app/(wizard)/case-studies/[caseId]/configurator`,
`src/modules/case-study`, `src/modules/rendering/templates`, `src/modules/generation`.

| # | Story | Days | Notes |
|---|---|---|---|
| A1 | 4.3d client and case fields on the page | 0.5–1 | |
| A2 | 4.3e drag-and-drop | 1 | Riskiest piece left: undo/redo, autosave and 4.4b resize. If it drags on, cut it first. |
| A3 | 4.5c-2 upload in the dialog, client media, client-file soft delete | 0.5–1 | |
| A4 | 4.8 Approve | 0.5–1 | Approve needs the overflow cleared and the material present. No per-block check. |
| A5 | 3.8 tell me when the draft is ready | 0.5–1 | The ready toast that 3.11 and 4.11 reuse. |
| A6 | 3.11 client intro and outro with test text | 1 | **Needs the client cover/outro template design (RECAP-70) by about day 4.** Adds a job kind. |
| A7 | 4.11 client intro in the configurator | 1 | After A6. |
| A8 | 4.12 client overview configurator | 1.5–2 | Includes the C38 shared-page confirmation left over from 4.13. |
| A9 | 4.9 edit an approved case | 0.5–1 | Last: Track B's 5.2 touches the same detail page. |

Total: 7–10 days.

## Track B: library, export and collections

Tickets: RECAP-27, RECAP-60. Main code: `src/app/(tool)/library`, `src/app/(tool)/case-studies/[caseId]`,
`src/modules/sharing`, `src/worker`, `src/modules/rendering` (reads it, doesn't change templates).

| # | Story | Days | Notes |
|---|---|---|---|
| B1 | 5.2 the rest (narrow viewports) | 0.5 | Do it first, so Track A's 4.9 gets the detail page afterwards. |
| B2 | 5.1 library of approved case studies | 0.5–1 | Use approved cases already on dev. Doesn't wait for 4.8. |
| B3 | 5.3 export a format as a file (Presentazione PDF, Carosello PNGs) | 1–2 | Biggest unknown: rendering on the worker. Adds a job kind. Also builds the export dialog. |
| B4 | 5.4 several formats as one ZIP | 0.5 | Through the same dialog. No Export all button. |
| B5 | 5.9 combined export and client pack | 1 | **Needs A6 (client intro/outro) merged.** |
| B6 | 5.10 collections | 1.5 | |
| B7 | 5.11 edit texts and remove pages in a collection | 1 | |
| B8 | 3.9 AI client intro draft | 0.5–1 | After A6. Uses only the generation module, so it stays clear of the configurator. |
| B9 | 5.8 guardrail suite, the rest of 6.4, 6.5 permission checks | 1 | Last: needs every action from both tracks. |

Total: 7–10 days.

## Shared last day

- Apply every unapplied migration to staging, starting with `20261029120000_case_study_save_revision_doc`, which isn't on mac-recap-dev either.
- Run the guardrail and permission suites against staging.
- Prod waits on IR-HOST.

## Sync points

| When | What | If it slips |
|---|---|---|
| About day 4 | Client cover/outro template design ready for A6 | A does A9 (4.9) early. B does B6 and B7 before B5 and adds client pages to collections afterwards. |
| About day 5 | A6 merged → B5 and B8 can start | Same as above. |
| B1 merged | Track A can touch the approved-case detail page (A9) | A9 waits. It's last anyway. |
| End | Both tracks merged → B9 | None. B9 is the gate. |

## Files both tracks touch

Merge small PRs and rebase daily. Rules for the hotspots:

- **`src/shared/i18n/it.ts`**: add strings only in your own feature's section, never by reordering. Fix conflicts by keeping both sides.
- **`supabase/migrations/`**: filenames are timestamps, so they don't collide. **`src/shared/db.types.ts`**: never merge it by hand. Rebase, apply the migrations, then run `npm run db:types`.
- **Job kinds**: A6 (client draft) and B3 (export) each add a kind in `src/modules/jobs/domain/job.ts` and a handler in `src/worker/run.ts` (`workerHandlers`). Expect a one-line conflict in each. Keep both.
- **`test/permissions.test.ts`**: each track adds rows for its own new actions. B9 does the full pass.
- **`src/modules/rendering/templates`**: only Track A changes templates and `hashes.json`. Track B calls the renderer and doesn't edit templates.
- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: each session edits only its own story lines.
