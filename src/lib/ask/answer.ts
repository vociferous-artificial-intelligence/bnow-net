import OpenAI from "openai";
import { retrieve, type RetrievalResult } from "./retrieve";

// Answer a natural-language question strictly from retrieved BNOW data. The LLM may
// only use the provided evidence and must cite claim ids; if evidence is thin it says
// so rather than inventing. Same traceability ethos as digests.

export interface AskAnswer {
  answer: string;
  citedClaimIds: number[];
  evidenceCount: number;
  terms: string[];
  provider: string;
}

const SYSTEM = `You answer questions about geopolitical/OSINT intelligence STRICTLY from the provided evidence rows (claims + entities from the BNOW database). Rules:
1. Use ONLY the evidence provided. Never use outside knowledge or invent facts.
2. Cite the claim ids you rely on inline as [c<ID>] (e.g. [c1438]). Every factual sentence needs a citation.
3. If the evidence is insufficient to answer, say so plainly and suggest a narrower question. Do not speculate.
4. Be concise (<= 180 words). Note hedging where relevant ("reportedly", "unverified").
5. These are open-source-derived claims of varying reliability, not confirmed truth — reflect that.`;

function evidenceBlock(r: RetrievalResult): string {
  const claims = r.claims
    .map(
      (c) =>
        `[c${c.claimId}] (${c.countryIso2}/${c.track ?? "-"}, ${c.claimDate ?? "undated"}, ${c.hedging}${c.entities.length ? `, entities: ${c.entities.slice(0, 4).join(", ")}` : ""}) ${c.text}`,
    )
    .join("\n");
  const ents = r.entities
    .map((e) => `[e${e.entityId}] ${e.name} (${e.kind}${e.sanctioned ? ", SANCTIONED" : ""}, pressure ${e.pressure})`)
    .join("\n");
  return `CLAIMS:\n${claims || "(none)"}\n\nENTITIES:\n${ents || "(none)"}`;
}

export async function ask(question: string): Promise<AskAnswer> {
  const r = await retrieve(question, { limit: 40 });
  const evidenceCount = r.claims.length + r.entities.length;

  if (evidenceCount === 0) {
    return {
      answer:
        "No matching evidence in the current dataset. Try a narrower question naming a country, person, organization, or event type we cover (Russia/Ukraine/Iran; prosecutions, strikes, sanctions, trade).",
      citedClaimIds: [], evidenceCount: 0, terms: r.terms, provider: "none",
    };
  }

  if (!process.env.OPENAI_API_KEY || process.env.ANALYSIS_PROVIDER === "stub") {
    // deterministic fallback: surface the top matching claims verbatim, cited
    const top = r.claims.slice(0, 6);
    const answer =
      top.length > 0
        ? "Top matching evidence:\n" + top.map((c) => `• ${c.text} [c${c.claimId}]`).join("\n")
        : "Matched entities: " + r.entities.map((e) => e.name).join(", ");
    return {
      answer, citedClaimIds: top.map((c) => c.claimId), evidenceCount, terms: r.terms, provider: "stub",
    };
  }

  const client = new OpenAI();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Question: ${question}\n\nEvidence:\n${evidenceBlock(r)}` },
      ],
      temperature: 0.1,
    });
    const answer = completion.choices[0]?.message?.content ?? "(no answer)";
    const cited = [...answer.matchAll(/\[c(\d+)\]/g)].map((m) => parseInt(m[1], 10));
    // keep only citations that were actually in the evidence set (anti-fabrication)
    const validIds = new Set(r.claims.map((c) => c.claimId));
    return {
      answer,
      citedClaimIds: [...new Set(cited)].filter((id) => validIds.has(id)),
      evidenceCount, terms: r.terms, provider: `openai:${model}`,
    };
  } catch (e) {
    return {
      answer: `Query failed: ${e instanceof Error ? e.message : e}. Evidence was retrieved; try again.`,
      citedClaimIds: [], evidenceCount, terms: r.terms, provider: "error",
    };
  }
}
