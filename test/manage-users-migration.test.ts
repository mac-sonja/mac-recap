import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SYSTEM_ACTOR_ID } from "@/modules/access/domain/actor";

const sql = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/20261028140000_access_manage_users.sql", import.meta.url)),
  "utf8",
)
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("manage-users migration (Story 6.3)", () => {
  it("allows the system role only on the seeded system profile", () => {
    expect(sql).toContain(`check (role <> 'system' or id = '${SYSTEM_ACTOR_ID}')`);
  });

  it("keeps one enabled admin in the database, serialised by a lock", () => {
    expect(sql).toMatch(/before update of role, disabled_at on public\.profile/i);
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("raise exception 'LAST_ADMIN'");
  });

  it("does not expose the trigger function to API roles", () => {
    expect(sql).toMatch(/revoke all on function public\.profile_keep_last_admin\(\) from public, anon, authenticated;/i);
  });
});
