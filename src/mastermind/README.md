---
type: ground_rule
label: Master Mind
edges:
  - to: project:groundrules
    relation: canonical_source
---

# Master Mind — ground rules for all agents

**Audience:** every agent in this fleet. You read this at the start of every session. These rules are inviolable unless the user explicitly tells you otherwise in the moment.

**Writers:** only the Personal Assistant (master agent) may write to `MasterMind/`, and only with explicit user approval at the time of each write. No other agent writes here. The human user does not edit these files either — the Personal Assistant does, via approved writes.

---

## Invariants

1. **Your wiki is sacred.** You (the agent) are the only writer of your own `Mind/` folder. The user never edits it. If the user asks you to "write down" something, you append to your Mind.

2. **Knowledge accumulates.** Your memory is a Karpathy-style wiki of markdown files. When you learn something, write it down. When you act on a conviction, cite which file in your Mind it comes from. Do not rediscover things you've already learned — go read your Mind first.

3. **Stay in your lane.** You have one domain (travel, security, farm back-office, etc.). Do not take on tasks outside it — escalate to the user or, in v3+ once inter-agent comms exists, route to the right agent.

4. **Local and private by default.** Your memory lives on this machine. Do not send wiki content to external services unless the user explicitly authorizes it.

5. **No improvisation on destructive actions.** Confirm with the user before anything that is hard to reverse (money moved, devices actuated, messages sent externally, files deleted).

6. **Personality is yours.** Your Soul.md (in your Mind) defines your voice. Keep it consistent. When the user asks you to change it, you rewrite Soul.md yourself — not the user.

7. **Truth over flattery.** Tell the user what's actually true, not what they want to hear. If the user's plan has a flaw, say so, once, clearly.

---

## Protocols

### Reading

- At session start: read this file, then your own `Mind/` folder, then `Mind/Soul.md` and `Mind/Goal.md` specifically.
- When answering: grep your Mind before searching the web.

### Writing to your own Mind

- After any meaningful interaction or realization, append to the appropriate page in your `Mind/`.
- If the page doesn't exist, create it with a clear name. Link to it from `Mind/README.md`.
- Never delete old Mind content — mark it **OBSOLETE** and add the replacement.

### Writing to MasterMind (Personal Assistant only)

- Propose the change to the user.
- Wait for explicit approval ("yes, write that").
- Commit the change with a git message citing the approval.

---

## MindGraph Conventions

Every agent annotates every file in their Mind with YAML frontmatter. This makes the fleet's collective knowledge graph traversable — typed nodes, named edges, cross-agent links.

### Frontmatter Schema

```yaml
---
type: <type>            # required — see valid types below
label: "Human label"    # required — short, readable
id: "<agent>:<slug>"    # recommended — globally unique node ID
properties:             # optional key-value metadata
  key: value
edges:                  # optional — explicit relationships
  - {to: "<scope>:<slug>", relation: "<relation>"}
---
```

### Valid Types

| Type | Use for |
|------|---------|
| `soul` | Identity, voice, convictions |
| `goal` | Purpose, scope, success criteria |
| `memory` | Dynamic knowledge — user profile, patterns, active threads |
| `project_doc` | Project-specific documentation |
| `ground_rule` | Behavioral rules and constraints |
| `decision` | Recorded decisions with reasoning |
| `tool` | Tool or capability documentation |
| `channel` | Communication channel context |
| `wiki` | General reference, index, catalog pages |

### ID Scopes

| Scope | Refers to |
|-------|-----------|
| `<agent-name>:` | That agent's own files (e.g. `atlas:soul`, `manu:goal`) |
| `project:<agent-name>` | Cross-agent reference (e.g. `project:atlas`) |
| `mastermind:readme` | This file |

Use your agent name as your scope prefix on all your own files.

### Standard Edge Relations

Use these vocabulary terms for `relation` values. Invent new ones only when nothing here fits — and flag them to Jarvis for promotion to this list.

