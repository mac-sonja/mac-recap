import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEV_ACTOR_ID, ROLES, SYSTEM_ACTOR_ID } from "@/modules/access/domain/actor";

const sql = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/20261009120000_access_profile.sql", import.meta.url)),
  "utf8",
)
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("profile migration matches access/domain/actor.ts", () => {
  it("seeds exactly the system and dev owner/designer profiles", () => {
    const insert = sql.match(/insert into public\.profile\s*\([^)]*\)\s*values([\s\S]*?);/i);
    expect(insert).not.toBeNull();
    const rows = [...insert![1].matchAll(/\(\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([^']+)'\s*\)/g)].map(
      ([, id, role]) => ({ id, role }),
    );
    expect(rows).toEqual([
      { id: SYSTEM_ACTOR_ID, role: "system" },
      { id: DEV_ACTOR_ID, role: "owner_designer" },
    ]);
    expect(sql.match(/insert into/gi)).toHaveLength(1);
  });

  it("checks role against exactly ROLES", () => {
    const check = sql.match(/role text not null check \(role in \(([^)]*)\)\)/i);
    expect(check).not.toBeNull();
    expect([...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...ROLES]);
  });

  it("enables RLS and creates no policy", () => {
    expect(sql).toMatch(/alter table public\.profile enable row level security;/i);
    expect(sql).not.toMatch(/create policy/i);
  });
});
