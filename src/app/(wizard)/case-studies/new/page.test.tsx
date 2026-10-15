import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { CaseStudy } from "@/modules/case-study";
import type { DetailsForm, ListedAsset } from "@/modules/material";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const get = vi.fn<(id: unknown) => Promise<Result<CaseStudy>>>();
const listAssets = vi.fn<(input: unknown) => Promise<Result<ListedAsset[]>>>();
const hasMaterial = vi.fn<(caseId: unknown) => Promise<Result<boolean>>>();
const getDetailsForm = vi.fn<(input: unknown) => Promise<Result<DetailsForm>>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", () => ({ get: (id: unknown) => get(id), YEAR_MIN: 1900, YEAR_MAX: 2100 }));
vi.mock("@/shared/i18n/format", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/i18n/format")>()),
  currentYear: () => 2031,
}));
vi.mock("@/modules/material", () => ({
  listAssets: (input: unknown) => listAssets(input),
  hasMaterial: (caseId: unknown) => hasMaterial(caseId),
  getDetailsForm: (input: unknown) => getDetailsForm(input),
  MAX_ASSETS_PER_CASE: 20,
  MAX_FORM_FIELD_CHARS: 5000,
  MAX_FILE_BYTES: 50 * 1024 * 1024,
  ALLOWED_CONTENT_TYPES: ["image/png", "application/pdf"],
}));
vi.mock("@/app/(tool)/case-studies/actions", () => ({
  createCaseStudy: vi.fn(),
  presignAssetUpload: vi.fn(),
  confirmAssetUpload: vi.fn(),
  listAssets: vi.fn(),
  removeAsset: vi.fn(),
  setAssetFavourite: vi.fn(),
  saveDetailsField: vi.fn(),
}));

const { default: NewCaseStudyPage } = await import("./page");

const ID = "aaaaaaaa-0000-4000-8000-000000000001";

const shell: ShellActor = {
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role: "owner_designer" },
  landing: "/case-studies",
};

const draft: CaseStudy = {
  id: ID,
  name: "Rebrand Lumen 2026",
  client: "Lumen",
  year: 2026,
  locale: "it",
  status: "draft",
  projectOrderRef: "PO-SECRET-42",
  headRevisionId: null,
  approvedRevisionId: null,
  headVersion: 0,
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-14T10:00:00+00:00",
  updatedAt: "2026-10-14T10:00:00+00:00",
  deletedAt: null,
};

const asset: ListedAsset = {
  id: "bbbbbbbb-0000-4000-8000-000000000001",
  kind: "image",
  originalFileName: "lumen-keyvisual-final.png",
  contentType: "image/png",
  sizeBytes: 4.2 * 1024 * 1024,
  createdAt: "2026-10-14T10:00:00+00:00",
  isFavourite: true,
  thumbnailUrl: "https://bucket.s3/thumb?sig=1",
};

const render = async (params: { caseId?: string | string[]; step?: string | string[] } = {}) =>
  renderToStaticMarkup(await NewCaseStudyPage({ searchParams: Promise.resolve(params) }));

beforeEach(() => {
  requireSurface.mockReset();
  get.mockReset();
  listAssets.mockReset();
  hasMaterial.mockReset();
  getDetailsForm.mockReset();
  requireSurface.mockResolvedValue(shell);
  listAssets.mockResolvedValue(ok([]));
  hasMaterial.mockResolvedValue(ok(false));
  getDetailsForm.mockResolvedValue(ok({ context: "", solution: "", results: "" }));
});

