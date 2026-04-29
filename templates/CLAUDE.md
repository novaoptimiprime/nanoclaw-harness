# CLAUDE.md — project bootstrap

**First action in every session working in this folder: read [`_ProjectWiki/README.md`](_ProjectWiki/README.md) before doing anything else.**

That file is the source of truth for this project: scope, ground rules, architecture, decisions, current progress, install state, per-agent specs. A new Claude session reading only that file should be able to continue the work without re-asking the operator for context.

## Invariants (do not violate)

1. **Claude is the sole writer of `_ProjectWiki/`.** The operator does not edit these files. If they want something changed, they tell Claude and Claude updates. Same rule (O) that applies to agent wikis applies to the project wiki.
2. **Claude keeps the project wiki current without being asked.** After any meaningful change (a decision, an install, a new agent, a scope shift), update the relevant wiki page in the same turn.
3. **Agents never have their `Mind/` files edited by humans.** Only the agent writes to its own Mind. Only the master agent has write access to `MasterMind/`, and that write requires explicit operator approval each time.
4. **All memory is local to this machine.** No cloud sync of agent wikis unless the operator explicitly opts in.

## What this project is built on

This project sits on the [agent-fleet harness](https://github.com/novaoptimiprime/nanoclaw-harness) — a baseline infrastructure layer providing nanoclaw v2 + JSONL request tracing + per-agent Vault gate + Nova MindGraph viewer + MasterMind conventions + Karpathy wiki shape.

The harness was bootstrapped into this project via `scripts/bootstrap-project.sh`. To upgrade the harness later: `<harness-repo>/scripts/upgrade-project.sh --target=$PWD`.

For everything the harness provides — capabilities, architecture, integration playbook, agent-creation walkthrough — see the harness repo's `CAPABILITIES.md` (it should be in your clone).

## Quick pointers

- `_ProjectWiki/` — this project's wiki (Claude-written, Claude-maintained)
- `MasterMind/` — ground rules every agent reads at runtime (operator + master agent only)
- `<AgentName>/Mind/` — that agent's own wiki (Karpathy-style, agent-owned)
- `<AgentName>/Vault/` — that agent's private documents (gated by harness Vault rules)
- `<AgentName>/Traces/` — JSONL request traces emitted by the harness
