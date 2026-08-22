import "./env";

// Version-aware map REMAP driver (OPEN-TASKS #33). Drives the DEPLOYED
// /api/cron/map route in remap mode — this box cannot reach api.openai.com
// (AGENTS.md), so all LLM work runs on Vercel; this script only sequences
// days, threads the scan cursor, and reads counters back.
//
// What remap mode does (src/lib/analysis/map-worker.ts): eligibility IGNORES
// raw_documents.processed and instead anti-joins doc_map_state against the
// CURRENT extractor versions, selecting canonical (never-mirror), already-
// dispositioned docs whose applicable track(s) lack a current-version
// disposition. It never resets processed, never deletes old doc_claims, and
// never mutates historical extractor versions — superseded rows remain intact
// append-only history, which is also the rollback: reverting the version
// restores the old rows to every current-version consumer.
//
// Safety properties, in order:
//   - READ-ONLY BY DEFAULT: without --execute this prints the estimate
//     (per-day dry runs on the route: no LLM call, no write, no lease) and
//     exits. The estimate shows the exact target model, reasoning effort,
//     extractor versions, eligible doc count, and a conservative cost model.
//   - FAIL-CLOSED DISPATCH: execution dispatches through the shared
//     workloadDispatchConfig("map") on the server — an unpriced, unapproved,
//     or map-activation-locked configuration refuses BEFORE any reservation
//     (the activation lock is NOT relaxed by this tool; today only the
//     baseline model may dispatch, which makes remap a prompt-revision tool
//     until an operator-authorized activation exists).
//   - SPEND: every physical provider attempt inside the route passes a fresh
//     SpendGuard reservation and is metered before parsing (map-worker
//     extractBatch); server-side stops surface here with typed categories —
//     run_cap benign, daily_cap wait/abort, total_cap/cap_unset abort,
//     transport bounded retries. The driver also enforces its own --budget on
//     modelled AND actual spend.
//   - RESUMABLE WITHOUT REBILLING: the authoritative completion record is
//     doc_map_state itself — a (doc, track, current_version) pair that
//     reached a disposition (INCLUDING a final zero-claims disposition) is
//     never re-selected and never re-billed. The local checkpoint file only
//     avoids re-SCANNING (SQL-only) and lets an interrupted run resume
//     mid-day.
//   - LEASE-SAFE: the route's remap cycle takes the same map lease as the
//     hourly worker and the backfill driver — a manual remap cannot silently
//     race scheduled mapping; a busy lease is waited out.
//
// Day drain model: a day is swept with an id cursor (?after=) so documents
// that yield no work (lexicon mismatch, already current) are passed once per
// sweep instead of re-selected forever. A sweep that completes with ZERO
// doc-track pairs needing work proves the day is done under the current
// versions; a sweep that did map work is followed by a verification sweep
// (cursor reset) so omitted/errored/stopped docs are re-attempted, bounded by
// MAX_SWEEPS.
//
//   npx tsx scripts/map-remap.ts --theater ir --from 2026-07-04 --to 2026-07-10
//     estimate only (default; $0, no writes)
//   npx tsx scripts/map-remap.ts --theater ir --from 2026-07-04 --to 2026-07-10 \
//     --budget 4 --execute [--track military] [--limit 2000] [--wait-daily]
//
// Flags: --theater (required) · --track (optional: military|elite_politics|
// nuclear) · --from/--to (inclusive UTC days; --to defaults to today) ·
// --budget USD (required with --execute) · --cap docs/call (default 400) ·
// --limit max doc-track pairs to attempt this invocation (bounded total;
// resumable) · --state <file> checkpoint path (default
// data/remap-state/<key>.json, gitignored) · --wait-daily · --execute.
//
// EVERY numeric flag is parsed FAIL-CLOSED (parseUsdFlag/parseCountFlag in
// map-backfill.ts): non-numeric, empty, non-finite, zero, negative — and, for
// counts, fractional — input throws before a single call is made. NaN silently
// removes a bound (it compares false against every threshold), so a typo must
// never reach a comparison.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { utcDayRange } from "../src/lib/time/day-boundary";
import {
  MapTransportError,
  callMap,
  msToNextUtcDay,
  parseCountFlag,
  parseUsdFlag,
  type MapCallResult,
} from "./map-backfill";

