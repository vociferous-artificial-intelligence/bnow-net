import "./env";

// Render + "send" the latest digests to subscribed users (file outbox until
// RESEND_API_KEY exists). Usage: tsx scripts/email-digest.ts [yyyy-mm-dd]

async function main() {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const { neon } = await import("@neondatabase/serverless");
  const { sendEmail } = await import("../src/lib/email/send");
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

  // recipients: active/pending subscribers + subscribe intents (dedup)
  const recipients = (await sql`
    SELECT DISTINCT email FROM (
      SELECT u.email FROM users u JOIN subscriptions s ON s.user_id = u.id
      UNION SELECT email FROM subscribe_intents
    ) e WHERE email IS NOT NULL`) as Array<{ email: string }>;

  const body = digests
    .map((d) => `${d.rendered_md}\n\n---\nFull detail: https://bnow.net/digests/${d.iso2}/${date}`)
    .join("\n\n\n");

  const targets = recipients.length > 0 ? recipients.map((r) => r.email) : ["demo@bnow.net"];
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
