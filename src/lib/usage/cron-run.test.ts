import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { cronJobName } = await import("./cron-run");

describe("cronJobName", () => {
  it("qualifies the jobs whose schedule is split across cron entries", () => {
    // vercel.json runs digest?group=core and digest?group=gulf on separate crons;
    // one shared job name would make their success rates indistinguishable
    expect(cronJobName("digest", "core")).toBe("digest:core");
    expect(cronJobName("digest", "gulf")).toBe("digest:gulf");
    expect(cronJobName("ingest", "fast")).toBe("ingest:fast");
    expect(cronJobName("ingest", "telegram")).toBe("ingest:telegram");
    expect(cronJobName("ingest", "x")).toBe("ingest:x");
  });

  it("leaves unqualified jobs bare", () => {
    expect(cronJobName("validate")).toBe("validate");
    expect(cronJobName("enrich", null)).toBe("enrich");
    expect(cronJobName("materials", undefined)).toBe("materials");
  });
});
