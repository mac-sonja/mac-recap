// Story 5.10a: one collection's page loads each case's live approved revision and its client's
// current info (never a working revision, never a copy), and a client's intro only with 2+ cases.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { CaseClientInfo, CaseStudyRevision, ClientDetail, ListedCaseStudy } from "@/modules/case-study";
import type { CollectionDetail } from "@/modules/collection";
import { caseHistoryV2 } from "@/modules/generation";
import { FORMAT_IDS } from "@/modules/rendering";
import { err, ok } from "@/shared/result";
import type { CollectionViewProps } from "./_components/collection-view";

const mocks = vi.hoisted(() => ({
  requireSurface: vi.fn(),
  getCollection: vi.fn(),
  getClient: vi.fn(),
  getClientIntro: vi.fn(),
  getLiveRevision: vi.fn(),
  getEditableRevision: vi.fn(),
  getClientInfoForCase: vi.fn(),
  listClientMaterial: vi.fn(),
  listClientSectors: vi.fn(),
  list: vi.fn(),
  listClientIndustries: vi.fn(),
  getDetailsForm: vi.fn(),
  listAssets: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: mocks.requireSurface }));
vi.mock("./actions", () => ({ moveCollectionGroup: vi.fn(), moveCollectionItem: vi.fn(), addCollectionItems: vi.fn(), removeCollectionItems: vi.fn(), retagCollection: vi.fn() }));
vi.mock("@/modules/collection", () => ({ getCollection: mocks.getCollection }));
vi.mock("@/modules/case-study", async () => {
  const actual = await vi.importActual<typeof import("@/modules/case-study")>("@/modules/case-study");
  return {
    BUSINESS_LINES: actual.BUSINESS_LINES,
    getClient: mocks.getClient,
    getClientIntro: mocks.getClientIntro,
    getLiveRevision: mocks.getLiveRevision,
    getEditableRevision: mocks.getEditableRevision,
    getClientInfoForCase: mocks.getClientInfoForCase,
    listClientMaterial: mocks.listClientMaterial,
    listClientSectors: mocks.listClientSectors,
    list: mocks.list,
    listClientIndustries: mocks.listClientIndustries,
  };
});
vi.mock("@/modules/material", () => ({
  getDetailsForm: mocks.getDetailsForm,
  listAssets: mocks.listAssets,
  getRendition: vi.fn(),
  getClientRendition: vi.fn(),
}));

const { default: CollectionPage } = await import("./page");

const ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_A = "a0000000-0000-4000-8000-00000000000a";
const CLIENT_B = "b0000000-0000-4000-8000-00000000000b";
const INTRO_A = "44444444-0000-4000-8000-00000000000a";

const listed = (id: string, clientId: string, name: string, status: ListedCaseStudy["status"] = "approved") =>
  ({ id, name, code: name.toUpperCase(), status, client: { id: clientId, name: clientId === CLIENT_A ? "Alfa" : "Beta", code: "X" }, businessLines: ["branding"], year: 2026 }) as unknown as ListedCaseStudy;
const revision = (kind: "case_history" | "client_intro" = "case_history") =>
  ({ id: "rev", status: "approved", doc: { ...caseHistoryV2(FORMAT_IDS), kind }, version: 1 }) as unknown as CaseStudyRevision;

function detail(items: CollectionDetail["items"]): CollectionDetail {
  return {
    id: ID,
    name: "Pitch moda",
    version: 4,
    tags: { businessLines: ["video", "branding"], industries: ["moda"] },
    createdBy: { id: "u", name: "Giulia" },
    createdAt: "2026-11-10T10:00:00Z",
    updatedAt: "2026-11-10T10:00:00Z",
    items,
  };
}

