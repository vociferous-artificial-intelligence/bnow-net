# Step 27 — the deploy, as operator cards (2026-09-11)

**What this is.** `docs/prompts/2026-09-05-48h-27-operator-deploy.md` says what step 27 must do;
`docs/RELEASE-CHECKLIST.md` (steps 1–11) is the standing procedure; the final audit's §6 and
the pre-deploy fixer's handoff say what this particular deploy adds. This sheet turns all of
that into the plan's card format — **Where / Requires / Do / Expect** — so every command is in
front of you with its expected output. No agent runs any of it. Copy blocks contain only
commands.

**The order, and why.** Backup branch → rehearse the migrations on a throwaway fork → apply
them to production off a cron minute → set `LOG_DRAIN_SECRET` in all three Vercel environments
→ deploy from the release clone → verify → register the drain → `audit-cron` → smoke test →
observation window → records. The secret goes in before the deploy (LOG-DRAIN §8: "secret
first, deploy second, register third"); the migration goes in before the drain is registered
(A2 (b), WS2-F04); nothing applies migrations on deploy.

**Facts as of `1204ef9`** (fixer PR #99 merged): `main` gate 4,599 / 293, build PASS; production
is still the pre-program deployment (`8a19ade`), 29 migration rows, newest `0027`;
`AGENTS.md` 135,176 bytes, one `UNSIGNED` entry (step 25's closing entry, yours to sign);
`.env.local` DSNs verified: `DATABASE_URL` on the `-pooler` host, `DATABASE_URL_UNPOOLED` on the
direct host, same password; Neon branches: `main` (default), `itest-1788469162388` (keep, A6),
two older backups (`backup-pre-ask-release-2026-07-21`, `backup-pre-iran-recovery-2026-08-15`).
Cron minutes on production (`vercel.json`): `*/15`, `:01`, `:02`, `:03`, `:40` hourly, plus
02:00, 04:00, 10:00 UTC daily — **the quietest window each hour is :05–:14 and :20–:39**.

**Stop rule for every card:** an Expect that does not match is a stop. Paste me the output; do
not improvise the next command.

---

## 27.0 Preflight — both checkouts, one read of production

**Where:** `/Users/go/code/bnow-net` (main checkout) and `/Users/go/code/bnow-net-rel-20260823`
(release clone), branch `main` in both, native terminal.
**Requires:** #99 merged and pushed; no live `claude` session anywhere; no open PR.

```
cd /Users/go/code/bnow-net
git status --porcelain
git fetch --prune origin
git log --oneline -1 origin/main
lsof -a -d cwd -c claude | grep bnow
gh pr list --state open
cd /Users/go/code/bnow-net-rel-20260823
git status --porcelain
git fetch --prune origin
git checkout main
git pull --ff-only
git log --oneline -1
git diff --check
npm ci --silent
npm run typecheck && npm run lint && npm test
curl -s https://bnow.net/health
```

Then — added 2026-09-11 after 27.1 was first read against the wrong branch — prove which Neon
branch each `.env.local` DSN addresses BEFORE reading anything through it:

```
cd /Users/go/code/bnow-net-rel-20260823
npx tsx -e 'import "./scripts/env"; fetch(`https://console.neon.tech/api/v2/projects/${process.env.NEON_PROJECT_ID}/endpoints`,{headers:{Authorization:`Bearer ${process.env.NEON_API_KEY}`}}).then(r=>r.json()).then(j=>{for(const e of j.endpoints)console.log(e.branch_id,e.host,e.type)})'
grep -E '^DATABASE_URL(_UNPOOLED)?=' .env.local | sed -E 's#^([A-Z_]+=).*@([^/?]+)/.*#\1@\2#'
npx tsx scripts/sqlq.ts "SELECT max(started_at) AS newest_cron FROM cron_runs"
```

**Expect:** the host in both DSNs (pooler and direct) belongs to **`br-lively-haze-atvkarvn`**
(production, `ep-jolly-glitter-at0968cv` as of 2026-09-11), and `newest_cron` within the last
fifteen minutes. A host on any other branch, or a `newest_cron` hours old, means the DSN points
at a snapshot — fix `.env.local` before continuing (the 2026-09-11 first read hit the eval
branch `ep-misty-bonus-atfbt0iq`, frozen at 2026-09-03T20:59Z).

**Expect:** both trees clean; both at `1204ef9` (or a later docs-only commit); `lsof` and
`gh pr list` silent; gate green at 4,599 / 293 in the release clone; `/health` HTTP 200 with a
commit stamp (`8a19ade`), a `data-dpl-id`, and `DB OK`. **Write down that deployment id — it is
the rollback target** (checklist step 7; the ladder in `AGENTS.md`'s post-incident entries says
never to roll below the 2026-09-01 hotfix). If the release clone's `.env.local` is not the
refreshed pair, copy it: `cp /Users/go/code/bnow-net/.env.local /Users/go/code/bnow-net-rel-20260823/.env.local`.

## 27.1 Pre-deploy observation gate (checklist step 2) and the #84 headroom line (step 6)

**Where:** `/Users/go/code/bnow-net-rel-20260823`, branch `main`.
**Requires:** 27.0 done. Read-only against production through the pooled DSN.

```
cd /Users/go/code/bnow-net-rel-20260823
npx tsx scripts/sqlq.ts "SELECT job, started_at, ok, error IS NOT NULL AS errored, counts::text FROM cron_runs ORDER BY started_at DESC LIMIT 12"
npx tsx scripts/sqlq.ts "SELECT provider, day::text, requests, round(est_usd::numeric,4) AS usd FROM provider_usage WHERE day = CURRENT_DATE ORDER BY provider"
npx tsx scripts/sqlq.ts "SELECT count(*) FROM _migrations"
npx tsx scripts/sqlq.ts "SELECT to_regclass('benchmark_report_editions'), to_regclass('runtime_logs'), to_regclass('conflict_validation_observations')"
```

**Expect:** the last dozen cron rows `ok = true` with no nested `counts.errors` /
`counts.batchErrors` you cannot classify (sweep the `counts` text — #87) — **except the
2026-09-11 password-rotation window**: the `neondb_owner` password on production was reset
≈21:35–22:00Z before Vercel's `DATABASE_URL` was updated, so crons in that window failed or
left no row; classify them as that incident in the release record (checklist step 2 says
classify, never wave through) and confirm the first run after 22:00Z is `ok = true`; today's
`openai_ask` usage row against `ASK_USD_CAP_DAILY` written verbatim into the release record
(this is the line that closes #84); `_migrations` = **29**; all three `to_regclass` NULL.
Those last two readings are the "before".

## 27.2 Environment read-back — register gap G3 (checklist step 1, names only)

**Where:** `/Users/go/code/bnow-net-rel-20260823` (the linked project).
**Requires:** Vercel CLI logged in (`npx vercel whoami` prints your account).

```
cd /Users/go/code/bnow-net-rel-20260823
npx vercel whoami
for e in production preview development; do echo "== $e"; npx vercel env ls $e | grep -E ' (MAP|REDUCE|DIGEST|VALIDATION|ENTITY_AUDIT)_(MODEL|REASONING_EFFORT|PROVIDER) |OPENAI_MODEL|ANALYSIS_PROVIDER|MAP_CONTENT_CHARS|ASK_EMBED_MODEL|ASK_ANSWER_MODEL|ASK_RERANK_MODEL|ASK_PIPELINE|DIGEST_PROVIDER|ANTHROPIC_API_KEY|LOG_DRAIN_SECRET|EVAL_|CONFLICTS_UI'; echo "control:"; npx vercel env ls $e | grep -c DATABASE_URL; done
```

**Expect, per environment:** the positive control prints `1` or more (`DATABASE_URL` exists —
proof the listing worked); the filtered lines show **none** of the fifteen routing names
(`MAP_MODEL … ENTITY_AUDIT_PROVIDER`), none of `OPENAI_MODEL`, `ANALYSIS_PROVIDER`,
`MAP_CONTENT_CHARS`, `ASK_ANSWER_MODEL`, `ASK_RERANK_MODEL`, `ASK_PIPELINE`,
`DIGEST_PROVIDER`, `ANTHROPIC_API_KEY`, `LOG_DRAIN_SECRET` (not yet), `EVAL_*`,
`CONFLICTS_UI`. `ASK_EMBED_MODEL` may exist — if it does, its **value** decides whether PR #59
refuses embeddings on the first 02:00 finalize: the price table holds exactly one key,
`text-embedding-3-small`. Read the value only if the name is present:

```
cd /Users/go/code/bnow-net-rel-20260823
npx vercel env pull /tmp/prod-env-readback --environment=production --yes
chmod 600 /tmp/prod-env-readback
grep -E '^(ASK_EMBED_MODEL|DATABASE_URL)=' /tmp/prod-env-readback | sed -E 's#(DATABASE_URL=).*#\1<present>#'
rm -f /tmp/prod-env-readback
```

**Expect:** `ASK_EMBED_MODEL` absent, or present with exactly `text-embedding-3-small`. Any
other value is a stop (#59 would halt the embed path — set it to the priced model or remove it
before deploying). Record every name read, per environment, in the release record.

## 27.3 The Vercel Node setting (audit §5.2, PR #50)

**Where:** Vercel dashboard → project → Settings → General → Node.js Version.
**Requires:** nothing.

**Expect:** 22.x or newer. `package.json` now carries `"engines": {"node": ">=22"}`; if the
project setting is 22.x the line is a no-op; if it is below 22, the line overrides it and moves
every function's runtime — stop and tell me before deploying. (The audit's recommendation to
pin `22.x` instead of `>=22` is a code change for the next program, not this deploy.)

## 27.4 Backup branch of production (checklist step 11, first half)

**Where:** `/Users/go/code/bnow-net-rel-20260823`.
**Requires:** 27.1's "before" readings recorded.

```
cd /Users/go/code/bnow-net-rel-20260823
npx tsx -e 'import "./scripts/env"; fetch(`https://console.neon.tech/api/v2/projects/${process.env.NEON_PROJECT_ID}/branches`,{method:"POST",headers:{Authorization:`Bearer ${process.env.NEON_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({branch:{name:"backup-pre-48h-deploy-2026-09-11"}})}).then(r=>r.json()).then(j=>console.log(j.branch.id,j.branch.name,j.branch.parent_id))'
npx tsx -e 'import "./scripts/env"; fetch(`https://console.neon.tech/api/v2/projects/${process.env.NEON_PROJECT_ID}/branches`,{headers:{Authorization:`Bearer ${process.env.NEON_API_KEY}`}}).then(r=>r.json()).then(j=>{for(const b of j.branches)console.log(b.id,b.name,b.created_at,b.default?"DEFAULT":"")})'
```

**Expect:** a new branch id printed with name `backup-pre-48h-deploy-2026-09-11` and
`parent_id` = `br-lively-haze-atvkarvn` (production); the listing now shows five branches.
**Write the id down** — it goes in the decision-log entry. Retained until you release it after
the observation window.

## 27.5 Rehearse the migrations on a disposable fork (audit §6 item 6)

**Where:** `/Users/go/code/bnow-net-rel-20260823`.
**Requires:** 27.4 done. The fork is a copy of production at 29 migrations; both DSN names
point at it on the command line (#112) and the fork is deleted at the end whatever happens.

```
cd /Users/go/code/bnow-net-rel-20260823
npx tsx scripts/neon-branch.ts create > /tmp/rehearsal-fork.json
chmod 600 /tmp/rehearsal-fork.json
python3 -c 'import json;print(json.load(open("/tmp/rehearsal-fork.json"))["branchId"])'
python3 -c 'import json;print(json.load(open("/tmp/rehearsal-fork.json"))["connectionString"],end="")' > /tmp/rehearsal-fork-url
chmod 600 /tmp/rehearsal-fork-url
DATABASE_URL="$(cat /tmp/rehearsal-fork-url)" npx tsx scripts/sqlq.ts "SELECT count(*) FROM _migrations"
DATABASE_URL="$(cat /tmp/rehearsal-fork-url)" DATABASE_URL_UNPOOLED="$(cat /tmp/rehearsal-fork-url)" npx tsx scripts/migrate.ts
DATABASE_URL="$(cat /tmp/rehearsal-fork-url)" npx tsx scripts/sqlq.ts "SELECT name FROM _migrations WHERE name LIKE '00%' ORDER BY name DESC LIMIT 4"
DATABASE_URL="$(cat /tmp/rehearsal-fork-url)" npx tsx scripts/sqlq.ts "SELECT to_regclass('benchmark_report_editions'), to_regclass('benchmark_series_days'), to_regclass('runtime_logs'), to_regclass('conflict_validation_observations')"
DATABASE_URL="$(cat /tmp/rehearsal-fork-url)" DATABASE_URL_UNPOOLED="$(cat /tmp/rehearsal-fork-url)" npx tsx scripts/migrate.ts
DATABASE_URL="$(cat /tmp/rehearsal-fork-url)" npx tsx scripts/sqlq.ts "SELECT count(*) FROM _migrations"
npx tsx scripts/neon-branch.ts delete "$(python3 -c 'import json;print(json.load(open("/tmp/rehearsal-fork.json"))["branchId"])')"
rm -f /tmp/rehearsal-fork.json /tmp/rehearsal-fork-url
```

**Expect:** `29` before; the migration run applying **0028, 0029, 0030** (and `9999` re-applied
last, as it always is) with no error; the four newest names `0030_…`, `0029_runtime_logs`,
`0028_…`, then `0027…`; all four `to_regclass` non-NULL; the second migrate run a **no-op**
(idempotent); `32` after; `deleted br-…` printed. Time the first migrate run — that is roughly
what production will take. If anything fails: the fork is deleted, production is untouched,
stop and paste it.

## 27.6 Apply the migrations to production — off a cron minute (checklist step 11, second half)

**Where:** `/Users/go/code/bnow-net-rel-20260823`. The `.env.local` here carries the refreshed
production DSNs; `migrate.ts` uses `DATABASE_URL_UNPOOLED` (direct).
**Requires:** 27.4's backup id recorded; 27.5 green; the clock between **:05 and :14** or
**:20 and :39** of the hour and not within five minutes of 02:00, 04:00 or 10:00 UTC (0028 and
0030 add foreign keys to busy tables inside one transaction with no `lock_timeout`).

```
cd /Users/go/code/bnow-net-rel-20260823
date -u
npx tsx scripts/sqlq.ts "SELECT count(*) FROM _migrations"
npm run db:migrate
npx tsx scripts/sqlq.ts "SELECT name FROM _migrations WHERE name LIKE '00%' ORDER BY name DESC LIMIT 4"
npx tsx scripts/sqlq.ts "SELECT to_regclass('benchmark_report_editions'), to_regclass('benchmark_series_days'), to_regclass('runtime_logs'), to_regclass('conflict_validation_observations')"
npx tsx scripts/sqlq.ts "SELECT count(*) FROM _migrations"
curl -s https://bnow.net/health
```

**Expect:** `29`; three migrations applied plus `9999`; the four newest names as in the
rehearsal; four non-NULL `to_regclass`; `32`; `/health` still `DB OK` on the old deployment.
Record the `date -u` and both counts. **Rollback if the migrate errors mid-way:** it runs each
file in its own transaction, so a failure leaves the earlier files applied and the failing one
rolled back — paste the error; do not re-run; the backup branch is the floor.

## 27.7 `LOG_DRAIN_SECRET` in all three Vercel environments — before the deploy

**Where:** `/Users/go/code/bnow-net-rel-20260823`.
**Requires:** 27.6 done (the table exists). Generate one value, set it three times, keep it in
your password manager — it is the drain's HMAC key, and you paste the same value into the drain
registration in 27.10.

```
cd /Users/go/code/bnow-net-rel-20260823
openssl rand -hex 32 > /tmp/log-drain-secret
chmod 600 /tmp/log-drain-secret
npx vercel env add LOG_DRAIN_SECRET production < /tmp/log-drain-secret
npx vercel env add LOG_DRAIN_SECRET preview < /tmp/log-drain-secret
npx vercel env add LOG_DRAIN_SECRET development < /tmp/log-drain-secret
for e in production preview development; do echo "== $e"; npx vercel env ls $e | grep -c LOG_DRAIN_SECRET; done
```

**Expect:** each `env add` accepted; each count `1`. Copy the value out of
`/tmp/log-drain-secret` into your password manager now, then `rm -f /tmp/log-drain-secret`.
(`LOG_DRAIN_RETENTION_DAYS` stays unset — the default is 14.)

## 27.8 Deploy from the plain release clone (checklist step 8)

**Where:** `/Users/go/code/bnow-net-rel-20260823`, branch `main` at `1204ef9`.
**Requires:** 27.0–27.7 done; the rollback deployment id from 27.0 written down.

```
cd /Users/go/code/bnow-net-rel-20260823
git status --porcelain
git log --oneline -1
npx vercel@latest deploy --prod --yes
```

**Expect:** a clean tree at `1204ef9`; the build log selecting **Node 22.x** (27.3); a
production URL printed. Then verify:

```
curl -s https://bnow.net/health
curl -s -o /dev/null -w '%{http_code}\n' https://bnow.net/methodology
curl -s -o /dev/null -w '%{http_code}\n' https://bnow.net/api/logs/drain
curl -s -o /dev/null -w '%{http_code}\n' https://bnow.net/conflicts
```

**Expect:** `/health` stamp **`1204ef9`** exactly, `DB OK`; `/methodology` **200** (the new
public page, #69); `/api/logs/drain` **405** or **403** — never 503 (the secret exists) and
never 500; `/conflicts` **404** (flag absent). Then the ruling-21 smoke from checklist step 9:
anonymous bare GET and `RSC: 1` GET bodies of the gated routes carry no privileged tokens.
**Rollback at this point** = promote the previous deployment (27.0's id) in the Vercel
dashboard; the new tables sit unused and harm nothing.

## 27.9 Smoke test (AUD-03, now correct on macOS)

**Where:** `/Users/go/code/bnow-net` per `docs/SETUP-NEXT-WEEK.md`'s "10-minute smoke test".
**Requires:** 27.8 verified.

Run the smoke test exactly as the file now reads (`cd /Users/go/code/bnow-net`, BSD
`date -u -v-1d +%F`). **Expect:** every step's stated output. It was broken by #52 and restored
by the fixer; if a step still fails, paste it — it is a docs defect, not a deploy defect.

## 27.10 Register the drain, then `audit-cron` (LOG-DRAIN §8 step 4)

**Where:** Vercel dashboard → project → Settings → Log Drains → Add; then the release clone.
**Requires:** 27.6 (table exists) and 27.8 (receiver deployed) — **both**; registering without
the table makes every delivery 500 and retry.

Dashboard: endpoint `https://bnow.net/api/logs/drain`, format as the design specifies
(`docs/designs/LOG-DRAIN.md` §8 step 4), secret = the 27.7 value, sources per §8. Then:

```
cd /Users/go/code/bnow-net-rel-20260823
sleep 120
npx tsx scripts/sqlq.ts "SELECT count(*), min(logged_at), max(logged_at) FROM runtime_logs"
npx tsx scripts/audit-cron.ts
```

**Expect:** a non-zero `runtime_logs` count within a few minutes of registration (Vercel
sends a test delivery, then real traffic); `audit-cron` printing its runtime-log coverage
section as a number, no verdict changed. Zero rows after ten minutes with the dashboard
showing errored deliveries: unregister the drain in the dashboard (stops it instantly), paste
the error — the receiver logs the reason.

## 27.11 Observation window (checklist step 9)

**Where:** `/Users/go/code/bnow-net-rel-20260823`, read-only, over the next day.
**Requires:** 27.10 done.

```
cd /Users/go/code/bnow-net-rel-20260823
npx tsx scripts/sqlq.ts "SELECT job, started_at, ok, error IS NOT NULL AS errored, counts::text FROM cron_runs WHERE started_at > now() - interval '26 hours' ORDER BY started_at DESC"
npx tsx scripts/sqlq.ts "SELECT provider, day::text, requests, round(est_usd::numeric,4) AS usd FROM provider_usage WHERE day >= CURRENT_DATE - 1 ORDER BY day DESC, provider"
npx tsx scripts/sqlq.ts "SELECT count(*) FROM claim_embeddings WHERE created_at > now() - interval '26 hours'"
npx tsx scripts/audit-cron.ts
```

**Expect** (audit §5.2 per-PR windows): one of each job type (map, digest finalize, digest
intraday, validate) with `ok = true` and no new nested-`counts` errors; **after the first
02:00 UTC finalize, `openai_embed` requests and `claim_embeddings` inserts non-zero** (#59's
refusal did not fire); digest pages' "Sources for this digest" rendering (#77); no numeric
confidence anywhere on a public page (#84 — surfaces are gated); `/methodology` crawled
without harm. Two more nights for #59, two days for #77/#84.

## 27.12 Records — decision log, INDEX, tracker; then release the rehearsal, keep the backup

**Where:** `/Users/go/code/bnow-net`, branch `main`.
**Requires:** 27.11's first window green. `AGENTS.md` has ≈14.8 k headroom: the deploy entry
(≈3 k) and the signature fit.

Sign step 25's closing entry — one line changes, the `UNSIGNED — ` prefix comes off its heading:

```
cd /Users/go/code/bnow-net
grep -n '^- \*\*UNSIGNED' AGENTS.md
sed -i '' 's/^- \*\*UNSIGNED — 2026-09-10/- **2026-09-10/' AGENTS.md
grep -c UNSIGNED AGENTS.md
```

**Expect:** one heading line before; `0` after. Then paste me: the backup branch id, the
`date -u` of the migrate, both `_migrations` counts, the deployment id and `/health` stamp,
the rollback id, the env names read per environment, the #84 headroom line verbatim, the
drain's first-delivery time, and the observation readings — I draft the deploy entry (checklist
step 11's shape: migrations applied, backup branch, env names added) and the INDEX §10 close
line; you commit and push. The two older backup branches (07-21, 08-15) can be released in the
same entry if you choose; `backup-pre-48h-deploy-2026-09-11` stays until the window closes.

---

## What is deliberately NOT in this deploy

- No `CONFLICTS_UI` flag, no `conflict-validate` cron line, no production `GET` of that route
  (N2) — the soak is a later, separate decision gated on `compound-v1` (C13-b/C10-b) and the
  checklist's new §2.0.
- No `DIGEST_PROVIDER`, no `ANTHROPIC_API_KEY` in Vercel — the Anthropic digest path stays
  dormant.
- No code change: T3-c's implementation is OPEN-TASKS #121, next program; the `22.x` Node pin
  and AUD-28's ruling-4 wording likewise.
