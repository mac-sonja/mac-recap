import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { ListedCaseStudy } from "@/modules/case-study/domain/case-study";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import type { ClientCaseOrderRepository } from "@/modules/case-study/ports/client-case-order-repository";
import { err, ok } from "@/shared/result";
import { makeListClientCasesInOrder, makeSetClientCaseOrder } from "./client-case-order";

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};
const CLIENT_ID = "11111111-0000-4000-8000-000000000001";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";

function fakeOrders(saved: string[] | null = null) {
  return {
    find: vi.fn<ClientCaseOrderRepository["find"]>(async () => ok(saved)),
    set: vi.fn<ClientCaseOrderRepository["set"]>(async (_clientId, caseIds) => ok([...caseIds])),
  } satisfies ClientCaseOrderRepository;
}

const listed = (id: string, createdAt: string) => ({ id, createdAt }) as ListedCaseStudy;

function fakeCases(rows: ListedCaseStudy[]) {
  return { list: vi.fn(async () => ok(rows)) } as unknown as CaseStudyRepository & { list: ReturnType<typeof vi.fn> };
}

describe("setClientCaseOrder (Story 4.12b)", () => {
  it("saves the ids in the order given, lowercased, with the actor", async () => {
    const orders = fakeOrders();
    expect(await makeSetClientCaseOrder(orders)(actor, { clientId: CLIENT_ID, caseIds: [C, A.toUpperCase(), B] })).toEqual(
      ok({ clientId: CLIENT_ID, caseIds: [C, A, B] }),
    );
    expect(orders.set).toHaveBeenCalledExactlyOnceWith(CLIENT_ID, [C, A, B], actor.id);
  });

  it("refuses a malformed input or a repeated id without writing", async () => {
    const orders = fakeOrders();
    expect(await makeSetClientCaseOrder(orders)(actor, { clientId: CLIENT_ID, caseIds: [A, A] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await makeSetClientCaseOrder(orders)(actor, { clientId: "x", caseIds: [] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await makeSetClientCaseOrder(orders)(actor, null)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(orders.set).not.toHaveBeenCalled();
  });

  it("passes the store's refusals on (a foreign id, an unknown client)", async () => {
    const orders = fakeOrders();
    orders.set.mockResolvedValueOnce(err({ code: "INVALID_INPUT", message: "foreign" }));
    expect(await makeSetClientCaseOrder(orders)(actor, { clientId: CLIENT_ID, caseIds: [A] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    orders.set.mockResolvedValueOnce(err({ code: "CLIENT_NOT_FOUND", message: "gone" }));
    expect(await makeSetClientCaseOrder(orders)(actor, { clientId: CLIENT_ID, caseIds: [A] })).toMatchObject({ ok: false, error: { code: "CLIENT_NOT_FOUND" } });
  });
});

describe("listClientCasesInOrder (Story 4.12b)", () => {
  const rows = [listed(A, "2026-01-01T00:00:00Z"), listed(B, "2026-02-01T00:00:00Z"), listed(C, "2026-03-01T00:00:00Z")];

  it("reads the client's approved cases and lists them newest first with no saved order", async () => {
    const cases = fakeCases(rows);
    const result = await makeListClientCasesInOrder(cases, fakeOrders())(CLIENT_ID);
    expect(result.ok && result.value.map((c) => c.id)).toEqual([C, B, A]);
    expect(cases.list).toHaveBeenCalledWith({ clientId: CLIENT_ID, status: "approved" });
  });

  it("follows the saved order, then the cases approved later", async () => {
    const result = await makeListClientCasesInOrder(fakeCases(rows), fakeOrders([A, "dddddddd-0000-4000-8000-000000000004", B]))(CLIENT_ID);
    expect(result.ok && result.value.map((c) => c.id)).toEqual([A, B, C]);
  });

  it("refuses a malformed id and passes a failed read on", async () => {
    expect(await makeListClientCasesInOrder(fakeCases(rows), fakeOrders())("nope")).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const orders = fakeOrders();
    orders.find.mockResolvedValueOnce(err({ code: "CLIENT_LOOKUP_FAILED", message: "boom" }));
    expect(await makeListClientCasesInOrder(fakeCases(rows), orders)(CLIENT_ID)).toMatchObject({ ok: false, error: { code: "CLIENT_LOOKUP_FAILED" } });
  });
});
