import { loadFsWikis } from "@nova/mindgraph-source-fs";
import { loadTrace, loadTraceIndex } from "@nova/mindgraph-trace";
import type { LoadedTrace } from "@nova/mindgraph-trace";
import { defaultRoots } from "../roots";
import { defaultTraceSources } from "../trace-sources";
import { readTracingConfig } from "../lib/tracing-config";
import { ViewerClient } from "./ViewerClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const roots = defaultRoots();
  const graph = await loadFsWikis({ roots });

  // Trace data: load every agent's index, then pre-load each trace's events.
  // For the synthetic-fixtures phase this is a tiny dataset (<10KB). When real
  // traces flow, we'll switch to on-demand loading via an API route.
  const traceSources = defaultTraceSources();
  const traceIndex = await loadTraceIndex(traceSources);

  const tracesById: Record<string, LoadedTrace> = {};
  const sourceByScope = new Map(traceSources.map((s) => [s.scope, s]));
  await Promise.all(
    traceIndex.map(async (entry) => {
      const source = sourceByScope.get(entry.source_scope ?? "");
      if (!source) return;
      const loaded = await loadTrace(source, entry.path);
      tracesById[entry.trace_id] = loaded;
    })
  );

  const tracingConfig = await readTracingConfig();

  return (
    <ViewerClient
      graph={graph}
      traceIndex={traceIndex}
      tracesById={tracesById}
      initialTracingEnabled={tracingConfig.enabled}
    />
  );
}
