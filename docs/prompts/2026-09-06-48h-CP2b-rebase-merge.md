# Checkpoint 2b — rebase and merge the three PRs CP2 stopped on (#60, #61, #64)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session — **attended, normal permissions** |
| Where | start in the main checkout `/Users/go/code/bnow-net` on `main`; the rebases happen in the two worktrees named below |
| Spend | $0. One disposable Neon fork for the `runtime-logs` itest (the ws4-ops worktree's `.env.local` is the trimmed copy). No deploy. |
| Output | #60, #61, #64 on `main`; one CP2b line in INDEX §10; terminal report. No closing-report file. |

Read `docs/prompts/2026-09-05-48h-COMMON.md` §3, §4.1 and §4.10 first. Same fence as CP2:
you rebase and merge; you launch nothing; you delete no branch; the only edits are the
conflict resolutions below, the migration regeneration in part B, and the §10 line.

## A. #60 + #61 (ws2-provider) — one code conflict, `src/lib/llm/pricing.ts`

```
cd /Users/go/code/bnow-net-worktrees/48h-ws2-provider-20260905 && git status --short && git fetch origin
git checkout 48h/ws2-provider-20260905-eval-identity-decouple
git rebase --update-refs origin/main
```

The rebase stops at `244b2df` (`llm: provider dimension …`) on `pricing.ts`: an add/add at
end-of-file. `main`'s side (PR #59) ends with `embedPriced`, `embedPricePerMtok` and
`estimateEmbedCostUsd`; the branch's side adds `pricedFor`. Keep BOTH, in this order, each
function closed with its own `}`: `main`'s embed block exactly as it is on `main`, a blank
line, then the branch's `/** Is `model` priced FOR THIS PROVIDER? … */ export function
pricedFor(…) { … }` block. Remove the three marker lines. Nothing else in the file is in
conflict; the `PriceTable` / `ModelPrice` types and the `PRICES_PER_MTOK: PriceTable`
retyping from the branch stay. Then:

```
grep -c '^<<<<<<<\|^=======\|^>>>>>>>' src/lib/llm/pricing.ts     # must print 0
git add src/lib/llm/pricing.ts && GIT_EDITOR=true git rebase --continue
```

If any later commit conflicts, resolve only PROGRESS/BLOCKERS/decision-log tails (keep
both); anything else — stop and report. When the rebase finishes, `--update-refs` has moved
`48h/ws2-provider-20260905-provider-dimension` as well. Verify and test BOTH tips:

```
git checkout 48h/ws2-provider-20260905-provider-dimension && npm run typecheck && npm test
git checkout 48h/ws2-provider-20260905-eval-identity-decouple && npm run typecheck && npm run lint && npm test
git push --force-with-lease origin 48h/ws2-provider-20260905-provider-dimension 48h/ws2-provider-20260905-eval-identity-decouple
```

Wait for CI on #60, then from the main checkout:

```
cd /Users/go/code/bnow-net && gh pr merge 60 --merge --subject "Merge PR #60: provider dimension on analysis dispatch" && git pull --ff-only
gh pr edit 61 --base main && gh pr view 61 --json mergeStateStatus -q .mergeStateStatus
gh pr merge 61 --merge --subject "Merge PR #61: decouple offline results identity from the live registry constant" && git pull --ff-only
```

## B. #64 (ws4-ops) — the migration must be REGENERATED, not just renumbered

`drizzle/meta/0030_snapshot.json` on the branch has `prevId` = the **0027** snapshot: the
branch was cut before 0028 existed, so its snapshot chain forks from 0027 and does not know
the benchmark tables. Keeping that file would make the next `drizzle-kit generate` (step 13b)
diff against a snapshot without 0028's tables and emit them again. The fix is to drop the
branch's generated files during the rebase and regenerate on top of 0028. drizzle-kit will
number it **0029** — that is the number step 16's migration now carries (D10 amended; step 13b
takes 0030).

```
cd /Users/go/code/bnow-net-worktrees/48h-ws4-ops-20260905 && git status --short && git fetch origin
git checkout 48h/ws4-ops-20260905-log-drain-receiver
git show 1c7a7d6:drizzle/0030_runtime_logs.sql > /tmp/runtime_logs.orig.sql
git rebase origin/main
```

The rebase stops at `1c7a7d6` (`db: add runtime_logs table`) on `drizzle/meta/_journal.json`.
Do NOT hand-merge the journal. Instead:

```
git checkout --ours drizzle/meta/_journal.json
git rm -q --cached drizzle/0030_runtime_logs.sql drizzle/meta/0030_snapshot.json; rm -f drizzle/0030_runtime_logs.sql drizzle/meta/0030_snapshot.json
npx drizzle-kit generate --name runtime_logs
ls drizzle | tail -4 && diff /tmp/runtime_logs.orig.sql drizzle/0029_runtime_logs.sql && echo SQL-IDENTICAL
node -e "const j=require('./drizzle/meta/_journal.json');const e=j.entries.slice(-2);console.log(e.map(x=>x.idx+' '+x.tag).join(' | '))"
node -e "const s=require('./drizzle/meta/0029_snapshot.json'),p=require('./drizzle/meta/0028_snapshot.json');console.log(s.prevId===p.id?'CHAIN-OK 0028->0029':'CHAIN-BROKEN')"
```

Expected: `SQL-IDENTICAL`, journal tail `28 0028_lumpy_dragon_lord | 29 0029_runtime_logs`,
`CHAIN-OK`. If the SQL differs, stop and paste the diff (step 16 may have hand-edited the
generated file; do not guess). If drizzle-kit produced a name other than
`0029_runtime_logs`, stop and report. Then rename the references and continue:

```
sed -i '' 's/migration 0030/migration 0029/g; s/0030_runtime_logs/0029_runtime_logs/g; s/applies 0030/applies 0029/g' src/integration/runtime-logs.itest.ts
git add -A drizzle src/integration/runtime-logs.itest.ts
GIT_EDITOR=true git rebase --continue
```

Later commits may conflict only on PROGRESS/BLOCKERS/OPEN-TASKS tails (keep both). When the
rebase finishes, sweep the branch's own text for the old number — only files this branch
touches, and never `docs/PROGRESS.md` history lines, which record what was true then:

```
git grep -n "0030" -- src docs/reviews/LOG-DRAIN-2026-09-06.md docs/designs/LOG-DRAIN.md docs/OPEN-TASKS.md | grep -v capture.test.ts
```

Replace each `0030` that names the runtime_logs migration with `0029` (the report's
"Migration number" paragraph gets one added sentence: "Regenerated as 0029 on top of 0028 at
CP2b — the 0030 snapshot's `prevId` pointed at 0027."). Commit once:
`observability: renumber runtime_logs migration to 0029 (regenerated on top of 0028)`.
Append a two-line block to `docs/PROGRESS.md` saying the same. Then:

```
npm run typecheck && npm run lint && npm test
npm run test:integration -- src/integration/runtime-logs.itest.ts
git push --force-with-lease origin 48h/ws4-ops-20260905-log-drain-receiver
```

Report the itest count and the fork id, and that the fork was deleted. Wait for CI, then:

```
cd /Users/go/code/bnow-net && gh pr view 64 --json baseRefName,mergeStateStatus -q '.baseRefName+" "+.mergeStateStatus'
gh pr merge 64 --merge --subject "Merge PR #64: log-drain receiver into Neon (runtime_logs, migration 0029)" && git pull --ff-only
```

## C. Close

```
npm run typecheck && npm test && ls drizzle | tail -4
```

Expect `0028_lumpy_dragon_lord.sql`, `0029_runtime_logs.sql`, `9999_claim_source_trigger.sql`,
`meta`. Append ONE CP2b line to INDEX §10 (merge SHAs for #60, #61, #64; the pricing.ts
resolution in one sentence; "0030 regenerated as 0029, SQL identical, chain 0028→0029"; unit
count/files; itest count). Commit `docs: 48h program log — CP2b: #60, #61, #64 landed`, push,
print `gh pr list --state open`, stop.
