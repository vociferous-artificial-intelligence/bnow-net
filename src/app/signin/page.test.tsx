import { afterEach, describe, expect, it, vi } from "vitest";

// R7 (analyst-home-v2 sprint): the signed-in home is the landing surface now, so
// both post-auth redirect targets moved from /account to /. This test pins the
// two call sites directly — no DOM render needed, since SignInPage is an async
// server component and `requestLink` is a plain function reference reachable by
// walking the returned React element tree (findFormAction below), which is a
// more direct pin than simulating a form submission through React 19's form
// Actions machinery in a bare jsdom environment (no Next.js request context).

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

describe("post-auth redirect (R7): signed-in home is the landing surface", () => {
  it("redirects an already-signed-in visitor to / (not /account)", async () => {
    authMock.mockResolvedValue({ user: { email: "a@example.com" } });
    const to = await expectRedirect(() => SignInPage({ searchParams: Promise.resolve({}) }));
    expect(to).toBe("/");
  });

  it("requests the magic link with redirectTo: '/' (not /account)", async () => {
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
      redirectTo: "/",
    });
    // Unchanged: the form itself still lands back on the confirmation screen.
    expect(to).toBe("/signin?sent=1");
  });
});
