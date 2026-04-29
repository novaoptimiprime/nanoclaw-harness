---
name: add-mindgraph-harness
description: Install the MindGraph observability + Vault safety harness onto a nanoclaw v2 checkout. Adds JSONL request tracing, a per-agent vault PreToolUse gate, optional Nova viewer wiring, and a MasterMind starter pack with wiki/tracing/vault conventions.
---

# Add MindGraph Harness

Installs the harness overlay (this repo) onto a target nanoclaw v2 checkout. Idempotent — safe to re-run.

## Pre-flight (idempotent)

Skip to **Run install** if all of these are true:

- `src/log.ts` in the target nanoclaw contains `recordInboundForSession`
- `container/agent-runner/src/providers/claude.ts` contains `VAULT_OWN_GROUP`
- `MasterMind/README.md` and `MasterMind/Vault.md` exist at your MasterMind path
- (If using Nova) per-agent entries in `packages/mindgraph/src/roots.ts` are added as you scaffold agents; that step lives in `scripts/new-agent.sh`, not in this install

Otherwise continue. Every step is safe to re-run.

## Run install

From the root of this overlay repo:

```bash
./setup/install-mindgraph-harness.sh \
  --nanoclaw=/path/to/your/nanoclaw-v2 \
  --mastermind=/path/to/your/MasterMind \
  --nova=/path/to/your/Nova       # optional
```

Auto-detection: if you run the script with no flags from inside your nanoclaw v2 checkout, it assumes `--nanoclaw=$PWD` and `--mastermind=$PWD/../MasterMind`. Nova requires the explicit flag.

## What it does

1. **Apply four patches** to the nanoclaw checkout via `git apply`:
   - `src/log.ts` — adds `recordInboundForSession`, `traceIdForSession`, `entryNodeForAgentFolder`, `traceScopeForAgentFolder`, `writeTraceSentinels`, and a JSONL trace sink.
   - `src/router.ts` — emits an `entry` trace event per inbound; writes `.current-trace-id` + `.current-agent` sentinel files.
   - `src/delivery.ts` — emits an `exit` trace event per outbound, paired by `trace_id` with the most-recent inbound.
   - `container/agent-runner/src/providers/claude.ts` — Vault PreToolUse gate (rule 1 cross-agent block + rule 5 own-vault auto-force-trace) plus container-side `read`/`write`/`vault_access` event emission.
2. **Copy MasterMind starter pack** (only if missing — never overwrites). Includes the MindGraph conventions, tracing schema, and vault rules every agent reads at runtime.
3. **(Optional) Register v2 agents in Nova** — appends two entries each to `roots.ts` and `trace-sources.ts`, parameterized on the absolute nanoclaw path you passed.
4. **Build** — `pnpm install && pnpm run build` in the nanoclaw checkout.

## Configuration

No new env vars. The existing `TRACING_ENABLED` flag (already part of nanoclaw + documented in MasterMind/README.md) gates trace emission.

Sentinel and trace paths are hardcoded by convention:

- Trace JSONL: `<nanoclaw>/groups/<agent_folder>/Traces/<YYYY-MM-DD>/<trace_id>.jsonl`
- Trace index: `<nanoclaw>/groups/<agent_folder>/Traces/index.jsonl`
- Sentinels: `<nanoclaw>/data/v2-sessions/<agent_group_id>/<session_id>/.current-trace-id` (+ `.current-agent`)
- Vault force-trace marker (container side): `/workspace/.trace-forced`

## Customization

The baseline patches don't hardcode any folder-to-scope mappings — every agent folder anchors traces on `<folder>:claude.local` by default. To anchor a specific agent on `<scope>:soul` (the recommended pattern once an agent has a `Mind/Soul.md`), add a per-folder override in `entryNodeForAgentFolder()` and `traceScopeForAgentFolder()` in the patched `src/log.ts`. `scripts/new-agent.sh` prints the exact override snippet for each agent it scaffolds.

## Restart

After install + build, restart your nanoclaw service so the new code loads:

```bash
# macOS
launchctl kickstart -k "gui/$(id -u)/com.nanoclaw"

# Linux (systemd)
systemctl --user restart nanoclaw
```

## Verify

Send any inbound to your agent. Then confirm:

```bash
# A trace file should exist for the inbound:
ls /path/to/your/nanoclaw-v2/groups/<agent_folder>/Traces/$(date +%Y-%m-%d)/

# The index should list it:
tail -1 /path/to/your/nanoclaw-v2/groups/<agent_folder>/Traces/index.jsonl
```

If you wired Nova, restart the Nova viewer and the new agents appear under their scope labels.

## Troubleshooting

### `git apply --check` fails

Your nanoclaw working tree has diverged from the patch baseline (upstream `origin/main` ~v2.0.17). Check `git status` and `git diff` on the four patched files; if you have local changes that conflict, you'll need to merge by hand. The patches in `src/patches/` are plain unified diffs — readable in any editor.

### "MasterMind path not found"

Pass `--mastermind=PATH` explicitly. The script will create the directory if needed and copy the two starter files in.

### Nova entries already present

Per-agent registration is handled by `scripts/new-agent.sh`, which greps for the agent's slug in `roots.ts` and skips if found. To re-register with a different path, remove the existing entry first or edit the file by hand.

### Anchoring a specific agent on `<scope>:soul` instead of the fallback

Open the post-install `src/log.ts` in the nanoclaw checkout and add per-folder overrides to `entryNodeForAgentFolder()` and `traceScopeForAgentFolder()`. The fallback (`<folder>:claude.local`) is fine for any folder you don't explicitly map — you just won't get a stable Soul-anchored entry node for that agent's traces.
