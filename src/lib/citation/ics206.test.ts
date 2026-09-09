import { describe, expect, it } from "vitest";
import { ATTRIBUTION_LABEL } from "@/lib/analysis/publication-guard";
import type { ClaimSourceDoc } from "@/components/claim-evidence-model";
import {
  buildIcs206Citation,
  canonicalClaimUrl,
  ICS206_EXTRACTION_UNRECORDED,
  ICS206_UNSTAMPED,
  ICS206_WITHHELD_MARKER,
  isStubToolStamp,
  readClaimToolStamp,
  serializeIcs206Html,
  serializeIcs206Plain,
  type ClaimCitationStamp,
  type Ics206Input,
  type ClaimToolStamp,
} from "./ics206";

const STAMP: ClaimToolStamp = {
  provider: "openai:gpt-4o-mini+mapreduce",
  synthesis: {
    workload: "reduce",
    provider: "openai",
    model: "gpt-4o-mini",
    reasoningEffort: null,
    registryVersion: "analysis-reg-v1",
    approval: "baseline",
  },
};
const WITHHELD: ClaimCitationStamp = { attributable: true, tools: null };
const DISCLOSED: ClaimCitationStamp = { attributable: true, tools: STAMP };

function doc(id: number, overrides: Partial<ClaimSourceDoc> = {}): ClaimSourceDoc {
  return {
    docId: id,
    url: `https://source${id}.example/item`,
    title: `Title ${id}`,
    adapter: "rss",
    sourceId: id,
    sourceName: `Source ${id}`,
    sourceKey: `source${id}.example`,
    sourceDomain: `source${id}.example`,
    platform: "state_media",
    reliability: 0.5,
    publishedAt: `2026-07-0${id}T12:00:00Z`,
    firstSeenAt: `2026-07-0${id}T13:00:00Z`,
    citationCount: 12,
    ...overrides,
  };
}

function input(overrides: Partial<Ics206Input> = {}): Ics206Input {
  return {
    claimId: 4762,
    text: "Ukraine and partners formed a coalition.",
    hedging: "confirmed",
    asOf: "13 July 2026",
    countryName: "Russia",
    countryIso2: "ru",
    claimUrl: "https://bnow.net/digests/ru/2026-07-13#c4762",
    docs: [doc(1)],
    citation: WITHHELD,
    ...overrides,
  };
}

describe("readClaimToolStamp", () => {
  it("prefers the mapreduce reduce dispatch, falls back to the legacy one", () => {
    const reduce = { workload: "reduce", model: "a", registryVersion: "analysis-reg-v1" };
    const legacy = { workload: "digest", model: "b", registryVersion: "analysis-reg-v1" };
    expect(
      readClaimToolStamp({ provider: "openai:a+mapreduce", reduceDispatch: reduce, llmDispatch: legacy })
        .synthesis?.model,
    ).toBe("a");
    expect(readClaimToolStamp({ provider: "openai:b", llmDispatch: legacy }).synthesis?.model).toBe("b");
  });

  it("validates every jsonb field rather than trusting it", () => {
    // These rows were written months ago by a different build; a non-string in
    // any slot must degrade to null, never reach a serializer as an object.
    const stamp = readClaimToolStamp({
      provider: 42,
      reduceDispatch: { model: { nested: true }, registryVersion: "", approval: 7, workload: "reduce" },
    });
    expect(stamp.provider).toBeNull();
    expect(stamp.synthesis).toEqual({
      workload: "reduce",
      provider: null,
      model: null,
      reasoningEffort: null,
      registryVersion: null,
      approval: null,
    });
    for (const raw of [null, undefined, "dispatch", 3, []]) {
      expect(readClaimToolStamp({ provider: "openai:x", reduceDispatch: raw }).synthesis).toBeNull();
    }
  });
});

