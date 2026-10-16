import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { err, ok } from "@/shared/result";

const { getActor, createClientUseCase, updateClientUseCase, requestLogoUseCase, confirmLogoUseCase } = vi.hoisted(() => ({
  getActor: vi.fn(),
  createClientUseCase: vi.fn(),
  updateClientUseCase: vi.fn(),
  requestLogoUseCase: vi.fn(),
  confirmLogoUseCase: vi.fn(),
}));

// The real policy (`authorize`, `httpStatusFor`); only actor resolution is stubbed.
vi.mock("@/modules/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/access")>()),
  getActor,
}));
vi.mock("@/modules/case-study", () => ({
  createClient: createClientUseCase,
  updateClient: updateClientUseCase,
  requestClientLogoUpload: requestLogoUseCase,
  confirmClientLogoUpload: confirmLogoUseCase,
}));

const actions = await import("./actions");
const { createClient, updateClient, requestClientLogoUpload, confirmClientLogoUpload } = actions;

const actor = (role: Actor["role"]): Actor => ({
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role,
});

const LUMEN = { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM", sector: null, description: null, logoId: null };
const LOGO_ID = "eeeeeeee-0000-4000-8000-000000000001";

const cases = [
  ["createClient", createClient, createClientUseCase, { name: "Lumen Srl", sector: "Moda", description: "Brand." }],
  ["updateClient", updateClient, updateClientUseCase, { clientId: LUMEN.id, name: "Lumen S.r.l.", sector: null, description: null, logoId: null }],
  ["requestClientLogoUpload", requestClientLogoUpload, requestLogoUseCase, { clientId: LUMEN.id, contentType: "image/png", sizeBytes: 10 }],
  ["confirmClientLogoUpload", confirmClientLogoUpload, confirmLogoUseCase, { clientId: LUMEN.id, logoId: LOGO_ID, contentType: "image/png" }],
] as const;

beforeEach(() => {
  for (const fn of [getActor, createClientUseCase, updateClientUseCase, requestLogoUseCase, confirmLogoUseCase]) fn.mockReset();
});

describe("client actions", () => {
  it("exports only add, edit and the two logo steps: no delete", () => {
    expect(Object.keys(actions).sort()).toEqual(["confirmClientLogoUpload", "createClient", "requestClientLogoUpload", "updateClient"]);
  });

  it.each(cases)("%s passes the actor and its input unchanged for an owner/designer", async (_name, action, useCase, input) => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    useCase.mockResolvedValue(ok(LUMEN));
    expect(await action(input)).toEqual({ ok: true, value: LUMEN });
    expect(useCase).toHaveBeenCalledExactlyOnceWith(actor("owner_designer"), input);
    expect(useCase.mock.calls[0][1]).toBe(input);
  });

  it.each(cases.flatMap((c) => (["account_sales_social", "admin", "system"] as const).map((role) => [c[0], role, c[1], c[2], c[3]] as const)))(
    "%s returns 403 FORBIDDEN for %s and never calls the use case",
    async (_name, role, action, useCase, input) => {
      getActor.mockResolvedValue(ok(actor(role)));
      expect(await action(input)).toEqual({ ok: false, status: 403, error: { code: "FORBIDDEN", message: expect.any(String) } });
      expect(useCase).not.toHaveBeenCalled();
    },
  );

  it.each(cases)("%s returns 401 when no actor resolves", async (_name, action, useCase, input) => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "No profile." }));
    expect(await action(input)).toMatchObject({ ok: false, status: 401 });
    expect(useCase).not.toHaveBeenCalled();
  });

  it.each([
    ["CLIENT_NAME_TAKEN", 409],
    ["CLIENT_CODE_EXHAUSTED", 409],
    ["CLIENT_NOT_FOUND", 404],
    ["CLIENT_LOGO_INVALID", 400],
    ["CLIENT_WRITE_FAILED", 500],
  ] as const)("maps %s to %i and keeps details server-side", async (code, status) => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    updateClientUseCase.mockResolvedValue(err({ code, message: "m", details: { clientId: LUMEN.id } }));
    expect(await updateClient({ clientId: LUMEN.id, name: "X", sector: null, description: null, logoId: null })).toEqual({ ok: false, status, error: { code, message: "m" } });
  });

  it("maps CLIENT_FIELD_TOO_LONG to 400 with the failing field names", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    updateClientUseCase.mockResolvedValue(err({ code: "CLIENT_FIELD_TOO_LONG", message: "m", details: { fields: ["description"] } }));
    expect(await updateClient({ clientId: LUMEN.id, name: "X", sector: null, logoId: null, description: "x".repeat(401) })).toEqual({
      ok: false,
      status: 400,
      error: { code: "CLIENT_FIELD_TOO_LONG", message: "m", fields: ["description"] },
    });
  });

  it.each([
    ["requestClientLogoUpload", requestClientLogoUpload, requestLogoUseCase],
    ["confirmClientLogoUpload", confirmClientLogoUpload, confirmLogoUseCase],
  ] as const)("%s maps CLIENT_LOGO_INVALID to 400", async (_name, action, useCase) => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    useCase.mockResolvedValue(err({ code: "CLIENT_LOGO_INVALID", message: "m", details: { clientId: LUMEN.id } }));
    expect(await action({})).toEqual({ ok: false, status: 400, error: { code: "CLIENT_LOGO_INVALID", message: "m" } });
  });

  it.each([
    ["CLIENT_NAME_TAKEN", 409],
    ["CLIENT_CODE_EXHAUSTED", 409],
  ] as const)("createClient maps %s to %i and keeps details server-side", async (code, status) => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    createClientUseCase.mockResolvedValue(err({ code, message: "m", details: { name: "Lumen Srl" } }));
    expect(await createClient({ name: "Lumen Srl" })).toEqual({ ok: false, status, error: { code, message: "m" } });
  });

  it("maps INVALID_INPUT to 400 with the failing field names", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    createClientUseCase.mockResolvedValue(
      err({ code: "INVALID_INPUT", message: "Invalid or missing: name.", details: { fields: ["name"], issues: [] } }),
    );
    expect(await createClient({ name: " " })).toEqual({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "Invalid or missing: name.", fields: ["name"] },
    });
  });
});
