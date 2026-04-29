"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import "d3-transition"; // augments d3-selection with .transition()
import { zoom as d3Zoom, zoomIdentity } from "d3-zoom";
import { drag } from "d3-drag";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceRadial,
  type Simulation,
} from "d3-force";
import type {
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
  MindGraphProps,
  NodeTypeConfig,
  NodeTypeRegistry,
  ScopeConfig,
  TraceHighlightedNode,
  TraceTraversedEdge,
} from "./types";
import { AGENT_FLEET_REGISTRY } from "./default-registry";
import { renderMarkdown } from "./markdown-render";

// Trace-mode palette. Roles apply to nodes; events apply to edges.
const TRACE_ROLE_COLORS: Record<TraceHighlightedNode["role"], string> = {
  entry: "#16A34A",          // green
  intermediate: "#3B82F6",   // blue
  exit: "#F97316",           // orange
};

const TRACE_EVENT_COLORS: Record<string, string> = {
  read: "#60A5FA",           // blue-400
  write: "#A78BFA",          // violet-400
  handoff_out: "#F59E0B",    // amber
  handoff_in: "#F59E0B",
};

function edgeKey(from: string, to: string): string {
  return `${from}→${to}`;
}

// D3 augments node objects with simulation fields during a tick.
// Keep a local superset type so TypeScript doesn't complain.
type SimNode = GraphNode & {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
};

type SimEdge = Omit<GraphEdge, "source" | "target"> & {
  source: string | SimNode;
  target: string | SimNode;
};

const DEFAULT_NODE_COLOR = "#6B7280";
const FALLBACK_TYPE_CFG: NodeTypeConfig = {
  label: "Wiki",
  color: DEFAULT_NODE_COLOR,
  icon: "?",
};

function typeCfg(registry: NodeTypeRegistry, type: string): NodeTypeConfig {
  return registry[type] ?? registry.wiki ?? FALLBACK_TYPE_CFG;
}

function nodeColor(registry: NodeTypeRegistry, type: string): string {
  return typeCfg(registry, type).color;
}

function nodeRadius(
  node: GraphNode,
  linkCount: number,
  registry: NodeTypeRegistry
): number {
  const cfg = typeCfg(registry, node.type);
  if (cfg.anchor === "center") return 28;
  if (cfg.anchor === "ring") return 22;
  return Math.max(12, Math.min(20, 10 + linkCount * 2));
}

// Scopes whose wiki/project_doc content belongs in the center (project-core
// and fleet-wide shared content). Anything scoped to a specific agent gets
// pushed to the outer ring even if its type would normally anchor center.
const CENTER_SCOPES = new Set(["project", "mastermind"]);

function effectiveAnchor(
  node: GraphNode,
  registry: NodeTypeRegistry
): NodeTypeConfig["anchor"] {
  // Per-node override via frontmatter `properties.anchor`. Lets a fleet-wide
  // hub node (e.g. `<master>:roster`) sit at center even though its scope
  // would normally push it outward.
  const override = node.properties?.anchor;
  if (override === "center" || override === "ring" || override === "outer") {
    return override;
  }
  const cfg = typeCfg(registry, node.type);
  if (cfg.anchor === "ring") return "ring";
  if (node.scope && !CENTER_SCOPES.has(node.scope)) return "outer";
  return cfg.anchor;
}

// ── Component ──────────────────────────────────────────────

