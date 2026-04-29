# CLAUDE.md — playbook for LLMs reading this repo

> **What this repo is:** the agent-fleet baseline. An aggregation of nanoclaw v2 patches, MindGraph viewer (Nova), MasterMind conventions, project wiki templates, per-agent skeleton, and lifecycle scripts. Cloned once; used to bootstrap any number of agent projects.
>
> **Built specifically for [`qwibitai/nanoclaw` v2](https://github.com/qwibitai/nanoclaw)** (the 2.0.x line). Tested baseline: upstream `origin/main` at `34f3612` (= `v2.0.17`). Minimum supported floor: `v2.0.10`. Not portable to nanoclaw 1.x or `nanoclaw-pro`.

## If you are an LLM dropped into this repo

You will be asked to do one of three things:

1. **Bootstrap a new project from this baseline** — a new agent fleet, possibly on a fresh machine, possibly someone else's machine. The flow is documented below ("Bootstrapping a new project").
2. **Add an agent to an existing project** — scaffold a new agent on top of an already-bootstrapped fleet. The flow is documented below ("Adding a new agent").
3. **Debug, extend, or upgrade the harness itself** — fix a patch, add a capability, ship updates to friends. Read the maintainer notes below.

For everything else (capabilities, examples, glossary), read these in order:

- [ARCHITECTURE.md](ARCHITECTURE.md) — visual + conceptual reference. Layered stack, runtime topology, data flow, project lifecycle. PNG diagrams in [`docs/diagrams/`](docs/diagrams/) for offline viewing.
- [CAPABILITIES.md](CAPABILITIES.md) — full prose walkthrough of all five capabilities (Tracing, Vault, Nova wiring, MasterMind starter pack, Wiki conventions). Includes a per-capability "for Claude" integration playbook, server-start guidance, and an end-to-end agent-creation example.
- [README.md](README.md) — install-focused entry point for humans. Shorter than CAPABILITIES.md, longer than this file.
- [PHASE-A-CATALOG.md](PHASE-A-CATALOG.md) — file-by-file diff catalog vs upstream nanoclaw. Read for provenance and patch-level debugging.

## Bootstrapping a new project

The operator wants to start a new fleet at `/path/to/their-project`. They want to inherit everything: project wiki, MasterMind conventions, Nova viewer, tracing + Vault, and a working nanoclaw v2 install.

**One command:**

```bash
./scripts/bootstrap-project.sh \
  --target=/path/to/their-project \
  --project-name="Their Project Name" \
  --master-name="Jarvis"               # or whatever they name the master agent
```

What this does, in order, all idempotent and safe to re-run:

1. Lays down `_ProjectWiki/`, `MasterMind/`, and `CLAUDE.md` from `templates/` into the target.
2. Substitutes placeholders (`[Project Name]`, `<master>`, `<MasterAgentName>`) with the operator's values.
3. Clones `qwibitai/nanoclaw` v2 from upstream into `<target>/nanoclaw-v2/` via `install-nanoclaw.sh`.
4. Applies the four harness patches via `install-mindgraph-harness.sh`.
5. Copies `nova/` into `<target>/nova/` (or symlinks if `--nova=symlink` — see caveat below).
6. Registers the project's nanoclaw groups directory in the project's Nova `roots.ts` and `trace-sources.ts`.
7. Initializes git in the new project (unless `--no-git`).

After bootstrap, walk the operator through the post-bootstrap steps the script prints (run `pnpm install && pnpm run build` in the cloned nanoclaw, run nanoclaw's own `pnpm run setup` to provision OneCLI, start the daemon, start Nova). Those steps are nanoclaw's concern, not this baseline's, so we deliberately don't automate them — the operator may want to customize.

**Symlink mode caveat (`--nova=symlink`).** If the operator chooses symlink mode for Nova, project-specific `roots.ts` / `trace-sources.ts` entries are written into the *baseline's* shared `nova/` rather than per-project. Use only if the operator wants one Nova showing all their projects. Default is `--nova=copy`, which keeps each project independent.

## Adding a new agent

The operator has a working project and wants to add agent `Hector`:

```bash
./scripts/new-agent.sh \
  --project=/path/to/their-project \
  --name="Hector" \
  --master=jarvis             # match the master they bootstrapped with
```

What this does:

1. Stamps `templates/agents/_template/` into `<project>/Hector/` (Mind/Soul, Goal, index, log + Vault/ + README).
2. Substitutes `<AgentName>` → "Hector", `<agent-slug>` → "hector", etc.
3. Registers `hector` scope in the project's `nova/roots.ts` and `nova/trace-sources.ts`.
4. Prints the scope-mapping snippet to add to the project's patched `nanoclaw-v2/src/log.ts` (so traces anchor on `hector:soul` rather than the generic fallback).

**The operator must do these manually after the script:**

- Open `<project>/Hector/Mind/Soul.md` and fill in identity + voice.
- Open `<project>/Hector/Mind/Goal.md` and fill in domain + scope.
- Add the printed scope-mapping snippet to `nanoclaw-v2/src/log.ts`.
- Rebuild: `cd <project>/nanoclaw-v2 && pnpm run build`.
- Wire a channel for the new agent (Discord, CLI socket, etc. — nanoclaw concern).
- Add a project-wiki summary at `<project>/_ProjectWiki/Agents/Hector.md` (use the `_template.md` there).

You can guide the operator through each of these. The `Mind/Soul.md` and `Mind/Goal.md` writing is best done with operator input — ask them about the agent's domain, voice, scope, and convictions before drafting.

## Pattern reuse across agents

When the operator builds agent N+1 and wants to borrow patterns from agent N (briefings, scheduled tasks, channel-specific flows), the workflow is **copy-with-adaptation**, not import:

- Read the source agent's `Mind/` (especially `protocols.md` or similar pattern pages, if they exist).
- Identify the relevant pattern.
- Copy into the new agent's `Mind/` and adapt the wording, scope, and edges to the new agent's context.
- Note the source in the new agent's `README.md` ("Patterns reused" section).

This keeps each agent's Mind self-contained and inspectable. There's no shared library — by design, per the Karpathy invariant. The operator's project wiki Decisions log should track any cross-agent patterns that emerge.

## Maintainer notes

If you're modifying the baseline itself (not just consuming it):

- **Patches** in `src/patches/` are plain unified diffs. Edit by hand; re-test with the test loop documented in [CAPABILITIES.md § Verifying the install](CAPABILITIES.md#verifying-the-install).
- **Templates** in `templates/` ship as-is. Substitutions happen at bootstrap time; placeholder tokens are `[Project Name]`, `<master>`, `<MasterAgentName>`, `<AgentName>`, `<agent-slug>`, `<YYYY-MM-DD>`. Don't add new tokens without updating both bootstrap-project.sh and new-agent.sh substitute functions.
- **Nova source** in `nova/` is a vendored snapshot. To update it, replace the contents (excluding `node_modules`, `.next`, `.git`) and re-test. The `roots.ts` and `trace-sources.ts` in the vendored copy must stay empty (only example comments) — the install scripts populate them per project.
- **Scripts** in `scripts/` are bash + awk + sed. POSIX-portable; tested on macOS. The header comment in each script describes when to use it; keep that comment accurate.
- **Architecture** changes (new capability, new patch target, restructure) MUST update [ARCHITECTURE.md](ARCHITECTURE.md) AND re-render the PNG diagrams. To re-render: `awk '/^```mermaid$/,/^```$/' ARCHITECTURE.md | … | npx -y @mermaid-js/mermaid-cli@latest -i …`. The exact incantation is in the commit history of `docs/diagrams/`.

## Source of truth for design decisions

The decision history (why the bundle is shaped this way, why Nova is vendored, why the baseline isn't a fork of nanoclaw, etc.) is recorded in the upstream project's wiki at `_ProjectWiki/Decisions.md` — specifically the "Harness layer must remain separable from nanoclaw" entry and the subsequent baseline-expansion entries. That wiki is not in this repo; if you need to reason about *why* the baseline is shaped the way it is, ask the operator for that file.
