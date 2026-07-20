// AI Search Phase 6: scoped investigation sessions (§7) — a session is a
// BOUNDED INVESTIGATION over declared evidence, not a transcript. Its
// continuity unit is the EvidenceSnapshot each run froze; follow-ups answer
// from the CURRENT snapshot by default ("Ask within this evidence"), and
// "Search wider" is an explicit new-retrieval turn that freezes a NEW
// snapshot. Everything here is flag-gated (ASK_SESSIONS, default OFF) and NO
// UI ships in this phase: rollout is blocked on the operator retention
// decision (§7.7 / registers #13/#30) — delete/export ownership lands FIRST,
// per the master prompt.

import { Pool } from "@neondatabase/serverless";
import { askWithLimits } from "./limits";
import type { AskAnswerV2 } from "./types";
import type { EvidenceSnapshot } from "./events";

/** Hard cap on turns per session (§7.5) — beyond it, start a new investigation. */
export const MAX_SESSION_TURNS = 20;
/** Idle TTL after which a session is no longer "active" for follow-ups. */
export const SESSION_IDLE_TTL_MS = 24 * 60 * 60 * 1000;

export function askSessionsEnabled(): boolean {
  return process.env.ASK_SESSIONS === "1";
}

export type FollowupScope = "reuse" | "expand" | "new";

// ---- scope classifier (pure; SUGGESTS a default — the user always wins) ---------

const MONTHS =
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
const DATEISH = /\b\d{4}-\d{2}-\d{2}\b|\b(?:yesterday|today|last week|this week|past \d+ days?)\b/i;
const THEATER_WORDS: Record<string, RegExp> = {
  ru: /\brussia|russian\b/i,
  ua: /\bukraine|ukrainian\b/i,
  ir: /\biran|iranian\b/i,
  il: /\bisrael|israeli\b/i,
};

/** Deterministic scope suggestion (§7.3): a follow-up that introduces a
 *  theater, a date/window, or a capitalized entity ABSENT from the snapshot
 *  suggests wider retrieval; otherwise reuse. Never an LLM call; never
 *  overrides the user's explicit choice. */
export function classifyFollowup(
  question: string,
  snapshot: EvidenceSnapshot,
): { suggested: FollowupScope; reason: string } {
  const snapText = snapshot.candidates.map((c) => c.text).join("\n").toLowerCase();
  const snapIsos = new Set(snapshot.candidates.map((c) => c.countryIso2));

  for (const [iso, re] of Object.entries(THEATER_WORDS)) {
    if (re.test(question) && !snapIsos.has(iso)) {
      return { suggested: "new", reason: `theater_${iso}_absent` };
    }
  }
  if (MONTHS.test(question) || DATEISH.test(question)) {
    // a dated follow-up may fall outside the frozen window — suggest expansion
    return { suggested: "expand", reason: "temporal_reference" };
  }
  const caps = question.match(/\b[A-Z][a-z][\p{L}'’-]+(?: [A-Z][\p{L}'’-]+)?\b/gu) ?? [];
  const novel = caps.filter(
    (c) => !["What", "Which", "Who", "When", "Where", "How", "Why", "Did", "Is", "Are", "The"].includes(c.split(" ")[0]) &&
      !snapText.includes(c.toLowerCase()),
  );
  if (novel.length > 0) return { suggested: "expand", reason: "novel_entity" };
  return { suggested: "reuse", reason: "within_snapshot" };
}

// ---- deterministic history compaction (§7.5) ------------------------------------

export interface TurnSummaryInput {
  seq: number;
  question: string;
  state: string;
  citedClaimIds: number[];
  /** the most recent turn may carry its answer text verbatim (budgeted) */
  answer?: string;
}

/** Bounded deterministic history block: per prior turn one structured line
 *  (question + state + cited ids); ONLY the most recent turn's answer text may
 *  appear verbatim, truncated to the char budget. Input tokens stay roughly
 *  flat per turn instead of quadratic. */
export function compactHistory(turns: TurnSummaryInput[], answerCharBudget = 1200): string {
  if (turns.length === 0) return "";
  const lines: string[] = [];
  for (const t of turns) {
    lines.push(
      `T${t.seq}: Q: ${t.question.slice(0, 200)} → ${t.state}` +
        (t.citedClaimIds.length > 0 ? ` [cited: ${t.citedClaimIds.slice(0, 20).join(",")}]` : ""),
    );
  }
  const last = turns[turns.length - 1];
  if (last.answer) {
    lines.push(`T${last.seq} answer: ${last.answer.slice(0, answerCharBudget)}`);
  }
  return lines.join("\n");
}

