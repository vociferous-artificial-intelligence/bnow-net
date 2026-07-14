import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalContactBlock,
  LegalDocument,
  LegalP,
  LegalSection,
  LegalSubheading,
  LegalUL,
} from "@/components/legal-document";
import {
  CURRENT_PRIVACY_VERSION,
  OPERATOR,
  PRIVACY_EFFECTIVE_DATE_DISPLAY,
} from "@/lib/legal/policies";

// Public, unauthenticated, DB-free. Authoritative English legal copy (content, not chrome) —
// see src/components/legal-document.tsx.

export const metadata: Metadata = {
  title: "Privacy Notice — BNOW.NET",
  description:
    "How BNOW.NET collects, uses, stores, and shares information, including how submitted Ask questions are stored and processed.",
};

const EMAIL = OPERATOR.legalContact;
function Mail() {
  return (
    <a href={`mailto:${EMAIL}`} className="underline hover:text-gray-900 dark:hover:text-white">
      {EMAIL}
    </a>
  );
}

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Notice"
      version={CURRENT_PRIVACY_VERSION}
      effectiveDate={PRIVACY_EFFECTIVE_DATE_DISPLAY}
      intro="Your privacy matters to us. This Privacy Notice explains how BNOW.NET collects, uses, stores, and shares information when you visit the site, create an account, submit questions, or use our intelligence services."
      crossLink={{ href: "/terms", label: "See also our Terms of Use" }}
    >
      <LegalSection id="who-we-are" heading="1. Who we are">
        <LegalP>
          BNOW.NET is a subscription OSINT and data-intelligence service built and operated by{" "}
          {OPERATOR.builtBy}, based in {OPERATOR.location}.
        </LegalP>
        <LegalP>
          In this notice, “BNOW.NET,” “BNOW,” “we,” “us,” and “our” refer to the operator of the
          BNOW.NET service.
        </LegalP>
        <LegalP>
          For privacy questions, requests, or corrections, contact <Mail />.
        </LegalP>
      </LegalSection>

      <LegalSection id="scope" heading="2. Scope of this notice">
        <LegalP>
          This notice applies to information processed through the BNOW.NET website, subscriber
          accounts, authentication flow, Ask feature, subscription-interest forms, support and
          feedback communications, and related product operations.
        </LegalP>
        <LegalP>
          Third-party websites, publications, social platforms, and source links have their own
          privacy practices. This notice does not govern those third parties.
        </LegalP>
      </LegalSection>

      <LegalSection id="information-we-collect" heading="3. Information we collect">
        <LegalSubheading>Information you provide</LegalSubheading>
        <LegalP>We may collect:</LegalP>
        <LegalUL>
          <li>Your email address when you request a sign-in link or create an account.</li>
          <li>Questions you submit through the Ask feature.</li>
          <li>
            Information you provide in subscription-interest, support, correction, or feedback
            messages.
          </li>
          <li>
            For beta access requests, allowlisted campaign tokens, the fixed internal landing path,
            and the referring hostname when available. BNOW does not store the referrer path, query,
            fragment, or credentials for this purpose.
          </li>
          <li>
            Subscription and billing information if paid checkout is enabled. Payment-card details
            are processed by the payment provider and are not intended to be stored directly by
            BNOW.NET.
          </li>
          <li>Any other information you choose to include in a message to us.</li>
        </LegalUL>
        <LegalP>
          Do not submit passwords, authentication credentials, government identification numbers,
          payment-card numbers, medical records, or other highly sensitive personal information
          through the Ask feature.
        </LegalP>

        <LegalSubheading>Account and usage information</LegalSubheading>
        <LegalP>
          We collect information needed to operate and secure the service, including:
        </LegalP>
        <LegalUL>
          <li>Internal account and user identifiers.</li>
          <li>Account role and subscription status.</li>
          <li>Email-verification and account-creation timestamps.</li>
          <li>Authentication sessions and verification tokens.</li>
          <li>
            Ask usage records, including the submitted question, time of submission, provider and
            model information, usage and cost metadata, retrieval metadata, and whether the request
            was answered, refused, limited, or unsuccessful.
          </li>
          <li>
            Product activity needed to enforce usage limits, diagnose failures, prevent abuse, and
            maintain service reliability.
          </li>
          <li>Language preference.</li>
          <li>
            If you explicitly allow optional product analytics, an internal random account UUID,
            coarse account role and beta cohort, account-creation date, an approximate city- and
            postal-level location that our analytics provider derives from your connection IP at the
            time each event is received, and limited product-event categories such as digest,
            evidence, Search, Ask, Signals, and feedback-control use.
          </li>
          <li>
            Ordinary technical request and security-log information that may be processed by our
            hosting and infrastructure providers, such as IP address, browser or device
            information, request time, and requested page.
          </li>
        </LegalUL>

        <LegalSubheading>Public-source intelligence information</LegalSubheading>
        <LegalP>
          BNOW.NET collects and analyzes material from publicly available sources, which may include
          news publications, government records, public websites, Telegram channels, X accounts,
          public databases, and source links cited by research organizations.
        </LegalP>
        <LegalP>
          This material may contain information about public officials, military personnel,
          businesspeople, organizations, sanctions subjects, criminal or civil proceedings, and
          other individuals mentioned in public reporting. BNOW may retain source URLs, publication
          metadata, excerpts used internally for analysis, and derived claims, entities, scores, or
          classifications.
        </LegalP>
        <LegalP>
          A source’s inclusion does not mean BNOW endorses the source or treats every assertion from
          it as true.
        </LegalP>
      </LegalSection>

      <LegalSection id="how-we-use" heading="4. How we use information">
        <LegalP>We use information to:</LegalP>
        <LegalUL>
          <li>Authenticate users and maintain accounts.</li>
          <li>Provide subscriber features and intelligence products.</li>
          <li>Process Ask questions and return evidence-linked answers.</li>
          <li>Display a user’s recent submitted questions.</li>
          <li>Enforce per-user usage limits and provider-spending limits.</li>
          <li>Operate subscriptions and respond to sales inquiries.</li>
          <li>Send sign-in links, service messages, and requested communications.</li>
          <li>Maintain, secure, debug, and improve service reliability.</li>
          <li>Detect misuse, protect users, and enforce our Terms of Use.</li>
          <li>Produce aggregate or deidentified operational and product metrics.</li>
          <li>Comply with law and protect our legal rights.</li>
        </LegalUL>
        <LegalP>
          We do not sell personal information. We do not use personal information for behavioral
          advertising, and we do not share it for cross-context behavioral advertising.
        </LegalP>
        <LegalP>
          We do not currently use submitted Ask questions to train BNOW’s own machine-learning
          models. We may review question content when reasonably necessary to provide support,
          investigate a problem, protect the service, or enforce our Terms. We may use aggregated or
          deidentified usage information to understand and improve the product.
        </LegalP>
      </LegalSection>

      <LegalSection id="ask-processing" heading="5. How Ask questions are processed">
        <LegalP>
          Under current service settings, BNOW stores the text of submitted Ask questions together
          with the account email and related usage metadata. Stored questions support rate limits,
          cost controls, diagnostics, account history, and the recent-questions feature.
        </LegalP>
        <LegalP>
          BNOW sends submitted questions and selected supporting evidence to AI service providers to
          perform functions such as embedding, relevance ranking, and answer generation. Our current
          primary AI provider is OpenAI.
        </LegalP>
        <LegalP>
          OpenAI states that API inputs and outputs are not used to train its models by default.
          OpenAI’s standard API data controls may retain customer content in abuse-monitoring logs
          for up to 30 days unless different controls apply. OpenAI’s practices are governed by its
          own terms and data policies.
        </LegalP>
        <LegalP>
          Do not include information in a question that you do not want processed and stored as
          described in this notice.
        </LegalP>
      </LegalSection>

      <LegalSection id="legal-bases" heading="6. Legal bases where applicable">
        <LegalP>
          Where laws such as the GDPR or UK GDPR apply, we process personal information under one or
          more of these legal bases:
        </LegalP>
        <LegalUL>
          <li>
            <strong>Contract:</strong> when processing is needed to provide an account or requested
            service.
          </li>
          <li>
            <strong>Legitimate interests:</strong> to operate, secure, validate, and improve BNOW;
            prevent misuse; maintain records; and conduct responsible public-source intelligence
            analysis, where those interests are not overridden by an individual’s rights.
          </li>
          <li>
            <strong>Legal obligation:</strong> when processing is required to comply with law.
          </li>
          <li>
            <strong>Consent:</strong> where we specifically request consent for an optional activity.
            Consent may be withdrawn for future processing where applicable.
          </li>
        </LegalUL>
        <LegalP>
          Acknowledging this Privacy Notice does not make consent the legal basis for every
          processing activity described here.
        </LegalP>
      </LegalSection>

      <LegalSection id="sharing" heading="7. When we share information">
        <LegalP>
          We may disclose information to service providers that process it for us, including:
        </LegalP>
        <LegalUL>
          <li>Vercel for hosting and application infrastructure.</li>
          <li>Neon for managed database services.</li>
          <li>
            OpenAI and other disclosed AI providers used to process intelligence or user questions.
          </li>
          <li>
            Postmark, or a configured email-delivery provider such as Resend, for sign-in and
            service email.
          </li>
          <li>
            PostHog, if optional product analytics is enabled for your account, to process the
            minimized product events described below. BNOW uses a dedicated PostHog project hosted
            in the United States and an internal random account UUID, never your email address, as
            the analytics identity.
          </li>
          <li>Stripe or another disclosed payment provider if paid checkout is enabled.</li>
          <li>
            Professional advisers and contractors who need limited access to support, secure, or
            operate the service and are subject to appropriate obligations.
          </li>
        </LegalUL>
        <LegalP>We may also disclose information:</LegalP>
        <LegalUL>
          <li>When required by law, legal process, or a valid governmental request.</li>
          <li>To investigate fraud, security incidents, misuse, or threats to rights and safety.</li>
          <li>
            In connection with a financing, reorganization, acquisition, sale, or transfer of the
            service or its assets, subject to applicable law.
          </li>
          <li>With your direction or permission.</li>
        </LegalUL>
        <LegalP>
          We do not authorize service providers to use personal information for their own
          advertising.
        </LegalP>
      </LegalSection>

      <LegalSection id="cookies" heading="8. Cookies and similar technologies">
        <LegalP>
          BNOW uses cookies that are necessary to provide and secure the service, including
          authentication-session cookies. We also use a server-readable language-preference cookie
          so the site can remember your selected locale.
        </LegalP>
        <LegalP>
          BNOW does not use third-party behavioral-advertising cookies. Optional PostHog product
          analytics is default-off and is active only for a signed-in adult user who has accepted
          the current Terms of Use and Privacy Notice and explicitly grants permission on the
          Account page. You may decline without losing product access and may change the preference
          at any time; declining or withdrawing stops future collection. When enabled, these
          analytics are processed in a dedicated BNOW PostHog project hosted in the United States.
        </LegalP>
        <LegalP>
          If enabled with your permission, BNOW sends only allowlisted, coarse events about product
          sessions and use of digests, evidence controls, source follow-through, Search outcomes,
          Ask outcomes, gated Signals, and feedback controls. BNOW does not send Ask or Search text,
          claim or source text, source URLs, email addresses, LinkedIn URLs, authentication material,
          broad click activity, advertising identifiers, or full referrers to PostHog. Session
          replay, heatmaps, broad autocapture, surveys, advertising tracking, and automatic error
          capture are disabled for this integration.
        </LegalP>
        <LegalP>
          BNOW does not store the raw connection IP address for these analytics. PostHog uses that
          connection IP transiently, at the moment each event is received, to derive an approximate
          city- and postal-level location, which may be associated with the event and the internal
          account identifier; the raw IP itself is then discarded. The project&apos;s data-retention
          period is described under Retention below.
        </LegalP>
      </LegalSection>

      <LegalSection id="retention" heading="9. Retention">
        <LegalP>
          We retain information for as long as reasonably necessary for the purposes described in
          this notice, including providing accounts, maintaining question history, enforcing usage
          and cost limits, securing the service, resolving disputes, and meeting legal or financial
          obligations.
        </LegalP>
        <LegalP>
          Under current settings, Ask questions may remain associated with an account until the
          account or data is deleted, deidentified, or removed under an applicable retention process.
          We do not currently promise a fixed automatic deletion period for stored questions.
        </LegalP>
        <LegalP>
          Authentication sessions and verification tokens expire according to the service’s
          authentication settings, although related operational records may remain for security or
          legal purposes.
        </LegalP>
        <LegalP>
          If optional analytics is enabled, PostHog analytics events are retained for the dedicated
          project&apos;s configured retention period, currently seven years, after which they are
          deleted; associated person profiles persist until deleted. Withdrawing permission stops
          future collection, and you may also request deletion of associated analytics data by
          contacting us.
        </LegalP>
        <LegalP>
          If you make a verified deletion request, we will delete or deidentify information when
          required by applicable law and when it is no longer necessary for a legitimate operational,
          security, financial, or legal purpose. Information may remain temporarily in backups or
          with service providers until their ordinary deletion cycles complete.
        </LegalP>
        <LegalP>
          Public-source intelligence records may be retained as part of a historical intelligence
          record, subject to applicable correction, objection, and deletion rights.
        </LegalP>
      </LegalSection>

      <LegalSection id="your-rights" heading="10. Your choices and rights">
        <LegalP>Depending on where you live, you may have rights to:</LegalP>
        <LegalUL>
          <li>Ask whether we process your personal information.</li>
          <li>Request access to or a copy of your personal information.</li>
          <li>Request correction of inaccurate information.</li>
          <li>Request deletion of certain information.</li>
          <li>Object to or request restriction of certain processing.</li>
          <li>Request portability of information you provided.</li>
          <li>Withdraw consent where processing relies on consent.</li>
          <li>
            Grant or withdraw optional product-analytics permission from the Account page without
            affecting access to subscriber features.
          </li>
          <li>Appeal or complain to an applicable privacy regulator.</li>
        </LegalUL>
        <LegalP>
          These rights are not absolute and may depend on the law and circumstances.
        </LegalP>
        <LegalP>
          Send requests to <Mail />. We may ask for information reasonably necessary to verify your
          identity and protect the account. Authorized agents may be required to provide proof of
          authority.
        </LegalP>
      </LegalSection>

      <LegalSection id="international" heading="11. International processing">
        <LegalP>
          BNOW.NET is operated from the United States. Our service providers may process information
          in the United States and other countries. Those countries may have privacy laws different
          from the laws where you live.
        </LegalP>
        <LegalP>
          Where required, we will rely on appropriate contractual or legal mechanisms for
          international transfers.
        </LegalP>
      </LegalSection>

      <LegalSection id="security" heading="12. Security">
        <LegalP>
          We use reasonable technical, administrative, and organizational safeguards designed to
          protect information against unauthorized access, loss, misuse, or alteration.
        </LegalP>
        <LegalP>
          No online service, transmission method, or storage system can be guaranteed completely
          secure. You are responsible for protecting access to your email account and any device
          used to access BNOW.
        </LegalP>
      </LegalSection>

      <LegalSection id="adults-only" heading="13. Adults only">
        <LegalP>
          BNOW.NET is intended only for people aged 18 or older. We do not knowingly permit minors to
          create subscriber accounts.
        </LegalP>
        <LegalP>
          If we learn that a minor has provided personal information, we may disable the account and
          delete the information, subject to legally required retention. Contact <Mail /> if you
          believe a minor is using the service.
        </LegalP>
      </LegalSection>

      <LegalSection id="corrections" heading="14. Corrections involving intelligence records">
        <LegalP>
          BNOW processes reporting from sources that can be incomplete, disputed, outdated, or
          incorrect. If you believe a BNOW record concerning you or your organization is materially
          inaccurate, misleading, or improperly attributed, contact <Mail />.
        </LegalP>
        <LegalP>
          Please identify the relevant page, claim, source, or URL and explain the requested
          correction. We may preserve the historical record while adding a correction, qualification,
          dispute marker, or updated source where appropriate.
        </LegalP>
      </LegalSection>

      <LegalSection id="changes" heading="15. Changes to this notice">
        <LegalP>
          We may update this Privacy Notice as the product, providers, and law change. We will update
          the version and effective date when we do.
        </LegalP>
        <LegalP>
          If a change is material, we will provide reasonable notice through the service or by email.
          If a new activity requires consent, we will request consent before beginning that activity
          where required.
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" heading="16. Contact">
        <LegalContactBlock heading="Privacy questions and requests:" />
        <LegalP>
          See also our{" "}
          <Link href="/terms" className="underline hover:text-gray-900 dark:hover:text-white">
            Terms of Use
          </Link>
          .
        </LegalP>
      </LegalSection>
    </LegalDocument>
  );
}
