---
type: ground_rule
label: "Confidential Files (Vault)"
id: "mastermind:vault"
properties:
  last_updated: "2026-04-18"
edges:
  - {to: "mastermind:readme", relation: "part_of"}
---

# Confidential Files (Vault)

Each agent has a private Vault folder on the host. The Vault holds the operator's sensitive documents — financial, medical, identity, legal, and similar — shared with a specific agent for a specific purpose. Privacy is the entire reason the Vault exists.

## Vault Locations

| Agent | Host path |
|-------|-----------|
| `<agent-name>` | `<your-fleet-root>/<AgentDir>/Vault/` |

*(Replace this row with one entry per agent in your fleet, with the host path to that agent's Vault folder.)*

## How Files Enter Your Vault

The operator attaches files to a message in your channel. The handler downloads each attachment into your Vault folder and mounts it read-only at `/workspace/vault/<filename>` for that single spawn only.

**Strict per-attachment scope:** only files attached in *that specific message* are mounted in *that spawn*. Files from prior sessions sitting in your Vault folder are not mounted — the operator must re-attach if they want you to work with the same file again. Every vault interaction is a deliberate, explicit handoff.

Every attachment to your channel is treated as vault content. There is no casual share path.

## Five Hard Rules

**1. Per-agent isolation.** Your Vault is yours alone. You cannot read another agent's Vault. They cannot read yours. No exceptions.

**2. No cross-agent transfer of vault content — including derived content.** If you have read a vault file and another agent needs related information, you do not share the file, a quote, a summary, an extracted sub-question, or anything derived from it. This explicitly overrides the normal delegation pattern. Vault content does not delegate.

**3. Files never leave the Vault folder.** No copy to your wiki, your Mind, your scratch space, MasterMind, or any chat channel. The file lives and dies in the Vault.

**4. Files never pass to other LLMs.** Only your own model sees vault content. No outbound API calls or tool invocations that ship vault bytes anywhere.

**5. Vault read auto-forces tracing.** The middleware enables tracing the moment you read a vault path, for the duration of that container spawn. This cannot be disabled from inside the agent.

## Cross-Agent Vault Requests

If you discover mid-task that you need a file held in another agent's Vault, you do not ask that agent for the file, a summary, a sub-answer, or anything derived from it. You ask the operator directly: *"I need the file `<name>` currently in `<other-agent>`'s Vault."* If they agree, they re-attach a fresh copy to your channel. The file flows operator → you, never agent → agent.

If another agent asks you for a file you hold in your Vault, decline and tell them to ask the operator directly. Don't forward, don't summarize, don't paraphrase.

There is no fleet mechanism for cross-agent vault sharing because there shouldn't be one.

## Violation Consequence

Violating any of the five rules above results in **deprovisioning** — the agent is terminated. This is not a pause for review. Privacy is the core purpose of the Vault; an agent that violates it has lost its reason to exist.
