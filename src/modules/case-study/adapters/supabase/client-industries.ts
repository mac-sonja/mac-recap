import { SECTOR_KEY_PATTERN } from "@/modules/case-study/domain/case-study";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

/**
 * Every non-deleted client's sector key (null when it has none), by client id (Story 5.10a: a
 * collection's suggestions match a case's client industry, which a listed case doesn't carry).
 */
export async function listClientIndustries(client = createSupabaseAdminClient()): Promise<Result<Record<string, string | null>>> {
  const { data, error } = await client.from("client").select("id, industry").is("deleted_at", null);
  if (error) {
    log.error(`client industries lookup failed: ${error.code}`);
    return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not read the clients' sectors." });
  }
  const out: Record<string, string | null> = {};
  for (const row of data) out[row.id] = row.industry !== null && SECTOR_KEY_PATTERN.test(row.industry) ? row.industry : null;
  return ok(out);
}
