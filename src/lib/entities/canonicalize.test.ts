import { describe, expect, it } from "vitest";
import { canonicalKey, junkReason, normalize, planCleanup, type EntityRow } from "./canonicalize";

describe("junk rules", () => {
  it("drops unnamed / counted / role-described individuals", () => {
    expect(junkReason("Unnamed Schoolboy", "person")).toBeTruthy();
    expect(junkReason("Five individuals", "person")).toBeTruthy();
    expect(junkReason("Ex-Central Bank employee", "person")).toBeTruthy();
    expect(junkReason("Central Asian National", "person")).toBeTruthy();
  });

  it("drops geography and objects", () => {
    expect(junkReason("Kramatorsk", "org")).toBe("geography");
    expect(junkReason("Moscow", "agency")).toBe("geography");
    expect(junkReason("Su-27", "org")).toContain("not an actor");
    expect(junkReason("S-400", "company")).toContain("not an actor");
    expect(junkReason("Super Typhoon Bavi", "org")).toContain("not an actor");
  });

  it("drops collectives and generic institutions", () => {
    expect(junkReason("Russian courts", "agency")).toBeTruthy();
    expect(junkReason("armed assailants", "faction")).toBeTruthy();
    expect(junkReason("Ukrainian Civilians", "person")).toBeTruthy();
    expect(junkReason("Regional Governments", "agency")).toBeTruthy();
    expect(junkReason("Gas Stations in Crimea", "org")).toBeTruthy();
  });

  it("keeps real actors, including names containing collective-ish substrings", () => {
    expect(junkReason("Arkady Rotenberg", "person")).toBeNull();
    expect(junkReason("FSB", "agency")).toBeNull();
    expect(junkReason("St. Petersburg Court", "agency")).toBeNull();
    expect(junkReason("Russian Armed Forces", "faction")).toBeNull();
    expect(junkReason("Freedom of Russia Legion", "faction")).toBeNull();
    expect(junkReason("Batalkhadzhin Gang", "faction")).toBeNull();
    expect(junkReason("United Russia", "faction")).toBeNull();
    expect(junkReason("Kyiv City Administration", "agency")).toBeNull();
  });

  it("known alias-family members are not dropped as collectives", () => {
    expect(junkReason("Houthi fighters", "faction")).toBeNull(); // merges into Houthis instead
  });
});

describe("normalization", () => {
  it("folds transliteration variants", () => {
    expect(normalize("Volodymyr Zelenskyy")).toBe(normalize("Volodymyr Zelenskiy"));
    expect(normalize("Sergey Ivanov")).toBe(normalize("Sergei Ivanov"));
    expect(normalize("Andrey Fedorov")).toBe(normalize("Andrei Fedorov"));
    expect(normalize("Alexander Nerad'ko")).toBe(normalize("Alexander Neradko"));
  });

  it("folds mixed cyrillic script", () => {
    expect(normalize("Magomet Muцolgov")).toBe(normalize("Magomet Mutsolgov"));
  });

  it("strips honorifics", () => {
    expect(normalize("Ayatollah Seyyed Ali Khamenei")).toBe("ali khamenei");
    expect(normalize("Ayatollah Ali Khamenei")).toBe("ali khamenei");
  });

  it("maps curated alias families to one key", () => {
    expect(canonicalKey("Houthi rebels")).toBe("houthis");
    expect(canonicalKey("IRGC")).toBe(canonicalKey("Islamic Revolutionary Guard Corps"));
    expect(canonicalKey("Russian Military")).toBe(canonicalKey("Russian Armed Forces"));
  });

  it("folds Cyrillic ё to е — one identity for interchangeable orthography (2026-07-13)", () => {
    expect(normalize("Андрей Воробьёв")).toBe(normalize("Андрей Воробьев"));
    expect(normalize("Андрей Воробьёв")).toBe("andrei vorobev");
  });

  it("resolves all three observed Vorobyov spellings to ONE canonical key", () => {
    const key = canonicalKey("Andrey Vorobyov");
    expect(key).toBe("andrei vorobyov");
    expect(canonicalKey("Андрей Воробьев")).toBe(key);
    expect(canonicalKey("Андрей Воробьёв")).toBe(key);
    // The fixture spelling variant folds too (ey/ei transliteration).
    expect(canonicalKey("Andrei Vorobyov")).toBe(key);
  });

  it("does NOT merge an unrelated person with a similar name", () => {
    expect(canonicalKey("Pavel Vorobyov")).not.toBe(canonicalKey("Andrey Vorobyov"));
    expect(canonicalKey("Ivan Vorobyov")).not.toBe(canonicalKey("Андрей Воробьёв"));
  });
});

