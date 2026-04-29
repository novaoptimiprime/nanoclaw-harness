import type { TraceSource } from "@nova/mindgraph-trace";

/**
 * Per-agent Traces/ folder roots. Empty in the baseline — the
 * agent-fleet harness install script (`scripts/install-harness.sh`)
 * appends one entry per registered agent before the closing `];`. Add entries
 * by hand or re-run the install script with `--nova=$PWD` from a project root.
 *
 * Missing folders are skipped silently by the loader. This list is deliberately
 * separate from `roots.ts` — wiki and trace data live in different folders
 * with different access patterns, and an agent can have a Mind but no traces
 * (e.g. before its first request).
 *
 * Example entry shape (uncomment + edit when adding by hand):
 *
 *   { scope: "myagent", label: "My Agent", path: "/abs/path/to/myproject/MyAgent/Traces" },
 *
 * `scope` must match the corresponding entry in `roots.ts`.
 */
export function defaultTraceSources(): TraceSource[] {
  return [
    // Add per-agent trace sources here, or let the install script append them.
  ];
}
