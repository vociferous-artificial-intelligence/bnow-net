// Persistence-gate call pin for the conflict profile adapter (Gate-5
// control-plane MINOR-1): deleting the adapter's
// `assertPersistableConflictResultV1(result)` call previously failed ZERO
// tests. Ruling-21 spy pattern: the gate is mocked as a SPY around the real
// implementation (never a no-op), and the pins count its invocations per
// scored case.
//
// The counting is deliberate and explained: on a SCORED case the gate runs
// TWICE (once inside the pure scorer at the end of the scored path, once at
// the adapter's durable-write seam) — deleting the adapter call would leave
// 1. On a publication-GAP case the scorer's gap path never reaches its own
// gate call, so the adapter's call is the ONLY one — deleting it leaves 0.
// The gap-case pin is therefore the clean mutation kill; the scored-case pin
// documents the twin-call architecture.

import { describe, expect, it, vi } from "vitest";

vi.mock("../conflicts/eval-profile", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../conflicts/eval-profile")>();
  return {
    ...mod,
    assertPersistableConflictResultV1: vi.fn(mod.assertPersistableConflictResultV1),
  };
});

import { assertPersistableConflictResultV1 } from "../conflicts/eval-profile";
import { buildConflictEvalRun, scoreConflictOfflineCase } from "./conflict-validation-profile";

const gateSpy = vi.mocked(assertPersistableConflictResultV1);

describe("the adapter calls the persistence gate before writing a durable result", () => {
  it("publication-gap case: the adapter's gate call is the ONLY one (mutation kill)", async () => {
    const run = buildConflictEvalRun("iran_regional");
    gateSpy.mockClear();
    const result = await scoreConflictOfflineCase(run, "cc-publication-gap-002", 0, "spy-run");
    expect(result.checks.pass).toBe(true);
    expect(gateSpy).toHaveBeenCalledTimes(1);
    expect(gateSpy.mock.calls[0][0]).toMatchObject({ state: "unavailable" });
  });

  it("scored case: the gate runs twice — the scorer's own call plus the adapter's durable-write call", async () => {
    const run = buildConflictEvalRun("russia_ukraine");
    gateSpy.mockClear();
    const result = await scoreConflictOfflineCase(run, "roca-ua-only-001b", 0, "spy-run");
    expect(result.checks.pass).toBe(true);
    expect(gateSpy).toHaveBeenCalledTimes(2);
    expect(gateSpy.mock.calls[1][0]).toMatchObject({ state: "scored" });
  });
});