describe("isStubToolStamp (ruling 3, fail-closed)", () => {
  it("refuses stub and unreadable provenance, accepts real dispatches", () => {
    for (const provider of ["stub", "STUB", " stub ", "stub:whatever", null, "", "   "]) {
      expect(isStubToolStamp({ provider, synthesis: null }), String(provider)).toBe(true);
    }
    expect(isStubToolStamp({ provider: "openai:gpt-4o-mini", synthesis: null })).toBe(false);
    expect(isStubToolStamp(STAMP)).toBe(false);
    // mapreduceProviderTag() hard-codes the "openai:" prefix and is provider-blind
    // (synthesize.ts:443-449), so the tag alone cannot see a stub synthesis under a
    // mapreduce digest. The dispatch identity's own provider closes that door.
    expect(
      isStubToolStamp({
        provider: "openai:gpt-4o-mini+mapreduce",
        synthesis: { ...STAMP.synthesis!, provider: "stub" },
      }),
    ).toBe(true);
  });
});

describe("buildIcs206Citation refusals (all fail-closed)", () => {
  it("refuses without an as-of date or a canonical claim URL", () => {
    for (const bad of [
      input({ asOf: null }),
      input({ asOf: "   " }),
      input({ claimUrl: null }),
      input({ claimUrl: "javascript:alert(1)" }),
      input({ claimUrl: "http://localhost:3000/digests/ru/2026-07-13#c4762" }),
      input({ claimUrl: "https://bnow-git-preview.vercel.app/digests/ru/2026-07-13#c4762" }),
      input({ claimUrl: "https://bnow.net/digests/ru/2026-07-13?profile=desk#c4762" }),
      input({ claimUrl: "https://bnow.net/digests/ua/2026-07-13#c4762" }),
      input({ claimUrl: "https://bnow.net/digests/ru/2026-07-13#c1" }),
    ]) {
      expect(buildIcs206Citation(bad)).toBeNull();
    }
    // the same gate the other citation-bearing copy modes use, one validator
    expect(canonicalClaimUrl(input())).toBe("https://bnow.net/digests/ru/2026-07-13#c4762");
  });

  it("refuses a stampless payload — a surface adopts, it never emits stampless", () => {
    expect(buildIcs206Citation(input({ citation: undefined }))).toBeNull();
  });

  it("refuses a non-attributable digest (ruling 3: stub never renders as fact)", () => {
    expect(buildIcs206Citation(input({ citation: { attributable: false, tools: null } }))).toBeNull();
    expect(buildIcs206Citation(input({ citation: { attributable: false, tools: STAMP } }))).toBeNull();
  });
});

describe("the withheld artifact (T4)", () => {
  const citation = buildIcs206Citation(input())!;
  const plain = serializeIcs206Plain(citation);
  const html = serializeIcs206Html(citation);

  it("never calls itself a conformant ICS 206-01 citation and marks the withholding", () => {
    expect(citation.conformant).toBe(false);
    expect(citation.disclosure.withheld).toBe(true);
    expect(citation.headline).toContain(ICS206_WITHHELD_MARKER);
    expect(plain).toContain(ICS206_WITHHELD_MARKER);
    expect(html).toContain(ICS206_WITHHELD_MARKER);
    expect(plain).not.toContain("ICS 206-01 source citation");
  });

  it("emits no engine, model, provider or registry token anywhere", () => {
    for (const out of [plain, html, JSON.stringify(citation)]) {
      for (const token of ["gpt-4o-mini", "openai", "mapreduce", "analysis-reg-v1", "baseline"]) {
        expect(out.toLocaleLowerCase(), token).not.toContain(token);
      }
    }
  });

  it("carries T2's access date, the descriptor stub, and the ICS 206-01 source fields", () => {
    expect(plain).toBe(
      "BNOW.NET — source citation (ICS 206-01 fields; tool disclosure withheld)\n" +
        "\n" +
        "Claim: Ukraine and partners formed a coalition.\n" +
        "Classification: Confirmed\n" +
        "Likelihood (ICD 203): likely (55–80%)\n" +
        "Corroboration-derived confidence: moderate\n" +
        "Estimative basis: source classification \"confirmed\", corroboration tier C0; estimative-map-v1.\n" +
        "Corroboration: 1 document · 1 channel · 1 platform\n" +
        "Retrieved as of: 13 July 2026\n" +
        "Publisher: BNOW.NET, Russia Daily Digest, claim c4762\n" +
        "Canonical: https://bnow.net/digests/ru/2026-07-13#c4762\n" +
        "\n" +
        "Sources\n" +
        '[1] Source 1. "Title 1". news media; publicly available information (PAI).\n' +
        "    Descriptor: news media · coverage lens: ru · ISW-cited 12 times.\n" +
        "    Published: Jul 1, 2026, 8:00 AM ET · Accessed (BNOW ingest): Jul 1, 2026, 9:00 AM ET\n" +
        "    https://source1.example/item\n" +
        "\n" +
        "Tool disclosure\n" +
        "tool disclosure withheld",
    );
  });
});

