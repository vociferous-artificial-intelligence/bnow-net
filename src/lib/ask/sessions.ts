// AI Search Phase 6: scoped investigation sessions (§7) — a session is a
// BOUNDED INVESTIGATION over declared evidence, not a transcript. Its
// continuity unit is the EvidenceSnapshot each run froze; follow-ups answer
// from the CURRENT snapshot by default ("Ask within this evidence"), and
// "Search wider" is an explicit new-retrieval turn that freezes a NEW
// snapshot. Everything here is flag-gated (ASK_SESSIONS, default OFF) and NO
// UI ships in this phase: rollout is blocked on the operator retention
// decision (§7.7 / registers #13/#30) — delete/export ownership lands FIRST,
// per the master prompt.

import { Pool, type PoolClient } from "@neondatabase/serverless";
import { askWithLimits } from "./limits";
import { askPipeline } from "./config";
import { effectiveAskFeatures } from "./features";
import type { AskAnswerV2 } from "./types";
import type { EvidenceSnapshot } from "./events";

/** Hard cap on turns per session (§7.5) — beyond it, start a new investigation. */
export const MAX_SESSION_TURNS = 20;
/** Idle TTL after which a session is no longer "active" for follow-ups. */
export const SESSION_IDLE_TTL_MS = 24 * 60 * 60 * 1000;

/** Sessions are effective only through the feature resolver (release
 *  hardening): ASK_SESSIONS=1 alone is NOT sufficient — enforce mode and
 *  valid retention settings are prerequisites (features.ts). */
export function askSessionsEnabled(): boolean {
  return effectiveAskFeatures().sessions;
}

export type FollowupScope = "reuse" | "expand" | "new";

// ---- scope classifier (pure; SUGGESTS a default — the user always wins) ---------

// bare "may" is usually the modal verb — require month context (Gate 6)
const MONTHS =
  /\b(?:january|february|march|april|june|july|august|september|october|november|december)\b|\b(?:in|last|this|early|late|since|during|until|through)\s+may\b/i;
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
  const LEAD_STOPWORDS = new Set([
    "What", "Which", "Who", "When", "Where", "How", "Why",
    "Did", "Does", "Has", "Have", "Was", "Were", "Is", "Are", "The", "Can", "Could", "Would",
  ]);
  const caps = question.match(/\b[A-Z][a-z][\p{L}'’-]+(?: [A-Z][\p{L}'’-]+)?\b/gu) ?? [];
  const candidates: string[] = [];
  for (const c of caps) {
    const [first, ...rest] = c.split(" ");
    if (!LEAD_STOPWORDS.has(first)) {
      candidates.push(c);
    } else if (rest.length > 0) {
      // "Did Putin respond?" — retest the swallowed second token (Gate 6)
      candidates.push(rest.join(" "));
    }
  }
  const novel = candidates.filter((c) => !snapText.includes(c.toLowerCase()));
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

/** One interactive transaction (release hardening): session mutations that
 *  touch multiple rows commit or roll back TOGETHER — no partial deletions,
 *  no orphan sessions, no turn without its last_active_at bump. */
async function withTxn<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const p = pool();
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    c.release();
    await p.end();
  }
}

function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("duplicate key") || msg.includes("23505");
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

export type AppendRefusal =
  | "not_found"
  | "ended"
  | "idle"
  | "turn_cap"
  | "run_ineligible"
  | "race";

/** Append a turn. Owner-gated via the session row AND the run row (Gate 6:
 *  a run must belong to the same owner AND carry a frozen snapshot — a
 *  snapshotless turn would silently regress the session's scope to an older
 *  snapshot). Refuses past MAX_SESSION_TURNS and on ended/idle sessions.
 *
 *  ATOMIC + concurrency-safe (release hardening): validation, the seq-
 *  computing INSERT (cap enforced in its HAVING), and the last_active_at
 *  bump run in ONE transaction; `FOR UPDATE` on the session row serializes
 *  concurrent appends to the same session, so distinct turns get distinct
 *  seqs and the bump can never be lost or orphaned. A duplicate run_id
 *  (unique constraint) still loses as a TYPED "race" refusal, never a raw
 *  driver throw after a paid call. */