describe("planCleanup — Vorobyov family (production 2026-07-13 finding)", () => {
  const rows: EntityRow[] = [
    { id: 1, kind: "person", name: "Andrey Vorobyov", claims: 5 },
    { id: 2, kind: "person", name: "Андрей Воробьев", claims: 3 },
    { id: 3, kind: "person", name: "Андрей Воробьёв", claims: 1 },
    // An unrelated person sharing the surname must survive untouched…
    { id: 4, kind: "person", name: "Ivan Vorobyov", claims: 2 },
  ];
  const plan = planCleanup(rows);

  it("merges the two Cyrillic spellings into the most-claimed Latin row", () => {
    const targets = new Map(plan.merges.map((m) => [m.fromId, m.intoId]));
    expect(targets.get(2)).toBe(1);
    expect(targets.get(3)).toBe(1);
    expect(plan.merges).toHaveLength(2);
    expect(plan.drops).toHaveLength(0);
  });

  it("leaves the unrelated Vorobyov alone", () => {
    expect(plan.merges.some((m) => m.fromId === 4 || m.intoId === 4)).toBe(false);
  });

  it("leaves a bare surname alone when TWO full-name people share it (ambiguous)", () => {
    const withSurname = planCleanup([...rows, { id: 5, kind: "person", name: "Vorobyov", claims: 1 }]);
    expect(withSurname.merges.some((m) => m.fromId === 5)).toBe(false);
  });
});

describe("planCleanup", () => {
  const rows: EntityRow[] = [
    { id: 1, kind: "person", name: "Ali Khamenei", claims: 4 },
    { id: 2, kind: "person", name: "Ayatollah Seyyed Ali Khamenei", claims: 5 },
    { id: 3, kind: "person", name: "Ayatollah Khamenei", claims: 0 },
    { id: 4, kind: "person", name: "Khamenei", claims: 0 },
    { id: 5, kind: "person", name: "Donald Trump", claims: 7 },
    { id: 6, kind: "person", name: "Trump", claims: 1 },
    { id: 7, kind: "org", name: "Kramatorsk", claims: 1 },
    { id: 8, kind: "faction", name: "Houthis", claims: 1 },
    { id: 9, kind: "faction", name: "Houthi fighters", claims: 0 },
    { id: 10, kind: "person", name: "Hanna", claims: 1 }, // ambiguous single name
    { id: 11, kind: "org", name: "Hamas", claims: 1 },
    { id: 12, kind: "faction", name: "Hamas", claims: 3 },
  ];
  const plan = planCleanup(rows);

  it("merges the whole Khamenei cluster into the most-cited entity", () => {
    const khamenei = plan.merges.filter((m) => [1, 3, 4].includes(m.fromId));
    expect(khamenei).toHaveLength(3);
    for (const m of khamenei) expect(m.intoId).toBe(2); // path-compressed
  });

  it("merges bare surnames into unique full names", () => {
    expect(plan.merges.find((m) => m.fromId === 6)?.intoId).toBe(5);
  });

  it("leaves ambiguous single names alone", () => {
    expect(plan.merges.find((m) => m.fromId === 10)).toBeUndefined();
    expect(plan.drops.find((d) => d.id === 10)).toBeUndefined();
  });

  it("merges cross-kind exact duplicates into the most-cited", () => {
    expect(plan.merges.find((m) => m.fromId === 11)?.intoId).toBe(12);
  });

  it("merges alias families and drops geography", () => {
    expect(plan.merges.find((m) => m.fromId === 9)?.intoId).toBe(8);
    expect(plan.drops.find((d) => d.id === 7)?.reason).toBe("geography");
  });
});
