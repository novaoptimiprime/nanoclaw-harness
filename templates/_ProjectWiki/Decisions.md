---
type: project_doc
label: Decisions
edges:
  - to: project:readme
    relation: part_of
---

# Decisions

Design choices made, with rationale, so future sessions don't re-litigate them. **Append-only** except when a decision is explicitly reversed — in which case, mark it **REVERSED** rather than delete it.

## How to write a decision entry

```
## <Short title>
**Date:** YYYY-MM-DD
**Decision:** <What was decided, in one or two sentences.>
**Alternatives considered:** <List the options that were on the table.>
**Why:** <The reasoning. Be specific — future-you needs this to understand whether the decision still holds.>
**Trade accepted:** <What you knowingly gave up.>
```

Keep entries short and self-contained. If a decision references files or external docs, link them.

---

## Example: Project bootstrapped from agent-fleet harness
**Date:** _YYYY-MM-DD (replace with actual date when bootstrapping)_
**Decision:** This project uses the [agent-fleet harness](https://github.com/novaoptimiprime/nanoclaw-harness) as its infrastructure baseline (nanoclaw v2 + tracing + Vault + Nova + MasterMind + wiki conventions).
**Alternatives considered:** Build runtime + viewer + conventions from scratch; use raw nanoclaw without harness; use a different agent runtime.
**Why:** The harness aggregates a tested stack. Bootstrapping from it means inheriting tracing, Vault enforcement, Nova viewer wiring, and MindGraph-ready wiki conventions for free, rather than re-deriving them per project.
**Trade accepted:** Coupling to the harness's choices (nanoclaw v2 as runtime, Karpathy wiki shape, Nova as viewer). Reasonable for now; reconsider if a project genuinely needs a different shape.

---

_Append new decision entries below this line as the project evolves._
