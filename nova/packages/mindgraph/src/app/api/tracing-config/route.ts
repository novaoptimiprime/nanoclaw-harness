import { NextResponse } from "next/server";
import {
  readTracingConfig,
  writeTracingConfig,
  type TracingConfig,
} from "../../../lib/tracing-config";

/**
 * Read + write for the fleet-wide tracing toggle.
 * Config lives at `~/.config/nanoclaw/tracing.json` — parallel to the existing
 * `mount-allowlist.json`. NanoClaw reads this on container spawn and injects
 * `TRACING_ENABLED` as an env var (Phase 2).
 *
 * Default when the file is missing: `{ enabled: false }`. Toggle off ships zero
 * token cost for every request; the operator flips on here to pay for visibility.
 */

export async function GET() {
  const config = await readTracingConfig();
  return NextResponse.json(config);
}

export async function POST(request: Request) {
  let body: Partial<TracingConfig>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "'enabled' must be boolean" }, { status: 400 });
  }
  const next: TracingConfig = { enabled: body.enabled };
  await writeTracingConfig(next);
  return NextResponse.json(next);
}
