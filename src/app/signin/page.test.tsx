import { afterEach, describe, expect, it, vi } from "vitest";

// R7 (analyst-home-v2 sprint): an already-signed-in visitor on /signin lands on "/".
// The magic-link callback, however, now routes through the legal-acceptance screen
// (/welcome/legal?next=/) — the authoritative clickwrap step — before the signed-in home.
// This test pins the two call sites directly — no DOM render needed, since SignInPage is an
// async server component and `requestLink` is a plain function reference reachable by walking
// the returned React element tree (findFormAction below), which is a more direct pin than
// simulating a form submission through React 19's form Actions machinery in a bare jsdom
// environment (no Next.js request context).

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));

const authMock = vi.fn<() => Promise<{ user?: { email?: string | null } } | null>>();
const signInMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
  signIn: (...args: unknown[]) => signInMock(...args),
}));

const SignInPage = (await import("./page")).default;

afterEach(() => {
  authMock.mockReset();
  signInMock.mockReset();
});

/** Depth-first search of a React element tree (no rendering) for a <form>'s
 * `action` prop, which for a "use server" function stays a plain callable
 * reference in this module-graph. */
function findFormAction(node: unknown): ((fd: FormData) => Promise<void>) | null {
  if (!node || typeof node !== "object") return null;
  const el = node as { type?: unknown; props?: { action?: unknown; children?: unknown } };
  if (el.type === "form" && typeof el.props?.action === "function") {
    return el.props.action as (fd: FormData) => Promise<void>;
  }
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findFormAction(child);
      if (found) return found;
    }
    return null;
  }
  return findFormAction(children);
}

async function expectRedirect(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof RedirectSignal) return e.to;
    throw e;
  }
  throw new Error("expected a redirect, got none");
}

/** Collect all string text and every `href` prop from a React element tree (no render). */
function collect(node: unknown, hrefs: string[], texts: string[]): void {
  if (node == null || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number") {
    texts.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) collect(n, hrefs, texts);
    return;
  }
  if (typeof node === "object") {
    const el = node as { props?: { href?: unknown; children?: unknown } };
    if (typeof el.props?.href === "string") hrefs.push(el.props.href);
    collect(el.props?.children, hrefs, texts);
  }
}

describe("post-auth redirect (R7): signed-in home is the landing surface", () => {
  it("redirects an already-signed-in visitor to / (not /account)", async () => {
    authMock.mockResolvedValue({ user: { email: "a@example.com" } });
    const to = await expectRedirect(() => SignInPage({ searchParams: Promise.resolve({}) }));
    expect(to).toBe("/");
  });

  it("requests the magic link with redirectTo: '/welcome/legal?next=/' (acceptance first)", async () => {
    authMock.mockResolvedValue(null);
    signInMock.mockResolvedValue(undefined);

    const element = await SignInPage({ searchParams: Promise.resolve({}) });
    const requestLink = findFormAction(element);
    expect(requestLink).toBeTruthy();

    const fd = new FormData();
    fd.set("email", "user@example.com");
    const to = await expectRedirect(() => requestLink!(fd));

    expect(signInMock).toHaveBeenCalledWith("email", {
      email: "user@example.com",
      redirect: false,
      redirectTo: "/welcome/legal?next=/",
    });
    // Unchanged: the form itself still lands back on the confirmation screen.
    expect(to).toBe("/signin?sent=1");
  });
});

describe("pre-auth disclosure on /signin", () => {
  it("shows the 18+ notice and links to the public Terms and Privacy documents", async () => {
    authMock.mockResolvedValue(null);
    const element = await SignInPage({ searchParams: Promise.resolve({}) });
    const hrefs: string[] = [];
    const texts: string[] = [];
    collect(element, hrefs, texts);
    const text = texts.join(" ");

    expect(text).toContain("BNOW.NET is for users 18 and older");
    expect(text).toContain("agree to the");
    expect(text).toContain("acknowledge the");
    expect(hrefs).toContain("/terms");
    expect(hrefs).toContain("/privacy");
  });

  it("the sent confirmation states the single-use + copy-before-opening preferred-browser rule", async () => {
    authMock.mockResolvedValue(null);
    const element = await SignInPage({ searchParams: Promise.resolve({ sent: "1" }) });
    const hrefs: string[] = [];
    const texts: string[] = [];
    collect(element, hrefs, texts);
    const text = texts.join(" ");

    expect(text).toContain("Magic link sent");
    expect(text).toMatch(/single-use/i);
    expect(text).toMatch(/24 hours/i);
    // same rule as the email: copy the link before opening, paste into the preferred browser
    expect(text).toMatch(/copy the link before opening it/i);
    expect(text).toMatch(/preferred browser/i);
  });

  it("requesting a magic link does NOT record legal acceptance (only sign-in is called)", async () => {
    authMock.mockResolvedValue(null);
    signInMock.mockResolvedValue(undefined);
    const element = await SignInPage({ searchParams: Promise.resolve({}) });
    const requestLink = findFormAction(element);
    const fd = new FormData();
    fd.set("email", "user@example.com");
    await expectRedirect(() => requestLink!(fd));
    // The sign-in module has no acceptance-recording surface; the only effect is signIn().
    expect(signInMock).toHaveBeenCalledTimes(1);
  });
});
