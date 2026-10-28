import type { TestProject } from "vitest/node";
import { ensureTestActor, signInTestActor, type TestCookie } from "../helpers/db-actor";

declare module "vitest" {
  export interface ProvidedContext {
    /** The signed-in test owner/designer's session cookies (test/helpers/db-actor.ts). */
    dbActorCookies: TestCookie[];
  }
}

/**
 * Runs once per `npm run test:db`: creates (or reuses) the test owner/designer
 * and signs it in, so every file starts from the same session and the run
 * spends one sign-in against the Auth rate limit, not one per file.
 */
export default async function setup(project: TestProject) {
  await ensureTestActor();
  project.provide("dbActorCookies", await signInTestActor());
}
