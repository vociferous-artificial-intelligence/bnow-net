import type { Metadata } from "next";
import Link from "next/link";
import { LegalP, LegalSection, LegalUL } from "@/components/legal-document";
import {
  CROSSWALK_ROWS,
  STANDARD_ORDER,
  STANDARD_TITLES,
  roadmapLabel,
  rowsForStandard,
  statusCount,
  type CrosswalkStatus,
} from "@/lib/tradecraft/crosswalk";

// PUBLIC and unauthenticated by design, and DB-free — the same posture as /privacy and
// /terms. Ruling 21 governs where an authorization gate must sit on a GATED page; it
// imposes nothing here, because there is no gate to place first and nothing on this page
// is privileged data. Concretely: this page reads no session, runs no query, and renders
// only the crosswalk data module plus inline English body copy, so an anonymous bare GET
// and an `RSC: 1` GET are both intended to return the whole page. For the same reason it
// gets NO row in src/integration/authz-page-gate.itest.ts — that harness's positive
// control asserts a privileged token reaches an accepted admin and nobody else, which a
// public page fails by construction.
//
// Body copy is authoritative English content, not chrome, so it is deliberately NOT routed
// through i18n — the same posture src/components/legal-document.tsx records for the legal
// documents and for digest/claim content.
//
// Moat: this page must never print the hedging weight constants or a reliability score
// (src/lib/registry/view-policy.ts; decision T5 option (a)). page.test.tsx enforces it.

export const metadata: Metadata = {
  title: "Methodology — BNOW.NET",
  description:
    "How BNOW.NET sources, cites, and validates its intelligence products, mapped requirement by requirement to ICD 203, ICD 206, ICS 206-01, and ICD 208.",
};

const STATUS_STYLE: Record<CrosswalkStatus, string> = {
  BUILT: "text-green-700 dark:text-green-400",
  PARTIAL: "text-amber-700 dark:text-amber-400",
  GAP: "text-gray-500 dark:text-gray-400",
};

