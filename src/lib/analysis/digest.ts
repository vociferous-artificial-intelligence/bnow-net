import { Pool } from "@neondatabase/serverless";
import { STUB_CONTENT_PREFIX } from "../adapters/stubs";
import { detectLang } from "./lang";
import { findNearDuplicates } from "./minhash";
import { getProvider, type AnalysisInputDoc, type DigestAnalysis } from "./provider";
import { TRACKS, type Track } from "./tracks";

// Daily digest generation: gather -> dedupe -> analyze -> validate -> persist.
// Persistence runs in ONE transaction so the claim_must_have_source constraint
// trigger (deferred) verifies traceability at COMMIT.

// Cyrillic tokenizes ~1 token/char in GPT models; 100 docs x 400 chars keeps a
// full-RU batch under the entry-tier 60K TPM limit.
const MAX_DOCS = 100;

export interface DigestResult {
  digestId: number;
  countryIso2: string;
  date: string;
  track: Track;
  events: number;
  claims: number;
  droppedClaims: number;
  provider: string;
  docsAnalyzed: number;
}

export async function generateDigest(
  countryIso2: string,
  date: string, // yyyy-mm-dd (UTC day to cover)
  track: Track = "military",
): Promise<DigestResult | null> {
  const trackCfg = TRACKS[track];
  if (!trackCfg.countries.includes(countryIso2)) return null;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: countryRows } = await pool.query(
      "SELECT id FROM countries WHERE iso2 = $1",
      [countryIso2],
    );
    if (countryRows.length === 0) throw new Error(`unknown country ${countryIso2}`);
    const countryId: number = countryRows[0].id;

    // 1. gather the day's documents (published or fetched that day), joined to reliability
    const { rows: docRows } = await pool.query(
      `SELECT rd.id, rd.title, rd.content, rd.lang, rd.url, rd.published_at,
              s.canonical_url AS source_key, s.reliability_score AS reliability
       FROM raw_documents rd
       LEFT JOIN sources s ON s.id = rd.source_id
       WHERE rd.country_iso2 = $1
         AND COALESCE(rd.published_at, rd.fetched_at) >= $2::date
         AND COALESCE(rd.published_at, rd.fetched_at) < $2::date + interval '1 day'
         AND length(rd.content) >= 40
         AND rd.content NOT LIKE $3
       ORDER BY COALESCE(s.reliability_score, 0.3) DESC, rd.published_at DESC NULLS LAST
       LIMIT 600`,
      [countryIso2, date, `${STUB_CONTENT_PREFIX}%`],
    );
    if (docRows.length === 0) {
      console.warn(`digest ${countryIso2} ${date}: no documents`);
      return null;
    }

    // 1b. track lexicon prefilter (elite politics: courts/siloviki/elite-churn
    // terms; theater variants override — e.g. Iran military's proxy/maritime set)
    const lexicon = trackCfg.lexiconByCountry?.[countryIso2] ?? trackCfg.lexicon;
    const trackRows = lexicon
      ? docRows.filter((d) => lexicon.test(`${d.title ?? ""} ${d.content}`.slice(0, 1500)))
      : docRows;
    if (trackRows.length === 0) {
      console.warn(`digest ${countryIso2} ${date} ${track}: no track-relevant documents`);
      return null;
    }

    // 2. near-dupe collapse, keep canonical docs up to MAX_DOCS
    const texts = trackRows.map((d) => `${d.title ?? ""} ${d.content}`.slice(0, 2000));
    const { canonicalOf } = findNearDuplicates(texts, 0.7);
    const canonicalIdx = [...new Set(canonicalOf.values())];
    const selected = canonicalIdx.slice(0, MAX_DOCS);

    const docs: AnalysisInputDoc[] = selected.map((i) => {
      const d = trackRows[i];
      return {
        id: d.id,
        title: d.title,
        content: d.content,
        lang: d.lang ?? detectLang(d.content),
        sourceKey: d.source_key,
        reliability: d.reliability !== null ? Number(d.reliability) : null,
        url: d.url,
        publishedAt: d.published_at ? new Date(d.published_at).toISOString() : null,
      };
    });

    // 3. analyze — dense corpora (e.g. uk-language X days) can push the model
    // to its output-token ceiling; on truncation retry with a smaller batch
    // (the top of the reliability-ordered list survives the cut)
    const provider = await getProvider();
    let analysis: Awaited<ReturnType<typeof provider.analyze>> | null = null;
    let batch = docs;
    for (const size of [docs.length, 50, 25]) {
      batch = docs.slice(0, size);
      try {
        analysis = await provider.analyze(countryIso2, date, batch, {
          systemPrompt: trackCfg.systemPromptByCountry?.[countryIso2] ?? trackCfg.systemPrompt,
          track,
        });
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("truncated") && size > 25) {
          console.warn(`digest ${countryIso2} ${date} ${track}: ${msg} at ${size} docs — retrying smaller`);
          continue;
        }
        throw e;
      }
    }
    if (!analysis) throw new Error("digest: analysis unavailable after retries");
    const docsSent = batch;

    // 4. validate claim docIds against the batch actually sent (anti-hallucination gate)
    const validIds = new Set(docsSent.map((d) => d.id));
    let dropped = 0;
    const events = analysis.events
      .map((ev) => ({
        ...ev,
        claims: ev.claims.filter((c) => {
          c.docIds = [...new Set(c.docIds)].filter((id) => validIds.has(id));
          if (c.docIds.length === 0) dropped++;
          return c.docIds.length > 0;
        }),
      }))
      .filter((ev) => ev.claims.length > 0);

    // 4b. never overwrite a claim-bearing digest with an empty extraction —
    // providers throw on hard failures (refusal/truncation/bad JSON), but a
    // model can also legitimately return zero events; when a previous run
    // produced claims, empty is strictly worse information and is discarded
    // (regression guard from the 2026-07-07 ua incident: two good digests were
    // wiped by silent extraction failures).
    if (events.length === 0) {
      const { rows: prev } = await pool.query(
        `SELECT count(cl.id)::int AS claims
         FROM digests d LEFT JOIN claims cl ON cl.digest_id = d.id
         WHERE d.country_id = $1 AND d.digest_date = $2 AND d.track = $3
         GROUP BY d.id`,
        [countryId, date, track],
      );
      if ((prev[0]?.claims ?? 0) > 0) {
        console.warn(
          `digest ${countryIso2} ${date} ${track}: extraction returned 0 events but ` +
            `existing digest has ${prev[0].claims} claims — keeping the existing digest`,
        );
        return null;
      }
    }

    // 5. persist atomically
    const client = await pool.connect();
    let digestId: number;
    let claimCount = 0;
    try {
      await client.query("BEGIN");
      const structured = {
        stats: { docsAnalyzed: docsSent.length, docsRaw: docRows.length, trackRows: trackRows.length },
      };
      const dRes = await client.query(
        `INSERT INTO digests (country_id, digest_date, track, status, structured, provider)
         VALUES ($1, $2, $3, 'generated', $4, $5)
         ON CONFLICT (country_id, digest_date, track)
         DO UPDATE SET status='generated', structured=$4, provider=$5, created_at=now()
         RETURNING id`,
        [countryId, date, track, JSON.stringify(structured), analysis.provider],
      );
      digestId = dRes.rows[0].id;

      // regeneration: clear previous claims/events for this digest
      await client.query(
        `DELETE FROM claims WHERE digest_id = $1`,
        [digestId],
      );
      await client.query(
        `DELETE FROM events WHERE country_id = $1 AND event_date = $2
           AND id NOT IN (SELECT DISTINCT event_id FROM claims WHERE event_id IS NOT NULL)`,
        [countryId, date],
      );

      for (const ev of events) {
        const eRes = await client.query(
          `INSERT INTO events (country_id, event_date, type, title, summary)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [countryId, date, ev.type, ev.title.slice(0, 300), ev.summary.slice(0, 2000)],
        );
        const eventId = eRes.rows[0].id;
        for (const c of ev.claims) {
          const cRes = await client.query(
            `INSERT INTO claims (country_id, digest_id, event_id, text, claim_type, hedging, claim_date, confidence)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
              countryId,
              digestId,
              eventId,
              c.text.slice(0, 500),
              c.claimType,
              c.hedging,
              date,
              null,
            ],
          );
          const claimId = cRes.rows[0].id;
          for (const docId of c.docIds) {
            await client.query(
              `INSERT INTO claim_sources (claim_id, raw_document_id) VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [claimId, docId],
            );
          }
          // entity graph (elite-politics track): get-or-create by (kind, name)
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

      const rendered = renderMarkdown(countryIso2, `${date} · ${track}`, events);
      await client.query(`UPDATE digests SET rendered_md = $1 WHERE id = $2`, [
        rendered,
        digestId,
      ]);

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    return {
      digestId,
      countryIso2,
      date,
      track,
      events: events.length,
      claims: claimCount,
      droppedClaims: dropped,
      provider: analysis.provider,
      docsAnalyzed: docsSent.length,
    };
  } finally {
    await pool.end();
  }
}

function renderMarkdown(
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
