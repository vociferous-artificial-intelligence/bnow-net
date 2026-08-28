// One-shot home -> /ask handoff. The signed-in home Ask box stores the exact
// submitted question under a per-submission key, then navigates to
// /ask?q=...&intent=<id>. /ask consumes that intent ONCE on mount and presses its
// own submit button.
//
// The money rule (OPEN-TASKS #48) is unchanged and load-bearing here: rendering a
// GET /ask — with or without ?intent= — is still free and side-effect-free. The
// intent is only a client-side note that the user already clicked Ask; the paid
// pipeline still runs solely from askAction, fired by the real form submission.
// A shared, replayed, refreshed, or prefetched URL therefore cannot execute:
// sessionStorage is same-tab, the entry is single-use, and the stored question
// must match ?q= exactly.
//
// Shared by a server component (page.tsx bounds ?intent=) and two client
// components (the home box writes, AskForm consumes), so this module stays free of
// both "use server" and "use client".

import { wellFormedSlice } from "@/lib/text/well-formed-slice";

export const ASK_QUESTION_MIN = 3;
export const ASK_QUESTION_MAX = 400;

export const ASK_INTENT_KEY_PREFIX = "bnow.ask.intent:";

// crypto.randomUUID()'s exact shape. Bounding ?intent= against this keeps an
// attacker-supplied value from naming anything outside our own namespaced keys —
// and an intent that names no stored entry simply leaves the form idle.
const INTENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Bounds an untrusted ?intent= (string | string[] | undefined from searchParams). */
export function isAskIntentId(value: unknown): value is string {
  return typeof value === "string" && INTENT_ID_RE.test(value);
}

export function askIntentStorageKey(intent: string): string {
  return `${ASK_INTENT_KEY_PREFIX}${intent}`;
}

/**
 * Drops every intent this tab is still holding. Normally there are none — /ask
 * consumes the entry on arrival — but a click whose /ask never mounted leaves one
 * orphaned (the acceptance gate redirecting to /welcome/legal on a Terms bump is the
 * realistic case). Those carry the user's question text, so the writer prunes the
 * namespace before each new handoff: at most one intent is ever in flight, and a
 * swallowed click's question does not outlive the next one.
 *
 * Caller owns the try/catch — a throwing storage means the handoff is off anyway.
 */
export function clearAskIntents(storage: Storage): void {
  // Object.keys snapshots, so removing while iterating is safe here.
  for (const key of Object.keys(storage)) {
    if (key.startsWith(ASK_INTENT_KEY_PREFIX)) storage.removeItem(key);
  }
}

/** THE Ask question normalization — one pure function shared by every client
 *  and server boundary (askAction, the JSON + progressive API routes, the
 *  ask-form progressive submit, the /ask?q= prefill, and the home box), so the
 *  stored intent question and ?q= can be compared for exact equality on the
 *  other side of the navigation.
 *
 *  Trim exactly as before, cap at the historical ASK_QUESTION_MAX UTF-16
 *  code units — but through wellFormedSlice (#97): an astral pair straddling
 *  the cap loses its orphaned half instead of emitting an isolated surrogate,
 *  which the provider's strict JSON parser rejects with a request-killing 400
 *  (and which makes encodeURIComponent throw in the home handoff). Already
 *  well-formed input in the limit is returned byte-identical. */
export function normalizeAskQuestion(raw: string): string {
  return wellFormedSlice(raw.trim(), ASK_QUESTION_MAX);
}
