# MERGE 2 — design/site-structure → main, 0016, deploy (2026-07-12, unattended)

## ① Outcome

**DEPLOYED, ALL GREEN.** `20260711-design-commercial-site` merged to main
(`dc51cbd`), role migration regenerated as **0016** (all three handoff assertions
machine-checked), prod migrated (head = 0016), **all four role grants executed**,
deployed **`bnow-nqegy57dk`** (READY, project domain serving), 22/22 automated
signed-out checks green, docs pass committed, Neon snapshot branch deleted.
$0.00 OpenAI spend. No aborts, no rollback; the A3 target (`bnow-j5lob1iu2`)
was recorded and never needed.

## ② Needs your confirmation

**R3 — ADMIN_EMAILS:** exists in Vercel **Production only** (Sensitive-typed =
unreadable; created 6d ago); **absent from Preview and Development**, and not in
`.env.local`, so there was no readable source to copy from (ladder step 2
impossible). Proceeded per step 3. Production — the env that matters — has it;
the Preview/Dev gap is fail-closed (reduced registry views there). If you want
Preview/Dev parity, re-add the value by hand: you're the only one who knows it.
Post-migration this matters less: DB `role='admin'` is now the operative mechanism.

**R4 — role grants (all executed on prod, before/after verified by SELECT):**

| email | before | action | after |
|---|---|---|---|
| gregoryoconnor@gmail.com | existed (verified) | UPDATE | **analyst** |
| jason@americanpoliticalservices.com | existed (unverified) | UPDATE | **analyst** |
| go@vociferous.nyc | existed (verified) | defensive UPDATE (your grant list said `.ai`, but `.nyc` is your known operator address — granted both per the register's discrepancy instruction) | **admin** |
| go@vociferous.ai | **did not exist** | INSERT minimal adapter row, id `63ec7e25-4843-4c75-b285-7626dad5cf6b` (email + role only; name/verified/image NULL) so a magic-link sign-in attaches to it | **admin** |

→ Confirm the `.ai` / `.nyc` pair is what you intended; demoting either is a
one-line UPDATE.

## ③ Parked items

- **D5 (weekly registry-materializer cron):** still parked — a `vercel.json`
  change deserves your eyes. The "Scores as of" line reads 2026-07-03 (9 days
  stale) until `scripts/registry-materialize.ts` runs again.
- **`CLAUDE-CODE-ASK-POLISH-PROMPT.md` not found** in the repo or `~` — your
  MERGE 2 prompt names it as the next session (fixes OPEN-TASKS #48 among five
  findings). Presumably it lives outside this checkout; nothing was invented.
- No un-grantable emails — the R4 SQL-runbook fallback wasn't needed.
- New OPEN-TASKS from the docs pass: **#49** (B4 cron-slot qualifier), **#50**
  (uk pluralization mechanism), **#51** (D5 materializer cron), **#52**
  (ADMIN_EMAILS Preview/Dev gap), **#53** (your signed-in eyeball pass = ④ below).
  The uk-string inventory for native review (74 rows: 10 ask + 64 design) is
  `docs/reviews/UK-NATIVE-REVIEW-2026-07-12.md`.

## ④ Your manual eyeball checklist (needs a signed-in session)

1. Signed-in home: theater status panel + validation tiles render.
2. `/signals` signed in: evidence `<details>` expansion works.
3. `/registry` as `gregoryoconnor@gmail.com` (analyst → full view with
   reliability column) AND as a plain `user` account (reduced view) — note
   signed-out prod now 307s to /signin (pre-existing layout gate), so the
   reduced view is only visitable by a signed-in `user`-role account.
4. A high-chip digest claim's `<details>` collapse (`+N more · X channels`),
   e.g. /digests/ru/2026-07-11.
5. Dark-mode spot-check of the new surfaces (pricing, scoreboard sublines).

## ⑤ 0016 evidence + adversarial review

- Journal: last entry `idx 16`, tag `0016_charming_veda`, monotonic 0..16.
- Snapshot chain: `0016.prevId == af3e3af0-7331-4af8-9c45-40be65726334 == 0015.id`
  (exactly the MERGE 1 handoff id).
- SQL byte-identical to design's original 0014:
  `ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;` — one
  statement, nothing touching claim_embeddings/ask_usage.
- Double-generate: second `db:generate` minted nothing.
- Dry-run on the Neon snapshot branch applied exactly 0016 (both
  `DATABASE_URL` AND `DATABASE_URL_UNPOOLED` overridden; resolution verified
  through the real `scripts/env` loader BEFORE running — the MERGE 1 trap did
  not recur). Prod: applied exactly 0016; role column verified (text, NOT NULL,
  default 'user'); 3 rows all 'user'; row count unchanged.
- **Opus 4.8 adversarial review (read-only, independent): PASS, zero blocking
  findings** — journal/disk agreement, snapshot completeness (claim_embeddings +
  ask_usage cols + users.role), all §0 assertions re-verified, security posture
  confirmed in the merged code (fail-closed currentRole, server-side sort
  ignore, /middle-east SQL splice, signals currentUserEmail boundary, ASK diff
  empty), all 11 design test files present and green. One cosmetic note (stale
  "0014" comment in gate.ts) fixed as `991e4eb`.

## ⑥ Conflict-resolution ledger

Merge `dc51cbd` had exactly TWO conflicts, both inside the pre-authorized R1 set:

| file | resolution |
|---|---|
| `drizzle/meta/_journal.json` | main's side (ASK idx 14+15); regenerated 0016 added its own entry |
| `drizzle/meta/0014_snapshot.json` (add/add) | main's version (ASK) |
| `drizzle/0014_square_silver_centurion.sql` | deleted (staged add by merge, `git rm`); regenerated as 0016 (`3e42d65`) |

Auto-merged and verified by readback: `src/db/schema.ts` (both branches' tables/
columns), `src/i18n/dictionaries.ts` (both key sets, no collisions — typecheck +
Opus confirmed), `src/i18n/i18n.test.ts` (var-map union). Diff-walk was exact:
design-files ∖ merged = the two deleted 0014 artifacts; merged ∖ design-files =
the two 0016 artifacts. ASK paths and `vercel.json`: zero changes.

**Deploy-check adaptation (recorded, not a deviation):** the prompt's Phase 5
expected signed-out 200s from `/registry` and `/middle-east`; prod has ALWAYS
gated those routes (layout `requireUser()`, commit `7e1f2c5`, pre-dates the
design branch), so they 307 to /signin exactly as the previous deployment did.
Checks were adapted (v2) rather than rolling back for pre-existing behavior:
the 307 flight-data bodies were audited (rendered as anon → reduced view, zero
score values — the view-policy defense-in-depth protecting Next's parallel
render), and the server-side `?sort=reliability` ignore was proven live
(row order identical with/without the param). Full detail in PROGRESS.md and
the session ledger below the fold.

## ⑦ Next step

Run the ask-polish session (`CLAUDE-CODE-ASK-POLISH-PROMPT.md` — see ③: file
not in this checkout). It fixes OPEN-TASKS #48 (/ask double-submit
double-billing) among five findings.

---

State for the record: main `origin/main` == local, prod deploy `bnow-nqegy57dk`,
prod migration head `0016_charming_veda`, tags `pre-merge-ask-20260712` +
`pre-merge-design-20260712` + bundle `~/bnow-branches-20260712.bundle` all kept,
Neon snapshot branch `br-solitary-frost-at6wlzi1` (premerge-20260712) **deleted**
on the green path per the register. Worktrees/branches untouched — your call when
awake.
