# Phase 6 Plan — Index

*Pedigree Editor — Phase 6: Drag-and-drop repositioning + layout improvements*

---

## Sub-phases

| # | Deliverable | Est. | Plan |
|---|------------|------|------|
| 6.1 | Manual node drag-and-drop repositioning | 2–3 days | [phase_6_1_plan.md](phase_6_1_plan.md) |
| 6.3 | Compact mode | 0.5 day | [phase_6_3_plan.md](phase_6_3_plan.md) |
| 6.4 | Batch SVG Django API | 1.5 days | [phase_6_4_plan.md](phase_6_4_plan.md) |
| 6.5 | Full autohint graph-based optimisation | 1 day | [phase_6_5_plan.md](phase_6_5_plan.md) |

Implement in order. 6.4 can slip to Phase 7 if time runs short.

## Why this order

- **6.1 first** — the primary differentiator; everything else builds on a working drag model
- **6.3 second** — quick win, touches `layoutToFlow` which 6.1 already modifies
- **6.5 before 6.4** — algorithm improvement benefits the SVG output the batch API produces
- **6.4 last** — backend work, can ship independently
