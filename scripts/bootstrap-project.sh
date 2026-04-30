#!/usr/bin/env bash
#
# bootstrap-project — spin up a new agent-fleet project from this baseline.
#
# Orchestrates the full setup: clones nanoclaw v2, applies harness patches,
# lays down templates (_ProjectWiki/, MasterMind/, project-root CLAUDE.md),
# vendors or symlinks Nova, optionally initializes git in the new project.
#
# Usage:
#   ./bootstrap-project.sh \
#     --target=/path/to/new-project \
#     --project-name="My New Fleet" \
#     [--master-name="Jarvis"] \
#     [--nanoclaw-ref=34f3612] \  (commit hash; "v2.0.17" is NOT a real tag)
#     [--nova=copy|symlink]      (default: copy. symlink shares the baseline
#                                   nova/ across projects — use only if you
#                                   want one Nova showing all your projects;
#                                   project-specific roots will be written into
#                                   the shared nova, not isolated per project.)
#     [--no-git]                 (skip git init in target)
#
# What this script does, in order:
#   1. Validates target dir is empty (or --force).
#   2. Lays down project skeleton: _ProjectWiki/, MasterMind/, CLAUDE.md.
#   3. Substitutes placeholders ([Project Name], <master>, etc.) in templates.
#   4. Clones nanoclaw v2 to <target>/nanoclaw-v2/.
#   5. Applies the harness patches via install-harness.sh.
#   6. Wires Nova: symlinks <target>/nova/ → baseline's nova/, OR copies it.
#   7. Initializes git in <target>/ (unless --no-git).
#   8. Prints next-step instructions.
#
# Exit codes:
#   0  bootstrap succeeded.
#   1  bad args.
#   2  target conflict.
#   3  step failed (nanoclaw clone, harness apply, etc.).
#
set -euo pipefail

OVERLAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATES_DIR="$OVERLAY_DIR/templates"
SCRIPTS_DIR="$OVERLAY_DIR/scripts"

TARGET=""
PROJECT_NAME=""
MASTER_NAME="Jarvis"
NANOCLAW_REF=""
NOVA_MODE="copy"
DO_GIT=true
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --target=*)        TARGET="${arg#*=}" ;;
    --project-name=*)  PROJECT_NAME="${arg#*=}" ;;
    --master-name=*)   MASTER_NAME="${arg#*=}" ;;
    --nanoclaw-ref=*)  NANOCLAW_REF="${arg#*=}" ;;
    --nova=*)          NOVA_MODE="${arg#*=}" ;;
    --no-git)          DO_GIT=false ;;
    --force)           FORCE=true ;;
    -h|--help)
      sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$TARGET" ]; then echo "ERROR: --target=PATH is required." >&2; exit 1; fi
if [ -z "$PROJECT_NAME" ]; then echo "ERROR: --project-name=\"...\" is required." >&2; exit 1; fi

case "$NOVA_MODE" in
  symlink|copy) ;;
  *) echo "ERROR: --nova must be 'symlink' or 'copy'." >&2; exit 1 ;;
esac

# Resolve target to absolute path.
mkdir -p "$TARGET"
TARGET="$(cd "$TARGET" && pwd)"

if [ "$(ls -A "$TARGET" 2>/dev/null)" ] && [ "$FORCE" = false ]; then
  echo "ERROR: target is not empty: $TARGET" >&2
  echo "       Use --force to bootstrap anyway (existing files may be overwritten)." >&2
  exit 2
fi

MASTER_SLUG="$(echo "$MASTER_NAME" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-' '-' | sed 's/^-*//;s/-*$//')"

echo "=== bootstrap-project ==="
echo "  target       : $TARGET"
echo "  project-name : $PROJECT_NAME"
echo "  master       : $MASTER_NAME (slug: $MASTER_SLUG)"
echo "  nanoclaw-ref : ${NANOCLAW_REF:-<default branch>}"
echo "  nova-mode    : $NOVA_MODE"
echo "  init-git     : $DO_GIT"
echo

# ----- Step 1: lay down project skeleton ------------------------------------

echo "STEP 1: lay down project skeleton"

# CLAUDE.md (project root)
cp "$TEMPLATES_DIR/CLAUDE.md" "$TARGET/CLAUDE.md"

# _ProjectWiki/
cp -R "$TEMPLATES_DIR/_ProjectWiki" "$TARGET/_ProjectWiki"

