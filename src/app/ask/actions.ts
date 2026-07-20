"use server";

import { requireAcceptedUser } from "@/lib/gate";
import { askWithLimits, recordEntryTimings } from "@/lib/ask/limits";
import { clampMs, monotonicMs } from "@/lib/ask/timings";
import { hydrateResultClaims } from "@/lib/ask/hydrate";
import type { AskResultLike, ResolvedClaim } from "./ask-result";

// Money-path entry point (OPEN-TASKS #48 + the architecture fix it sits on top of):
// GET /ask?q=... only ever prefills the form (see page.tsx) — the paid pipeline runs
// ONLY from this action, which fires on explicit form submission via useActionState.
// Actions are their own HTTP entry points, so auth is re-checked HERE, not just in the
// page render that happened to render the form.

export interface AskActionState {
  analyticsCompletionKey: string;
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

  // Phase 1 idempotency: a per-submit-gesture opaque key from the form (the
  // one-click home intent reuses its intent UUID). Namespaced per-user
  // server-side, so any well-formed token is safe; malformed/absent -> undefined
  // and askWithLimits generates a never-replaying key. Bounded charset+length.
  const rawKey = String(formData.get("idempotencyKey") ?? "");
  const idempotencyKey = /^[A-Za-z0-9_-]{8,128}$/.test(rawKey) ? rawKey : undefined;

  // Phase 0 measurement: this action owns the run's hydrateMs + totalMs (the
  // user-felt web total). Monotonic clock only — never wall-clock subtraction.
  const tAction = monotonicMs();
  const result = await askWithLimits(question, user?.email ?? null, { idempotencyKey });

  // Resolve cited + related claim ids, owning digests, and every attached source
  // document. This stays ONE query for the union: joining claim_sources repeats
  // claim columns, so group in memory before restoring the model's order below.
  // the union of both id sets (relatedClaimIds is a v2-only field, absent on the
  // legacy shape — defensive ?? [] per the frozen contract, src/lib/ask/types.ts).
  // Phase 2 extraction: the union hydration query lives in src/lib/ask/hydrate.ts,
  // shared verbatim with the progressive result endpoint so the two render paths
  // cannot drift.
  const tHydrateStart = monotonicMs();
  const { cited, related } = await hydrateResultClaims(result);

  // Patch THIS run's row (matched by run_id) with the action-scope timings.
  // runId is present only when a persistent record exists; a REPLAYED payload's
  // runId names the ORIGINAL run, whose timings must not be overwritten by the
  // replay gesture (Gate 1). Awaited so a serverless response can't cut the
  // write; recordEntryTimings itself is fail-soft and never throws.
  if (result.runId && !result.replayed) {
    const end = monotonicMs();
    await recordEntryTimings(result.runId, {
      hydrateMs: clampMs(end - tHydrateStart),
      totalMs: clampMs(end - tAction),
    });
  }

  return { analyticsCompletionKey: crypto.randomUUID(), question, result, cited, related };
}
