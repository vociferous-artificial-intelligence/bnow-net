"use server";

import { requireAcceptedUser } from "@/lib/gate";
import { askWithLimits } from "@/lib/ask/limits";
import { rawSql } from "@/db";
import type { AskResultLike, ResolvedClaim } from "./ask-result";

// Money-path entry point (OPEN-TASKS #48 + the architecture fix it sits on top of):
// GET /ask?q=... only ever prefills the form (see page.tsx) — the paid pipeline runs
// ONLY from this action, which fires on explicit form submission via useActionState.
// Actions are their own HTTP entry points, so auth is re-checked HERE, not just in the
// page render that happened to render the form.

export interface AskActionState {
  question: string;
  result: AskResultLike;
  cited: ResolvedClaim[];
  related: ResolvedClaim[];
}

export async function askAction(
  prevState: AskActionState | null,
  formData: FormData,
): Promise<AskActionState | null> {
  const user = await requireAcceptedUser(); // gated: subscriber tool, requires acceptance too
  const question = String(formData.get("question") ?? "").trim().slice(0, 400);
  // Too short to be a real question: return the previous state unchanged — no
  // pipeline call, no charge, no error page (mirrors the API route's floor).
  if (question.length < 3) return prevState;

  const result = await askWithLimits(question, user?.email ?? null);

  // resolve cited + related claim ids → source links for click-through. One query for
  // the union of both id sets (relatedClaimIds is a v2-only field, absent on the
  // legacy shape — defensive ?? [] per the frozen contract, src/lib/ask/types.ts).
  let cited: ResolvedClaim[] = [];
  let related: ResolvedClaim[] = [];
  const relatedIds = (result as AskResultLike).relatedClaimIds ?? [];
  const allIds = [...new Set([...result.citedClaimIds, ...relatedIds])];
  if (allIds.length > 0) {
    const rows = (await rawSql.query(
      `SELECT cl.id, cl.text, c.iso2, cl.claim_date::text AS date
       FROM claims cl JOIN countries c ON c.id = cl.country_id
       WHERE cl.id = ANY($1::int[])`,
      [allIds],
    )) as ResolvedClaim[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    cited = result.citedClaimIds
      .map((id) => byId.get(id))
      .filter((c): c is ResolvedClaim => !!c);
    related = relatedIds.map((id) => byId.get(id)).filter((c): c is ResolvedClaim => !!c);
  }

  return { question, result, cited, related };
}