export async function appendTurn(opts: {
  sessionId: string;
  userEmail: string;
  runId: string;
  scope: FollowupScope;
}): Promise<{ ok: true; seq: number } | { ok: false; reason: AppendRefusal }> {
  try {
    return await withTxn(async (c) => {
      const { rows } = await c.query(
        `SELECT status, last_active_at,
                EXISTS (SELECT 1 FROM ask_runs WHERE id = $3 AND user_email = $2 AND evidence_snapshot IS NOT NULL) AS run_ok
         FROM ask_sessions WHERE id = $1 AND user_email = $2 FOR UPDATE`,
        [opts.sessionId, opts.userEmail, opts.runId],
      );
      const r = rows[0] as { status: string; last_active_at: string; run_ok: boolean } | undefined;
      if (!r) return { ok: false as const, reason: "not_found" as const };
      if (r.status !== "active") return { ok: false as const, reason: "ended" as const };
      if (Date.now() - new Date(r.last_active_at).getTime() > SESSION_IDLE_TTL_MS) {
        return { ok: false as const, reason: "idle" as const };
      }
      if (!r.run_ok) return { ok: false as const, reason: "run_ineligible" as const };
      const ins = await c.query(
        `INSERT INTO ask_turns (session_id, seq, run_id, scope)
         SELECT $1, coalesce(max(seq), 0) + 1, $2, $3
         FROM ask_turns WHERE session_id = $1
         HAVING coalesce(max(seq), 0) < $4
         RETURNING seq`,
        [opts.sessionId, opts.runId, opts.scope, MAX_SESSION_TURNS],
      );
      if ((ins.rows?.length ?? 0) === 0) return { ok: false as const, reason: "turn_cap" as const };
      await c.query(`UPDATE ask_sessions SET last_active_at = now() WHERE id = $1`, [opts.sessionId]);
      return { ok: true as const, seq: Number((ins.rows[0] as { seq: number }).seq) };
    });
  } catch (e) {
    // unique (run_id) — the run already IS a turn somewhere — or an exotic
    // (session_id, seq) collision despite the lock: the concurrent loser.
    if (isUniqueViolation(e)) return { ok: false, reason: "race" };
    throw e;
  }
}

/** Owner-only DELETE (§7.7): CONTENT removal across EVERY table that holds it
 *  (Gate 6 high finding — the first cut missed three side tables):
 *  - ask_run_events rows for the session's runs (claim texts + streamed
 *    answer sections live in event payloads) are DELETED;
 *  - the owner's ask_answer_cache rows for those runs' questions are DELETED
 *    (they store question + result + snapshot);
 *  - ask_usage.question is redacted for those runs (the cost/token columns —
 *    the actual accounting — are retained);
 *  - the run rows' question/result/snapshot are nulled; the run + usage rows
 *    themselves persist as accounting records.
 *  Registered residual: an idempotency-key replay of a content-deleted run
 *  returns the dedicated deleted-content copy (see limits.ts). */
