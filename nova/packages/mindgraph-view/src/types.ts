/**
 * Core types for MindGraph. Deliberately aligned with Dear Farm's
 * `GraphNode` / `GraphEdge` / `KnowledgeGraph` shapes so a DB-backed
 * source adapter can swap in later without the view changing.
 */

export interface GraphNode {
  /** Stable identifier. Filesystem adapter derives from slugified relative path. */
  id: string;
  label: string;
  /** Drives color, icon, filter chip, detail renderer. Projects extend the registry. */
  type: string;
  /** Freeform structured data. Unstructured prose lives in `properties.content` by convention. */
  properties: Record<string, unknown>;
  /** Where this node came from. `agent` = agent-authored, `extracted` = pulled from a structured source, `inferred` = derived. */
  source: "agent" | "extracted" | "inferred";
  /** Which wiki / scope this node belongs to. See `ScopeConfig`. */
  scope: string;
  scope_id?: string;
  scope_label?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence?: "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
  properties?: Record<string, unknown>;
  created_at?: string;
}

export interface KnowledgeGraph {
  directed: true;
  multigraph: false;
  nodes: GraphNode[];
  links: GraphEdge[];
  graph?: {
    created_at?: string;
    updated_at?: string;
    [key: string]: unknown;
  };
}

/** Configuration for a single node type: how it looks, what to filter as. */
export interface NodeTypeConfig {
  /** Display label for the filter chip. */
  label: string;
  /** Tailwind-compatible hex or CSS color. */
  color: string;
  /** Short glyph rendered inside the node circle (1–2 chars). */
  icon: string;
  /**
   * Optional radial-force anchoring hint. 0 = center, higher = pushed outward.
   * Lets a project put "root" entities in the middle and leaves at the edge.
   */
  anchor?: "center" | "ring" | "outer";
}

export type NodeTypeRegistry = Record<string, NodeTypeConfig>;

/** Optional custom renderer for a node type's detail panel. */
export type DetailRenderer = (node: GraphNode, ctx: DetailContext) => React.ReactNode;

export interface DetailContext {
  /** All edges touching the selected node. */
  related: Array<{ node: GraphNode; relation: string; direction: "out" | "in" }>;
  /** The full graph, in case renderers need wider context. */
  graph: KnowledgeGraph;
}

export interface ScopeConfig {
  /** Stable scope id (e.g. "myagent", "project", "another-agent"). Matches node.scope. */
  id: string;
  /** Human label shown in scope filter. */
  label: string;
  /** Optional color for the scope badge. */
  color?: string;
}

export interface MindGraphProps {
  graph: KnowledgeGraph;
  /** Node-type registry. Defaults to the agent-fleet registry. */
  nodeTypes?: NodeTypeRegistry;
  /** Per-type detail panel renderers. If absent for a type, a generic renderer is used. */
  detailRenderers?: Record<string, DetailRenderer>;
  /** Scopes to show filter controls for. If absent, scopes are auto-detected from the data. */
  scopes?: ScopeConfig[];
  /** Called when a user clicks a node. */
  onNodeSelect?: (node: GraphNode | null) => void;
  /**
   * When set, the graph enters trace-mode: highlighted nodes/edges get full color,
   * everything else fades. Hover neighborhood-highlight is suppressed while active.
   * Pass `null` or `undefined` for normal viewer behavior.
   */
  traceMode?: TraceModeProps | null;
  /**
   * Called when the user clicks a traversal-order badge on a traversed edge.
   * The consumer can show event details in its own side panel.
   */
  onTraceEdgeClick?: (edge: TraceTraversedEdge) => void;
}

/**
 * Props passed to activate trace-mode rendering. Shape is intentionally flat and
 * structural so producers (including `@nova/mindgraph-trace`) can construct it
 * without importing view-layer types.
 */
export interface TraceModeProps {
  highlightedNodes: TraceHighlightedNode[];
  traversedEdges: TraceTraversedEdge[];
}

export interface TraceHighlightedNode {
  node_id: string;
  /** entry=first event's node, exit=last event's node, intermediate=anything else. */
  role: "entry" | "intermediate" | "exit";
  /** Raw touch count from the trace (pre-compact). */
  touch_count: number;
  /** True when all touches were back-to-back — can be safely collapsed. */
  compactable: boolean;
}

export interface TraceTraversedEdge {
  from: string;
  to: string;
  /** 0-based traversal order within the trace. Shown as a badge on the edge. */
  order: number;
  /** One of: "read", "write", "handoff_out", "handoff_in". Drives edge color. */
  event: string;
  /** Timestamp of the event that produced this edge. Shown in the edge detail panel. */
  timestamp?: string;
  /** Metadata from the originating event — arbitrary bucket. */
  metadata?: Record<string, unknown>;
}
