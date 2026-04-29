import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface TracingConfig {
  enabled: boolean;
}

export const TRACING_CONFIG_PATH = join(homedir(), ".config", "nanoclaw", "tracing.json");

export async function readTracingConfig(): Promise<TracingConfig> {
  try {
    const raw = await readFile(TRACING_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<TracingConfig>;
    return { enabled: Boolean(parsed.enabled) };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { enabled: false };
    console.warn("[tracing-config] read failed:", err);
    return { enabled: false };
  }
}

export async function writeTracingConfig(config: TracingConfig): Promise<void> {
  await mkdir(dirname(TRACING_CONFIG_PATH), { recursive: true });
  await writeFile(TRACING_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}
