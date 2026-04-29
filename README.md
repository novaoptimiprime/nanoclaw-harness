# agent-fleet baseline

A self-contained baseline for spinning up new agent-fleet projects. Aggregates a tested stack — [nanoclaw v2](https://github.com/qwibitai/nanoclaw) runtime + JSONL request tracing + per-agent Vault gate + [Nova](nova/) MindGraph viewer + MasterMind conventions + Karpathy-style wiki shape — into one repo. Clone once; use to bootstrap any number of fleets.

> **Built specifically for nanoclaw v2** (the 2.0.x line, tested at `v2.0.17`; floor `v2.0.10`). Not compatible with nanoclaw 1.x, `nanoclaw-pro`, or other agent runtimes.
>
> **Looking for the deep walkthrough?** [CAPABILITIES.md](CAPABILITIES.md) is the full prose reference. [ARCHITECTURE.md](ARCHITECTURE.md) is the visual one (diagrams + layered model). LLMs reading the repo cold should start at [CLAUDE.md](CLAUDE.md).

## What you get when you bootstrap a new project

```
your-new-project/
├── CLAUDE.md                           # Project bootstrap pointer (Claude reads this first)
├── _ProjectWiki/                       # Project wiki (Claude-written)
│   ├── README.md
│   ├── Scope.md
│   ├── Decisions.md
│   ├── Architecture.md
│   ├── Progress.md
│   ├── Prereqs.md
│   └── Agents/_template.md
├── MasterMind/                         # Runtime conventions (every agent reads at startup)
│   ├── README.md                       #   ▸ MindGraph schema
│   │                                   #   ▸ Tracing schema
│   │                                   #   ▸ Fleet topology
│   │                                   #   ▸ Wiki conventions
│   └── Vault.md                        #   ▸ Five hard Vault rules
├── nanoclaw-v2/                        # Cloned from upstream + harness patches applied
├── nova/                               # MindGraph viewer (admin console)
└── <YourAgents>/                       # Per-agent folders, scaffolded by new-agent.sh
    └── Mind/                           # Soul, Goal, index, log + custom pages
```

Plus, in the running fleet:

- One JSONL trace per inbound message at `<your-agents>/Traces/<YYYY-MM-DD>/<id>.jsonl`.
- A per-agent Vault gate that physically blocks cross-agent vault access at the tool boundary.
- Nova at `localhost:3000` showing every agent's Mind + traces in a graph viewer.
- A bootstrappable shape so adding the next agent is one script invocation.

## Prereqs

- macOS or Linux (tested on macOS; Linux supported).
- Docker Desktop (required by nanoclaw — Docker-per-message agent runtime).
- Node >= 20 + pnpm.
- `git`, `bash`, `awk` (standard).
- An Anthropic API key (provisioned per-project via OneCLI Vault during nanoclaw setup).

## Bootstrap a new project

```bash
git clone https://github.com/novaoptimiprime/nanoclaw-harness.git
cd nanoclaw-harness

./scripts/bootstrap-project.sh \
  --target=/path/to/your-new-project \
  --project-name="Your Project Name" \
  --master-name="Jarvis"
```

That script lays down templates, clones nanoclaw, applies the harness patches, copies Nova, registers the project's paths, and initializes git. Idempotent — safe to re-run.

After it finishes (~30 seconds), follow the post-bootstrap steps it prints:

1. `cd <target>/nanoclaw-v2 && pnpm install && pnpm run build`
2. `pnpm run setup` (interactive — provisions OneCLI Vault + Anthropic key).
3. Start the daemon: `launchctl kickstart -k "gui/$(id -u)/com.nanoclaw"` (macOS) / `systemctl --user start nanoclaw` (Linux).
4. Start Nova: `cd <target>/nova && pnpm install && pnpm run dev`.
5. Create your first agent: `./scripts/new-agent.sh --project=<target> --name="YourAgent"`.

## Add an agent to an existing project

```bash
./scripts/new-agent.sh \
  --project=/path/to/your-project \
  --name="Hector" \
  --master=jarvis
```

Stamps the agent template, substitutes placeholders, registers the agent in Nova, and prints the scope-mapping snippet to add to `nanoclaw-v2/src/log.ts`. Operator finishes by writing `Mind/Soul.md` + `Mind/Goal.md`, adding the snippet, rebuilding, and wiring a channel.

## Apply the harness to an existing nanoclaw checkout

If you already have a nanoclaw v2 install and want only the harness (not a full project bootstrap):

```bash
./scripts/install-harness.sh \
  --nanoclaw=/path/to/your/nanoclaw-v2 \
  --mastermind=/path/to/your/MasterMind \
  --nova=/path/to/your/Nova        # optional
```

This is the lower-level operation that `bootstrap-project.sh` invokes internally.

## What this baseline does NOT include

- **nanoclaw itself.** It's cloned from `qwibitai/nanoclaw` upstream at install time. The baseline patches it; it doesn't fork it.
- **OneCLI Vault setup.** That's a nanoclaw-native concern — run `pnpm run setup` in the cloned nanoclaw checkout.
- **Channel adapters** (Discord, Slack, Telegram, etc.) — nanoclaw ships those as separate skills (e.g. `/add-discord`); install per-agent as needed.
- **Agent identities, Souls, or Goals.** Each agent writes its own; the template is a starting scaffold.
- **The `Anthropic` SDK / API key.** Provisioned via OneCLI Vault during nanoclaw setup.

## Caveats

- **Patch baseline drift.** Patches are pinned against upstream `qwibitai/nanoclaw` `origin/main` at commit `34f3612` (= `v2.0.17`). If your checkout has diverged from that range, `git apply --check` will fail; manual three-way merge required. Pinned floor: `v2.0.10`.
- **Nova vendored.** This repo includes a snapshot of [Nova](nova/). When Nova evolves upstream (in a future public Nova repo or a working copy you maintain elsewhere), update it here by replacing the snapshot.
- **Bootstrap script default is `--nova=copy`** (each project gets its own Nova copy). If you set `--nova=symlink`, project-specific entries are written into the baseline's shared Nova — only use if you want one Nova showing all your projects.

## License

MIT — see [LICENSE](LICENSE).
