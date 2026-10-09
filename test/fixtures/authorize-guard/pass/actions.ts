"use server";

import { authorize, getActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";

export async function createCase(input: unknown) {
  const actor = await getActor();
  if (!actor.ok) return actor;
  const decision = authorize(actor.value, "create case");
  if (!decision.ok) return decision;
  return caseStudy.create(actor.value, input);
}

export const renameCase = async (id: string, name: string) => {
  const actor = await getActor();
  if (!actor.ok) return actor;
  const decision = authorize(actor.value, "edit");
  if (!decision.ok) return decision;
  return caseStudy.rename(actor.value, id, name);
};