describe("the WS-7.4 estimative block (T3)", () => {
  it("renders on BOTH the withheld and the disclosed artifact — it is independent of T4", () => {
    for (const stamp of [WITHHELD, DISCLOSED]) {
      const citation = buildIcs206Citation(input({ citation: stamp }))!;
      expect(citation.estimative.likelihood).toBe("likely (55–80%)");
      expect(citation.estimative.confidence).toBe("moderate");
      expect(citation.estimative.basis).toBe(
        'source classification "confirmed", corroboration tier C0; estimative-map-v1.',
      );
      // the disclosure policy is untouched by the band either way
      expect(citation.disclosure.withheld).toBe(stamp === WITHHELD);
    }
  });

  it("carries the derivation so the citation stays reconstructible", () => {
    const plain = serializeIcs206Plain(buildIcs206Citation(input())!);
    expect(plain).toContain("Estimative basis: source classification");
    expect(plain).toContain("estimative-map-v1");
    const html = serializeIcs206Html(buildIcs206Citation(input())!);
    expect(html).toContain("<strong>Likelihood (ICD 203):</strong> likely (55–80%)");
    expect(html).toContain("<strong>Corroboration-derived confidence:</strong> moderate");
  });

  it("says corroboration-derived, never analyst confidence", () => {
    const citation = buildIcs206Citation(input())!;
    for (const out of [serializeIcs206Plain(citation), serializeIcs206Html(citation)]) {
      expect(out).toContain("Corroboration-derived confidence");
      expect(out.toLocaleLowerCase()).not.toContain("analyst confidence");
    }
  });

  it("emits no AJP-2.1 credibility code — that is an export field, never this surface (T1)", () => {
    const citation = buildIcs206Citation(input())!;
    expect(JSON.stringify(citation)).not.toContain("credibility");
    for (const out of [serializeIcs206Plain(citation), serializeIcs206Html(citation)]) {
      expect(out.toLocaleLowerCase()).not.toContain("ajp");
      expect(out.toLocaleLowerCase()).not.toContain("admiralty");
      expect(out).not.toContain("Probably true");
    }
  });

  it("withholds the band rather than defaulting it when a claim carries no evidence", () => {
    const citation = buildIcs206Citation(input({ docs: [] }))!;
    expect(citation.estimative.likelihood).toBe("not assessable");
    expect(citation.estimative.confidence).toBe("not assessable");
    expect(serializeIcs206Plain(citation)).toContain("Likelihood (ICD 203): not assessable");
  });
});

