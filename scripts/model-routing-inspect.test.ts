// Subprocess pins for the dry-run routing inspector. It is the operator's
// read-only decision surface for "what would each analysis workload dispatch
// right now", so its provider column and its refusal wording are pinned as
// OUTPUT, not merely as library behaviour. Zero provider requests, zero DB.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const TSX_BIN = join(process.cwd(), "node_modules", ".bin", "tsx");
const SCRIPT = join(process.cwd(), "scripts", "model-routing-inspect.ts");

/** Every routing env cleared, every paid key blanked: the inspector makes no
 *  provider call, but a blanked key removes even the possibility. */
const CLEARED = {
  ...process.env,
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  DATABASE_URL: "",
  OPENAI_MODEL: "",
  MAP_MODEL: "",
  REDUCE_MODEL: "",
  DIGEST_MODEL: "",
  VALIDATION_MODEL: "",
  ENTITY_AUDIT_MODEL: "",
  MAP_REASONING_EFFORT: "",
  REDUCE_REASONING_EFFORT: "",
  DIGEST_REASONING_EFFORT: "",
  VALIDATION_REASONING_EFFORT: "",
  ENTITY_AUDIT_REASONING_EFFORT: "",
  MAP_PROVIDER: "",
  REDUCE_PROVIDER: "",
  DIGEST_PROVIDER: "",
  VALIDATION_PROVIDER: "",
  ENTITY_AUDIT_PROVIDER: "",
};

function inspect(extra: Record<string, string> = {}) {
  const out = spawnSync(TSX_BIN, [SCRIPT], {
    env: { ...CLEARED, ...extra },
    encoding: "utf8",
    timeout: 120_000,
  });
  return { status: out.status, stdout: out.stdout ?? "", stderr: out.stderr ?? "" };
}

describe("model-routing-inspect — provider column and refusals", () => {
  it("with every routing env absent, all five workloads print provider=openai and dispatch ok", () => {
    const r = inspect();
    expect(r.status).toBe(0);
    for (const w of ["map", "reduce", "digest", "validation", "entity_audit"]) {
      expect(r.stdout).toMatch(new RegExp(`^\\s+${w}\\s+provider=openai\\s+gpt-4o-mini.*\\bok$`, "m"));
    }
    expect(r.stdout).toContain("No provider request was made by this inspection.");
  }, 120_000);

  it("a disallowed provider prints BLOCKED with the allowlist reason and its env-var name", () => {
    // digest admits anthropic since 2026-09-06, so the allowlist rung is shown
    // with a provider no workload admits
    const r = inspect({ DIGEST_PROVIDER: "openai_compatible" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(
      /digest\s+provider=openai_compatible\(DIGEST_PROVIDER\).*BLOCKED: provider "openai_compatible" is not allowed for workload "digest" \(allowed: openai\|anthropic\)/,
    );
    // one bad workload never blocks the others
    expect(r.stdout).toMatch(/^\s+reduce\s+provider=openai.*\bok$/m);
  }, 120_000);

  it("an ALLOWED but unapproved DIGEST_PROVIDER=anthropic prints BLOCKED on pricing, not on the allowlist", () => {
    // what the digest widening actually did: the refusal moved one rung down.
    // The inspector is where an operator would check that before setting an env.
    const r = inspect({ DIGEST_PROVIDER: "anthropic", DIGEST_MODEL: "claude-not-priced" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(
      /digest\s+provider=anthropic\(DIGEST_PROVIDER\).*BLOCKED: model "claude-not-priced" is not priced for provider "anthropic"/,
    );
    expect(r.stdout).not.toMatch(/digest.*not allowed for workload "digest"/);
  }, 120_000);

  it("an unknown provider prints BLOCKED naming the known ids", () => {
    const r = inspect({ VALIDATION_PROVIDER: "not-a-vendor" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/BLOCKED: VALIDATION_PROVIDER="not-a-vendor" is not a known provider/);
  }, 120_000);

  it("MAP_PROVIDER=anthropic reports the ALLOWLIST refusal, never the map lock", () => {
    const r = inspect({ MAP_PROVIDER: "anthropic" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/map\s+provider=anthropic\(MAP_PROVIDER\).*not allowed for workload "map"/);
    expect(r.stdout).not.toContain("MAP ACTIVATION BLOCKED: map may dispatch only");
  }, 120_000);

  it("the footer states the shipped allowlist and that naming is not permission", () => {
    const r = inspect();
    expect(r.stdout).toContain(
      "Provider allowlist (src/lib/llm/providers.ts): map={openai} reduce={openai} digest={openai,anthropic} validation={openai} entity_audit={openai}",
    );
    expect(r.stdout).toContain(
      "Nameable provider ids (naming is NOT permission): openai, anthropic, openai_compatible",
    );
  }, 120_000);
});
