import "./env";

// ASK Tier-2+ sprint, Workstream F1: eval-set harvest tool. Builds
// docs/evals/ask-eval-set.json — the known-answer question set the eval runner
// (Workstream F2) scores retrieval/answer quality against.
//
// All DB access in this file is READ-ONLY SELECT. Nothing here ever INSERTs,
// UPDATEs, or runs DDL. The only paid call is --generate's batched gpt-5-mini
// question-generation pass, which is estimate-gated (see modeGenerate below).
//
// Modes:
//   (no flags)          ESTIMATE ONLY — runs the same SELECT + stratified sample as
//                       --sample, prints the sampling plan and the LLM cost estimate,
//                       and exits WITHOUT calling OpenAI or writing any file.
//   --sample            runs the SELECT sampling and writes the picked claims to
//                       docs/evals/harvest-sample.json.
//   --generate           reads harvest-sample.json, calls gpt-5-mini in batches of 5
//                       to paraphrase one retrieval-test question per claim, and
//                       writes/merges docs/evals/ask-eval-set.json (type "known-answer").
//                       Refuses if the pre-flight cost estimate exceeds $1 (--force to
//                       override); also stops mid-run if the ACTUAL cumulative spend
//                       crosses $1 (--force to keep going).
//   --verify-negatives   for each type:"negative" question already in ask-eval-set.json,
//                       runs a lexical ILIKE probe (reusing extractTerms from
//                       src/lib/ask/retrieve.ts) and flags any with >3 matches as a
//                       replacement candidate for the supervisor.
//
// Usage:
//   npx tsx scripts/ask-eval-harvest.ts                    # estimate only, $0
//   npx tsx scripts/ask-eval-harvest.ts --sample            # writes harvest-sample.json, $0
//   npx tsx scripts/ask-eval-harvest.ts --generate           # paid: ~$0.01-0.05 for ~25 claims
//   npx tsx scripts/ask-eval-harvest.ts --generate --force    # override the $1 refusal
//   npx tsx scripts/ask-eval-harvest.ts --verify-negatives    # $0, read-only lexical probe

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import {
  GENERATION_BATCH_SIZE,
  GENERATION_MODEL,
  GENERATION_SYSTEM_PROMPT,
  buildKnownAnswerQuestion,
  chatParamsForModel,
  computeCorpusStats,
  estimateGenerationCostUsd,
  generationCostUsd,
  generationMaxCompletionTokens,
  generationResponseSchema,
  generationUserMessage,
  mergeEvalSet,
  stratifiedSample,
  type CorpusStats,
  type EvalQuestion,
  type EvalSet,
  type HarvestClaimRow,
} from "../src/lib/ask/eval-set";
import { extractTerms } from "../src/lib/ask/retrieve";

const EVALS_DIR = path.join(__dirname, "..", "docs", "evals");
const SAMPLE_PATH = path.join(EVALS_DIR, "harvest-sample.json");
const EVAL_SET_PATH = path.join(EVALS_DIR, "ask-eval-set.json");
const TARGET_SAMPLE_SIZE = 25;
const COST_ENVELOPE_USD = 1.0;

interface HarvestSampleFile {
  generatedAt: string;
  corpus: CorpusStats;
  sample: HarvestClaimRow[];
}

// ---- DB read (SELECT only) -------------------------------------------------------

// The eval set targets the three LIVE theaters only (spec: "~25 claims spread across
// ru/ua/ir"). Gulf theaters (ae/il/sa/qa/om/bh/kw) are 2-digest-depth legacy corpora —
// harvesting them would both dilute the eval and, with alphabetical bucket ordering,
// crowd out ru/ua (supervisor round-1 finding: the unfiltered plan read ae=8/il=5/ir=12
// with ZERO ru/ua picks).
const HARVEST_THEATERS = ["ru", "ua", "ir"];

async function fetchCandidates(): Promise<HarvestClaimRow[]> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(
    `SELECT cl.id, cl.text, cl.claim_date::text AS claim_date, c.iso2, dg.track,
            coalesce(array_agg(DISTINCT e.name) FILTER (WHERE e.name IS NOT NULL), '{}') AS entities
     FROM claims cl
     JOIN countries c ON c.id = cl.country_id
     LEFT JOIN digests dg ON dg.id = cl.digest_id
     LEFT JOIN claim_entities ce ON ce.claim_id = cl.id
     LEFT JOIN entities e ON e.id = ce.entity_id
     WHERE c.iso2 = ANY($1)
     GROUP BY cl.id, cl.claim_date, c.iso2, dg.track
     ORDER BY cl.claim_date DESC NULLS LAST, cl.id DESC`,
    [HARVEST_THEATERS],
  )) as Array<{
    id: number;
    text: string;
    claim_date: string | null;
    iso2: string;
    track: string | null;
    entities: string[] | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    countryIso2: r.iso2,
    track: r.track,
    claimDate: r.claim_date,
    entities: r.entities ?? [],
  }));
}

