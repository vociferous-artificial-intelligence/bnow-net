import "./env";
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { politeFetch, isCached } from "../src/lib/fetch-cache";

// Fetch ISW reports into the disk cache. Resumable: cached URLs are skipped.
// Usage: tsx scripts/isw-fetch.ts [--sample N] [--urls <file>]
//   default url file: data/cache/roca-urls.txt (Russia); pass --urls for other theaters.

async function main() {
  const urlsIdx = process.argv.indexOf("--urls");
  const urlFile = urlsIdx !== -1 ? process.argv[urlsIdx + 1] : "data/cache/roca-urls.txt";
  const urls = readFileSync(join(process.cwd(), urlFile), "utf8").trim().split("\n");

  const sampleIdx = process.argv.indexOf("--sample");
  let targets = urls;
  if (sampleIdx !== -1) {
    const n = parseInt(process.argv[sampleIdx + 1], 10);
    const step = Math.max(1, Math.floor(urls.length / n));
    targets = urls.filter((_, i) => i % step === 0).slice(0, n);
  }

  mkdirSync("data", { recursive: true });
  let ok = 0,
    cached = 0,
    failed = 0;
  for (const [i, url] of targets.entries()) {
    if (isCached(url)) {
      cached++;
      continue;
    }
    const res = await politeFetch(url);
    if (res && res.status === 200 && res.html.length > 1000) ok++;
    else {
      failed++;
      appendFileSync("data/isw-fetch-failures.log", `${new Date().toISOString()} ${res?.status ?? "ERR"} ${url}\n`);
    }
    if ((i + 1) % 25 === 0)
      console.log(`${i + 1}/${targets.length} (new=${ok} cached=${cached} failed=${failed})`);
  }
  console.log(`done: total=${targets.length} new=${ok} cached=${cached} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
