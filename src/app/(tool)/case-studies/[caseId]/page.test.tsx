import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { CaseActivity, CaseClientInfo, CaseStudy, CaseStudyRevision, ClientDetail } from "@/modules/case-study";
import { caseHistoryV2 } from "@/modules/generation";
import type { DetailsForm, ListedAsset, RenditionLink } from "@/modules/material";
import { FORMAT_IDS } from "@/modules/rendering";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string, resource?: unknown) => Promise<ShellActor | null>>();
const get = vi.fn<(id: unknown) => Promise<Result<CaseStudy>>>();
const getLiveRevision = vi.fn<(subject: unknown) => Promise<Result<CaseStudyRevision | null>>>();
const getClientInfoForCase = vi.fn<(id: unknown) => Promise<Result<CaseClientInfo>>>();
const getClient = vi.fn<(id: unknown) => Promise<Result<ClientDetail>>>();
const listCaseActivity = vi.fn<(id: unknown) => Promise<Result<CaseActivity[]>>>();
const getDetailsForm = vi.fn<(input: unknown) => Promise<Result<DetailsForm>>>();
const listAssets = vi.fn<(input: unknown) => Promise<Result<ListedAsset[]>>>();
const getRendition = vi.fn<(assetId: unknown, spec: unknown) => Promise<Result<RenditionLink>>>();

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
// Elimina's dialog calls the server action; the page test never presses it.
vi.mock("@/app/(tool)/case-studies/actions", () => ({ deleteCaseStudy: vi.fn() }));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string, resource?: unknown) => requireSurface(action, resource) }));
vi.mock("@/modules/case-study", () => ({
  get: (id: unknown) => get(id),
  getLiveRevision: (subject: unknown) => getLiveRevision(subject),
  getClientInfoForCase: (id: unknown) => getClientInfoForCase(id),
  getClient: (id: unknown) => getClient(id),
  listCaseActivity: (id: unknown) => listCaseActivity(id),
}));
vi.mock("@/modules/material", () => ({
  getDetailsForm: (input: unknown) => getDetailsForm(input),
  listAssets: (input: unknown) => listAssets(input),
  getRendition: (assetId: unknown, spec: unknown) => getRendition(assetId, spec),
}));

const { default: CaseViewPage } = await import("./page");

const ID = "aaaaaaaa-0000-4000-8000-000000000001";
const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const IMAGE = "bbbbbbbb-0000-4000-8000-000000000001";
const PENDING = "bbbbbbbb-0000-4000-8000-000000000002";
const VIDEO = "bbbbbbbb-0000-4000-8000-000000000003";

const shellFor = (role: "owner_designer" | "admin" | "account_sales_social"): ShellActor => ({
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role },
  landing: role === "account_sales_social" ? "/library" : "/home",
});
const shell = shellFor("owner_designer");

