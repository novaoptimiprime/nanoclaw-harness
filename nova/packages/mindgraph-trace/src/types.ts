/**
 * Trace data model. Mirrors the per-JSONL-line schema emitted by each agent
 * into `<Agent>/Traces/YYYY-MM-DD/<trace_id>.jsonl`.
 *
 * The shapes are deliberately flat: each `TraceEvent` maps 1:1 to a row in the
 * future SQLite `trace_events` table, and each `TraceIndexEntry` maps to a row
 * in `trace_summaries`. The JSONL → DB migration stays schema-preserving.
 */

export type TraceEventType =
  | "entry"
  | "read"
  | "write"
  | "handoff_out"
  | "handoff_in"
  | "exit"
  | "vault_access"
  | "reason"
  | "mcp_call"
  | "mcp_result";

export interface TraceEvent {
  trace_id: string;
  /** ISO8601 with millisecond precision. Ordering key. */
  timestamp: string;
  /** Agent's MindGraph scope prefix (e.g. "myagent"). */
  agent: string;
  /** MindGraph node id this event touched (e.g. "myagent:soul"). */
  node_id: string;
  event: TraceEventType;
  /** For handoff_* events: the node on the other side of the hop. */
  related_node_id?: string | null;
  /** Only present on the `entry` event. */
  request_summary?: string;
  /** Open bucket. Examples: duration_ms, response_length, count (for compact reads). */
  metadata?: Record<string, unknown>;
}

/**
 * Summary line written to `<Agent>/Traces/index.jsonl` on trace completion.
 * One per trace. Designed for fast trace-list rendering without scanning the
 * individual JSONL files.
 */
export interface TraceIndexEntry {
  trace_id: string;
  /** Timestamp of the `entry` event — used for chronological ordering. */
  timestamp: string;
  /** Short human-readable label, copied from the entry event's request_summary. */
  summary: string;
  /** Agents that participated in this trace. Usually length 1 today; future-proof for handoffs. */
  agents: string[];
  /** Number of distinct MindGraph nodes touched. Drives list-row density badges. */
  node_count: number;
  /** Relative path under the agent's Traces/ folder, e.g. "2026-04-18/t_abc.jsonl". */
  path: string;
  /** Which scope (agent) this index entry came from. Populated by the loader. */
  source_scope?: string;
  /**
   * Claude SDK session id — stable across IPC follow-ups and cross-spawn
   * resumes within one logical conversation. Used to group per-message
   * traces so a confirmation turn (e.g. "yes") can surface the earlier
   * request turn ("add expense for $X") as context in the viewer.
   * Optional because older traces from before the field was introduced
   * won't have it, and the very first message of a fresh group won't
   * have a session id if the SDK init happened after the trace closed.
   */
  conversation_id?: string;
}

/** One filesystem root to load traces from — typically one per agent. */
export interface TraceSource {
  /** Scope id matching the agent's MindGraph scope (e.g. "myagent"). */
  scope: string;
  /** Absolute path to `<Agent>/Traces/`. */
  path: string;
  /** Display label for the agent badge in the trace list. Defaults to scope. */
  label?: string;
}

/**
 * A trace after it has been loaded and normalised for the view layer.
 * `highlightedNodes` and `traversedEdges` are derived from `events` and are
 * what the MindGraph `traceMode` prop actually consumes.
 */
export interface LoadedTrace {
  trace_id: string;
  summary: string;
  entry_timestamp: string;
  exit_timestamp?: string;
  /** True if the trace has no `exit` event — the agent crashed or is still running. */
  incomplete: boolean;
  agents: string[];
  events: TraceEvent[];
  /** Unique node ids touched, with their role (entry/intermediate/exit). */
  highlightedNodes: HighlightedNode[];
  /** Edges to animate, in traversal order. */
  traversedEdges: TraversedEdge[];
  /** Topic anchor: the `topics/*` node most referenced in this trace, if any. */
  topic_node_id?: string;
}

export interface HighlightedNode {
  node_id: string;
  role: "entry" | "intermediate" | "exit";
  /** Number of events that touched this node (before compact). */
  touch_count: number;
  /** True if all touches were sequential reads/writes collapsable under compact view. */
  compactable: boolean;
}

export interface TraversedEdge {
  from: string;
  to: string;
  /** 0-based order within the trace's traversal. */
  order: number;
  /** The event type that produced this edge (read/write/handoff_*). */
  event: TraceEventType;
  /** Timestamp of the event that produced this edge — for the detail panel. */
  timestamp?: string;
  /** Metadata copied from the source event. */
  metadata?: Record<string, unknown>;
}
