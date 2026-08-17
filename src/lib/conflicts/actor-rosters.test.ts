import { describe, expect, it } from "vitest";
import { ACTOR_ROSTERS, ACTOR_ROSTER_VERSIONS, matchActors } from "./actor-rosters";
import { isLaneInTaxonomy } from "./lanes";
import { CONFLICT_REGISTRY } from "./definitions";
import { CONFLICT_IDS } from "./vocabulary";

describe("actor rosters (versioned, deterministic)", () => {
  it("has a versioned roster per conflict", () => {
    expect(ACTOR_ROSTER_VERSIONS.russia_ukraine).toBe("ru-ua-roster-v1");
    expect(ACTOR_ROSTER_VERSIONS.iran_regional).toBe("iran-roster-v1");
  });

  it("every entry has a unique id and a lane inside its conflict's frozen taxonomy", () => {
    for (const conflictId of CONFLICT_IDS) {
      const roster = ACTOR_ROSTERS[conflictId];
      const ids = roster.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      const version = CONFLICT_REGISTRY[conflictId].laneTaxonomyVersion;
      for (const e of roster) {
        if (e.lane !== null) expect(isLaneInTaxonomy(version, e.lane)).toBe(true);
      }
    }
  });

  it("rosters are frozen configuration", () => {
    expect(Object.isFrozen(ACTOR_ROSTERS.russia_ukraine)).toBe(true);
    expect(Object.isFrozen(ACTOR_ROSTERS.iran_regional[0])).toBe(true);
  });

  it("DPRK military support hits by actor, independent of geography", () => {
    const hits = matchActors("russia_ukraine", "A DPRK ammunition shipment arrived for transfer.");
    expect(hits.map((h) => h.entry.id)).toContain("dprk-military-support");
  });

  it("nato-eu-decision requires war-shaping co-occurrence — bare EU membership never suffices", () => {
    const dairy = matchActors(
      "russia_ukraine",
      "EU agriculture ministers failed to agree on a dairy subsidy compromise.",
    );
    expect(dairy.map((h) => h.entry.id)).not.toContain("nato-eu-decision");
    const aid = matchActors(
      "russia_ukraine",
      "A NATO member approved an air-defense package for Ukraine.",
    );
    expect(aid.map((h) => h.entry.id)).toContain("nato-eu-decision");
    // member-state (Moldova) decisions shaping the war are the same entry
    const moldova = matchActors(
      "russia_ukraine",
      "Moldova approved transit of artillery ammunition bound for Ukraine.",
    );
    expect(moldova.map((h) => h.entry.id)).toContain("nato-eu-decision");
  });

  it("russian-forces is a WEAK fallback entry", () => {
    const roster = ACTOR_ROSTERS.russia_ukraine;
    expect(roster.find((e) => e.id === "russian-forces")?.strength).toBe("weak");
    expect(roster.find((e) => e.id === "russian-forces")?.lane).toBeNull();
  });

  it("houthi operating-area tokens hit WITH attack/military/shipping context (guarded coarseness)", () => {
    for (const text of [
      "Houthi forces attacked a vessel.",
      "A missile was launched from Yemen.",
      "A detonation southwest of Al Hudaydah.",
      "An attack in the southern Red Sea.",
    ]) {
      expect(matchActors("iran_regional", text).map((h) => h.entry.id)).toContain("houthi");
    }
  });

  it("bare area/actor tokens never admit neutral claims (Gate-3 probe sentences)", () => {
    // each probe previously matched an actor entry on a bare token and (at
    // classifier rung 3) the actor GOVERNED the lane — all five must now
    // yield ZERO hits for the entry in question
    const iranProbes = [
      "Yemen's tourism ministry reported record visitor numbers for July.",
      "Fishing cooperatives near Al Salif reported a strong catch season.",
      "Aid deliveries to Yemen resumed through the port of Aden under a monitoring arrangement.",
      "Oman Air announced new direct flights to Bangkok.",
    ];
    for (const text of iranProbes) {
      const ids = matchActors("iran_regional", text).map((h) => h.entry.id);
      expect(ids, text).not.toContain("houthi");
      expect(ids, text).not.toContain("mediator-oman");
    }
    expect(
      matchActors("russia_ukraine", "Belarus reported a record potato harvest this season.").map(
        (h) => h.entry.id,
      ),
    ).not.toContain("belarus-enablement");
    // …while genuinely enablement-shaped Belarus claims still hit
    expect(
      matchActors(
        "russia_ukraine",
        "Belarus hosted joint military exercises with Russian forces near the border.",
      ).map((h) => h.entry.id),
    ).toContain("belarus-enablement");
  });

  it("returns hits in roster priority order (irgc before mediator-oman)", () => {
    const hits = matchActors(
      "iran_regional",
      "IRGC officials and Omani mediators discussed de-escalation talks in Muscat.",
    );
    expect(hits.map((h) => h.entry.id)).toEqual(["irgc", "mediator-oman"]);
    expect(hits[0].priority).toBeLessThan(hits[1].priority);
  });

  it("mediator-qatar requires mediation context", () => {
    expect(
      matchActors("iran_regional", "A Qatari airline reported record profits.").map((h) => h.entry.id),
    ).not.toContain("mediator-qatar");
    expect(
      matchActors("iran_regional", "Qatari officials hosted de-escalation talks.").map(
        (h) => h.entry.id,
      ),
    ).toContain("mediator-qatar");
  });

  it("iraqi-militia does not hit generic Iraqi state actors", () => {
    expect(
      matchActors("iran_regional", "Iraqi authorities hardened security around bases.").map(
        (h) => h.entry.id,
      ),
    ).not.toContain("iraqi-militia");
    expect(
      matchActors("iran_regional", "An Iranian-aligned Iraqi militia claimed a drone attack.").map(
        (h) => h.entry.id,
      ),
    ).toContain("iraqi-militia");
  });

  it("is deterministic: identical input, identical output", () => {
    const text = "IRGC Navy boats shadowed a tanker in the Strait of Hormuz near Omani waters.";
    expect(matchActors("iran_regional", text)).toEqual(matchActors("iran_regional", text));
  });
});