const approved: CaseStudy = {
  id: ID,
  code: "LUM-2026-01",
  number: 1,
  name: "Rebrand Lumen 2026",
  client: { id: CLIENT_ID, name: "Lumen Srl", code: "LUM" },
  year: 2026,
  locale: "it",
  businessLines: ["branding", "web_design"],
  status: "approved",
  projectOrderRef: null,
  headRevisionId: "dddddddd-0000-4000-8000-000000000001",
  approvedRevisionId: "dddddddd-0000-4000-8000-000000000001",
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
  status: "approved",
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

const render = async (caseId = ID) => renderToStaticMarkup(await CaseViewPage({ params: Promise.resolve({ caseId }) }));

beforeEach(() => {
  for (const fn of [requireSurface, get, getLiveRevision, getClientInfoForCase, getClient, getDetailsForm, listAssets, getRendition, listCaseActivity]) fn.mockReset();
  listCaseActivity.mockResolvedValue(ok([]));
  requireSurface.mockResolvedValue(shell);
  get.mockResolvedValue(ok(approved));
  getLiveRevision.mockResolvedValue(ok(revision));
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

describe("CaseViewPage", () => {
  it("guards the surface with `list cases` on approved cases and reads the case's live revision, never the head", async () => {
    const html = await render();
    expect(requireSurface).toHaveBeenCalledWith("list cases", { status: "approved" });
    expect(getLiveRevision).toHaveBeenCalledWith({ kind: "case", id: ID });
    expect(getDetailsForm).toHaveBeenCalledWith({ caseId: ID });
    expect(getClient).toHaveBeenCalledWith(CLIENT_ID);
    // The client-page layout: back, name, code, badge, the format switch, Scarica and Modifica.
    expect(html).toMatch(/href="\/case-studies"[^>]*>.*Torna alle case history<\/a>/);
    expect(html).toMatch(/<h1[^>]*>Rebrand Lumen 2026<\/h1>/);
    expect(html).not.toContain("h-dvh");
    expect(html).toContain("Rebrand Lumen 2026");
    expect(html).toContain("LUM-2026-01");
    expect(html).toContain('data-status="approved"');
    expect(html).toContain('aria-label="Formato"');
    expect(html).toContain('aria-label="Scarica Rebrand Lumen 2026"');
    expect(html).toMatch(new RegExp(`href="/case-studies/${ID}/configurator"[^>]*>.*Modifica</a>`));
    expect(html).toContain("L’anteprima ha bisogno di uno schermo più grande.");
    expect(html).not.toContain("Bozza di prova");
    // Read-only: no editor panels, no Anteprima eye, no Approva.
    expect(html).not.toContain('aria-label="Proprietà"');
    expect(html).not.toContain('aria-label="Anteprima"');
    expect(html).not.toContain(">Approva<");
    // Raccolte, empty until Story 5.10, and Elimina for an Owner.
    expect(html).toMatch(/<h2[^>]*>Raccolte<\/h2>/);
    expect(html).toContain("Non è in nessuna raccolta.");
    expect(html).toMatch(/<button[^>]*>Elimina<\/button>/);
  });

  it("lists this case's Attività as Home phrases it, newest first, between Raccolte and Elimina, with no links", async () => {
    const event = (n: number, over: Partial<CaseActivity>): CaseActivity => ({
      id: `eeeeeeee-0000-4000-8000-00000000000${n}`,
      type: "transition",
      at: `2026-10-14T1${n}:00:00Z`,
      data: {},
      actorName: "Giulia Riva",
      case: { id: ID, name: approved.name, code: approved.code, status: "approved" },
      ...over,
    });
    listCaseActivity.mockResolvedValue(
      ok([
        event(5, { data: { event: "approve" } }),
        event(4, { actorName: null, data: { event: "generation_succeeded" } }),
        event(3, { data: { event: "generate" } }),
        event(2, { type: "asset_uploaded" }),
        event(1, { type: "asset_uploaded" }),
        event(0, { type: "case_created" }),
      ]),
    );
    requireSurface.mockResolvedValue(shellFor("account_sales_social"));
    const html = await render();
    expect(listCaseActivity).toHaveBeenCalledWith(ID);
    const card = html.match(/<section aria-labelledby="case-activity-heading"[^>]*>(.*?)<\/section>/)?.[1] ?? "";
    expect(card).toMatch(/<h2 id="case-activity-heading"[^>]*>Attività<\/h2>/);
    const text = [...card.matchAll(/<li [^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<time[^>]*>.*?<\/time>/, "").replace(/<[^>]+>/g, ""));
    expect(text).toEqual([
      "Giulia Riva ha approvato Rebrand Lumen 2026.",
      "La bozza di Rebrand Lumen 2026 è pronta da rivedere.",
      "Giulia Riva ha avviato la bozza di Rebrand Lumen 2026.",
      "Giulia Riva ha caricato 2 file in Rebrand Lumen 2026.",
      "Giulia Riva ha creato Rebrand Lumen 2026.",
    ]);
    expect(card).not.toContain("<a ");
    expect(html.indexOf(">Raccolte<")).toBeLessThan(html.indexOf("case-activity-heading"));
    requireSurface.mockResolvedValue(shell);
    const owner = await render();
    expect(owner.indexOf("case-activity-heading")).toBeLessThan(owner.search(/<button[^>]*>Elimina<\/button>/));
  });

  it("shows its empty line when the case has no events", async () => {
    expect(await render()).toContain("Ancora nessuna attività.");
  });

  it.each(["CASE_ACTIVITY_LOOKUP_FAILED", "CASE_ACTIVITY_INVALID"] as const)("shows Home's failed line on %s and still renders the rest", async (code) => {
    listCaseActivity.mockResolvedValue(err({ code, message: "x" }));
    const html = await render();
    expect(html).toContain("Non siamo riusciti a caricare le attività. Ricarica la pagina per riprovare.");
    expect(html).toContain("Non è in nessuna raccolta.");
    expect(html).toMatch(/data-canvas-page="[^"]+"/);
  });

  it("shows Elimina to an Amministratore, and none to an Editor", async () => {
    requireSurface.mockResolvedValue(shellFor("admin"));
    expect(await render()).toMatch(/<button[^>]*>Elimina<\/button>/);
    requireSurface.mockResolvedValue(shellFor("account_sales_social"));
    const html = await render();
    expect(html).not.toMatch(/>Elimina</);
    expect(html).toContain("Non è in nessuna raccolta.");
  });

  it("draws the live revision's pages with the renderer", async () => {
    const html = await render();
    expect(html).toContain('data-template="mac-case@1"');
    expect(html).toMatch(/data-canvas-page="[^"]+"/);
    // One slide at a time, under the viewer's counter.
    expect(html.match(/data-canvas-page="/g)).toHaveLength(1);
    expect(html).toMatch(/1 di \d+ · /);
  });

  it("gives the renderer only ready renditions and a video its ready poster", async () => {
    getLiveRevision.mockResolvedValue(ok(null));
    let html = await render();
    expect(html).toContain(`https://cdn.test/${IMAGE}/image.display`);
    expect(html).not.toContain(`${PENDING}/`);

    listAssets.mockResolvedValue(ok([listed(VIDEO, "video")]));
    getRendition.mockImplementation(async (assetId, spec) => link(`https://cdn.test/${String(assetId)}/${String(spec)}`));
    getLiveRevision.mockResolvedValue(ok({ ...revision, doc: withVideo(revision.doc, VIDEO) }));
    html = await render();
    expect(html).toContain(`src="https://cdn.test/${VIDEO}/video.display"`);
    expect(html).toContain(`poster="https://cdn.test/${VIDEO}/video.poster"`);
  });

  it("shows the template's starter pages read-only with the Bozza di prova note when nothing is approved yet", async () => {
    get.mockResolvedValue(ok({ ...approved, approvedRevisionId: null }));
    getLiveRevision.mockResolvedValue(ok(null));
    const html = await render();
    expect(html).toContain("Bozza di prova");
    expect(html).toMatch(/1 di \d+ · Intro/);
    expect(html).toContain("Illuminazione");
    expect(html).toContain("Web design");
  });

  it("shows no Modifica to a role without `edit`", async () => {
    requireSurface.mockResolvedValue(shellFor("account_sales_social"));
    const html = await render();
    expect(html).toContain("Rebrand Lumen 2026");
    expect(html).toContain('aria-label="Scarica Rebrand Lumen 2026"');
    expect(html).not.toContain("Modifica");
    expect(html).not.toContain("/configurator");
  });

  it("sends a Bozza to the wizard", async () => {
    get.mockResolvedValue(ok({ ...approved, status: "draft" }));
    await expect(render()).rejects.toThrow(`REDIRECT /case-studies/new?caseId=${ID}`);
    expect(getLiveRevision).not.toHaveBeenCalled();
  });

  it("sends a Da approvare to the configurator with `edit`, else to Case studies", async () => {
    get.mockResolvedValue(ok({ ...approved, status: "in_review" }));
    await expect(render()).rejects.toThrow(`REDIRECT /case-studies/${ID}/configurator`);
    requireSurface.mockResolvedValue(shellFor("account_sales_social"));
    await expect(render()).rejects.toThrow(/^REDIRECT \/case-studies$/);
    expect(getLiveRevision).not.toHaveBeenCalled();
  });

  it("sends In elaborazione to Case studies", async () => {
    get.mockResolvedValue(ok({ ...approved, status: "generating" }));
    await expect(render()).rejects.toThrow(/^REDIRECT \/case-studies$/);
    expect(getLiveRevision).not.toHaveBeenCalled();
  });

  it("returns to Case studies for an unknown or deleted id", async () => {
    get.mockResolvedValue(err({ code: "NOT_FOUND", message: "No case study with this id." }));
    await expect(render("nope")).rejects.toThrow(/^REDIRECT \/case-studies$/);
  });

  it("renders nothing without a usable actor", async () => {
    requireSurface.mockResolvedValue(null);
    expect(await render()).toBe("");
    expect(get).not.toHaveBeenCalled();
  });

  it("throws into the error boundary on any other load failure", async () => {
    get.mockResolvedValue(err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "x" }));
    await expect(render()).rejects.toThrow("CASE_STUDY_LOOKUP_FAILED");
    get.mockResolvedValue(ok(approved));
    getLiveRevision.mockResolvedValue(err({ code: "REVISION_POINTER_INVALID", message: "x" }));
    await expect(render()).rejects.toThrow("REVISION_POINTER_INVALID");
    getLiveRevision.mockResolvedValue(ok(revision));
    getRendition.mockResolvedValue(err({ code: "STORAGE_FAILED", message: "x" }));
    await expect(render()).rejects.toThrow("STORAGE_FAILED");
  });
});
