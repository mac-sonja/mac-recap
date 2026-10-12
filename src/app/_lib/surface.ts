import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { can, getActor, landingFor, type Action, type Actor } from "@/modules/access";

/** An actor that can use the tool UI, with the landing path defined in `access`. */
export interface ShellActor {
  actor: Actor;
  landing: string;
}

/**
 * Resolves the request's actor for a page. `null` when there is no usable actor
 * (`getActor()` failed, or the role has no UI); the caller shows the no-actor page.
 * `connection()` keeps every tool page dynamic: rendered per request, never at build.
 * `cache` dedupes the profile read between the layout and the page of one request
 * only; the next request reads `profile` again.
 */
export const resolveShellActor = cache(async (): Promise<ShellActor | null> => {
  await connection();
  const result = await getActor();
  if (!result.ok) return null;
  const landing = landingFor(result.value.role);
  if (landing === null) return null;
  return { actor: result.value, landing };
});

/**
 * Guard for a surface whose use is `action`: redirects to the actor's landing when
 * the policy denies it. Returns `null` when there is no usable actor; the `(tool)`
 * layout then shows the no-actor page instead of the shell and the page.
 */
export async function requireSurface(action: Action): Promise<ShellActor | null> {
  const shell = await resolveShellActor();
  if (shell === null) return null;
  if (!can(shell.actor, action)) redirect(shell.landing);
  return shell;
}
