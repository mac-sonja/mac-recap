---
title: "MAC Recap – PRD v2 Addendum"
created: 2026-10-08
updated: 2026-10-08
---

# MAC Recap – PRD v2 Addendum

Detail for UX and architecture that doesn't belong in the PRD itself. The full slide-by-slide extraction of the A3 deck is in `reconcile-a3-deck.md` in this folder. The brief addendum (`_bmad-output/planning-artifacts/briefs/brief-MAC-Recap-2026-10-08/addendum.md`) has the baseline data, the AS-IS process and the countermeasures matrix.

## UI detail from the A3 sketches (slides 15-23)

These are design sketches, not decisions. In the standalone MVP, the steps that run inside MAC Productive drop out. The owner/designer starts from the "+ New case study" button in the dashboard.

- **Creation wizard:** three steps, Materials → Details → Generate. Generation runs in the background, and the owner is notified when the draft is ready.
- **Upload:** drag and drop or browse. Up to 20 files, 100 MB each. Suggested inputs: strategic decks, summary documents, impact metrics.
- **Details form:** the "Context & background" section has 4 fields. Two are visible on the slide: business context and the solution. The other two, and any later sections, are cut off.
- **Dashboard:** search by project or client. Filter by status. Columns: project ID, name, client, year, status. An "awaiting approval" queue shows a count.
- **Configurator:** a channel and format picker, shuffle layout, replace media, 10 layout template variants, canvas ratio (16:9, 4:5, 1:1), font (Plus Jakarta Sans, Inter Sans, Editorial Serif), outer padding and box gap sliders, save draft, approve, and a version number with autosave.
- **Export screen:** a preview with a slide pager and zoom, "Assets & resources" and "Version history" tabs, "Export ZIP" and "Export / share".
- **Export formats and sizes:** 16:9 deck 1920×1080 (12 slides); A4 whitepaper 2480×3508; image carousel 1080×1350 (6 slides); square post 1080×1080; social video 1080×1920, looping; LinkedIn cover 1200×675; HD PNG pack; ZIP; share link.

## Inconsistencies in the sketches to settle in UX

- Status names differ between screens: Draft, Processing, Awaiting approval, Approved, Published (PRD open point 8).
- The configurator lists "Social 16:9", but its size is 1080×1920, which is 9:16.
- The configurator offers three canvas ratios, but the export formats also include 9:16 and A4.
- The deck lists "AI guardrails" as a high-effort item to test later, but the MVP already depends on AI generation. The PRD makes guardrails NFR1-NFR7 and puts them in the MVP.
