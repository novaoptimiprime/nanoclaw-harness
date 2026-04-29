/**
 * Parse a single markdown file into a node + outgoing edges.
 *
 * Conventions (all optional):
 *  - frontmatter `id:` overrides the filename-derived slug.
 *  - frontmatter `type:` defaults to `wiki`.
 *  - frontmatter `label:` defaults to first H1, then filename.
 *  - frontmatter `properties:` is copied to node.properties.
 *  - frontmatter `edges:` is a list of `{to, relation, confidence?, properties?}`.
 *    Each becomes a typed edge out of this node.
 *  - `[[wikilinks]]` and inline `[text](./path.md)` links in the body become
 *    untyped `mentions` edges (relation = "mentions", confidence = INFERRED).
 */

import matter from "gray-matter";
import type { GraphNode, GraphEdge } from "@nova/mindgraph-view";

export interface ParseContext {
  /** Stable scope id (e.g. "myagent", "project"). */
  scope: string;
  /** Absolute file path on disk — used only for logging / error messages. */
  absPath: string;
  /** Path relative to the scope root, minus extension — used to derive the default id. */
  relKey: string;
}

export interface ParsedFile {
  node: GraphNode;
  /** Edges declared by this file (frontmatter + inline). Target resolution happens at graph-assembly time. */
  edgeDrafts: EdgeDraft[];
}

export interface EdgeDraft {
  /** Target as written by the author. May be a slug, path, or `scope:slug`. Resolved later. */
  to: string;
  relation: string;
  confidence?: "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
  properties?: Record<string, unknown>;
  /** Where this edge came from — useful for debugging and for styling weak vs strong edges. */
  origin: "frontmatter" | "inline";
}

export function parseMarkdown(raw: string, ctx: ParseContext): ParsedFile {
  const { data: fm, content: body } = matter(raw);

  const id: string =
    typeof fm.id === "string" && fm.id.trim().length > 0
      ? fm.id.trim()
      : defaultIdFromKey(ctx.relKey);

  const type: string = typeof fm.type === "string" ? fm.type : "wiki";

  const label: string =
    typeof fm.label === "string"
      ? fm.label
      : firstH1(body) ?? basenameFromKey(ctx.relKey);

  const properties: Record<string, unknown> =
    fm.properties && typeof fm.properties === "object"
      ? (fm.properties as Record<string, unknown>)
      : {};

  // Preserve the body as a property so the detail panel can render it later.
  properties.content = body.trim();

  const edgeDrafts: EdgeDraft[] = [];

  // Frontmatter-declared typed edges.
  if (Array.isArray(fm.edges)) {
    for (const entry of fm.edges) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.to !== "string" || typeof e.relation !== "string") continue;
      edgeDrafts.push({
        to: e.to,
        relation: e.relation,
        confidence:
          typeof e.confidence === "string"
            ? (e.confidence.toUpperCase() as EdgeDraft["confidence"])
            : undefined,
        properties:
          e.properties && typeof e.properties === "object"
            ? (e.properties as Record<string, unknown>)
            : undefined,
        origin: "frontmatter",
      });
    }
  }

  // Inline [[wikilinks]] and [text](./path) — both become untyped `mentions`.
  for (const target of extractWikilinks(body)) {
    edgeDrafts.push({
      to: target,
      relation: "mentions",
      confidence: "INFERRED",
      origin: "inline",
    });
  }
  for (const target of extractMarkdownLinks(body)) {
    edgeDrafts.push({
      to: target,
      relation: "mentions",
      confidence: "INFERRED",
      origin: "inline",
    });
  }

  const node: GraphNode = {
    id: qualifyId(id, ctx.scope),
    label,
    type,
    properties,
    source: "agent",
    scope: ctx.scope,
  };

  return { node, edgeDrafts };
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Qualify a bare id with its scope prefix unless it already carries one.
 * "soul" in scope "myagent" → "myagent:soul".
 * "project:scope" stays "project:scope".
 */
export function qualifyId(id: string, scope: string): string {
  return id.includes(":") ? id : `${scope}:${id}`;
}

function defaultIdFromKey(relKey: string): string {
  return relKey
    .toLowerCase()
    .replace(/[^\w/.-]+/g, "-")
    .replace(/\.md$/, "")
    .replace(/\//g, "-")
    .replace(/^-+|-+$/g, "");
}

function basenameFromKey(relKey: string): string {
  const last = relKey.split("/").pop() ?? relKey;
  return last.replace(/\.md$/, "");
}

function firstH1(body: string): string | undefined {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

/** Pull [[target]] and [[target|alias]] from body. Returns raw targets. */
function extractWikilinks(body: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const target = m[1]?.trim();
    if (target) out.push(target);
  }
  return out;
}

/** Pull targets from inline `[text](./path.md)` links. Skips external URLs. */
function extractMarkdownLinks(body: string): string[] {
  const out: string[] = [];
  const re = /\[(?:[^\]]+)\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const href = m[1]?.trim();
    if (!href) continue;
    if (/^(https?:|mailto:|#|\/)/i.test(href)) continue;
    out.push(href);
  }
  return out;
}
