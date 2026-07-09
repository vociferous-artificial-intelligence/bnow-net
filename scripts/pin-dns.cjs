/* eslint-disable @typescript-eslint/no-require-imports -- NODE_OPTIONS --require preloads must be CommonJS */
// Preload: route vercel.com / vercel.app / openai.com DNS through 1.1.1.1.
// The WSL2 NAT resolver (10.255.255.254) times out on these domains while
// public resolvers answer instantly — this is the "local host cannot reach
// OpenAI/Vercel" quirk. Everything else uses the normal resolver.
//   NODE_OPTIONS="--require ./scripts/pin-dns.cjs" npx vercel@latest deploy --prod
//   NODE_OPTIONS="--require ./scripts/pin-dns.cjs" npx tsx scripts/backtest-validate-only.ts ...
const dns = require("node:dns");

const PINNED = /(^|\.)(vercel\.(com|app)|openai\.com|understandingwar\.org)$/i;
const resolver = new dns.Resolver({ timeout: 3000, tries: 2 });
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

const origLookup = dns.lookup.bind(dns);
function patchedLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  if (!PINNED.test(hostname)) return origLookup(hostname, options, callback);
  resolver.resolve4(hostname, (err, addrs) => {
    if (err || !addrs || addrs.length === 0) return origLookup(hostname, options, callback);
    if (options && options.all) {
      callback(null, addrs.map((address) => ({ address, family: 4 })));
    } else {
      callback(null, addrs[0], 4);
    }
  });
}
dns.lookup = patchedLookup;
try {
  dns.promises.lookup = require("node:util").promisify(patchedLookup);
} catch {
  /* promises API patch is best-effort */
}
