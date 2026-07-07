import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// x-api.ts transitively imports src/db (DATABASE_URL at module load); the pure
// parser functions under test never touch the DB.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const {
  buildSearchQuery,
  chunk,
  parseTwitterDate,
  tweetToRawDoc,
  tweetsFromResponse,
  X_MIN_USD_PER_REQUEST,
  X_USD_PER_TWEET,
} = await import("./x-api");
import type { XAccount } from "./x-api";

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), "fixtures", "adapters", name), "utf8"));

const CENTCOM: XAccount = {
  userName: "centcom",
  sourceKey: "x.com/centcom",
  countryIso2: "ru",
  citations: 105,
};
const SENTDEFENDER: XAccount = {
  userName: "sentdefender",
  sourceKey: "x.com/sentdefender",
  countryIso2: "ru",
  citations: 50,
};

describe("tweetsFromResponse", () => {
  it("reads advanced_search shape (top-level tweets)", () => {
    const tweets = tweetsFromResponse(fixture("x-api-advanced-search.json"));
    expect(tweets.length).toBe(7);
    expect(tweets[0].id).toMatch(/^\d+$/);
  });

  it("reads last_tweets shape (data.tweets)", () => {
    const tweets = tweetsFromResponse(fixture("x-api-last-tweets.json"));
    expect(tweets.length).toBe(4);
    expect(tweets[0].author?.userName).toBe("CENTCOM");
  });

  it("returns [] on junk", () => {
    expect(tweetsFromResponse(null)).toEqual([]);
    expect(tweetsFromResponse({ status: "error" })).toEqual([]);
    expect(tweetsFromResponse("nope")).toEqual([]);
  });
});

describe("parseTwitterDate", () => {
  it("parses the Twitter classic format", () => {
    const d = parseTwitterDate("Tue Jul 07 17:50:06 +0000 2026");
    expect(d?.toISOString()).toBe("2026-07-07T17:50:06.000Z");
  });
  it("returns null on garbage/missing", () => {
    expect(parseTwitterDate("not a date")).toBeNull();
    expect(parseTwitterDate(null)).toBeNull();
  });
});

describe("tweetToRawDoc", () => {
  const tweets = tweetsFromResponse(fixture("x-api-advanced-search.json"));

  it("normalizes a plain tweet with attribution and metadata", () => {
    const t = tweets.find((x) => x.author?.userName === "CENTCOM" && !x.retweeted_tweet)!;
    const doc = tweetToRawDoc(t, CENTCOM);
    expect(doc.adapter).toBe("x_api");
    expect(doc.externalId).toBe(t.id);
    expect(doc.sourceKey).toBe("x.com/centcom");
    expect(doc.countryIso2).toBe("ru");
    expect(doc.url).toContain(t.id);
    expect(doc.publishedAt).toBeInstanceOf(Date);
    expect(doc.content.length).toBeGreaterThan(0);
    expect(doc.meta).toHaveProperty("retweetCount");
  });

  it("re-tags uk-language tweets to the ua theater (telegram-web convention)", () => {
    const t = tweets.find((x) => x.lang === "uk")!;
    const doc = tweetToRawDoc(t, SENTDEFENDER);
    expect(doc.countryIso2).toBe("ua");
    expect(doc.lang).toBe("uk");
  });

  it("recovers the full original text for truncated retweets", () => {
    const t = tweets.find((x) => x.retweeted_tweet)!;
    const doc = tweetToRawDoc(t, CENTCOM);
    expect(doc.content).toContain("untruncated");
    expect(doc.content).toContain("RT @some_orig:");
    expect(doc.content).not.toContain("…");
  });

  it("falls back to detectLang when the API lang is unknown", () => {
    const doc = tweetToRawDoc(
      {
        id: "1",
        text: "Российские войска продвинулись в районе Покровска",
        lang: "und",
        author: { userName: "centcom" },
      },
      CENTCOM,
    );
    expect(doc.lang).toBe("ru");
  });
});

describe("buildSearchQuery / chunk", () => {
  it("builds an OR query with since_time", () => {
    const q = buildSearchQuery([CENTCOM, SENTDEFENDER], 1751900000);
    expect(q).toBe("(from:centcom OR from:sentdefender) since_time:1751900000");
  });
  it("adds until_time when given", () => {
    const q = buildSearchQuery([CENTCOM], 1, 2);
    expect(q).toBe("(from:centcom) since_time:1 until_time:2");
  });
  it("chunks account lists", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe("cost constants", () => {
  it("match twitterapi.io's published rates", () => {
    expect(X_USD_PER_TWEET).toBe(0.00015); // $0.15 / 1k tweets
    expect(X_MIN_USD_PER_REQUEST).toBe(0.00015); // minimum charge per request
  });
});
