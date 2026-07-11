# ASK eval set

Retrieval/answer quality eval set for the ASK Tier-2+ pipeline (`docs/reviews/ASK-FEATURE-ASSESSMENT-2026-07-11.md`
§3, Tier 3). Built by Workstream F1 (harvest tooling); run and scored by the eval
runner (Workstream F2) and the supervisor — this workstream never runs the harvest
itself.

## Files

- `ask-eval-set.json` — the eval set the runner reads. Written/merged by
  `scripts/ask-eval-harvest.ts --generate` (paid) and `--sample`/`--verify-negatives`
  side effects. **Does not exist until the supervisor runs the harvest** — this
  directory ships with only the seed and this README.
- `ask-eval-set.seed.json` — hand-authored scaffold: 10 temporal-window question
  templates + 6 negative controls, in the same per-question shape as
  `ask-eval-set.json`. Never touched by the harvest script. The supervisor curates
  and merges the surviving entries into `ask-eval-set.json` by hand (temporal:
  fill `gold` from a real date-window SELECT; negative: run `--verify-negatives`
  first and swap out anything that flags).
- `harvest-sample.json` — intermediate output of `--sample`: the raw stratified
  claim sample, before question generation. Not part of the eval set contract;
  regenerated freely.

## Why claim ids are not the ground truth

**Claim ids are unstable.** Digest regeneration deletes and re-inserts claims, so
a claim id captured at harvest time can point at a different row (or nothing) by
the time the eval runner executes. Every `gold` (and `acceptableAlternates`) entry
therefore stores **both** the id at harvest time and the claim's frozen text/
country/date:

```jsonc
{ "claimIdAtHarvest": 1438, "text": "…", "countryIso2": "ua", "claimDate": "2026-07-01" }
```

The id is a hint (fast path, and a debugging breadcrumb if it happens to still
resolve); **the eval runner must re-resolve gold claims by exact text match**
against the live `claims` table at run time, not by id lookup.

## `ask-eval-set.json` shape

```ts
interface EvalSet {
  version: 1;
  createdAt: string; // ISO timestamp, set once, preserved across --generate merges
  corpus: { claimCount: number; minDate: string | null; maxDate: string | null };
  questions: EvalQuestion[];
}

interface EvalQuestion {
  id: string; // "known-<claimIdAtHarvest>" | "temporal-NN" | "negative-NN"
  type: "known-answer" | "temporal" | "negative";
  question: string;
  gold: ClaimRef[]; // [] for negative controls
  acceptableAlternates: ClaimRef[]; // other claims that would also be a correct answer
  windowExpected?: { from?: string; to?: string }; // temporal questions only
  notes?: string;
}

interface ClaimRef {
  claimIdAtHarvest: number;
  text: string;
  countryIso2: string;
  claimDate: string | null;
}
```

Question types:

- **known-answer** — generated from a real harvested claim. The question paraphrases
  what an analyst would ask to re-find that claim, without quoting its text verbatim
  (the point is testing semantic retrieval against vocabulary mismatch, not exact
  string match — see the assessment doc §2 failure mode #1). `gold` holds exactly
  the one source claim; `acceptableAlternates` is left `[]` at harvest time (see
  below) for the supervisor to fill in after reviewing retrieval results.
- **temporal** — exercises `parseTimeWindow` (`src/lib/ask/types.ts`'s `TimeWindow`
  contract, implemented by Workstream B). `windowExpected` records the `{from, to}`
  the parser should produce; `gold` is filled by the supervisor with the claims that
  actually fall in that window, once the harvested corpus and a real `parseTimeWindow`
  are both available.
- **negative** — a plausible OSINT question whose answer is absent from this corpus.
  `gold: []` always; `notes` explains why absence is expected. A good negative control
  returns ~0 matches from `--verify-negatives`'s lexical probe — that is the whole
  point of the check.

### Why `acceptableAlternates` ships empty from `--generate`

The harvest's batched generation call sees one claim at a time (batches of 5,
independent per-item judgments — no cross-claim comparison, mirroring the map
stage's per-document extraction discipline). Deciding which *other* claims in the
corpus would also satisfy a paraphrased question needs either whole-corpus LLM
judgment or a human looking at real retrieval output; neither fits inside the
generation call. So `--generate` always writes `acceptableAlternates: []` and the
supervisor fills it in later — typically after running the eval once and noticing
near-duplicate claims that clearly also answer the question.

## Harvest workflow (supervisor-run only)

1. `npx tsx scripts/ask-eval-harvest.ts` — **estimate only, $0.** Connects read-only,
   prints the stratified sampling plan (counts per theater/track/date bucket) and the
   `gpt-5-mini` generation cost estimate. Calls nothing paid.
2. `npx tsx scripts/ask-eval-harvest.ts --sample` — **$0.** Runs the same stratified
   sample and writes `harvest-sample.json` (~25 claims, spread across ru/ua/ir and
   distinct tracks/dates, preferring claims with entities and text length > 60,
   near-duplicate texts excluded).
3. `npx tsx scripts/ask-eval-harvest.ts --generate` — **paid, ≈$0.01–0.05 for ~25
   claims.** Reads `harvest-sample.json`, calls `gpt-5-mini` in batches of 5 with a
   strict JSON schema (`minItems=maxItems=`batch size, standing ruling 7), and
   writes/merges `ask-eval-set.json`. Refuses up front if the pre-flight estimate
   exceeds $1 (`--force` overrides); also stops mid-run if the *actual* cumulative
   spend crosses $1 (`--force` to keep going anyway).
4. `npx tsx scripts/ask-eval-harvest.ts --verify-negatives` — **$0, read-only.** For
   every `type:"negative"` question already in `ask-eval-set.json`, runs a lexical
   `ILIKE` probe over its salient terms (reusing `extractTerms` from
   `src/lib/ask/retrieve.ts`) and prints the match count. `>3` matches is flagged as
   a replacement candidate — a good negative control should sit at ~0.
5. Hand-merge the curated subset of `ask-eval-set.seed.json` (temporal templates +
   negative controls) into `ask-eval-set.json` — fill `gold` for temporal questions
   from a real date-window `SELECT` against the harvested corpus, and drop/replace
   any seed negative that fails step 4's check.

Re-running `--sample`/`--generate` is safe: `--generate` merges by question `id`, so
regenerating over a fresh sample replaces stale `known-*` entries rather than
duplicating them (hand-curated `temporal-*`/`negative-*` entries are untouched since
their ids never collide with `known-*`).
