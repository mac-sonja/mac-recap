import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { CaseStudy } from "@/modules/case-study";
import { err, ok } from "@/shared/result";

const { getActor, create } = vi.hoisted(() => ({ getActor: vi.fn(), create: vi.fn() }));

// The real policy (`authorize`, `httpStatusFor`); only actor resolution is stubbed.
vi.mock("@/modules/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/access")>()),
  getActor,
}));
vi.mock("@/modules/case-study", () => ({ create }));

const { createCaseStudy } = await import("./actions");

const actor = (role: Actor["role"]): Actor => ({
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role,
});

const created: CaseStudy = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Rebrand",
  client: "Acme",
  year: 2026,
  locale: "it",
  status: "draft",
  projectOrderRef: null,
  headRevisionId: null,
  approvedRevisionId: null,
  headVersion: 0,
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-09T10:00:00Z",
  updatedAt: "2026-10-09T10:00:00Z",
  deletedAt: null,
};

const input = { name: "Rebrand", client: "Acme", year: 2026 };

beforeEach(() => {
  getActor.mockReset();
  create.mockReset();
});

describe("createCaseStudy", () => {
  it("creates the case for an owner/designer", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    create.mockResolvedValue(ok(created));
    expect(await createCaseStudy(input)).toEqual({ ok: true, value: created });
    expect(create).toHaveBeenCalledWith(actor("owner_designer"), input);
  });

  it.each(["account_sales_social", "admin", "system"] as const)(
    "returns 403 FORBIDDEN for %s and never calls the use case",
    async (role) => {
      getActor.mockResolvedValue(ok(actor(role)));
      const result = await createCaseStudy(input);
      expect(result).toEqual({ ok: false, status: 403, error: { code: "FORBIDDEN", message: expect.any(String) } });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("returns 401 when no actor resolves, without calling the use case", async () => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "No profile.", details: { id: "x" } }));
    expect(await createCaseStudy(input)).toEqual({
      ok: false,
      status: 401,
      error: { code: "UNAUTHENTICATED", message: "No profile." },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_INPUT with the failing field names and no other details", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    create.mockResolvedValue(
      err({
        code: "INVALID_INPUT",
        message: "Invalid or missing: name, client.",
        details: { fields: ["name", "client"], issues: [] },
      }),
    );
    expect(await createCaseStudy({ year: 2026 })).toEqual({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "Invalid or missing: name, client.", fields: ["name", "client"] },
    });
  });

  it("returns 500 for a write failure and keeps details server-side", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    create.mockResolvedValue(err({ code: "CASE_STUDY_WRITE_FAILED", message: "Could not create.", details: { x: 1 } }));
    expect(await createCaseStudy(input)).toEqual({
      ok: false,
      status: 500,
      error: { code: "CASE_STUDY_WRITE_FAILED", message: "Could not create." },
    });
  });
});
