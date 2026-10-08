# Review polish – PRD v2 and addendum

Oct 8, 2026 · bmad-review, lenses structure then prose, run on `prd.md` (3,947 words) and `addendum.md` (468 words).

**Reader read.** The PRD exists to help the MAC team, design and dev agents build and demo the standalone MAC Recap MVP by October 30. The addendum gives UX and architecture the sketch-level detail the PRD leaves out.

**Structure model.** Requirements/spec document: context → roles and terms → FR/NFR → plan → epics → scope, risks, open points. Both documents already follow this model. No sections were cut, merged or moved. Word count change is negligible (about +5 words net).

**Limits applied.** Meaning, decisions, scope, numbers, dates and every FR/NFR/Epic/Story/open-point ID and number are unchanged. Retired items (struck-through Epic 1, open point 5 "Merged into point 1") are unchanged. YAML frontmatter is unchanged.

## prd.md – applied (17)

| # | Pass | Location | Original | Revised | Why |
|---|---|---|---|---|---|
| 1 | prose | §1 Goals | the owner's time | the owner/designer's time | Role term from §2 |
| 2 | prose | §1.1 demo criteria | the owner's hands-on time (NFR4) | the owner/designer's hands-on time (NFR4) | Role term |
| 3 | prose | §1.1 8-week measures | Average owner time | Average owner/designer time | Role term |
| 4 | prose | §1.1 Counter-metric | Owner time must not fall | Owner/designer time must not fall | Role term |
| 5 | prose | NFR4 | The owner's hands-on time | The owner/designer's hands-on time | Role term |
| 6 | prose | §10 automatic trigger | Owners start case studies manually. | The owner/designer starts case studies manually. | Role term |
| 7 | prose | §11 root cause | nothing prompts the owner to start | nothing prompts the owner/designer to start | Role term. "process owner" kept: a different concept |
| 8 | prose | §11 missing material | the owner has to produce them | the owner/designer has to produce them | Role term |
| 9 | prose | Open point 13 | How owner time … during validation. To be decided. | How owner/designer time … during validation. | Role term; cut filler (every open point is undecided) |
| 10 | prose | FR2 | a short form on context, solution and results | a short details form on context, solution and results | Uses the "details form" name that §2.1 and NFR6 use |
| 11 | prose | Story 2.3 | fill in the form on context… | fill in the details form on context… | Same |
| 12 | prose | §7 Epic 4 summary | the configurator and dashboard | the configurator and review dashboard | §2.1 term |
| 13 | prose | Story 5.1 | export the final material of an approved case study | export an approved case study as files | "Material" is defined in §2.1 as uploaded input, not output. Wording now matches FR7 |
| 14 | prose | §10 bullet 2 | Text-only case studies and whitepapers | Text-based case studies and whitepapers | Same term as FR10, Epic 8 and Changes from v1 |
| 15 | structure | §10 bullet 4 | **Collecting and tagging material during the project,** and mockup and asset guidelines. | Split into two bold-lead bullets: **Collecting and tagging material during the project.** / **Mockup and asset guidelines.** | Two separate items shared one bold lead-in; the second was hidden |
| 16 | structure | §6 Sprint 3 non-dev | guardrail check | final guardrail check | Matches Sprint 2 "first guardrail check" and the §8 "Final guardrail check" heading |
| 17 | prose | §11 risk 3 lead-in | Real client data is used before login exists. | Real client material is used before login exists. | §2.1 term; matches §5 "real client material" |

## addendum.md – applied (5)

| # | Pass | Location | Original | Revised | Why |
|---|---|---|---|---|---|
| 1 | prose | UI detail, Creation wizard | the owner is notified | the owner/designer is notified | Role term |
| 2 | prose | UI detail, intro | button in the dashboard | button in the review dashboard | §2.1 term |
| 3 | prose | UI detail, Dashboard | **Dashboard:** | **Review dashboard:** | §2.1 term |
| 4 | prose | UI detail, Export formats | share link | shareable link | §2.1 term. UI labels in quotes ("Export / share") are kept as they appear on the sketches |
| 5 | prose | Inconsistencies, bullet 4 | The deck lists "AI guardrails" | The A3 deck lists "AI guardrails" | "Deck" could also mean the 16:9 deck export format |

## Reviewed and kept (PRESERVE)

- **Repeated "only approved case studies can be exported or shared"** (§2.1, FR7, NFR7, Stories 4.3, 5.1, 5.2). Each copy is an acceptance criterion or a guardrail. Kept as reinforcement.
- **"MVP closing activities" under §8 Epic details.** These are not an epic, but they close the Sprint 3 story and sit next to Epic 6. Moving them would not help the reader.
- **Bold lead-ins end with a period in the PRD and a colon in the addendum.** Each document is consistent with itself. Left as is.
- **Mixed fragments and full sentences in §5 bullets and story criteria.** Matches house style. Left as is.
- **Hyphen ranges (15-20, 1-2, NFR1-NFR7).** Used the same way throughout. Left as is.
- **"Epic 5 – Download and publishing" and "Export" in its stories.** The epic name is an ID-level label. Not renamed.

## Not applied – needs a decision

1. **Open point 13 has no epic and no "decide before" deadline.** Points 4, 7, 10 and 11 also have no deadline. Which epic and date should each one block?
2. **Status wording.** Story 4.1 says "awaiting review", §2.1 says "waiting for review", and the A3 screens say "Awaiting approval". Choosing one depends on open point 8 (status lifecycle).
3. **Story 6.3 says "access to the guardrails". NFR3 says "configure".** Is reading the guardrails also blocked, or only changing them? Aligning the wording would change scope.
4. **"Graphic template layouts" (Epic 3 prerequisite) has no sprint.** §11 already flags this. It needs a sprint or a merge with "final case study templates".
5. **The intro says "FR, NFR and epic numbers are unchanged".** It does not mention story and open-point numbers. Confirm they are also unchanged from v1 before the intro claims it.
6. **§2.1 does not define "owner/designer" or "account/sales/social" as terms.** §2 defines them as roles. Add them to §2.1 only if the team wants one glossary.
