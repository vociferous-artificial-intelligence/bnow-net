import { describe, expect, it } from "vitest";
import {
  ALLEGATION_MIN_DOCS,
  ATTRIBUTION_LABEL,
  guardPublishedEvents,
  hasAttribution,
  isPersonAllegation,
} from "./publication-guard";
import type { DigestAnalysis } from "./provider";

type GuardEvent = DigestAnalysis["events"][number];
type GuardClaim = GuardEvent["claims"][number];

const person = (name: string) => ({ kind: "person" as const, name, role: "subject" });

function claim(over: Partial<GuardClaim> = {}): GuardClaim {
  return {
    text: "Ukrainian drones struck a refinery near Ryazan",
    claimType: "factual",
    hedging: "claimed",
    docIds: [1, 2],
    entities: [],
    ...over,
  };
}

function event(over: Partial<GuardEvent> = {}): GuardEvent {
  return {
    title: "Drone strikes on refinery infrastructure",
    type: "strike",
    summary: "Multiple drones struck refinery infrastructure overnight.",
    claims: [claim()],
    ...over,
  };
}

// ---- the production defect, reproduced (Graham scenario) ----------------------

const GRAHAM_CLAIM_TEXT =
  "US Senator Lindsey Graham died unexpectedly amid allegations of corruption schemes";

function grahamEvent(docIds = [11, 12]): GuardEvent {
  return event({
    title: "US Senator Lindsey Graham dies amid corruption scandal",
    summary:
      "US Senator Lindsey Graham died unexpectedly, with reports suggesting his involvement in corruption schemes may have influenced the circumstances of his death.",
    claims: [
      claim({
        text: GRAHAM_CLAIM_TEXT,
        hedging: "claimed",
        docIds,
        entities: [person("Lindsey Graham")],
      }),
    ],
  });
}

describe("Graham regression: declarative death+corruption copy cannot survive", () => {
  it("replaces the speculative summary with the labeled claim text and attributes the title", () => {
    const { events, stats } = guardPublishedEvents([grahamEvent()]);
    expect(events).toHaveLength(1);
    const ev = events[0];

    // Title is no longer an unqualified declarative.
    expect(ev.title).toBe(
      "Sources claim: US Senator Lindsey Graham dies amid corruption scandal",
    );
    // The freeform model summary — where the speculative causation lived — is gone.
    expect(ev.summary).not.toContain("may have influenced");
    expect(ev.summary).not.toContain("circumstances of his death");
    expect(ev.summary).toBe(`Sources claim: ${GRAHAM_CLAIM_TEXT}`);
    // The claim itself carries attribution.
    expect(ev.claims[0].text).toBe(`Sources claim: ${GRAHAM_CLAIM_TEXT}`);

    expect(stats.retitledEvents).toBe(1);
    expect(stats.replacedSummaries).toBe(1);
    expect(stats.attributedClaims).toBe(1);
  });

  it("drops the claim (and the then-empty event) entirely when a reputational allegation cites a single document", () => {
    expect(ALLEGATION_MIN_DOCS).toBe(2); // the explicit threshold
    const { events, stats } = guardPublishedEvents([grahamEvent([11])]);
    expect(events).toHaveLength(0);
    expect(stats.droppedClaims).toBe(1);
    expect(stats.droppedEvents).toBe(1);
  });

  it("is idempotent: guarding guarded output changes nothing", () => {
    const once = guardPublishedEvents([grahamEvent()]);
    const twice = guardPublishedEvents(once.events);
    expect(twice.events).toEqual(once.events);
    expect(twice.stats).toEqual({
      attributedClaims: 0,
      droppedClaims: 0,
      droppedEvents: 0,
      retitledEvents: 0,
      replacedSummaries: 0,
    });
  });
});

describe("corroborated but attributed official claim remains attributed (not doubled)", () => {
  it("leaves already-attributed wording alone", () => {
    const ev = event({
      title: "Defense ministry claims drone wave repelled",
      summary: "The Russian MoD claimed 30 drones were downed overnight; no independent confirmation.",
      claims: [
        claim({
          text: "Russian MoD claimed 30 Ukrainian drones were downed over Bryansk",
          hedging: "claimed",
          docIds: [1, 2, 3],
        }),
      ],
    });
    const { events, stats } = guardPublishedEvents([ev]);
    // Wholly 'claimed' event, but every piece of prose already carries attribution.
    expect(events[0].title).toBe(ev.title);
    expect(events[0].summary).toBe(ev.summary);
    expect(events[0].claims[0].text).toBe(ev.claims[0].text);
    expect(stats.retitledEvents).toBe(0);
    expect(stats.replacedSummaries).toBe(0);
  });
});

describe("genuinely confirmed multi-source event passes byte-identical", () => {
  it("adds no prefixes and keeps the model summary", () => {
    const ev = event({
      title: "Refinery struck near Ryazan",
      summary: "Geolocated footage confirms strikes on the refinery's distillation unit.",
      claims: [
        claim({ hedging: "confirmed", docIds: [1, 2, 3, 4] }),
        claim({
          text: "Fires burned for six hours at the site",
          hedging: "confirmed",
          docIds: [2, 3],
        }),
      ],
    });
    const { events, stats } = guardPublishedEvents([ev]);
    expect(events[0]).toBe(ev); // reference-equal: literally untouched
    expect(stats).toEqual({
      attributedClaims: 0,
      droppedClaims: 0,
      droppedEvents: 0,
      retitledEvents: 0,
      replacedSummaries: 0,
    });
  });
});

