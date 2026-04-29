# <AgentName>

_Operator-facing summary of this agent. The canonical Soul and Goal live in `Mind/Soul.md` and `Mind/Goal.md` (agent-written). This README is the at-a-glance view._

## Quick facts

- **Domain:** _what they do_
- **Channel:** _e.g. Discord #agent-name, CLI socket, etc._
- **Status:** _planned · installing · live · paused_
- **Created:** _YYYY-MM-DD_

## Soul (summary)

_One paragraph derived from Mind/Soul.md. Update when the agent rewrites Soul.md._

## Goal (summary)

_One paragraph from Mind/Goal.md._

## Patterns reused

If this agent borrows from existing agents in the fleet (briefings, protocols, scheduled tasks), note them here:

- _e.g._ Borrowed morning-briefing pattern from `<other-agent>/Mind/protocols.md`. Adapted for this agent's domain.

## Folder layout

```
<AgentName>/
├── README.md            # this file
├── Mind/                # agent-written wiki (Karpathy-style)
│   ├── Soul.md
│   ├── Goal.md
│   ├── index.md
│   └── log.md
├── Vault/               # private operator-shared documents
└── Traces/              # JSONL request traces (auto-created by harness on first inbound)
```
