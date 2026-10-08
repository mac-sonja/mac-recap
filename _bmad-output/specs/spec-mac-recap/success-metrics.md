# Success Metrics — MAC Recap

## Baseline (A3 analysis)

| Measure | Baseline |
| --- | --- |
| Hours to build a case study end to end, including producing material | 24–60 h |
| Layout time per case study | 1–2 h (target 15–20 min) |
| Closed projects publicised externally, last 12 months | 4 of 11 (about 36%) |
| Time from project close to social channels | about 2 months |
| Case studies covering both the technical and the graphic side | 0% |
| Teams affected | 4 (creative, sales, PM, social) |
| Commercial levers lost | 2 (upsell, inbound contacts) |

## October 30 demo (go / no-go, CEO validates)

One real past project, ideally one of the 7 never published, using prepared material. All four criteria must hold:

1. Live upload to approved case study in 15–20 minutes of owner hands-on time.
2. The same case study exported in several formats (deck, social carousel, PDF).
3. The text covers both the technical and the graphic side.
4. Every claim traces back to uploaded material, checked by a person during review.

## 8-week validation (after a go)

Real closed projects run through the standalone tool. MAC closes about one project a month, so the backlog of unpublished past projects should also go through the tool to give a usable sample.

| Metric | Target | Source in system |
| --- | --- | --- |
| Case studies generated | — | `case_event` (CAP-12) |
| Average owner hands-on time per case | 15–20 min | first upload → approval events |
| Manual editing after generation | as low as possible | `generated_doc` vs approved `doc` |
| Hallucinations or guardrail violations caught in review | 0 | review findings, unsupported-claim flags |

## 6-month impact (around March 2027)

| Metric | Baseline |
| --- | --- |
| Share of closed projects with a case study | 4 of 11 (about 36%) |
| Time from project close to first external use | about 2 months |
| Layout hours saved | 1–2 h per case. The 24–60 h total includes producing material, which the MVP does not address. |
| Inbound contacts and upsells attributed to a case study | Attribution method not yet defined (Q4) |

## Known risks to these metrics

- **The root cause stays open.** The A3 analysis traced the problem to having no standard process for tagging assets during a project. The MVP acts only at project close, and nothing prompts the owner to start. Without a process owner, the 4-of-11 rate may persist.
- **Missing material still stops the flow.** If mockups or screenshots don't exist at close, the owner has to produce them before the 15–20 minutes can start.