function printPlan(rows: HarvestClaimRow[], sample: HarvestClaimRow[]): void {
  const stats = computeCorpusStats(rows);
  console.log(`corpus: ${stats.claimCount} claims, date range ${stats.minDate ?? "?"} .. ${stats.maxDate ?? "?"}`);

  const byTheater = new Map<string, number>();
  const byTrack = new Map<string, number>();
  const byDate = new Set<string>();
  for (const r of sample) {
    byTheater.set(r.countryIso2, (byTheater.get(r.countryIso2) ?? 0) + 1);
    byTrack.set(r.track ?? "(none)", (byTrack.get(r.track ?? "(none)") ?? 0) + 1);
    if (r.claimDate) byDate.add(r.claimDate);
  }
  console.log(`sampling plan: ${sample.length} claims picked (target ${TARGET_SAMPLE_SIZE})`);
  console.log(`  by theater: ${[...byTheater.entries()].map(([k, v]) => `${k}=${v}`).join(", ") || "(none)"}`);
  console.log(`  by track:   ${[...byTrack.entries()].map(([k, v]) => `${k}=${v}`).join(", ") || "(none)"}`);
  console.log(`  distinct claim_dates covered: ${byDate.size}`);
}

// ---- modes ------------------------------------------------------------------------

async function modeEstimate(): Promise<void> {
  const rows = await fetchCandidates();
  const sample = stratifiedSample(rows, { targetSize: TARGET_SAMPLE_SIZE });
  printPlan(rows, sample);

  const est = estimateGenerationCostUsd(sample.length, GENERATION_BATCH_SIZE);
  console.log(
    `\nLLM estimate (${GENERATION_MODEL}, batches of ${GENERATION_BATCH_SIZE}): ${est.batches} call(s), ` +
      `~${est.estPromptTokens} prompt + ~${est.estCompletionTokens} completion tokens -> ` +
      `~$${est.estCostUsd.toFixed(4)} (envelope $${COST_ENVELOPE_USD.toFixed(2)})`,
  );
  console.log("\nestimate only — no OpenAI calls made, no files written.");
  console.log("re-run with --sample to write docs/evals/harvest-sample.json.");
}

