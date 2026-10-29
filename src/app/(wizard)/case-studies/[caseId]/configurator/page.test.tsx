import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { CaseClientInfo, CaseStudy, CaseStudyRevision, ClientDetail } from "@/modules/case-study";
import { caseHistoryV2 } from "@/modules/generation";
import type { DetailsForm, ListedAsset, RenditionLink } from "@/modules/material";
import { FORMAT_IDS } from "@/modules/rendering";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const get = vi.fn<(id: unknown) => Promise<Result<CaseStudy>>>();
const getEditableRevision = vi.fn<(subject: unknown) => Promise<Result<CaseStudyRevision | null>>>();
const getClientInfoForCase = vi.fn<(id: unknown) => Promise<Result<CaseClientInfo>>>();
const getClient = vi.fn<(id: unknown) => Promise<Result<ClientDetail>>>();
const getDetailsForm = vi.fn<(input: unknown) => Promise<Result<DetailsForm>>>();
const listAssets = vi.fn<(input: unknown) => Promise<Result<ListedAsset[]>>>();
const getRendition = vi.fn<(assetId: unknown, spec: unknown) => Promise<Result<RenditionLink>>>();

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({ saveRevisionDoc: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "mac-theme" ? { value: "dark" } : undefined) }) }));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", () => ({
  get: (id: unknown) => get(id),
  getEditableRevision: (subject: unknown) => getEditableRevision(subject),
  getClientInfoForCase: (id: unknown) => getClientInfoForCase(id),
  getClient: (id: unknown) => getClient(id),
}));
vi.mock("@/modules/material", () => ({
  getDetailsForm: (input: unknown) => getDetailsForm(input),
  listAssets: (input: unknown) => listAssets(input),
  getRendition: (assetId: unknown, spec: unknown) => getRendition(assetId, spec),
}));

const { default: ConfiguratorPage } = await import("./page");

const ID = "aaaaaaaa-0000-4000-8000-000000000001";
const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const IMAGE = "bbbbbbbb-0000-4000-8000-000000000001";
const PENDING = "bbbbbbbb-0000-4000-8000-000000000002";
const VIDEO = "bbbbbbbb-0000-4000-8000-000000000003";

const shell: ShellActor = {
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role: "owner_designer" },
  landing: "/case-studies",
};

const inReview: CaseStudy = {
  id: ID,
  code: "LUM-2026-01",
  number: 1,
  name: "Rebrand Lumen 2026",
  client: { id: CLIENT_ID, name: "Lumen Srl", code: "LUM" },
  year: 2026,
  locale: "it",
  businessLines: ["branding", "web_design"],
  status: "in_review",
  projectOrderRef: null,
  headRevisionId: "dddddddd-0000-4000-8000-000000000001",
  approvedRevisionId: null,
  headVersion: 1,
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-14T10:00:00+00:00",
  updatedAt: "2026-10-14T10:00:00+00:00",
  deletedAt: null,
};

const revision: CaseStudyRevision = {
  id: "dddddddd-0000-4000-8000-000000000001",
  caseId: ID,
  clientIntroId: null,
  status: "working",
  version: 1,
  generatedDoc: caseHistoryV2(FORMAT_IDS),
  doc: caseHistoryV2(FORMAT_IDS),
  manifest: {} as CaseStudyRevision["manifest"],
  model: null,
  fellBack: false,
  promptVersion: null,
  schemaVersion: 2,
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-14T10:00:00+00:00",
  updatedAt: "2026-10-14T10:00:00+00:00",
};

