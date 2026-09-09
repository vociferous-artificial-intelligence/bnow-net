#!/usr/bin/env bash
# env-posture.sh — set every 48h worktree's .env.local to the posture COMMON §4.10 requires, in
# one pass, from the main checkout's .env.local. Replaces the hand-copied per-worktree steps.
#
#   scripts/launch/env-posture.sh          apply, then print the resulting posture per worktree
#   scripts/launch/env-posture.sh --dry    print what would change; write nothing
#
# Policy (edit FORK_LANES when a step's needs change):
#   FORK lanes  — worktrees that host a remaining step needing a disposable Neon fork get the
#                 TRIMMED copy: exactly DATABASE_URL, DATABASE_URL_UNPOOLED, NEON_PROJECT_ID,
#                 NEON_API_KEY. Never a spend or deploy key (a runaway session cannot spend,
#                 deploy or email).
#   every other worktree under the estate — .env.local REMOVED (docs-only, plan, audit and
#                 finished lanes need nothing; an absent file is the safest posture).
# Worktrees are discovered from `git worktree list`, so the count adapts; nothing outside the
# estate directory is touched, and the main checkout's own .env.local is only ever READ.
# bash 3.2 / BSD clean.

set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
WT_ROOT=${BNOW_WT_ROOT:-$(cd "$REPO/.." && pwd)/bnow-net-worktrees}
SRC="$REPO/.env.local"
DRY=0
[ "${1:-}" = "--dry" ] && DRY=1

FORK_LANES="48h-ws3-conflict-20260905 48h-ws2-routing-20260905 48h-audit-ws3-20260905 48h-ws3-gazetteer-20260905 48h-ws4-ops-20260905"
KEYS='^(DATABASE_URL|DATABASE_URL_UNPOOLED|NEON_PROJECT_ID|NEON_API_KEY)='

if [ ! -f "$SRC" ]; then
  echo "FAIL: $SRC not found — the main checkout's .env.local is the only source" >&2
  exit 1
fi
for k in DATABASE_URL DATABASE_URL_UNPOOLED NEON_PROJECT_ID NEON_API_KEY; do
  if ! grep -qE "^$k=." "$SRC"; then
    echo "FAIL: $SRC has no value for $k — fix the source before applying" >&2
    exit 1
  fi
done

TRIM=$(mktemp -t envposture)
chmod 600 "$TRIM"
grep -E "$KEYS" "$SRC" > "$TRIM"
trap 'rm -f "$TRIM"' EXIT

WTS=$(git -C "$REPO" worktree list --porcelain | awk '$1=="worktree"{print $2}' | grep -F "$WT_ROOT/" || true)
if [ -z "$WTS" ]; then
  echo "FAIL: git worktree list shows nothing under $WT_ROOT" >&2
  exit 1
fi

N=0; CHANGED=0
echo "source : $SRC (read only)"
echo "estate : $WT_ROOT"
[ $DRY -eq 1 ] && echo "mode   : DRY RUN — nothing written"
echo ""
printf '%-34s %-8s %-9s %s\n' WORKTREE POSTURE ACTION KEYS
for wt in $WTS; do
  N=$((N+1))
  name=$(basename "$wt")
  f="$wt/.env.local"
  want=remove
  for l in $FORK_LANES; do [ "$l" = "$name" ] && want=trimmed; done
  action=keep
  if [ "$want" = trimmed ]; then
    if [ ! -f "$f" ] || ! cmp -s "$TRIM" "$f"; then
      action=write
      if [ $DRY -eq 0 ]; then cp "$TRIM" "$f" && chmod 600 "$f"; fi
    fi
  else
    if [ -f "$f" ]; then
      action=remove
      if [ $DRY -eq 0 ]; then rm -f "$f"; fi
    fi
  fi
  [ "$action" != keep ] && CHANGED=$((CHANGED+1))
  if [ $DRY -eq 1 ] && [ "$action" = write ]; then keys="(would be) $(cut -d= -f1 "$TRIM" | tr '\n' ' ')"
  elif [ $DRY -eq 1 ] && [ "$action" = remove ]; then keys="(would be) absent"
  elif [ -f "$f" ]; then keys=$(cut -d= -f1 "$f" | tr '\n' ' ')
  else keys="absent"; fi
  printf '%-34s %-8s %-9s %s\n' "$name" "$want" "$action" "$keys"
done
echo ""
echo "$N worktrees, $CHANGED changed."

BAD=0
for wt in $WTS; do
  f="$wt/.env.local"
  [ -f "$f" ] || continue
  if grep -qE '^\s*(OPENAI_API_KEY|ANTHROPIC_API_KEY|VERCEL_TOKEN|POSTMARK[A-Z_]*)\s*=\s*.+' "$f"; then
    echo "FAIL: $f still holds a spend/deploy key" >&2; BAD=1
  fi
done
[ $BAD -eq 0 ] && [ $DRY -eq 0 ] && echo "posture OK: no worktree holds a spend or deploy key."
exit $BAD