async function modeSample(): Promise<void> {
  const rows = await fetchCandidates();
  const sample = stratifiedSample(rows, { targetSize: TARGET_SAMPLE_SIZE });
  printPlan(rows, sample);

  const corpus = computeCorpusStats(rows);
  mkdirSync(EVALS_DIR, { recursive: true });
  const out: HarvestSampleFile = { generatedAt: new Date().toISOString(), corpus, sample };
  writeFileSync(SAMPLE_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nwrote ${sample.length} claims -> ${SAMPLE_PATH}`);
  console.log("re-run with --generate to paraphrase questions for this sample (paid, estimate-gated).");
}

async function modeGenerate(force: boolean): Promise<void> {
  if (!existsSync(SAMPLE_PATH)) {
    console.error(`missing ${SAMPLE_PATH} — run --sample first`);
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(SAMPLE_PATH, "utf8")) as HarvestSampleFile;
  const sample = raw.sample ?? [];
  if (sample.length === 0) {
    console.error("harvest-sample.json has zero claims — nothing to generate");
    process.exit(2);
  }

  const est = estimateGenerationCostUsd(sample.length, GENERATION_BATCH_SIZE);
  console.log(
    `pre-flight estimate: ${est.batches} batch call(s) -> ~$${est.estCostUsd.toFixed(4)} ` +
      `for ${sample.length} claims (envelope $${COST_ENVELOPE_USD.toFixed(2)})`,
  );
  if (est.estCostUsd > COST_ENVELOPE_USD && !force) {
    console.error(
      `estimated cost $${est.estCostUsd.toFixed(4)} exceeds the $${COST_ENVELOPE_USD.toFixed(2)} envelope — ` +
        "refusing (pass --force to override)",
    );
    process.exit(2);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not set — cannot generate questions");
    process.exit(2);
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI();

  const batches: HarvestClaimRow[][] = [];
  for (let i = 0; i < sample.length; i += GENERATION_BATCH_SIZE) {
    batches.push(sample.slice(i, i + GENERATION_BATCH_SIZE));
  }

  let cumulativeCostUsd = 0;
  const generated: EvalQuestion[] = [];
  for (let i = 0; i < batches.length; i++) {
    if (cumulativeCostUsd > COST_ENVELOPE_USD && !force) {
      console.warn(
        `cumulative cost $${cumulativeCostUsd.toFixed(4)} exceeds the $${COST_ENVELOPE_USD.toFixed(2)} envelope — ` +
          `stopping before batch ${i + 1}/${batches.length} (pass --force to keep going)`,
      );
      break;
    }
    const batch = batches[i];
    const maxTokens = generationMaxCompletionTokens(batch.length);
    const params = chatParamsForModel(GENERATION_MODEL, maxTokens);

    let completion;
    try {
      completion = await client.chat.completions.create({
        model: GENERATION_MODEL,
        messages: [
          { role: "system", content: GENERATION_SYSTEM_PROMPT },
          { role: "user", content: generationUserMessage(batch) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "eval_questions",
            schema: generationResponseSchema(batch.length) as never,
            strict: true,
          },
        },
        ...params,
      });
    } catch (e) {
      console.error(`batch ${i + 1}/${batches.length}: request failed — ${e instanceof Error ? e.message : e}`);
      continue;
    }

    // meter before interpreting, same discipline as digest/map/reduce: a truncated
    // or refused response is still billed for whatever tokens it emitted.
    const usage = completion.usage;
    const batchCost = generationCostUsd(usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0);
    cumulativeCostUsd += batchCost;
    console.log(
      `batch ${i + 1}/${batches.length}: ${batch.length} claims, ` +
        `prompt=${usage?.prompt_tokens ?? "?"} completion=${usage?.completion_tokens ?? "?"} ` +
        `cost=$${batchCost.toFixed(4)} (cumulative $${cumulativeCostUsd.toFixed(4)})`,
    );

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      console.warn(`batch ${i + 1}: empty response (refusal or truncation) — skipping, already billed above`);
      continue;
    }
    let parsed: { results: Array<{ claimId: number; question: string }> };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn(`batch ${i + 1}: response was not valid JSON — skipping`);
      continue;
    }

    const byId = new Map(batch.map((c) => [c.id, c]));
    for (const r of parsed.results ?? []) {
      const row = byId.get(r.claimId);
      if (!row) {
        console.warn(`batch ${i + 1}: model returned unknown claimId ${r.claimId} — dropped`);
        continue;
      }
      generated.push(buildKnownAnswerQuestion(row, r.question));
    }
  }

  const existing: EvalSet | null = existsSync(EVAL_SET_PATH)
    ? (JSON.parse(readFileSync(EVAL_SET_PATH, "utf8")) as EvalSet)
    : null;
  const merged = mergeEvalSet(existing, generated, raw.corpus);
  mkdirSync(EVALS_DIR, { recursive: true });
  writeFileSync(EVAL_SET_PATH, JSON.stringify(merged, null, 2) + "\n");

  console.log(
    `\nwrote ${generated.length} known-answer question(s) -> ${EVAL_SET_PATH} ` +
      `(${merged.questions.length} total questions in the file)`,
  );
  console.log(`total spend this run: $${cumulativeCostUsd.toFixed(4)}`);
}

async function modeVerifyNegatives(): Promise<void> {
  if (!existsSync(EVAL_SET_PATH)) {
    console.error(`missing ${EVAL_SET_PATH} — nothing to verify`);
    process.exit(2);
  }
  const evalSet = JSON.parse(readFileSync(EVAL_SET_PATH, "utf8")) as EvalSet;
  const negatives = evalSet.questions.filter((q) => q.type === "negative");
  if (negatives.length === 0) {
    console.log("no type:\"negative\" questions found in ask-eval-set.json — nothing to verify");
    return;
  }

  const sql = neon(process.env.DATABASE_URL!);
  console.log(`probing ${negatives.length} negative control(s) (read-only lexical ILIKE, no LLM):\n`);
  for (const q of negatives) {
    const terms = extractTerms(q.question);
    if (terms.length === 0) {
      console.log(`${q.id}: no salient terms extracted from "${q.question}" — cannot probe`);
      continue;
    }
    const pattern = terms.map((t) => `%${t}%`);
    const rows = (await sql.query(`SELECT count(*)::int AS n FROM claims WHERE text ILIKE ANY($1)`, [
      pattern,
    ])) as Array<{ n: number }>;
    const n = rows[0]?.n ?? 0;
    const flag = n > 3 ? "  ** FLAG: >3 matches — replacement candidate **" : "";
    console.log(`${q.id} [${terms.join(", ")}]: ${n} lexical match(es)${flag}`);
  }
}

// ---- entry --------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  if (args.includes("--generate")) return modeGenerate(force);
  if (args.includes("--sample")) return modeSample();
  if (args.includes("--verify-negatives")) return modeVerifyNegatives();
  return modeEstimate();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
