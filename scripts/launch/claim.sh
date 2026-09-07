#!/usr/bin/env bash
# claim.sh — atomically claim a 48h program step before launching a session into its worktree.
#
# The invariant this enforces (COMMON §4.11, mechanized): a step launches at most once, and a
# worktree hosts at most one live session. The claim is a directory under
# $WT_ROOT/claims/step-<id>/ — mkdir is atomic, so a second claim fails at the filesystem
# instead of relying on anyone's memory. Claims are permanent records; deliberately relaunching
# a step means removing its claim by hand and noting why in claims/launches.log.
#
# Usage:
#   scripts/launch/claim.sh <step>            claim it (runs all checks first-ish: claim, then
#                                             checks; the claim is rolled back if a check fails)
#   scripts/launch/claim.sh --check <step>    run the checks only, claim nothing
#   scripts/launch/claim.sh --show <step>     print an existing claim
#
# State root: $BNOW_WT_ROOT if set, else the bnow-net-worktrees directory next to this repo.
# bash 3.2 / BSD clean. Exit 0 = claimed (or checks pass in --check), non-zero otherwise.

set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
WT_ROOT=${BNOW_WT_ROOT:-$(cd "$REPO/.." && pwd)/bnow-net-worktrees}
CLAIMS="$WT_ROOT/claims"
TABLE="$SCRIPT_DIR/steps.tsv"

MODE=claim
case "${1:-}" in
  --check) MODE=check; shift ;;
  --show)  MODE=show;  shift ;;
esac
STEP=${1:-}
if [ -z "$STEP" ]; then
  echo "usage: claim.sh [--check|--show] <step>   (steps: see $TABLE)" >&2
  exit 2
fi

# --- resolve the step row -------------------------------------------------------------------
ROW=$(grep -v '^#' "$TABLE" | awk -F '\t' -v s="$STEP" '$1 == s' | head -1)
if [ -z "$ROW" ]; then
  echo "FAIL: step '$STEP' not in $TABLE" >&2
  exit 2
fi
WT_NAME=$(printf '%s\n' "$ROW" | cut -f2)
PROMPT=$(printf '%s\n' "$ROW" | cut -f3)
NOTES=$(printf '%s\n' "$ROW" | cut -f7)
CLAIM_DIR="$CLAIMS/step-$STEP"

if [ "$MODE" = show ]; then
  if [ -d "$CLAIM_DIR" ]; then
    echo "claim step-$STEP:"
    for f in "$CLAIM_DIR"/*; do [ -f "$f" ] && printf '  %s: %s\n' "$(basename "$f")" "$(cat "$f")"; done
    exit 0
  fi
  echo "step-$STEP: not claimed"
  exit 1
fi

if [ "$WT_NAME" = "-" ]; then
  echo "FAIL: step $STEP is operator-manual (no worktree); nothing to claim mechanically." >&2
  echo "  notes: $NOTES" >&2
  exit 2
fi
WT="$WT_ROOT/$WT_NAME"

fail() { echo "FAIL: $1" >&2; [ -n "${2:-}" ] && echo "$2" >&2; return 0; }

# --- take the claim first (the atomic lock), roll it back if any check fails ----------------
CLAIMED=0
if [ "$MODE" = claim ]; then
  mkdir -p "$CLAIMS"
  if ! mkdir "$CLAIM_DIR" 2>/dev/null; then
    fail "step $STEP is ALREADY CLAIMED — a launch list is consumed once." \
"  existing claim:
$(for f in "$CLAIM_DIR"/*; do [ -f "$f" ] && printf '    %s: %s\n' "$(basename "$f")" "$(cat "$f")"; done)
  If the earlier launch verifiably failed and a relaunch is deliberate:
    rm -rf '$CLAIM_DIR'   # then append one line saying why to $CLAIMS/launches.log"
    exit 1
  fi
  CLAIMED=1
fi
rollback() { [ "$CLAIMED" = 1 ] && rm -rf "$CLAIM_DIR"; }

# --- checks ---------------------------------------------------------------------------------
ERR=0

if [ ! -d "$WT" ]; then
  fail "worktree not found: $WT"; ERR=1
fi

if [ "$ERR" = 0 ]; then
  if command -v lsof >/dev/null 2>&1; then
    LIVE=$(lsof -a -d cwd -c claude 2>/dev/null | grep -F "$WT_NAME" || true)
    if [ -n "$LIVE" ]; then
      fail "a live session already has cwd in $WT_NAME — never move HEAD under it (COMMON §4.11)." "$LIVE"
      ERR=1
    fi
  else
    echo "WARN: lsof not available — cannot verify no live session in $WT_NAME" >&2
  fi
fi

if [ "$ERR" = 0 ]; then
  DIRTY=$(git -C "$WT" status --porcelain 2>/dev/null)
  if [ -n "$DIRTY" ]; then
    if [ "$DIRTY" = " M package-lock.json" ]; then
      fail "worktree has the package-lock.json churn — restore it first (COMMON §1):" \
           "  git -C '$WT' checkout -- package-lock.json"
    else
      fail "worktree is not clean:" "$DIRTY"
    fi
    ERR=1
  fi
fi

if [ "$ERR" = 1 ]; then
  rollback
  exit 1
fi

if [ "$MODE" = check ]; then
  if [ -d "$CLAIM_DIR" ]; then
    echo "checks pass, but step $STEP is already claimed (use --show)"; exit 1
  fi
  echo "checks pass: step $STEP is claimable (worktree $WT_NAME idle and clean)"
  echo "gates/notes: $NOTES"
  exit 0
fi

# --- record the claim -----------------------------------------------------------------------
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '%s\n' "$NOW"        > "$CLAIM_DIR/created"
printf '%s\n' "$WT_NAME"    > "$CLAIM_DIR/worktree"
printf '%s\n' "$PROMPT"     > "$CLAIM_DIR/prompt"
printf '%s\n' "$(whoami)@$(hostname -s 2>/dev/null || hostname)" > "$CLAIM_DIR/by"
printf '%s\tclaim\tstep-%s\t%s\t%s\n' "$NOW" "$STEP" "$WT_NAME" "$PROMPT" >> "$CLAIMS/launches.log"

echo "CLAIMED step $STEP → $WT_NAME"
echo "gates/notes (confirm before launching): $NOTES"
exit 0
