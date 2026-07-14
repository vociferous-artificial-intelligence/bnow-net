import { afterEach, describe, expect, it, vi } from "vitest";

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const revalidateMock = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidateMock(path) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
const acceptedMock = vi.fn();
const updateMock = vi.fn();
vi.mock("@/lib/legal/acceptance", () => ({
  hasCurrentAcceptanceByEmail: (email: string) => acceptedMock(email),
  updateAnalyticsPreferenceForEmail: (email: string, preference: unknown) =>
    updateMock(email, preference),
}));

const { updateAnalyticsPreferenceAction } = await import("./actions");
const IDLE = { status: "idle" as const };

function form(value?: string): FormData {
  const data = new FormData();
  if (value !== undefined) data.set("analytics_preference", value);
  return data;
}

afterEach(() => {
  authMock.mockReset();
  acceptedMock.mockReset();
  updateMock.mockReset();
  revalidateMock.mockReset();
});

describe("account analytics preference action", () => {
  it("requires an authenticated user with current legal acceptance", async () => {
    authMock.mockResolvedValue(null);
    await expect(updateAnalyticsPreferenceAction(IDLE, form("granted"))).rejects.toMatchObject({
      to: "/signin",
    });
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    acceptedMock.mockResolvedValue(false);
    await expect(updateAnalyticsPreferenceAction(IDLE, form("granted"))).rejects.toMatchObject({
      to: "/welcome/legal?next=/account",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it.each(["granted", "denied"])("persists %s authoritatively", async (preference) => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    acceptedMock.mockResolvedValue(true);
    updateMock.mockResolvedValue({ ok: true, preference });
    await expect(updateAnalyticsPreferenceAction(IDLE, form(preference))).resolves.toEqual({
      status: "saved",
    });
    expect(updateMock).toHaveBeenCalledWith("a@b.com", preference);
    expect(revalidateMock).toHaveBeenCalledWith("/account");
  });

  it("fails closed for a missing or malformed preference", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    acceptedMock.mockResolvedValue(true);
    updateMock.mockResolvedValue({ ok: false, error: "invalid_preference" });
    await expect(updateAnalyticsPreferenceAction(IDLE, form("unset"))).resolves.toEqual({
      status: "error",
    });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
