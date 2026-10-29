import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { err, ok } from "@/shared/result";

const { getActor, saveRevisionDocUseCase } = vi.hoisted(() => ({ getActor: vi.fn(), saveRevisionDocUseCase: vi.fn() }));

// The real policy (`authorize`, `httpStatusFor`); only actor resolution is stubbed.
vi.mock("@/modules/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/access")>()),
  getActor,
}));
vi.mock("@/modules/case-study", () => ({ saveRevisionDoc: saveRevisionDocUseCase }));

const { saveRevisionDoc } = await import("./actions");

const actor = (role: Actor["role"]): Actor => ({ id: "00000000-0000-4000-8000-000000000002", email: "a@b.it", displayName: "A", role });
const input = { caseId: "aaaaaaaa-0000-4000-8000-000000000001", revisionId: "bbbbbbbb-0000-4000-8000-000000000001", doc: {}, expectedVersion: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(ok(actor("owner_designer")));
});

describe("saveRevisionDoc", () => {
  it("saves with the actor and returns only the new version", async () => {
    saveRevisionDocUseCase.mockResolvedValue(ok({ id: input.revisionId, version: 3, doc: { big: true } }));
    expect(await saveRevisionDoc(input)).toEqual({ ok: true, value: { version: 3 } });
    expect(saveRevisionDocUseCase).toHaveBeenCalledWith(actor("owner_designer"), input);
  });

  it("refuses account/sales/social with 403 before any save", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    expect(await saveRevisionDoc(input)).toMatchObject({ ok: false, status: 403, error: { code: "FORBIDDEN" } });
    expect(saveRevisionDocUseCase).not.toHaveBeenCalled();
  });

  it("returns 401 without an actor", async () => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "m" }));
    expect(await saveRevisionDoc(input)).toMatchObject({ ok: false, status: 401 });
    expect(saveRevisionDocUseCase).not.toHaveBeenCalled();
  });

  it.each([
    ["STALE_REVISION", 409],
    ["STALE_HEAD", 409],
    ["REVISION_NOT_WRITABLE", 409],
    ["CASE_NOT_EDITABLE", 409],
    ["ASSET_NOT_ALLOWED", 400],
    ["NOT_FOUND", 404],
  ] as const)("maps %s to %i without details", async (code, status) => {
    saveRevisionDocUseCase.mockResolvedValue(err({ code, message: "m", details: { secret: 1 } }));
    expect(await saveRevisionDoc(input)).toEqual({ ok: false, status, error: { code, message: "m" } });
  });
});
