import { NextRequest, NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";
import OpenAI from "openai";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

// LLM-assisted entity-graph audit (canonicalization pass b). PROPOSES deletes and
// merges for entities the deterministic rules (src/lib/entities/canonicalize.ts)
// can't decide — transliteration variants, obscure orgs, off-topic actors. It
// NEVER applies changes: the response is saved to a reviewable JSONL and applied
// with scripts/entities-cleanup.ts --file <reviewed.jsonl> after a human look.
// Runs on Vercel because the build host has no OpenAI egress.

interface Proposal {
  action: "delete" | "merge";
  id: number;
  name?: string;
  intoId?: number;
  intoName?: string;
  reason: string;
}

const SYSTEM = `You curate an entity graph for an OSINT conflict/elite-politics tracker. Entities must be specific, trackable real-world actors: named people, agencies, companies, organizations, armed factions/parties.

Given the entity list (id, kind, name, claims = evidence count, sample claim text), propose corrections as JSON {"proposals":[{"action":"delete"|"merge","id":<id>,"intoId":<id if merge>,"reason":"<short>"}]}.

DELETE only when clearly:
- a collective/non-specific actor ("protesters", "local residents")
- geography posing as an actor (a city/country with no institutional sense)
- an object, weapon system, disease, weather event, or abstract concept
- a person/org with zero plausible relevance to conflict, sanctions, elite politics, or security (e.g. sports/entertainment figures in stray claims)

MERGE only when two ids are clearly the SAME real-world actor (spelling/transliteration variants, abbreviation vs full name). intoId = the better-evidenced or better-named one.

Be conservative: when unsure, propose nothing for that entity. Do not invent ids.`;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "no OPENAI_API_KEY; audit needs the LLM" }, { status: 503 });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.kind, e.name, count(ce.claim_id)::int AS claims,
              (SELECT cl.text FROM claim_entities ce2 JOIN claims cl ON cl.id = ce2.claim_id
               WHERE ce2.entity_id = e.id ORDER BY cl.id DESC LIMIT 1) AS sample
       FROM entities e LEFT JOIN claim_entities ce ON ce.entity_id = e.id
       GROUP BY e.id ORDER BY e.id`,
    );

    const listing = rows
      .map(
        (r) =>
          `${r.id} | ${r.kind} | ${r.name} | claims=${r.claims}${r.sample ? ` | e.g. "${String(r.sample).slice(0, 120)}"` : ""}`,
      )
      .join("\n");

    const client = new OpenAI();
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Entities:\n${listing}` },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let proposals: Proposal[] = [];
    try {
      proposals = (JSON.parse(raw).proposals ?? []) as Proposal[];
    } catch {
      return NextResponse.json({ error: "unparseable LLM output", raw }, { status: 502 });
    }

    // validate ids; attach names for reviewability
    const byId = new Map(rows.map((r) => [r.id, r]));
    const valid = proposals
      .filter((p) => byId.has(p.id) && (p.action === "delete" || byId.has(p.intoId ?? -1)))
      .map((p) => ({
        ...p,
        name: byId.get(p.id)!.name,
        intoName: p.intoId ? byId.get(p.intoId)!.name : undefined,
      }));

    return NextResponse.json({
      ok: true,
      model,
      entities: rows.length,
      proposals: valid,
      note: "review, save as JSONL, apply with scripts/entities-cleanup.ts --file <path>",
    });
  } finally {
    await pool.end();
  }
}
