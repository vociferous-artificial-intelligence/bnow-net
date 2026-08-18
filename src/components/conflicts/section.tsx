// Ordered page section for the conflict surfaces: a landmark <section> with a
// stable data-testid (q1..q7 on the analyst-question pages — the order is
// contract §11's seven-question order and is pinned by tests) and a heading
// the section is labelled by. qids are unique within a page, so the derived
// heading id is document-unique.

export function QuestionSection({
  qid,
  heading,
  children,
}: {
  qid: string;
  heading: string;
  children: React.ReactNode;
}) {
  const headingId = `${qid}-heading`;
  return (
    <section data-testid={qid} aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="mb-3 text-lg font-bold">
        {heading}
      </h2>
      {children}
    </section>
  );
}