describe("NewCaseStudyPage", () => {
  it("guards on create case and shows step 0: eyebrow and title Nuovo case study, no step active", async () => {
    const html = await render();
    expect(requireSurface).toHaveBeenCalledWith("create case");
    expect(get).not.toHaveBeenCalled();
    expect(html).toMatch(/<h1 class="[^"]*">Nuovo case study<\/h1>/);
    expect(html).not.toContain('aria-current="step"');
    expect(html).toContain("Nome del case study");
    const year = html.match(/<input [^>]*name="year"[^>]*>/)?.[0] ?? "";
    expect(year).toContain('min="1900"');
    expect(year).toContain('max="2100"');
    expect(year).toContain('value="2031"');
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("<nav");
  });

  it("shows the larger-screen message below lg and hides the form there", async () => {
    const html = await render();
    expect(html).toMatch(/<p class="[^"]*\blg:hidden\b[^"]*">Questa pagina richiede uno schermo più grande\.<\/p>/);
    expect(html).toMatch(/<div class="hidden lg:block">.*<form/);
    // The title shows at every width.
    expect(html.match(/<h1 class="([^"]*)">/)?.[1]).not.toMatch(/\bhidden\b/);
  });

  it("renders nothing without a usable actor", async () => {
    requireSurface.mockResolvedValue(null);
    expect(await NewCaseStudyPage({ searchParams: Promise.resolve({ caseId: ID }) })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("reopens a case: top bar and title show it, ID in mono, Bozza badge, step 1 active", async () => {
    get.mockResolvedValue(ok(draft));
    const html = await render({ caseId: ID });
    expect(get).toHaveBeenCalledExactlyOnceWith(ID);
    expect(html).toMatch(/<h1 class="[^"]*">Rebrand Lumen 2026<\/h1>/);
    expect(html).toMatch(new RegExp(`<span class="[^"]*font-mono[^"]*"><span class="sr-only">ID </span>${ID}</span>`));
    expect(html).toContain('data-status="draft"');
    expect(html).toContain(">Bozza</span>");
    expect(html).toMatch(/<li data-step="1" aria-current="step"/);
    expect(html).toContain("Aggiungi il materiale del progetto");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("PO-SECRET-42");
  });

  it("shows the empty Material step: drop zone, chips and hint, inactive Avanti with its reason, no list", async () => {
    get.mockResolvedValue(ok(draft));
    const html = await render({ caseId: ID });
    expect(listAssets).toHaveBeenCalledExactlyOnceWith({ caseId: ID });
    expect(html).toContain("Carica il materiale già verificato. La generazione parte solo da qui.");
    expect(html).toMatch(/role="button"[^>]*aria-label="Trascina qui i file o sfoglia"/);
    expect(html).toContain("Fino a 20 file, 50 MB ciascuno.");
    for (const chip of ["PDF", "DOCX", "TXT / MD", "PNG / JPG / WEBP", "MP4 / MOV"]) expect(html).toContain(`>${chip}</li>`);
    expect(html).toMatch(/<input type="file" multiple="" accept="image\/png,application\/pdf,\.png,\.pdf"/);
    const reason = html.match(/<span id="([^"]+)">Aggiungi almeno un file per continuare\.<\/span>/)?.[1];
    expect(reason).toBeDefined();
    expect(html).toMatch(new RegExp(`<button type="button" aria-disabled="true" aria-describedby="${reason}"[^>]*>Avanti</button>`));
    expect(html).not.toContain(">Materiale</h3>");
    expect(html).not.toContain("<img");
  });

  it("opens step 1 explicitly with the files listed from the server and an active Avanti to step 2", async () => {
    get.mockResolvedValue(ok(draft));
    listAssets.mockResolvedValue(ok([asset, { ...asset, id: "bbbbbbbb-0000-4000-8000-000000000002", kind: "document", contentType: "application/pdf", originalFileName: "brief.pdf", thumbnailUrl: null, isFavourite: false }]));
    hasMaterial.mockResolvedValue(ok(true));
    const html = await render({ caseId: ID, step: "1" });
    expect(html).toContain(">Materiale</h3>");
    expect(html).toContain("2 / 20 file");
    expect(html.indexOf("lumen-keyvisual-final.png")).toBeLessThan(html.indexOf("brief.pdf"));
    expect(html).toContain('<img src="https://bucket.s3/thumb?sig=1" alt=""');
    expect(html).toContain("4,2 MB");
    expect(html).toMatch(new RegExp(`<a [^>]*href="/case-studies/new\\?caseId=${ID}&amp;step=2"[^>]*>Avanti</a>`));
    expect(html).toContain("I preferiti sono facoltativi.");
  });

  it("throws into the error boundary when the files cannot be listed", async () => {
    get.mockResolvedValue(ok(draft));
    listAssets.mockResolvedValue(err({ code: "ASSET_LOOKUP_FAILED", message: "down" }));
    await expect(render({ caseId: ID })).rejects.toThrow(/ASSET_LOOKUP_FAILED/);
  });

  it("reopens a case with material at Dettagli (first incomplete step)", async () => {
    get.mockResolvedValue(ok(draft));
    hasMaterial.mockResolvedValue(ok(true));
    await expect(render({ caseId: ID })).rejects.toThrow(`REDIRECT /case-studies/new?caseId=${ID}&step=2`);
    expect(hasMaterial).toHaveBeenCalledExactlyOnceWith(ID);
    expect(listAssets).not.toHaveBeenCalled();
  });

  it.each([
    ["without material", ok(false)],
    ["when the material check fails", err({ code: "MATERIAL_LOOKUP_FAILED", message: "down" })],
  ] as const)("reopens a case %s at step 1, Dettagli and Genera not links", async (_label, result) => {
    get.mockResolvedValue(ok(draft));
    hasMaterial.mockResolvedValue(result);
    const html = await render({ caseId: ID });
    expect(html).toMatch(/<li data-step="1" aria-current="step"/);
    expect(html).toContain("Aggiungi il materiale del progetto");
    expect(html).not.toContain("step=2");
    expect(html).not.toContain("step=3");
  });

  it("opens step 1 with step=1 even when the case has material; Dettagli and Genera are links", async () => {
    get.mockResolvedValue(ok(draft));
    hasMaterial.mockResolvedValue(ok(true));
    const html = await render({ caseId: ID, step: "1" });
    expect(html).toMatch(/<li data-step="1" aria-current="step"/);
    expect(html).toMatch(new RegExp(`<li data-step="2"[^>]*><a [^>]*href="/case-studies/new\\?caseId=${ID}&amp;step=2"`));
    expect(html).toMatch(new RegExp(`<li data-step="3"[^>]*><a [^>]*href="/case-studies/new\\?caseId=${ID}&amp;step=3"`));
  });

  it("opens the Details step with step=2: saved answers, counter, active Avanti, Materiale a link", async () => {
    get.mockResolvedValue(ok(draft));
    hasMaterial.mockResolvedValue(ok(true));
    getDetailsForm.mockResolvedValue(ok({ context: "Lumen voleva un'identità unica.", solution: "", results: "" }));
    const html = await render({ caseId: ID, step: "2" });
    expect(getDetailsForm).toHaveBeenCalledExactlyOnceWith({ caseId: ID });
    expect(html).toMatch(/<li data-step="2" aria-current="step"/);
    expect(html).toContain("Racconta il progetto");
    expect(html).toMatch(/<textarea [^>]*name="context"[^>]*>Lumen voleva un&#x27;identità unica\.<\/textarea>/);
    expect(html).toContain("1 di 3 compilati");
    expect(html).toMatch(/<button type="button"[^>]*>Avanti<\/button>/);
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).toMatch(new RegExp(`<li data-step="1"[^>]*><a [^>]*href="/case-studies/new\\?caseId=${ID}&amp;step=1"`));
    expect(html).not.toMatch(/<li data-step="2"[^>]*><a /);
    expect(listAssets).not.toHaveBeenCalled();
  });

  it("throws into the error boundary when the details cannot be loaded", async () => {
    get.mockResolvedValue(ok(draft));
    hasMaterial.mockResolvedValue(ok(true));
    getDetailsForm.mockResolvedValue(err({ code: "DETAILS_LOOKUP_FAILED", message: "down" }));
    await expect(render({ caseId: ID, step: "2" })).rejects.toThrow(/DETAILS_LOOKUP_FAILED/);
  });

  it("opens the Genera placeholder with step=3: inactive Avanti tied to its reason", async () => {
    get.mockResolvedValue(ok(draft));
    hasMaterial.mockResolvedValue(ok(true));
    const html = await render({ caseId: ID, step: "3" });
    expect(html).toMatch(/<li data-step="3" aria-current="step"/);
    expect(html).toContain('<p id="wizard-step-note" class="mt-1.5 font-body text-sm text-foreground-muted">La generazione non è ancora disponibile in questa versione.</p>');
    expect(html).toMatch(/<button type="button" aria-disabled="true" aria-describedby="wizard-step-note"[^>]*>Avanti<\/button>/);
    expect(getDetailsForm).not.toHaveBeenCalled();
    expect(listAssets).not.toHaveBeenCalled();
  });

  it.each([
    ["2", "without material", ok(false)],
    ["3", "without material", ok(false)],
    ["2", "when the material check fails", err({ code: "MATERIAL_LOOKUP_FAILED", message: "down" })],
    ["3", "when the material check fails", err({ code: "MATERIAL_LOOKUP_FAILED", message: "down" })],
  ] as const)("redirects step=%s %s to the step 1 URL", async (step, _label, result) => {
    get.mockResolvedValue(ok(draft));
    hasMaterial.mockResolvedValue(result);
    await expect(render({ caseId: ID, step })).rejects.toThrow(`REDIRECT /case-studies/new?caseId=${ID}&step=1`);
    expect(listAssets).not.toHaveBeenCalled();
    expect(getDetailsForm).not.toHaveBeenCalled();
  });

  it.each([["4"], [["2", "2"]]] as const)("treats any other step value (%j) like no step", async (step) => {
    get.mockResolvedValue(ok(draft));
    hasMaterial.mockResolvedValue(ok(true));
    await expect(render({ caseId: ID, step: step as string | string[] })).rejects.toThrow(`REDIRECT /case-studies/new?caseId=${ID}&step=2`);
    hasMaterial.mockResolvedValue(ok(false));
    const html = await render({ caseId: ID, step: step as string | string[] });
    expect(html).toMatch(/<li data-step="1" aria-current="step"/);
  });

  it.each(["generating", "in_review", "approved"] as const)("redirects a %s case to Case studies", async (status) => {
    get.mockResolvedValue(ok({ ...draft, status }));
    await expect(render({ caseId: ID })).rejects.toThrow("REDIRECT /case-studies");
  });

  it.each([
    ["unknown or deleted", ID],
    ["malformed", "not-a-uuid"],
  ])("redirects to Case studies for an %s id", async (_label, caseId) => {
    get.mockResolvedValue(err({ code: "NOT_FOUND", message: "No case study with this id." }));
    await expect(render({ caseId })).rejects.toThrow("REDIRECT /case-studies");
  });

  it("treats a repeated caseId as malformed", async () => {
    get.mockResolvedValue(err({ code: "NOT_FOUND", message: "m" }));
    await expect(render({ caseId: [ID, ID] })).rejects.toThrow("REDIRECT /case-studies");
    expect(get).toHaveBeenCalledWith(null);
  });

  it("throws into the error boundary on any other lookup failure", async () => {
    get.mockResolvedValue(err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "down" }));
    await expect(render({ caseId: ID })).rejects.toThrow(/CASE_STUDY_LOOKUP_FAILED/);
  });
});