| Relation | Meaning |
|----------|---------|
| `supports` | X reinforces or enables Y |
| `constrained_by` | X is limited or bounded by Y |
| `governed_by` | X must comply with Y's rules |
| `inherits_rules` | X adopts Y's rules by reference |
| `part_of` | X is a component of Y |
| `catalogs` | X is an index or registry of Y |
| `delegates_to` | X routes work to Y |
| `delegates_from` | X receives work from Y |
| `implements` | X is a concrete realization of Y |
| `informs` | X provides input that shapes Y |
| `calibrated_by` | X's behavior is tuned by Y |
| `distills` | X is a summary or synthesis of Y |
| `generates` | X produces or creates Y |
| `produces` | X outputs Y as a result |
| `closes` | X resolves or completes Y |
| `paired_with` | X and Y are always used together |
| `mentions` | X references Y inline (auto from `[[slug]]` or `[text](./path)`) |

### Worked Example

```yaml
---
type: soul
label: "Atlas — Identity & Voice"
id: "atlas:soul"
properties:
  version: 1
  last_updated: "2026-04-17"
edges:
  - {to: "atlas:goal", relation: "supports"}
  - {to: "mastermind:readme", relation: "governed_by"}
  - {to: "atlas:permissions", relation: "constrained_by"}
---
```

### Required Files

Every agent Mind must have these four files, each with frontmatter:

| File | Type | Purpose |
|------|------|---------|
| `Soul.md` | `soul` | Identity and voice |
| `Goal.md` | `goal` | Purpose and scope |
| `index.md` | `wiki` | Catalog of all Mind pages |
| `log.md` | `wiki` | Append-only activity log |

Additional structure (subfolders, extra pages) is up to each agent.

### Inline References

`[[slug]]` and `[text](./path)` in body text are treated as implicit `mentions` edges by the graph builder. You don't need to list them in `edges:` — they're picked up automatically.

---

## Fleet Topology

The fleet has two distinct topologies that serve different purposes — both matter, neither substitutes for the other.

**Build-time:** `_ProjectWiki/` (authored by Claude) is scaffolding. Nodes scoped `project:*` carry spec and decision history. The project wiki may go dormant once the fleet is fully built out. Keep these edges; they're the paper trail.

**Runtime:** Jarvis is the master agent and operational coordinator. Peer agents defer to Jarvis, he delegates to them. He is the only agent with MasterMind write access. The operational graph flows through him — not through the project wiki.

### Required for every agent

Any file that describes how you work with other agents — protocols, delegation rules, conventions, coordination notes — **must** include direct cross-wiki edges to `jarvis:*` nodes. `project:*` edges are fine to keep as build-time context; they are not a substitute for live operational edges.

If your graph only has `project:*` edges, you're invisible at runtime.

### Suggested edge shapes

```yaml
# Peer agent → Jarvis (coordination hub)
- {to: "jarvis:roster", relation: "coordinates_via"}

# Strong coordination / reporting relationship
- {to: "jarvis:soul", relation: "reports_to"}

# Jarvis's roster → peer agent (the other direction)
- {to: "<peer>:soul", relation: "coordinates"}

# Domain handoff between peer agents (e.g. Manu surfaces a story, Veda digs in)
- {to: "<peer>:soul", relation: "hands_off_to"}
```

Apply the appropriate shape when you write or update any coordination-flow file. When in doubt, add `coordinates_via` to `jarvis:roster` — that's the minimum edge that puts you on the operational map.

---

## Request Tracing

Structured per-request observability for the fleet. Controlled by a fleet-wide toggle — when off, emit nothing and add zero overhead.

### Gate

Check the environment variable `TRACING_ENABLED` at the start of every request. If it's not `true`, skip all trace emission entirely. NanoClaw injects this from `~/.config/nanoclaw/tracing.json` at container spawn.

```
if [ "$TRACING_ENABLED" != "true" ]; then  # emit nothing
```

### Where to Write

Append JSONL lines to:

```
/workspace/extra/Traces/<YYYY-MM-DD>/<trace_id>.jsonl
```

- One file per request (keyed by `trace_id`)
- One JSON object per line (JSONL — never a JSON array)
- `trace_id` is a ULID, generated once at request entry
- Date folder uses the request's start date in local time

### Event Schema

Every line is a JSON object with these fields:

```jsonc
{
  "trace_id":       "01HXYZ...",          // ULID, same for all events in this request
  "timestamp":      "2026-04-18T15:06:00.123Z",  // ISO 8601 with milliseconds
  "agent":          "jarvis",             // your scope name (no colon)
  "node_id":        "jarvis:soul",        // MindGraph node being touched, or "mastermind:readme"
  "event":          "read",              // see event types below
  "related_node_id": "jarvis:goal",      // optional — relevant second node
  "request_summary": "...",              // optional — short human-readable summary
  "metadata":       {}                   // optional — event-specific payload
}
```

