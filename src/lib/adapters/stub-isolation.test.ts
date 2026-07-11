import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STUB_CONTENT_PREFIX, acledStub, xStub } from "./stubs";

// ingest/run.ts transitively imports src/db, which requires DATABASE_URL at module
// load. buildIngestAdapters("fast") never touches the DB at runtime, so a dummy
// URL + dynamic import keeps this a pure unit test.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { buildIngestAdapters } = await import("../ingest/run");

// Truth-in-UI invariant: fixture stub documents must never enter the production
// analysis corpus — not at ingest (stubs are unwired) and not at digest time
// (the corpus query excludes STUB_CONTENT_PREFIX rows as belt-and-braces).

// telegram_mtproto left this set 2026-07-11: its stub was deleted and the name
// now belongs to the real MTProto adapter.
const STUB_ADAPTER_NAMES = new Set([xStub.name, acledStub.name]);

describe("stub fixture isolation", () => {
  it("every stub fixture doc's content starts with the stub marker", async () => {
    for (const stub of [xStub, acledStub]) {
      const docs = await stub.fetchLatest();
      expect(docs.length).toBeGreaterThan(0);
      for (const d of docs) {
        expect(d.content.startsWith(STUB_CONTENT_PREFIX)).toBe(true);
      }
    }
  });

  it("the stub fixture files themselves carry the marker on every doc", () => {
    // direct file check (fetchLatest may silently skip unparseable fixtures)
    const dir = join(process.cwd(), "fixtures", "adapters");
    for (const f of ["x.json", "acled.json"]) {
      const rows = JSON.parse(readFileSync(join(dir, f), "utf8")) as Array<{ content: string }>;
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.content.startsWith(STUB_CONTENT_PREFIX), `${f} doc missing marker`).toBe(true);
      }
    }
  });

  it("production ingest wires no stub adapters", async () => {
    const adapters = await buildIngestAdapters("fast");
    expect(adapters.length).toBeGreaterThan(0);
    for (const a of adapters) {
      expect(STUB_ADAPTER_NAMES.has(a.name), `${a.name} is a stub`).toBe(false);
      expect(a.live).not.toBe(false);
    }
  });

  it("digest corpus query excludes stub-marked content", () => {
    // The gather query in analysis/digest.ts must carry the NOT LIKE guard bound
    // to STUB_CONTENT_PREFIX. Source-level assertion; the integration test suite
    // additionally proves it end-to-end against a real database.
    const src = readFileSync(
      join(process.cwd(), "src", "lib", "analysis", "digest.ts"),
      "utf8",
    );
    expect(src).toContain("rd.content NOT LIKE $3");
    expect(src).toContain("STUB_CONTENT_PREFIX");
  });
});
