# Step 31 — WS-7.6 preservation policy + no-delete assertion (Wave 2, added 2026-09-06)

| | |
|---|---|
| Model / effort / mode | Sonnet / medium / plain session (continues in the same session as step 30, second PR) |
| Worktree | `/Users/go/code/bnow-net-worktrees/48h-ws7-docs-20260905`, step branch `48h/ws7-docs-20260905-step31-retention` |
| Window | H16 → H18 |
| Depends on | 30 (same session) |
| Decisions | none |
| Spend | $0 |
| Closing report | `docs/reviews/WS-7-6-RETENTION-2026-09-06.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first, then the addendum §4.6, §6, §7;
`src/db/schema.ts` (`raw_documents`), `src/lib/ingest/**` (confirm no archival step), every
production module that mentions `raw_documents` (`git grep -n "raw_documents" src --include=*.ts |
grep -v itest`), `src/lib/isw/**` (what of ISW is stored — URLs, endnote indices, hedging cues; never
prose — ruling 1), the X adapter's terms note if any (`src/lib/adapters/x-api.ts` header).

## Do

One PR — `docs: retention and preservation policy (ICS 206-01 one-year rule) + no-delete assertion`:
`docs/RETENTION-AND-PRESERVATION.md` per the addendum §4.6 (what is retained and how — `content_hash`,
`fetched_at`, `url`; Telegram preview bodies; RSS bodies; for how long — indefinite today, minimum
one year from any digest citing the document; what is NOT retained — ISW prose, ruling 1; what a
preservation gap looks like — a Telegram preview is a snapshot of the preview, X citations depend
on `x_api` terms). A unit test (source scan, the `isolation.test.ts` / `openai-client.test.ts`
pattern) asserting no production module under `src/` contains a `DELETE FROM raw_documents` path or
a drizzle `.delete(rawDocuments)` call — `*.itest.ts` and `scripts/cleanup-stub-data.ts` exempt by
path and named in the test. OPEN-TASKS: add a numbered entry for Wayback-style archival (design
only, not a PR). Cross-link from the crosswalk doc (step 30).

## Acceptance

`npm test` green with the new scan; the policy cites the schema columns by line; nothing deleted,
nothing under `docs/evals/` touched.
