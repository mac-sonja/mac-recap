import { inject, vi } from "vitest";
import { switchSession, TestCookieStore } from "../helpers/db-actor";

// Server code reads the request's cookies through `next/headers`, which throws
// outside a Next request. The DB suite has no request, so `cookies()` returns an
// in-memory store holding a signed-in test user's session: the owner/designer's
// (test/db/global-setup.ts) unless a test switches it (`switchSession`, B9 part 2);
// `createSupabaseServerClient` and `getActor()` run unchanged against the real Auth
// server and the real `profile` row.
vi.mock("next/headers", async (importOriginal) => {
  const { currentCookieStore } = await import("../helpers/db-actor");
  return { ...(await importOriginal<typeof import("next/headers")>()), cookies: async () => currentCookieStore() };
});

switchSession(new TestCookieStore(inject("dbActorCookies")));
