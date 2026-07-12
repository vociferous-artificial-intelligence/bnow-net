// The ONE invariant-preserving digest persist path (MR sprint 3). Extracted
// verbatim from digest.ts stage 5 so the legacy batch engine and the mapreduce
// synthesis engine write events/claims/claim_sources/claim_entities through
// identical SQL: single transaction, deferred claim_must_have_source trigger
// verified at COMMIT, track-scoped event regeneration, confidence = mean
// COALESCE(reliability, 0.3) over supporting docs.
//
// Overwrite guards (both engines, checked BEFORE the transaction):
//   empty-regen — never replace a claim-bearing digest with a zero-event
//     extraction (the 2026-07-07 ua incident).
//   thin-regen (OPEN-TASKS #32) — never replace it with one carrying less than
//     DIGEST_MIN_CLAIM_RATIO (default 0.5) of the prior claim count: MR1
//     measured a 1-claim roll silently replacing a 10-claim, 57%-coverage
//     digest under last-writer-wins.
// FORCE_REGEN=1 bypasses both (operator override; the A/B driver uses it so
// variance measurement sees every roll).

import type { Pool } from "@neondatabase/serverless";
import { embedStubReason } from "../embeddings/client";
import { embedAndStoreClaims } from "../embeddings/persist";
import type { DigestAnalysis } from "./provider";
import type { Track } from "./tracks";

export type PersistEvent = DigestAnalysis["events"][number];

export interface PersistDigestArgs {
  pool: Pool;
  countryId: number;
  countryIso2: string;
  date: string; // yyyy-mm-dd
  track: Track;
  provider: string;
  /** full digests.structured payload (engine-specific stats included) */
  structured: Record<string, unknown>;
  events: PersistEvent[];
  /** optional markdown block rendered ABOVE the events (delta framing) */
  mdPrelude?: string;
}

export interface DigestSkipped {
  countryIso2: string;
  date: string;
  track: Track;
  skipped: "empty-regen" | "thin-regen";
  priorClaims: number;
  newClaims: number;
}

export type PersistOutcome = { digestId: number; claimCount: number } | DigestSkipped;

export function isSkipped(o: PersistOutcome): o is DigestSkipped {
  return "skipped" in o;
}

function minClaimRatio(): number {
  const v = Number(process.env.DIGEST_MIN_CLAIM_RATIO);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.5;
}

/** Pure overwrite decision (unit-tested): may this regeneration replace the
 *  existing digest? `null` = proceed. */
export function overwriteVerdict(
  priorClaims: number,
  newClaims: number,
  eventCount: number,
  ratio: number,
  force: boolean,
): "empty-regen" | "thin-regen" | null {
  if (force || priorClaims === 0) return null;
  if (eventCount === 0) return "empty-regen";
  if (newClaims < priorClaims * ratio) return "thin-regen";
  return null;
}

