---
type: project_doc
label: "<Agent Name>"
id: "project:<agent-slug>"
edges:
  - to: project:scope
    relation: part_of
  - to: <agent-slug>:soul
    relation: catalogs
---

# <Agent Name>

Project-wiki summary page for `<Agent Name>`. The canonical Soul and Goal live in `<AgentName>/Mind/Soul.md` and `<AgentName>/Mind/Goal.md`, written by the agent. This page is the operator's at-a-glance view.

## Soul (summary)

_One paragraph in the agent's voice, derived from Mind/Soul.md. Update when the agent rewrites Soul.md._

## Goal (summary)

_One paragraph on what the agent does and the boundary of their domain._

## Channel

| Channel type | Identifier | Status |
|--------------|------------|--------|
| _e.g. Discord_ | _#agent-name_ | ⬜ |

## Vault

- **Host path:** `<project-root>/<AgentName>/Vault/`
- **Mounted into container at:** `/workspace/agent/Vault/`
- **Per-attachment files:** `/workspace/vault/<filename>` (RO, single-spawn scope)
- **Rules:** see [`MasterMind/Vault.md`](../../MasterMind/Vault.md). Five hard rules, no exceptions.

## Mind structure

The agent's own `Mind/` follows the [MindGraph conventions](../../MasterMind/README.md#mindgraph-conventions). At minimum:

- `Mind/Soul.md` — identity and voice (`type: soul`)
- `Mind/Goal.md` — purpose and scope (`type: goal`)
- `Mind/index.md` — catalog (`type: wiki`)
- `Mind/log.md` — append-only log (`type: wiki`)

Additional Mind pages per the agent's needs.

## Status

⬜ planned · ⬜ installing · ⬜ live · ⬜ paused

_Update this line as the agent progresses._

## Pattern reuse

If this agent borrows patterns from existing agents (briefings, scheduled tasks, channel-specific behaviors), note the source here:

- _e.g._ Borrowed morning-briefing pattern from `<other-agent>/Mind/protocols.md`. Adapted for `<this-agent>'s` domain.