export function MindGraph(props: MindGraphProps): React.ReactElement {
  const {
    graph,
    nodeTypes = AGENT_FLEET_REGISTRY,
    detailRenderers,
    scopes,
    onNodeSelect,
    traceMode,
    onTraceEdgeClick,
  } = props;

  // Precompute trace lookup maps. Null when trace mode is inactive.
  const traceMaps = useMemo(() => {
    if (!traceMode) return null;
    const highlightedById = new Map<string, TraceHighlightedNode>(
      traceMode.highlightedNodes.map((n) => [n.node_id, n])
    );
    // Edge lookup: first edge (lowest order) wins for any (from,to) pair.
    const traversedByKey = new Map<string, TraceTraversedEdge>();
    for (const e of traceMode.traversedEdges) {
      const key = edgeKey(e.from, e.to);
      const existing = traversedByKey.get(key);
      if (!existing || e.order < existing.order) traversedByKey.set(key, e);
    }
    return { highlightedById, traversedByKey };
  }, [traceMode]);

  // Synthetic trace data: ghost nodes and edges for trace references that
  // don't exist in the wiki graph. Without these, traversal hops to unwritten
  // topic pages (or edges with no semantic counterpart) would be invisible.
  // Ghost elements are marked via properties._trace_ghost so the renderer can
  // style them with dashed outlines.
  const syntheticTraceData = useMemo(() => {
    if (!traceMode) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    const existingIds = new Set(graph.nodes.map((n) => n.id));
    const existingEdgeKeys = new Set(
      graph.links.map((l) => {
        const s = typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
        const t = typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
        return edgeKey(s, t);
      })
    );

    const ghostNodes: GraphNode[] = [];
    const seenGhost = new Set<string>();
    for (const hn of traceMode.highlightedNodes) {
      if (existingIds.has(hn.node_id) || seenGhost.has(hn.node_id)) continue;
      seenGhost.add(hn.node_id);
      const parts = hn.node_id.split(":");
      const scope = parts[0] ?? "";
      const slug = parts.slice(1).join(":") || hn.node_id;
      ghostNodes.push({
        id: hn.node_id,
        label: slug,
        type: "wiki",
        properties: { _trace_ghost: true },
        source: "inferred",
        scope,
      });
    }

    const ghostEdges: GraphEdge[] = [];
    const seenEdge = new Set<string>();
    for (const te of traceMode.traversedEdges) {
      const k = edgeKey(te.from, te.to);
      if (existingEdgeKeys.has(k) || seenEdge.has(k)) continue;
      seenEdge.add(k);
      ghostEdges.push({
        source: te.from,
        target: te.to,
        relation: "(traversal)",
        properties: { _trace_ghost: true },
      });
    }

    return { nodes: ghostNodes, edges: ghostEdges };
  }, [traceMode, graph]);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<Simulation<SimNode, SimEdge> | null>(null);

  const [selectedNode, setSelectedNodeState] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTypeFilters, setActiveTypeFilters] = useState<Set<string>>(
    new Set()
  );
  const [activeScopeFilters, setActiveScopeFilters] = useState<Set<string>>(
    new Set()
  );

  const setSelectedNode = (n: GraphNode | null) => {
    setSelectedNodeState(n);
    onNodeSelect?.(n);
  };

  // Auto-derive scopes from the data if the caller didn't provide them.
  const resolvedScopes: ScopeConfig[] = useMemo(() => {
    if (scopes && scopes.length > 0) return scopes;
    const seen = new Map<string, ScopeConfig>();
    for (const n of graph.nodes) {
      if (!seen.has(n.scope)) {
        seen.set(n.scope, {
          id: n.scope,
          label: n.scope_label ?? n.scope,
        });
      }
    }
    return Array.from(seen.values());
  }, [graph.nodes, scopes]);

  // Count how many edges touch each node — drives node radius.
  const linkCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of graph.links) {
      const s = typeof link.source === "string" ? link.source : (link.source as GraphNode).id;
      const t = typeof link.target === "string" ? link.target : (link.target as GraphNode).id;
      counts.set(s, (counts.get(s) ?? 0) + 1);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return counts;
  }, [graph.links]);

  // Apply scope/type/search filters; keeps the full graph intact and returns
  // a filtered view for rendering. Filter bar counts use `graph`, not this.
  const filteredGraph: KnowledgeGraph = useMemo(() => {
    let nodes = graph.nodes;
    let links = graph.links;

    if (activeScopeFilters.size > 0) {
      const nodeIds = new Set(
        nodes.filter((n) => activeScopeFilters.has(n.scope)).map((n) => n.id)
      );
      nodes = nodes.filter((n) => nodeIds.has(n.id));
      links = links.filter((l) => {
        const s = typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
        const t = typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
        return nodeIds.has(s) && nodeIds.has(t);
      });
    }

    if (activeTypeFilters.size > 0) {
      const nodeIds = new Set(
        nodes.filter((n) => activeTypeFilters.has(n.type)).map((n) => n.id)
      );
      nodes = nodes.filter((n) => nodeIds.has(n.id));
      links = links.filter((l) => {
        const s = typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
        const t = typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
        return nodeIds.has(s) && nodeIds.has(t);
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchIds = new Set(
        nodes
          .filter(
            (n) =>
              n.label.toLowerCase().includes(q) ||
              n.type.toLowerCase().includes(q)
          )
          .map((n) => n.id)
      );
      // Include neighbors so matches don't appear floating alone.
      for (const link of links) {
        const s = typeof link.source === "string" ? link.source : (link.source as GraphNode).id;
        const t = typeof link.target === "string" ? link.target : (link.target as GraphNode).id;
        if (matchIds.has(s)) matchIds.add(t);
        if (matchIds.has(t)) matchIds.add(s);
      }
      nodes = nodes.filter((n) => matchIds.has(n.id));
      links = links.filter((l) => {
        const s = typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
        const t = typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
        return matchIds.has(s) && matchIds.has(t);
      });
    }

    return { ...graph, nodes, links };
  }, [graph, activeTypeFilters, activeScopeFilters, searchQuery]);

  // ── D3 rendering ─────────────────────────────────────────

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = select(svgRef.current);
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.selectAll("*").remove();

    if (filteredGraph.nodes.length === 0) return;

    // Deep clone so D3's mutations don't bleed back into props.
    // In trace mode, merge in synthetic ghost nodes/edges for trace references
    // that don't exist in the wiki graph. Ghost nodes have properties._trace_ghost=true.
    const baseNodes = [...filteredGraph.nodes, ...syntheticTraceData.nodes];
    const baseLinks = [...filteredGraph.links, ...syntheticTraceData.edges];
    const nodes: SimNode[] = baseNodes.map((n) => ({ ...n }));
    const nodeIdSet = new Set(nodes.map((n) => n.id));
    const links: SimEdge[] = baseLinks
      .map((l) => ({
        ...l,
        source: typeof l.source === "string" ? l.source : (l.source as GraphNode).id,
        target: typeof l.target === "string" ? l.target : (l.target as GraphNode).id,
      }))
      .filter(
        (l) =>
          nodeIdSet.has(l.source as string) && nodeIdSet.has(l.target as string)
      );

    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoomBehavior);

    const g = svg.append("g");

    const defs = svg.append("defs");
    defs
      .append("marker")
      .attr("id", "mindgraph-arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 8)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4 L8,0 L0,4")
      .attr("fill", "#94A3B8")
      .attr("stroke", "none");

    function edgeWidth(d: SimEdge): number {
      if (d.confidence === "EXTRACTED") return 3;
      if (d.confidence === "INFERRED") return 2;
      return 1;
    }

    function edgeOpacity(d: SimEdge): number {
      if (d.confidence === "EXTRACTED") return 0.7;
      if (d.confidence === "INFERRED") return 0.45;
      return 0.25;
    }

    // Helper: does this edge participate in the active trace?
    function traversedFor(d: SimEdge): TraceTraversedEdge | undefined {
      if (!traceMaps) return undefined;
      const s = typeof d.source === "string" ? d.source : (d.source as SimNode).id;
      const t = typeof d.target === "string" ? d.target : (d.target as SimNode).id;
      return traceMaps.traversedByKey.get(edgeKey(s, t));
    }

    // Does this edge touch a highlighted node? Used to surface the context edges
    // around the trace without fully hiding them — preserves the focus on the
    // traversal while letting highlighted nodes' broader connections stay visible.
    function touchesHighlighted(d: SimEdge): boolean {
      if (!traceMaps) return false;
      const s = typeof d.source === "string" ? d.source : (d.source as SimNode).id;
      const t = typeof d.target === "string" ? d.target : (d.target as SimNode).id;
      return traceMaps.highlightedById.has(s) || traceMaps.highlightedById.has(t);
    }

    const link = g
      .append("g")
      .selectAll<SVGPathElement, SimEdge>("path")
      .data(links)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", (d) => {
        const tr = traversedFor(d);
        if (tr) return TRACE_EVENT_COLORS[tr.event] ?? "#3B82F6";
        return "#CBD5E1";
      })
      .attr("stroke-width", (d) => {
        if (traversedFor(d)) return 3;
        return edgeWidth(d);
      })
      .attr("stroke-opacity", (d) => {
        if (!traceMaps) return edgeOpacity(d);
        if (traversedFor(d)) return 0.9;
        if (touchesHighlighted(d)) return 0.2;
        return 0.05;
      })
      .attr("stroke-linecap", "round")
      // In trace mode, hide arrowheads on non-traversed edges — they're visually
      // louder than the faded strokes. Traversed edges keep the arrowhead to
      // signal direction of traversal.
      .attr("marker-end", (d) => {
        if (!traceMaps) return "url(#mindgraph-arrowhead)";
        return traversedFor(d) ? "url(#mindgraph-arrowhead)" : "none";
      })
      // Ghost edges (traversal hops that don't exist in the wiki graph) render
      // dashed to distinguish them from real semantic edges.
      .attr("stroke-dasharray", (d) =>
        d.properties?._trace_ghost ? "6 4" : ""
      );

    const edgeLabel = g
      .append("g")
      .selectAll<SVGTextElement, SimEdge>("text")
      .data(links)
      .join("text")
      .attr("font-size", 9)
      .attr("fill", "#94A3B8")
      .attr("text-anchor", "middle")
      .attr("dy", -4)
      .attr("opacity", (d) => {
        if (!traceMaps) return 1;
        if (traversedFor(d)) return 1;
        if (touchesHighlighted(d)) return 0.3;
        return 0.05;
      })
      .text((d) => d.relation);

    // Traversal-order badges. One per traversed edge, positioned at midpoint.
    type BadgeDatum = { edge: SimEdge; order: number };
    const badgeData: BadgeDatum[] = traceMaps
      ? links
          .map((l) => {
            const tr = traversedFor(l);
            return tr ? { edge: l, order: tr.order + 1 } : null;
          })
          .filter((x): x is BadgeDatum => x !== null)
      : [];

    const orderBadgeGroup = g
      .append("g")
      .selectAll<SVGGElement, BadgeDatum>("g")
      .data(badgeData)
      .join("g")
      .attr("cursor", onTraceEdgeClick ? "pointer" : "default")
      .on("click", (_, b) => {
        if (!onTraceEdgeClick || !traceMaps) return;
        const src = b.edge.source as SimNode;
        const tgt = b.edge.target as SimNode;
        const sid = typeof b.edge.source === "string" ? (b.edge.source as string) : src.id;
        const tid = typeof b.edge.target === "string" ? (b.edge.target as string) : tgt.id;
        const hit = traceMaps.traversedByKey.get(edgeKey(sid, tid));
        if (hit) onTraceEdgeClick(hit);
      });

    orderBadgeGroup
      .append("circle")
      .attr("r", 10)
      .attr("fill", "#0f172a")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.5);

    orderBadgeGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", 10)
      .attr("font-weight", 700)
      .attr("fill", "#ffffff")
      .attr("pointer-events", "none")
      .text((d) => String(d.order));

    const node = g
      .append("g")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        drag<SVGGElement, SimNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Main circle with optional stale treatment (red ring, faded).
    // In trace mode, highlighted nodes get a role-colored ring and full opacity;
    // non-highlighted nodes fade to 0.15.
    function nodeOpacity(d: SimNode): number {
      if (traceMaps) {
        return traceMaps.highlightedById.has(d.id) ? 1 : 0.15;
      }
      return d.properties._stale ? 0.4 : 0.9;
    }

    function nodeStroke(d: SimNode): string {
      if (traceMaps) {
        const hit = traceMaps.highlightedById.get(d.id);
        if (hit) return TRACE_ROLE_COLORS[hit.role];
      }
      return d.properties._stale ? "#EF4444" : nodeColor(nodeTypes, d.type);
    }

    function nodeStrokeWidth(d: SimNode): number {
      if (traceMaps && traceMaps.highlightedById.has(d.id)) return 4;
      return d.properties._stale ? 3 : 2;
    }

    function nodeStrokeOpacity(d: SimNode): number {
      if (traceMaps && traceMaps.highlightedById.has(d.id)) return 1;
      return 0.5;
    }

    node
      .append("circle")
      .attr("r", (d) => nodeRadius(d, linkCounts.get(d.id) ?? 0, nodeTypes))
      .attr("fill", (d) =>
        d.properties._trace_ghost ? "#F1F5F9" : nodeColor(nodeTypes, d.type)
      )
      .attr("stroke", (d) => nodeStroke(d))
      .attr("stroke-width", (d) => nodeStrokeWidth(d))
      .attr("stroke-opacity", (d) => nodeStrokeOpacity(d))
      .attr("stroke-dasharray", (d) => (d.properties._trace_ghost ? "4 3" : ""))
      .attr("opacity", (d) => nodeOpacity(d))
      .on("mouseover", function () {
        // Suppress the subtle hover-stroke in trace mode — the role ring is already bold.
        if (traceMaps) return;
        select(this).attr("stroke-width", 4).attr("stroke-opacity", 1);
      })
      .on("mouseout", function (_, d) {
        if (traceMaps) return;
        select(this)
          .attr("stroke-width", d.properties._stale ? 3 : 2)
          .attr("stroke-opacity", 0.5);
      });

    // Icon / glyph inside the circle. Ghost nodes show a faded "?" instead of
    // the type icon, since their type is synthetic and they aren't a real wiki node.
    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", (d) => {
        const cfg = typeCfg(nodeTypes, d.type);
        return cfg.anchor === "center" ? 16 : 12;
      })
      .attr("fill", (d) => (d.properties._trace_ghost ? "#94A3B8" : "white"))
      .attr("pointer-events", "none")
      .text((d) =>
        d.properties._trace_ghost ? "?" : typeCfg(nodeTypes, d.type).icon
      );

    // Label under the circle.
    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr(
        "dy",
        (d) => nodeRadius(d, linkCounts.get(d.id) ?? 0, nodeTypes) + 14
      )
      .attr("font-size", 11)
      .attr("font-weight", 500)
      .attr("fill", "#374151")
      .attr("pointer-events", "none")
      .text((d) =>
        d.label.length > 20 ? d.label.substring(0, 18) + "..." : d.label
      );

    node.on("click", (_, d) => {
      setSelectedNode(d);
    });

    // Neighborhood highlight on hover — keeps dense graphs readable by dimming
    // everything outside the hovered node's 1-hop neighborhood.
    const neighborhood = new Map<string, { neighbors: Set<string>; edges: Set<number> }>();
    links.forEach((l, i) => {
      const sid = typeof l.source === "string" ? l.source : (l.source as SimNode).id;
      const tid = typeof l.target === "string" ? l.target : (l.target as SimNode).id;
      if (!neighborhood.has(sid)) neighborhood.set(sid, { neighbors: new Set(), edges: new Set() });
      if (!neighborhood.has(tid)) neighborhood.set(tid, { neighbors: new Set(), edges: new Set() });
      neighborhood.get(sid)!.neighbors.add(tid);
      neighborhood.get(sid)!.edges.add(i);
      neighborhood.get(tid)!.neighbors.add(sid);
      neighborhood.get(tid)!.edges.add(i);
    });

    node
      .on("mouseenter", function (_, d) {
        // In trace mode, the role ring + grayed non-participants is the focal treatment —
        // skip the neighborhood fade so it doesn't fight with the trace highlight.
        if (traceMaps) return;
        const nbd = neighborhood.get(d.id) ?? { neighbors: new Set<string>(), edges: new Set<number>() };
        node
          .transition()
          .duration(120)
          .style("opacity", (n) => (n.id === d.id || nbd.neighbors.has(n.id) ? 1 : 0.15));
        link
          .transition()
          .duration(120)
          .style("opacity", (_, i) => (nbd.edges.has(i) ? 1 : 0.08));
        edgeLabel
          .transition()
          .duration(120)
          .style("opacity", (_, i) => (nbd.edges.has(i) ? 1 : 0.08));
      })
      .on("mouseleave", function () {
        if (traceMaps) return;
        node.transition().duration(120).style("opacity", null);
        link.transition().duration(120).style("opacity", null);
        edgeLabel.transition().duration(120).style("opacity", null);
      });

    const isLargeGraph = nodes.length > 20;
    const chargeStrength = isLargeGraph ? -500 : -300;
    const linkDistance = isLargeGraph ? 180 : 120;
    const collisionPadding = isLargeGraph ? 14 : 8;
    const cx = width / 2;
    const cy = height / 2;
    const ringR = isLargeGraph ? 360 : 240;
    const outerR = isLargeGraph ? 580 : 400;

    // Pin ring-anchored nodes (agents) evenly around the circle via fx/fy.
    // Link forces from each agent's internal cluster are too strong for a
    // soft radial force to hold the ring shape, so we fix the positions.
    // The existing drag handler clears fx/fy on drag end, so users can pull
    // any agent off the ring and it stays where they drop it.
    //
    // scopeAngle maps agent-name → radial angle of that agent's pin. Keyed by
    // the suffix after the last ":" of the ring node's id (so `project:myagent`
    // → "myagent"), which by convention equals the `scope` of that agent's own
    // Mind nodes (`myagent:soul`, `myagent:goal`, …). The cluster-angle force
    // below uses `n.scope` to pull each outer Mind node toward its parent's
    // radial line.
    const ringNodes = nodes.filter(
      (n) => effectiveAnchor(n, nodeTypes) === "ring"
    );
    const scopeAngle = new Map<string, number>();
    ringNodes.forEach((n, i) => {
      const angle = (i / ringNodes.length) * 2 * Math.PI - Math.PI / 2;
      n.fx = cx + ringR * Math.cos(angle);
      n.fy = cy + ringR * Math.sin(angle);
      const agentKey = n.id.slice(n.id.lastIndexOf(":") + 1);
      scopeAngle.set(agentKey, angle);
    });

    const simulation = forceSimulation<SimNode>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimEdge>(links)
          .id((d) => d.id)
          .distance(linkDistance)
      )
      .force("charge", forceManyBody().strength(chargeStrength))
      .force("center", forceCenter(cx, cy))
      .force(
        "collision",
        forceCollide<SimNode>().radius(
          (d) => nodeRadius(d, linkCounts.get(d.id) ?? 0, nodeTypes) + collisionPadding
        )
      )
      .force(
        "radial-center",
        forceRadial<SimNode>(0, cx, cy).strength((d) =>
          effectiveAnchor(d, nodeTypes) === "center" ? 0.5 : 0
        )
      )
      .force(
        "radial-ring",
        forceRadial<SimNode>(ringR, cx, cy).strength((d) =>
          effectiveAnchor(d, nodeTypes) === "ring" ? 0.4 : 0
        )
      )
      .force(
        "radial-outer",
        forceRadial<SimNode>(outerR, cx, cy).strength((d) =>
          effectiveAnchor(d, nodeTypes) === "outer" ? 0.05 : 0
        )
      )
      // Tangential cluster force: pull each outer Mind node toward its parent
      // agent's radial line. Preserves current radius (so radial-outer still
      // drives distance); only nudges the angle. Weak strength keeps it a
      // suggestion — link/charge forces can still pull children off-angle
      // when that's what the graph shape wants.
      .force("cluster-angle", (alpha: number) => {
        const clusterStrength = 0.08;
        for (const n of nodes) {
          if (effectiveAnchor(n, nodeTypes) !== "outer") continue;
          const targetAngle = scopeAngle.get(n.scope);
          if (targetAngle === undefined) continue;
          if (n.x == null || n.y == null) continue;
          const dx = n.x - cx;
          const dy = n.y - cy;
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r < 1) continue;
          const tx = cx + r * Math.cos(targetAngle);
          const ty = cy + r * Math.sin(targetAngle);
          n.vx = (n.vx ?? 0) + (tx - n.x) * clusterStrength * alpha;
          n.vy = (n.vy ?? 0) + (ty - n.y) * clusterStrength * alpha;
        }
      })
      .on("tick", () => {
        // Physics-based catenary: longer spans droop more.
        link.attr("d", (d) => {
          const src = d.source as SimNode;
          const tgt = d.target as SimNode;
          if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) {
            return "";
          }
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const sagAmount = (dist * dist) / 2000 + dist * 0.06;
          const clampedSag = Math.min(sagAmount, 60);
          const perpX = -(dy / dist) * clampedSag * 0.15;
          const perpY = (dx / dist) * clampedSag * 0.15;
          const midX = (src.x + tgt.x) / 2 + perpX;
          const midY = (src.y + tgt.y) / 2 + clampedSag + perpY;
          const targetR =
            nodeRadius(tgt, linkCounts.get(tgt.id) ?? 0, nodeTypes) + 3;
          const nx = tgt.x - midX;
          const ny = tgt.y - midY;
          const nl = Math.sqrt(nx * nx + ny * ny) || 1;
          const endX = tgt.x - (nx / nl) * targetR;
          const endY = tgt.y - (ny / nl) * targetR;
          return `M${src.x},${src.y} Q${midX},${midY} ${endX},${endY}`;
        });

        edgeLabel
          .attr("x", (d) => {
            const src = d.source as SimNode;
            const tgt = d.target as SimNode;
            if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) return 0;
            const dx = tgt.x - src.x;
            const dy = tgt.y - src.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const perpX =
              -(dy / dist) *
              Math.min((dist * dist) / 2000 + dist * 0.06, 60) *
              0.15;
            return (src.x + tgt.x) / 2 + perpX;
          })
          .attr("y", (d) => {
            const src = d.source as SimNode;
            const tgt = d.target as SimNode;
            if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) return 0;
            const dx = tgt.x - src.x;
            const dy = tgt.y - src.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const sag = Math.min((dist * dist) / 2000 + dist * 0.06, 60);
            const perpY = (dx / dist) * sag * 0.15;
            return (src.y + tgt.y) / 2 + sag + perpY - 4;
          });

        // Position trace order badges at the sagging midpoint of each traversed edge.
        orderBadgeGroup.attr("transform", (b) => {
          const src = b.edge.source as SimNode;
          const tgt = b.edge.target as SimNode;
          if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) return "";
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const sag = Math.min((dist * dist) / 2000 + dist * 0.06, 60);
          const perpX = -(dy / dist) * sag * 0.15;
          const perpY = (dx / dist) * sag * 0.15;
          const mx = (src.x + tgt.x) / 2 + perpX;
          const my = (src.y + tgt.y) / 2 + sag + perpY;
          return `translate(${mx},${my})`;
        });

        node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

    simulationRef.current = simulation;

    // Fit to view after initial settling.
    const fitTimer = window.setTimeout(() => {
      const bounds = (g.node() as SVGGElement | null)?.getBBox();
      if (bounds && bounds.width > 0) {
        const padding = 60;
        const scale = Math.min(
          (width - padding * 2) / bounds.width,
          (height - padding * 2) / bounds.height,
          1.5
        );
        const tx = width / 2 - (bounds.x + bounds.width / 2) * scale;
        const ty = height / 2 - (bounds.y + bounds.height / 2) * scale;
        svg
          .transition()
          .duration(750)
          .call(
            zoomBehavior.transform,
            zoomIdentity.translate(tx, ty).scale(scale)
          );
      }
    }, 2000);

    return () => {
      simulation.stop();
      window.clearTimeout(fitTimer);
    };
  // linkCounts and resolvedScopes are derived from graph — safe to omit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredGraph, nodeTypes, traceMaps, syntheticTraceData, onTraceEdgeClick]);

  // ── Derived counts for the filter bar ─────────────────────

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of graph.nodes) counts[n.type] = (counts[n.type] ?? 0) + 1;
    return counts;
  }, [graph.nodes]);

  const scopeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of graph.nodes) counts[n.scope] = (counts[n.scope] ?? 0) + 1;
    return counts;
  }, [graph.nodes]);

  // ── Related lookup for detail panel ──────────────────────

  const getRelated = (nodeId: string) => {
    const out: Array<{ node: GraphNode; relation: string; direction: "out" | "in" }> = [];
    for (const l of graph.links) {
      const s = typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
      const t = typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
      if (s === nodeId) {
        const tgt = graph.nodes.find((n) => n.id === t);
        if (tgt) out.push({ node: tgt, relation: l.relation, direction: "out" });
      } else if (t === nodeId) {
        const src = graph.nodes.find((n) => n.id === s);
        if (src) out.push({ node: src, relation: l.relation, direction: "in" });
      }
    }
    return out;
  };

  const toggleTypeFilter = (type: string) =>
    setActiveTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  const toggleScopeFilter = (scope: string) =>
    setActiveScopeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={rootStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>MindGraph</h1>
          <p style={subtitleStyle}>
            {graph.nodes.length} nodes · {graph.links.length} connections
          </p>
        </div>
        <div style={filterRowStyle}>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={searchInputStyle}
          />

          {/* Scope chips — one per wiki root. */}
          {resolvedScopes.length > 1 && (
            <div style={chipGroupStyle}>
              {resolvedScopes.map((s) => {
                const count = scopeCounts[s.id] ?? 0;
                if (count === 0) return null;
                const active =
                  activeScopeFilters.size === 0 || activeScopeFilters.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleScopeFilter(s.id)}
                    style={chipStyle(active, s.color ?? "#64748B")}
                  >
                    {s.label}
                    <span style={chipCountStyle}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Type chips — one per node type present in the graph. */}
          <div style={chipGroupStyle}>
            {Object.entries(nodeTypes).map(([type, cfg]) => {
              const count = typeCounts[type] ?? 0;
              if (count === 0) return null;
              const active =
                activeTypeFilters.size === 0 || activeTypeFilters.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleTypeFilter(type)}
                  style={chipStyle(active, cfg.color)}
                >
                  <span style={chipDotStyle(cfg.color)} />
                  {cfg.label}
                  <span style={chipCountStyle}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={bodyStyle}>
        <div ref={containerRef} style={canvasStyle}>
          {filteredGraph.nodes.length === 0 ? (
            <div style={emptyStyle}>
              No nodes match the current filters.
            </div>
          ) : (
            <svg
              ref={svgRef}
              style={{ width: "100%", height: "100%" }}
            />
          )}
        </div>

        {selectedNode && (
          <DetailPanel
            node={selectedNode}
            nodeTypes={nodeTypes}
            scopes={resolvedScopes}
            related={getRelated(selectedNode.id)}
            graph={graph}
            detailRenderers={detailRenderers}
            onClose={() => setSelectedNode(null)}
            onNavigate={(n) => setSelectedNode(n)}
          />
        )}
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────

interface DetailPanelProps {
  node: GraphNode;
  nodeTypes: NodeTypeRegistry;
  scopes: ScopeConfig[];
  related: Array<{ node: GraphNode; relation: string; direction: "out" | "in" }>;
  graph: KnowledgeGraph;
  detailRenderers?: Record<string, (node: GraphNode, ctx: { related: DetailPanelProps["related"]; graph: KnowledgeGraph }) => React.ReactNode>;
  onClose: () => void;
  onNavigate: (node: GraphNode) => void;
}

function DetailPanel({
  node,
  nodeTypes,
  scopes,
  related,
  graph,
  detailRenderers,
  onClose,
  onNavigate,
}: DetailPanelProps) {
  const cfg = typeCfg(nodeTypes, node.type);
  const scope = scopes.find((s) => s.id === node.scope);
  const customBody = detailRenderers?.[node.type]?.(node, { related, graph });

  const content =
    typeof node.properties.content === "string"
      ? (node.properties.content as string)
      : undefined;

  const propertyEntries = Object.entries(node.properties).filter(
    ([k]) => !k.startsWith("_") && k !== "content"
  );

  return (
    <aside style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={panelIconStyle(cfg.color)}>{cfg.icon}</div>
          <div>
            <h3 style={panelTitleStyle}>{node.label}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginTop: "0.125rem" }}>
              <span style={panelTypeStyle}>{cfg.label.toLowerCase()}</span>
              {scope && (
                <>
                  <span style={{ color: "#cbd5e1" }}>·</span>
                  <span style={scopeBadgeStyle(scope.color ?? "#64748B")}>
                    {scope.label}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} style={closeButtonStyle} aria-label="Close">
          ×
        </button>
      </div>

      {customBody ? (
        <div style={{ marginBottom: "1rem" }}>{customBody}</div>
      ) : (
        content && (
          <div style={contentBoxStyle}>{renderMarkdown(content)}</div>
        )
      )}

      {propertyEntries.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <p style={sectionLabelStyle}>Properties</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {propertyEntries.map(([key, value]) => (
              <div key={key} style={{ fontSize: "0.8125rem" }}>
                <span style={{ color: "#64748b" }}>{key.replace(/_/g, " ")}: </span>
                <span style={{ color: "#0f172a" }}>{formatPropertyValue(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Boolean(node.properties._stale) && (
        <div style={staleWarningStyle}>
          This entity no longer exists in its source.
        </div>
      )}

      <div>
        <p style={sectionLabelStyle}>Connections ({related.length})</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {related.map((rel, i) => {
            const relCfg = typeCfg(nodeTypes, rel.node.type);
            return (
              <button
                key={i}
                onClick={() => onNavigate(rel.node)}
                style={relButtonStyle}
              >
                <div style={relIconStyle(relCfg.color)}>{relCfg.icon}</div>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <p style={relLabelStyle}>{rel.node.label}</p>
                  <p style={relRelationStyle}>
                    {rel.direction === "out" ? "→" : "←"} {rel.relation}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function formatPropertyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ── Styles ───────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: "100vh",
  background: "#ffffff",
  color: "#0f172a",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

const headerStyle: React.CSSProperties = {
  padding: "1rem 1.5rem",
  borderBottom: "1px solid #e2e8f0",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1.25rem",
  fontWeight: 700,
};

const subtitleStyle: React.CSSProperties = {
  margin: "0.25rem 0 0",
  color: "#64748b",
  fontSize: "0.8125rem",
};

const filterRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const searchInputStyle: React.CSSProperties = {
  height: "2rem",
  padding: "0 0.75rem",
  fontSize: "0.875rem",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "0.375rem",
  color: "#0f172a",
  minWidth: "14rem",
  outline: "none",
};

const chipGroupStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.375rem",
};

function chipStyle(active: boolean, color: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.25rem 0.625rem",
    borderRadius: "9999px",
    fontSize: "0.75rem",
    fontWeight: 500,
    border: `1px solid ${active ? color + "40" : "#e5e7eb"}`,
    background: active ? color + "18" : "transparent",
    color: active ? color : "#9ca3af",
    cursor: "pointer",
  };
}

function chipDotStyle(color: string): React.CSSProperties {
  return {
    display: "inline-block",
    width: "0.5rem",
    height: "0.5rem",
    borderRadius: "50%",
    background: color,
  };
}

const chipCountStyle: React.CSSProperties = {
  opacity: 0.6,
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  overflow: "hidden",
};

const canvasStyle: React.CSSProperties = {
  flex: 1,
  position: "relative",
  background: "#f8fafc",
  minHeight: "32rem",
};

const emptyStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#94a3b8",
  fontSize: "0.875rem",
};

const panelStyle: React.CSSProperties = {
  width: "20rem",
  borderLeft: "1px solid #e2e8f0",
  background: "#ffffff",
  overflowY: "auto",
  padding: "1rem",
};

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  marginBottom: "1rem",
};

function panelIconStyle(color: string): React.CSSProperties {
  return {
    width: "2rem",
    height: "2rem",
    borderRadius: "50%",
    background: color + "30",
    color: color,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.8125rem",
    fontWeight: 600,
    flexShrink: 0,
  };
}

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.9375rem",
  fontWeight: 600,
};

const panelTypeStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#64748b",
  textTransform: "lowercase",
};

function scopeBadgeStyle(color: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "0.125rem 0.375rem",
    borderRadius: "0.25rem",
    fontSize: "0.6875rem",
    fontWeight: 500,
    background: color + "20",
    color: color,
    border: `1px solid ${color}40`,
  };
}

const closeButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#64748b",
  fontSize: "1.25rem",
  lineHeight: 1,
  cursor: "pointer",
  padding: "0 0.25rem",
};

const contentBoxStyle: React.CSSProperties = {
  marginBottom: "1rem",
  padding: "0.5rem 0.75rem",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "0.375rem",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "0 0 0.5rem",
};

const staleWarningStyle: React.CSSProperties = {
  marginBottom: "1rem",
  padding: "0.5rem 0.75rem",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "0.375rem",
  fontSize: "0.75rem",
  color: "#b91c1c",
};

const relButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.5rem",
  border: "none",
  background: "transparent",
  borderRadius: "0.375rem",
  cursor: "pointer",
  width: "100%",
};

function relIconStyle(color: string): React.CSSProperties {
  return {
    width: "1.5rem",
    height: "1.5rem",
    borderRadius: "50%",
    background: color + "30",
    color: color,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.75rem",
    fontWeight: 600,
    flexShrink: 0,
  };
}

const relLabelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "#0f172a",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const relRelationStyle: React.CSSProperties = {
  margin: "0.125rem 0 0",
  fontSize: "0.6875rem",
  color: "#94a3b8",
};
