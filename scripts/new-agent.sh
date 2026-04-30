#!/usr/bin/env bash
#
# new-agent — scaffold a new agent in an existing agent-fleet project.
#
# Stamps the agent template (Mind/Soul.md, Mind/Goal.md, Mind/index.md,
# Mind/log.md, Vault/, README.md) into <project>/<AgentName>/, substitutes
# placeholders, registers the agent's Mind + Traces in the project's Nova
# (if present), and prints the scope-mapping snippet to add to the project's
# patched src/log.ts (entryNodeForAgentFolder + traceScopeForAgentFolder).
#
# Usage:
#   ./new-agent.sh \
#     --project=/path/to/your-project \
#     --name="Hector" \
#     [--slug=hector]                  (default: lowercased name)
#     [--folder=hector]                (default: same as slug — nanoclaw groups/<folder>)
#     [--label="Hector"]               (default: same as name)
#     [--master=jarvis]                (default: read from project's MasterMind, fallback "jarvis")
#
# Exit codes:
#   0  agent scaffolded.
#   1  bad args.
#   2  target conflict (agent already exists).
#
set -euo pipefail

OVERLAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$OVERLAY_DIR/templates/agents/_template"

PROJECT=""
NAME=""
SLUG=""
FOLDER=""
LABEL=""
MASTER="jarvis"

for arg in "$@"; do
  case "$arg" in
    --project=*) PROJECT="${arg#*=}" ;;
    --name=*)    NAME="${arg#*=}" ;;
    --slug=*)    SLUG="${arg#*=}" ;;
    --folder=*)  FOLDER="${arg#*=}" ;;
    --label=*)   LABEL="${arg#*=}" ;;
    --master=*)  MASTER="${arg#*=}" ;;
    -h|--help)
      sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$PROJECT" ]; then echo "ERROR: --project=PATH is required." >&2; exit 1; fi
if [ -z "$NAME" ]; then echo "ERROR: --name=AgentName is required." >&2; exit 1; fi

PROJECT="$(cd "$PROJECT" 2>/dev/null && pwd)" || { echo "ERROR: project not found: $PROJECT" >&2; exit 1; }

[ -z "$SLUG" ] && SLUG="$(echo "$NAME" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-' '-' | sed 's/^-*//;s/-*$//')"
[ -z "$FOLDER" ] && FOLDER="$SLUG"
[ -z "$LABEL" ] && LABEL="$NAME"

TARGET="$PROJECT/$NAME"
DATE="$(date +%Y-%m-%d)"

echo "=== new-agent ==="
echo "  project : $PROJECT"
echo "  name    : $NAME (slug: $SLUG, folder: $FOLDER, label: $LABEL)"
echo "  master  : $MASTER"
echo "  target  : $TARGET"
echo

if [ -e "$TARGET" ]; then
  echo "ERROR: target exists: $TARGET" >&2
  exit 2
fi

# ----- Stamp the agent template ---------------------------------------------

cp -R "$TEMPLATE_DIR" "$TARGET"

# ----- Substitute placeholders ----------------------------------------------

substitute() {
  local file="$1"
  sed -i.bak \
    -e "s|<AgentName>|$NAME|g" \
    -e "s|<agent-slug>|$SLUG|g" \
    -e "s|<master>|$MASTER|g" \
    -e "s|<YYYY-MM-DD>|$DATE|g" \
    "$file"
  rm -f "$file.bak"
}

find "$TARGET" -name '*.md' -type f | while read -r f; do
  substitute "$f"
done

echo "  [ok]   agent scaffold created"

# ----- Register in project Nova (if present) --------------------------------

NOVA_PATH="$PROJECT/nova"
if [ -d "$NOVA_PATH/packages/mindgraph/src" ]; then
  ROOTS="$NOVA_PATH/packages/mindgraph/src/roots.ts"
  TRACES="$NOVA_PATH/packages/mindgraph/src/trace-sources.ts"

  if [ -f "$ROOTS" ] && ! grep -q "\"$SLUG\"" "$ROOTS"; then
    awk -v entry="    { scope: \"$SLUG\", label: \"$LABEL\", path: \"$TARGET/Mind\" }," '
      /^[[:space:]]*\];/ && !done { print entry; done=1 }
      { print }
    ' "$ROOTS" > "$ROOTS.tmp" && mv "$ROOTS.tmp" "$ROOTS"
    echo "  [ok]   registered Mind in nova/roots.ts"
  fi

  if [ -f "$TRACES" ] && ! grep -q "\"$SLUG\"" "$TRACES"; then
    NANOCLAW_GROUPS="$PROJECT/nanoclaw-v2/groups/$FOLDER/Traces"
    awk -v entry="    { scope: \"$SLUG\", label: \"$LABEL\", path: \"$NANOCLAW_GROUPS\" }," '
      /^[[:space:]]*\];/ && !done { print entry; done=1 }
      { print }
    ' "$TRACES" > "$TRACES.tmp" && mv "$TRACES.tmp" "$TRACES"
    echo "  [ok]   registered Traces in nova/trace-sources.ts"
  fi
fi

# ----- Print the scope-mapping snippet for src/log.ts -----------------------

echo
echo "=== done ==="
echo "Agent scaffold at: $TARGET"
echo
echo "If '$FOLDER' is the nanoclaw groups folder for this agent (i.e. you'll"
echo "create $PROJECT/nanoclaw-v2/groups/$FOLDER/), add these mappings to"
echo "the patched $PROJECT/nanoclaw-v2/src/log.ts so traces anchor on"
echo "$SLUG:soul rather than the generic fallback:"
echo
cat <<EOF
  // Inside entryNodeForAgentFolder():
  if (folder === '$FOLDER') return '$SLUG:soul';

  // Inside traceScopeForAgentFolder():
  if (folder === '$FOLDER') return '$SLUG';
EOF
echo
echo "Next steps:"
echo "  1. Open $TARGET/Mind/Soul.md and fill in identity + voice."
echo "  2. Open $TARGET/Mind/Goal.md and fill in domain + scope."
echo "  3. Add the scope mapping above to nanoclaw-v2/src/log.ts."
echo "  4. Rebuild nanoclaw: cd $PROJECT/nanoclaw-v2 && pnpm run build"
echo "  5. Wire a channel for this agent (Discord, CLI socket, etc.) — nanoclaw concern, not harness."
echo "  6. Add a project-wiki summary page at $PROJECT/_ProjectWiki/Agents/$NAME.md"
echo "     (use $PROJECT/_ProjectWiki/Agents/_template.md as the starting point)."
echo
echo "Known first-run gotchas (apply to every new agent until upstream fixes land):"
echo "  * After 'pnpm run setup' creates this agent's OneCLI agent, flip its"
echo "    secret mode to 'all' or the first Anthropic API call returns 401:"
echo "      onecli agents list                                  # find the new agent's ID"
echo "      onecli agents set-secret-mode --id <id> --mode all"
echo "  * The router defaults unknown_sender_policy='strict' — register your"
echo "    own user_id as owner in v2.db before sending the first probe, or your"
echo "    inbound message is silently dropped."
