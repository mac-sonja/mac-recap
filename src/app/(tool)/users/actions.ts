"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { requestOrigin } from "@/app/_lib/origin";
import { addUser as addAccessUser, authorize, changeUserRole, getActor, removeUser as removeAccessUser } from "@/modules/access";
import type { AddedUser, Profile } from "@/modules/access";

// The admin's Users screen (Story 6.3). Every action resolves the actor and
// authorizes `manage users` (admin only) before the use case runs.

/**
 * Adds a user: `{ firstName, lastName, email, role }` (owner/designer,
 * account/sales/social or admin) and sends the invite. 400 `INVALID_INPUT`
 * naming the fields; 409 `USER_EXISTS`; 502 `INVITE_FAILED`.
 */
export async function addUser(input: unknown): Promise<ActionResult<AddedUser>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage users");
  if (!decision.ok) return failure(decision.error);
  const added = await addAccessUser(actor.value, input, await requestOrigin());
  return added.ok ? added : failure(added.error);
}

/** Changes a role or approves a designer: `{ profileId, role }`. 409 `LAST_ADMIN`; 404 `NOT_FOUND`. */
export async function changeRole(input: unknown): Promise<ActionResult<Profile>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage users");
  if (!decision.ok) return failure(decision.error);
  const changed = await changeUserRole(actor.value, input);
  return changed.ok ? changed : failure(changed.error);
}

/** Removes a user (`disabled_at`): `{ profileId }`. 409 `LAST_ADMIN`; 404 `NOT_FOUND`. */
export async function removeUser(input: unknown): Promise<ActionResult<null>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage users");
  if (!decision.ok) return failure(decision.error);
  const removed = await removeAccessUser(actor.value, input);
  return removed.ok ? { ok: true, value: null } : failure(removed.error);
}