describe("wash protection: a confirmed subclaim cannot make a disputed allegation declarative", () => {
  it("treats the mixed event as allegation-bearing and attributes per claim", () => {
    const confirmed = claim({
      text: "Geolocated footage confirms a strike on the airbase",
      hedging: "confirmed",
      docIds: [1, 2],
    });
    const allegation = claim({
      text: "Regional governor Ivan Petrov was arrested for embezzlement of defense funds",
      hedging: "claimed",
      docIds: [3, 4],
      entities: [person("Ivan Petrov")],
    });
    const ev = event({
      title: "Airbase struck; governor arrested in corruption sweep",
      summary:
        "A strike hit the airbase while governor Ivan Petrov was arrested for embezzling defense funds.",
      claims: [confirmed, allegation],
    });
    const { events } = guardPublishedEvents([ev]);
    const g = events[0];
    // Event copy is deterministic despite the confirmed subclaim.
    expect(g.title.startsWith("Sources claim:")).toBe(true);
    expect(g.summary.startsWith("Sources claim:")).toBe(true);
    // The confirmed claim's text is untouched; the allegation is attributed.
    expect(g.claims[0].text).toBe(confirmed.text);
    expect(g.claims[1].text).toBe(`Sources claim: ${allegation.text}`);
  });
});

describe("ordinary battlefield reporting stays readable", () => {
  it("does not prefix non-allegation disputed claims; unattributed wholly-disputed event copy gets the label", () => {
    const ev = event({
      title: "Advance near Pokrovsk",
      summary: "Russian forces advanced 2km near Pokrovsk.",
      claims: [
        claim({ text: "Russian forces advanced 2km near Pokrovsk", hedging: "claimed", docIds: [1] }),
      ],
    });
    const { events } = guardPublishedEvents([ev]);
    // Claim text untouched (the hedging badge carries the qualification in UI).
    expect(events[0].claims[0].text).toBe(ev.claims[0].text);
    // But the event-level prose was an unqualified declarative on wholly-claimed support.
    expect(events[0].title).toBe("Sources claim: Advance near Pokrovsk");
    expect(events[0].summary).toBe("Sources claim: Russian forces advanced 2km near Pokrovsk");
  });

  it("keeps attributed battlefield prose untouched (the prompt-compliant path)", () => {
    const ev = event({
      title: "Russian sources claim advance near Pokrovsk",
      summary: "Russian milbloggers reported a 2km advance; Ukrainian sources deny it.",
      claims: [claim({ hedging: "claimed" })],
    });
    const { events, stats } = guardPublishedEvents([ev]);
    expect(events[0]).toBe(ev);
    expect(stats.retitledEvents).toBe(0);
  });

  it("leaves a mixed event without allegations untouched at event level", () => {
    const ev = event({
      title: "Strikes on the refinery",
      summary: "The refinery was struck; damage assessments vary.",
      claims: [
        claim({ hedging: "confirmed" }),
        claim({ text: "Output halted for a week", hedging: "claimed" }),
      ],
    });
    const { events } = guardPublishedEvents([ev]);
    expect(events[0].title).toBe(ev.title);
    expect(events[0].summary).toBe(ev.summary);
  });

  it("a single-source claim that a named commander was killed is attributed, not dropped", () => {
    // Battlefield death vocabulary is outside the narrow reputational drop set.
    const ev = event({
      claims: [
        claim({
          text: "Brigade commander Oleg Sidorov was killed in a strike on the command post",
          hedging: "claimed",
          docIds: [7],
          entities: [person("Oleg Sidorov")],
        }),
      ],
    });
    const { events, stats } = guardPublishedEvents([ev]);
    expect(stats.droppedClaims).toBe(0);
    expect(events[0].claims[0].text.startsWith("Sources claim:")).toBe(true);
  });
});

describe("unverified/unknown hedging uses the unverified label", () => {
  it("labels an unverified allegation as unverified reporting", () => {
    const ev = event({
      title: "Minister hospitalized",
      summary: "The minister was hospitalized in grave condition.",
      claims: [
        claim({
          text: "Minister Petr Orlov was hospitalized in grave condition",
          hedging: "unverified",
          docIds: [1, 2],
          entities: [person("Petr Orlov")],
        }),
      ],
    });
    const { events } = guardPublishedEvents([ev]);
    expect(events[0].claims[0].text.startsWith("Unverified reporting:")).toBe(true);
    expect(events[0].title.startsWith("Unverified reporting:")).toBe(true);
  });
});

describe("empty input and edge shapes behave as today", () => {
  it("passes an empty event list through", () => {
    const { events, stats } = guardPublishedEvents([]);
    expect(events).toEqual([]);
    expect(stats.droppedEvents).toBe(0);
  });

  it("claims without entities are never allegations", () => {
    expect(isPersonAllegation("corruption everywhere", [])).toBe(false);
    expect(isPersonAllegation("corruption everywhere", undefined)).toBe(false);
    expect(isPersonAllegation("corruption everywhere", [{ kind: "org" }])).toBe(false);
    expect(isPersonAllegation("Ivan Petrov corruption case", [{ kind: "person" }])).toBe(true);
  });

  it("hasAttribution recognizes the label set and common attribution verbs", () => {
    for (const label of Object.values(ATTRIBUTION_LABEL)) {
      expect(hasAttribution(`${label} something`)).toBe(true);
    }
    expect(hasAttribution("According to Reuters, X happened")).toBe(true);
    expect(hasAttribution("Peskov said the talks continue")).toBe(true);
    expect(hasAttribution("Reportedly, the unit withdrew")).toBe(true);
    expect(hasAttribution("The unit withdrew")).toBe(false);
  });
});
