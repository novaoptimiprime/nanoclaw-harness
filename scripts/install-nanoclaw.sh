#!/usr/bin/env bash
#
# install-nanoclaw — clone upstream qwibitai/nanoclaw v2 to a target path.
#
# This is step 1 of bootstrapping a new agent-fleet project. It only clones
# nanoclaw; it does NOT apply the harness patches. Run install-harness.sh
# afterward (or use bootstrap-project.sh which orchestrates both).
#
# Usage:
#   ./install-nanoclaw.sh --target=/path/to/nanoclaw-v2 [--ref=34f3612]
#
# Flags:
#   --target=PATH   destination directory for the clone (required).
#   --ref=REF       branch / tag / commit to check out (default: origin/main).
#                   Tested baselines: commits 34f3612 and 941a75f (the former
#                   referenced as "v2.0.17" in upstream commit messages, but
#                   NOT a real git tag — pass the commit hash, not "v2.0.17").
#                   Omit --ref to track origin/main; the harness patches are
#                   verified to apply cleanly through 941a75f. If a future
#                   upstream commit causes patches to fail, pin --ref=941a75f
#                   while patches are refreshed.
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
  if ! (cd "$TARGET" && git checkout "$REF" 2>/dev/null); then
    echo "ERROR: git checkout $REF failed — ref does not resolve in upstream." >&2
    if [[ "$REF" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "       Note: '$REF' looks like a semver tag, but upstream qwibitai/nanoclaw" >&2
      echo "       does not publish git tags for v2.x.y releases (the version appears" >&2
      echo "       only in commit messages). Pass the commit hash instead — the tested" >&2
      echo "       baseline is '34f3612', or omit --ref entirely to track origin/main." >&2
    fi
    exit 2
  fi
fi

echo "STATUS: installed"
echo "HEAD: $(cd "$TARGET" && git rev-parse --short HEAD) ($(cd "$TARGET" && git log -1 --pretty=%s | head -c 60))"
echo
echo "Next step: apply the harness patches."
echo "  ./scripts/install-harness.sh --nanoclaw=$TARGET ..."
