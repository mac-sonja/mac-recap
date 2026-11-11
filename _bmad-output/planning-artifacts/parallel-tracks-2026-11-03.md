# Parallel tracks to the demo

Started 2026-11-03, last updated 2026-11-11.

The remaining demo stories, run as two Claude Code sessions at the same time. The owner reviews and merges for both. **Keep the Status column current**: update it in the same pull request that changes a story's status, so any session can use the table to pick its next story.

**Scope decisions (owner, 2026-11-03):** share links (5.5, 5.6, 5.7) move to after the demo, along with the `/s/{token}` page that 6.2 left for 5.6. Drag-and-drop (4.3e) stays in. Video export was already after the demo.

## All stories

Status: ✅ merged · 🔄 in progress or in review · ⏸ blocked · ⬜ to do.

| # | Story | Status | Waits for | Overlaps with (same files) | Main code |
|---|---|---|---|---|---|
| A1 | 4.3d client and case fields on the page | ✅ #145 (migration on dev) | — | — | configurator, case-study |
| A2 | 4.3e drag-and-drop | ✅ #147 | A1 ✅ | A3, B7 | configurator |
| A3 | 4.5c-2 client media in the case configurator, client renditions, client-file soft delete (dialog upload split to 4.5c-3) | ✅ #148 (migration on dev) | — | A2 | configurator, material |
| A4 | 4.8 Approva | ✅ #143 (migration on dev) | — | — | configurator, case-study |
| A5 | 3.8 tell me when the draft is ready | ✅ #150 | — | — | jobs, notifications |
| A6 | 3.11 client intro and outro with test text | ✅ #155 (migration on the mac-recap project 2026-11-06); started 2026-11-06 with a placeholder client template (owner); the cover/outro design replaces only the template later | — | B3 (both add a job kind) | rendering/templates, jobs, migration |
| A7 | 4.11 client intro in the configurator | ✅ #156 (4.11a), #157 (4.11b) (migrations on the mac-recap project 2026-11-10) | A6 | B6, B7 | configurator (client mode) |
| A8 | 4.12 client overview configurator, incl. the C38 shared-page confirmation | ✅ #158 (4.12a), #159 (4.12b) (migration on the mac-recap project 2026-11-10) | A7 | B6, B7 | configurator (client file) |
| A9 | 4.9 edit an approved case | ✅ #152 (migration on dev) | A4 ✅, B1 | B1 | approved-case page, case-study |
| B1 | 5.2 the rest: narrow viewports | ✅ #146 | — | A9 | `(tool)/case-studies/[caseId]` |
| B2 | 5.1 library of approved case studies | ✅ #149 | A4 ✅ | — | `(tool)/library` |
| B3 | 5.3 export a format as a file (Presentazione PDF, Carosello PNGs) | ✅ #151 (migration on dev) | — | A6 (job kind) | worker, rendering (read only), export dialog |
| B4 | 5.4 several formats as one ZIP | ✅ #153 (migration on dev) | B3 | — | export dialog, worker |
| B5 | 5.9 combined export and client pack | 🔄 5.9a ✅ #160 (no migration); 5.9b (read-only Clienti for account/sales/social) to do | B4, **A6, A8** (pack follows 4.12's case order) | — | export, client page |
| B6 | 5.10 collections | ✅ #161 (5.10a), #162 (5.10b) (migrations on the mac-recap project) | B5, **A8** (collections open the configurator) | A7, A8 | collections, configurator (collection mode) |
| B7 | 5.11 edit texts and remove pages in a collection | 🔄 5.11a (edit texts, hide and reorder pages on the collection page) built and reviewed, PR next; 5.11b (exports apply the edits) to do | B6 | A2, A7, A8 | configurator (collection mode) |
| B8 | 3.9 AI client intro draft | ⬜ | A6 | — | generation |
| B9 | 5.8 guardrail suite, the rest of 6.4, 6.5 permission checks | ⬜ | every other story | — | `test/` |

A and B only say where a story started in the plan. **Any session can take any story once its "Waits for" stories are merged.**

## Which story to start next

When a session finishes a story, or when you open a new one:

1. Take the **first ⬜ story in the table whose "Waits for" stories are all ✅**.
2. Skip it if another session is working on a story it **overlaps** with, and take the next one. Two sessions on overlapping stories means merge conflicts in the same files.
3. Mark it 🔄 in this table, in the story's first commit.

**As of 2026-11-11:** A6, A7, A8 and B6 merged; B5 part 1 merged; every migration on the mac-recap project. Open: B7 (5.11, edit inside a collection; decide its base: the separate collection view or the editing Configurator), 5.9b (read-only Clienti for account/sales/social), B8 (3.9 AI client intro); B9 last.

To start a story in a new session, open Claude Code on `main` and say: "Start story <#> (<story>) from `_bmad-output/planning-artifacts/parallel-tracks-2026-11-03.md`; run `bmad-build`."

## Estimate

About 7–10 working days per session, plus a shared last day for migrations and staging: about **2–2.5 weeks** to the demo, if the owner keeps up with reviews. The critical path is A6 → A7 → A8 → B5 → B6 → B7. It starts with the client cover/outro design, so that design is the most important thing to unblock.

## Shared last day

- Apply every migration not yet on staging, then run the guardrail and permission suites against staging.
- Prod waits on IR-HOST.

## Files every session touches

Merge small PRs and rebase daily. Rules for the hotspots:

- **`src/shared/i18n/it.ts`**: add strings only in your own feature's section, never by reordering. Fix conflicts by keeping both sides.
- **`supabase/migrations/`**: filenames are timestamps, so they don't collide. **`src/shared/db.types.ts`**: never merge it by hand. Rebase, apply the migrations, then run `npm run db:types`. Apply a migration to mac-recap-dev only after green CI and the owner's agreement.
- **Job kinds**: A6 and B3 each add a kind in `src/modules/jobs/domain/job.ts` and a handler in `src/worker/run.ts` (`workerHandlers`). Expect a one-line conflict in each. Keep both.
- **`test/permissions.test.ts`**: each story adds rows for its own new actions. B9 does the full pass.
- **`src/modules/rendering/templates`**: only A6 changes templates and `hashes.json`. Every other story calls the renderer and doesn't edit templates.
- **`_bmad-output/implementation-artifacts/sprint-status.yaml`** and this table: each session edits only its own story's lines.
