# Stage 3 Review — Processing & analysis pipeline

**Date:** 2026-07-04 · **Status: PASS**

## Exit criteria
| Criterion | Result | Pass |
|---|---|---|
| Real RU/UA digest from live data | generated daily + 14-day backfill (28 digests) | ✅ |
| Every claim clickable to source docs | /digests/[c]/[date] chips → doc URL + registry key + reliability | ✅ |

## Built
- lang detect (ru/uk/en heuristic), minhash near-dupe (64-hash, 16×4 LSH),
  `AnalysisProvider` seam (openai structured-output / deterministic extractive stub),
  digest orchestrator with atomic tx persist + anti-hallucination docId gate,
  confidence = mean supporting-doc reliability, MD render, cron + local runner.

## The provider story (honest)
- OpenAI path **verified end-to-end in production** (UA 2026-07-04: 9 events, 9 claims,
  0 dropped) before the account's quota died mid-weekend (BLOCKERS #9).
- Since then `ANALYSIS_PROVIDER=stub`: extractive, verbatim-attributed, war-relevance
  prefiltered. Demoable and traceable, but it quotes sources rather than synthesizing.
- Local host cannot reach api.openai.com at all (WSL2 egress quirk) — LLM digests run
  via the Vercel cron route by design.

## Key decisions
- Both layers of traceability: schema trigger (hard) + docId validation vs input batch
  (drops LLM-invented ids before they reach the DB).
- Claims store their own text; digest JSON stores only stats — single source of truth.

## Known debt
- Stub digests: 12 events × 1 claim shape; no cross-event claim grouping.
- Embeddings column populated = 0 (no LLM key); minhash covers near-dupe needs.
- Translation is pass-through with lang tag (provider work when key returns).
