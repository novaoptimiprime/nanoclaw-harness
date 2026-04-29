---
type: project_doc
label: Prereqs
edges:
  - to: project:readme
    relation: part_of
---

# Prereqs

Install state and version pins for the host machine. Update as installs happen.

## System

| Tool | Required version | Installed | Notes |
|------|------------------|-----------|-------|
| Homebrew (macOS) | any recent | ⬜ | Not needed on Linux. |
| Docker Desktop | running | ⬜ | nanoclaw spawns one container per inbound. |
| Node | >= 20 | ⬜ | Required by both nanoclaw and Nova. |
| pnpm | >= 10 | ⬜ | Both nanoclaw and Nova use pnpm. |
| gh (GitHub CLI) | any recent | ⬜ | Useful for cloning + repo ops. |
| Claude Code CLI | any recent | ⬜ | If you intend to drive setup via Claude. |
| OneCLI | configured | ⬜ | Credential vault for outbound API keys. |

## Anthropic / model access

| Item | Status | Notes |
|------|--------|-------|
| Anthropic API key | ⬜ | Stored in OneCLI Vault, not in `.env`. |

## Project paths

| Path | Purpose | Status |
|------|---------|--------|
| `<project-root>/` | Project root, this folder | ⬜ |
| `<project-root>/nanoclaw-v2/` | nanoclaw v2 install (with harness patches) | ⬜ |
| `<project-root>/nova/` | Nova viewer (referenced or vendored) | ⬜ |
| `<project-root>/MasterMind/` | Fleet ground rules | ⬜ |
| `<project-root>/_ProjectWiki/` | Project wiki (this folder's parent) | ⬜ |
| `<project-root>/<AgentName>/Mind/` | Per-agent wikis | ⬜ |

## Service state

| Service | Manager | Running | Notes |
|---------|---------|---------|-------|
| nanoclaw daemon | launchd / systemd | ⬜ | `launchctl kickstart -k gui/$UID/com.nanoclaw` (macOS). |
| Nova dev server | manual / pm2 / systemd | ⬜ | `cd nova && pnpm run dev` for development. |
