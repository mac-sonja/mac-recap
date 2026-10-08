# Delivery Plan — MAC Recap MVP

Epics run one after another, in order, never in parallel. Non-dev activities are prerequisites for the epics in the same sprint or the next one.

| Sprint | Due | Epics | Non-dev prerequisites |
| --- | --- | --- | --- |
| 1 | 2026-10-14 | Epic 2 — Asset upload and tagging (CAP-1, CAP-2, CAP-3) | Tool design definition; template wireframes (asset dimensions, formats); data processing logic; taxonomy values (Q2); choose the container host |
| 2 | 2026-10-21 | Epic 3 — Graphic generation (CAP-4, CAP-5); Epic 4 — Review and approval (CAP-6, CAP-7, CAP-8); Epic 5 — Download and share link (CAP-9, CAP-10) | Configurator visual design (Bento); account/sales user journey; final case study templates; narrative structure and quality criteria (Q3); export format list (Q1); default share-link access (Q5) |
| 3 | 2026-10-28 | Epic 6 — Login, users and permissions (CAP-11) | Mockups and assets for the demo case; guardrail check; demo dry run and onboarding of the creative director, sales and other roles involved |
| Demo | 2026-10-30 | — | Presentation to the CEO (go / no-go) |

**Schedule risk:** Sprint 2 carries Epics 3–5 and depends on non-dev deliverables due in the same sprint: final templates, narrative and quality criteria, and the Bento configurator design. A late deliverable delays all three epics.

CAP-12 (lifecycle events) is not an epic of its own. Each epic emits its events as it is built (AD-20).

Epic 1 (BMAD setup) is done and is not product scope. The first story of Epic 2 scaffolds the app from the architecture spine's starter and pins the versions.

## Epic acceptance carried from PRD v1

- **Epic 2:** case study data is in Supabase and files are in S3. Every case gets a unique ID on creation. Uploaded material is linked to its case. Tags, properties and flags are saved for each deliverable.
- **Epic 3:** the case is generated from graphic templates. Assets and template design are unchanged. The text follows challenge, approach and result. The adaptation rules of the final template are applied.
- **Epic 4:** the dashboard shows cases awaiting review. The configurator follows the Bento design. Approval moves the case to Approvato and makes it available for download.
- **Epic 5:** only approved cases can be exported. An approved case can be published as a share link.
- **Epic 6:** there is a login for each role. The admin manages roles and users. No role, admin included, can view or change the guardrails.

## Sprint 3 closing activities

- **Guardrail check:** confirm the AI does not alter assets, technical substance or template design, and check the technical content for hallucinations.
- **Demo dry run:** a trial with the creative director, sales and the other roles involved, collecting feedback for the next steps. October 30 is a demo on prepared material from a real past project, not a live pilot.

## After the MVP (no date)

Once MAC Productive is ready:
- **Epic 7:** connect to MAC Productive via MCP, linking case and project order through the unique ID. Closing a project order offers a "Crea case" button that pulls in technical information and the brief, and the finished case appears on the project order page.
- **Epic 8:** text-only case studies and whitepapers built from project order data, for projects without visual material.
- **Non-dev:** mockup and asset guidelines that standardise which assets go into case studies.
