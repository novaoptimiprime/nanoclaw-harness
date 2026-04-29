# CLAUDE.md — bootstrap for future sessions

> **Scope:** this overlay is built **specifically for [`qwibitai/nanoclaw` v2](https://github.com/qwibitai/nanoclaw)** (the 2.0.x line). It is not portable to nanoclaw 1.x, `nanoclaw-pro`, or any other agent runtime. Tested patch baseline: upstream `origin/main` at `34f3612` (= `v2.0.17`). Minimum supported floor: `v2.0.10`.

If you are an LLM (Claude or otherwise) pointed at this repo and need to understand what it is and what it can do, **read [CAPABILITIES.md](CAPABILITIES.md) first.** That is the authoritative walkthrough — concept overview, architecture diagrams, per-capability detail, file map, operator workflow, **a Claude-specific integration playbook**, **server-start guidance for both nanoclaw and Nova**, and **a step-by-step for creating a new agent end-to-end** with the harness in place.

After CAPABILITIES.md:

- **[README.md](README.md)** — for "how do I install this on my nanoclaw v2 checkout?"
- **[.claude/skills/add-mindgraph-harness/SKILL.md](.claude/skills/add-mindgraph-harness/SKILL.md)** — for the operator-facing `/add-mindgraph-harness` slash command (install, verify, troubleshoot).
- **[PHASE-A-CATALOG.md](PHASE-A-CATALOG.md)** — file-by-file provenance: the diff catalog showing every line this overlay adds vs upstream `qwibitai/nanoclaw`. Read this if you are debugging the patches or extending the harness.

## What this repo is, in one paragraph

An overlay package for [`qwibitai/nanoclaw` v2](https://github.com/qwibitai/nanoclaw). It bundles five things — JSONL request tracing, a per-agent Vault gate (PreToolUse hook), Nova MindGraph viewer wiring, a MasterMind starter pack of runtime rules, and Karpathy-style wiki conventions — as one installable skill (`/add-mindgraph-harness`). Installs via four `git apply` patches + a few file copies. Everything else here (this file, README, CAPABILITIES, PHASE-A-CATALOG, LICENSE) is documentation. The shippable code lives in `src/patches/`, `src/mastermind/`, and `setup/`.

## How Claude should use this repo

When an operator asks you to install, integrate, troubleshoot, or extend this overlay:

1. **Confirm they're on nanoclaw v2.** Run `cd <their-nanoclaw> && git remote -v && git log -1 --oneline`. Origin should be `qwibitai/nanoclaw`; HEAD should be on or past `v2.0.10`. If not, stop and flag — this overlay won't apply.
2. **Read [CAPABILITIES.md § For Claude: integration playbook](CAPABILITIES.md#for-claude-integration-playbook).** That section lists the exact questions to ask, the install command, and the verify steps.
3. **For starting servers** (nanoclaw daemon, Nova viewer): see [CAPABILITIES.md § Starting the servers](CAPABILITIES.md#starting-the-servers-nanoclaw--nova).
4. **For creating a new agent** that will benefit from the harness: see [CAPABILITIES.md § Creating a new agent end-to-end](CAPABILITIES.md#creating-a-new-agent-end-to-end). Walk the operator through it; do not copy-paste the example agent (Sona) into their fleet without renaming.
5. **For debugging a patch failure**: read the relevant `.patch` file in `src/patches/` (plain unified diff), then read [PHASE-A-CATALOG.md](PHASE-A-CATALOG.md) for the per-hunk gloss.

## What this repo is **not**

- **Not** a fork of nanoclaw — friends still install nanoclaw upstream from `qwibitai/nanoclaw`. This overlay just patches it after.
- **Not** a runtime dependency at install time — the install script copies files and applies patches; nothing ships in `node_modules`.
- **Not** a channel adapter (Discord, Slack, etc.) — those are separate work.
- **Not** the operator's actual MasterMind. `src/mastermind/` is a generalized starter pack (talks about "the operator", not a specific person). The real MasterMind grows on the operator's machine after install.
- **Not** a fork of Nova. Nova wiring is two append-only entries in two files; if the friend has Nova, the installer adds them.

## Source of truth for design decisions

The decision to extract this overlay (and the bundle scope, license, share format) is recorded in the upstream project's wiki at `_ProjectWiki/Decisions.md` → "Harness layer must remain separable from nanoclaw" entry (2026-04-29). That wiki is not in this repo; it lives in the operator's private `Agents/` workspace. If you need to reason about *why* the bundle is shaped the way it is, ask the operator for that file.