type Counts = Record<string, number | string | undefined>;
const n = (c: Counts, k: string) => Number(c[k] ?? 0);

/** A sweep that maps work is re-verified with a fresh cursor; a day that still
 *  has pairs after this many sweeps is left incomplete (loudly) for the next
 *  invocation — omission/transient-error tails should converge in 2-3. */
export const MAX_SWEEPS = 5;

export interface RemapDayState {
  /** id cursor within the current sweep */
  afterId: number;
  /** doc-track pairs that needed work in the current sweep so far */
  sweepPairs: number;
  /** completed sweeps so far */
  sweeps: number;
  /** a full sweep found zero pairs — done under the current versions */
  complete: boolean;
  usd: number;
  claims: number;
}

export interface RemapCheckpoint {
  key: string;
  days: Record<string, RemapDayState>;
  totalUsd: number;
  /** digest of the extractor versions the completed days were proven under —
   *  a version bump invalidates every day's `complete` flag (doc_map_state is
   *  the real record; the checkpoint must never outrank it) */
  versionsDigest?: string;
  /** the ROUTE TARGET those `complete` flags were proven against (normalized
   *  origin+path, never a credential) — a checkpoint earned against one
   *  deployment must not suppress sweeps against another (audit REMAP-5) */
  target?: string;
}

/** Stable, non-sensitive identity for the deployment this checkpoint's day
 *  states were proven against.
 *
 *  Deliberately derived ONLY from the operator's own route base: lowercase
 *  scheme + host + path, with any userinfo, query and fragment stripped, so
 *  the value written to disk can never carry a token, a password, or a
 *  connection string. It is written into a gitignored state file, but the
 *  no-secret property is a property of the FUNCTION, not of the file.
 *
 *  Scope, stated exactly: this binds the checkpoint to a route ADDRESS. Two
 *  deployments answering on the same base URL with different databases are
 *  indistinguishable here — the route exposes no non-sensitive database
 *  identity to bind to, and inventing one would mean changing the deployed
 *  route contract. That residual is harmless because the checkpoint is only a
 *  SCAN accelerator: `doc_map_state` remains the sole no-rebill authority, so
 *  the worst case a wrong checkpoint can cause is a skipped SCAN, never a
 *  double charge — and mismatch resets the scan state rather than trusting
 *  it. */
export function remapTargetId(base: string): string {
  try {
    const u = new URL(base);
    u.username = "";
    u.password = "";
    u.search = "";
    u.hash = "";
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    // not a parseable URL: still normalize, still no secret (this is the
    // operator's own --base/MAP_BACKFILL_BASE value)
    return base.trim().replace(/\/+$/, "").toLowerCase();
  }
}

export interface RemapCheckpointStore {
  load(key: string): Promise<RemapCheckpoint | null>;
  save(cp: RemapCheckpoint): Promise<void>;
}

export function fileCheckpointStore(dir: string): RemapCheckpointStore {
  const fileOf = (key: string) => path.join(dir, `${key.replace(/[^a-z0-9_.-]/gi, "_")}.json`);
  return {
    async load(key) {
      const f = fileOf(key);
      if (!existsSync(f)) return null;
      return JSON.parse(readFileSync(f, "utf8")) as RemapCheckpoint;
    },
    async save(cp) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(fileOf(cp.key), JSON.stringify(cp, null, 2) + "\n");
    },
  };
}

export function memoryCheckpointStore(): RemapCheckpointStore & { state: Map<string, RemapCheckpoint> } {
  const state = new Map<string, RemapCheckpoint>();
  return {
    state,
    async load(key) {
      return state.get(key) ?? null;
    },
    async save(cp) {
      state.set(cp.key, structuredClone(cp));
    },
  };
}

