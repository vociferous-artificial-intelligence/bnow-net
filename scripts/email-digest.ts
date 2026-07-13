import "./env";

// Render + send the latest digests to eligible subscribers through the email
// seam (Postmark when POSTMARK_SERVER_TOKEN is set, file outbox otherwise).
// Usage: tsx scripts/email-digest.ts [yyyy-mm-dd] [--to=addr]
//
// Recipient policy lives in src/lib/email/digest-recipients.ts: subscribers in
// an eligible status ONLY. subscribe_intents rows (pricing-era interest capture
// and, since 2026-07-13, private-beta access requests) are NOT recipients — a
// beta access request is not a digest subscription, approved or not. With zero
// eligible recipients the script sends nothing; --to=addr is the explicit
// operator override for a test delivery to a single address.

async function main() {
  const args = process.argv.slice(2);
  const toOverride = args.find((a) => a.startsWith("--to="))?.slice(5) || null;
  const date =
    args.find((a) => !a.startsWith("--")) ?? new Date().toISOString().slice(0, 10);
  const { neon } = await import("@neondatabase/serverless");
  const { sendEmail } = await import("../src/lib/email/send");
  const { DIGEST_RECIPIENTS_SQL, eligibleRecipients } = await import(
    "../src/lib/email/digest-recipients"
  );
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);

  const digests = (await sql`
    SELECT d.rendered_md, c.iso2, c.name FROM digests d
    JOIN countries c ON c.id = d.country_id
    WHERE d.digest_date = ${date} AND d.rendered_md IS NOT NULL`) as Array<{
    rendered_md: string; iso2: string; name: string;
  }>;
  if (digests.length === 0) {
    console.log(`no digests for ${date}`);
    return;
  }

  const rows = (await sql.query(DIGEST_RECIPIENTS_SQL)) as Array<{
    email: string | null;
    status: string | null;
  }>;
  const targets = toOverride ? [toOverride] : eligibleRecipients(rows);
  if (targets.length === 0) {
    console.log(`no eligible recipients for ${date} — nothing sent`);
    return;
  }

  const body = digests
    .map((d) => `${d.rendered_md}\n\n---\nFull detail: https://bnow.net/digests/${d.iso2}/${date}`)
    .join("\n\n\n");

  for (const to of targets) {
    const res = await sendEmail({
      to,
      subject: `BNOW.NET daily digest — ${date}`,
      text: body,
    });
    console.log(`${to}: ${res.via}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
