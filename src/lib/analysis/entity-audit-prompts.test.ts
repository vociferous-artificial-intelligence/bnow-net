import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENTITY_AUDIT_SYSTEM,
  entityAuditListing,
  entityAuditRequest,
  type EntityAuditRow,
} from "./entity-audit-prompts";
import type { AnalysisDispatchConfig } from "../llm/model-config";

// PR-2.4-2: the entity-audit prompt and request move out of the route into a
// pure module. The whole value of the move is that it changed NOTHING that
// production sends, so the tests are goldens against the pre-extraction state
// rather than descriptions of the new code.

/** sha256 of the SYSTEM template as it stood in route.ts immediately before
 *  the extraction (measured at the commit that moved it). A change to the
 *  prompt must be a deliberate diff to this constant, never a side effect. */
const SYSTEM_SHA256_PRE_EXTRACTION =
  "2991b4ae1eea2e5de2db168e34b4c064f9a2693c55962d95e0928b8ef42e2c4b";

const DISPATCH: AnalysisDispatchConfig = {
  workload: "entity_audit",
  provider: "openai",
  model: "gpt-4o-mini",
  reasoningCapable: false,
  reasoningEffort: null,
  approvalStatus: "baseline",
  registryVersion: "analysis-reg-v1",
};

const ROWS: EntityAuditRow[] = [
  { id: 1, kind: "person", name: "Sergei Shoigu", claims: 12, sample: "Shoigu inspected the plant" },
  { id: 2, kind: "org", name: "Rosatom", claims: 3, sample: null },
];

describe("entity-audit prompt module (byte-identical to the pre-extraction route)", () => {
  it("the system template is the same bytes it was inside the route", () => {
    expect(createHash("sha256").update(ENTITY_AUDIT_SYSTEM, "utf8").digest("hex")).toBe(
      SYSTEM_SHA256_PRE_EXTRACTION,
    );
    expect(ENTITY_AUDIT_SYSTEM.length).toBe(1065);
  });

  it("the listing renders the route's exact line shape, sample clipped to 120 and omitted when null", () => {
    expect(entityAuditListing(ROWS)).toBe(
      '1 | person | Sergei Shoigu | claims=12 | e.g. "Shoigu inspected the plant"\n2 | org | Rosatom | claims=3',
    );
    const long = entityAuditListing([{ id: 9, kind: "org", name: "X", claims: 0, sample: "a".repeat(200) }]);
    expect(long).toBe(`9 | org | X | claims=0 | e.g. "${"a".repeat(120)}"`);
    // a falsy-but-present sample takes the same branch the route took
    expect(entityAuditListing([{ id: 9, kind: "org", name: "X", claims: 0, sample: "" }])).toBe(
      "9 | org | X | claims=0",
    );
    expect(entityAuditListing([])).toBe("");
  });

  it("the request deep-equals the literal the route built before the move", () => {
    const listing = entityAuditListing(ROWS);
    // this object is the pre-extraction literal, copied verbatim from
    // route.ts's run() at the commit before this one
    expect(entityAuditRequest(DISPATCH, listing)).toEqual({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ENTITY_AUDIT_SYSTEM },
        { role: "user", content: `Entities:\n${listing}` },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });
  });

  it("the serialized key order is unchanged, so the request bytes are too", () => {
    expect(Object.keys(entityAuditRequest(DISPATCH, "x"))).toEqual([
      "model",
      "messages",
      "temperature",
      "response_format",
    ]);
  });

  it("a reasoning model drops temperature and gains reasoning_effort, exactly as analysisChatParams decides", () => {
    const req = entityAuditRequest(
      { ...DISPATCH, model: "gpt-5-mini", reasoningCapable: true, reasoningEffort: "low" },
      "x",
    );
    expect(req).not.toHaveProperty("temperature");
    expect(req).toMatchObject({ model: "gpt-5-mini", reasoning_effort: "low" });
  });

  it("the route no longer builds a request of its own, and the module stays pure", () => {
    const route = readFileSync(
      join(__dirname, "..", "..", "app", "api", "cron", "entity-audit", "route.ts"),
      "utf8",
    );
    expect(route).not.toMatch(/\bmessages:\s*\[/);
    expect(route).not.toMatch(/\bresponse_format:/);
    expect(route).not.toMatch(/const SYSTEM =/);
    expect(route).toContain('from "@/lib/analysis/entity-audit-prompts"');

    // pure: no env, no DB, no client, no network, no eval library. Comments
    // are stripped first — the module's own docstring names several of these
    // to explain why they are absent, and a prose mention is not a reference.
    const mod = readFileSync(join(__dirname, "entity-audit-prompts.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of ["process.env", "@/db", "openai-client", "fetch(", "evals/"]) {
      expect(mod.includes(forbidden), `entity-audit-prompts.ts must not reference ${forbidden}`).toBe(false);
    }
  });
});