describe("the disclosed artifact (the capability T4 holds dark)", () => {
  it("names both stages and never back-fills the extraction model (C1 / T4-b rule 3)", () => {
    const citation = buildIcs206Citation(input({ citation: DISCLOSED }))!;
    expect(citation.conformant).toBe(true);
    expect(citation.headline).toBe("BNOW.NET — ICS 206-01 source citation");
    // `claims` carries no extractor/provider column, so a per-claim extraction
    // model would be invented provenance — especially after a remap.
    expect(citation.disclosure.extraction).toBe(ICS206_EXTRACTION_UNRECORDED);
    expect(citation.disclosure.synthesis).toBe(
      "openai:gpt-4o-mini+mapreduce — model gpt-4o-mini, routing registry analysis-reg-v1, approval baseline",
    );
    const plain = serializeIcs206Plain(citation);
    expect(plain).toContain(`Extraction: ${ICS206_EXTRACTION_UNRECORDED}`);
    expect(plain).not.toContain(ICS206_WITHHELD_MARKER);
  });

  it("renders an absent or NULL version as the unstamped label, never an empty string", () => {
    const noDispatch = buildIcs206Citation(
      input({ citation: { attributable: true, tools: { provider: "openai:gpt-4o-mini", synthesis: null } } }),
    )!;
    expect(noDispatch.disclosure.synthesis).toBe(`openai:gpt-4o-mini — ${ICS206_UNSTAMPED}`);

    const nulled = buildIcs206Citation(
      input({
        citation: {
          attributable: true,
          tools: {
            provider: "openai:gpt-4o-mini",
            synthesis: {
              workload: "digest",
              provider: "openai",
              model: null,
              reasoningEffort: null,
              registryVersion: null,
              approval: null,
            },
          },
        },
      }),
    )!;
    expect(nulled.disclosure.synthesis).toBe(
      `openai:gpt-4o-mini — model ${ICS206_UNSTAMPED}, routing registry ${ICS206_UNSTAMPED}, approval ${ICS206_UNSTAMPED}`,
    );
    // all three empty slots render the label, none collapses to an empty value
    for (const out of [serializeIcs206Plain(nulled), serializeIcs206Html(nulled)]) {
      expect(out.split(ICS206_UNSTAMPED).length - 1).toBe(3);
      expect(out).not.toContain("model ,");
      expect(out).not.toContain("registry ,");
      expect(out).not.toContain("approval <");
    }
  });

  it("appends a reasoning effort only when the dispatch recorded one", () => {
    const withEffort = buildIcs206Citation(
      input({
        citation: {
          attributable: true,
          tools: { provider: "openai:gpt-5-mini", synthesis: { ...STAMP.synthesis!, model: "gpt-5-mini", reasoningEffort: "medium" } },
        },
      }),
    )!;
    expect(withEffort.disclosure.synthesis).toContain("reasoning effort medium");
    expect(buildIcs206Citation(input({ citation: DISCLOSED }))!.disclosure.synthesis).not.toContain(
      "reasoning effort",
    );
  });
});

describe("ruling 19 — the publication-guard label, verbatim", () => {
  it("carries the guard's own label for a disputed claim, as a field, not a second prefix", () => {
    for (const hedging of ["claimed", "unverified", "unknown"]) {
      const citation = buildIcs206Citation(input({ hedging }))!;
      expect(citation.attribution).toBe(ATTRIBUTION_LABEL[hedging]);
      expect(serializeIcs206Plain(citation)).toContain(`BNOW attribution: "${ATTRIBUTION_LABEL[hedging]}"`);
      // The guard already prefixed the claims it governs (publication-guard.ts:228);
      // prefixing again here would double-label the text it published.
      expect(citation.claimText).toBe(input().text);
    }
    for (const hedging of ["confirmed", "assessed"]) {
      const citation = buildIcs206Citation(input({ hedging }))!;
      expect(citation.attribution).toBeNull();
      expect(serializeIcs206Plain(citation)).not.toContain("BNOW attribution");
    }
  });

  it("classifies an out-of-enum hedging value as Unknown, matching the existing fallback", () => {
    expect(buildIcs206Citation(input({ hedging: "CONFIRMED" }))!.classification).toBe("Confirmed");
    expect(buildIcs206Citation(input({ hedging: "not-a-class" }))!.classification).toBe("Unknown");
  });
});

