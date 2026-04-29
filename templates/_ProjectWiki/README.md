---
type: project_doc
label: Project Wiki
edges:
  - to: project:scope
    relation: defines
  - to: project:architecture
    relation: defines
---

# Project Wiki — [Project Name]

**What this project is:** _One paragraph describing the project's purpose and the agents involved. Replace before publishing._

**Where we are right now:** _One sentence on current state — what's running, what's next._

**Who reads this:** Claude, at the start of every session working in this folder. Rule: if a fresh session points only at this README, it should be able to continue the work without re-asking the operator for project scope.

---

## Index

- [Scope](Scope.md) — what's in scope, what's out, the agent roster
- [Decisions](Decisions.md) — design choices made, with rationale (so we don't re-litigate them)
- [Architecture](Architecture.md) — runtime, memory, viewer, comms
- [Progress](Progress.md) — what's done, what's next, blockers (running log)
- [Prereqs](Prereqs.md) — install state, versions, paths

### Per-agent pages ([Agents/](Agents/))

_Add one page per agent as the fleet grows. Use [Agents/_template.md](Agents/_template.md) as the starting point._

---

## Foundation

This project is built on the [agent-fleet harness](https://github.com/novaoptimiprime/nanoclaw-harness). The harness provides:

- **nanoclaw v2** — Docker-per-message agent runtime (upstream, with harness patches applied).
- **Tracing** — JSONL trace per inbound message in `<agent>/Traces/<YYYY-MM-DD>/<id>.jsonl`.
- **Vault gate** — per-agent isolation enforced at the tool-call boundary.
- **Nova MindGraph viewer** — admin console with visual mind map of the fleet's wiki + traces.
- **MasterMind** — runtime conventions every agent reads (`MasterMind/README.md`, `MasterMind/Vault.md`).
- **Wiki conventions** — Karpathy-style frontmatter shape so the fleet's collective Mind is a queryable graph.

For the full capability walkthrough, read the harness repo's `CAPABILITIES.md`.

---

## Current status at a glance

| Item | Status |
|---|---|
| Folder scaffold | ⬜ |
| Project wiki seeded | ⬜ |
| Git audit trail | ⬜ |
| Homebrew | ⬜ |
| Docker Desktop | ⬜ |
| gh (GitHub CLI) | ⬜ |
| Claude Code CLI | ⬜ |
| nanoclaw v2 installed | ⬜ |
| Harness applied | ⬜ |
| Nova viewer running | ⬜ |
| MasterMind seeded | ⬜ |
| First agent live | ⬜ |

See [Progress.md](Progress.md) for the running log.

---

## What a new session should do

1. Read this file.
2. Read [Progress.md](Progress.md) for the latest checkpoint.
3. Read [Decisions.md](Decisions.md) so you don't re-ask settled questions.
4. Check [Prereqs.md](Prereqs.md) before assuming anything is installed.
5. If the operator asks for work on a specific agent, read that agent's page in [`Agents/`](Agents/) and the agent's own `Mind/` folder.
