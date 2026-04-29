# Nova

Reusable components for agent-fleet observability and visualization. Vendored into the [agent-fleet baseline](../README.md) and consumed by any project bootstrapped from it.

## Packages

- **`@nova/mindgraph-view`** — React component that renders a typed knowledge graph (Obsidian-style force-directed graph, click-to-panel, filtering). Domain-agnostic: the node-type registry, detail-panel renderers, and scope config are all pluggable props.
- **`@nova/mindgraph-source-fs`** — Filesystem adapter. Scans folders of markdown files and returns the `{nodes, edges}` shape `mindgraph-view` expects. Handles frontmatter, `[[wikilinks]]`, and inline markdown links.
- **`@nova/mindgraph`** — Standalone Next.js viewer app. Wires the view to a source adapter and serves on `localhost:3000`. Opens on the registered project wikis (configured via `packages/mindgraph/src/roots.ts` and `trace-sources.ts`).

## MVP status

Scaffold phase. Component is stubbed; the D3 rendering will be ported over from the Dear Farm reference implementation in the next pass.

## Usage

```bash
pnpm install      # from repo root
pnpm dev          # starts the viewer at http://localhost:3000
```

## Convention

Markdown files become nodes. Edges come from:

1. **Frontmatter `edges:`** — typed edges with explicit `relation`.
2. **`[[wikilinks]]`** and inline `[md links](./path.md)` — untyped `mentions` edges.

```yaml
---
id: agent-soul
type: soul
label: <AgentName> — Soul
properties:
  authored_by: <agent-slug>
edges:
  - to: <agent-slug>
    relation: defines_personality_of
  - to: project:master-mind
    relation: inherits_rules
---
```

Nothing is required — a bare `.md` with no frontmatter still becomes a node (`type: wiki`, label from filename).

## Cross-wiki references

`[[<agent>:soul]]`, `[[project:scope]]`, `[[<other-agent>:<page-slug>]]`. The viewer is told which roots map to which prefix via `packages/mindgraph/src/roots.ts`.

## Future

- `@nova/mindgraph-source-drizzle-pg` — database-backed source.
- `@nova/mindgraph-source-sqlite` — SQLite source.
- Request-flow trace overlay (already integrated for nanoclaw via `mindgraph-trace`).