const info: CaseClientInfo = {
  clientId: CLIENT_ID,
  name: "Lumen Srl",
  industry: { key: "illuminazione", label: "Illuminazione" },
  description: "Lampade di design.",
  logoId: null,
  brief: { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" },
};

const form: DetailsForm = {
  context: "",
  solution: "",
  results: [{ label: "richieste dal sito", value: "+38%" }],
  testimonialQuote: "Finalmente.",
  testimonialAuthor: "Giulia R.",
};

const listed = (id: string, kind: ListedAsset["kind"]): ListedAsset => ({
  id,
  kind,
  originalFileName: `${id}.bin`,
  contentType: kind === "video" ? "video/mp4" : "image/png",
  sizeBytes: 1000,
  createdAt: "2026-10-14T10:00:00+00:00",
  isFavourite: false,
  thumbnailUrl: null,
  thumbnailPending: false,
});

/** `doc` with the first block of every format's first page showing `assetId` as a video. */
function withVideo(doc: CaseStudyRevision["doc"], assetId: string): CaseStudyRevision["doc"] {
  const copy = structuredClone(doc);
  for (const entry of Object.values(copy.formats)) {
    const block = entry.pages[0]?.blocks[0];
    if (block !== undefined) block.elements = [{ elementId: "eeeeeeee-0000-4000-8000-000000000001", type: "video", assetId, fit: "fill" }];
  }
  return copy;
}

const link = (url: string): Result<RenditionLink> => ok({ url, width: 100, height: 100, contentType: "image/webp" });

const render = async (caseId = ID) => renderToStaticMarkup(await ConfiguratorPage({ params: Promise.resolve({ caseId }) }));

beforeEach(() => {
  for (const fn of [requireSurface, get, getEditableRevision, getClientInfoForCase, getClient, getDetailsForm, listAssets, getRendition]) fn.mockReset();
  requireSurface.mockResolvedValue(shell);
  get.mockResolvedValue(ok(inReview));
  getEditableRevision.mockResolvedValue(ok(revision));
  getClientInfoForCase.mockResolvedValue(ok(info));
  getClient.mockResolvedValue(ok({ id: CLIENT_ID, name: "Lumen Srl", code: "LUM", industry: "illuminazione", description: "", logoId: null, brief: info.brief, logoUrl: "https://cdn.test/logo.png" }));
  getDetailsForm.mockResolvedValue(ok(form));
  listAssets.mockResolvedValue(ok([listed(IMAGE, "image"), listed(PENDING, "image"), listed(VIDEO, "video")]));
  getRendition.mockImplementation(async (assetId, spec) => {
    if (assetId === PENDING) return err({ code: "RENDITION_NOT_READY", message: "Not ready." });
    if (assetId === VIDEO && spec === "video.poster") return err({ code: "RENDITION_NOT_READY", message: "Not ready." });
    return link(`https://cdn.test/${String(assetId)}/${String(spec)}`);
  });
});

describe("ConfiguratorPage", () => {
  it("guards the surface with `edit` and reads the case's editable revision", async () => {
    const html = await render();
    expect(requireSurface).toHaveBeenCalledWith("edit");
    expect(getEditableRevision).toHaveBeenCalledWith({ kind: "case", id: ID });
    expect(getDetailsForm).toHaveBeenCalledWith({ caseId: ID });
    expect(getClient).toHaveBeenCalledWith(CLIENT_ID);
    // The frame: back, name, code, badge, the format switch, the panels and the larger-screen message.
    expect(html).toContain('aria-label="Torna alle case history"');
    expect(html).toContain("Rebrand Lumen 2026");
    expect(html).toContain("LUM-2026-01");
    expect(html).toContain('data-status="in_review"');
    expect(html).toContain("Il configuratore ha bisogno di uno schermo più grande.");
    expect(html).toContain('aria-label="Proprietà"');
    expect(html).toContain('aria-label="Pagine e media"');
    expect(html).not.toContain("Bozza di prova");
    // The theme switch reads the cookie.
    expect(html).toMatch(/aria-checked="true"[^>]*aria-label="Scuro"/);
  });

  it("draws the revision's pages with the renderer, labelled and grouped", async () => {
    const html = await render();
    expect(html).toContain('data-template="mac-case@1"');
    expect(html).toMatch(/data-canvas-page="[^"]+"/);
    expect(html).toContain("1 · ");
  });

  it("gives the renderer only ready renditions: an image's display, a video's display without its missing poster", async () => {
    getEditableRevision.mockResolvedValue(ok(null));
    const html = await render();
    expect(getRendition).toHaveBeenCalledWith(IMAGE, "image.display");
    expect(getRendition).toHaveBeenCalledWith(VIDEO, "video.display");
    expect(getRendition).toHaveBeenCalledWith(VIDEO, "video.poster");
    expect(html).toContain(`https://cdn.test/${IMAGE}/image.display`);
    expect(html).not.toContain(`${PENDING}/`);
  });

  it("gives a video its ready poster", async () => {
    listAssets.mockResolvedValue(ok([listed(VIDEO, "video")]));
    getRendition.mockImplementation(async (assetId, spec) => link(`https://cdn.test/${String(assetId)}/${String(spec)}`));
    getEditableRevision.mockResolvedValue(ok({ ...revision, doc: withVideo(revision.doc, VIDEO) }));
    const html = await render();
    expect(html).toContain(`src="https://cdn.test/${VIDEO}/video.display"`);
    expect(html).toContain(`poster="https://cdn.test/${VIDEO}/video.poster"`);
  });

  it("leaves out an asset whose rendition is NOT_FOUND and still renders the page", async () => {
    getEditableRevision.mockResolvedValue(ok(null));
    getRendition.mockImplementation(async (assetId, spec) =>
      assetId === IMAGE ? err({ code: "NOT_FOUND", message: "Gone." }) : link(`https://cdn.test/${String(assetId)}/${String(spec)}`),
    );
    const html = await render();
    expect(html).toContain('data-template="mac-case@1"');
    expect(html).not.toContain(`${IMAGE}/`);
  });

  it("shows the client's logo from getClient", async () => {
    const html = await render();
    expect(html).toContain("https://cdn.test/logo.png");
  });

  it("shows the template's starter pages and the Bozza di prova note when the case has no revision", async () => {
    getEditableRevision.mockResolvedValue(ok(null));
    const html = await render();
    expect(html).toContain("Bozza di prova");
    // Presentazione's starter pages, grouped Intro, Output, Risultati.
    expect(html).toContain("1 · Intro");
    expect(html).toContain("2 · Contenuti");
    expect(html).toContain("3 · Risultati e testimonial");
    // The bound values: the client's sector, the case's year and services.
    expect(html).toContain("Illuminazione");
    expect(html).toContain("Web design");
  });

  it.each(["draft", "generating"] as const)("returns to Case studies for a case in %s", async (status) => {
    get.mockResolvedValue(ok({ ...inReview, status }));
    await expect(render()).rejects.toThrow("REDIRECT /case-studies");
    expect(getEditableRevision).not.toHaveBeenCalled();
  });

  it("opens an approved case, not editable until Story 4.9", async () => {
    get.mockResolvedValue(ok({ ...inReview, status: "approved" }));
    const html = await render();
    expect(html).toContain('data-status="approved"');
    expect(html).toContain('data-editable="false"');
  });

  it("lets the working head of an In revisione case be edited, and nothing else (Story 4.3a)", async () => {
    expect(await render()).toContain('data-editable="true"');
    getEditableRevision.mockResolvedValue(ok({ ...revision, status: "approved" }));
    expect(await render()).toContain('data-editable="false"');
    getEditableRevision.mockResolvedValue(ok(null));
    expect(await render()).toContain('data-editable="false"');
  });

  it("returns to Case studies for an unknown id", async () => {
    get.mockResolvedValue(err({ code: "NOT_FOUND", message: "No case study with this id." }));
    await expect(render("nope")).rejects.toThrow("REDIRECT /case-studies");
  });

  it("renders nothing without a usable actor", async () => {
    requireSurface.mockResolvedValue(null);
    expect(await render()).toBe("");
    expect(get).not.toHaveBeenCalled();
  });

  it("throws into the error boundary on any other load failure", async () => {
    getEditableRevision.mockResolvedValue(err({ code: "REVISION_LOOKUP_FAILED", message: "x" }));
    await expect(render()).rejects.toThrow("REVISION_LOOKUP_FAILED");
    getEditableRevision.mockResolvedValue(ok(revision));
    getRendition.mockResolvedValue(err({ code: "STORAGE_FAILED", message: "x" }));
    await expect(render()).rejects.toThrow("STORAGE_FAILED");
  });
});
