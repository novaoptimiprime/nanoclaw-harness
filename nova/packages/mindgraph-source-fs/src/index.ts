import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { GraphEdge, KnowledgeGraph } from "@nova/mindgraph-view";
import {
  parseMarkdown,
  qualifyId,
  type EdgeDraft,
  type ParsedFile,
} from "./parse-markdown";

export interface WikiRoot {
  /** Scope id — used as the prefix for cross-wiki references. */
  scope: string;
  /** Absolute filesystem path to the folder containing markdown files. */
  path: string;
  /** Optional label shown in the scope filter. Defaults to the scope id. */
  label?: string;
}

export interface LoadOptions {
  roots: WikiRoot[];
  /** Ignore files matching these glob-ish patterns (simple substring match). */
  ignore?: string[];
}

/**
 * Load one or more markdown wiki roots and return a single unified
 * `KnowledgeGraph`. Edges are resolved across roots: `[[jarvis:soul]]`
 * and `{to: "jarvis:soul"}` both land on the same node id.
 */
export async function loadFsWikis(options: LoadOptions): Promise<KnowledgeGraph> {
  const ignore = options.ignore ?? ["node_modules", ".git", ".DS_Store"];

  const parsed: Array<{ root: WikiRoot; file: ParsedFile; absPath: string; relKey: string }> = [];

  for (const root of options.roots) {
    const files = await walkMarkdown(root.path, ignore);
    for (const absPath of files) {
      const relKey = relative(root.path, absPath);
      const raw = await readFile(absPath, "utf8");
      try {
        const file = parseMarkdown(raw, { scope: root.scope, absPath, relKey });
        parsed.push({ root, file, absPath, relKey });
      } catch (err) {
        console.warn(`[mindgraph-source-fs] failed to parse ${absPath}:`, err);
      }
    }
  }

  // Build an id index so edge targets can be resolved to real nodes.
  const nodesById = new Map(parsed.map((p) => [p.file.node.id, p.file.node]));

  // Also index by bare-id within each scope and by filename, for loose resolution
  // of edge targets that weren't written with a full `scope:slug` form.
  const looseIndex = new Map<string, string>(); // loose key -> canonical id
  for (const p of parsed) {
    const n = p.file.node;
    const bare = n.id.split(":").slice(1).join(":");
    looseIndex.set(`${n.scope}:${bare}`, n.id); // exact
    if (!looseIndex.has(bare)) looseIndex.set(bare, n.id); // first-wins for unqualified
    // Also index by the relative-path key so `[text](./scope.md)` resolves.
    const keyNoExt = p.relKey.replace(/\.md$/i, "");
    looseIndex.set(`${p.root.scope}:${keyNoExt}`, n.id);
    looseIndex.set(keyNoExt, n.id);
  }

  const links: GraphEdge[] = [];
  const unresolved: Array<{ from: string; draft: EdgeDraft }> = [];

  for (const p of parsed) {
    for (const draft of p.file.edgeDrafts) {
      const resolved = resolveTarget(draft.to, p.root.scope, looseIndex, nodesById);
      if (!resolved) {
        unresolved.push({ from: p.file.node.id, draft });
        continue;
      }
      links.push({
        source: p.file.node.id,
        target: resolved,
        relation: draft.relation,
        confidence: draft.confidence ?? (draft.origin === "frontmatter" ? "EXTRACTED" : "INFERRED"),
        properties: draft.properties,
      });
    }
  }

  if (unresolved.length > 0) {
    console.warn(
      `[mindgraph-source-fs] ${unresolved.length} edge target(s) did not resolve — they will be omitted until the target file exists.`
    );
  }

  return {
    directed: true,
    multigraph: false,
    nodes: parsed.map((p) => p.file.node),
    links,
    graph: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

// ── Internals ──────────────────────────────────────────────

async function walkMarkdown(root: string, ignore: string[]): Promise<string[]> {
  const out: string[] = [];
  async function recurse(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignore.some((p) => entry.name.includes(p))) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await recurse(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        out.push(full);
      }
    }
  }
  await recurse(root);
  return out;
}

/**
 * Resolve an edge target as written by the author.
 *
 * Resolution order:
 *   1. Already a canonical "scope:id" that exists → use as-is.
 *   2. The qualified form in the author's scope → use.
 *   3. A loose match (filename, relative path, bare slug in any scope) → use.
 *   4. Unresolved → omit (warned separately).
 */
function resolveTarget(
  raw: string,
  authorScope: string,
  looseIndex: Map<string, string>,
  nodesById: Map<string, unknown>
): string | undefined {
  const cleaned = raw.replace(/^\.\//, "").replace(/\.md$/i, "").trim();
  if (!cleaned) return undefined;

  if (nodesById.has(cleaned)) return cleaned;

  const qualified = qualifyId(cleaned, authorScope);
  if (nodesById.has(qualified)) return qualified;

  const fromLoose = looseIndex.get(cleaned) ?? looseIndex.get(qualified);
  if (fromLoose) return fromLoose;

  return undefined;
}

export type { GraphEdge, GraphNode, KnowledgeGraph } from "@nova/mindgraph-view";
