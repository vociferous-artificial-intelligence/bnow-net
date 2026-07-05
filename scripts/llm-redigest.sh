#!/bin/bash
# Regenerate digests with LLM via Vercel (local host cannot reach OpenAI),
# then revalidate locally (ISW pages are in the local cache).
set -a; source /home/go/code/bnow.net/.env.local; set +a
cd /home/go/code/bnow.net
for d in $(seq 0 14); do
  date=$(date -u -d "2026-06-20 + $d days" +%Y-%m-%d)
  for c in ru ua; do
    out=$(curl -s --max-time 290 -H "Authorization: Bearer $CRON_SECRET" \
      "https://bnow-net.vercel.app/api/cron/digest?date=$date&country=$c")
    echo "$date $c digest: $(echo "$out" | python3 -c 'import json,sys
try:
  r=json.load(sys.stdin)["results"][0]
  print(r.get("error") or f"claims={r[\"claims\"]} provider={r[\"provider\"]} dropped={r[\"droppedClaims\"]}")
except Exception as e: print("PARSE-ERR", e)')"
    sleep 25   # TPM pacing: cyrillic batches ~40-60K tokens vs 60K/min allowance
  done
done
echo "=== digests done, validating ==="
npx tsx scripts/backtest-validate-only.ts 2026-06-20 2026-07-04
echo "=== all done ==="
