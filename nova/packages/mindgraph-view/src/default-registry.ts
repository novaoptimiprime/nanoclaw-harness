/**
 * Default node-type registry. Sensible defaults for the agent-fleet shape;
 * projects can override any entry via the `nodeTypes` prop on <MindGraph />.
 * Unknown types fall back to the `wiki` config at render time.
 */

import type { NodeTypeRegistry } from "./types";

export const AGENT_FLEET_REGISTRY: NodeTypeRegistry = {
  agent: {
    label: "Agent",
    color: "#3B82F6",
    icon: "A",
    anchor: "ring",
  },
  soul: {
    label: "Soul",
    color: "#6366F1",
    icon: "S",
    anchor: "outer",
  },
  goal: {
    label: "Goal",
    color: "#A855F7",
    icon: "G",
    anchor: "outer",
  },
  memory: {
    label: "Memory",
    color: "#22C55E",
    icon: "M",
    anchor: "outer",
  },
  ground_rule: {
    label: "Ground Rule",
    color: "#EF4444",
    icon: "R",
    anchor: "outer",
  },
  decision: {
    label: "Decision",
    color: "#F59E0B",
    icon: "D",
    anchor: "outer",
  },
  tool: {
    label: "Tool",
    color: "#06B6D4",
    icon: "T",
    anchor: "outer",
  },
  channel: {
    label: "Channel",
    color: "#EC4899",
    icon: "C",
    anchor: "outer",
  },
  project_doc: {
    label: "Project Doc",
    color: "#64748B",
    icon: "P",
    anchor: "center",
  },
  wiki: {
    label: "Wiki",
    color: "#94A3B8",
    icon: "W",
    anchor: "center",
  },
};
