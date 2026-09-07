#!/usr/bin/env bash
# Acceptance test for a decision-log archive pass (AGENTS.md -> docs/DECISIONS.md).
#
# Asserts, for the move from BASE_REF to the working tree:
#   1. Every decision-log entry present BEFORE is present AFTER, byte-identical,
#      in exactly one of the two files (moving preserves history; editing does not).
#   2. No entry is duplicated across or within the two files.
#   3. No entry is invented (every AFTER entry existed BEFORE).
#   4. Entries are in ascending date order within each file.
#   5. AGENTS.md is within the character ceiling (D5).
#
# An entry is a block starting `- **YYYY-MM-DD` and running to the next such line
# or to the end of its containing region. Bodies are compared by SHA, so any edit
# to a moved entry fails the run.
#
# Usage:  bash scripts/check-decision-log-move.sh [BASE_REF]
# BASE_REF defaults to HEAD (the committed pre-move state). It is NOT origin/main:
# a pass may run before the entries it moves have been pushed.
#
# bash 3.2 / BSD userland clean: no mapfile, no associative arrays, no GNU-only flags.

set -u

BASE_REF="${1:-HEAD}"
AGENTS="AGENTS.md"
ARCHIVE="docs/DECISIONS.md"
CEILING=150000

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

fail=0
note() { printf '%s\n' "$*"; }
bad()  { printf 'FAIL: %s\n' "$*"; fail=1; }

# split_entries <src-file> <out-dir> <dates-file>
# Writes one file per entry into out-dir (000001, 000002, ...) and the entry
# dates, in document order, one per line, into dates-file.
#
# An entry ends at the next entry header OR at the next "## " section heading,
# so a log that ends mid-file does not swallow the sections that follow it.
# Trailing blank lines are dropped before writing: how many blank lines separate
# two entries is layout, not history, and must not make a moved entry compare
# unequal. Everything else is preserved byte for byte.
split_entries() {
  awk -v out="$2" -v datesfile="$3" '
    function flush() {
      if (n == 0) return
      while (nb > 0 && buf[nb] == "") nb--            # drop trailing blanks
      f = sprintf("%s/%06d", out, n)
      for (i = 1; i <= nb; i++) print buf[i] > f
      close(f)
      nb = 0
    }
    /^- \*\*[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/ {
      flush()
      n++
      collect = 1
      print substr($0, index($0, "**") + 2, 10) > datesfile
      buf[++nb] = $0
      next
    }
    /^## / { flush(); collect = 0; next }
    collect { buf[++nb] = $0 }
    END { flush() }
  ' "$1"
}

# shasum(1) on macOS, sha256sum(1) on GNU userland.
if command -v shasum >/dev/null 2>&1; then
  _hash() { shasum -a 256 "$1"; }
elif command -v sha256sum >/dev/null 2>&1; then
  _hash() { sha256sum "$1"; }
else
  echo "need shasum or sha256sum on PATH" >&2; exit 2
fi

# sha_list <dir> -> entry body hashes, sorted, one per entry
sha_list() {
  if [ -z "$(ls -A "$1" 2>/dev/null)" ]; then return 0; fi
  for f in "$1"/*; do _hash "$f"; done | awk '{print $1}' | sort
}

check_order() {
  # $1 = dates file, $2 = label
  if [ ! -s "$1" ]; then return 0; fi
  if ! sort -c "$1" 2>/dev/null; then
    bad "$2: entries are NOT in ascending date order"
    note "     first out-of-order run:"
    sort "$1" > "$TMP/sorted.$$"
    diff "$1" "$TMP/sorted.$$" | head -10 | sed 's/^/       /'
    rm -f "$TMP/sorted.$$"
  else
    note "  ok  $2: ascending date order"
  fi
}

for d in before_agents before_archive after_agents after_archive; do mkdir -p "$TMP/$d"; done

git show "$BASE_REF:$AGENTS"  > "$TMP/before_agents.md"  2>/dev/null || { echo "cannot read $BASE_REF:$AGENTS"; exit 2; }
git show "$BASE_REF:$ARCHIVE" > "$TMP/before_archive.md" 2>/dev/null || { echo "cannot read $BASE_REF:$ARCHIVE"; exit 2; }

split_entries "$TMP/before_agents.md"  "$TMP/before_agents"  "$TMP/before_agents.dates"
split_entries "$TMP/before_archive.md" "$TMP/before_archive" "$TMP/before_archive.dates"
split_entries "$AGENTS"                "$TMP/after_agents"   "$TMP/after_agents.dates"
split_entries "$ARCHIVE"               "$TMP/after_archive"  "$TMP/after_archive.dates"

cnt() { ls -1 "$1" 2>/dev/null | wc -l | tr -d ' '; }
nb=$(( $(cnt "$TMP/before_agents") + $(cnt "$TMP/before_archive") ))
na=$(( $(cnt "$TMP/after_agents")  + $(cnt "$TMP/after_archive") ))

note "base ref: $BASE_REF"
note "entries before: $(cnt "$TMP/before_agents") in AGENTS.md + $(cnt "$TMP/before_archive") in DECISIONS.md = $nb"
note "entries after:  $(cnt "$TMP/after_agents") in AGENTS.md + $(cnt "$TMP/after_archive") in DECISIONS.md = $na"

{ sha_list "$TMP/before_agents"; sha_list "$TMP/before_archive"; } | sort > "$TMP/before.sha"
{ sha_list "$TMP/after_agents";  sha_list "$TMP/after_archive";  } | sort > "$TMP/after.sha"

# 1 + 3: exact set equality of entry bodies
if diff -q "$TMP/before.sha" "$TMP/after.sha" >/dev/null; then
  note "  ok  every entry body is byte-identical and accounted for ($nb entries)"
else
  lost=$(comm -23 "$TMP/before.sha" "$TMP/after.sha" | wc -l | tr -d ' ')
  new=$(comm -13 "$TMP/before.sha" "$TMP/after.sha" | wc -l | tr -d ' ')
  bad "entry bodies changed: $lost lost or edited, $new new or edited"
  note "     (an edited entry shows as one lost + one new)"
fi

# 2: no duplicates
dups=$(sort "$TMP/after.sha" | uniq -d | wc -l | tr -d ' ')
if [ "$dups" -eq 0 ]; then note "  ok  no duplicated entries"; else bad "$dups entry body(ies) appear more than once"; fi

# 4: ordering
check_order "$TMP/after_agents.dates"  "AGENTS.md decision log"
check_order "$TMP/after_archive.dates" "docs/DECISIONS.md archive"

# 5: ceiling
chars=$(wc -c < "$AGENTS" | tr -d ' ')
if [ "$chars" -le "$CEILING" ]; then
  note "  ok  AGENTS.md is $chars chars (ceiling $CEILING)"
else
  bad "AGENTS.md is $chars chars, over the $CEILING ceiling"
fi

# informational: the archive must not shrink
if [ "$(cnt "$TMP/after_archive")" -lt "$(cnt "$TMP/before_archive")" ]; then
  bad "docs/DECISIONS.md lost entries — the archive is append-only"
fi

if [ "$fail" -eq 0 ]; then note ""; note "PASS"; exit 0; else note ""; note "FAILED"; exit 1; fi
