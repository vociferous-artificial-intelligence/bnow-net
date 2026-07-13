import { sql as dsql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

// Operator review surface for beta access requests (subscribe_intents), newest
// first. Gated by the /admin layout's requireAdmin(). Approval is the one-field
// update that makes SIGNIN_MODE=invite admit the requester:
//   UPDATE subscribe_intents SET request_status='approved' WHERE id=<id>;
// (runnable via scripts/sqlq.ts until a write UI exists).

export default async function AccessRequestsPage() {
  const [recent, counts] = await Promise.all([
    db.execute(dsql`
      SELECT id, email, request_status, linkedin_url, use_case, source, plan_code,
             created_at
      FROM subscribe_intents ORDER BY created_at DESC LIMIT 200`),
    db.execute(dsql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE request_status = 'new')::int AS fresh
      FROM subscribe_intents`),
  ]);

  const rows = recent.rows as Array<{
    id: number;
    email: string;
    request_status: string;
    linkedin_url: string | null;
    use_case: string | null;
    source: string | null;
    plan_code: string | null;
    created_at: string;
  }>;
  const { total, fresh } = counts.rows[0] as { total: number; fresh: number };

  return (
    <main className="mx-auto max-w-5xl p-6 font-mono text-sm">
      <h1 className="mb-1 text-xl font-bold">
        /admin/access · {Number(total).toLocaleString()} requests ({Number(fresh).toLocaleString()} new)
      </h1>
      <p className="mb-6 text-xs text-gray-500">
        Approve: set request_status=&apos;approved&apos; on the row (admits the address under
        SIGNIN_MODE=invite). LinkedIn URLs are stored as volunteered — never fetched.
      </p>

      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
            <th className="py-1">id</th>
            <th>email</th>
            <th>status</th>
            <th>monitors</th>
            <th>linkedin</th>
            <th>via</th>
            <th className="text-right">created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-200 align-top dark:border-gray-800">
              <td className="py-1 pr-2 text-gray-500">{r.id}</td>
              <td className="pr-2">{r.email}</td>
              <td className="pr-2">
                <span className={r.request_status === "new" ? "font-semibold" : "text-gray-500"}>
                  {r.request_status}
                </span>
              </td>
              <td className="max-w-64 break-words pr-2 text-gray-600 dark:text-gray-300">
                {r.use_case ?? "—"}
              </td>
              <td className="max-w-48 break-all pr-2">
                {r.linkedin_url ? (
                  <a
                    href={r.linkedin_url}
                    rel="nofollow noopener noreferrer"
                    className="underline"
                  >
                    {r.linkedin_url.replace(/^https:\/\//, "")}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="pr-2 text-gray-500">{r.source ?? r.plan_code ?? "—"}</td>
              <td className="whitespace-nowrap text-right text-gray-500">
                {String(r.created_at).slice(0, 16).replace("T", " ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="mt-4 text-gray-500">No requests yet.</p>}
    </main>
  );
}