### Event Types

| Event | When to emit | Key metadata fields |
|-------|-------------|---------------------|
| `entry` | Request start — emit first | `request_summary` (short), `metadata.user_message` (full request text) |
| `read` | Each time you read a Mind page or MasterMind | `node_id` = the page read |
| `write` | Each time you write a Mind page | `node_id` = the page written |
| `handoff_out` | Reserved for v3+ inter-agent comms | — do not emit yet |
| `handoff_in` | Reserved for v3+ inter-agent comms | — do not emit yet |
| `exit` | Request end — emit last | `metadata.duration_ms`, `metadata.response_length` |
| `reason` | Non-obvious motivation for the current turn | `text` (the reason string) |

### Example Trace File

```jsonl
{"trace_id":"01HXYZ123","timestamp":"2026-04-18T15:06:00.100Z","agent":"jarvis","node_id":"jarvis:soul","event":"entry","request_summary":"Add tracing section to MasterMind","metadata":{"user_message":"Jarvis — time to add the Request Tracing section..."}}
{"trace_id":"01HXYZ123","timestamp":"2026-04-18T15:06:00.210Z","agent":"jarvis","node_id":"mastermind:readme","event":"read"}
{"trace_id":"01HXYZ123","timestamp":"2026-04-18T15:06:01.440Z","agent":"jarvis","node_id":"mastermind:readme","event":"write"}
{"trace_id":"01HXYZ123","timestamp":"2026-04-18T15:06:01.500Z","agent":"jarvis","node_id":"jarvis:log","event":"write"}
{"trace_id":"01HXYZ123","timestamp":"2026-04-18T15:06:01.520Z","agent":"jarvis","node_id":"jarvis:soul","event":"exit","metadata":{"duration_ms":1420,"response_length":312}}
```

### Reason Field

When the motivation behind a turn is non-obvious from the request text alone, call `add_trace_reason(reason)` to annotate the trace. Middleware appends a `{event: "reason", text: ...}` line to the active trace file. Safe to call multiple times per turn as your framing evolves — each call is a separate event. No-op when tracing is off; never forces tracing on (unlike vault access).

Skip for mechanical or self-evident turns. Use when you made a deliberate interpretive choice a reviewer wouldn't otherwise see — e.g., the request says "fix it" but you read the real ask as structural, not the surface bug.

### Compact Convention

If you read the same node multiple times back-to-back within a single request, collapse them into one event with `metadata.count` rather than emitting a line per read. Applies to reads only — writes always get their own event.

### Trace Index

On trace completion, append one summary line to `/workspace/extra/Traces/index.jsonl`:

```jsonc
{
  "trace_id": "01HXYZ123",
  "timestamp": "2026-04-18T15:06:01.520Z",
  "summary": "Add tracing section to MasterMind",
  "agents": ["jarvis"],
  "node_count": 3,
  "path": "2026-04-18/01HXYZ123.jsonl",
  "nodes": ["mastermind:readme", "mastermind:readme", "jarvis:log"]
}
```

`path` is the JSONL file location relative to `Traces/` — the viewer uses this to load the full trace. `nodes` is the ordered list of `node_id` values across all events, excluding entry/exit anchors. This gives the viewer a quick scan without opening each trace file.

### Scope Boundary

Tracing covers Mind-node reads and writes only. Do **not** emit events for:
- `conversations/` reads
- SQLite queries
- IPC file access
- Any other infrastructure I/O

The signal should be meaningful navigation of the knowledge graph — not filesystem noise.

### Notes

- Emit events as they happen — don't batch and write at the end (exit events may be missed if a request errors out)
- `node_id` for `entry`/`exit` events should be `<agent>:soul` — the agent's Soul is a real MindGraph node and the natural anchor for a request
- Missing or unknown fields: omit rather than null
- The Traces directory is mounted RW at `/workspace/extra/Traces/` — create the date subfolder if it doesn't exist

---

## Confidential Files (Vault)

See [`Vault.md`](./Vault.md) — fleet-wide privacy rules governing sensitive document handling. Non-negotiable.

---

## Status

This file is a v0 stub. The master agent (whichever agent you give MasterMind write-access to) expands it with operator approval as the fleet grows.
