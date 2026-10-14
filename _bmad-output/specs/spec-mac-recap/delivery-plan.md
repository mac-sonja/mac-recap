# Delivery Plan — MAC Recap MVP

Epics run one after another, in order, never in parallel. Non-dev activities are prerequisites for the epics in the same sprint or the next one. Epic 1 (BMAD setup) is no longer an epic: it is team setup in Sprint 1's non-dev activities.

| Sprint | Due | Epics | Non-dev activities and decisions due |
| --- | --- | --- | --- |
| 1 | 2026-10-14 | Epic 2 — Asset upload (CAP-1, CAP-2, CAP-3) | Team setup: Claude Code with the BMAD method (formerly Epic 1); tool design definition; template wireframes (asset dimensions, formats); data processing logic (OP 2, decided before Sprint 2); what a favourite means for generation (OP 14, decided before Sprint 2); choose the container host |
| 2 | 2026-10-21 | Epic 3 — Graphic case study generation (CAP-4, CAP-5); Epic 4 — Review and approval (CAP-6, CAP-7, CAP-8); Epic 5 — Download and publishing (CAP-9, CAP-10) | Configurator visual design (Bento); account/sales/social user journey (OP 4); graphic template layouts and final case study templates (Epic 3 prerequisites); narrative structure and quality criteria (NFR5); **first guardrail check at the end of Sprint 2**. Decided before Sprint 2: export formats (OP 1), status lifecycle (OP 8), what counts as altering (OP 12). Decided before Epic 5 ships: shareable link access (OP 11) |
| 3 | 2026-10-28 | Epic 6 — Login, users and permissions (CAP-11) | Mockups and assets for case studies; final guardrail check; demo preparation |
| Demo | 2026-10-30 | — | Live run for the CEO against the four criteria in `success-metrics.md` (go / no-go) |

**Schedule risk:** Sprint 2 carries Epics 3–5 and depends on non-dev deliverables due in the same sprint: graphic template layouts and final templates, the narrative structure and quality criteria, and the Bento configurator design. Epic 3 can't start until they land, and a late deliverable delays all three epics.

CAP-12 (lifecycle events) is not an epic of its own. Each epic emits its events as it is built (AD-20).

The first story of Epic 2 scaffolds the app from the architecture spine's starter and pins the versions.

## Epic acceptance (PRD v2)

- **Epic 2:** case study data is in Supabase and files are in Supabase Storage. The owner/designer creates the case by hand, and it gets a unique ID ready for the project-order link. Files are linked to the case, the details form can be filled in, and images and videos can be marked as favourite.
- **Epic 3:** the case is generated from graphic templates. Assets and template design are unchanged. The text follows challenge, approach and result and uses only the uploaded material and form answers. Layouts are generated for the MVP export formats (OP 1). The final template's adaptation rules are applied. With no material, generation is not available.
- **Epic 4:** the dashboard shows cases awaiting review. The configurator follows the Bento design and edits generated text, layout, media and typography. Before approving, the owner/designer checks every claim against the material or form answers. Any owner/designer can approve. Approval moves the case to Approved and makes it available for export and sharing; an unapproved case cannot be exported or shared. An approved case can still be edited and stays approved (staging per conflict A1).
- **Epic 5:** owner/designer and account/sales/social users can export an approved case in the MVP formats and publish it as a shareable link. Only approved cases can be exported or shared. The tool does not post to social channels or the website.
- **Epic 6:** there is a login for each of the three roles. Role permissions are fixed; the admin only assigns users to roles. No role, admin included, has a setting that disables or changes NFR1–NFR7.

## MVP closing activities (non-dev)

- **Guardrail checks.** A first check at the end of Sprint 2, against the pre-login build, leaves time for fixes. The final check runs in Sprint 3, with NFR3 checked again after Epic 6. Both verify that the AI does not alter graphic assets, technical substance or template design, that nothing is generated without material, and that technical content has no hallucinations.
- **Demo preparation.** Select one real past project, ideally one of the seven never published. Clear the confidentiality and NDA status of its material before upload. Prepare the material for the live run. Run a dry run with the creative director and sales, collecting their feedback in person. This replaces v1's pilot test and onboarding; nothing for onboarding or feedback is built in the tool.
- **Demo on October 30.** A live run on one real past project, not a pilot. After a no-go, the team fixes the gaps and presents again on a new date.

## After the MVP (no date)

These start when MAC Productive is ready. None has a date.

- **Epic 7:** connect to MAC Productive via MCP, linking case and project order through the unique ID (Story 7.1), and verify that data from MAC Productive fits the tool's data model (Story 7.2). The "Crea case" button at project close and the case on the project order page belong here.
- **Epic 8:** text-based case studies and whitepapers from project order data, for projects without visual material. The owner/designer generates the whitepaper; account/sales/social users download or share it (Story 8.3).
- **Non-dev:** mockup and asset guidelines that standardise which assets go into case studies.
