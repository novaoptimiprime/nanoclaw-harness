# nanoclaw-mindgraph-harness

A drop-in observability + safety harness for [nanoclaw v2](https://github.com/qwibitai/nanoclaw) — adds JSONL request tracing, a per-agent Vault gate, MindGraph-ready wiki conventions, and an optional viewer integration with [Nova](#wiring-nova-optional).

The harness installs as an overlay on top of an unmodified nanoclaw v2 checkout. Five components ship as one `/add-mindgraph-harness` skill:

1. **Tracing** — host JSONL emitter (`src/log.ts`) + container PreToolUse intermediates (`container/agent-runner/src/providers/claude.ts`) + host→container sentinel-file plumbing (`src/router.ts`, `src/delivery.ts`).
2. **Vault** — PreToolUse path gate in `claude.ts` (own vault → allow + auto-force-trace; cross-agent vault → block).
3. **Nova MindGraph patches** — `Nova/packages/mindgraph/src/{roots,trace-sources}.ts` for v2 group-folder convention. Optional.
4. **MasterMind starter pack** — `MasterMind/README.md` (MindGraph conventions + tracing schema) + `MasterMind/Vault.md` (vault rules) every agent RO-mounts and reads at runtime.
5. **Wiki conventions** — Karpathy-style frontmatter shape (`type: wiki, edges: [...]`) + file naming pattern (Soul/Goal/log/Vault) included in the MasterMind README.

## Prereqs

- A nanoclaw v2 checkout (tested against upstream `qwibitai/nanoclaw` between v2.0.10 and v2.0.17). The harness applies as `git apply` patches, so the checkout must be a clean working tree on that range.
- `pnpm` and Node 20+ (already required by nanoclaw v2 itself).
- `bash`, `git`, `awk` (standard on macOS and Linux).
- (Optional) A Nova checkout if you want the MindGraph viewer to surface your traces.

## Install

Clone this repo, then run the install script against your nanoclaw v2 checkout. The script is idempotent — re-running it is safe.

```bash
git clone https://github.com/<org>/nanoclaw-mindgraph-harness.git
cd nanoclaw-mindgraph-harness

./setup/install-mindgraph-harness.sh \
  --nanoclaw=/path/to/your/nanoclaw-v2 \
  --mastermind=/path/to/your/MasterMind \
  --nova=/path/to/your/Nova         # optional
```

If you run the script from inside your nanoclaw v2 checkout with no flags, it auto-detects: `--nanoclaw=$PWD`, `--mastermind=$PWD/../MasterMind`, no Nova.

What the script does, in order:

1. Apply four `git apply` patches to the nanoclaw checkout (`src/log.ts`, `src/router.ts`, `src/delivery.ts`, `container/agent-runner/src/providers/claude.ts`). It checks each patch with `git apply --reverse --check` first and skips any patch that's already applied.
2. (If `--mastermind=`) copy `MasterMind/README.md` and `MasterMind/Vault.md` into the target directory if they don't already exist. **Existing files are not overwritten.**
3. (If `--nova=`) append two scope entries to `packages/mindgraph/src/roots.ts` and two entries to `packages/mindgraph/src/trace-sources.ts` (one per agent group folder). Skipped if the entries are already present.
4. Run `pnpm install && pnpm run build` in the nanoclaw checkout to compile the new code.

After install, restart your nanoclaw service so it picks up the new build. The harness adds no new env vars — the existing `TRACING_ENABLED` flag (already documented by nanoclaw) controls trace emission.

## What you get

Once installed and your agent answers an inbound message, you'll find:

- A JSONL trace file at `<nanoclaw>/groups/<agent_folder>/Traces/<YYYY-MM-DD>/<inbound_msg_id>.jsonl` per request.
- A trace index at `<nanoclaw>/groups/<agent_folder>/Traces/index.jsonl` listing every trace in summary form.
- Sentinel files at `<nanoclaw>/data/v2-sessions/<agentGroupId>/<sessionId>/.current-trace-id` (and `.current-agent`) used by the container to attribute intermediate `read`/`write`/`vault_access` events to the right inbound.
- Vault enforcement: any tool call that touches another agent's `Vault/` is blocked; any tool call that touches the agent's own `Vault/` writes a `.trace-forced` marker and emits a `vault_access` event.

If you wired Nova, the new agents show up in the viewer's left panel under their scopes (default scopes are `v2-testagent` and `v2-manu`; rename in `roots.ts` and `trace-sources.ts` if you have different agent folders).

## Wiring Nova (optional)

The harness ships unaware of any specific Nova distribution — you bring your own. If you have a Nova checkout with `packages/mindgraph/src/{roots,trace-sources}.ts`, the install script appends two registration entries (using absolute paths to your nanoclaw groups). If you don't have Nova, skip the `--nova=` flag and you'll still get JSONL traces on disk you can inspect with any tool.

## Customizing agent scopes

The bundled patches hardcode two agent group folder names — `manu` and `dm-with-max` — into `entryNodeForAgentFolder()` and `traceScopeForAgentFolder()` in `src/log.ts`. If your agents have different folder names, edit those two functions in the patched `src/log.ts` after install. The fallback (`<folder>:claude.local`) is sane for any folder you don't explicitly map.

## What's not in the bundle

- The Discord channel adapter our local nanoclaw uses (`src/channels/discord.ts`) is unrelated feature work — not bundled.
- The `package.json` version field is not modified; you keep whatever upstream nanoclaw version you cloned.
- `pnpm-lock.yaml` is not patched — `pnpm install` after the patches will update it cleanly because the harness adds zero new npm dependencies.

## Caveats

- **Patch baseline drift:** these patches were generated against upstream `qwibitai/nanoclaw` `origin/main` at commit `a4346f5` (v2.0.17). They apply cleanly against any nanoclaw checkout where `src/log.ts`, `src/router.ts`, `src/delivery.ts`, and `container/agent-runner/src/providers/claude.ts` haven't drifted from that revision. If `git apply --check` fails for you, your checkout has diverged — manual three-way merge required.
- **Two unrelated cleanups in the router patch:** the `src/router.ts` patch removes a `stopTypingRefresh` import and simplifies one `accumulate` policy branch. These are entanglements with the harness work in our development tree, not harness logic. They are harmless on a fresh upstream checkout but will conflict if you've customized those exact lines.
- **Nova is unscoped:** the bundled Nova entries assume your nanoclaw groups live at the absolute path you pass via `--nanoclaw=`. If you move your nanoclaw later, re-run the install script with the new path or edit `roots.ts` / `trace-sources.ts` by hand.

## License

MIT — see [LICENSE](LICENSE).
