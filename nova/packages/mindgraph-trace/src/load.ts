import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  HighlightedNode,
  LoadedTrace,
  TraceEvent,
  TraceIndexEntry,
  TraceSource,
  TraversedEdge,
} from "./types";

const INDEX_FILE = "index.jsonl";

/**
 * Load the combined trace index across every agent's Traces/ folder.
 * Returns entries sorted newest-first. Missing folders are skipped silently
 * (same behavior as the wiki loader — not every agent has traces yet).
 */
export async function loadTraceIndex(sources: TraceSource[]): Promise<TraceIndexEntry[]> {
  const entries: TraceIndexEntry[] = [];
  for (const source of sources) {
    const indexPath = join(source.path, INDEX_FILE);
    const lines = await readJsonLinesSafe(indexPath);
    for (const line of lines) {
      const parsed = safeParse<TraceIndexEntry>(line);
      if (parsed) entries.push({ ...parsed, source_scope: source.scope });
    }
  }
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return entries;
}

/**
 * Load one trace's full event stream and derive the view-layer highlights.
 * `relPath` is the `path` from the trace index entry (e.g. "2026-04-18/t_abc.jsonl").
 */
export async function loadTrace(
  source: TraceSource,
  relPath: string
): Promise<LoadedTrace> {
  const absPath = join(source.path, relPath);
  const lines = await readJsonLinesSafe(absPath);
  const events: TraceEvent[] = [];
  for (const line of lines) {
    const parsed = safeParse<TraceEvent>(line);
    if (parsed) events.push(parsed);
  }
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return buildLoadedTrace(events);
}

/** Group index entries by their topic anchor — the `topics/*` node a trace references. */
export function groupByTopic(entries: TraceIndexEntry[], topicByTrace: Map<string, string | undefined>): Map<string, TraceIndexEntry[]> {
  const groups = new Map<string, TraceIndexEntry[]>();
  for (const entry of entries) {
    const topic = topicByTrace.get(entry.trace_id) ?? "__untopiced__";
    const bucket = groups.get(topic) ?? [];
    bucket.push(entry);
    groups.set(topic, bucket);
  }
  return groups;
}

/**
 * Group index entries by their `conversation_id` (Claude SDK session id).
 * Traces without a conversation id land in the `__unconversed__` bucket
 * so nothing is dropped. Within each group, entries stay in the order they
 * were passed in.
 */
export function groupByConversation(entries: TraceIndexEntry[]): Map<string, TraceIndexEntry[]> {
  const groups = new Map<string, TraceIndexEntry[]>();
  for (const entry of entries) {
    const key = entry.conversation_id ?? "__unconversed__";
    const bucket = groups.get(key) ?? [];
    bucket.push(entry);
    groups.set(key, bucket);
  }
  return groups;
}

// ── Internals ──────────────────────────────────────────────

async function readJsonLinesSafe(path: string): Promise<string[]> {
  try {
    const raw = await readFile(path, "utf8");
    return raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    console.warn(`[mindgraph-trace] failed to read ${path}:`, err);
    return [];
  }
}

function safeParse<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}

/**
 * Walk a trace's events in chronological order and derive:
 *   - highlightedNodes (unique, with role + compactability)
 *   - traversedEdges (one per event that implies a node transition)
 *   - topic_node_id (most-touched `topics/*` node, if any)
 *
 * Rules:
 *   - `entry` is the starting node; first non-entry event is edge order 0 from it.
 *   - `read`/`write` imply the agent "went to" that node from the previous event's node.
 *   - `handoff_out`/`handoff_in` create cross-agent edges via `related_node_id`.
 *   - `exit` marks its node as the exit role. If exit happens on the entry node,
 *     that node carries both roles — role resolution prefers entry.
 */
