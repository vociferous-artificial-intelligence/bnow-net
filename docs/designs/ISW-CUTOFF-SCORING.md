# ISW-cutoff-aligned scoring — design for the parked full version

Written 2026-07-12 (analyst-trust sprint W4, ruling R6(d)). Status: **PARKED for an
attended session.** What DID ship this sprint (R6(c), the cheap honest subset) is at
the bottom; this document is the design for the rest.

## Problem

Two structural misalignments between our scoreboard and ISW:

1. **Window offset.** Our digest for date D covers the UTC calendar day D
   (00:00→24:00Z). ISW's report dated D is written to a data cutoff mid-afternoon
   ET on D and published late evening ET (observed `derived.publishedAt`: ROCA
   ~00:00–01:30Z D+1; Iran Update ~20:00–23:00Z D). Their effective window is
   ≈19:00Z D−1 → 19:00Z D: the two windows overlap ~19 of 24 hours, and events in
   the two ~5h edge bands score as misses/leads on the wrong day. Same-date pairing
   is already the max-overlap choice — the edge bands are the residual error.
2. **Version asymmetry.** Validation (07:00Z D+1) scores our FINALIZED digest
   (written 02:00Z D+1) — i.e., a digest assembled AFTER ISW published. The
   scoreboard therefore compares our post-publish best against their at-publish
   report. Nothing stored can reconstruct what our digest said at ISW's cutoff:
   `digests` rows are overwritten in place, claims are DELETEd + re-INSERTed with
   fresh ids each regeneration, and `validation_runs` is one overwritten row per
   (digest, report).

## Target design (the parked work)

**A. Digest snapshots at ISW-relevant instants.** New additive table
`digest_snapshots (id, digest_id, taken_at, trigger text, structured jsonb,
claim_refs jsonb)` written by the digest cron after each successful persist
(cheap: it's the structured blob we just wrote plus claim id → source doc id
pairs). Retention ~14 days. This makes "what did we say at time T" answerable for
any T after deploy — including ISW's cutoff and publish instants.

**B. Dual validation passes.** Validate cron (07:00Z D+1) scores twice against the
same ISW takeaway set: (1) the finalized digest (today's behavior, the headline);
(2) the newest snapshot taken BEFORE `derived.publishedAt` (true at-publish
scoring — actual claim text matched, not just evidence timestamps). Both passes
reuse ONE matcher run where possible (match takeaways against the union of claims,
then score each side against its own claim subset) to keep LLM cost ≈1× instead
of 2×. Storage: new nullable columns `at_publish_coverage_pct`,
`at_publish_details jsonb` on validation_runs (one additive migration), or a
`validation_runs.run_kind` discriminator — decide in-session; the column form
avoids disturbing the (digest_id, isw_report_id) uniqueness.

**C. Cutoff anchoring (optional, further out).** Parse ISW's stated data cutoff
("data cutoff: 3:00 PM ET") from the report text into `derived.cutoffAt`; score
edge-band events against the report whose window actually contains them (requires
event timestamps, which claims don't carry — claim_date only). This is the
expensive, low-yield tail: the ~5h bands affect single-digit event counts per day.
Only worth it once coverage is high enough that edge-band noise dominates.

## Why parked (against R6(d)'s criteria)

- Needs a new table + new columns (more than "zero-or-one additive migration" once
  snapshots AND dual columns are counted) and a digest-cron pipeline change (the
  snapshot write) — a pipeline restructure by the register's definition.
- Snapshot-based scoring only works FORWARD (no snapshots exist for the past), so
  it cannot fix any historical number anyway; nothing is lost by waiting.
- A wrong-but-shipped scoreboard methodology is the worst outcome the sprint could
  produce; the evidence-gated proxy below ships the honest 80% at $0 risk.

## What shipped instead (2026-07-12, R6(c))

**"Evidence in hand at ISW publish"** — `src/lib/validation/at-publish.ts`, wired
into both scorers (`score.ts`), persisted at scoring time as
`validation_runs.details.atPublish` (jsonb, no migration), backfilled 7 days by
`scripts/backfill-at-publish.ts` (deterministic, $0, branch-tested before prod;
runs whose digests were regenerated after scoring are skipped, never guessed).
Definition: of the run's scored takeaway set (same denominator as coverage_pct),
the share matched by a claim whose supporting documents' `min(fetched_at)` — the
ingest instant, deliberately NOT the source's own publish claim — precedes ISW's
`datePublished`. It is a lower bound on true at-publish coverage (the claim
existed in final form only later; its evidence existed at publish). Displayed as
the "at ISW publish: N%" subline on /scoreboard with its own how-to-read line.
Headline coverage numbers unchanged everywhere.

Observed immediately (07-11): ir final 100% vs at-publish 0% — ISW's Iran Update
went out 20:10Z while our matched evidence arrived 23:01Z+ (one source itself
published after ISW; another was ingested 5h after ISW despite a 10:30Z
self-claimed publish time, which the info-lead metric would have credited as
+9.6h). The dual metric exists precisely to keep that story honest — and it cuts
both ways: ru 07-11 was 57.1% at publish, identical to final.
