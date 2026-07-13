import { permanentRedirect } from "next/navigation";

// Private-beta repositioning (2026-07-13): the public pricing page is retired.
// Old links and search results land on the beta access-request page instead of
// dead-ending; no price copy renders from this route. force-dynamic guarantees a
// real request-time 308 rather than a prerendered shell.
export const dynamic = "force-dynamic";

export default function PricingPage(): never {
  permanentRedirect("/access");
}
