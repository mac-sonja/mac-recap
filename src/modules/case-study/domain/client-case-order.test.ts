import { describe, expect, it } from "vitest";
import { orderClientCases, setClientCaseOrderInputSchema } from "./client-case-order";

const A = { id: "aaaaaaaa-0000-4000-8000-000000000001", createdAt: "2026-01-01T10:00:00Z" };
const B = { id: "bbbbbbbb-0000-4000-8000-000000000002", createdAt: "2026-02-01T10:00:00Z" };
const C = { id: "cccccccc-0000-4000-8000-000000000003", createdAt: "2026-03-01T10:00:00Z" };
const ids = (cases: readonly { id: string }[]) => cases.map((c) => c.id);

describe("orderClientCases (Story 4.12b)", () => {
  it("lists newest created first with no saved order (or an empty one)", () => {
    expect(ids(orderClientCases([A, C, B], null))).toEqual([C.id, B.id, A.id]);
    expect(ids(orderClientCases([A, C, B], []))).toEqual([C.id, B.id, A.id]);
  });

  it("follows the saved order", () => {
    expect(ids(orderClientCases([A, B, C], [A.id, C.id, B.id]))).toEqual([A.id, C.id, B.id]);
  });

  it("puts a case approved after the order was saved at the end, newest first among those", () => {
    const D = { id: "dddddddd-0000-4000-8000-000000000004", createdAt: "2026-04-01T10:00:00Z" };
    expect(ids(orderClientCases([A, B, C, D], [A.id, B.id]))).toEqual([A.id, B.id, D.id, C.id]);
  });

  it("skips saved ids no longer approved or gone", () => {
    expect(ids(orderClientCases([A, C], [A.id, B.id, C.id]))).toEqual([A.id, C.id]);
    expect(orderClientCases([], [A.id])).toEqual([]);
  });

  it("compares ids case-insensitively and never repeats a case", () => {
    expect(ids(orderClientCases([A, B], [B.id.toUpperCase(), B.id, A.id]))).toEqual([B.id, A.id]);
  });

  it("leaves its input untouched", () => {
    const cases = [A, B, C];
    orderClientCases(cases, [C.id]);
    expect(cases).toEqual([A, B, C]);
  });
});

describe("setClientCaseOrderInputSchema", () => {
  it("lowercases the ids and refuses repeats, malformed ids and other keys", () => {
    expect(setClientCaseOrderInputSchema.parse({ clientId: A.id.toUpperCase(), caseIds: [B.id.toUpperCase()] })).toEqual({ clientId: A.id, caseIds: [B.id] });
    expect(setClientCaseOrderInputSchema.safeParse({ clientId: A.id, caseIds: [B.id, B.id.toUpperCase()] }).success).toBe(false);
    expect(setClientCaseOrderInputSchema.safeParse({ clientId: A.id, caseIds: ["nope"] }).success).toBe(false);
    expect(setClientCaseOrderInputSchema.safeParse({ clientId: A.id, caseIds: [], extra: 1 }).success).toBe(false);
  });
});
