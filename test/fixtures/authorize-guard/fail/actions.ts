"use server";

import { authorize, getActor } from "@/modules/access";
import { createCase, deleteCase, getCase } from "@/modules/case-study";

// Fails: never authorizes.
export async function missingAuthorize(input: unknown) {
  const actor = await getActor();
  if (!actor.ok) return actor;
  return createCase(actor.value, input);
}

// Fails: reads through a use case before authorizing.
export const useCaseFirst = async (id: string) => {
  const actor = await getActor();
  if (!actor.ok) return actor;
  const found = await getCase(id);
  if (!found.ok) return found;
  const decision = authorize(actor.value, "delete case", { status: found.value.status });
  if (!decision.ok) return decision;
  return deleteCase(actor.value, id);
};

// Fails: authorize only inside a callback that may never run first.
export async function nestedAuthorize(id: string) {
  const actor = await getActor();
  if (!actor.ok) return actor;
  const check = () => authorize(actor.value, "delete case", { status: "draft" });
  void check;
  return deleteCase(actor.value, id);
}
