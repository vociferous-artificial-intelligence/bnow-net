import "./env";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCache } from "../src/lib/fetch-cache";
import { parseReport } from "../src/lib/isw/parse";

// Parse every cached ROCA page -> data/derived/parsed-reports.jsonl (one line per report).
// Idempotent: full rewrite each run (parse is cheap, ~seconds for all pages).

async function main() {
  // Usage: tsx scripts/isw-parse.ts [--urls <file>] [--out <jsonl>]
  const urlsIdx = process.argv.indexOf("--urls");
  const outIdx = process.argv.indexOf("--out");
  const urlFile = urlsIdx !== -1 ? process.argv[urlsIdx + 1] : "data/cache/roca-urls.txt";
  const outFile = outIdx !== -1 ? process.argv[outIdx + 1] : "data/derived/parsed-reports.jsonl";
  const urls = readFileSync(join(process.cwd(), urlFile), "utf8").trim().split("\n");

  mkdirSync("data/derived", { recursive: true });
  const out = join(process.cwd(), outFile);
  writeFileSync(out, "");

  let cached = 0,
    ok = 0,
    failed = 0,
    totalCitations = 0;
  const failures: string[] = [];

  for (const url of urls) {
    const html = readCache(url);
    if (html === null) continue;
    cached++;
    const parsed = parseReport(url, html);
    if (parsed.parseOk) {
      ok++;
      totalCitations += parsed.citations.length;
    } else {
      failed++;
      failures.push(`${url} :: ${parsed.parseNotes.join(",")}`);
    }
    appendFileSync(out, JSON.stringify(parsed) + "\n");
  }

  console.log(
    JSON.stringify(
      {
        urlsKnown: urls.length,
        pagesCached: cached,
        parseOk: ok,
        parseFailed: failed,
        parseRate: cached ? +(ok / cached).toFixed(4) : 0,
        totalCitations,
      },
      null,
      2,
    ),
  );
  if (failures.length) {
    writeFileSync("data/derived/parse-failures.log", failures.join("\n") + "\n");
    console.log(`failures written to data/derived/parse-failures.log (${failures.length})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
