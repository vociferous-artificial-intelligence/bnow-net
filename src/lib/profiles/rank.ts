import { getProfile, type BuyerProfile } from "./config";

// Pure re-ranking of events for a buyer profile. Score combines the event's own
// signal (claim count, confidence) with profile weights (track / type / platform)
// and a recency decay. No DB, no mutation of inputs.

export interface RankableEvent {
  eventId: number;
  track: string;
  type: string;
  claimCount: number;
  avgConfidence: number | null; // 0-1
  platforms: string[]; // source platforms backing this event's claims
  latestAt: string | null; // ISO of most recent supporting doc
}

export interface ScoredEvent extends RankableEvent {
  score: number;
}

function recencyFactor(latestAt: string | null, halfLifeHours: number, nowMs: number): number {
  if (!latestAt) return 0.5;
  const ageH = (nowMs - new Date(latestAt).getTime()) / 3.6e6;
  if (!isFinite(ageH) || ageH < 0) return 1;
  return Math.pow(0.5, ageH / halfLifeHours); // exponential decay
}

export function scoreEvent(
  ev: RankableEvent,
  profile: BuyerProfile,
  nowMs: number,
): number {
  const track = profile.trackWeights[ev.track] ?? 1;
  const type = profile.eventTypeWeights[ev.type] ?? 1;
  const platform =
    ev.platforms.length > 0
      ? Math.max(...ev.platforms.map((p) => profile.platformWeights[p] ?? 1))
      : 1;
  const corroboration = 1 + Math.log1p(ev.claimCount); // diminishing returns
  const confidence = 0.5 + (ev.avgConfidence ?? 0.4); // 0.5–1.5 band
  const recency = recencyFactor(ev.latestAt, profile.recencyHalfLifeHours, nowMs);
  return track * type * platform * corroboration * confidence * (0.4 + 0.6 * recency);
}

/** Re-rank events for a profile (highest score first). Stable, pure. */
export function rankEvents(
  events: RankableEvent[],
  profileKey: string | undefined,
  nowMs: number,
): ScoredEvent[] {
  const profile = getProfile(profileKey);
  return events
    .map((ev) => ({ ...ev, score: +scoreEvent(ev, profile, nowMs).toFixed(4) }))
    .sort((a, b) => b.score - a.score || b.claimCount - a.claimCount || a.eventId - b.eventId);
}
