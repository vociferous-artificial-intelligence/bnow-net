import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalContactBlock,
  LegalDocument,
  LegalP,
  LegalSection,
  LegalUL,
} from "@/components/legal-document";
import { CURRENT_TERMS_VERSION, OPERATOR } from "@/lib/legal/policies";

// Public, unauthenticated, DB-free. Authoritative English legal copy (content, not chrome).

export const metadata: Metadata = {
  title: "Terms of Use — BNOW.NET",
  description:
    "The terms governing access to and use of BNOW.NET, including eligibility, permitted use, prohibited conduct, and the AI/OSINT limitations.",
};

const EMAIL = OPERATOR.legalContact;
function Mail() {
  return (
    <a href={`mailto:${EMAIL}`} className="underline hover:text-gray-900 dark:hover:text-white">
      {EMAIL}
    </a>
  );
}

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Use"
      version={CURRENT_TERMS_VERSION}
      intro="These Terms of Use govern access to and use of BNOW.NET. By creating or using a subscriber account, you agree to these Terms. If you do not agree, do not use subscriber features."
      crossLink={{ href: "/privacy", label: "See also our Privacy Notice" }}
    >
      <LegalSection id="about" heading="1. About BNOW.NET">
        <LegalP>
          BNOW.NET is a subscription OSINT and data-intelligence service built and operated by{" "}
          {OPERATOR.builtBy}, based in {OPERATOR.location}.
        </LegalP>
        <LegalP>
          In these Terms, “BNOW.NET,” “BNOW,” “we,” “us,” and “our” refer to the operator of the
          service. “You” means the person using the service and, where applicable, the organization
          on whose behalf that person is acting.
        </LegalP>
        <LegalP>
          BNOW provides automated collection, source analysis, intelligence claims, digests, search,
          question answering, reliability indicators, and validation measurements derived from
          public-source information.
        </LegalP>
      </LegalSection>

      <LegalSection id="eligibility" heading="2. Eligibility and organizational authority">
        <LegalP>You must be at least 18 years old to create an account or use subscriber features.</LegalP>
        <LegalP>
          If you use BNOW for an employer or another organization, you represent that you are
          authorized to use the service for that organization and to bind the organization to these
          Terms where applicable.
        </LegalP>
        <LegalP>You may not use the service if applicable law prohibits you from doing so.</LegalP>
      </LegalSection>

      <LegalSection id="accounts" heading="3. Accounts">
        <LegalP>
          You must provide an email address you are authorized to use and keep access to that email
          account secure.
        </LegalP>
        <LegalP>
          Magic links and sessions are personal to the authorized user. You may not sell, transfer,
          publish, or share authentication links, session tokens, or account credentials.
        </LegalP>
        <LegalP>
          You are responsible for activity conducted through your account unless you promptly notify
          us that the account has been compromised.
        </LegalP>
        <LegalP>
          We may establish user, analyst, administrator, subscription, geographic, usage, or feature
          limits.
        </LegalP>
      </LegalSection>

      <LegalSection id="license" heading="4. Limited right to use the service">
        <LegalP>
          Subject to these Terms and any applicable order or subscription terms, BNOW grants you a
          limited, non-exclusive, non-transferable, non-sublicensable, revocable right to access and
          use the service for lawful internal professional, research, journalistic, educational, or
          personal analysis.
        </LegalP>
        <LegalP>
          This right does not transfer ownership of BNOW software, databases, compilations, scoring
          methods, interfaces, branding, or other proprietary material.
        </LegalP>
        <LegalP>
          Separate enterprise, API, government, data-feed, or organizational terms may grant
          additional rights. If a signed order or agreement conflicts with these Terms, the signed
          agreement controls for that customer.
        </LegalP>
      </LegalSection>

      <LegalSection id="sharing" heading="5. Sharing links, screenshots, and excerpts">
        <LegalP>BNOW supports responsible discussion and collaboration.</LegalP>
        <LegalP>Unless content is marked confidential or restricted, you may share:</LegalP>
        <LegalUL>
          <li>Links to publicly accessible BNOW pages.</li>
          <li>
            Individual screenshots or short excerpts for commentary, reporting, collaboration, or
            social-media discussion.
          </li>
          <li>Your own analysis derived from BNOW output.</li>
        </LegalUL>
        <LegalP>When sharing BNOW material, you must:</LegalP>
        <LegalUL>
          <li>Attribute BNOW.NET where reasonably practical.</li>
          <li>Preserve material source labels, uncertainty, dates, and qualifications.</li>
          <li>Avoid presenting a source claim or automated output as independently verified fact.</li>
          <li>
            Avoid disclosing another user’s information, account details, restricted administration
            views, credentials, or security information.
          </li>
          <li>Respect third-party rights in linked or quoted source material.</li>
        </LegalUL>
        <LegalP>
          This permission does not allow systematic copying, bulk export, republication of a
          substantial part of the service, resale of BNOW output, or creation of a substitute
          database or competing intelligence service.
        </LegalP>
        <LegalP>
          The availability of this permission does not mean BNOW currently provides a dedicated
          social-sharing feature.
        </LegalP>
      </LegalSection>

      <LegalSection id="prohibited" heading="6. Prohibited conduct">
        <LegalP>You may not:</LegalP>
        <LegalUL>
          <li>
            Use BNOW for an unlawful purpose or in violation of sanctions, export controls, privacy,
            intellectual-property, employment, anti-discrimination, surveillance, or other applicable
            laws.
          </li>
          <li>
            Use the service to harass, threaten, dox, stalk, discriminate against, or unlawfully
            target a person or group.
          </li>
          <li>
            Use BNOW as the sole basis for an automated decision concerning employment, credit,
            insurance, housing, immigration, legal rights, physical targeting, or another similarly
            significant decision.
          </li>
          <li>Share credentials or allow unauthorized users to access a subscriber account.</li>
          <li>
            Circumvent authentication, feature gates, rate limits, spending controls, access
            restrictions, or other safeguards.
          </li>
          <li>
            Scrape, crawl, probe, enumerate, or access the service through automated means except
            through an API or method we expressly authorize.
          </li>
          <li>
            Introduce malware, disrupt the service, overload infrastructure, or interfere with
            another user.
          </li>
          <li>Attempt to access another user’s account, questions, session, or data.</li>
          <li>
            Remove or obscure source attribution, confidence labels, warnings, rights notices, or
            access restrictions.
          </li>
          <li>
            Systematically reproduce BNOW output or use it to reconstruct BNOW’s underlying database,
            source registry, ranking system, validation corpus, prompts, or analytical pipeline.
          </li>
          <li>
            Decompile, disassemble, or reverse engineer service software except to the limited extent
            that applicable law expressly permits that activity and does not allow the restriction to
            be waived.
          </li>
          <li>
            Use prompt injection, jailbreaks, automated probing, or similar techniques to discover or
            extract non-public system prompts, hidden instructions, credentials, personal
            information, restricted source-registry data, model configuration, or security controls.
          </li>
          <li>
            Use substantial quantities of BNOW content or output to train, test, evaluate, or develop
            a competing model, dataset, or service without written permission.
          </li>
          <li>Misrepresent BNOW output, source material, or validation results.</li>
        </LegalUL>
        <LegalP>
          Nothing in this section prohibits ordinary analyst use, responsible criticism, or good-faith
          reporting of a suspected security issue. Do not perform security testing that disrupts the
          service, accesses another person’s data, or extracts restricted information. Contact <Mail />{" "}
          before conducting intrusive testing.
        </LegalP>
      </LegalSection>

      <LegalSection id="user-material" heading="7. Questions and other user-provided material">
        <LegalP>You retain any rights you have in questions, feedback, or other material you submit.</LegalP>
        <LegalP>
          You grant BNOW a limited, non-exclusive right to host, copy, transmit, process, and analyze
          submitted material as reasonably necessary to:
        </LegalP>
        <LegalUL>
          <li>Provide the requested service.</li>
          <li>Generate and return results.</li>
          <li>Enforce limits and account entitlements.</li>
          <li>Maintain security and reliability.</li>
          <li>Troubleshoot problems and provide support.</li>
          <li>Comply with law and enforce these Terms.</li>
        </LegalUL>
        <LegalP>
          You represent that you have the right to submit the material and that our processing of it
          as described in these Terms and the Privacy Notice will not violate another person’s rights.
        </LegalP>
        <LegalP>
          Do not submit secrets, credentials, classified information, export-controlled technical
          data, payment-card data, medical records, government identification numbers, or other highly
          sensitive information unless BNOW has expressly agreed in writing to handle that category of
          information.
        </LegalP>
        <LegalP>
          Our handling of submitted questions is described in the{" "}
          <Link href="/privacy" className="underline hover:text-gray-900 dark:hover:text-white">
            Privacy Notice
          </Link>
          .
        </LegalP>
      </LegalSection>

      <LegalSection id="ip" heading="8. BNOW and third-party intellectual property">
        <LegalP>
          The service, software, interface, original design, source registry, compilations,
          taxonomies, scoring systems, and BNOW-authored material are owned by or licensed to the
          operator of BNOW and are protected by applicable law.
        </LegalP>
        <LegalP>
          BNOW also links to and analyzes material created by third parties. Those publishers and
          authors retain their rights in their material. A link, citation, classification, or score
          does not transfer those rights to BNOW or to you.
        </LegalP>
        <LegalP>
          You are responsible for ensuring that your use or republication of third-party material is
          permitted.
        </LegalP>
        <LegalP>
          References to ISW, OpenAI, Telegram, X, news organizations, government agencies, or other
          third parties do not imply sponsorship, endorsement, or affiliation.
        </LegalP>
      </LegalSection>

      <LegalSection id="ai-limits" heading="9. Intelligence and AI limitations">
        <LegalP>
          BNOW is an analytical aid, not an authoritative record or substitute for accountable
          professional judgment.
        </LegalP>
        <LegalP>
          Open-source reporting can be false, manipulated, incomplete, duplicated, delayed,
          mistranslated, or taken out of context. Events can change after publication. Automated
          extraction, classification, clustering, translation, ranking, and generation can produce
          errors.
        </LegalP>
        <LegalP>BNOW may:</LegalP>
        <LegalUL>
          <li>Miss important events or sources.</li>
          <li>Repeat a source’s false or disputed assertion.</li>
          <li>Misidentify people, organizations, places, dates, or relationships.</li>
          <li>Produce incomplete, inconsistent, outdated, or incorrect analysis.</li>
          <li>Assign a confidence or reliability indicator that does not match later evidence.</li>
          <li>Generate an Ask answer that is unsupported, misunderstood, or incorrectly cited.</li>
        </LegalUL>
        <LegalP>
          Source-reliability scores describe observed citation, hedging, corroboration, and sourcing
          patterns. They are not guarantees of truth, endorsements, or definitive judgments about a
          source or person.
        </LegalP>
        <LegalP>
          Validation against third-party analysis measures selected aspects of BNOW output. A
          validation score is not a guarantee of accuracy, completeness, independence, or fitness for
          a particular decision.
        </LegalP>
        <LegalP>
          Where BNOW surfaces the name of an individual, that name appears because one or more
          cited open sources identified that person in the reporting BNOW collected. BNOW reports
          and attributes what those sources say. Inclusion of a name is not BNOW’s endorsement,
          accusation, opinion, or independent assertion that any allegation, characterization, or
          claim about that person is true. You must review the linked source, its hedging or
          uncertainty labels, and its context, and independently verify before relying on or
          repeating any statement about a named person.
        </LegalP>
        <LegalP>
          You must evaluate material context, follow source links, consider contrary evidence, and
          independently verify information before making a material decision.
        </LegalP>
      </LegalSection>

      <LegalSection id="no-advice" heading="10. No professional advice">
        <LegalP>
          BNOW does not provide legal, investment, financial, medical, employment,
          sanctions-compliance, export-control, physical-security, military, or other regulated
          professional advice.
        </LegalP>
        <LegalP>
          You are responsible for obtaining qualified advice and conducting appropriate due diligence
          before acting on BNOW information.
        </LegalP>
        <LegalP>
          BNOW must not be used as the sole basis for operational targeting, use-of-force decisions,
          deprivation of rights, or another decision that could foreseeably cause serious harm.
        </LegalP>
      </LegalSection>

      <LegalSection id="availability" heading="11. Availability and changes">
        <LegalP>BNOW is evolving and may be offered as a beta or early-stage service.</LegalP>
        <LegalP>
          Features, sources, models, providers, coverage, limits, and output formats may change.
          Sources may become unavailable. We may suspend a feature to protect users, providers,
          infrastructure, budgets, or legal compliance.
        </LegalP>
        <LegalP>
          Unless a separate signed agreement states otherwise, we do not promise uninterrupted
          availability, a particular source, a specific model, a minimum coverage level, or a
          service-level commitment.
        </LegalP>
      </LegalSection>

      <LegalSection id="fees" heading="12. Fees and subscriptions">
        <LegalP>Some features may require a paid subscription or separate order.</LegalP>
        <LegalP>
          Before activating paid self-service checkout, BNOW will display or provide the applicable
          price, billing period, renewal terms, and available cancellation information.
        </LegalP>
        <LegalP>
          You agree to pay charges you authorize, together with applicable taxes. A separate order
          form may govern organizational, enterprise, API, government, or custom-theater service.
        </LegalP>
        <LegalP>
          If checkout is not enabled, a pricing or access-request form expresses interest and does
          not itself create a paid subscription.
        </LegalP>
      </LegalSection>

      <LegalSection id="termination" heading="13. Suspension and termination">
        <LegalP>You may stop using the service at any time.</LegalP>
        <LegalP>We may restrict, suspend, or terminate access if we reasonably believe that:</LegalP>
        <LegalUL>
          <li>You violated these Terms.</li>
          <li>Use creates a security, legal, provider, or safety risk.</li>
          <li>Payment is overdue.</li>
          <li>The account is being used without authorization.</li>
          <li>Suspension is necessary to protect the service or another person.</li>
        </LegalUL>
        <LegalP>
          Where reasonably practical, we will provide notice and an opportunity to address the issue.
          We may act without advance notice when immediate action is reasonably necessary.
        </LegalP>
        <LegalP>
          Termination does not eliminate provisions that by their nature should survive, including
          ownership, restrictions, disclaimers, liability limits, and dispute terms.
        </LegalP>
      </LegalSection>

      <LegalSection id="sanctions" heading="14. Compliance with sanctions and export controls">
        <LegalP>
          You are responsible for complying with applicable sanctions, export-control, import, and
          trade laws.
        </LegalP>
        <LegalP>
          You may not use, export, re-export, transfer, or provide the service in violation of those
          laws, or for a prohibited end use or prohibited party.
        </LegalP>
        <LegalP>
          The presence of reporting about a sanctioned country, entity, person, or publication does
          not mean BNOW provides services to or on behalf of that subject.
        </LegalP>
      </LegalSection>

      <LegalSection id="disclaimers" heading="15. Disclaimers">
        <LegalP>
          To the fullest extent permitted by law, BNOW is provided “as is” and “as available.”
        </LegalP>
        <LegalP>
          We disclaim implied warranties of merchantability, fitness for a particular purpose, title,
          non-infringement, accuracy, completeness, and uninterrupted availability.
        </LegalP>
        <LegalP>We do not warrant that:</LegalP>
        <LegalUL>
          <li>Every statement is true or independently verified.</li>
          <li>Coverage is complete.</li>
          <li>The service will identify every risk or event.</li>
          <li>Errors will always be corrected before harm occurs.</li>
          <li>The service will meet a particular legal, compliance, intelligence, or operational standard.</li>
          <li>Source links or third-party services will remain available.</li>
        </LegalUL>
        <LegalP>
          Some jurisdictions do not allow certain warranty exclusions, so some exclusions may not
          apply to you.
        </LegalP>
      </LegalSection>

      <LegalSection id="liability" heading="16. Limitation of liability">
        <LegalP>
          To the fullest extent permitted by law, BNOW and the people involved in building or
          operating it will not be liable for indirect, incidental, special, exemplary, punitive, or
          consequential damages, or for lost profits, revenue, data, business opportunities, goodwill,
          or anticipated savings arising from or related to the service.
        </LegalP>
        <LegalP>
          To the fullest extent permitted by law, aggregate liability arising from or related to the
          service will not exceed the greater of:
        </LegalP>
        <LegalUL>
          <li>
            The amount you paid for the service during the 12 months before the event giving rise to
            the claim; or
          </li>
          <li>US $100 if you used the service without payment.</li>
        </LegalUL>
        <LegalP>
          These limitations apply regardless of the form of claim and even if a remedy fails of its
          essential purpose.
        </LegalP>
        <LegalP>They do not apply where liability cannot lawfully be excluded or limited.</LegalP>
        <LegalP>A separate signed enterprise agreement may establish different liability terms.</LegalP>
      </LegalSection>

      <LegalSection id="indemnity" heading="17. Indemnity for misuse">
        <LegalP>
          To the extent permitted by law, you agree to defend and indemnify the operator of BNOW and
          the people involved in providing the service against third-party claims, damages, and
          reasonable costs arising from:
        </LegalP>
        <LegalUL>
          <li>Your unlawful use of the service.</li>
          <li>Your material violation of these Terms.</li>
          <li>Material you submit without the necessary rights.</li>
          <li>
            Your republication or use of BNOW or third-party material in a way that violates another
            person’s rights.
          </li>
        </LegalUL>
        <LegalP>
          This obligation does not apply to the extent a claim was caused by BNOW’s own unlawful
          conduct.
        </LegalP>
      </LegalSection>

      <LegalSection id="changes" heading="18. Changes to these Terms">
        <LegalP>We may update these Terms as the service and law change.</LegalP>
        <LegalP>
          We will update the version and effective date when we do. If a change is material, we will
          provide reasonable notice through the service or by email.
        </LegalP>
        <LegalP>
          We may require you to accept a new version before continuing to use subscriber features.
          Continued use after an effective update may also constitute acceptance where permitted by
          law and clearly disclosed.
        </LegalP>
      </LegalSection>

      <LegalSection id="governing-law" heading="19. Governing law and disputes">
        <LegalP>
          These Terms are governed by the laws of the State of New York, without regard to
          conflict-of-law rules.
        </LegalP>
        <LegalP>
          Unless a separate signed agreement states otherwise, disputes arising from these Terms or
          the service will be brought in the state or federal courts located in New York County, New
          York, and the parties consent to those courts’ jurisdiction.
        </LegalP>
        <LegalP>
          Nothing in this section limits rights that cannot lawfully be waived under applicable
          consumer or data-protection law.
        </LegalP>
      </LegalSection>

      <LegalSection id="general" heading="20. General terms">
        <LegalP>
          These Terms and the Privacy Notice, together with any applicable signed order, are the
          agreement governing your use of the service.
        </LegalP>
        <LegalP>
          If part of these Terms is found unenforceable, the remaining provisions remain effective. A
          failure to enforce a provision is not a waiver. You may not transfer your account or these
          Terms without our permission. We may transfer operation of the service or these Terms as
          part of a reorganization, financing, acquisition, or asset transfer, subject to applicable
          law.
        </LegalP>
        <LegalP>Headings are for convenience and do not change the meaning of these Terms.</LegalP>
      </LegalSection>

      <LegalSection id="contact" heading="21. Contact">
        <LegalContactBlock heading="Questions about these Terms:" />
        <LegalP>
          See also our{" "}
          <Link href="/privacy" className="underline hover:text-gray-900 dark:hover:text-white">
            Privacy Notice
          </Link>
          .
        </LegalP>
      </LegalSection>
    </LegalDocument>
  );
}
