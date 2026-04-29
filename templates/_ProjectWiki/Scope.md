---
type: project_doc
label: Scope
edges:
  - to: project:readme
    relation: part_of
---

# Scope

What this project is, what it isn't, and the agent roster.

## What this project is

_One paragraph. The problem you're solving, the approach, the boundary of the work. Replace before publishing._

## Out of scope

_List things the operator might think are in scope but aren't, with a one-line reason. This prevents re-litigating later._

- _Example:_ Cross-agent vault sharing — by design, see [Decisions.md](Decisions.md) and [`MasterMind/Vault.md`](../MasterMind/Vault.md).

## Agent roster

| Agent | Domain | Channel | Mind path | Status |
|-------|--------|---------|-----------|--------|
| _example_ | _what they do_ | _e.g. Discord #foo_ | `<agent>/Mind/` | ⬜ planned |

_Add one row per agent. Update status as agents come online (planned → installing → live)._

## Boundary with the harness

This project consumes the [agent-fleet harness](https://github.com/novaoptimiprime/nanoclaw-mindgraph-harness) as infrastructure. Harness changes (tracing schema, Vault rules, Nova wiring, MasterMind conventions) live in the harness repo, not here. Project-specific decisions live in [Decisions.md](Decisions.md).
