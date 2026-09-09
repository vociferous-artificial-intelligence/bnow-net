#!/usr/bin/env bash
# launch.sh — claim a 48h program step, prepare its worktree, and start (or hand over) the
# session. Mechanizes the COMMON §4.11 launch procedure so a re-pasted launch list cannot
# double-fire: the second attempt dies inside claim.sh at the filesystem.
#
# Usage:
#   scripts/launch/launch.sh <step>          dry run: resolve, run every check, print the exact
#                                            commands — claims NOTHING, launches nothing
#   scripts/launch/launch.sh <step> --go     claim + prep the worktree; then
#                                              attended=no    start the session detached
#                                                             (claude -p, log under logs/)
#                                              attended=yes   print the command for the
#                                                             operator to run in a terminal —
#                                                             never started detached
#
# Extra CLI flags for the detached session go in $CLAUDE_LAUNCH_OPTS (e.g. a permission mode).
# Every claude invocation is wrapped in `caffeinate -ims` (2026-09-09) so the Mac cannot idle-,
# display- or system-sleep while a session runs; the wrapper exits with the session.
# What this script deliberately does NOT do: copy credentials. It verifies the env posture
# (COMMON §4.10 — an unattended worktree must hold no spend/deploy keys) and refuses on
# violation; moving .env.local files stays a human act.
# bash 3.2 / BSD clean.

set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
WT_ROOT=${BNOW_WT_ROOT:-$(cd "$REPO/.." && pwd)/bnow-net-worktrees}
CLAIMS="$WT_ROOT/claims"
LOGS="$WT_ROOT/logs"
TABLE="$SCRIPT_DIR/steps.tsv"

STEP=${1:-}
GO=${2:-}
if [ -z "$STEP" ]; then
  echo "usage: launch.sh <step> [--go]    (steps: see $TABLE; status: status.sh)" >&2
  exit 2
fi

ROW=$(grep -v '^#' "$TABLE" | awk -F '\t' -v s="$STEP" '$1 == s' | head -1)
if [ -z "$ROW" ]; then
  echo "FAIL: step '$STEP' not in $TABLE" >&2
  exit 2
fi
WT_NAME=$(printf '%s\n' "$ROW" | cut -f2)
PROMPT=$(printf '%s\n' "$ROW" | cut -f3)
MODEL=$(printf '%s\n' "$ROW" | cut -f4)
ATTENDED=$(printf '%s\n' "$ROW" | cut -f5)
NOTES=$(printf '%s\n' "$ROW" | cut -f7)

if [ "$ATTENDED" = manual ] || [ "$WT_NAME" = "-" ]; then
  echo "step $STEP is operator-manual — no mechanical launch. Prompt: $REPO/$PROMPT"
  echo "notes: $NOTES"
  exit 0
fi

WT="$WT_ROOT/$WT_NAME"
# Lane branch = 48h/<name>-20260905, derived from the worktree dir name (48h-<name>-20260905).
LANE=$(printf '%s\n' "$WT_NAME" | sed -E 's/^48h-/48h\//')
PROMPT_ABS="$REPO/$PROMPT"
LOG="$LOGS/step$STEP.log"

echo "step $STEP"
echo "  worktree : $WT"
echo "  lane     : $LANE  (reset to origin/main at launch)"
echo "  prompt   : $PROMPT_ABS"
echo "  model    : $MODEL   attended: $ATTENDED"
echo "  log      : $LOG"
echo "  gates    : $NOTES"
echo ""

if [ ! -f "$PROMPT_ABS" ]; then echo "FAIL: prompt file missing: $PROMPT_ABS" >&2; exit 1; fi

# The COMMON §1 sanctioned restore, so lockfile churn alone never blocks a launch.
if [ -d "$WT" ] && [ "$(git -C "$WT" status --porcelain 2>/dev/null)" = " M package-lock.json" ]; then
  echo "restoring package-lock.json churn in $WT_NAME (COMMON §1)"
  git -C "$WT" checkout -- package-lock.json
fi

# Env posture (COMMON §4.10): an unattended launch refuses if spend/deploy keys are present.
ENV_STATE="absent"
if [ -f "$WT/.env.local" ]; then
  KEYS=$(grep -E '^\s*(OPENAI_API_KEY|ANTHROPIC_API_KEY|VERCEL_TOKEN|POSTMARK[A-Z_]*)\s*=\s*.+' "$WT/.env.local" 2>/dev/null | cut -d= -f1 || true)
  if [ -n "$KEYS" ]; then ENV_STATE="HOLDS SPEND/DEPLOY KEYS: $(echo "$KEYS" | tr '\n' ' ')"; else ENV_STATE="present (trimmed — no spend/deploy keys)"; fi
