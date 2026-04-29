# Phase A: MindGraph Harness Bundle — File-by-File Change Catalog

> **Historical archaeology document.** This catalog was produced during the initial Phase A extraction of the harness from a development tree (April 2026). It documents file-by-file what was originally extracted into the bundle. The current shipped baseline has since been further generalized — agent-name references and per-folder scope mappings shown in this catalog as examples (e.g. `myagent`, sample agent folder names) reflect the original extraction context, not the current shipped behavior. For the current shape of the baseline, read [CAPABILITIES.md](CAPABILITIES.md) and [ARCHITECTURE.md](ARCHITECTURE.md) instead. Keep this file for provenance and patch-level debugging.

## Executive Summary

**Total scope:** 10 files across 3 repositories; ~374 net lines added (~22 removed).

- **nanoclaw-v2:** 6 files modified (5 harness-related, 1 unrelated Discord feature)
- **Nova:** 7 files modified (2 harness-specific, 5 viewer/trace-infrastructure feature work)
- **MasterMind:** 2 files exist (README.md + Vault.md); starter pack content in place

**Key files touched:**
1. **Tracing (nanoclaw-v2):** src/log.ts, src/router.ts, src/delivery.ts, container/.../claude.ts
2. **Vault (nanoclaw-v2):** container/.../claude.ts (shared with Tracing)
3. **Nova roots registration:** packages/mindgraph/src/{roots,trace-sources}.ts
4. **Nova trace infrastructure:** packages/mindgraph-trace/* (new conversation grouping), packages/mindgraph-view/* (layout refinement)
5. **MasterMind starter pack:** README.md (MindGraph conventions, tracing spec, vault rules) + Vault.md (vault gate rules)

**Baseline:** nanoclaw-v2 working tree diff'd vs upstream origin/main (v2.0.17; v2.0.10 tag does not exist).

---

## Open Questions

1. **Nova upstream baseline:** Nova repo has no git remote configured. All changed files (packages/mindgraph/* and packages/mindgraph-trace/*) are the operator's original work with no upstream to diff against. **Question for the operator:** Should friends clone from your Nova repo directly, or should the bundle patch against a clean scaffolding? This changes the dependency story in Phase B.

2. **Discord feature scope:** `src/channels/discord.ts` (new file) + `src/channels/index.ts` (registration line) + `package.json` (adds `@chat-adapter/discord@4.26.0`) and ~40 lines in pnpm-lock.yaml are **not harness-related** — they're a separate Discord channel adapter feature. Should these be excluded from the bundle, or bundled as a prerequisite install? Recommend excluding; friends can backport Discord separately if needed.

3. **Vault.md scope in MasterMind:** Vault.md (56 lines) is already written and complete. It implements the gate logic that container/agent-runner/src/providers/claude.ts enforces. No changes needed there — it's ready to ship.

4. **Wiki conventions content:** README.md section "MindGraph Conventions" (lines 56–154) is the bundle's wiki-frontmatter spec. This matches the v2-agent folder layout and the `node_id` shape (`<agent>:soul`, etc.) used in nanoclaw-v2 trace emission. No separate document needed; this section is it.

---

## Harness-Related Files (to bundle)

### src/log.ts
**Source:** `/Users/max/Projects/Agents/TechAgent/nanoclaw-v2/src/log.ts`  
**Upstream baseline:** qwibitai/nanoclaw origin/main `src/log.ts`  
**Bundle category:** Tracing — JSONL trace sink  
**Diff size:** ~133 added / ~0 removed  
**Patch strategy:** Surgical hunks (append new exports + helper functions; modify emit() call)

**Hunks:**

- **Lines 1–4 (added):** Import `fs`, `path`, and `GROUPS_DIR` from config.js — needed for filesystem trace I/O.

- **Lines 8–56 (added):** `TraceContext` interface + session-tracking maps + helper exports:
  - `recordInboundForSession(sessionId, inboundMsgId)` — host-side inbound→session mapping (called by router.ts).
  - `traceIdForSession(sessionId)` — lookup inbound message id for a session (called by delivery.ts exit events).
  - `entryNodeForAgentFolder(folder)` — map group folder to MindGraph entry node (e.g., "manu" → "manu:soul"). Called by router and delivery.
  - `traceScopeForAgentFolder(folder)` — extract agent scope for container-side intermediate events. Called by router.
  - `writeTraceSentinels(agentGroupId, sessionId, traceId, scope)` — write `.current-trace-id` and `.current-agent` files to `data/v2-sessions/<agentGroupId>/<sessionId>/` so container PreToolUse hook can tag intermediate `read`/`write`/`vault_access` events.

- **Lines 57–129 (added):** JSONL trace sink: `dateDir()`, `writeTraceLine(trace, level, msg, data)`:
  - Appends event lines to `<GROUPS_DIR>/<agent_folder>/Traces/YYYY-MM-DD/<trace_id>.jsonl`.
  - Event shape: `{trace_id, timestamp, agent, node_id, event, related_node_id?, request_summary?, metadata}`.
  - Also appends summary to `index.jsonl` on `route`/`entry` events so Nova's left panel shows traces once per inbound.
  - Failures drop silently — tracing must never break the host.

- **Lines 176–179 (modified):** In `emit()` function: check if log data contains a `trace` field; if so, call `writeTraceLine()` to emit JSONL event.

**Notes:**
- No new env vars required (uses existing config imports).
- Sentinel file paths are hardcoded relative to `process.cwd()/data/v2-sessions`.
- Traces directory structure: `<GROUPS_DIR>/<agent_folder>/Traces/<YYYY-MM-DD>/<trace_id>.jsonl` + `index.jsonl` at Traces root.
- Per-invocation model: `trace_id = Discord inbound message id` (not session id).

---

### src/router.ts
**Source:** `/Users/max/Projects/Agents/TechAgent/nanoclaw-v2/src/router.ts`  
**Upstream baseline:** qwibitai/nanoclaw origin/main `src/router.ts`  
**Bundle category:** Tracing — host→container sentinel plumbing + inbound entry event emission  
**Diff size:** ~41 added / ~22 removed  
**Patch strategy:** Surgical hunks (import additions + deliverToAgent modifications)

**Hunks:**

- **Lines 30–31 (modified):** Import line: remove `stopTypingRefresh` (unrelated), add four harness exports from log.ts:
  - `recordInboundForSession`, `entryNodeForAgentFolder`, `traceScopeForAgentFolder`, `writeTraceSentinels`

- **Lines 292–300 (removed/modified):** Delete the conditional `else if (agent.ignored_message_policy === 'accumulate' && !(engages && ...))` logic block (unrelated security gate change; not harness).

- **Lines 437–456 (added):** In `deliverToAgent()` function, after session write and before log.info():
  - Extract user text from `event.message.content` → `summaryShort` (first 120 chars).
  - Call `recordInboundForSession(session.id, event.message.id)` to store inbound→session mapping.
  - Call `writeTraceSentinels()` to write `.current-trace-id` and `.current-agent` to the container's mounted workspace.
  - Emit an `entry` event via log.info() with a `trace` field containing `{trace_id, agent_folder, event: 'entry', node_id, summary}`.

- **Lines 473–477 (removed/modified):** Remove conditional `if (!woke) stopTypingRefresh()` logic (unrelated; just call `wakeContainer()` directly).

**Notes:**
- Sentinel files are written to `data/v2-sessions/<agentGroupId>/<sessionId>/` every time an inbound routes, so coalesced sessions attribute intermediates to the most recent invocation.
- `node_id` for entry event: agent's Soul node (e.g., "manu:soul") or fallback "manu:claude.local".
- `summary` (first 120 chars of user text) becomes the `request_summary` in the JSONL entry event.

---

### src/delivery.ts
**Source:** `/Users/max/Projects/Agents/TechAgent/nanoclaw-v2/src/delivery.ts`  
**Upstream baseline:** qwibitai/nanoclaw origin/main `src/delivery.ts`  
**Bundle category:** Tracing — outbound exit event emission  
**Diff size:** ~26 added / ~0 removed  
**Patch strategy:** Surgical hunks (import additions + deliverMessage modifications)

**Hunks:**

- **Lines 23 (modified):** Import line: add `traceIdForSession` and `entryNodeForAgentFolder` from log.js.

- **Lines 363–394 (added):** In `deliverMessage()` function, after API call succeeds, before log.info():
  - Look up agent group by `session.agent_group_id` to get the folder.
  - Retrieve the trace_id for this session (via `traceIdForSession()`) to pair exit with the most-recent inbound.
  - Parse the outbound message's `text` field (if present) to measure response length.
  - Emit an `exit` event via log.info() with a `trace` field containing `{trace_id, agent_folder, event: 'exit', node_id}` plus optional `response_length` metadata.
  - Falls back silently if no agent group or trace_id found (e.g., system-action delivery with no preceding route).

**Notes:**
- Exit node: same as entry node (agent's Soul, e.g., "manu:soul").
- response_length is optional and only emitted if the outbound message parses as JSON with a `.text` field.
- If trace_id not found (no prior inbound recorded), the exit event is skipped — no error.

---

### container/agent-runner/src/providers/claude.ts
**Source:** `/Users/max/Projects/Agents/TechAgent/nanoclaw-v2/container/agent-runner/src/providers/claude.ts`  
**Upstream baseline:** qwibitai/nanoclaw origin/main `container/agent-runner/src/providers/claude.ts`  
**Bundle categories:** Vault (rule enforcement), Tracing (intermediate event emission)  
**Diff size:** ~192 added / ~0 removed (plus 4 lines modified)  
**Patch strategy:** Full prepend of Vault + Tracing gate code; surgical modification of preToolUseHook

**Hunks:**

- **Lines 1–3 (added):** Import `fs` and `path` (for sentinel file I/O and trace JSONL writes).

- **Lines 14–75 (added):** Vault gate implementation (MasterMind/Vault.md rules 1 + 5):
  - Constants: `VAULT_FILE_TOOLS` (Read, Write, Edit), `VAULT_OWN_ATTACHED` (/workspace/vault), `VAULT_OWN_GROUP` (/workspace/agent/Vault), `VAULT_TRACE_MARKER` (/workspace/.trace-forced).
  - `extractVaultPaths(toolName, toolInput)` — find all vault-like paths in Read/Write/Edit tools and Bash commands.
  - `isOwnVaultPath(p)` — check if path is the agent's own vault (attached files or group Vault).
  - `evaluateVaultPath(p)` — decision: block (cross-agent Vault) or allow (own Vault) or pass-through (non-Vault).
  - `markTraceForced(toolName, p, reason)` — append to `.trace-forced` marker file when rule 5 (own-vault read) triggers.

- **Lines 76–165 (added):** Container-side trace emission:
  - Constants: `TRACE_ID_FILE` (/workspace/.current-trace-id), `TRACE_AGENT_FILE` (/workspace/.current-agent), `MIND_FILE_RE` (regex for /workspace/agent/*.md files).
  - `readSentinel(p)` — read host-written sentinel files (trace_id, agent scope).
  - `dateDir()` — format YYYY-MM-DD folder name.
  - `appendTraceEvent(payload)` — write JSONL line to `/workspace/agent/Traces/<dateDir>/<traceId>.jsonl`.
  - `emitMindEvent(toolName, mindPath)` — emit `read`/`write` event when Claude touches a Mind page (registered via `node_id: <agent>:<slug>`).
  - `emitVaultEvent(toolName, vaultPath, decision, reason)` — emit `vault_access` event for both allowed and blocked vault touches (so Nova shows why a path was gated).

- **Lines 317–343 (added to preToolUseHook):** Vault gate + intermediate tracing:
  - Extract vault paths from the tool call.
  - For each path: evaluate decision, emit vault_access event, block if cross-agent, or force-trace if own-vault.
  - For file tools (Read/Write/Edit): emit Mind-page `read`/`write` events if the target is a `.md` file in /workspace/agent/.
  - All gate failures return `decision: 'block'` with a user-facing error message citing MasterMind/Vault.md rule 1.

- **Line ~415 (modified):** Remove lines that expose `process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW` override (hardcode to '165000'). **This is unrelated to the harness but is a cleanup in the same PR; recommend including it as-is.**

**Notes:**
- Sentinel file paths are read from /workspace (the container-side mount).
- Vault decisions are **also** trace events: rule-1 BLOCKs and rule-5 AUTO-TRACE traces are both written to the JSONL.
- Mind-file detection: only `/workspace/agent/<name>.md` files (agent-scope root Mind pages); nested files in subdirectories are ignored.
- All I/O failures drop silently — the gate must never crash the agent.

---

## Nova-Specific Files (patch into existing clone)

### packages/mindgraph/src/roots.ts
**Source:** `/Users/max/Projects/Nova/packages/mindgraph/src/roots.ts`  
**Upstream baseline:** None (Nova has no git remote; treat as greenfield)  
**Bundle category:** Nova — v2 agent wiki registration  
**Diff size:** 2 lines added  
**Patch strategy:** Append-only (add two new root entries)

**Hunks:**

- **Lines 28–29 (added):** Register two v2 agent group folders as MindGraph roots:
  - `{ scope: "v2-testagent", label: "v2 TestAgent (pilot)", path: <agents>/TechAgent/nanoclaw-v2/groups/dm-with-max }`
  - `{ scope: "v2-manu", label: "Manu (v2)", path: <agents>/TechAgent/nanoclaw-v2/groups/manu }`
  - These scopes **must match** the scope prefix in nanoclaw-v2's entryNodeForAgentFolder() mappings.

**Notes:**
- `<agents>` resolves to the parent of Nova (e.g., if Nova is at `/Users/max/Projects/Nova`, agents is `/Users/max/Projects/Agents`).
- Scopes "v2-testagent" and "v2-manu" are hardcoded in nanoclaw-v2/src/log.ts (entryNodeForAgentFolder() + traceScopeForAgentFolder()).

---

### packages/mindgraph/src/trace-sources.ts
**Source:** `/Users/max/Projects/Nova/packages/mindgraph/src/trace-sources.ts`  
**Upstream baseline:** None  
**Bundle category:** Nova — v2 trace directory registration  
**Diff size:** 2 lines added  
**Patch strategy:** Append-only (add two new trace source entries)

**Hunks:**

- **Lines 29–30 (added):** Register two v2 trace output directories:
  - `{ scope: "v2-testagent", label: "v2 TestAgent (pilot)", path: <agents>/TechAgent/nanoclaw-v2/groups/dm-with-max/Traces }`
  - `{ scope: "v2-manu", label: "Manu (v2)", path: <agents>/TechAgent/nanoclaw-v2/groups/manu/Traces }`
  - Scopes must match the roots.ts registrations above.

**Notes:**
- These directories are created by nanoclaw-v2's src/log.ts `writeTraceLine()` function.
- Index file at `<agent_folder>/Traces/index.jsonl` lists all traces for quick scanning in Nova's left panel.

---

## Nova Feature Work (likely NOT bundled, but scoped here for reference)

These changes enable Nova's trace viewer to group related traces (conversation rounds), refine D3 layout, and surface context windows. They are production-ready but orthogonal to the harness bundle.

### packages/mindgraph-trace/src/index.ts
**Change:** Export new `groupByConversation` function (line 11).

### packages/mindgraph-trace/src/load.ts
**Change:** Add `groupByConversation()` helper (lines 64–78) to group traces by Claude SDK `conversation_id` (session id), so multi-turn conversations surface context.

### packages/mindgraph-trace/src/types.ts
**Change:** Add optional `conversation_id` field to `TraceIndexEntry` interface (lines 58–67). Used to link related traces in multi-turn flows.

### packages/mindgraph/src/app/ViewerClient.tsx
**Changes:** Add `conversationPeers` memo (lines 118–132) to find earlier traces in the same conversation. Render "Earlier in this conversation" panel (lines 348–370) with buttons to jump between related turns. **New styles:** `conversationBlockStyle`, `conversationPeerStyle`, `conversationPeerSummaryStyle`, `conversationPeerMetaStyle` (lines 909–943).

### packages/mindgraph-view/src/default-registry.ts
**Changes:** Refine D3 node anchoring:
- Switch most node types from `anchor: "ring"` to `anchor: "outer"` (agents at ring, internal nodes in outer orbit).
- Add missing `anchor: "outer"` to memory, decision, tool, channel node types.
- Move project_doc and wiki to `anchor: "center"`.

### packages/mindgraph-view/src/MindGraph.tsx
**Changes:** Major D3 force-graph overhaul (160+ lines):
- Add `CENTER_SCOPES` constant: scopes whose wiki content belongs at center ("project", "mastermind").
- Replace `radialDistance()` with `effectiveAnchor()` to support per-node frontmatter `properties.anchor` override.
- Pin ring-anchored nodes (agents) to fixed positions around a circle; use cluster forces to keep inner nodes in each agent's orbit.
- Scope-based repulsion: inner nodes gravitate toward their agent's radial line.

**Recommendation:** Ship these changes separately; they are Nova polish, not harness infrastructure.

---

## MasterMind Starter Pack (already in place)

### README.md
**Source:** `/Users/max/Projects/Agents/MasterMind/README.md`  
**Status:** Complete, ready to ship.  
**Sections relevant to bundle:**
- **MindGraph Conventions (lines 56–154):** Frontmatter schema, valid node types, ID scope rules, edge relation vocabulary, worked example, required files (Soul, Goal, index, log).
- **Request Tracing (lines 192–299):** Gate (TRACING_ENABLED env var), output path (`/workspace/extra/Traces/<YYYY-MM-DD>/<trace_id>.jsonl`), event schema, event types (entry, read, write, exit, reason), trace index shape (`index.jsonl`), scope boundary (Mind-only, no infrastructure I/O).
- **Confidential Files / Vault (lines 303–305):** References Vault.md (separate file).

**Bundle integration:**
- Wiki conventions section (76–154) defines the frontmatter shape that nanoclaw-v2 agents write when they touch Mind pages.
- Tracing section (192–299) documents the JSONL event schema that nanoclaw-v2 emits and Nova ingests. Event types and field shapes must match the code.
- No changes needed; ship as-is.

### Vault.md
**Source:** `/Users/max/Projects/Agents/MasterMind/Vault.md`  
**Status:** Complete, ready to ship.  
**Content:**
- **Vault Locations (lines 15–24):** Per-agent host paths (update as agents come online).
- **Five Hard Rules (lines 33–43):**
  1. Per-agent isolation (rule 1 → container/.../claude.ts vault gate).
  2. No cross-agent transfer (rules 1 + 2 → gate blocks cross-agent paths).
  3. Files never leave Vault folder (rule 3 → gate + host security).
  4. Files never to other LLMs (rule 4 → gate + host credentials).
  5. Vault read auto-forces tracing (rule 5 → container/.../claude.ts `markTraceForced()` + gate behavior).
- **Cross-Agent Vault Requests (lines 45–51):** Workflow (ask the operator directly; no agent-to-agent file passing).
- **Violation Consequence (lines 53–55):** Deprovisioning on breach.

**Bundle integration:**
- Rules 1 + 5 are enforced by container/.../claude.ts preToolUseHook (see Vault gate section above).
- Rules 2–4 are documented here; agents are expected to read and comply.
- No changes needed; ship as-is.

---

## Environment Variables & Configuration

### Introduced by the harness:

**Host-side (nanoclaw-v2):**
- `LOG_LEVEL` — existing; unrelated (used before harness).
- `TRACING_ENABLED` — **NOT injected by nanoclaw-v2; documented in MasterMind/README.md.** Phase B install should note that agents read this env var and disable trace emission if not 'true'.

**Container-side (agent-runner/src/providers/claude.ts):**
- No new required env vars (reads sentinel files instead).
- Hardcoded paths:
  - `/workspace/.current-trace-id` — inbound message id (written by router.ts).
  - `/workspace/.current-agent` — agent scope (written by router.ts).
  - `/workspace/.trace-forced` — vault access marker (appended by claude.ts if rule 5 triggers).
  - `/workspace/agent/Traces/<YYYY-MM-DD>/<trace_id>.jsonl` — trace output.
  - `/workspace/vault/` — own attached-file vault (read-only mount).
  - `/workspace/agent/Vault/` — own group-folder vault (if it exists).

**Filesystem paths (nanoclaw-v2):**
- Trace output: `<GROUPS_DIR>/<agent_folder>/Traces/<YYYY-MM-DD>/<trace_id>.jsonl` + `index.jsonl`.
  - `<GROUPS_DIR>` = `path.resolve(PROJECT_ROOT, 'groups')` (defined in src/config.ts).
  - Automatically created by `writeTraceLine()`.
- Session sentinel files: `data/v2-sessions/<agentGroupId>/<sessionId>/.current-trace-id` + `.current-agent`.
  - Base path: `path.resolve(process.cwd(), 'data', 'v2-sessions')`.
  - Created by `writeTraceSentinels()` in router.ts flow.

---

## Files NOT in the Bundle

### Discord adapter (unrelated feature)
- `src/channels/discord.ts` — new file, Discord channel integration.
- `src/channels/index.ts` — registration import for Discord adapter.
- `package.json` — adds `@chat-adapter/discord@4.26.0`.
- `pnpm-lock.yaml` — ~40 lines of discord.js transitive dependencies.

**Rationale:** Discord support is a separate feature (not required for harness). Friends can backport it independently if needed.

### Deleted agent-specific CLAUDE.md files
- `groups/global/CLAUDE.md` (deleted)
- `groups/main/CLAUDE.md` (deleted)

**Rationale:** These are agent-specific system prompts, not harness infrastructure. Excluded from bundle.

### package.json version bump
- Version changed from 2.0.17 → 2.0.10. **This is likely a test/revert artifact and should NOT be included in the bundle.** Phase B should preserve the upstream version or use a v2.0.10+ tag explicitly if reverting is intentional.

---

## Recommendations for Phase B (Bundle Install)

### Install Order

1. **Prerequisite:** Friends must have a working nanoclaw-v2 checkout at or past origin/main (v2.0.17+). No need to force v2.0.10 tag (it doesn't exist).

2. **Step 1: Patch nanoclaw-v2 host files** (in order):
   - `src/log.ts` — append tracing exports and JSONL sink.
   - `src/router.ts` — import harness functions, add inbound→session tracking, emit entry events.
   - `src/delivery.ts` — import harness functions, emit exit events.

3. **Step 2: Patch container file**:
   - `container/agent-runner/src/providers/claude.ts` — prepend Vault gate + trace emission blocks; update preToolUseHook.

4. **Step 3: Register with Nova** (if Nova is present):
   - `packages/mindgraph/src/roots.ts` — append v2 agent roots.
   - `packages/mindgraph/src/trace-sources.ts` — append v2 trace sources.

5. **Step 4: Ensure MasterMind starter pack in place**:
   - Verify `MasterMind/README.md` contains full MindGraph Conventions + Tracing sections.
   - Verify `MasterMind/Vault.md` is present and complete.
   - If missing, copy from `/Users/max/Projects/Agents/MasterMind/`.

### File Update Strategy

| File | Strategy | Complexity |
|------|----------|-----------|
| `src/log.ts` | Surgical hunks (append new exports, modify emit call) | Low |
| `src/router.ts` | Surgical hunks (import additions, add deliverToAgent logic) | Medium |
| `src/delivery.ts` | Surgical hunks (import additions, add exit event logic) | Low |
| `container/.../claude.ts` | Full prepend (Vault + Trace blocks added before preToolUseHook); surgical hook modification | Medium-High |
| `packages/mindgraph/src/roots.ts` | Append-only (two new entries) | Trivial |
| `packages/mindgraph/src/trace-sources.ts` | Append-only (two new entries) | Trivial |
| `MasterMind/README.md` | Verify present; no changes | Trivial |
| `MasterMind/Vault.md` | Verify present; no changes | Trivial |

### Prerequisite Checks

1. **Verify nanoclaw-v2 paths:**
   - Check that `src/config.ts` exports `GROUPS_DIR`.
   - Check that `src/log.ts` does NOT already have `TraceContext` interface (would indicate prior merge or version conflict).

2. **Verify container setup:**
   - Check that `container/agent-runner/src/providers/claude.ts` has the `preToolUseHook` function (all versions should; confirm its location).

3. **Check Nova presence:**
   - If `packages/mindgraph/src/roots.ts` exists, apply roots/trace-sources patches.
   - If Nova is not present, skip those patches (the bundle is still complete for nanoclaw-v2 + MasterMind only).

4. **Verify MasterMind directory:**
   - `MasterMind/` must exist and be writable (for future updates).
   - Copy README.md and Vault.md if missing.

### Conflict Resolution

**If a friend's nanoclaw-v2 has already been customized:**
- Check whether `src/log.ts` already contains trace emission logic (different shape from this bundle).
- Check whether `container/.../claude.ts` already has vault-gate or trace-emit code (would conflict).
- If conflicts exist, recommend a manual merge review or contact the operator to align implementations.

### Testing Checklist (Phase B → Phase C)

1. Nanoclaw-v2 builds without errors: `pnpm build`.
2. Router accepts an inbound message; sentinel files are created in `data/v2-sessions/`.
3. Trace JSONL files are created in `groups/<agent_folder>/Traces/<YYYY-MM-DD>/`.
4. Container's PreToolUse hook blocks cross-agent vault paths (if testing with a multi-agent setup).
5. Own-vault reads emit vault_access events and set `.trace-forced` marker.
6. Nova can load the v2 agent traces (roots and trace-sources resolve correctly).

---

## Caveats & Future Work

1. **version field in package.json:** The working tree has version 2.0.10, but origin/main is 2.0.17. Recommend **not** including the package.json version change in Phase B; let friends keep their upstream version or explicitly pin v2.0.10 if there's a reason.

2. **pnpm-lock.yaml:** Do NOT include the full lock file in the bundle (too verbose). Phase B should instruct friends to `pnpm install @chat-adapter/discord@4.26.0` separately if they want Discord, or ignore it if harness-only.

3. **Nova mirror dependency:** Since Nova has no upstream, friends must clone from the operator's fork. The bundle cannot patch a "clean" mindgraph package; it can only patch an existing Nova install. **Clarify with the operator** whether the bundle should assume Nova is already present or whether Phase B should scaffold a minimal Nova stub.

4. **Vault read auto-force tracing (rule 5):** The `.trace-forced` marker is written but not yet read by anything in this phase. Phase C (walking-skeleton) will implement the agent-side reader that auto-enables tracing on rule-5 triggers.

5. **Multi-agent fleet coordination:** The bundle assumes agents can discover each other's Vaults via hardcoded scope names (manu, v2-testagent, etc.). Phase C should consider a registry or auto-discovery mechanism as the fleet grows.

---

## Summary Table

| Category | Files | LOC Added | Status | Notes |
|----------|-------|-----------|--------|-------|
| **Tracing host** | src/log.ts, router.ts, delivery.ts | ~200 | ✅ Ready | Append-only + surgical mods |
| **Vault + Tracing container** | container/.../claude.ts | ~192 | ✅ Ready | Prepend blocks + hook mods |
| **Nova registration** | packages/mindgraph/src/{roots,trace-sources}.ts | 4 | ✅ Ready | Append-only |
| **MasterMind starter pack** | README.md, Vault.md | — | ✅ In place | No changes needed |
| **Unrelated (excluded)** | src/channels/*, package.json version, pnpm-lock.yaml | — | ⚠️ Exclude | Discord feature work |

**Total harness bundle: ~396 net lines across 6 core files + 2 config registrations.**

