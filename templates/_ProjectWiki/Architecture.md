---
type: project_doc
label: Architecture
edges:
  - to: project:readme
    relation: part_of
---

# Architecture

How the project is laid out at runtime — the systems, where they run, how they communicate.

## Runtime

_What's running where. Example sections to fill in:_

- **Agent runtime:** nanoclaw v2 (from [agent-fleet harness](https://github.com/novaoptimiprime/nanoclaw-mindgraph-harness)). One install at `<path>/nanoclaw-v2/`. Service managed by launchd/systemd.
- **Per-agent containers:** Docker-per-message; coalesced; spawned on inbound, idle out after N seconds.
- **Admin console:** Nova viewer at `<path>/nova/`. Started with `pnpm run dev`, listens on `:3000`.

## Memory

_Where state and knowledge live._

- **Project wiki:** `_ProjectWiki/` — Claude-written, source of truth for project context.
- **Per-agent Mind:** `<agent>/Mind/` — Karpathy-style markdown wiki, agent-owned, frontmatter per `MasterMind/README.md` § MindGraph Conventions.
- **Per-agent Vault:** `<agent>/Vault/` — sensitive operator-shared documents, gated by `MasterMind/Vault.md` rules and enforced by the harness Vault gate at the container's PreToolUse hook.
- **Traces:** `<agent>/Traces/<YYYY-MM-DD>/<trace_id>.jsonl` — one JSONL per inbound, plus `index.jsonl` summary file.
- **MasterMind:** `MasterMind/` — fleet-wide ground rules, RO-mounted into every agent container.

## Viewer

_How the operator inspects the fleet._

- **Nova MindGraph** at `http://localhost:3000` — visual graph of every agent's Mind plus a left-panel timeline of traces.
- See harness `CAPABILITIES.md` § "Starting the servers" for start/restart commands.

## Communications

_How inbound messages reach agents and how outbound replies leave._

- **Channels:** _list the channel adapters wired (Discord, Slack, CLI socket, etc.)_
- **Routing:** the harness's patched `src/router.ts` writes per-invocation sentinel files (`.current-trace-id`, `.current-agent`) before spawning the container, so the container's PreToolUse hook can attribute intermediate `read`/`write`/`vault_access` events to the right inbound.
- **Outbound:** the harness's patched `src/delivery.ts` emits an `exit` trace event per outbound, paired by `trace_id` with the most-recent inbound.

## Diagram

_Embed a mermaid diagram showing the runtime topology if useful. The harness's `CAPABILITIES.md` has a generic component diagram you can adapt._
