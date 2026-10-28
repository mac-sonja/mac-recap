import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEV_ACTOR_ID } from "@/modules/access/domain/actor";

const sql = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/20261028120000_access_sign_in.sql", import.meta.url)),
  "utf8",
)
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("sign-in migration (Story 6.1)", () => {
  it("makes profile emails unique regardless of letter case", () => {
    expect(sql).toMatch(/create unique index \w+ on public\.profile \(lower\(email\)\);/i);
  });

  it("disables the dev owner/designer and changes nothing else about it", () => {
    const update = sql.match(/update public\.profile\s+set ([\s\S]*?)\s+where ([\s\S]*?);/i);
    expect(update?.[1].trim()).toBe("disabled_at = now()");
    expect(update?.[2]).toContain(`'${DEV_ACTOR_ID}'`);
    expect(sql.match(/update /gi)).toHaveLength(1);
  });

  it("adds no role and no policy", () => {
    expect(sql).not.toMatch(/role/i);
    expect(sql).not.toMatch(/create policy/i);
  });
});
