import "./env";

// One-off claim-embedding backfill (ASK Tier-2+, workstream A). Estimate-first:
// running with NO flags prints how many claims still lack an embedding for the
// active model and the projected token/cost, then exits. --apply performs it.
//
// Every batch is one OpenAI embeddings request metered through the ASK embed
// SpendGuard, so with LLM_SPRINT_USD_CAP unset it REFUSES before spending (by
// design — set the cap only to pay for a run). Resumable via a checkpoint file
// (highest finished claim id) AND the ce-IS-NULL selection filter, so a killed
// run costs at most one batch. Targets DATABASE_URL verbatim.
//
// Usage:
//   tsx scripts/backfill-embeddings.ts                 # estimate only
//   LLM_SPRINT_USD_CAP=1 EMBED_USD_CAP_DAILY=1 \
//     tsx scripts/backfill-embeddings.ts --apply [--limit N] [--since yyyy-mm-dd] \
//                                        [--checkpoint path]
//   (SUPERVISOR runs --apply against a Neon branch only.)

const BATCH = 100;
const RATE_MS = 500; // ~2 requests/sec (one request per batch)
const DEFAULT_CHECKPOINT = "data/embed-backfill-checkpoint.json";

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const limitArg = flagValue("--limit");
  const limit = limitArg && /^\d+$/.test(limitArg) ? parseInt(limitArg, 10) : undefined;
  const sinceArg = flagValue("--since");
  const since = sinceArg && /^\d{4}-\d{2}-\d{2}$/.test(sinceArg) ? sinceArg : undefined;
  if (sinceArg && !since) {
    console.error(`--since must be yyyy-mm-dd (got "${sinceArg}")`);
    process.exit(2);
  }
  const checkpointPath = flagValue("--checkpoint") ?? DEFAULT_CHECKPOINT;

  const { Pool } = await import("@neondatabase/serverless");
  const { embedModel, embedStubReason, EMBED_USD_PER_TOKEN } = await import(
    "../src/lib/embeddings/client"
  );
  const { embedAndStoreClaims } = await import("../src/lib/embeddings/persist");
  const { embedGuardFromEnv } = await import("../src/lib/embeddings/guard");
  const { parseCheckpoint, serializeCheckpoint, advanceCheckpoint } = await import(
    "../src/lib/embeddings/backfill"
  );
  const fs = await import("node:fs");
  const path = await import("node:path");

  const model = embedModel();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // -- estimate -----------------------------------------------------------------
    const estParams: unknown[] = [model];
    let estClause = "";
    if (since) {
      estParams.push(since);
      estClause = ` AND cl.claim_date >= $${estParams.length}`;
    }
    const { rows: est } = await pool.query(
      `SELECT count(*)::int AS n, coalesce(sum(length(cl.text)), 0)::bigint AS chars
       FROM claims cl
       LEFT JOIN claim_embeddings ce ON ce.claim_id = cl.id AND ce.model = $1
       WHERE ce.claim_id IS NULL${estClause}`,
      estParams,
    );
    const missing: number = est[0].n;
    const chars = Number(est[0].chars);
    const estTokens = Math.ceil(chars / 4); // ~4 chars/token for English claim text
    const estUsd = estTokens * EMBED_USD_PER_TOKEN;

    console.log(`model: ${model}`);
    console.log(
      `claims missing an embedding${since ? ` (since ${since})` : ""}: ${missing}` +
        (limit !== undefined ? ` (this run capped at ${limit})` : ""),
    );
    console.log(
      `ESTIMATE: ~${estTokens} input tokens -> ~$${estUsd.toFixed(4)} ` +
        `at $${(EMBED_USD_PER_TOKEN * 1e6).toFixed(2)}/1M`,
    );

    // Refuse when the client would take the offline stub path — stub vectors are
    // NEVER persisted, so an --apply here would burn the run for zero stored rows.
    const stub = embedStubReason();
    if (stub) {
      console.error(
        `embed client would take the STUB path (${stub}) — refusing. ` +
          `Set OPENAI_API_KEY and clear LLM_DISABLE / ANALYSIS_PROVIDER=stub to backfill.`,
      );
      process.exit(2);
    }
    if (!apply) {
      console.log("estimate only — re-run with --apply to backfill");
      process.exit(0);
    }

    // -- run ----------------------------------------------------------------------
    const guard = embedGuardFromEnv(); // one init -> sees cumulative persisted spend
    await guard.init();

    let cp = parseCheckpoint(
      fs.existsSync(checkpointPath) ? fs.readFileSync(checkpointPath, "utf8") : null,
    );
    console.log(
      `resuming from claim id > ${cp.lastClaimId} ` +
        `(prior progress: ${cp.processed} claims, ${cp.tokens} tokens, $${cp.costUsd.toFixed(4)})`,
    );
    fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });

    let processedThisRun = 0;
    for (;;) {
      if (limit !== undefined && processedThisRun >= limit) {
        console.log(`run limit ${limit} reached`);
        break;
      }
      const want = limit !== undefined ? Math.min(BATCH, limit - processedThisRun) : BATCH;

      const p: unknown[] = [model, cp.lastClaimId];
      let sinceClause = "";
      if (since) {
        p.push(since);
        sinceClause = ` AND cl.claim_date >= $${p.length}`;
      }
      p.push(want);
      const limitPlaceholder = `$${p.length}`;
      const { rows } = await pool.query(
        `SELECT cl.id, cl.text
         FROM claims cl
         LEFT JOIN claim_embeddings ce ON ce.claim_id = cl.id AND ce.model = $1
         WHERE ce.claim_id IS NULL AND cl.id > $2${sinceClause}
         ORDER BY cl.id ASC
         LIMIT ${limitPlaceholder}`,
        p,
      );
      if (rows.length === 0) {
        console.log("no more claims to embed");
        break;
      }
      const batch = rows.map((r) => ({ id: r.id as number, text: r.text as string }));

      const res = await embedAndStoreClaims(pool, batch, { guard });
      const lastId = batch[batch.length - 1].id; // ascending select -> last is max
      cp = advanceCheckpoint(cp, {
        lastId,
        count: batch.length,
        tokens: res.tokens,
        costUsd: res.costUsd,
      });
      fs.writeFileSync(checkpointPath, serializeCheckpoint(cp));
      processedThisRun += batch.length;
      console.log(
        `batch: ${batch.length} claims through id ${lastId}; inserted ${res.inserted}; ` +
          `run ${processedThisRun}; total tokens ${cp.tokens}; total $${cp.costUsd.toFixed(4)}`,
      );

      await new Promise((r) => setTimeout(r, RATE_MS));
    }

    console.log(
      `DONE: ${processedThisRun} claims this run; ` +
        `cumulative ${cp.processed} claims / ${cp.tokens} tokens / $${cp.costUsd.toFixed(4)}; ` +
        `checkpoint at claim id ${cp.lastClaimId} (${checkpointPath})`,
    );
  } catch (e) {
    if ((e as { code?: string }).code === "LLM_BUDGET") {
      console.error(
        `budget stop — ${(e as Error).message}. Progress is checkpointed; raise ` +
          `LLM_SPRINT_USD_CAP / EMBED_USD_CAP_DAILY and re-run --apply to resume.`,
      );
      process.exit(2);
    }
    throw e;
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
