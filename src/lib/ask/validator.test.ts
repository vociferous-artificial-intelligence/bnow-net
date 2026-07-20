import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyFidelityFallback,
  beginsWithDenial,
  citedClaimFallbackSentence,
  classifyCompletion,
  extractNameCandidates,
  fidelityFallbackEnabled,
  filterCitations,
  findFidelityFailures,
  insufficientEvidenceCopy,
  parseCitedIds,
  type FidelityEvidence,
} from "./validator";

afterEach(() => vi.unstubAllEnvs());

const ev = (claimId: number, text: string, hedging = "claimed"): [number, FidelityEvidence] => [
  claimId,
  { claimId, text, hedging },
];

describe("citations", () => {
  it("parses markers in order and filters against the evidence set deduped", () => {
    expect(parseCitedIds("A [c3] then [c1] and [c3] again.")).toEqual([3, 1, 3]);
    expect(filterCitations([3, 1, 3, 99], new Set([1, 3]))).toEqual([3, 1]);
  });
});

describe("denial prefix + insufficient copy (moved behavior, byte-identical)", () => {
  it("keeps the anchored prefix semantics", () => {
    expect(beginsWithDenial("No claims in the covered data address this.")).toBe(true);
    expect(
      beginsWithDenial("Ukrainian drones struck overnight; there are no reports of casualties."),
    ).toBe(false);
  });
  it("insufficient copy carries currency and no citation syntax", () => {
    const copy = insufficientEvidenceCopy("2026-07-18");
    expect(copy).toContain("current through 2026-07-18");
    expect(copy).not.toMatch(/\[c\d+\]/);
  });
});

describe("classifyCompletion — the shared terminal mapping", () => {
  it("mirrors the historical branch order exactly", () => {
    expect(classifyCompletion({ message: { refusal: "no" } })).toBe("refused");
    expect(classifyCompletion({ message: { content: "" }, finish_reason: "length" })).toBe("truncated");
    expect(classifyCompletion({ message: { content: "  " } })).toBe("empty_refused");
    expect(classifyCompletion({ message: { content: "text" }, finish_reason: "stop" })).toBe("content");
    expect(classifyCompletion(undefined)).toBe("empty_refused");
    // refusal wins over length (the historical precedence)
    expect(classifyCompletion({ message: { refusal: "no", content: "" }, finish_reason: "length" })).toBe("refused");
  });
});

describe("name extraction", () => {
  it("finds First Last pairs and skips sentence-lead/title artifacts", () => {
    expect(extractNameCandidates("OFAC designated Ruslan Zhurov yesterday.")).toEqual(["Ruslan Zhurov"]);
    expect(extractNameCandidates("The Ministry said General Staff sources agree.")).toEqual([]);
    expect(extractNameCandidates("According to Elena Shubina, nothing happened.")).toEqual(["Elena Shubina"]);
  });
});

describe("source-fidelity matrix (§4 / ruling 20)", () => {
  it("a FAITHFUL named sentence passes byte-identical — over-suppression is a failure mode we test against", () => {
    const evidence = new Map([
      ev(1, "OFAC designated Ruslan Zhurov under EO 14024 on 2026-06-12.", "confirmed"),
    ]);
    const answer = "OFAC designated Ruslan Zhurov on 2026-06-12 [c1].";
    const applied = applyFidelityFallback(answer, evidence);
    expect(applied.replacedCount).toBe(0);
    expect(applied.text).toBe(answer); // BYTE-identical
  });

  it("identity: a name absent from every cited claim fails (wrong-namesake / cross-claim attribution)", () => {
    const evidence = new Map([ev(1, "A battalion commander was arrested near Odesa.", "claimed")]);
    const failures = findFidelityFailures("Serhiy Bondar was arrested near Odesa [c1].", evidence);
    expect(failures).toHaveLength(1);
    expect(failures[0].kind).toBe("identity");
  });

  it("predicate: designation upgraded to conviction fails; the exact designation passes", () => {
    const evidence = new Map([
      ev(1, "OFAC designated Viktor Melnik under EO 14024.", "confirmed"),
    ]);
    expect(findFidelityFailures("Viktor Melnik was convicted of sanctions violations [c1].", evidence)[0]?.kind).toBe(
      "predicate",
    );
    expect(findFidelityFailures("Viktor Melnik was designated by OFAC [c1].", evidence)).toHaveLength(0);
  });

  it("predicate: PEP-only evidence never supports 'sanctioned' (category laundering)", () => {
    const evidence = new Map([
      ev(1, "OpenSanctions lists Marta Kovalyk as a politically exposed person.", "assessed"),
    ]);
    const failures = findFidelityFailures("Marta Kovalyk is sanctioned [c1].", evidence);
    expect(failures[0]?.kind).toBe("predicate");
  });

  it("certainty: hedged-only evidence asserted WITHOUT governing attribution fails; WITH attribution passes", () => {
    const evidence = new Map([
      ev(1, "A milblogger channel claimed Colonel Andrei Vetrov was killed near Kupiansk.", "claimed"),
    ]);
    const bare = findFidelityFailures("Andrei Vetrov was arrested and confirmed dead [c1].", evidence);
    expect(bare.length).toBeGreaterThan(0);
    const attributed = findFidelityFailures(
      "According to a milblogger channel, Andrei Vetrov was reportedly killed near Kupiansk [c1].",
      evidence,
    );
    expect(attributed).toHaveLength(0);
  });

  it("status: expired/removed evidence presented as current fails; stating the removal passes", () => {
    const evidence = new Map([
      ev(1, "Aurora Logistics was removed from the SDN list on 2026-03-18; the designation was lifted.", "confirmed"),
    ]);
    // (entity names pass the name heuristic via the capitalized pair)
    expect(
      findFidelityFailures("Aurora Logistics is currently sanctioned [c1].", evidence)[0]?.kind,
    ).toBe("status");
    expect(
      findFidelityFailures("Aurora Logistics was removed from the SDN list on 2026-03-18 [c1].", evidence),
    ).toHaveLength(0);
  });

  it("uncited or nameless sentences are out of scope (the citation filter's domain)", () => {
    const evidence = new Map([ev(1, "text", "claimed")]);
    expect(findFidelityFailures("Something happened without citations.", evidence)).toHaveLength(0);
    expect(findFidelityFailures("Strikes continued overnight [c1].", evidence)).toHaveLength(0);
  });

  it("replacement uses deterministic cited-claim wording — the name SURVIVES inside the quote", () => {
    const evidence = new Map([
      ev(7, "A Telegram channel claimed Colonel Andrei Vetrov was killed near Kupiansk.", "claimed"),
    ]);
    const applied = applyFidelityFallback("Andrei Vetrov is confirmed dead [c7]. Fighting continued.", evidence);
    expect(applied.replacedCount).toBe(1);
    expect(applied.text).toContain('Sources state: "A Telegram channel claimed Colonel Andrei Vetrov'); // name kept
    expect(applied.text).toContain("[c7]"); // citation kept
    expect(applied.text).toContain("Fighting continued."); // untouched sentences intact
    expect(applied.text).not.toContain("confirmed dead");
  });

  it("citedClaimFallbackSentence renders the claim verbatim with its citation", () => {
    expect(citedClaimFallbackSentence({ claimId: 9, text: "X happened.", hedging: "claimed" })).toBe(
      'Sources state: "X happened." [c9]',
    );
  });

  it("the rollback flag disables replacement only", () => {
    expect(fidelityFallbackEnabled()).toBe(true);
    vi.stubEnv("ASK_FIDELITY_FALLBACK", "0");
    expect(fidelityFallbackEnabled()).toBe(false);
  });
});
