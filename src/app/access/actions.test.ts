import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// requestAccess is "use server" but under vitest it is a plain async function.
// DB + email seam + after() are mocked; the pure validators run for real.

const afterCallbacks: Array<() => Promise<void> | void> = [];
vi.mock("next/server", () => ({
  after: (cb: () => Promise<void> | void) => {
    afterCallbacks.push(cb);
  },
}));

const queryMock = vi.fn<(sql: string, params: unknown[]) => Promise<unknown>>();
vi.mock("@/db", () => ({
  rawSql: { query: (sql: string, params: unknown[]) => queryMock(sql, params) },
}));

const sendMock = vi.fn<(mail: unknown) => Promise<{ delivered: boolean; via: string }>>();
vi.mock("@/lib/email/send", () => ({
  sendEmail: (mail: unknown) => sendMock(mail),
}));

const { requestAccess } = await import("./actions");

const IDLE = { status: "idle" as const };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Run every scheduled after() callback (the operator notification). */
async function flushAfter() {
  for (const cb of afterCallbacks.splice(0)) await cb();
}

/** Default DB: no recent duplicate, insert succeeds. */
function dbHappyPath() {
  queryMock.mockImplementation(async (sql) => {
    if (/^\s*SELECT/i.test(sql)) return [];
    return [];
  });
}

