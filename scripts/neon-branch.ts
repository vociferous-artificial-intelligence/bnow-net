// Disposable Neon branch management for integration tests.
//   npx tsx scripts/neon-branch.ts create   -> prints {branchId, connectionString}
//   npx tsx scripts/neon-branch.ts delete <branchId>
// A branch is an instant copy-on-write fork of production (schema + data + roles);
// tests run against the fork and the fork is deleted afterwards. Requires
// NEON_API_KEY + NEON_PROJECT_ID (already in .env.local).
import "./env";

const API = "https://console.neon.tech/api/v2";
const KEY = process.env.NEON_API_KEY;
const PROJECT = process.env.NEON_PROJECT_ID;

async function neon(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function create() {
  const res = await neon(`/projects/${PROJECT}/branches`, {
    method: "POST",
    body: JSON.stringify({
      branch: { name: `itest-${Date.now()}` },
      endpoints: [{ type: "read_write" }],
    }),
  });
  if (!res.ok) throw new Error(`branch create failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    branch: { id: string };
    endpoints?: Array<{ host: string }>;
    connection_uris?: Array<{ connection_uri: string }>;
  };

  let conn = json.connection_uris?.[0]?.connection_uri ?? null;
  if (!conn && json.endpoints?.[0]?.host && process.env.DATABASE_URL) {
    // roles/passwords are copied to the branch; swap the host in the parent URL
    const u = new URL(process.env.DATABASE_URL);
    u.hostname = json.endpoints[0].host;
    conn = u.toString();
  }
  if (!conn) throw new Error("no connection string derivable from branch response");
  console.log(JSON.stringify({ branchId: json.branch.id, connectionString: conn }));
}

async function del(branchId: string) {
  const res = await neon(`/projects/${PROJECT}/branches/${branchId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`branch delete failed: ${res.status} ${await res.text()}`);
  console.log(`deleted ${branchId}`);
}

const [cmd, arg] = process.argv.slice(2);
const run =
  cmd === "create" ? create() :
  cmd === "delete" && arg ? del(arg) :
  Promise.reject(new Error("usage: neon-branch.ts create | delete <branchId>"));
run.then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1); });
