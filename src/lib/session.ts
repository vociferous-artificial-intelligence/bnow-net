import { cache } from "react";
import { auth } from "@/lib/auth";

/**
 * The signed-in user's email, or null. Read by chrome that renders on *every* page
 * (the global header), so it differs from `requireUser` in two ways:
 *
 *  - `cache()` dedupes the session read within a request, so a gated page that also
 *    calls `requireUser` does not pay for two `auth()` round-trips.
 *  - It never throws. `auth()` uses `session.strategy: "database"`, so a Neon blip
 *    would otherwise take down every route at the layout level — there is no
 *    error.tsx or global-error.tsx to catch it. Chrome degrades to signed-out;
 *    the auth *gate* keeps its own fail-closed behaviour in `requireUser`.
 */
export const currentUserEmail = cache(async (): Promise<string | null> => {
  try {
    const session = await auth();
    return session?.user?.email ?? null;
  } catch (err) {
    console.error("[session] auth() failed; rendering signed-out chrome", err);
    return null;
  }
});
