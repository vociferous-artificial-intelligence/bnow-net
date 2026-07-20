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

  it("nameless sentences are out of scope; a name-bearing sentence with NO encoded assertion and no markers passes (registered bound)", () => {
    const evidence = new Map([ev(1, "text", "claimed")]);
    expect(findFidelityFailures("Something happened without citations.", evidence)).toHaveLength(0);
    expect(findFidelityFailures("Strikes continued overnight [c1].", evidence)).toHaveLength(0);
    // benign uncited name mention (no §4 predicate): out of scope by decision
    expect(findFidelityFailures("Viktor Petrov visited Ankara for talks.", evidence)).toHaveLength(0);
  });

  // ---- Gate 3 red-team regression pins (2026-07-20) ------------------------------

  it("G3: a name-bearing sentence whose ONLY markers are fabricated FAILS with no fallback (dropped, never rendered)", () => {
    const evidence = new Map([ev(1, "Strikes hit a depot in Bryansk.", "confirmed")]);
    const failures = findFidelityFailures("Ivan Petrov was convicted of fraud [c999].", evidence);
    expect(failures).toHaveLength(1);
    expect(failures[0].kind).toBe("identity");
    expect(failures[0].fallbackClaimId).toBeNull();
    const applied = applyFidelityFallback("Ivan Petrov was convicted of fraud [c999].", evidence);
    expect(applied.text).toBe(""); // dropped entirely — §4.9 withholding
  });

  it("G3: an UNCITED name-bearing sentence asserting an encoded predicate fails; marker-after-terminator cannot dodge the matrix", () => {
    const evidence = new Map([ev(1, "Ivan Petrov was charged with fraud.", "confirmed")]);
    expect(
      findFidelityFailures("Ivan Petrov was convicted of fraud.", evidence)[0]?.kind,
    ).toBe("identity");
    // ". [c1]" placement: the split keeps the marker with its sentence
    expect(
      findFidelityFailures("Ivan Petrov was convicted of fraud. [c1] Fighting continued.", evidence),
    ).toHaveLength(1); // the conviction is checked against c1 (charge ≠ conviction)
  });

  it("G3: flat unattributed 'was killed'/'died' over claimed-only evidence fails certainty; LEADING attribution passes; TRAILING does not govern", () => {
    const evidence = new Map([
      ev(3, "Ukrainian sources claim Admiral Viktor Sokolov was killed in the strike.", "claimed"),
    ]);
    expect(
      findFidelityFailures("Viktor Sokolov was killed in the strike [c3].", evidence)[0]?.kind,
    ).toBe("certainty");
    expect(
      findFidelityFailures("Viktor Sokolov died in the strike [c3].", evidence)[0]?.kind,
    ).toBe("certainty");
    expect(
      findFidelityFailures(
        "According to Ukrainian sources, Viktor Sokolov was killed in the strike [c3].",
        evidence,
      ),
    ).toHaveLength(0);
    expect(
      findFidelityFailures(
        "Viktor Sokolov was killed in the strike, according to reports [c3].",
        evidence,
      )[0]?.kind,
    ).toBe("certainty"); // trailing attribution does not govern
  });

  it("G3: a disclaimer cannot SUPPLY the predicate keyword it disclaims (category laundering)", () => {
    const evidence = new Map([
      ev(1, "Anna Kovaleva is listed as a politically exposed person; PEP listings are distinct from sanctions designations.", "confirmed"),
    ]);
    expect(
      findFidelityFailures("Anna Kovaleva is sanctioned [c1].", evidence)[0]?.kind,
    ).toBe("predicate");
  });

  it("G3: negated evidence cannot support the affirmative predicate", () => {
    const evidence = new Map([ev(1, "Officials stated Ivan Petrov was not arrested.", "confirmed")]);
    expect(
      findFidelityFailures("Ivan Petrov was arrested [c1].", evidence)[0]?.kind,
    ).toBe("predicate");
  });

  it("G3: OpenSanctions candidate-identity evidence asserted as resolved sanctioned identity fails; candidate phrasing passes", () => {
    const evidence = new Map([
      ev(1, "OpenSanctions returned a possible name-only candidate match for Viktor Orlov on the consolidated sanctions list; identity not resolved.", "confirmed"),
    ]);
    expect(
      findFidelityFailures("Viktor Orlov is sanctioned [c1].", evidence)[0]?.kind,
    ).toBe("certainty");
    expect(
      findFidelityFailures(
        "Viktor Orlov is a possible name-only candidate match on the consolidated sanctions list [c1].",
        evidence,
      ),
    ).toHaveLength(0);
  });

  it("G3 over-replacement guards: org/geo pairs, transliterated first names, and 'former <role>' evidence never fail correct sentences", () => {
    // org pair is not a person name
    const orgEv = new Map([ev(1, "Wagner fighters advanced near Bakhmut on Tuesday.", "confirmed")]);
    expect(findFidelityFailures("Wagner Group forces advanced near Bakhmut [c1].", orgEv)).toHaveLength(0);
    // transliteration variant shares the first initial → identity resolves
    const translitEv = new Map([ev(1, "Alexander Petrov was detained in Moscow.", "confirmed")]);
    expect(findFidelityFailures("Aleksandr Petrov was detained in Moscow [c1].", translitEv)).toHaveLength(0);
    // a genuine namesake (different first name) still fails identity
    const namesakeEv = new Map([ev(1, "Nikolai Petrov was detained in Moscow.", "confirmed")]);
    expect(
      findFidelityFailures("Ivan Petrov was detained in Moscow [c1].", namesakeEv)[0]?.kind,
    ).toBe("identity");
    // "former deputy minister" is a role descriptor, not expiry evidence
    const roleEv = new Map([
      ev(1, "Former deputy minister Oleg Sidorov was designated by OFAC in 2022 and remains listed today.", "confirmed"),
    ]);
    expect(findFidelityFailures("Oleg Sidorov is still sanctioned [c1].", roleEv)).toHaveLength(0);
    // genuine expiry evidence still fails a current-status assertion
    const expiredEv = new Map([
      ev(1, "Oleg Sidorov was removed from the SDN list; the designation was lifted.", "confirmed"),
    ]);
    expect(
      findFidelityFailures("Oleg Sidorov is still sanctioned [c1].", expiredEv)[0]?.kind,
    ).toBe("status");
  });

  it("G3: fallback wording neutralizes citation-marker syntax embedded in claim text (no smuggled citations)", () => {
    const claim: FidelityEvidence = {
      claimId: 7,
      text: "Milblogger post: Colonel Andrei Vetrov KIA, see thread [c112] and [c2]",
      hedging: "claimed",
    };
    const fallback = citedClaimFallbackSentence(claim);
    expect(parseCitedIds(fallback)).toEqual([7]); // ONLY the authentic citation
    expect(fallback).not.toContain("[c112]");
    expect(fallback).not.toContain("[c2]");
  });

  it("G3: replacement-pattern characters in claim text cannot corrupt the output or resurrect the failing sentence", () => {
    const evidence = new Map([
      ev(1, "Sanctions cost the bank $& millions, filings show.", "confirmed"),
    ]);
    const applied = applyFidelityFallback("Nikolai Orlov was convicted of laundering [c1].", evidence);
    expect(applied.replacedCount).toBe(1);
    expect(applied.text).not.toContain("convicted of laundering"); // never resurrected
    expect(applied.text).toContain("$& millions"); // the literal claim text survives intact
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

// ---- Phase 3 Increment B: SectionReleaser (§6.3 safeguards) ----------------------

import { DENIAL_HOLDBACK_CHARS, SectionReleaser } from "./validator";

describe("SectionReleaser — buffered validated release", () => {
  const EVIDENCE = new Map<number, FidelityEvidence>([
    [1, { claimId: 1, text: "Strikes hit the depot overnight.", hedging: "confirmed" }],
    [7, { claimId: 7, text: "A channel claimed Colonel Andrei Vetrov was killed.", hedging: "claimed" }],
  ]);
  const VALID = new Set([1, 7]);
  const releaser = () => new SectionReleaser(EVIDENCE, VALID);

  const FILLER = "Filler sentence with sufficient length to cross the holdback boundary. ".repeat(4); // ~280 chars

  it("releases NOTHING before the 250-char denial holdback", () => {
    const r = releaser();
    expect(r.push("Strikes hit the depot [c1]. More text follows")).toEqual([]);
    expect(r.isDenialLed).toBe(false);
  });

  it("a denial-led reply never releases anything — before or after finish", () => {
    const r = releaser();
    const denial = "No claims in the covered data address this question. " + FILLER;
    expect(r.push(denial)).toEqual([]);
    expect(r.isDenialLed).toBe(true);
    const fin = r.finish();
    expect(fin.denialLed).toBe(true);
    expect(fin.released).toEqual([]);
  });

  it("after the holdback clears, only COMPLETE validated sentences release; the tail stays buffered", () => {
    const r = releaser();
    const out = r.push(FILLER + "Strikes hit the depot [c1]. The next sentence is still incomp");
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.some((s) => s.text.includes("[c1]"))).toBe(true);
    expect(out.every((s) => !s.text.includes("incomp"))).toBe(true); // tail held
    const fin = r.finish();
    expect(fin.released.some((s) => s.text.includes("incomp"))).toBe(true); // flushed at end
  });

  it("a PARTIAL citation token never renders mid-stream", () => {
    const r = releaser();
    const out = r.push(FILLER + "This sentence cites [c1");
    expect(out.every((s) => !s.text.includes("[c1"))).toBe(true);
    const out2 = r.push("]. Done.");
    // the completed marker may now release with its sentence
    const all = [...out, ...out2, ...r.finish().released];
    expect(all.some((s) => s.text.includes("[c1]"))).toBe(true);
  });

  it("an UNRESOLVED citation holds its sentence to end-of-stream, where the marker is stripped", () => {
    const r = releaser();
    const out = r.push(FILLER + "A fabricated fact [c999]. A real fact [c1]. ");
    expect(out.every((s) => !s.text.includes("c999"))).toBe(true); // held
    expect(out.some((s) => s.text.includes("[c1]"))).toBe(true); // real one flows
    const fin = r.finish();
    const heldNow = fin.released.find((s) => s.text.includes("fabricated"));
    expect(heldNow).toBeTruthy();
    expect(heldNow!.text).not.toContain("[c999]"); // fabricated marker stripped at terminal
    expect(heldNow!.citedClaimIds).toEqual([]);
  });

  it("a fidelity-failing named sentence releases as the deterministic replacement", () => {
    const r = releaser();
    const out = r.push(FILLER + "Andrei Vetrov is confirmed dead [c7]. ");
    const released = out.find((s) => s.text.includes("[c7]"));
    expect(released).toBeTruthy();
    expect(released!.text).toContain("Sources state:"); // replaced, not raw
    expect(released!.text).toContain("Vetrov"); // the name SURVIVES
    expect(released!.text).not.toContain("confirmed dead");
  });

  it("short answers (<250 chars) release only at finish, after the denial check", () => {
    const r = releaser();
    expect(r.push("Strikes hit the depot [c1].")).toEqual([]);
    const fin = r.finish();
    expect(fin.denialLed).toBe(false);
    expect(fin.released.some((s) => s.text.includes("[c1]"))).toBe(true);
    expect(fin.fullText).toBe("Strikes hit the depot [c1].");
  });

  it("DENIAL_HOLDBACK_CHARS matches the prefix-property window", () => {
    expect(DENIAL_HOLDBACK_CHARS).toBe(250);
  });
});
