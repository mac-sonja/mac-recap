import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { err, ok } from "@/shared/result";

const { getActor, listReadyDraftsUseCase } = vi.hoisted(() => ({ getActor: vi.fn(), listReadyDraftsUseCase: vi.fn() }));

// The real policy (`authorize`, `httpStatusFor`); only actor resolution is stubbed.
vi.mock("@/modules/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/access")>()),
  getActor,
}));
vi.mock("@/modules/case-study", () => ({ listReadyDrafts: listReadyDraftsUseCase }));

const { listReadyDrafts } = await import("./draft-ready-actions");

const actor = (role: Actor["role"]): Actor => ({ id: "00000000-0000-4000-8000-000000000002", email: "a@b.it", displayName: "A", role });
const input = { since: "2026-11-04T10:00:00.000Z" };
const draft = { kind: "case", id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Rebrand", readyAt: "2026-11-04T10:00:05.000000+00:00" };

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(ok(actor("owner_designer")));
});

describe("listReadyDrafts (Story 3.8)", () => {
  it.each(["owner_designer", "admin"] as const)("returns the ready drafts of %s, read for that actor", async (role) => {
    getActor.mockResolvedValue(ok(actor(role)));
    listReadyDraftsUseCase.mockResolvedValue(ok([draft]));
    expect(await listReadyDrafts(input)).toEqual({ ok: true, value: [draft] });
    expect(listReadyDraftsUseCase).toHaveBeenCalledWith(actor(role), input);
  });

  it("refuses a role that may not generate with 403, reading nothing", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    expect(await listReadyDrafts(input)).toMatchObject({ ok: false, status: 403, error: { code: "FORBIDDEN" } });
    expect(listReadyDraftsUseCase).not.toHaveBeenCalled();
  });

  it("returns 401 without an actor", async () => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "m" }));
    expect(await listReadyDrafts(input)).toMatchObject({ ok: false, status: 401 });
    expect(listReadyDraftsUseCase).not.toHaveBeenCalled();
  });

  it("passes a malformed input's 400 through", async () => {
    listReadyDraftsUseCase.mockResolvedValue(err({ code: "INVALID_INPUT", message: "m", details: { fields: ["since"] } }));
    expect(await listReadyDrafts({})).toMatchObject({ ok: false, status: 400, error: { code: "INVALID_INPUT", fields: ["since"] } });
  });
});