export interface RemapDriveOpts {
  base: string;
  secret: string;
  theater: string;
  track?: string;
  from: string; // yyyy-mm-dd inclusive
  to?: string; // yyyy-mm-dd inclusive; default today (UTC)
  budgetUsd: number;
  execute: boolean;
  /** docs per live route call */
  cap?: number;
  /** max cumulative doc-track pairs to ATTEMPT this invocation (bound, resumable) */
  limit?: number;
  waitDaily?: boolean;
  store: RemapCheckpointStore;
  log?: (line: string) => void;
  call?: typeof callMap;
  sleep?: (ms: number) => Promise<void>;
}

export interface RemapDriveResult {
  days: string[];
  eligibleDocs: number;
  estTotal: number;
  actualTotal: number;
  pairsAttempted: number;
  claims: number;
  /** set when the drain stopped early (estimate-over-budget aborts before any
   *  paid call; every abort is resumable — completed pairs are never redone) */
  aborted?: string;
  incompleteDays: string[];
}

const TRANSPORT_RETRIES = 3;

export async function driveMapRemap(opts: RemapDriveOpts): Promise<RemapDriveResult> {
  const log = opts.log ?? console.log;
  const call = opts.call ?? callMap;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const cap = opts.cap ?? 400;
  // a garbage --budget must FAIL CLOSED, not disable both budget gates (NaN
  // compares false against everything — spend review 1, MAJOR-2)
  if (opts.execute && (!Number.isFinite(opts.budgetUsd) || opts.budgetUsd <= 0)) {
    throw new Error(`--execute requires a finite positive --budget (got ${opts.budgetUsd})`);
  }
  // Same class, one flag over (audit REMAP-3): a NaN --limit compares false
  // against `pairsAttempted >= limit` and silently removes the pair ceiling; a
  // NaN/zero --cap rides into the route as ?cap= and a cap of 0 selects
  // NOTHING, which the sweep logic would read as "day drained". Both bounds
  // fail closed here — before phase 1 issues a single call.
  if (opts.limit !== undefined && (!Number.isInteger(opts.limit) || opts.limit <= 0)) {
    throw new Error(`--limit must be a positive whole number of doc-track pairs (got ${opts.limit})`);
  }
  if (opts.cap !== undefined && (!Number.isInteger(opts.cap) || opts.cap <= 0)) {
    throw new Error(`--cap must be a positive whole number of docs (got ${opts.cap})`);
  }
  const days = utcDayRange(opts.from, opts.to ?? new Date().toISOString().slice(0, 10));
  if (days.length === 0) throw new Error(`empty day range ${opts.from}..${opts.to}`);
  const trackParam = opts.track ? `&track=${opts.track}` : "";
  const baseParams = `remap=1&theater=${opts.theater}${trackParam}`;
  const key = `remap_${opts.theater}_${opts.track ?? "all"}_${days[0]}_${days[days.length - 1]}`;

  const callWithRetry = async (params: string): Promise<MapCallResult> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await call(opts.base, opts.secret, params);
      } catch (e) {
        if (!(e instanceof MapTransportError) || attempt >= TRANSPORT_RETRIES) throw e;
        log(`  transport failure (attempt ${attempt}/${TRANSPORT_RETRIES}): ${e.message} — retrying in 30s`);
        await sleep(30_000);
      }
    }
  };

  // -- phase 1: estimate (dry remap runs — no LLM, no writes, no lease) -------
  log(
    `map remap — ${days[0]} … ${days[days.length - 1]} theater=${opts.theater}` +
      `${opts.track ? ` track=${opts.track}` : ""} via ${opts.base}`,
  );
  log(`\n== phase 1: estimate (dry runs — no LLM calls, no writes) ==`);
  let estTotal = 0;
  let eligibleDocs = 0;
  let eligiblePairs = 0;
  let model = "";
  let effort = "";
  const versions = new Map<string, string>();
  for (const day of days) {
    const { counts: c } = await callWithRetry(`date=${day}&dry=1&cap=20000&${baseParams}`);
    // capability handshake: an OLD deployed route ignores remap=1 and answers
    // a BACKFILL dry run — silently the wrong selection, and a later live run
    // would spend on it and checkpoint remap days "complete" (spend review 1,
    // MAJOR-3). A remap-capable route ALWAYS echoes maxSelectedId, empty days
    // included; refuse to continue without it.
    if (c.maxSelectedId === undefined) {
      throw new Error(
        `the route at ${opts.base} does not support remap mode (no maxSelectedId in the dry ` +
          `response) — deploy the remap-capable build before running this driver`,
      );
    }
    estTotal += n(c, "estUsd");
    eligibleDocs += n(c, "selected");
    eligiblePairs += n(c, "docTrackPairs");
    model = String(c.estModel ?? model);
    effort = String(c.estEffort ?? effort);
    for (const [k, v] of Object.entries((c.remapVersions as unknown as Record<string, string>) ?? {})) {
      versions.set(k, v);
    }
    log(
      `${day}  eligible=${n(c, "selected")}  pairs=${n(c, "docTrackPairs")}  batches=${n(c, "batches")}  est=$${n(c, "estUsd").toFixed(4)}`,
    );
  }
  log(`\nTARGET model=${model || "?"}${effort ? ` effort=${effort}` : " (no reasoning effort)"}`);
  for (const [k, v] of [...versions.entries()].sort()) log(`  version ${k} -> ${v}`);
  log(
    `ELIGIBLE: ${eligibleDocs} docs / ${eligiblePairs} doc-track pairs · ` +
      `ESTIMATE TOTAL: $${estTotal.toFixed(4)} (budget $${opts.budgetUsd})\n`,
  );

  const none: Omit<RemapDriveResult, "aborted"> = {
    days,
    eligibleDocs,
    estTotal,
    actualTotal: 0,
    pairsAttempted: 0,
    claims: 0,
    incompleteDays: [],
  };
  if (!opts.execute) {
    log("estimate only — rerun with --execute to remap (dispatch stays fail-closed server-side)");
    return none;
  }
  if (estTotal > opts.budgetUsd) {
    return { ...none, aborted: `estimate $${estTotal.toFixed(4)} exceeds budget $${opts.budgetUsd}` };
  }

  // -- phase 2: sweep-drain, oldest day first ---------------------------------
  log(`== phase 2: remap, oldest day first ==`);
  const cp: RemapCheckpoint = (await opts.store.load(key)) ?? { key, days: {}, totalUsd: 0 };
  // the checkpoint's `complete` flags were proven under specific extractor
  // versions; a version bump makes them stale (the canonical workflow is
  // "bump version -> remap") and doc_map_state — the real record — must win
  // (concurrency review 1, MAJOR-2). Reset day states on any version change.
  //
  // The checkpoint accelerates SCANNING; it is never an authority. Its
  // `complete` flags are honoured only when they were proven under BOTH the
  // same extractor versions AND the same route target. Anything else — a
  // version bump, a different deployment, or a checkpoint written before
  // either binding existed (missing field = unknown provenance) — resets the
  // day states. Resetting only ever costs a re-scan: doc_map_state still
  // refuses to re-dispatch, and therefore to re-bill, any completed pair.
  const versionsDigest = JSON.stringify([...versions.entries()].sort());
  const target = remapTargetId(opts.base);
  const versionsMatch = cp.versionsDigest === versionsDigest;
  const targetMatch = cp.target === target;
  if (!versionsMatch || !targetMatch) {
    if (Object.keys(cp.days).length > 0) {
      const why = !versionsMatch
        ? `extractor versions changed (${cp.versionsDigest === undefined ? "checkpoint predates version binding" : "bumped"})`
        : `checkpoint belongs to a different target (${cp.target ?? "unbound"} != ${target})`;
      log(`${why} — resetting day states (doc_map_state still prevents any rebilling)`);
    }
    cp.days = {};
  }
  cp.versionsDigest = versionsDigest;
  cp.target = target;
  let actualTotal = cp.totalUsd;
  let pairsAttempted = 0;
  let claims = 0;
  const incompleteDays: string[] = [];

  // a resumed checkpoint that already exhausted the budget must not buy one
  // more live call per invocation (spend review 1, MINOR-9)
  if (actualTotal > opts.budgetUsd) {
    return {
      ...none,
      actualTotal,
      aborted: `checkpoint spend $${actualTotal.toFixed(4)} already exceeds budget $${opts.budgetUsd} — raise --budget or start a fresh checkpoint`,
    };
  }

  for (const day of days) {
    const st: RemapDayState =
      cp.days[day] ?? { afterId: 0, sweepPairs: 0, sweeps: 0, complete: false, usd: 0, claims: 0 };
    cp.days[day] = st;
    if (st.complete) {
      log(`${day}  complete (checkpoint) — skipping`);
      continue;
    }
    // MAX_SWEEPS bounds one INVOCATION; a later invocation gets a fresh
    // allowance so "leaving remainder for a later invocation" stays true
    // (spend review 1, MINOR-5)
    st.sweeps = 0;

    let stalls = 0; // consecutive calls that could not advance the cursor
    daySweeps: while (!st.complete && st.sweeps < MAX_SWEEPS) {
      let r: MapCallResult;
      try {
        r = await callWithRetry(`date=${day}&after=${st.afterId}&cap=${cap}&${baseParams}`);
      } catch (e) {
        await opts.store.save(cp);
        return {
          ...none,
          actualTotal,
          pairsAttempted,
          claims,
          incompleteDays,
          aborted: `transient transport failure persisted at ${day} after=${st.afterId}: ${e instanceof Error ? e.message : e}`,
        };
      }
      const c = r.counts;
      const usd = n(c, "estUsd");
      actualTotal += usd;
      cp.totalUsd += usd;
      st.usd += usd;
      st.claims += n(c, "claims");
      claims += n(c, "claims");
      pairsAttempted += n(c, "docTrackPairs");
      log(
        `${day} s${st.sweeps + 1} after=${st.afterId}  selected=${n(c, "selected")}  pairs=${n(c, "docTrackPairs")}  ` +
          `claims=${n(c, "claims")}  empty=${n(c, "emptyDocs")}  omitted=${n(c, "omittedDocs")}  $${usd.toFixed(4)}` +
          (c.budgetStop ? `  BUDGET STOP [${r.category ?? "?"}]: ${c.budgetStop}` : "") +
          (c.skipped ? `  SKIPPED: ${c.skipped}` : ""),
      );

      if (c.skipped) {
        // the hourly worker (or another driver) holds the map lease; wait it
        // out WITHOUT advancing the cursor — nothing was scanned
        await sleep(60_000);
        continue;
      }
      if (actualTotal > opts.budgetUsd) {
        await opts.store.save(cp);
        return {
          ...none,
          actualTotal,
          pairsAttempted,
          claims,
          incompleteDays,
          aborted: `actual spend $${actualTotal.toFixed(4)} exceeded budget $${opts.budgetUsd} (resumable — completed pairs are never rebilled)`,
        };
      }
      if (r.category && r.category !== "run_cap") {
        if (r.category === "daily_cap" && opts.waitDaily) {
          const ms = msToNextUtcDay(new Date());
          log(`${day}: daily cap reached — waiting ${(ms / 60000).toFixed(0)}m for the next UTC day`);
          await opts.store.save(cp);
          await sleep(ms);
          // cursor NOT advanced past a budget-stopped call: its unfinished
          // docs must be re-selected, and the anti-join skips finished ones
          continue;
        }
        await opts.store.save(cp);
        const advice =
          r.category === "daily_cap"
            ? "daily cap reached — resume after the next UTC day boundary (or rerun with --wait-daily)"
            : "operator intervention required (all-time/monthly cap or unset cap env)";
        return {
          ...none,
          actualTotal,
          pairsAttempted,
          claims,
          incompleteDays,
          aborted: `server-side ${r.category} stop at ${day}: ${advice}`,
        };
      }
      if (opts.limit !== undefined && pairsAttempted >= opts.limit) {
        await opts.store.save(cp);
        return {
          ...none,
          actualTotal,
          pairsAttempted,
          claims,
          incompleteDays,
          aborted: `--limit ${opts.limit} doc-track pairs reached (resumable)`,
        };
      }

      if (n(c, "selected") === 0) {
        // sweep finished. Zero pairs across the WHOLE sweep proves the day is
        // complete under the current versions; otherwise verify with a fresh
        // cursor so omitted/errored docs get re-attempted.
        st.sweeps += 1;
        if (st.sweepPairs === 0) {
          st.complete = true;
          await opts.store.save(cp);
          log(`${day} DONE  claims=${st.claims}  $${st.usd.toFixed(4)}\n`);
        } else {
          st.afterId = 0;
          st.sweepPairs = 0;
          await opts.store.save(cp);
        }
        continue daySweeps;
      }
      st.sweepPairs += n(c, "docTrackPairs");
      // advance the scan cursor only on a clean call: a budget-stopped (any
      // category incl. run_cap), lease-lost, or batch-errored call can leave
      // selected docs unfinished, and skipping them would let the sweep-based
      // completion proof lie
      // live-response capability guard (defense beside the phase-1 handshake)
      if (c.maxSelectedId === undefined) {
        await opts.store.save(cp);
        return {
          ...none,
          actualTotal,
          pairsAttempted,
          claims,
          incompleteDays,
          aborted: `route response carries no maxSelectedId — not a remap-capable route; refusing to continue`,
        };
      }
      const leaseLost = ((c.lease as unknown as Record<string, unknown>)?.lost ?? 0) === 1;
      const clean = !c.budgetStop && !leaseLost && n(c, "batchErrors") === 0;
      if (clean) {
        st.afterId = n(c, "maxSelectedId");
        stalls = 0;
      } else if (n(c, "batchErrors") > 0 || leaseLost) {
        // only genuine per-batch failures count as stalls — a benign run_cap
        // stop DID make server-side progress (the anti-join shrinks the pairs)
        // and simply resumes at the same cursor
        if (++stalls >= 3) {
          await opts.store.save(cp);
          log(`${day}: no cursor progress after ${stalls} failing calls — leaving day incomplete`);
          break daySweeps;
        }
      }
      await opts.store.save(cp);
    }
    if (!st.complete) {
      incompleteDays.push(day);
      log(`${day}: still incomplete after ${st.sweeps} sweeps — leaving remainder for a later invocation\n`);
    }
  }

  log(
    `REMAP ${incompleteDays.length === 0 ? "COMPLETE" : "PARTIAL"} — ` +
      `pairs attempted ${pairsAttempted} · claims ${claims} · actual $${actualTotal.toFixed(4)} ` +
      `(modelled $${estTotal.toFixed(4)})${incompleteDays.length ? ` · incomplete: ${incompleteDays.join(", ")}` : ""}`,
  );
  log("old extractor-version rows are untouched (append-only history; rollback = revert the version).");
  return { ...none, actualTotal, pairsAttempted, claims, incompleteDays };
}