export async function deleteSession(
  id: string,
  userEmail: string,
): Promise<{ deleted: boolean; turnsRemoved: number }> {
  // ONE transaction (release hardening): either EVERY content surface is
  // removed/redacted and the session+turns die, or nothing changes — a §7.7
  // delete can never leave a partially-scrubbed session behind.
  return await withTxn(async (c) => {
    const { rows } = await c.query(
      `SELECT 1 FROM ask_sessions WHERE id = $1 AND user_email = $2 FOR UPDATE`,
      [id, userEmail],
    );
    if (rows.length === 0) return { deleted: false, turnsRemoved: 0 };
    // event payloads carry claim text + streamed answer prose
    await c.query(
      `DELETE FROM ask_run_events WHERE run_id IN (
         SELECT t.run_id FROM ask_turns t JOIN ask_runs r ON r.id = t.run_id
         WHERE t.session_id = $1 AND r.user_email = $2)`,
      [id, userEmail],
    );
    // cache rows store question + result + snapshot — remove BEFORE the runs'
    // questions are redacted (the join needs the original text)
    await c.query(
      `DELETE FROM ask_answer_cache WHERE user_email = $2 AND question IN (
         SELECT r.question FROM ask_turns t JOIN ask_runs r ON r.id = t.run_id
         WHERE t.session_id = $1 AND r.user_email = $2)`,
      [id, userEmail],
    );
    // usage QUESTION text is content; the cost/token columns are accounting
    await c.query(
      `UPDATE ask_usage SET question = '[deleted]'
       WHERE user_email = $2 AND run_id IN (SELECT run_id FROM ask_turns WHERE session_id = $1)`,
      [id, userEmail],
    );
    // content removal on the runs this session owns (ownership double-checked)
    await c.query(
      `UPDATE ask_runs SET result = NULL, question = '[deleted]', evidence_snapshot = NULL
       WHERE user_email = $2 AND id IN (SELECT run_id FROM ask_turns WHERE session_id = $1)`,
      [id, userEmail],
    );
    const del = await c.query(`DELETE FROM ask_turns WHERE session_id = $1`, [id]);
    await c.query(`DELETE FROM ask_sessions WHERE id = $1 AND user_email = $2`, [id, userEmail]);
    return { deleted: true, turnsRemoved: del.rowCount ?? 0 };
  });
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
 *  run, scope "new".
 *
 *  ATOMIC (release hardening): validation, session creation, and the first
 *  turn commit or roll back TOGETHER — a failed first turn can no longer
 *  leave a turnless orphan session behind. A run already claimed by another
 *  session (unique run_id) refuses as "run_in_session" with zero rows
 *  written. */
export async function startSessionFromRun(opts: {
  userEmail: string;
  runId: string;
  title: string;
}): Promise<
  | { ok: true; session: AskSession }
  | { ok: false; reason: "not_found" | "no_snapshot" | "flag_off" | "run_in_session" }
> {
  if (!askSessionsEnabled()) return { ok: false, reason: "flag_off" };
  try {
    return await withTxn(async (c) => {
      const { rows } = await c.query(
        `SELECT evidence_snapshot FROM ask_runs WHERE id = $1 AND user_email = $2 AND finished_at IS NOT NULL`,
        [opts.runId, opts.userEmail],
      );
      const r = rows[0] as { evidence_snapshot: EvidenceSnapshot | null } | undefined;
      if (!r) return { ok: false as const, reason: "not_found" as const };
      if (!r.evidence_snapshot) return { ok: false as const, reason: "no_snapshot" as const };
      const created = await c.query(
        `INSERT INTO ask_sessions (user_email, title) VALUES ($1, $2)
         RETURNING id, user_email, title, status, created_at::text AS created_at, last_active_at::text AS last_active_at`,
        [opts.userEmail, opts.title.slice(0, 200)],
      );
      const s = created.rows[0] as Record<string, string>;
      await c.query(
        `INSERT INTO ask_turns (session_id, seq, run_id, scope) VALUES ($1, 1, $2, 'new')`,
        [s.id, opts.runId],
      );
      return {
        ok: true as const,
        session: {
          id: s.id, userEmail: s.user_email, title: s.title, status: s.status,
          createdAt: s.created_at, lastActiveAt: s.last_active_at,
        },
      };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: "run_in_session" };
    throw e;
  }
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
  | {
      ok: false;
      reason: "flag_off" | "pipeline_legacy" | "not_found" | "no_snapshot" | AppendRefusal;
      /** present when the paid call already ran — the billed answer is
       *  RETURNED, never discarded (Gate 6) */
      result?: AskAnswerV2;
    }
> {
  if (!askSessionsEnabled()) return { ok: false, reason: "flag_off" };
  // The legacy pipeline ignores reuseSnapshot (it would run LIVE retrieval
  // and record it as a scoped reuse turn) — refuse instead of drifting
  // (Gate 6; ASK_PIPELINE=legacy is the emergency rollback).
  if (askPipeline() !== "v2") return { ok: false, reason: "pipeline_legacy" };
  const session = await getSession(opts.sessionId, opts.userEmail);
  if (!session) return { ok: false, reason: "not_found" };
  // $0 PRE-checks (Gate 6: cap/ended/idle were only enforced after the paid
  // call — a 21st follow-up billed a full answer and then discarded it). The
  // post-call appendTurn remains the racing arbiter.
  if (session.status !== "active") return { ok: false, reason: "ended" };
  if (Date.now() - new Date(session.lastActiveAt).getTime() > SESSION_IDLE_TTL_MS) {
    return { ok: false, reason: "idle" };
  }
  const turns = await listTurns(opts.sessionId, opts.userEmail);
  if (turns.length >= MAX_SESSION_TURNS) return { ok: false, reason: "turn_cap" };
  const snapshot = await latestSnapshot(opts.sessionId, opts.userEmail);
  if (!snapshot) return { ok: false, reason: "no_snapshot" };

  // compacted deterministic history (§7.5) from the prior turns' runs
  const historyBlock = await buildHistoryBlock(opts.sessionId, opts.userEmail);
  const { suggested, reason: suggestedReason } = classifyFollowup(opts.question, snapshot);

  const result = await askWithLimits(opts.question, opts.userEmail, {
    idempotencyKey: opts.idempotencyKey,
    sessionReuse: { snapshot, historyBlock },
  });
  // Refusal payloads never become turns (Gate 6: in ENFORCE mode refusals DO
  // carry a runId — gate on the terminal state, not run identity). Answered/
  // insufficient/refused are real investigative exchanges; limit/error are not.
  if (!result.runId || result.state === "limit" || result.state === "error") {
    return { ok: true, seq: turns.length, result, suggested, suggestedReason };
  }
  if (result.replayed) {
    // Idempotent replay: converge to the original outcome (Gate 6 — a replay
    // after a failed append must attach the billed run, not orphan it).
    const existing = await turnSeqForRun(opts.sessionId, opts.userEmail, result.runId);
    if (existing !== null) {
      return { ok: true, seq: existing, result, suggested, suggestedReason };
    }
    const attached = await appendTurn({
      sessionId: opts.sessionId,
      userEmail: opts.userEmail,
      runId: result.runId,
      scope: "reuse",
    });
    return attached.ok
      ? { ok: true, seq: attached.seq, result, suggested, suggestedReason }
      : { ok: false, reason: attached.reason, result };
  }
  const appended = await appendTurn({
    sessionId: opts.sessionId,
    userEmail: opts.userEmail,
    runId: result.runId,
    scope: "reuse",
  });
  if (!appended.ok) return { ok: false, reason: appended.reason, result };
  return { ok: true, seq: appended.seq, result, suggested, suggestedReason };
}

/** The seq of an existing turn linking this run in this session, if any. */
async function turnSeqForRun(
  sessionId: string,
  userEmail: string,
  runId: string,
): Promise<number | null> {
  const p = pool();
  try {
    const { rows } = await p.query(
      `SELECT t.seq FROM ask_turns t JOIN ask_sessions s ON s.id = t.session_id
       WHERE t.session_id = $1 AND s.user_email = $2 AND t.run_id = $3`,
      [sessionId, userEmail, runId],
    );
    return rows.length > 0 ? Number((rows[0] as { seq: number }).seq) : null;
  } finally {
    await p.end();
  }
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
