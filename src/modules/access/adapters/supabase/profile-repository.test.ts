import { describe, expect, it, vi } from "vitest";
import { DEV_ACTOR_ID } from "@/modules/access/domain/actor";
import { createSupabaseProfileRepository, toProfile } from "./profile-repository";

const row = {
  id: DEV_ACTOR_ID,
  email: "dev-owner-designer@mac-recap.invalid",
  display_name: "Dev owner/designer",
  role: "owner_designer",
  disabled_at: null,
  job_title: null,
  designer_requested_at: null,
};

const profile = {
  id: DEV_ACTOR_ID,
  email: row.email,
  displayName: row.display_name,
  role: "owner_designer",
  disabledAt: null,
  jobTitle: null,
  designerRequestedAt: null,
};

describe("toProfile", () => {
  it("maps a row to the domain shape", () => {
    expect(toProfile(row)).toEqual({ ok: true, value: profile });
  });

  it("rejects a role outside the fixed set", () => {
    const result = toProfile({ ...row, role: "superuser" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PROFILE_INVALID");
  });
});

/** Stub of the client's `from().select().eq().maybeSingle()` chain. */
function stubClient(response: { data: unknown; error: unknown }) {
  const eq = vi.fn(() => ({ maybeSingle: async () => response }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const factory = (() => ({ from })) as unknown as Parameters<typeof createSupabaseProfileRepository>[0];
  return { factory, from, eq };
}

describe("createSupabaseProfileRepository().findById", () => {
  it("returns PROFILE_LOOKUP_FAILED and logs when the query errors", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { factory } = stubClient({ data: null, error: { code: "PGRST000", message: "down" } });
      const result = await createSupabaseProfileRepository(factory).findById(DEV_ACTOR_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("PROFILE_LOOKUP_FAILED");
      const entry = JSON.parse(String(write.mock.calls[0][0]));
      expect(entry).toMatchObject({ level: "error", actorId: DEV_ACTOR_ID });
      expect(entry.msg).toContain("PGRST000");
    } finally {
      write.mockRestore();
    }
  });

  it("returns ok(null) when no row matches", async () => {
    const { factory } = stubClient({ data: null, error: null });
    expect(await createSupabaseProfileRepository(factory).findById(DEV_ACTOR_ID)).toEqual({ ok: true, value: null });
  });

  it("returns the mapped profile and filters by id", async () => {
    const { factory, from, eq } = stubClient({ data: row, error: null });
    expect(await createSupabaseProfileRepository(factory).findById(DEV_ACTOR_ID)).toEqual({ ok: true, value: profile });
    expect(from).toHaveBeenCalledWith("profile");
    expect(eq).toHaveBeenCalledWith("id", DEV_ACTOR_ID);
  });
});