describe("ruling 1 — only metadata leaves the module", () => {
  it("lets no document body, ISW prose or unknown field reach any output (sentinel fixture)", () => {
    const SENTINEL = "ZZQXSENTINELZZ";
    // Every field the builder does NOT read, carrying a unique marker: if the
    // module ever starts spreading a doc or reading a body, this fails.
    const poisoned = {
      ...doc(1),
      content: `${SENTINEL}-body`,
      rawText: `${SENTINEL}-raw`,
      iswTakeaway: `${SENTINEL}-isw`,
      summary: `${SENTINEL}-summary`,
      meta: { note: `${SENTINEL}-meta` },
    } as unknown as ClaimSourceDoc;
    const citation = buildIcs206Citation(input({ docs: [poisoned] }))!;
    for (const out of [
      serializeIcs206Plain(citation),
      serializeIcs206Html(citation),
      JSON.stringify(citation),
    ]) {
      expect(out).not.toContain(SENTINEL);
    }
    // and the whitelisted metadata did survive, so the assertion is not vacuous
    expect(citation.sources[0].title).toBe("Title 1");
    expect(citation.sources[0].url).toBe("https://source1.example/item");
  });
});

describe("escaping", () => {
  it("escapes every source-controlled field in HTML and leaves plain text intact", () => {
    const citation = buildIcs206Citation(
      input({
        text: `<img src=x onerror="bad"> & claim`,
        countryName: `R&<"'`,
        docs: [
          doc(1, {
            title: `<script>alert('t')</script>`,
            sourceName: `<b>Source</b> & "co"`,
            url: `https://evil.example/"><script>alert(1)</script>`,
            adapter: `<i>rss</i>`,
            platform: null,
            citationCount: 3,
          }),
        ],
      }),
    )!;
    const html = serializeIcs206Html(citation);
    expect(html).not.toMatch(/<(script|img|b|i)\b/);
    expect(html).toContain("&lt;script&gt;alert(&#39;t&#39;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;bad&quot;&gt; &amp; claim");
    // href is escaped too — the URL is source-controlled, safeHttpUrl only checks scheme
    expect(html).toContain('href="https://evil.example/&quot;&gt;&lt;script&gt;');
    // plain text is never mangled: it is what the analyst pastes
    expect(serializeIcs206Plain(citation)).toContain(`<img src=x onerror="bad"> & claim`);
  });
});

describe("source entries", () => {
  it("degrades every optional field honestly rather than emitting an empty slot", () => {
    const citation = buildIcs206Citation(
      input({
        docs: [
          doc(1, {
            title: "   ",
            url: "not a url",
            publishedAt: null,
            sourceName: null,
            sourceKey: null,
            adapter: "telegram_mtproto",
            platform: "telegram",
            citationCount: null,
          }),
        ],
      }),
    )!;
    const entry = citation.sources[0];
    expect(entry).toMatchObject({
      index: 1,
      // claimSourceLabel's documented fallback chain: sourceName -> sourceKey ->
      // URL hostname -> adapter. With the first three unusable the adapter is the
      // honest answer; a document id would mean nothing to a reader.
      author: "telegram_mtproto",
      title: null,
      url: null,
      mediaType: "messaging-channel post",
      informationType: "publicly available information (PAI)",
      descriptor: "messaging-channel post · coverage lens: ru",
      published: null,
    });
    const plain = serializeIcs206Plain(citation);
    expect(plain).toContain("[1] telegram_mtproto. messaging-channel post;");
    expect(plain).toContain("Published: not recorded · Accessed (BNOW ingest): Jul 1, 2026, 9:00 AM ET");
    expect(plain).not.toContain("ISW-cited");
  });

  it("numbers entries from 1 and singularizes an ISW citation count of one", () => {
    const citation = buildIcs206Citation(
      input({ docs: [doc(1, { citationCount: 1 }), doc(2, { adapter: "x", platform: "x" })] }),
    )!;
    expect(citation.sources.map((s) => s.index)).toEqual([1, 2]);
    expect(citation.sources[0].descriptor).toContain("ISW-cited 1 time");
    expect(citation.sources[1].mediaType).toBe("microblog post");
    expect(citation.corroboration).toBe("2 documents · 2 channels · 2 platforms");
  });
});
