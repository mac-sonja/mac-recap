import { ACTIVITY_TYPES, caseActivitySchema, type CaseActivity } from "@/modules/case-study/domain/case-activity";
import type { ListScope } from "@/modules/case-study/domain/case-study";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

/** The event, its actor (name and role) and its case; `!inner` drops events of cases outside the filters. */
const ACTIVITY_COLUMNS =
  "id, type, at, data, actor:profile!case_event_actor_id_fkey(display_name, role), case:case_study!case_event_case_id_fkey!inner(id, name, code, status, client_id, deleted_at)";

/**
 * The newest `limit` events of the non-deleted cases within `scope` (the same scope
 * as `list`), newest first, of the `ACTIVITY_TYPES` only, each with its actor's name
 * (`null` for the `system` role) and its case. A malformed row fails the whole read.
 */
export async function listCaseActivity(
  scope: ListScope,
  limit: number,
  client = createSupabaseAdminClient(),
): Promise<Result<CaseActivity[]>> {
  let query = client
    .from("case_event")
    .select(ACTIVITY_COLUMNS)
    .in("type", [...ACTIVITY_TYPES])
    .is("case.deleted_at", null);
  if (scope.status !== undefined) query = query.eq("case.status", scope.status);
  if (scope.clientId !== undefined) query = query.eq("case.client_id", scope.clientId);
  // `id` breaks ties so events written in one transaction keep a stable order.
  const { data, error } = await query.order("at", { ascending: false }).order("id", { ascending: true }).limit(limit);
  if (error) {
    log.error(`case_event activity failed: ${error.code}`);
    return err({ code: "CASE_ACTIVITY_LOOKUP_FAILED", message: "Could not read the activity." });
  }
  const events: CaseActivity[] = [];
  for (const row of data) {
    const parsed = caseActivitySchema.safeParse({
      id: row.id,
      type: row.type,
      at: row.at,
      data: row.data,
      actorName: row.actor === null || row.actor.role === "system" ? null : row.actor.display_name,
      case: row.case === null ? null : { id: row.case.id, name: row.case.name, code: row.case.code, status: row.case.status },
    });
    if (!parsed.success) {
      return err({ code: "CASE_ACTIVITY_INVALID", message: "A case_event row failed validation.", details: { id: row.id } });
    }
    events.push(parsed.data);
  }
  return ok(events);
}