fi
echo "  .env.local: $ENV_STATE"
if [ "$ATTENDED" = no ] && [ "${ENV_STATE#HOLDS}" != "$ENV_STATE" ]; then
  echo "FAIL: unattended launch with spend/deploy keys in the worktree violates COMMON §4.10." >&2
  echo "  Trim $WT/.env.local (keep only DATABASE_URL*, NEON_PROJECT_ID, NEON_API_KEY) or run attended." >&2
  exit 1
fi

# Permission mode (COMMON §4.10): a detached `claude -p` without one can read but not write or
# run, so it does the reading pass and exits with no PR — four sessions did exactly that on
# 2026-09-08 (steps 20/21/32/33, launched with CLAUDE_LAUNCH_OPTS unset). Refuse rather than
# start a session that cannot deliver.
echo "  launch opts: ${CLAUDE_LAUNCH_OPTS:-(none)}"
if [ "$ATTENDED" = no ] && [ -z "${CLAUDE_LAUNCH_OPTS:-}" ]; then
  echo "FAIL: unattended launch needs a permission mode in CLAUDE_LAUNCH_OPTS, e.g." >&2
  echo "  export CLAUDE_LAUNCH_OPTS='--dangerously-skip-permissions'   (COMMON §4.10)" >&2
  exit 1
fi

RUN_CMD="cd '$WT' && nohup caffeinate -ims claude -p --model '$MODEL' ${CLAUDE_LAUNCH_OPTS:-} < '$PROMPT_ABS' > '$LOG' 2>&1 &"

if [ "$GO" != "--go" ]; then
  echo "DRY RUN — nothing claimed, nothing launched. Would do:"
  echo "  1. $SCRIPT_DIR/claim.sh $STEP"
  echo "  2. git -C '$WT' fetch --prune origin && git -C '$WT' checkout -B '$LANE' origin/main"
  if [ "$ATTENDED" = no ]; then echo "  3. $RUN_CMD"; else echo "  3. (attended) print the session command for the operator"; fi
  echo ""
  "$SCRIPT_DIR/claim.sh" --check "$STEP"
  echo ""
  echo "re-run with --go to execute."
  exit 0
fi

# --- the real thing -------------------------------------------------------------------------
"$SCRIPT_DIR/claim.sh" "$STEP" || exit 1

release() {  # on any post-claim failure, release the claim — nothing was launched
  rm -rf "$CLAIMS/step-$STEP"
  echo "claim released (launch did not happen)" >&2
}

if ! git -C "$WT" fetch --prune origin; then release; exit 1; fi
if ! git -C "$WT" checkout -B "$LANE" origin/main; then release; exit 1; fi
mkdir -p "$LOGS"

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if [ "$ATTENDED" = yes ]; then
  printf 'attended\n' > "$CLAIMS/step-$STEP/mode"
  printf '%s\tprep\tstep-%s\tattended handover\n' "$NOW" "$STEP" >> "$CLAIMS/launches.log"
  echo ""
  echo "ATTENDED step — claimed and prepped; run the session yourself, in a terminal you watch:"
  echo ""
  echo "  cd '$WT' && caffeinate -ims claude --model '$MODEL' ${CLAUDE_LAUNCH_OPTS:-}"
  echo "  # then paste the prompt: $PROMPT_ABS"
  echo ""
  echo "(For step 26 remember the bounded fan-out; for 22m the run spends — keep both caps in view.)"
  exit 0
fi

eval "$RUN_CMD"
PID=$!
sleep 2
if ! kill -0 "$PID" 2>/dev/null; then
  echo "FAIL: session exited immediately — first log lines:" >&2
  head -20 "$LOG" >&2 2>/dev/null
  release
  exit 1
fi
# $PID is caffeinate's. Record the claude CHILD pid so status.sh reads the session itself
# (DEAD when claude exits, SUSP if it is stopped); caffeinate exits with it either way.
CPID=$(pgrep -P "$PID" 2>/dev/null | head -1)
[ -z "$CPID" ] && CPID=$PID
printf '%s\n' "$CPID" > "$CLAIMS/step-$STEP/pid"
printf '%s\n' "$PID" > "$CLAIMS/step-$STEP/pid.caffeinate"
printf '%s\tlaunch\tstep-%s\tpid=%s\tcaffeinate=%s\tlog=%s\n' "$NOW" "$STEP" "$CPID" "$PID" "$LOG" >> "$CLAIMS/launches.log"
echo ""
echo "LAUNCHED step $STEP detached: claude pid $CPID (caffeinate $PID)"
echo "  tail -f '$LOG'"
echo "  $SCRIPT_DIR/status.sh   # the one-screen view"
exit 0
