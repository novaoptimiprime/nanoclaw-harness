#!/usr/bin/env bash
#
# install-harness — install the nanoclaw harness (JSONL tracing + Vault gate
# + MasterMind starter pack + optional Nova wiring) onto a clean nanoclaw v2
# checkout. Idempotent: every step checks state and skips if already done.
#
# Usage:
#   ./install-harness.sh \
#     --nanoclaw=/path/to/nanoclaw-v2 \
#     --mastermind=/path/to/MasterMind \
#     --nova=/path/to/Nova            # optional
#
# Flags:
#   --skip-build            do not run pnpm install / pnpm run build
#   --skip-container-build  do not run ./container/build.sh (skip Docker image)
#
# If invoked from inside a nanoclaw v2 checkout with no flags:
#   --nanoclaw   defaults to $PWD
#   --mastermind defaults to $PWD/../MasterMind (created if missing)
#   --nova       must be passed explicitly
#
# Exit codes:
#   0  success (or nothing to do)
#   1  bad args / target not found
#   2  patch application failed (target diverged from baseline)
#   3  pnpm build failed
#   4  container/build.sh failed (Docker image not produced)
#
set -euo pipefail

OVERLAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH_DIR="$OVERLAY_DIR/src/patches"
MASTERMIND_SRC="$OVERLAY_DIR/templates/MasterMind"

NANOCLAW_PATH=""
MASTERMIND_PATH=""
NOVA_PATH=""
SKIP_BUILD=false
SKIP_CONTAINER_BUILD=false

# ----- arg parsing --------------------------------------------------------

for arg in "$@"; do
  case "$arg" in
    --nanoclaw=*)           NANOCLAW_PATH="${arg#*=}" ;;
    --mastermind=*)         MASTERMIND_PATH="${arg#*=}" ;;
    --nova=*)               NOVA_PATH="${arg#*=}" ;;
    --skip-build)           SKIP_BUILD=true ;;
    --skip-container-build) SKIP_CONTAINER_BUILD=true ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown arg: $arg" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
  esac
done

# Auto-detect when running from inside a nanoclaw checkout.
if [ -z "$NANOCLAW_PATH" ]; then
  if [ -f "./src/log.ts" ] && [ -f "./container/agent-runner/src/providers/claude.ts" ]; then
    NANOCLAW_PATH="$PWD"
  else
    echo "ERROR: --nanoclaw=PATH not given and current dir is not a nanoclaw v2 checkout." >&2
    exit 1
  fi
fi

if [ -z "$MASTERMIND_PATH" ]; then
  MASTERMIND_PATH="$NANOCLAW_PATH/../MasterMind"
fi

# Resolve to absolute paths.
NANOCLAW_PATH="$(cd "$NANOCLAW_PATH" 2>/dev/null && pwd)" || {
  echo "ERROR: nanoclaw path does not exist: $NANOCLAW_PATH" >&2; exit 1
}
# MasterMind may not exist yet; resolve parent + leaf.
mkdir -p "$MASTERMIND_PATH"
MASTERMIND_PATH="$(cd "$MASTERMIND_PATH" && pwd)"

if [ -n "$NOVA_PATH" ]; then
  NOVA_PATH="$(cd "$NOVA_PATH" 2>/dev/null && pwd)" || {
    echo "ERROR: nova path does not exist: $NOVA_PATH" >&2; exit 1
  }
fi

echo "=== install-harness ==="
echo "  nanoclaw   : $NANOCLAW_PATH"
echo "  mastermind : $MASTERMIND_PATH"
echo "  nova       : ${NOVA_PATH:-<skipped>}"
echo

# ----- sanity checks on nanoclaw --------------------------------------------

cd "$NANOCLAW_PATH"

for f in src/log.ts src/router.ts src/delivery.ts container/agent-runner/src/providers/claude.ts; do
  if [ ! -f "$f" ]; then
    echo "ERROR: expected file not found in nanoclaw checkout: $f" >&2
    echo "       Is this a nanoclaw v2 tree? Use --nanoclaw=PATH to point at the right one." >&2
    exit 1
  fi
done

if [ ! -d ".git" ]; then
  echo "ERROR: nanoclaw checkout is not a git repo. The harness uses 'git apply'." >&2
  exit 1
fi

# ----- step 1: apply nanoclaw patches ---------------------------------------

echo "STEP 1: apply nanoclaw harness patches"

apply_patch() {
  local patch="$1" name
  name="$(basename "$patch")"

  if git apply --reverse --check "$patch" 2>/dev/null; then
    echo "  [skip] $name (already applied)"
    return 0
  fi

  if ! git apply --check "$patch" 2>/dev/null; then
    echo "  [FAIL] $name does not apply cleanly to this checkout." >&2
    echo "         Your nanoclaw working tree has diverged from the patch baseline" >&2
    echo "         (upstream qwibitai/nanoclaw ~v2.0.17). Inspect the patch in" >&2
    echo "         $patch and resolve by hand." >&2
    return 2
  fi

  git apply "$patch"
  echo "  [ok]   $name"
}

