import type { TestProject } from "vitest/node";
import { ensureTestUsers, signInTestUser, TEST_ROLES, type TestCookie, type TestRole } from "../helpers/db-actor";

declare module "vitest" {
  export interface ProvidedContext {
    /** The signed-in test owner/designer's session cookies (test/helpers/db-actor.ts): every DB test's default. */
    dbActorCookies: TestCookie[];
    /** Each role's signed-in test user's session cookies, the owner/designer's included (B9 part 2). */
    dbRoleCookies: Record<TestRole, TestCookie[]>;
  }
}

/**
 * Runs once per `npm run test:db`: creates (or reuses) one test user per role and signs
 * each in once, so every file starts from the same sessions and the run spends one
 * sign-in per role against the Auth rate limit, not one per file.
 */
export default async function setup(project: TestProject) {
  await ensureTestUsers();
  const cookies = {} as Record<TestRole, TestCookie[]>;
  for (const role of TEST_ROLES) cookies[role] = await signInTestUser(role);
  project.provide("dbActorCookies", cookies.owner_designer);
  project.provide("dbRoleCookies", cookies);
}
