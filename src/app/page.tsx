import { redirect } from "next/navigation";
import { NoActor } from "@/app/_components/no-actor";
import { resolveShellActor } from "@/app/_lib/surface";

/** `/` sends the actor to its landing (defined in `access`); no actor shows the message. */
export default async function Root() {
  const shell = await resolveShellActor();
  if (shell === null) return <NoActor />;
  redirect(shell.landing);
}