export async function persistDigest(args: PersistDigestArgs): Promise<PersistOutcome> {
  const { pool, countryId, countryIso2, date, track, events } = args;
  const newClaims = events.reduce((s, ev) => s + ev.claims.length, 0);

  const { rows: prev } = await pool.query(
    `SELECT count(cl.id)::int AS claims
     FROM digests d LEFT JOIN claims cl ON cl.digest_id = d.id
     WHERE d.country_id = $1 AND d.digest_date = $2 AND d.track = $3
     GROUP BY d.id`,
    [countryId, date, track],
  );
  const priorClaims: number = prev[0]?.claims ?? 0;
  const verdict = overwriteVerdict(
    priorClaims,
    newClaims,
    events.length,
    minClaimRatio(),
    process.env.FORCE_REGEN === "1",
  );
  if (verdict !== null) {
    // the LLM call was still billed and is in provider_usage; only stats.llm
    // is lost, because the digest row it belongs to is not written
    console.warn(
      `digest ${countryIso2} ${date} ${track}: ${verdict} refused — new extraction has ` +
        `${events.length} events / ${newClaims} claims vs ${priorClaims} existing claims ` +
        `(ratio ${minClaimRatio()}; OPEN-TASKS #32; FORCE_REGEN=1 overrides)`,
    );
    return { countryIso2, date, track, skipped: verdict, priorClaims, newClaims };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dRes = await client.query(
      `INSERT INTO digests (country_id, digest_date, track, status, structured, provider)
       VALUES ($1, $2, $3, 'generated', $4, $5)
       ON CONFLICT (country_id, digest_date, track)
       DO UPDATE SET status='generated', structured=$4, provider=$5, created_at=now()
       RETURNING id`,
      [countryId, date, track, JSON.stringify(args.structured), args.provider],
    );
    const digestId: number = dRes.rows[0].id;

    // regeneration: clear previous claims/events for this digest
    await client.query(`DELETE FROM claims WHERE digest_id = $1`, [digestId]);
    // Scoped to this track: the other tracks of the same (country, date) keep
    // their own events, and a parallelised matrix can no longer have one track's
    // regeneration sweep collect another's rows.
    await client.query(
      `DELETE FROM events WHERE country_id = $1 AND event_date = $2 AND track = $3
         AND id NOT IN (SELECT DISTINCT event_id FROM claims WHERE event_id IS NOT NULL)`,
      [countryId, date, track],
    );

    let claimCount = 0;
    // ids+text of the claims inserted in THIS transaction, for the post-commit
    // embedding hook (claims get fresh ids on every regeneration, so old vectors
    // cascade-deleted with the old claim rows and these must be re-embedded).
    const insertedClaims: { id: number; text: string }[] = [];
    for (const ev of events) {
      const eRes = await client.query(
        `INSERT INTO events (country_id, event_date, track, type, title, summary)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [countryId, date, track, ev.type, ev.title.slice(0, 300), ev.summary.slice(0, 2000)],
      );
      const eventId = eRes.rows[0].id;
      for (const c of ev.claims) {
        const cRes = await client.query(
          `INSERT INTO claims (country_id, digest_id, event_id, text, claim_type, hedging, claim_date, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [countryId, digestId, eventId, c.text.slice(0, 500), c.claimType, c.hedging, date, null],
        );
        const claimId = cRes.rows[0].id;
        insertedClaims.push({ id: claimId, text: c.text.slice(0, 500) });
        for (const docId of c.docIds) {
          await client.query(
            `INSERT INTO claim_sources (claim_id, raw_document_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [claimId, docId],
          );
        }
        // entity graph: get-or-create by (kind, name)
        for (const ent of c.entities ?? []) {
          const name = ent.name.trim().slice(0, 200);
          if (!name) continue;
          const eIns = await client.query(
            `INSERT INTO entities (kind, name) VALUES ($1, $2)
             ON CONFLICT (kind, name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [ent.kind, name],
          );
          await client.query(
            `INSERT INTO claim_entities (claim_id, entity_id, role) VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [claimId, eIns.rows[0].id, ent.role.slice(0, 40)],
          );
        }
        claimCount++;
      }
    }

    // confidence: mean reliability of supporting docs (null-safe)
    await client.query(
      `UPDATE claims c SET confidence = sub.conf FROM (
         SELECT cs.claim_id, avg(COALESCE(s.reliability_score, 0.3)) AS conf
         FROM claim_sources cs
         JOIN raw_documents rd ON rd.id = cs.raw_document_id
         LEFT JOIN sources s ON s.id = rd.source_id
         GROUP BY cs.claim_id
       ) sub WHERE sub.claim_id = c.id AND c.digest_id = $1`,
      [digestId],
    );

    const body = renderMarkdown(countryIso2, `${date} · ${track}`, events);
    const rendered = args.mdPrelude
      ? body.replace("\n\n", `\n\n${args.mdPrelude.trimEnd()}\n\n`) // after the H1
      : body;
    await client.query(`UPDATE digests SET rendered_md = $1 WHERE id = $2`, [
      rendered,
      digestId,
    ]);

    await client.query("COMMIT");

    // ASK Tier-2+ (workstream A): embed the just-committed claims for the vector
    // retrieval arm. AFTER commit and awaited (serverless — no fire-and-forget),
    // but fully FAIL-OPEN: the digest is already persisted, so nothing here may
    // change persistDigest's return value or throw. See embedInsertedClaimsFailOpen.
    await embedInsertedClaimsFailOpen(pool, insertedClaims, `${countryIso2} ${date} ${track}`);

    return { digestId, claimCount };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Embed and store the claims a persist just committed. Never throws and never
 *  affects the caller: any failure (budget stop, provider error, DB error) is
 *  swallowed with ONE warn. Skips silently (one warn) on the stub/no-key/disabled
 *  path — no OpenAI call, no stub vectors written. */
async function embedInsertedClaimsFailOpen(
  pool: Pool,
  insertedClaims: { id: number; text: string }[],
  ctx: string,
): Promise<void> {
  if (insertedClaims.length === 0) return;
  const stub = embedStubReason();
  if (stub !== null) {
    console.warn(
      `digest ${ctx}: embedding skipped (${stub}) — ${insertedClaims.length} claims left unembedded`,
    );
    return;
  }
  try {
    await embedAndStoreClaims(pool, insertedClaims);
  } catch (e) {
    console.warn(
      `digest ${ctx}: embedding failed (fail-open, digest unaffected) — ${(e as Error).message}`,
    );
  }
}

export function renderMarkdown(
  countryIso2: string,
  date: string,
  events: DigestAnalysis["events"],
): string {
  const lines = [
    `# ${countryIso2.toUpperCase()} daily digest — ${date}`,
    "",
    `_${events.length} events · every claim links to its source documents_`,
    "",
  ];
  for (const ev of events) {
    lines.push(`## ${ev.title}`, "", ev.summary, "");
    for (const c of ev.claims) {
      lines.push(`- **[${c.hedging}]** ${c.text} _(docs: ${c.docIds.join(", ")})_`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
