import { describe, expect, it } from "vitest";
import {
  addItems,
  collectionNameSchema,
  createCollectionInputSchema,
  groupsOf,
  moveGroup,
  moveItem,
  orderForCreate,
  removeItems,
  sameOrder,
  type GroupedItem,
} from "./collection";

const A = "client-a";
const B = "client-b";
const C = "client-c";
const item = (caseId: string, clientId: string): GroupedItem => ({ caseId, clientId });

describe("collection order (Story 5.10a)", () => {
  it("keeps selection order with each client's cases gathered at its first selected case", () => {
    expect(orderForCreate([item("a1", A), item("b1", B), item("a2", A)])).toEqual(["a1", "a2", "b1"]);
    expect(orderForCreate([item("b1", B), item("a1", A), item("c1", C), item("b2", B), item("a2", A)])).toEqual(["b1", "b2", "a1", "a2", "c1"]);
  });

  it("groups items by client in order of each group's first case", () => {
    expect(groupsOf([item("a1", A), item("a2", A), item("b1", B)])).toEqual([
      { clientId: A, caseIds: ["a1", "a2"] },
      { clientId: B, caseIds: ["b1"] },
    ]);
  });

  it("adds a case at the end of its client's group, or a new group at the end, skipping one already in", () => {
    const current = [item("a1", A), item("a2", A), item("b1", B)];
    expect(addItems(current, [item("b2", B)])).toEqual(["a1", "a2", "b1", "b2"]);
    expect(addItems(current, [item("a3", A)])).toEqual(["a1", "a2", "a3", "b1"]);
    expect(addItems(current, [item("c1", C), item("a1", A)])).toEqual(["a1", "a2", "b1", "c1"]);
  });

  it("removes cases", () => {
    expect(removeItems([item("a1", A), item("a2", A), item("b1", B)], ["a2"])).toEqual(["a1", "b1"]);
  });

  it("moves a whole group", () => {
    const current = [item("a1", A), item("a2", A), item("b1", B)];
    expect(moveGroup(current, B, 0)).toEqual(["b1", "a1", "a2"]);
    expect(moveGroup(current, A, 5)).toEqual(["b1", "a1", "a2"]);
    expect(moveGroup(current, C, 0)).toBeNull();
  });

  it("moves a case only within its own group", () => {
    const current = [item("a1", A), item("a2", A), item("b1", B)];
    expect(moveItem(current, "a1", 1)).toEqual(["a2", "a1", "b1"]);
    // A place past the group's end stays in the group: never into B.
    expect(moveItem(current, "a1", 9)).toEqual(["a2", "a1", "b1"]);
    expect(moveItem(current, "zz", 0)).toBeNull();
  });

  it("compares orders", () => {
    expect(sameOrder([item("a1", A)], ["a1"])).toBe(true);
    expect(sameOrder([item("a1", A), item("a2", A)], ["a2", "a1"])).toBe(false);
  });
});

describe("collection input", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("trims the name and takes 1–120 characters", () => {
    expect(collectionNameSchema.parse("  Pitch moda ")).toBe("Pitch moda");
    expect(collectionNameSchema.safeParse("   ").success).toBe(false);
    expect(collectionNameSchema.safeParse("x".repeat(121)).success).toBe(false);
    expect(collectionNameSchema.safeParse("x".repeat(120)).success).toBe(true);
  });

  it("needs a business line, an industry and a case, each once", () => {
    const base = { name: "Pitch", businessLines: ["branding"], industries: ["moda"], caseIds: [id] };
    expect(createCollectionInputSchema.safeParse(base).success).toBe(true);
    expect(createCollectionInputSchema.safeParse({ ...base, businessLines: [] }).success).toBe(false);
    expect(createCollectionInputSchema.safeParse({ ...base, industries: [] }).success).toBe(false);
    expect(createCollectionInputSchema.safeParse({ ...base, caseIds: [] }).success).toBe(false);
    expect(createCollectionInputSchema.safeParse({ ...base, caseIds: [id, id] }).success).toBe(false);
    expect(createCollectionInputSchema.safeParse({ ...base, industries: ["Moda!"] }).success).toBe(false);
  });
});
