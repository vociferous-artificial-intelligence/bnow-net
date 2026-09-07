#!/usr/bin/env bash
# status.sh — one read-only screen answering "what is launched, what is delivered, what is
# stuck" for the 48h program remainder. This is what a launch decision (human or agent) reads
# instead of trusting memory or chat scrollback; it derives everything from the claim ledger,
# git, lsof, the logs directory and (when available) gh.
#
# Usage: scripts/launch/status.sh [--no-gh]
# bash 3.2 / BSD clean. Changes nothing.

set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
WT_ROOT=${BNOW_WT_ROOT:-$(cd "$REPO/.." && pwd)/bnow-net-worktrees}
CLAIMS="$WT_ROOT/claims"
LOGS="$WT_ROOT/logs"
TABLE="$SCRIPT_DIR/steps.tsv"
NO_GH=${1:-}

OPEN_PRS=""
if [ "$NO_GH" != "--no-gh" ] && command -v gh >/dev/null 2>&1; then
  OPEN_PRS=$(cd "$REPO" && gh pr list --state open --json number,headRefName \
    --template '{{range .}}{{.number}}:{{.headRefName}}{{"\n"}}{{end}}' 2>/dev/null || true)
fi

printf '%-4s %-26s %-12s %-14s %-30s %-7s %-6s %-6s %s\n' \
  STEP WORKTREE CLAIM SESSION BRANCH "±MAIN" DIRTY REPORT PR
printf '%s\n' '------------------------------------------------------------------------------------------------------------------'

grep -v '^#' "$TABLE" | while IFS='	' read -r STEP WT_NAME PROMPT MODEL ATTENDED REPORT NOTES; do
  [ -z "$STEP" ] && continue

  CLAIM=-; SESSION=-; BRANCH=-; AB=-; DIRTY=-; REP=-; PR=-

  CLAIM_DIR="$CLAIMS/step-$STEP"
  if [ -d "$CLAIM_DIR" ]; then
    CLAIM=$(cut -c6-16 "$CLAIM_DIR/created" 2>/dev/null || echo yes)   # MM-DDTHH:MM
    if [ -f "$CLAIM_DIR/pid" ]; then
      PID=$(cat "$CLAIM_DIR/pid")
      ST=$(ps -o stat= -p "$PID" 2>/dev/null | tr -d ' ')
      case "$ST" in
        "")  SESSION="pid:$PID DEAD" ;;
        T*)  SESSION="pid:$PID SUSP" ;;
        *)   SESSION="pid:$PID run" ;;
      esac
    elif [ -f "$CLAIM_DIR/mode" ]; then
      SESSION="attended"
    fi
  fi

  if [ "$WT_NAME" != "-" ] && [ -d "$WT_ROOT/$WT_NAME" ]; then
    WT="$WT_ROOT/$WT_NAME"
    BRANCH=$(git -C "$WT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')
    # shorten: strip the shared prefix for the display
    BRANCH=${BRANCH#48h/}
    set -- $(git -C "$WT" rev-list --left-right --count origin/main...HEAD 2>/dev/null || echo '? ?')
    AB="-$1/+$2"
    DIRTY=$(git -C "$WT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  fi

  [ -n "$REPORT" ] && [ -f "$REPO/docs/reviews/$REPORT" ] && REP=yes

  if [ -n "$OPEN_PRS" ] && [ "$WT_NAME" != "-" ]; then
    LANE_PREFIX=$(printf '%s\n' "$WT_NAME" | sed -E 's/^48h-/48h\//')
    HIT=$(printf '%s\n' "$OPEN_PRS" | grep -F ":$LANE_PREFIX" | cut -d: -f1 | tr '\n' ',' | sed 's/,$//')
    [ -n "$HIT" ] && PR="#$HIT"
  fi

  printf '%-4s %-26s %-12s %-14s %-30s %-7s %-6s %-6s %s\n' \
    "$STEP" "${WT_NAME#48h-}" "$CLAIM" "$SESSION" "$BRANCH" "$AB" "$DIRTY" "$REP" "$PR"
done

echo ""
echo "live sessions under $WT_ROOT (lsof, authoritative):"
if command -v lsof >/dev/null 2>&1; then
  lsof -a -d cwd -c claude 2>/dev/null | grep -F "$(basename "$WT_ROOT")" || echo "  none"
else
  echo "  lsof unavailable"
fi
echo ""
echo "recent launch ledger ($CLAIMS/launches.log):"
tail -5 "$CLAIMS/launches.log" 2>/dev/null || echo "  (no launches recorded yet)"
