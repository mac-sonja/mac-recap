import { getActor } from "@/modules/access";
import { listCases } from "@/modules/case-study";

// Fails: no authorize( before the use case.
export async function GET() {
  const actor = await getActor();
  if (!actor.ok) return Response.json({ error: actor.error }, { status: 401 });
  return Response.json(await listCases(actor.value));
}
