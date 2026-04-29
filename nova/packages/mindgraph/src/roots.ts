import type { WikiRoot } from "@nova/mindgraph-source-fs";

/**
 * Default wiki roots for the viewer. Empty in the baseline — the
 * agent-fleet harness install script (`scripts/install-harness.sh`)
 * appends one entry per registered agent before the closing `];`. Add entries
 * by hand or re-run the install script with `--nova=$PWD` from a project root.
 *
 * When a root folder doesn't exist on disk, the loader silently skips it.
 *
 * Example entry shape (uncomment + edit when adding by hand):
 *
 *   { scope: "myagent", label: "My Agent", path: "/abs/path/to/myproject/MyAgent/Mind" },
 *
 * `scope` must match the prefix in node_ids (e.g. `myagent:soul`) and align
 * with whatever the harness's `entryNodeForAgentFolder()` maps the agent's
 * group folder to.
 */
export function defaultRoots(): WikiRoot[] {
  return [
    // Add per-agent roots here, or let the install script append them.
  ];
}
