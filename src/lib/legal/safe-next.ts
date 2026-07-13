// Open-redirect guard for the acceptance flow's `?next=` destination. The acceptance screen
// forwards the user onward after they accept; a forged `next` must never send them to an
// external origin. Pure function, no I/O — unit-tested directly.
//
// Accepts ONLY a single-slash-rooted internal path ("/", "/ask", "/digests/ru/2026-07-12").
// Rejects, falling back to "/":
//   - external / absolute URLs ("https://evil.com", "http://…")
//   - protocol-relative URLs ("//evil.com" — the browser treats these as external)
//   - backslash tricks some parsers normalize to "/" ("/\evil.com", "\\evil.com")
//   - anything not starting with "/", and control characters / whitespace injection.

const DEFAULT_NEXT = "/";

export function safeInternalPath(next: string | null | undefined): string {
  if (typeof next !== "string") return DEFAULT_NEXT;
  const value = next.trim();
  // Must be a rooted path, and not protocol-relative ("//host") which browsers follow off-site.
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_NEXT;
  // Reject backslashes anywhere — "/\evil.com" and "\\host" get normalized to "//" by some
  // clients — and any control char / whitespace that could smuggle a second URL.
  if (/[\\\x00-\x1f\x7f]/.test(value)) return DEFAULT_NEXT;
  // A scheme cannot appear in a rooted path; this also blocks "/%2F%2Fevil.com"-style
  // encoded protocol-relative payloads by refusing an encoded slash right after the root.
  if (/^\/%2f/i.test(value)) return DEFAULT_NEXT;
  return value;
}
