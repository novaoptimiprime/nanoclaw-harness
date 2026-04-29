#!/usr/bin/env bash
#
# install-nanoclaw — clone upstream qwibitai/nanoclaw v2 to a target path.
#
# This is step 1 of bootstrapping a new agent-fleet project. It only clones
# nanoclaw; it does NOT apply the harness patches. Run install-mindgraph-harness.sh
# afterward (or use bootstrap-project.sh which orchestrates both).
#
# Usage:
#   ./install-nanoclaw.sh --target=/path/to/nanoclaw-v2 [--ref=v2.0.17]
#
# Flags:
#   --target=PATH   destination directory for the clone (required).
#   --ref=REF       branch / tag / commit to check out (default: origin/main).
#                   Tested compatibility range: v2.0.10 to v2.0.17.
#   --upstream=URL  override upstream URL (default: https://github.com/qwibitai/nanoclaw.git).
#   -h, --help      show this help.
#
# Exit codes:
#   0  success (or already cloned at target).
#   1  bad args / target conflict.
#   2  clone failed.
#
set -euo pipefail

UPSTREAM="https://github.com/qwibitai/nanoclaw.git"
TARGET=""
REF=""

for arg in "$@"; do
  case "$arg" in
    --target=*)   TARGET="${arg#*=}" ;;
    --ref=*)      REF="${arg#*=}" ;;
    --upstream=*) UPSTREAM="${arg#*=}" ;;
    -h|--help)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "ERROR: --target=PATH is required." >&2
  echo "Run with --help for usage." >&2
  exit 1
fi

echo "=== install-nanoclaw ==="
echo "  upstream : $UPSTREAM"
echo "  target   : $TARGET"
echo "  ref      : ${REF:-<default branch>}"
echo

# Idempotence: if the target already looks like a nanoclaw checkout, skip.
if [ -d "$TARGET/.git" ] && [ -f "$TARGET/src/log.ts" ] && [ -f "$TARGET/container/agent-runner/src/providers/claude.ts" ]; then
  echo "  [skip] target already contains a nanoclaw checkout."
  echo "  HEAD : $(cd "$TARGET" && git rev-parse --short HEAD) ($(cd "$TARGET" && git log -1 --pretty=%s | head -c 60))"
  exit 0
fi

if [ -e "$TARGET" ] && [ "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  echo "ERROR: target exists and is not empty: $TARGET" >&2
  echo "       Move or remove it before cloning." >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET")"

echo "STEP: clone"
git clone "$UPSTREAM" "$TARGET" || { echo "ERROR: git clone failed" >&2; exit 2; }

if [ -n "$REF" ]; then
  echo "STEP: checkout $REF"
  (cd "$TARGET" && git checkout "$REF") || { echo "ERROR: git checkout $REF failed" >&2; exit 2; }
fi

echo "STATUS: installed"
echo "HEAD: $(cd "$TARGET" && git rev-parse --short HEAD) ($(cd "$TARGET" && git log -1 --pretty=%s | head -c 60))"
echo
echo "Next step: apply the harness patches."
echo "  ./scripts/install-mindgraph-harness.sh --nanoclaw=$TARGET ..."
