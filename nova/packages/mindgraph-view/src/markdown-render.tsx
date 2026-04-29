import * as React from "react";

/**
 * Minimal markdown renderer for the detail panel.
 *
 * Handles:
 *  - H1 (`# `) and H2 (`## `) headings
 *  - bullet lists (`- ` / `* `)
 *  - paragraphs (blank-line separated)
 *  - inline: `**bold**`, `*italic*`, `` `code` ``, `[text](url)`
 *
 * Deliberately tiny — we don't need a full remark pipeline for short wiki
 * bodies. Code is intentionally forgiving: malformed inline markup renders
 * as its raw text rather than throwing.
 */
export function renderMarkdown(content: string): React.ReactElement[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactElement[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      const text = paragraph.join(" ");
      out.push(
        <p
          key={`p-${key++}`}
          style={{
            fontSize: "0.8125rem",
            lineHeight: 1.55,
            color: "#1f2937",
            margin: "0.5rem 0",
          }}
        >
          {renderInline(text, `p${key}`)}
        </p>
      );
      paragraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      out.push(
        <ul
          key={`ul-${key++}`}
          style={{
            listStyle: "disc",
            paddingLeft: "1.125rem",
            margin: "0.5rem 0",
          }}
        >
          {listItems.map((li, i) => (
            <li
              key={i}
              style={{
                fontSize: "0.8125rem",
                lineHeight: 1.55,
                color: "#1f2937",
                margin: "0.125rem 0",
              }}
            >
              {renderInline(li, `li${key}-${i}`)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      out.push(
        <h3
          key={`h-${key++}`}
          style={{
            fontSize: "0.9375rem",
            fontWeight: 600,
            margin: "0.75rem 0 0.25rem",
            color: "#0f172a",
          }}
        >
          {renderInline(line.slice(2), `h${key}`)}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      out.push(
        <h4
          key={`h-${key++}`}
          style={{
            fontSize: "0.6875rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: "0.75rem 0 0.25rem",
            color: "#64748b",
          }}
        >
          {renderInline(line.slice(3), `h${key}`)}
        </h4>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      listItems.push(line.slice(2));
    } else if (line.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return out;
}

// ── Inline markup ──────────────────────────────────────────

/**
 * Tokenize and render inline markdown within a string of paragraph text.
 * Supports bold, italic, inline code, and links. Unmatched or nested
 * markup falls back to the raw text of the match.
 *
 * Regex group map:
 *   1: whole match
 *   2: **bold** inner
 *   3: `code` inner
 *   4: [link text]( url )  —  text
 *   5: [link text]( url )  —  url
 *   6: *italic* inner
 *
 * Bold is tried before italic so `**word**` doesn't get eaten as two
 * italic runs. Italic requires a non-whitespace char right after the
 * opening `*` so stray `* ` mid-paragraph isn't treated as a run start.
 */
const INLINE_REGEX =
  /(\*\*([^*]+?)\*\*|`([^`]+?)`|\[([^\]]+?)\]\(([^)\s]+)\)|\*([^*\s][^*]*?)\*)/g;

export function renderInline(
  text: string,
  keyBase: string
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let lastIdx = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE_REGEX)) {
    const idx = m.index ?? 0;
    if (idx > lastIdx) out.push(text.slice(lastIdx, idx));
    const k = `${keyBase}-${i++}`;
    if (m[2] !== undefined) {
      out.push(<strong key={k}>{renderInline(m[2], k)}</strong>);
    } else if (m[3] !== undefined) {
      out.push(
        <code key={k} style={codeStyle}>
          {m[3]}
        </code>
      );
    } else if (m[4] !== undefined && m[5] !== undefined) {
      const url = m[5];
      const isExternal = /^https?:\/\//i.test(url);
      if (isExternal) {
        out.push(
          <a
            key={k}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
          >
            {renderInline(m[4], k)}
          </a>
        );
      } else {
        // Internal reference — shown as styled text. The detail panel's
        // Connections section is the primary way to navigate to related
        // nodes; we don't hijack the markdown link here. The title
        // attribute surfaces the raw path on hover for debugging.
        out.push(
          <span key={k} style={internalRefStyle} title={url}>
            {renderInline(m[4], k)}
          </span>
        );
      }
    } else if (m[6] !== undefined) {
      out.push(<em key={k}>{renderInline(m[6], k)}</em>);
    }
    lastIdx = idx + m[0].length;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out;
}

const codeStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, 'SF Mono', Consolas, Monaco, monospace",
  fontSize: "0.75rem",
  padding: "0.0625rem 0.25rem",
  background: "#f1f5f9",
  borderRadius: "0.1875rem",
  color: "#0f172a",
};

const linkStyle: React.CSSProperties = {
  color: "#2563eb",
  textDecoration: "underline",
};

const internalRefStyle: React.CSSProperties = {
  color: "#475569",
  textDecorationLine: "underline",
  textDecorationStyle: "dotted",
};