const params = () => Promise.resolve({ collectionId: ID });
const props = async () => ((await CollectionPage({ params: params() })) as unknown as { props: CollectionViewProps }).props;

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireSurface.mockResolvedValue({ actor: { id: "u", email: "e", displayName: "G", role: "account_sales_social" }, landing: "/library" } satisfies ShellActor);
  mocks.getClient.mockImplementation(async (id: string) => ok({ id, name: id === CLIENT_A ? "Alfa" : "Beta", code: "X", industry: "moda", description: "d", logoId: null, logoUrl: null, brief: { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" } } as ClientDetail));
  mocks.getClientIntro.mockResolvedValue(ok({ id: INTRO_A, approvedRevisionId: "intro-rev", status: "approved" }));
  mocks.getLiveRevision.mockResolvedValue(ok(revision("client_intro")));
  mocks.getClientInfoForCase.mockResolvedValue(ok({ clientId: CLIENT_A, name: "Alfa", industry: null, description: null, logoId: null, brief: { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" } } as CaseClientInfo));
  mocks.listClientMaterial.mockResolvedValue(ok([]));
  mocks.listClientSectors.mockResolvedValue(ok([{ key: "moda", label: "Moda" }]));
  mocks.list.mockResolvedValue(ok([listed("a1", CLIENT_A, "a1"), listed("x1", CLIENT_B, "x1")]));
  mocks.listClientIndustries.mockResolvedValue(ok({ [CLIENT_B]: "food" }));
  mocks.getDetailsForm.mockResolvedValue(ok({ context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" }));
  mocks.listAssets.mockResolvedValue(ok([]));
});

describe("CollectionPage (Story 5.10a)", () => {
  it("is for every role that may manage collections", async () => {
    mocks.getCollection.mockResolvedValue(ok(detail([{ case: listed("a1", CLIENT_A, "a1"), revision: revision() }])));
    await props();
    expect(mocks.requireSurface).toHaveBeenCalledWith("manage collections");
  });

  it("goes back to Raccolte for an unknown or deleted collection, and throws on any other failure", async () => {
    mocks.getCollection.mockResolvedValue(err({ code: "COLLECTION_NOT_FOUND", message: "m" }));
    await expect(CollectionPage({ params: params() })).rejects.toThrow("REDIRECT /collections");
    mocks.getCollection.mockResolvedValue(err({ code: "COLLECTION_LOOKUP_FAILED", message: "m" }));
    await expect(CollectionPage({ params: params() })).rejects.toThrow("COLLECTION_LOOKUP_FAILED");
  });

  it("groups the cases by client from their live revisions, reads an intro only for 2+ drawable cases, and offers the other approved cases", async () => {
    mocks.getCollection.mockResolvedValue(
      ok(
        detail([
          { case: listed("a1", CLIENT_A, "a1"), revision: revision() },
          { case: listed("a2", CLIENT_A, "a2"), revision: revision() },
          { case: listed("b1", CLIENT_B, "b1"), revision: revision() },
          { case: listed("b2", CLIENT_B, "b2"), revision: null },
        ]),
      ),
    );
    const view = await props();
    expect(view.groups.map((g) => [g.clientName, g.cases.map((c) => [c.caseId, c.part === null])])).toEqual([
      ["Alfa", [["a1", false], ["a2", false]]],
      ["Beta", [["b1", false], ["b2", true]]],
    ]);
    // Alfa has two drawable cases: its approved intro is read. Beta has one: none is.
    expect(view.groups[0]!.intro).not.toBeNull();
    expect(view.groups[1]!.intro).toBeNull();
    expect(mocks.getClientIntro).toHaveBeenCalledExactlyOnceWith(CLIENT_A);
    expect(mocks.getLiveRevision).toHaveBeenCalledExactlyOnceWith({ kind: "client_intro", id: INTRO_A });
    expect(mocks.getEditableRevision).not.toHaveBeenCalled();
    // Tags in display order; the candidates leave out the cases already in it.
    expect(view.tags).toEqual({ businessLines: ["branding", "video"], industries: ["moda"] });
    expect(mocks.list).toHaveBeenCalledWith({ status: "approved" });
    expect(view.candidates.map((c) => [c.id, c.industry])).toEqual([["x1", "food"]]);
    expect(view.version).toBe(4);
  });

  it("shows a case it can't read as not available, rather than failing the page", async () => {
    mocks.getCollection.mockResolvedValue(ok(detail([{ case: listed("a1", CLIENT_A, "a1"), revision: revision() }])));
    mocks.getDetailsForm.mockResolvedValue(err({ code: "MATERIAL_LOOKUP_FAILED", message: "m" }));
    const view = await props();
    expect(view.groups[0]!.cases[0]!.part).toBeNull();
  });
});
