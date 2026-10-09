import { authorize, getActor, respondToAppError } from "@/modules/access";
import { listCases } from "@/modules/case-study";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getActor();
  if (!actor.ok) return respondToAppError(actor.error);
  const decision = authorize(actor.value, "list cases");
  if (!decision.ok) return respondToAppError(decision.error);
  return Response.json(await listCases(actor.value));
}
