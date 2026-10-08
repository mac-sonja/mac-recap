# Success Metrics — MAC Recap

## Baseline (A3 analysis)

| Measure | Baseline |
| --- | --- |
| Hours to build a case study end to end, including producing material | 24–60 h |
| Layout time per case study | 1–2 h |
| Closed projects publicised externally, last 12 months | 4 of 11 (about 36%) |
| Time from project close to social channels | about 2 months |
| Case studies covering both the technical and the graphic side | 0% |
| Teams affected | 4 (creative, sales, PM, social) |
| Commercial levers lost | 2 (upsell, inbound contacts) |

## October 30 demo (go / no-go, CEO validates)

One real past project, ideally one of the 7 never published, run live on prepared material.

1. Upload to approved case study in at most 20 minutes of owner/designer hands-on time, target 15 (NFR4).
2. The same case study exported in several formats: deck, social carousel, PDF (FR7).
3. The text covers both the technical and the graphic side (NFR5).
4. A person checks during review that every claim traces back to the uploaded material or form answers (NFR2).

The demo is a go only if all four criteria pass. After a no-go, the team fixes the gaps and presents again on a new date.

## 8-week validation (after a go)

Real closed projects run through the standalone tool. MAC closes about one project a month, so the backlog of unpublished past projects also goes through the tool to give a usable sample. Each project's material needs NDA clearance, including Anthropic API processing, before upload.

| Metric | Target | What the tool keeps |
| --- | --- | --- |
| Case studies generated | — | `case_event` (CAP-12) |
| Average owner/designer hands-on time per case | at most 20 min, target 15 (NFR4) | Nothing: the tool does not record hands-on time, and elapsed time between events is not hands-on time |
| Manual editing after generation | tracked, no target | `generated_doc` vs approved `doc`, claim-edit events |
| Hallucinations or guardrail violations that reach an approved case study | 0 | — |
| Hallucinations caught in review | tracked, no target. A high count signals weak generation, not a weak review | claim-edit events (not distinguished from other edits) |

How owner/designer time, editing and hallucinations are recorded during the validation is open point 13.

**Counter-metric.** Owner/designer time must not fall because the review gets shorter. A faster case study that skips the claim check (NFR2) is a failure, not a gain.

## 6-month impact (around March 2027)

| Metric | Baseline |
| --- | --- |
| Share of closed projects with a case study | 4 of 11 (about 36%) |
| Time from project close to first external use | about 2 months |
| Layout hours saved | 1–2 h per case. The 24–60 h total includes producing material, which the MVP does not address. |
| Inbound contacts and upsells attributed to a case study | Attribution method open (OP 10) |

## Known risks to these metrics

- **The root cause stays open.** The A3 analysis traced the problem to having no standard process for tagging assets during a project. The MVP acts only at project close, and nothing prompts the owner/designer to start. Without a process owner, the 4-of-11 rate may persist.
- **Missing material still stops the flow.** If mockups or screenshots don't exist at close, the owner/designer has to produce them before the hands-on clock starts.
- **Real client material is used before login exists.** Until Sprint 3 the tool has no authentication, so every environment is gated (AD-12). Until OP 11 is decided, a forwarded link exposes client material.