# MasterMind/
cp -R "$TEMPLATES_DIR/MasterMind" "$TARGET/MasterMind"

echo "  [ok]   CLAUDE.md, _ProjectWiki/, MasterMind/ copied"

# ----- Step 2: substitute placeholders --------------------------------------

echo "STEP 2: substitute placeholders"

substitute() {
  local file="$1"
  # Use a sed-friendly delimiter that's unlikely to appear in values.
  local pn="${PROJECT_NAME//|/\\|}"
  local mn="${MASTER_NAME//|/\\|}"
  local ms="${MASTER_SLUG//|/\\|}"
  sed -i.bak \
    -e "s|\\[Project Name\\]|$pn|g" \
    -e "s|<master>|$ms|g" \
    -e "s|<MasterAgentName>|$mn|g" \
    "$file"
  rm -f "$file.bak"
}

# Substitute in all markdown files we just copied.
find "$TARGET/_ProjectWiki" "$TARGET/MasterMind" "$TARGET/CLAUDE.md" -name '*.md' -type f | while read -r f; do
  substitute "$f"
done

echo "  [ok]   placeholders substituted"

# ----- Step 3: clone nanoclaw -----------------------------------------------

echo "STEP 3: clone nanoclaw v2"

NANOCLAW_TARGET="$TARGET/nanoclaw-v2"
NANOCLAW_FLAGS=(--target="$NANOCLAW_TARGET")
[ -n "$NANOCLAW_REF" ] && NANOCLAW_FLAGS+=(--ref="$NANOCLAW_REF")

"$SCRIPTS_DIR/install-nanoclaw.sh" "${NANOCLAW_FLAGS[@]}" || { echo "ERROR: install-nanoclaw.sh failed" >&2; exit 3; }

# ----- Step 4: apply harness patches ----------------------------------------

echo "STEP 4: apply harness patches"

"$SCRIPTS_DIR/install-harness.sh" \
  --nanoclaw="$NANOCLAW_TARGET" \
  --mastermind="$TARGET/MasterMind" \
  --skip-build || { echo "ERROR: install-harness.sh failed" >&2; exit 3; }

# Build runs inside install-harness.sh by default. We deferred it
# (--skip-build) so bootstrap is fast; build will run in the project's normal
# operation. Operator runs `cd nanoclaw-v2 && pnpm install && pnpm run build`
# manually as Step N+1 (printed at the end).

# ----- Step 5: wire Nova ----------------------------------------------------

echo "STEP 5: wire Nova ($NOVA_MODE)"

if [ "$NOVA_MODE" = "symlink" ]; then
  ln -sfn "$OVERLAY_DIR/nova" "$TARGET/nova"
  echo "  [ok]   nova -> $OVERLAY_DIR/nova (symlink)"
else
  cp -R "$OVERLAY_DIR/nova" "$TARGET/nova"
  echo "  [ok]   nova/ copied (~$(du -sh "$TARGET/nova" | cut -f1))"
fi

# Nova starts empty by design. Per-agent entries are added by new-agent.sh
# as each agent is scaffolded.

# ----- Step 6: git init -----------------------------------------------------

if $DO_GIT; then
  echo "STEP 6: git init"
  if [ -d "$TARGET/.git" ]; then
    echo "  [skip] $TARGET/.git already exists"
  else
    (cd "$TARGET" && git init -q && git add -A && git -c user.name="bootstrap" -c user.email="bootstrap@local" commit -q -m "Initial project skeleton from agent-fleet baseline")
    echo "  [ok]   $TARGET initialized as git repo"
  fi
fi

# ----- Done -----------------------------------------------------------------

echo
echo "=== done ==="
echo "Project bootstrapped at: $TARGET"
echo
echo "Next steps:"
echo "  1. cd $TARGET/nanoclaw-v2 && pnpm install && pnpm run build"
echo "  2. Run nanoclaw setup: pnpm run setup (interactive — provisions OneCLI + API key)."
echo "  3. Start nanoclaw daemon (launchctl on macOS, systemctl on Linux)."
echo "  4. Start Nova viewer: cd $TARGET/nova && pnpm install && pnpm run dev"
echo "  5. Create your first agent: $OVERLAY_DIR/scripts/new-agent.sh --project=$TARGET --name=YourAgentName"
echo "  6. Read $TARGET/_ProjectWiki/README.md and fill in [Project Name] with $PROJECT_NAME-specific scope."
