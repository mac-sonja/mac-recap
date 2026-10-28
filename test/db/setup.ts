import { inject, vi } from "vitest";

// Server code reads the request's cookies through `next/headers`, which throws
// outside a Next request. The DB suite has no request, so `cookies()` returns an
// in-memory store holding the signed-in test owner/designer's session
// (test/db/global-setup.ts); `createSupabaseServerClient` and `getActor()` run
// unchanged against the real Auth server and the real `profile` row.
vi.mock("next/headers", async (importOriginal) => {
  const { TestCookieStore } = await import("../helpers/db-actor");
  const store = new TestCookieStore(inject("dbActorCookies"));
  return { ...(await importOriginal<typeof import("next/headers")>()), cookies: async () => store };
});