for p in "$PATCH_DIR"/*.patch; do
  apply_patch "$p" || exit 2
done

# ----- step 2: MasterMind starter pack --------------------------------------

echo "STEP 2: install MasterMind starter pack"

for f in README.md Vault.md; do
  src="$MASTERMIND_SRC/$f"
  dst="$MASTERMIND_PATH/$f"
  if [ -f "$dst" ]; then
    echo "  [skip] $f (exists at $dst — not overwriting)"
  else
    cp "$src" "$dst"
    echo "  [ok]   $f -> $dst"
  fi
done

# ----- step 3: optional Nova registration -----------------------------------

if [ -n "$NOVA_PATH" ]; then
  echo "STEP 3: register v2 agents in Nova"

  ROOTS="$NOVA_PATH/packages/mindgraph/src/roots.ts"
  TRACES="$NOVA_PATH/packages/mindgraph/src/trace-sources.ts"

  for f in "$ROOTS" "$TRACES"; do
    if [ ! -f "$f" ]; then
      echo "  [WARN] Nova file not found: $f" >&2
      echo "         Skipping Nova registration. Pass --nova=PATH pointing at" >&2
      echo "         a Nova checkout with packages/mindgraph/src/{roots,trace-sources}.ts." >&2
      NOVA_PATH=""
      break
    fi
  done
fi

if [ -n "$NOVA_PATH" ]; then
  echo "  [note] Nova present at $NOVA_PATH — agent registration is per-agent,"
  echo "         done by scripts/new-agent.sh as you create each agent."
  echo "         (No Nova edits made here.)"
fi

# ----- step 4: build --------------------------------------------------------

if $SKIP_BUILD; then
  echo "STEP 4: skip build (--skip-build)"
else
  echo "STEP 4: pnpm install + build"
  cd "$NANOCLAW_PATH"

  if ! command -v pnpm >/dev/null 2>&1; then
    echo "  [WARN] pnpm not found in PATH. Skipping build." >&2
    echo "         Install pnpm and re-run with --skip-build to avoid re-patching." >&2
  else
    pnpm install >&2 || { echo "  [FAIL] pnpm install failed" >&2; exit 3; }
    pnpm run build >&2 || { echo "  [FAIL] pnpm run build failed" >&2; exit 3; }
    echo "  [ok]   build succeeded"
  fi
fi

# ----- step 5: container image build ----------------------------------------
#
# Without this, the daemon spawns a container that exits 125 on first message
# because the agent-runner image doesn't exist locally yet. The build script
# is shipped by nanoclaw at ./container/build.sh and is idempotent (Docker
# layer cache makes re-runs fast).

if $SKIP_CONTAINER_BUILD; then
  echo "STEP 5: skip container image build (--skip-container-build)"
elif [ ! -x "$NANOCLAW_PATH/container/build.sh" ]; then
  echo "STEP 5: skip container image build (./container/build.sh not found or not executable)"
else
  echo "STEP 5: build agent-runner container image (./container/build.sh)"
  cd "$NANOCLAW_PATH"

  if ! command -v docker >/dev/null 2>&1; then
    echo "  [WARN] docker not found in PATH. Skipping container build." >&2
    echo "         Install Docker Desktop / engine and run ./container/build.sh manually." >&2
  elif ! docker info >/dev/null 2>&1; then
    echo "  [WARN] docker daemon not reachable. Skipping container build." >&2
    echo "         Start Docker and run ./container/build.sh manually." >&2
  else
    ./container/build.sh >&2 || { echo "  [FAIL] ./container/build.sh failed" >&2; exit 4; }
    echo "  [ok]   container image built"
  fi
fi

echo
echo "=== done ==="
echo "Restart your nanoclaw service so it picks up the new build:"
echo "  macOS:  launchctl kickstart -k \"gui/\$(id -u)/<your-nanoclaw-plist-label>\""
echo "          (e.g. com.nanoclaw, or com.nanoclaw-v2-<hash> if installed via setup --step service)"
echo "  Linux:  systemctl --user restart nanoclaw"
echo
echo "Post-install reminder — known first-run gotchas:"
echo "  * OneCLI agent created during 'pnpm run setup' defaults to selective"
echo "    secret mode → first Anthropic API call returns 401 silently. After"
echo "    setup, flip with: onecli agents set-secret-mode --id <agent-id> --mode all"
echo "  * Router defaults unknown_sender_policy='strict' → unregistered Discord"
echo "    user IDs get silently dropped. Register yourself as owner in v2.db's"
echo "    user_roles table before sending the first probe."
echo "  * setup --step register defaults engage_mode='mention' → for dedicated"
echo "    single-agent channels, switch to engage_mode='pattern' engage_pattern='.'"
echo "    in messaging_group_agents after registration."
