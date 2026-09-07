import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Refuse-before-reserve at the ENTITY_AUDIT dispatch site (2026-09-06 provider
// dimension). The route resolves workloadDispatchConfig("entity_audit") before
// entityAuditGuardFromEnv().init(), before tryReserve, before withCronRun (so
// no cron_runs row is even opened) and before the OpenAI client exists: a
// provider outside the workload allowlist returns 503 having spent nothing
// (standing ruling 4). Everything downstream is mocked, so the "never called"
// assertions are literal.

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.CRON_SECRET = "test-secret";

const { poolCtor, guardInit, guardReserve, guardRecord, ctorSpy, createSpy, withCronRun } =
  vi.hoisted(() => ({
    poolCtor: vi.fn(),
    guardInit: vi.fn(async () => {}),
    guardReserve: vi.fn(() => ({ ok: true as const })),
    guardRecord: vi.fn(async () => {}),
    ctorSpy: vi.fn(),
    createSpy: vi.fn(),
    withCronRun: vi.fn(),
  }));

vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    constructor(opts?: unknown) {
      poolCtor(opts);
    }
    query = async () => ({ rows: [] });
    end = async () => {};
  },
}));

vi.mock("@/lib/analysis/openai-client", () => ({
  analysisOpenAiClient: () => {
    ctorSpy();
    return { chat: { completions: { create: createSpy } } };
  },
}));

vi.mock("@/lib/usage/llm-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/usage/llm-guard")>();
  return {
    ...actual,
    entityAuditGuardFromEnv: () => ({
      init: guardInit,
      tryReserve: guardReserve,
      record: guardRecord,
    }),
  };
});

vi.mock("@/lib/usage/cron-run", () => ({ withCronRun }));

const { GET } = await import("./route");

const ENV_KEYS = [
  "ENTITY_AUDIT_PROVIDER",
  "ENTITY_AUDIT_MODEL",
  "ENTITY_AUDIT_REASONING_EFFORT",
  "OPENAI_MODEL",
  "LLM_DISABLE",
] as const;

function req() {
  return new NextRequest("https://bnow.net/api/cron/entity-audit", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.OPENAI_API_KEY = "test-key";
  poolCtor.mockClear();
  guardInit.mockClear();
  guardReserve.mockClear();
  ctorSpy.mockClear();
  createSpy.mockReset();
  withCronRun.mockReset();
  withCronRun.mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("entity-audit route — provider refused before reservation", () => {
  it("a non-allowlisted ENTITY_AUDIT_PROVIDER returns 503 and spends nothing", async () => {
    process.env.ENTITY_AUDIT_PROVIDER = "anthropic";
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not allowed for workload "entity_audit"/);
    expect(guardInit).not.toHaveBeenCalled();
    expect(guardReserve).not.toHaveBeenCalled();
    expect(ctorSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(withCronRun).not.toHaveBeenCalled(); // no cron_runs row opened
    expect(poolCtor).not.toHaveBeenCalled();
  });

  it("an unknown ENTITY_AUDIT_PROVIDER refuses the same way", async () => {
    process.env.ENTITY_AUDIT_PROVIDER = "not-a-vendor";
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/is not a known provider/);
    expect(guardInit).not.toHaveBeenCalled();
    expect(withCronRun).not.toHaveBeenCalled();
  });

  it("the pin is not vacuous: with the provider absent the run reaches the guard and the cron row", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(guardInit).toHaveBeenCalledOnce();
    expect(guardReserve).toHaveBeenCalledOnce();
    expect(withCronRun).toHaveBeenCalledOnce();
  });
});
