import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseStudy, ClientDetail } from "@/modules/case-study";
import { caseHistoryV2 } from "@/modules/generation";
import { FORMAT_IDS } from "@/modules/rendering";
import { err, ok } from "@/shared/result";

const { get, getEditableRevision, getClientInfoForCase, getDetailsForm, listAssets, list } = vi.hoisted(() => ({
  get: vi.fn(),
  getEditableRevision: vi.fn(),
  getClientInfoForCase: vi.fn(),
  getDetailsForm: vi.fn(),
  listAssets: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/modules/case-study", async () => ({
  referencedAssetIds: (await vi.importActual<typeof import("@/modules/case-study")>("@/modules/case-study")).referencedAssetIds,
  get,
  getEditableRevision,
  getClientInfoForCase,
  list,
}));
vi.mock("@/modules/material", () => ({ getDetailsForm, listAssets, getRendition: vi.fn() }));

const { casePartOf, casePartsOf } = await import("./file-parts");

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const REVISION_ID = "dddddddd-0000-4000-8000-000000000001";
const client = { id: CLIENT_ID, name: "Lumen Srl", code: "LUM", logoUrl: null } as ClientDetail;
const approved = (over: Partial<CaseStudy> = {}): CaseStudy => ({
  id: CASE_ID,
  code: "LUM-2026-01",
  number: 1,
  name: "Rebrand",
  client: { id: CLIENT_ID, name: "Lumen Srl", code: "LUM" },
  year: 2026,
  locale: "it",
  businessLines: [],
  status: "approved",
  projectOrderRef: null,
  headRevisionId: REVISION_ID,
  approvedRevisionId: REVISION_ID,
  headVersion: 5,
  createdBy: CLIENT_ID,
  createdAt: "2026-11-01T10:00:00+00:00",
  updatedAt: "2026-11-01T10:00:00+00:00",
  deletedAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(ok(approved()));
  getEditableRevision.mockResolvedValue(ok({ id: REVISION_ID, status: "approved", version: 2, doc: caseHistoryV2(FORMAT_IDS), generatedDoc: caseHistoryV2(FORMAT_IDS) }));
  getClientInfoForCase.mockResolvedValue(
    ok({ clientId: CLIENT_ID, name: "Lumen Srl", industry: null, description: null, logoId: null, brief: { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" } }),
  );
  getDetailsForm.mockResolvedValue(ok({ context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" }));
  listAssets.mockResolvedValue(ok([]));
});

describe("casePartOf (Story 4.12a)", () => {
  it("reads an approved case of the client as a part, forked on its first save", async () => {
    const part = await casePartOf(client, CASE_ID, {});
    expect(part).toMatchObject({ ok: true, value: { key: `case:${CASE_ID}`, revision: { id: REVISION_ID, editable: true, fork: true } } });
  });

  it.each([
    ["another client's case", () => get.mockResolvedValue(ok(approved({ client: { id: "cccccccc-0000-4000-8000-000000000002", name: "X", code: "X" } })))],
    ["a case not approved", () => get.mockResolvedValue(ok(approved({ status: "in_review" })))],
    ["a deleted case", () => get.mockResolvedValue(ok(approved({ deletedAt: "2026-11-05T10:00:00+00:00" })))],
    ["an unknown case", () => get.mockResolvedValue(err({ code: "NOT_FOUND", message: "m" }))],
  ])("returns null for %s, reading nothing else", async (_name, arrange) => {
    arrange();
    expect(await casePartOf(client, CASE_ID, {})).toEqual(ok(null));
    expect(getEditableRevision).not.toHaveBeenCalled();
  });
});

describe("casePartsOf (Story 4.12a)", () => {
  it("skips a case whose read throws, keeping the others", async () => {
    const OTHER = "aaaaaaaa-0000-4000-8000-000000000002";
    list.mockResolvedValue(ok([approved(), approved({ id: OTHER, createdAt: "2026-11-02T10:00:00+00:00" })]));
    get.mockImplementation(async (id: string) => {
      if (id === OTHER) throw new Error("down");
      return ok(approved());
    });
    const parts = await casePartsOf(client, {});
    expect(parts.ok && parts.value.map((p) => p.key)).toEqual([`case:${CASE_ID}`]);
  });
});