function CrosswalkTable({ standard }: { standard: (typeof STANDARD_ORDER)[number] }) {
  const rows = rowsForStandard(standard);
  const meta = STANDARD_TITLES[standard];
  return (
    <div className="space-y-3">
      <h3 className="mt-4 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {standard} — {meta.title} ({meta.date})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
              <th scope="col" className="py-2 pr-4 font-semibold">
                Requirement
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                What BNOW does
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                Status
              </th>
              <th scope="col" className="py-2 font-semibold">
                Roadmap
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.requirement}
                className="border-b border-gray-200 align-top dark:border-gray-800"
              >
                <th
                  scope="row"
                  className="py-3 pr-4 text-left font-medium text-gray-900 dark:text-white"
                >
                  {row.requirement}
                </th>
                <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">{row.mechanism}</td>
                <td className={`py-3 pr-4 font-semibold ${STATUS_STYLE[row.status]}`}>
                  {row.status}
                </td>
                <td className="py-3 text-gray-500 dark:text-gray-400">{roadmapLabel(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-12">
      <p className="mb-8 text-sm text-gray-500">
        <Link href="/" className="underline hover:text-gray-700 dark:hover:text-gray-300">
          ← Back to BNOW.NET
        </Link>
      </p>

      <article className="text-[15px] leading-relaxed text-gray-800 dark:text-gray-200">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          Methodology
        </h1>
        <p className="mt-4 text-gray-600 dark:text-gray-300">
          What BNOW.NET does, requirement by requirement, against the four public Intelligence
          Community issuances that govern analytic tradecraft, sourcing, open-source citation, and
          product utility — including what we have not built.
        </p>

        <div className="mt-8 space-y-6">
          <LegalSection id="how-to-read" heading="1. How to read this page">
            <LegalP>
              Each requirement below is marked BUILT, PARTIAL, or GAP. BUILT means the mechanism
              exists in production today and a specific piece of code enforces it. PARTIAL means the
              inputs exist and are enforced, but the requirement is not fully met — usually because
              the data is held and not yet presented. GAP means it is not built. Rows we intend to
              close are marked planned; rows nothing on the current roadmap closes are marked not
              planned, rather than left ambiguous.
            </LegalP>
            <LegalP>
              Of {CROSSWALK_ROWS.length} requirements, {statusCount("BUILT")} are BUILT,{" "}
              {statusCount("PARTIAL")} are PARTIAL, and {statusCount("GAP")} are GAP. A reviewer who
              wants to be useful should press on the PARTIAL and GAP rows.
            </LegalP>
            <LegalP>
              This page is a public summary of an internal conformance document that additionally
              names the file enforcing each mechanism. If you are evaluating BNOW and want that
              version, ask us for it.
            </LegalP>
          </LegalSection>

          <LegalSection id="vocabulary" heading="2. Vocabulary">
            <LegalP>
              BNOW&apos;s product vocabulary is ICS 206-01 narrative source descriptors and ICD 203
              estimative language. NATO AJP-2.1 and Admiralty-style two-axis codes — source
              reliability paired with information credibility — are emitted, where they are emitted
              at all, as derived export fields for interoperability with STIX and MISP consumers,
              and never as a headline rating.
            </LegalP>
            <LegalP>
              The reason is that ICS 206-01 is the current standard, it was written for open-source
              intelligence specifically, and it is the only one of the four that addresses AI- and
              machine-derived inference. The Admiralty scale preserves NATO and threat-intelligence
              interoperability but has documented failure modes: readers collapse its two axes into
              a single impression of quality, and its credibility definitions are not applied
              consistently across users.
            </LegalP>
          </LegalSection>

          <LegalSection id="crosswalk" heading="3. The crosswalk">
            <LegalP>
              Requirement text is paraphrased from the issuances. The originals are unclassified and
              published by the Office of the Director of National Intelligence.
            </LegalP>
            {STANDARD_ORDER.map((standard) => (
              <CrosswalkTable key={standard} standard={standard} />
            ))}
          </LegalSection>

          <LegalSection id="beyond" heading="4. Two things we do that the standards do not require">
            <LegalP>
              <strong>Citation is enforced by the database, not by review.</strong> ICD 206 requires
              a source reference citation. It does not require that the storage layer make an
              uncited claim impossible. Ours does: a deferrable constraint trigger on the claims
              table raises an exception and rolls the entire transaction back if a claim reaches
              commit without at least one link to a stored source document. It is deferred to commit
              time, so a legitimate write that stores a claim and its evidence together passes,
              while any path that writes a claim and stops fails. It is re-asserted by the last
              migration applied, so a future schema regeneration cannot silently drop it, and a test
              fails the build if it is removed.
            </LegalP>
            <LegalP>
              <strong>
                An external benchmark loop scores our product against a named expert publication.
              </strong>{" "}
              None of the four issuances requires a producer to publish a running comparison of its
              own output against an outside expert product. Each day, BNOW&apos;s digests are
              compared against the same-day Institute for the Study of War assessment, and the
              result is recorded as coverage, unsupported-claim rate, timeliness in hours, and an
              itemized list of divergences that distinguishes agreement, disagreement, benchmark-only
              items, and BNOW-only items. The results are public on the{" "}
              <Link
                href="/scoreboard"
                className="underline hover:text-gray-900 dark:hover:text-white"
              >
                validation scoreboard
              </Link>
              .
            </LegalP>
          </LegalSection>

          <LegalSection id="machine" heading="5. Where the machine is disclosed as a machine">
            <LegalP>
              Every analytic artifact BNOW publishes is produced by an automated pipeline, and the
              stamps recording which machine produced it already exist in the data:
            </LegalP>
            <LegalUL>
              <li>
                Every extracted row carries a versioned extractor stamp derived from the model
                identity, the extraction prompt for that theater and track, and the content budget.
                It is a versioning contract, not a label: a change to any input is a corpus-wide
                event, and consumers filter to the current versions or they double-count.
              </li>
              <li>
                Every synthesized product carries the provider tag and the durable dispatch identity
                of the exact configuration each synthesis vote used.
              </li>
              <li>
                That identity includes the routing-approval registry version, so a published row can
                be traced back to the approval state that authorized a model to serve it.
              </li>
            </LegalUL>
            <LegalP>
              None of this reaches a reader yet. Surfacing it in a copyable, standard-conformant
              citation is the planned work behind the PARTIAL rows under ICS 206-01.
            </LegalP>
          </LegalSection>

          <LegalSection id="withheld" heading="6. What we deliberately withhold">
            <LegalP>
              <strong>Source text.</strong> No prose from the Institute for the Study of War and no
              full text from any ingested source appears in BNOW output. What we publish is source
              URLs, classifications, counts, dates, and scores. Source text may pass through an
              analysis step transiently; only the resulting classifications are stored and shown.
            </LegalP>
            <LegalP>
              <strong>The reliability weighting itself.</strong> A source&apos;s reliability rating
              weights confirmed reporting above assessed, claimed, and unverified reporting. The
              numeric rating, the reliability-ranked ordering of the registry, and the exact
              weighting that would let the rating be reconstructed are an analyst privilege and are
              withheld from this page and from every non-privileged surface. Reliability is shown in
              context wherever a source is cited inside a product.
            </LegalP>
            <LegalP>
              One honesty note about that rating. When a source is cited without any hedging
              language at all, we hold it at the middle of the scale rather than forcing it into one
              of the explicit categories, because forcing it would corrupt the signal. That is a
              deliberate default, not a measurement — one of several reasons we do not present the
              rating as calibrated.
            </LegalP>
          </LegalSection>

          <LegalSection id="not-claimed" heading="7. What we do not claim">
            <LegalP>
              We do not claim accuracy. What we measure and publish is coverage against a named
              expert benchmark — agreement with the same-day expert assessment. Agreement is not
              independent confirmation: the benchmark reads many of the same open sources BNOW
              reads, and that caveat is rendered beside the number, not in a footnote. We do not
              claim our source-reliability rating is calibrated, and we do not state a likelihood or
              an analytic-confidence level of our own — today we carry the source&apos;s own
              estimative posture, and nothing further. Closing that gap in the language of ICD 203
              is planned, and it is marked as a gap above until it ships.
            </LegalP>
          </LegalSection>

          <LegalSection id="questions" heading="8. Questions and corrections">
            <LegalP>
              If you believe a row above overclaims, or that a source or claim is misattributed, we
              want to hear it. Corrections and requests are handled through the process described in
              our{" "}
              <Link href="/privacy" className="underline hover:text-gray-900 dark:hover:text-white">
                Privacy Notice
              </Link>
              . For methodology review or partnership,{" "}
              <Link href="/access" className="underline hover:text-gray-900 dark:hover:text-white">
                request access
              </Link>
              .
            </LegalP>
          </LegalSection>
        </div>
      </article>
    </main>
  );
}