async function main() {
  const args = process.argv.slice(2);
  const argVal = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET not set");
  const theater = argVal("--theater");
  if (!theater) throw new Error("--theater is required (bounded remaps only)");
  const track = argVal("--track");
  if (track && !["military", "elite_politics", "nuclear"].includes(track)) {
    throw new Error(`--track must be military|elite_politics|nuclear, got ${track}`);
  }
  const execute = args.includes("--execute");
  const budget = argVal("--budget");
  if (execute && budget === undefined) throw new Error("--execute requires an explicit --budget USD");
  // every numeric flag is parsed fail-closed BEFORE the driver is constructed,
  // so a typo can never reach a comparison as NaN
  const budgetUsd = parseUsdFlag("--budget", budget);
  const cap = parseCountFlag("--cap", argVal("--cap"));
  const limit = parseCountFlag("--limit", argVal("--limit"));

  const stateDir = argVal("--state") ?? path.join(__dirname, "..", "data", "remap-state");
  const result = await driveMapRemap({
    base: process.env.MAP_BACKFILL_BASE ?? "https://bnow-net.vercel.app",
    secret,
    theater,
    track,
    from: argVal("--from") ?? "2026-07-04",
    to: argVal("--to"),
    budgetUsd: budgetUsd ?? 0,
    execute,
    cap,
    limit,
    waitDaily: args.includes("--wait-daily"),
    store: fileCheckpointStore(stateDir),
  });
  if (result.aborted) {
    console.error(`ABORT: ${result.aborted}`);
    process.exit(1);
  }
}

// CLI only when executed directly (tests import the driver above)
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/map-remap.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
