"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { MindGraph } from "@nova/mindgraph-view";
import type { KnowledgeGraph, TraceModeProps, TraceTraversedEdge } from "@nova/mindgraph-view";
import type { LoadedTrace, TraceIndexEntry } from "@nova/mindgraph-trace";

interface ViewerClientProps {
  graph: KnowledgeGraph;
  traceIndex: TraceIndexEntry[];
  /** All loaded traces keyed by trace_id. For the synthetic-fixtures phase we pre-load everything. */
  tracesById: Record<string, LoadedTrace>;
  /** SSR-loaded initial state from ~/.config/nanoclaw/tracing.json. */
  initialTracingEnabled: boolean;
}

type Grouping = "chronological" | "topical";

export function ViewerClient({
  graph,
  traceIndex,
  tracesById,
  initialTracingEnabled,
}: ViewerClientProps) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<Grouping>("chronological");
  const [compact, setCompact] = useState<boolean>(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [selectedEdge, setSelectedEdge] = useState<TraceTraversedEdge | null>(null);
  const [tracingEnabled, setTracingEnabled] = useState<boolean>(initialTracingEnabled);
  const [tracingUpdating, setTracingUpdating] = useState<boolean>(false);

  const toggleTracing = async () => {
    if (tracingUpdating) return;
    setTracingUpdating(true);
    try {
      const res = await fetch("/api/tracing-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !tracingEnabled }),
      });
      if (res.ok) {
        const data = (await res.json()) as { enabled: boolean };
        setTracingEnabled(data.enabled);
      }
    } finally {
      setTracingUpdating(false);
    }
  };

  const selectedTrace = selectedTraceId ? tracesById[selectedTraceId] ?? null : null;

  // Clear the selected edge panel whenever the trace changes or is cleared.
  // Otherwise stale edge details from a prior trace linger in the panel.
  React.useEffect(() => {
    setSelectedEdge(null);
  }, [selectedTraceId]);

  // Actual non-anchor event count from the loaded trace. Matches the spec's
  // `index.node_count`: the length of the ordered `nodes` list, which
  // explicitly excludes entry/exit anchors. Recomputed from raw events so a
  // bad `node_count` in the index can't mislead. Falls back to the index
  // value only when the trace isn't loaded (future on-demand phase).
  const actualNodeCountById = useMemo(() => {
    const m = new Map<string, number>();
    for (const id in tracesById) {
      const trace = tracesById[id]!;
      const nonAnchor = trace.events.filter(
        (e) => e.event !== "entry" && e.event !== "exit",
      ).length;
      m.set(id, nonAnchor);
    }
    return m;
  }, [tracesById]);

  // Human-readable row labels extracted from the loaded trace's entry event
  // (which carries the *full* user_message, not the ~80-char truncated summary
  // that sits in the index). For traces that are just raw text (not Discord),
  // the extraction is a no-op and the list falls back to `entry.summary`.
  const humanSummaryById = useMemo(() => {
    const m = new Map<string, string>();
    for (const id in tracesById) {
      const trace = tracesById[id]!;
      const entryEvent = trace.events.find((e) => e.event === "entry");
      const userMessage =
        (entryEvent?.metadata as { user_message?: unknown } | undefined)
          ?.user_message;
      if (typeof userMessage === "string") {
        const extracted = extractLastMessage(userMessage);
        if (extracted) m.set(id, extracted);
      }
    }
    return m;
  }, [tracesById]);

  // Derived: traceMode props for the graph component.
  const traceMode: TraceModeProps | null = useMemo(() => {
    if (!selectedTrace) return null;
    const nodes = selectedTrace.highlightedNodes;
    let edges = selectedTrace.traversedEdges;
    if (compact) {
      // Collapse consecutive duplicate edges (same from→to, same event) that sit next to each other.
      const collapsed: typeof edges = [];
      for (const e of edges) {
        const prev = collapsed[collapsed.length - 1];
        if (prev && prev.from === e.from && prev.to === e.to && prev.event === e.event) {
          // Skip — already represented. Earlier `order` wins (already sorted).
          continue;
        }
        collapsed.push(e);
      }
      edges = collapsed;
    }
    return { highlightedNodes: nodes, traversedEdges: edges };
  }, [selectedTrace, compact]);

  // Earlier entries that share the selected trace's conversation_id.
  // Surfaces the original intent when the selected trace is a short
  // confirmation turn (e.g. "yes") that carries an MCP write — the earlier
  // request turn is the context the reviewer actually wants to see.
  // Undefined when the selected trace has no conversation_id (older traces
  // or fresh-session first turns that closed before SDK init arrived).
  const conversationPeers = useMemo(() => {
    if (!selectedTrace) return [] as TraceIndexEntry[];
    const selectedEntry = traceIndex.find((e) => e.trace_id === selectedTrace.trace_id);
    const convId = selectedEntry?.conversation_id;
    if (!convId) return [] as TraceIndexEntry[];
    return traceIndex
      .filter((e) => e.conversation_id === convId && e.trace_id !== selectedTrace.trace_id)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [selectedTrace, traceIndex]);

  // Topical groups built from the loaded traces' topic_node_id.
  const topicalGroups = useMemo(() => {
    const map = new Map<string, TraceIndexEntry[]>();
    const loose: TraceIndexEntry[] = [];
    for (const entry of traceIndex) {
      const loaded = tracesById[entry.trace_id];
      if (!loaded?.topic_node_id) {
        loose.push(entry);
        continue;
      }
      const bucket = map.get(loaded.topic_node_id) ?? [];
      bucket.push(entry);
      map.set(loaded.topic_node_id, bucket);
    }
    // Sort groups by their most-recent trace timestamp descending.
    const groups = Array.from(map.entries()).map(([topic, entries]) => ({
      topic,
      entries: entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    }));
    groups.sort((a, b) => {
      const aTs = a.entries[0]?.timestamp ?? "";
      const bTs = b.entries[0]?.timestamp ?? "";
      return bTs.localeCompare(aTs);
    });
    return { groups, loose };
  }, [traceIndex, tracesById]);

  return (
    <div style={rootStyle}>
      {sidebarCollapsed ? (
        <aside style={collapsedPanelStyle}>
          <button
            onClick={() => setSidebarCollapsed(false)}
            style={collapsedToggleStyle}
            title="Show traces panel"
          >
            ›
          </button>
          <span style={collapsedLabelStyle}>Traces</span>
        </aside>
      ) : (
      <aside style={panelStyle}>
        <header style={panelHeaderStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
            <div>
              <h2 style={panelTitleStyle}>Traces</h2>
              <p style={panelSubtitleStyle}>{traceIndex.length} recorded</p>
            </div>
            <button
              onClick={() => setSidebarCollapsed(true)}
              style={collapseButtonStyle}
              title="Hide traces panel"
            >
              ‹
            </button>
          </div>
          <button
            onClick={toggleTracing}
            disabled={tracingUpdating}
            style={tracingPillStyle(tracingEnabled, tracingUpdating)}
            title={
              tracingEnabled
                ? "Tracing is on — agents emit trace events (costs a small amount of tokens per request)"
                : "Tracing is off — agents emit nothing, zero token cost. Flip on to capture per-step traces."
            }
          >
            <span style={tracingDotStyle(tracingEnabled)} />
            <span>Tracing: {tracingEnabled ? "On" : "Off"}</span>
            {tracingUpdating && <span style={{ opacity: 0.6 }}>…</span>}
          </button>
        </header>

        <div style={toggleRowStyle}>
          <div style={segmentedStyle}>
            <button
              onClick={() => setGrouping("chronological")}
              style={segmentBtnStyle(grouping === "chronological")}
            >
              Chronological
            </button>
            <button
              onClick={() => setGrouping("topical")}
              style={segmentBtnStyle(grouping === "topical")}
            >
              Topical
            </button>
          </div>

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={compact}
              onChange={(e) => setCompact(e.target.checked)}
            />
            <span>Compact</span>
          </label>
        </div>

        <div style={listStyle}>
          {grouping === "chronological" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {traceIndex.map((entry) => (
                <TraceRow
                  key={entry.trace_id}
                  entry={entry}
                  active={selectedTraceId === entry.trace_id}
                  displayCount={actualNodeCountById.get(entry.trace_id) ?? entry.node_count}
                  displaySummary={humanSummaryById.get(entry.trace_id) ?? entry.summary}
                  onClick={() =>
                    setSelectedTraceId((prev) =>
                      prev === entry.trace_id ? null : entry.trace_id
                    )
                  }
                />
              ))}
            </div>
          )}

          {grouping === "topical" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {topicalGroups.groups.map(({ topic, entries }) => (
                <div key={topic}>
                  <p style={topicHeaderStyle}>
                    {topic.split(":").pop()?.replace(/[-_/]/g, " ") ?? topic}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {entries.map((entry) => (
                      <TraceRow
                        key={entry.trace_id}
                        entry={entry}
                        active={selectedTraceId === entry.trace_id}
                        displayCount={actualNodeCountById.get(entry.trace_id) ?? entry.node_count}
                        displaySummary={humanSummaryById.get(entry.trace_id) ?? entry.summary}
                        onClick={() =>
                          setSelectedTraceId((prev) =>
                            prev === entry.trace_id ? null : entry.trace_id
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
              {topicalGroups.loose.length > 0 && (
                <div>
                  <p style={topicHeaderStyle}>untopiced</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {topicalGroups.loose.map((entry) => (
                      <TraceRow
                        key={entry.trace_id}
                        entry={entry}
                        active={selectedTraceId === entry.trace_id}
                        displayCount={actualNodeCountById.get(entry.trace_id) ?? entry.node_count}
                        displaySummary={humanSummaryById.get(entry.trace_id) ?? entry.summary}
                        onClick={() =>
                          setSelectedTraceId((prev) =>
                            prev === entry.trace_id ? null : entry.trace_id
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {selectedTrace && (
          <div style={selectedSummaryStyle}>
            <p style={sectionLabelStyle}>Selected trace</p>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", lineHeight: 1.4, fontWeight: 500 }}>
              {humanSummaryById.get(selectedTrace.trace_id) || selectedTrace.summary || "(no summary)"}
            </p>
            {(() => {
              const entry = selectedTrace.events.find((e) => e.event === "entry");
              const userMsg = entry?.metadata?.user_message;
              if (typeof userMsg !== "string" || !userMsg) return null;
              const displayMsg = extractLastMessage(userMsg) || userMsg;
              return (
                <blockquote style={userMessageStyle}>
                  <span style={userMessageLabelStyle}>Original request</span>
                  <span style={userMessageBodyStyle}>&ldquo;{displayMsg}&rdquo;</span>
                </blockquote>
              );
            })()}
            {(() => {
              const reasons = selectedTrace.events
                .filter((e) => e.event === "reason")
                .map((e) => (e.metadata as { reason?: unknown } | undefined)?.reason)
                .filter((r): r is string => typeof r === "string" && r.length > 0);
              if (reasons.length === 0) return null;
              return (
                <div style={reasonBlockStyle}>
                  <p style={reasonLabelStyle}>Reasoning</p>
                  {reasons.map((r, i) => (
                    <p key={i} style={reasonBodyStyle}>{r}</p>
                  ))}
                </div>
              );
            })()}
            {(() => {
              const exit = selectedTrace.events.find((e) => e.event === "exit");
              const respText = (exit?.metadata as { response_text?: unknown } | undefined)?.response_text;
              if (typeof respText !== "string" || !respText) return null;
              return (
                <blockquote style={userMessageStyle}>
                  <span style={userMessageLabelStyle}>Response</span>
                  <span style={userMessageBodyStyle}>&ldquo;{respText}&rdquo;</span>
                </blockquote>
              );
            })()}
            {conversationPeers.length > 0 && (
              <div style={conversationBlockStyle}>
                <p style={sectionLabelStyle}>Earlier in this conversation</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {conversationPeers.map((peer) => (
                    <button
                      key={peer.trace_id}
                      onClick={() => setSelectedTraceId(peer.trace_id)}
                      style={conversationPeerStyle}
                    >
                      <span style={conversationPeerSummaryStyle}>
                        {humanSummaryById.get(peer.trace_id) || peer.summary || "(no summary)"}
                      </span>
                      <span style={conversationPeerMetaStyle}>
                        {formatTime(peer.timestamp)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.6875rem", color: "#64748b" }}>
              <span>
                <strong style={{ color: "#0f172a" }}>{selectedTrace.highlightedNodes.length}</strong> nodes
              </span>
              <span>
                <strong style={{ color: "#0f172a" }}>{selectedTrace.traversedEdges.length}</strong> hops
              </span>
              {selectedTrace.incomplete && (
                <span style={{ color: "#b91c1c" }}>incomplete</span>
              )}
            </div>
            <button onClick={() => setSelectedTraceId(null)} style={clearButtonStyle}>
              Clear trace
            </button>
          </div>
        )}
      </aside>
      )}

      <div style={graphWrapStyle}>
        <MindGraph
          graph={graph}
          traceMode={traceMode}
          onTraceEdgeClick={setSelectedEdge}
        />
      </div>

      {selectedEdge && (
        <EdgeDetailPanel edge={selectedEdge} onClose={() => setSelectedEdge(null)} />
      )}
    </div>
  );
}

// ── Edge Detail Panel ──────────────────────────────────────────

function EdgeDetailPanel({
  edge,
  onClose,
}: {
  edge: TraceTraversedEdge;
  onClose: () => void;
}) {
  // Pull `reason` out for prominent display and show remaining metadata generically.
  // Other conventional fields (user_message, response_preview) are shown elsewhere.
  const reason = typeof edge.metadata?.reason === "string" ? (edge.metadata.reason as string) : null;
  // MCP-call edges carry call args (mcp_args) and may carry the paired result
  // (mcp_response) — these are rendered separately as code blocks.
  const mcpArgs = edge.metadata?.mcp_args;
  const mcpResponse = edge.metadata?.mcp_response;
  const mcpKind = typeof edge.metadata?.mcp_kind === "string" ? (edge.metadata.mcp_kind as string) : null;
  const hiddenKeys = new Set([
    "reason", "user_message", "response_preview",
    "mcp_args", "mcp_response", "mcp_server", "mcp_tool", "mcp_kind",
  ]);
  const metaEntries = edge.metadata
    ? Object.entries(edge.metadata).filter(([k]) => !hiddenKeys.has(k))
    : [];

  return (
    <aside style={edgePanelStyle}>
      <div style={edgePanelHeaderStyle}>
        <div>
          <span style={stepBadgeStyle}>Step {edge.order + 1}</span>
          <h3 style={{ margin: "0.5rem 0 0", fontSize: "0.9375rem", fontWeight: 600 }}>
            {formatEventName(edge.event)}
          </h3>
        </div>
        <button onClick={onClose} style={closeButtonStyle} aria-label="Close">
          ×
        </button>
      </div>

      {reason && (
        <div style={reasonBlockStyle}>
          <p style={reasonLabelStyle}>Reason</p>
          <p style={reasonBodyStyle}>{reason}</p>
        </div>
      )}

      {mcpKind && (
        <div style={edgeFieldBlockStyle}>
          <p style={sectionLabelStyle}>Kind</p>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: mcpKind === "write" ? "#b91c1c" : "#0f172a", fontWeight: mcpKind === "write" ? 600 : 400 }}>{mcpKind}</p>
        </div>
      )}

      {mcpArgs !== undefined && (
        <div style={edgeFieldBlockStyle}>
          <p style={sectionLabelStyle}>Args</p>
          <pre style={codeBlockStyle}>{JSON.stringify(mcpArgs, null, 2)}</pre>
        </div>
      )}

      {mcpResponse !== undefined && (
        <div style={edgeFieldBlockStyle}>
          <p style={sectionLabelStyle}>Result</p>
          <pre style={codeBlockStyle}>{JSON.stringify(mcpResponse, null, 2)}</pre>
        </div>
      )}

      <div style={edgeFieldBlockStyle}>
        <p style={sectionLabelStyle}>From</p>
        <p style={nodeIdStyle}>{edge.from}</p>
      </div>

      <div style={edgeFieldBlockStyle}>
        <p style={sectionLabelStyle}>To</p>
        <p style={nodeIdStyle}>{edge.to}</p>
      </div>

      {edge.timestamp && (
        <div style={edgeFieldBlockStyle}>
          <p style={sectionLabelStyle}>Timestamp</p>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "#0f172a" }}>
            {new Date(edge.timestamp).toLocaleString("en-US")}
          </p>
        </div>
      )}

      {metaEntries.length > 0 && (
        <div style={edgeFieldBlockStyle}>
          <p style={sectionLabelStyle}>Metadata</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {metaEntries.map(([k, v]) => (
              <div key={k} style={{ fontSize: "0.75rem" }}>
                <span style={{ color: "#64748b" }}>{k}: </span>
                <span style={{ color: "#0f172a" }}>
                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function formatEventName(ev: string): string {
  switch (ev) {
    case "read":
      return "Read";
    case "write":
      return "Write";
    case "handoff_out":
      return "Handoff → outbound";
    case "handoff_in":
      return "Handoff ← inbound";
    default:
      return ev;
  }
}

// ── Row ─────────────────────────────────────────────────────────

function TraceRow({
  entry,
  active,
  displayCount,
  displaySummary,
  onClick,
}: {
  entry: TraceIndexEntry;
  active: boolean;
  displayCount: number;
  displaySummary: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={rowStyle(active)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <p style={rowSummaryStyle}>{displaySummary || "(no summary)"}</p>
        <span style={rowCountStyle}>{displayCount}</span>
      </div>
      <div style={rowMetaStyle}>
        <span>{formatTime(entry.timestamp)}</span>
        <span>·</span>
        <span>{entry.agents.join(", ")}</span>
      </div>
    </button>
  );
}

// NanoClaw wraps channel-originated prompts in
// `<context.../><messages><message sender="..." time="...">REAL QUESTION</message>...</messages>`.
// The `summary` stored in the index is truncated to ~80 chars of the wrapped
// prompt, so every trace list row starts with the same envelope. Extract the
// last `<message>` body (the latest ask in a batch) from the full wrapped
// text to produce a human-readable row label.
function extractLastMessage(wrapped: string): string {
  // NOTE: `<message(?:\s[^>]*)?>` — the `\s` after "message" prevents the
  // outer `<messages>` wrapper tag from matching (since the next char there
  // is `s`, not whitespace). Without this guard the regex matches from
  // `<messages>` and captures nested tags as content, breaking single-message
  // prompts (the only "match" is the garbage wrapper body).
  const matches = [
    ...wrapped.matchAll(/<message(?:\s[^>]*)?>([\s\S]*?)<\/message>/g),
  ];
  if (matches.length === 0) return "";
  const last = matches[matches.length - 1]![1] ?? "";
  return last
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Manually format the timestamp instead of relying on `toLocaleString`.
// Every JS engine's Intl.DateTimeFormat output varies subtly: Node + Chrome
// emit "Apr 18, 5:19 PM" for en-US with these field options, but Safari
// emits "Apr 18 at 5:19 PM". The difference breaks SSR hydration (server
// renders one, client renders the other). Building from parts gives
// byte-identical output on every engine.
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const month = MONTH_SHORT[d.getMonth()]!;
    const day = d.getDate();
    const hour24 = d.getHours();
    const minute = String(d.getMinutes()).padStart(2, "0");
    const ampm = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${month} ${day}, ${hour12}:${minute} ${ampm}`;
  } catch {
    return iso;
  }
}

// ── Styles ──────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  display: "flex",
  height: "100vh",
  width: "100%",
  background: "#ffffff",
};

const panelStyle: React.CSSProperties = {
  width: "18rem",
  flexShrink: 0,
  borderRight: "1px solid #e2e8f0",
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const panelHeaderStyle: React.CSSProperties = {
  padding: "1rem 1rem 0.5rem",
};

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1rem",
  fontWeight: 600,
  color: "#0f172a",
};

const panelSubtitleStyle: React.CSSProperties = {
  margin: "0.125rem 0 0",
  fontSize: "0.75rem",
  color: "#64748b",
};

const toggleRowStyle: React.CSSProperties = {
  padding: "0.5rem 1rem 0.75rem",
  borderBottom: "1px solid #e2e8f0",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const segmentedStyle: React.CSSProperties = {
  display: "inline-flex",
  background: "#e2e8f0",
  padding: "0.125rem",
  borderRadius: "0.375rem",
  width: "100%",
};

function segmentBtnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "0.25rem 0.5rem",
    fontSize: "0.75rem",
    fontWeight: 500,
    border: "none",
    borderRadius: "0.25rem",
    background: active ? "#ffffff" : "transparent",
    color: active ? "#0f172a" : "#64748b",
    cursor: "pointer",
    boxShadow: active ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
  };
}

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
  fontSize: "0.75rem",
  color: "#475569",
  cursor: "pointer",
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "0.5rem 0.75rem",
};

const topicHeaderStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  margin: "0 0 0.25rem 0.25rem",
};

function rowStyle(active: boolean): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "0.5rem 0.625rem",
    background: active ? "#e0f2fe" : "#ffffff",
    border: `1px solid ${active ? "#7dd3fc" : "#e2e8f0"}`,
    borderRadius: "0.375rem",
    cursor: "pointer",
    color: "#0f172a",
  };
}

const rowSummaryStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "#0f172a",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  flex: 1,
  minWidth: 0,
};

const rowCountStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  background: "#e2e8f0",
  color: "#475569",
  padding: "0.0625rem 0.375rem",
  borderRadius: "9999px",
  flexShrink: 0,
};

const rowMetaStyle: React.CSSProperties = {
  marginTop: "0.25rem",
  fontSize: "0.6875rem",
  color: "#64748b",
  display: "flex",
  gap: "0.375rem",
};

const selectedSummaryStyle: React.CSSProperties = {
  borderTop: "1px solid #e2e8f0",
  background: "#ffffff",
  padding: "0.75rem 1rem",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "0 0 0.375rem",
};

const clearButtonStyle: React.CSSProperties = {
  marginTop: "0.5rem",
  width: "100%",
  padding: "0.375rem",
  fontSize: "0.75rem",
  fontWeight: 500,
  background: "transparent",
  color: "#64748b",
  border: "1px solid #cbd5e1",
  borderRadius: "0.375rem",
  cursor: "pointer",
};

const graphWrapStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
};

const collapsedPanelStyle: React.CSSProperties = {
  width: "2rem",
  flexShrink: 0,
  borderRight: "1px solid #e2e8f0",
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "0.5rem 0",
  gap: "0.5rem",
};

const collapsedToggleStyle: React.CSSProperties = {
  width: "1.5rem",
  height: "1.5rem",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#475569",
  borderRadius: "0.25rem",
  cursor: "pointer",
  fontSize: "0.9rem",
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const collapsedLabelStyle: React.CSSProperties = {
  writingMode: "vertical-rl",
  textOrientation: "mixed",
  fontSize: "0.6875rem",
  color: "#64748b",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

const collapseButtonStyle: React.CSSProperties = {
  width: "1.5rem",
  height: "1.5rem",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#475569",
  borderRadius: "0.25rem",
  cursor: "pointer",
  fontSize: "0.9rem",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const edgePanelStyle: React.CSSProperties = {
  width: "18rem",
  flexShrink: 0,
  borderLeft: "1px solid #e2e8f0",
  background: "#ffffff",
  padding: "1rem",
  overflowY: "auto",
};

const edgePanelHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  marginBottom: "1rem",
  gap: "0.5rem",
};

const stepBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "0.125rem 0.5rem",
  fontSize: "0.6875rem",
  fontWeight: 700,
  background: "#0f172a",
  color: "#ffffff",
  borderRadius: "9999px",
  letterSpacing: "0.02em",
};

const closeButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#64748b",
  fontSize: "1.25rem",
  lineHeight: 1,
  cursor: "pointer",
  padding: "0 0.25rem",
  flexShrink: 0,
};

const edgeFieldBlockStyle: React.CSSProperties = {
  marginBottom: "0.875rem",
};

const codeBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: "0.5rem 0.625rem",
  background: "#0f172a",
  color: "#e2e8f0",
  borderRadius: "0.25rem",
  fontSize: "0.6875rem",
  fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
  lineHeight: 1.4,
  overflow: "auto",
  maxHeight: "20rem",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const nodeIdStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
  color: "#0f172a",
  wordBreak: "break-all",
};

const reasonBlockStyle: React.CSSProperties = {
  marginBottom: "1rem",
  padding: "0.625rem 0.75rem",
  background: "#f0f9ff",
  borderLeft: "3px solid #38bdf8",
  borderRadius: "0 0.25rem 0.25rem 0",
};

const conversationBlockStyle: React.CSSProperties = {
  marginBottom: "1rem",
};

const conversationPeerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.125rem",
  padding: "0.375rem 0.5rem",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "0.25rem",
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
};

const conversationPeerSummaryStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#0f172a",
  lineHeight: 1.3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  width: "100%",
};

const conversationPeerMetaStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  color: "#64748b",
};

const reasonLabelStyle: React.CSSProperties = {
  margin: "0 0 0.25rem",
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: "#0284c7",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const reasonBodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  lineHeight: 1.45,
  color: "#0f172a",
};

const userMessageStyle: React.CSSProperties = {
  margin: "0 0 0.625rem",
  padding: "0.5rem 0.625rem",
  background: "#f8fafc",
  borderLeft: "3px solid #94a3b8",
  borderRadius: "0 0.25rem 0.25rem 0",
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const userMessageLabelStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const userMessageBodyStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  lineHeight: 1.4,
  color: "#0f172a",
  fontStyle: "italic",
};

function tracingPillStyle(enabled: boolean, updating: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    marginTop: "0.5rem",
    width: "100%",
    padding: "0.375rem 0.625rem",
    fontSize: "0.75rem",
    fontWeight: 500,
    border: `1px solid ${enabled ? "#86efac" : "#e2e8f0"}`,
    background: enabled ? "#f0fdf4" : "#ffffff",
    color: enabled ? "#166534" : "#475569",
    borderRadius: "0.375rem",
    cursor: updating ? "wait" : "pointer",
    opacity: updating ? 0.7 : 1,
  };
}

function tracingDotStyle(enabled: boolean): React.CSSProperties {
  return {
    display: "inline-block",
    width: "0.5rem",
    height: "0.5rem",
    borderRadius: "50%",
    background: enabled ? "#22c55e" : "#cbd5e1",
    boxShadow: enabled ? "0 0 0 2px #bbf7d0" : "none",
  };
}