function buildLoadedTrace(events: TraceEvent[]): LoadedTrace {
  if (events.length === 0) {
    return {
      trace_id: "",
      summary: "",
      entry_timestamp: "",
      incomplete: true,
      agents: [],
      events,
      highlightedNodes: [],
      traversedEdges: [],
    };
  }

  const entry = events.find((e) => e.event === "entry");
  const exit = [...events].reverse().find((e) => e.event === "exit");
  const incomplete = !exit;

  const agentsSet = new Set<string>();
  for (const e of events) agentsSet.add(e.agent);

  const touchCounts = new Map<string, number>();
  const sequentialRepeats = new Map<string, boolean>(); // node -> all repeats were back-to-back
  let lastNode: string | undefined;
  let lastNodeStreak = 0;

  for (const e of events) {
    if (e.node_id === lastNode) {
      lastNodeStreak += 1;
    } else {
      if (lastNode && lastNodeStreak > 1) {
        // Previous node had multiple hits in a row → compactable
        sequentialRepeats.set(lastNode, sequentialRepeats.get(lastNode) !== false);
      }
      if (lastNode) {
        // Previous node is "done" with its streak — if it was hit again later
        // (non-sequentially), mark it non-compactable.
        if (touchCounts.has(lastNode)) {
          sequentialRepeats.set(lastNode, false);
        }
      }
      lastNodeStreak = 1;
    }
    touchCounts.set(e.node_id, (touchCounts.get(e.node_id) ?? 0) + 1);
    lastNode = e.node_id;
  }
  if (lastNode && lastNodeStreak > 1) {
    sequentialRepeats.set(lastNode, sequentialRepeats.get(lastNode) !== false);
  }

  const entryNode = entry?.node_id;
  const exitNode = exit?.node_id;

  const highlightedNodes: HighlightedNode[] = [];
  for (const [node_id, count] of touchCounts.entries()) {
    let role: HighlightedNode["role"] = "intermediate";
    if (node_id === entryNode) role = "entry";
    else if (node_id === exitNode) role = "exit";
    const compactable = count > 1 && sequentialRepeats.get(node_id) === true;
    highlightedNodes.push({ node_id, role, touch_count: count, compactable });
  }

  const traversedEdges: TraversedEdge[] = [];
  let prevNode: string | undefined;
  let order = 0;
  for (const e of events) {
    if (e.event === "entry") {
      prevNode = e.node_id;
      continue;
    }
    if (e.event === "exit") {
      // exit is terminal; no outbound edge drawn
      continue;
    }
    if (e.event === "handoff_out" || e.event === "handoff_in") {
      if (e.related_node_id) {
        const from = e.event === "handoff_out" ? e.node_id : e.related_node_id;
        const to = e.event === "handoff_out" ? e.related_node_id : e.node_id;
        traversedEdges.push({
          from,
          to,
          order: order++,
          event: e.event,
          timestamp: e.timestamp,
          metadata: e.metadata,
        });
        prevNode = to;
      }
      continue;
    }
    // mcp_call carries server/tool/kind/args at top level (not under metadata).
    // Lift them onto the edge so the EdgeDetailPanel can render them; the rest
    // of the loader stays generic.
    if (e.event === "mcp_call") {
      if (prevNode && prevNode !== e.node_id) {
        const ext = e as unknown as {
          server?: string; tool?: string; kind?: string; args?: unknown;
        };
        traversedEdges.push({
          from: prevNode,
          to: e.node_id,
          order: order++,
          event: e.event,
          timestamp: e.timestamp,
          metadata: {
            mcp_server: ext.server,
            mcp_tool: ext.tool,
            mcp_kind: ext.kind,
            mcp_args: ext.args,
          },
        });
      }
      prevNode = e.node_id;
      continue;
    }
    // mcp_result pairs with its immediately preceding mcp_call edge — same
    // server/tool, same node_id. Attach the result onto that edge instead of
    // creating a new one so the call+outcome stay visually unified.
    if (e.event === "mcp_result") {
      const last = traversedEdges[traversedEdges.length - 1];
      if (last && last.event === "mcp_call") {
        const ext = e as unknown as { response?: unknown };
        last.metadata = { ...(last.metadata ?? {}), mcp_response: ext.response };
      }
      // node_id unchanged (same as mcp_call); no edge to draw.
      continue;
    }
    // read / write / other: edge from prevNode to this node (if distinct)
    if (prevNode && prevNode !== e.node_id) {
      traversedEdges.push({
        from: prevNode,
        to: e.node_id,
        order: order++,
        event: e.event,
        timestamp: e.timestamp,
        metadata: e.metadata,
      });
    }
    prevNode = e.node_id;
  }

  // Topic anchor — most-touched `topics/*` node if any.
  let topic_node_id: string | undefined;
  let topTouches = 0;
  for (const [node_id, count] of touchCounts.entries()) {
    if (!node_id.includes(":topics:") && !node_id.includes(":topics/")) continue;
    if (count > topTouches) {
      topic_node_id = node_id;
      topTouches = count;
    }
  }

  const first = events[0]!;
  return {
    trace_id: first.trace_id,
    summary: entry?.request_summary ?? "",
    entry_timestamp: entry?.timestamp ?? first.timestamp,
    exit_timestamp: exit?.timestamp,
    incomplete,
    agents: Array.from(agentsSet),
    events,
    highlightedNodes,
    traversedEdges,
    topic_node_id,
  };
}

/** Extract the topic anchor from a LoadedTrace for use with `groupByTopic`. */
export function buildTopicMap(traces: LoadedTrace[]): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const t of traces) out.set(t.trace_id, t.topic_node_id);
  return out;
}

/** Directory listing helper used by fixtures/dev tooling. Not exported from package. */
export async function listTraceFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function recurse(dir: string, rel: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === INDEX_FILE || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      const relFull = rel ? join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await recurse(full, relFull);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        out.push(relFull);
      }
    }
  }
  await recurse(root, "");
  return out;
}
