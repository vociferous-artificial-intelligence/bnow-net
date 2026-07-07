import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawDoc, SourceAdapter } from "./types";

// Deterministic fixture-backed stubs for keyed integrations (see docs/BLOCKERS.md).
// They exist to exercise the adapter interface in tests — they are NOT wired into
// production ingest (truth-in-UI: fixture content must never enter the analysis
// corpus; see docs/reviews/TASK-1-REVIEW.md). Every fixture doc's content starts
// with STUB_CONTENT_PREFIX so corpus queries can exclude any stray rows.

/** Marker prefix on every stub fixture document's content. */
export const STUB_CONTENT_PREFIX = "[STUB FIXTURE]";

function loadFixture(name: string): RawDoc[] {
  try {
    const raw = readFileSync(join(process.cwd(), "fixtures", "adapters", name), "utf8");
    const rows = JSON.parse(raw) as Array<Omit<RawDoc, "publishedAt"> & { publishedAt: string | null }>;
    return rows.map((r) => ({ ...r, publishedAt: r.publishedAt ? new Date(r.publishedAt) : null }));
  } catch {
    return [];
  }
}

class FixtureStubAdapter implements SourceAdapter {
  readonly live = false;
  constructor(
    readonly name: string,
    private fixture: string,
    private requiredEnv: string[],
  ) {}

  get missingEnv(): string[] {
    return this.requiredEnv.filter((k) => !process.env[k]);
  }

  async fetchLatest(): Promise<RawDoc[]> {
    // When credentials appear, this stub keeps working but logs loudly so the
    // real implementation gets wired in (see BLOCKERS.md for each service).
    if (this.missingEnv.length === 0) {
      console.warn(`${this.name}: credentials present but adapter still stubbed`);
    }
    return loadFixture(this.fixture);
  }
}

/** MTProto (GramJS) — real impl pending TELEGRAM_API_ID/HASH. */
export const telegramMtprotoStub = new FixtureStubAdapter(
  "telegram_mtproto",
  "telegram-mtproto.json",
  ["TELEGRAM_API_ID", "TELEGRAM_API_HASH"],
);

/** X API v2 — pending X_BEARER_TOKEN (paid). */
export const xStub = new FixtureStubAdapter("x", "x.json", ["X_BEARER_TOKEN"]);

/** ACLED event data — pending ACLED_API_KEY/ACLED_EMAIL. */
export const acledStub = new FixtureStubAdapter("acled", "acled.json", [
  "ACLED_API_KEY",
  "ACLED_EMAIL",
]);