// ---- session/turn lifecycle (owner-gated; fail-closed reads) --------------------

export interface AskSession {
  id: string;
  userEmail: string;
  title: string;
  status: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface AskTurn {
  seq: number;
  runId: string;
  scope: FollowupScope;
  createdAt: string;
}

function pool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export async function createSession(userEmail: string, title: string): Promise<AskSession> {
  const p = pool();
  try {
    const { rows } = await p.query(
      `INSERT INTO ask_sessions (user_email, title) VALUES ($1, $2)
       RETURNING id, user_email, title, status, created_at::text AS created_at, last_active_at::text AS last_active_at`,
      [userEmail, title.slice(0, 200)],
    );
    const r = rows[0] as Record<string, string>;
    return {
      id: r.id, userEmail: r.user_email, title: r.title, status: r.status,
      createdAt: r.created_at, lastActiveAt: r.last_active_at,
    };
  } finally {
    await p.end();
  }
}

/** Owner-gated read: another user's session id behaves as nonexistent. */
export async function getSession(id: string, userEmail: string): Promise<AskSession | null> {
  const p = pool();
  try {
    const { rows } = await p.query(
      `SELECT id, user_email, title, status, created_at::text AS created_at, last_active_at::text AS last_active_at
       FROM ask_sessions WHERE id = $1 AND user_email = $2`,
      [id, userEmail],
    );
    const r = rows[0] as Record<string, string> | undefined;
    if (!r) return null;
    return {
      id: r.id, userEmail: r.user_email, title: r.title, status: r.status,
      createdAt: r.created_at, lastActiveAt: r.last_active_at,
    };
  } finally {
    await p.end();
  }
}

export async function listTurns(sessionId: string, userEmail: string): Promise<AskTurn[]> {
  const p = pool();
  try {
    const { rows } = await p.query(
      `SELECT t.seq, t.run_id, t.scope, t.created_at::text AS created_at
       FROM ask_turns t JOIN ask_sessions s ON s.id = t.session_id
       WHERE t.session_id = $1 AND s.user_email = $2 ORDER BY t.seq`,
      [sessionId, userEmail],
    );
    return (rows as Array<Record<string, string>>).map((r) => ({
      seq: Number(r.seq), runId: r.run_id, scope: r.scope as FollowupScope, createdAt: r.created_at,
    }));
  } finally {
    await p.end();
  }
}

/** Append a turn (owner-gated via the session row; unique (session, seq) makes
 *  concurrent appends lose-exactly-one). Refuses past MAX_SESSION_TURNS and on
 *  ended/idle sessions — a capped session needs an explicit new investigation. */
export async function appendTurn(opts: {
  sessionId: string;
  userEmail: string;
  runId: string;
  scope: FollowupScope;
}): Promise<{ ok: true; seq: number } | { ok: false; reason: "not_found" | "ended" | "idle" | "turn_cap" }> {
  const p = pool();
  try {
    const { rows } = await p.query(
      `SELECT status, last_active_at, (SELECT coalesce(max(seq), 0) FROM ask_turns WHERE session_id = $1) AS max_seq
       FROM ask_sessions WHERE id = $1 AND user_email = $2`,
      [opts.sessionId, opts.userEmail],
    );
    const r = rows[0] as { status: string; last_active_at: string; max_seq: number } | undefined;
    if (!r) return { ok: false, reason: "not_found" };
    if (r.status !== "active") return { ok: false, reason: "ended" };
    if (Date.now() - new Date(r.last_active_at).getTime() > SESSION_IDLE_TTL_MS) {
      return { ok: false, reason: "idle" };
    }
    const seq = Number(r.max_seq) + 1;
    if (seq > MAX_SESSION_TURNS) return { ok: false, reason: "turn_cap" };
    await p.query(
      `INSERT INTO ask_turns (session_id, seq, run_id, scope) VALUES ($1, $2, $3, $4)`,
      [opts.sessionId, seq, opts.runId, opts.scope],
    );
    await p.query(`UPDATE ask_sessions SET last_active_at = now() WHERE id = $1`, [opts.sessionId]);
    return { ok: true, seq };
  } finally {
    await p.end();
  }
}

/** Owner-only DELETE (§7.7): removes the session, its turns, and the CONTENT
 *  of the linked runs (result + question + snapshot nulled) while the run and
 *  ask_usage rows persist as accounting records. Registered residual: an
 *  idempotency-key replay of a content-deleted run returns the honest
 *  expired-run copy (result is gone). */
export async function deleteSession(
  id: string,
  userEmail: string,
): Promise<{ deleted: boolean; turnsRemoved: number }> {
  const p = pool();
  try {
    const { rows } = await p.query(
      `SELECT 1 FROM ask_sessions WHERE id = $1 AND user_email = $2`,
      [id, userEmail],
    );
    if (rows.length === 0) return { deleted: false, turnsRemoved: 0 };
    // content removal on the runs this session owns (ownership double-checked)
    await p.query(
      `UPDATE ask_runs SET result = NULL, question = '[deleted]', evidence_snapshot = NULL
       WHERE user_email = $2 AND id IN (SELECT run_id FROM ask_turns WHERE session_id = $1)`,
      [id, userEmail],
    );
    const del = await p.query(`DELETE FROM ask_turns WHERE session_id = $1`, [id]);
    await p.query(`DELETE FROM ask_sessions WHERE id = $1 AND user_email = $2`, [id, userEmail]);
    return { deleted: true, turnsRemoved: del.rowCount ?? 0 };
  } finally {
    await p.end();
  }
}

export interface SessionExport {
  session: AskSession;
  turns: Array<{
    seq: number;
    scope: FollowupScope;
    question: string | null;
    state: string | null;
    result: AskAnswerV2 | null;
    snapshot: EvidenceSnapshot | null;
  }>;
}

/** Start a session from an EXISTING completed run the user owns (the run must
 *  carry a frozen snapshot — the session's continuity unit). Turn 1 = that
 *  run, scope "new". */
export async function startSessionFromRun(opts: {
  userEmail: string;
  runId: string;
  title: string;
}): Promise<{ ok: true; session: AskSession } | { ok: false; reason: "not_found" | "no_snapshot" | "flag_off" }> {
  if (!askSessionsEnabled()) return { ok: false, reason: "flag_off" };
  const p = pool();
  try {
    const { rows } = await p.query(
      `SELECT evidence_snapshot, question FROM ask_runs WHERE id = $1 AND user_email = $2 AND finished_at IS NOT NULL`,
      [opts.runId, opts.userEmail],
    );
    const r = rows[0] as { evidence_snapshot: EvidenceSnapshot | null; question: string } | undefined;
    if (!r) return { ok: false, reason: "not_found" };
    if (!r.evidence_snapshot) return { ok: false, reason: "no_snapshot" };
  } finally {
    await p.end();
  }
  const session = await createSession(opts.userEmail, opts.title);
  await appendTurn({ sessionId: session.id, userEmail: opts.userEmail, runId: opts.runId, scope: "new" });
  return { ok: true, session };
}

/** Load the session's CURRENT snapshot: the latest turn's run that has one. */
export async function latestSnapshot(
  sessionId: string,
  userEmail: string,
): Promise<EvidenceSnapshot | null> {
  const p = pool();
  try {
    const { rows } = await p.query(
      `SELECT r.evidence_snapshot
       FROM ask_turns t
       JOIN ask_sessions s ON s.id = t.session_id AND s.user_email = $2
       JOIN ask_runs r ON r.id = t.run_id AND r.user_email = $2
       WHERE t.session_id = $1 AND r.evidence_snapshot IS NOT NULL
       ORDER BY t.seq DESC LIMIT 1`,
      [sessionId, userEmail],
    );
    return (rows[0] as { evidence_snapshot: EvidenceSnapshot } | undefined)?.evidence_snapshot ?? null;
  } finally {
    await p.end();
  }
}

/** One REUSE follow-up turn: answer the question from the session's frozen
 *  snapshot — ZERO retrieval/embed calls by construction (ask()'s reuse branch
 *  never invokes those stages); the generation is metered through the normal
 *  guarded money path (askWithLimits: allowance, idempotency, reservations).
 *  The classifier's suggestion is RETURNED, never enforced (§7.3 — the user's
 *  explicit choice always wins; expand/new turns run the normal pipeline via
 *  the ordinary entry points and freeze a NEW snapshot). */
export async function runReuseFollowupTurn(opts: {
  sessionId: string;
  userEmail: string;
  question: string;
  idempotencyKey?: string;
}): Promise<
  | { ok: true; seq: number; result: AskAnswerV2; suggested: FollowupScope; suggestedReason: string }
  | { ok: false; reason: "flag_off" | "not_found" | "no_snapshot" | "ended" | "idle" | "turn_cap" }
> {
  if (!askSessionsEnabled()) return { ok: false, reason: "flag_off" };
  const session = await getSession(opts.sessionId, opts.userEmail);
  if (!session) return { ok: false, reason: "not_found" };
  const snapshot = await latestSnapshot(opts.sessionId, opts.userEmail);
  if (!snapshot) return { ok: false, reason: "no_snapshot" };

  // compacted deterministic history (§7.5) from the prior turns' runs
  const turns = await listTurns(opts.sessionId, opts.userEmail);
  const historyBlock = await buildHistoryBlock(opts.sessionId, opts.userEmail);
  const { suggested, reason: suggestedReason } = classifyFollowup(opts.question, snapshot);

  const result = await askWithLimits(opts.question, opts.userEmail, {
    idempotencyKey: opts.idempotencyKey,
    sessionReuse: { snapshot, historyBlock },
  });
  // Only runs that persisted (runId present) become turns; refusals without a
  // run identity (limit/gate-unavailable in shadow) do not consume a turn.
  if (!result.runId || result.replayed) {
    return { ok: true, seq: turns.length, result, suggested, suggestedReason };
  }
  const appended = await appendTurn({
    sessionId: opts.sessionId,
    userEmail: opts.userEmail,
    runId: result.runId,
    scope: "reuse",
  });
  if (!appended.ok) return { ok: false, reason: appended.reason };
  return { ok: true, seq: appended.seq, result, suggested, suggestedReason };
}

/** The compacted prior-turn context for the next generation call. */
export async function buildHistoryBlock(sessionId: string, userEmail: string): Promise<string> {
  const p = pool();
  try {
    const { rows } = await p.query(
      `SELECT t.seq, r.question, r.state, r.result
       FROM ask_turns t
       JOIN ask_sessions s ON s.id = t.session_id AND s.user_email = $2
       JOIN ask_runs r ON r.id = t.run_id AND r.user_email = $2
       WHERE t.session_id = $1 ORDER BY t.seq`,
      [sessionId, userEmail],
    );
    const inputs: TurnSummaryInput[] = (rows as Array<Record<string, unknown>>).map((r, i, all) => {
      const result = r.result as AskAnswerV2 | null;
      return {
        seq: Number(r.seq),
        question: (r.question as string) ?? "",
        state: (r.state as string) ?? "unknown",
        citedClaimIds: result?.citedClaimIds ?? [],
        ...(i === all.length - 1 && result?.answer ? { answer: result.answer } : {}),
      };
    });
    return compactHistory(inputs);
  } finally {
    await p.end();
  }
}

/** Owner-only EXPORT (§7.7): the account owner's own investigation, turns in
 *  order with each run's question/result/snapshot. Nonexistent/foreign → null. */
export async function exportSession(id: string, userEmail: string): Promise<SessionExport | null> {
  const session = await getSession(id, userEmail);
  if (!session) return null;
  const p = pool();
  try {
    const { rows } = await p.query(
      `SELECT t.seq, t.scope, r.question, r.state, r.result, r.evidence_snapshot
       FROM ask_turns t
       JOIN ask_runs r ON r.id = t.run_id AND r.user_email = $2
       WHERE t.session_id = $1 ORDER BY t.seq`,
      [id, userEmail],
    );
    return {
      session,
      turns: (rows as Array<Record<string, unknown>>).map((r) => ({
        seq: Number(r.seq),
        scope: r.scope as FollowupScope,
        question: (r.question as string) ?? null,
        state: (r.state as string) ?? null,
        result: (r.result as AskAnswerV2) ?? null,
        snapshot: (r.evidence_snapshot as EvidenceSnapshot) ?? null,
      })),
    };
  } finally {
    await p.end();
  }
}