beforeEach(() => {
  vi.stubEnv("FEEDBACK_EMAIL", "go@vociferous.nyc");
  sendMock.mockResolvedValue({ delivered: true, via: "postmark" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  queryMock.mockReset();
  sendMock.mockReset();
  afterCallbacks.length = 0;
});

describe("requestAccess — valid submissions", () => {
  it("stores an email-only request (plan_code NULL, source access_form) and notifies the operator", async () => {
    dbHappyPath();
    const state = await requestAccess(IDLE, form({ email: " Analyst@Example.COM " }));
    expect(state).toEqual({ status: "success" });

    const insert = queryMock.mock.calls.find(([sql]) => /INSERT INTO subscribe_intents/i.test(sql))!;
    expect(insert[0]).toMatch(/plan_code, linkedin_url, use_case, source/);
    expect(insert[0]).toMatch(/utm_source, utm_medium, utm_campaign, landing_path, referrer_host/);
    expect(insert[0]).toMatch(/'access_form'/);
    expect(insert[1]).toEqual(["analyst@example.com", null, null, null, null, null, null, null]);

    await flushAfter();
    expect(sendMock).toHaveBeenCalledTimes(1);
    const mail = sendMock.mock.calls[0][0] as { to: string; subject: string; text: string };
    expect(mail.to).toBe("go@vociferous.nyc");
    expect(mail.subject).toContain("analyst@example.com");
    expect(mail.text).toContain("(not provided)");
  });

  it("stores the volunteered LinkedIn URL and use case, and includes only submitted fields in the notification", async () => {
    dbHappyPath();
    const state = await requestAccess(
      IDLE,
      form({
        email: "a@b.co",
        linkedin: "linkedin.com/in/some-analyst",
        usecase: "  Russian procurement channels  ",
      }),
    );
    expect(state).toEqual({ status: "success" });

    const insert = queryMock.mock.calls.find(([sql]) => /INSERT INTO/i.test(sql))!;
    expect(insert[1]).toEqual([
      "a@b.co",
      "https://linkedin.com/in/some-analyst",
      "Russian procurement channels",
      null,
      null,
      null,
      null,
      null,
    ]);

    await flushAfter();
    const mail = sendMock.mock.calls[0][0] as { text: string };
    expect(mail.text).toContain("https://linkedin.com/in/some-analyst");
    expect(mail.text).toContain("Russian procurement channels");
  });

  it("clamps over-long use-case text to the documented maximum", async () => {
    dbHappyPath();
    await requestAccess(IDLE, form({ email: "a@b.co", usecase: "x".repeat(5000) }));
    const insert = queryMock.mock.calls.find(([sql]) => /INSERT INTO/i.test(sql))!;
    expect((insert[1][2] as string).length).toBe(1000);
  });

  it("stores only revalidated first-party attribution fields", async () => {
    dbHappyPath();
    await requestAccess(
      IDLE,
      form({
        email: "a@b.co",
        utm_source: " LinkedIn ",
        utm_medium: "Paid-Social",
        utm_campaign: "private-beta_01",
        landing_path: "/access",
        referrer_host: "News.Example.COM",
      }),
    );
    const insert = queryMock.mock.calls.find(([sql]) => /INSERT INTO/i.test(sql))!;
    expect(insert[1].slice(3)).toEqual([
      "linkedin",
      "paid-social",
      "private-beta_01",
      "/access",
      "news.example.com",
    ]);
  });

  it("nulls malformed hidden attribution without rejecting a valid request", async () => {
    dbHappyPath();
    const state = await requestAccess(
      IDLE,
      form({
        email: "a@b.co",
        utm_source: "contains private words",
        landing_path: "/ask?q=secret",
        referrer_host: "https://example.com/path?q=secret",
      }),
    );
    expect(state).toEqual({ status: "success" });
    const insert = queryMock.mock.calls.find(([sql]) => /INSERT INTO/i.test(sql))!;
    expect(insert[1].slice(3)).toEqual([null, null, null, null, null]);
  });
});

describe("requestAccess — rejections (no insert, no notification)", () => {
  it.each([["not-an-email"], [""], ["a@b"]])("rejects email %j", async (email) => {
    const state = await requestAccess(IDLE, form({ email }));
    expect(state).toEqual({ status: "error", code: "email" });
    expect(queryMock).not.toHaveBeenCalled();
    await flushAfter();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it.each([
    ["https://evil-linkedin.com/in/x"],
    ["http://linkedin.com/in/x"],
    ["https://user:pass@linkedin.com/in/x"],
  ])("rejects LinkedIn %s", async (linkedin) => {
    const state = await requestAccess(IDLE, form({ email: "a@b.co", linkedin }));
    expect(state).toEqual({ status: "error", code: "linkedin" });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("requestAccess — honeypot", () => {
  it("returns the generic success without touching the DB or notifying", async () => {
    const state = await requestAccess(
      IDLE,
      form({ email: "a@b.co", website: "https://spam.example" }),
    );
    expect(state).toEqual({ status: "success" });
    expect(queryMock).not.toHaveBeenCalled();
    await flushAfter();
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("requestAccess — dedupe window", () => {
  it("collapses a repeat submission silently: same success, no second row, no second email", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (/^\s*SELECT/i.test(sql)) return [{ id: 7 }]; // recent identical email exists
      throw new Error("insert must not run");
    });
    const state = await requestAccess(IDLE, form({ email: "a@b.co" }));
    expect(state).toEqual({ status: "success" });
    expect(queryMock.mock.calls.some(([sql]) => /INSERT/i.test(sql))).toBe(false);
    await flushAfter();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("scopes dedupe to the same address — a new address still inserts and notifies", async () => {
    dbHappyPath();
    await requestAccess(IDLE, form({ email: "new@desk.org" }));
    expect(queryMock.mock.calls.some(([sql]) => /INSERT/i.test(sql))).toBe(true);
    await flushAfter();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

describe("requestAccess — failure handling", () => {
  it("returns a generic error on DB failure and never leaks the raw message", async () => {
    queryMock.mockRejectedValue(new Error("FATAL: db exploded at ep-secret-host"));
    const state = await requestAccess(IDLE, form({ email: "a@b.co" }));
    expect(state).toEqual({ status: "error", code: "generic" });
    expect(JSON.stringify(state)).not.toContain("exploded");
    expect(JSON.stringify(state)).not.toContain("ep-secret-host");
    await flushAfter();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("still succeeds for the requester when the operator notification fails", async () => {
    dbHappyPath();
    sendMock.mockRejectedValue(new Error("postmark down"));
    const state = await requestAccess(IDLE, form({ email: "a@b.co" }));
    expect(state).toEqual({ status: "success" });
    await expect(flushAfter()).resolves.toBeUndefined(); // failure swallowed inside after()
  });

  it("skips the notification (but stores the row) when FEEDBACK_EMAIL is unset", async () => {
    vi.stubEnv("FEEDBACK_EMAIL", "");
    dbHappyPath();
    const state = await requestAccess(IDLE, form({ email: "a@b.co" }));
    expect(state).toEqual({ status: "success" });
    expect(queryMock.mock.calls.some(([sql]) => /INSERT/i.test(sql))).toBe(true);
    await flushAfter();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
