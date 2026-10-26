import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { CaseStudy, ClientRef } from "@/modules/case-study";
import type { DetailsForm, ListedAsset } from "@/modules/material";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const get = vi.fn<(id: unknown) => Promise<Result<CaseStudy>>>();
const listAssets = vi.fn<(input: unknown) => Promise<Result<ListedAsset[]>>>();
const hasMaterial = vi.fn<(caseId: unknown) => Promise<Result<boolean>>>();
const getDetailsForm = vi.fn<(input: unknown) => Promise<Result<DetailsForm>>>();
const listClients = vi.fn<() => Promise<Result<ClientRef[]>>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", () => ({
  get: (id: unknown) => get(id),
  listClients: () => listClients(),
  YEAR_MIN: 1900,
  YEAR_MAX: 2100,
  BUSINESS_LINES: ["branding", "social_media", "video", "web_design", "advertising", "eventi", "sviluppo"],
  CLIENT_RESULT_LABEL_MAX: 80,
  CLIENT_RESULT_VALUE_MAX: 20,
  CLIENT_TESTIMONIAL_QUOTE_MAX: 600,
  CLIENT_TESTIMONIAL_AUTHOR_MAX: 120,
}));
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
  updateCaseStudyDetails: vi.fn(),
  presignAssetUpload: vi.fn(),
  confirmAssetUpload: vi.fn(),
  listAssets: vi.fn(),
  removeAsset: vi.fn(),
  setAssetFavourite: vi.fn(),
  saveDetailsField: vi.fn(),
  saveCaseResults: vi.fn(),
  saveCaseTestimonial: vi.fn(),
  deleteCaseStudy: vi.fn(),
}));

const { default: NewCaseStudyPage } = await import("./page");

const ID = "aaaaaaaa-0000-4000-8000-000000000001";

const shell: ShellActor = {
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role: "owner_designer" },
  landing: "/case-studies",
};

const draft: CaseStudy = {
  id: ID,
  code: "LUM-2026-01",
  number: 1,
  name: "Rebrand Lumen 2026",
  client: { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM" },
  year: 2026,
  locale: "it",
  businessLines: ["branding"],
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

const clients: ClientRef[] = [
  { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM" },
  { id: "cccccccc-0000-4000-8000-000000000002", name: "Città di Torino", code: "CIT" },
];

const asset: ListedAsset = {
  id: "bbbbbbbb-0000-4000-8000-000000000001",
  kind: "image",
  originalFileName: "lumen-keyvisual-final.png",
  contentType: "image/png",
  sizeBytes: 4.2 * 1024 * 1024,
  createdAt: "2026-10-14T10:00:00+00:00",
  isFavourite: true,
  thumbnailUrl: "https://bucket.s3/thumb?sig=1",
  thumbnailPending: false,
};

const render = async (params: { caseId?: string | string[]; step?: string | string[]; clientId?: string | string[] } = {}) =>
  renderToStaticMarkup(await NewCaseStudyPage({ searchParams: Promise.resolve(params) }));
/** The client search box (`ClientCombobox`'s input), or "". */
const combobox = (html: string) => html.match(/<input [^>]*role="combobox"[^>]*>/)?.[0] ?? "";

beforeEach(() => {
  requireSurface.mockReset();
  get.mockReset();
  listAssets.mockReset();
  hasMaterial.mockReset();
  getDetailsForm.mockReset();
  listClients.mockReset();
  requireSurface.mockResolvedValue(shell);
  listClients.mockResolvedValue(ok(clients));
  get.mockResolvedValue(ok(draft));
  listAssets.mockResolvedValue(ok([]));
  hasMaterial.mockResolvedValue(ok(false));
  getDetailsForm.mockResolvedValue(ok({ context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" }));
});

const legacy: CaseStudy = { ...draft, businessLines: [] };
const stepUrl = (step: number) => `REDIRECT /case-studies/new?caseId=${ID}&step=${step}`;
const linkTo = (step: number) => new RegExp(`<li data-step="${step}"[^>]*><a [^>]*href="/case-studies/new\\?caseId=${ID}&amp;step=${step}"`);
const plain = (step: number) => new RegExp(`<li data-step="${step}"[^>]*><span `);
/** A Servizi pill (a toggle button), or "". */
// A selected pill carries its check icon before the label.
const pill = (html: string, label: string) =>
  html.match(new RegExp(`<button [^>]*aria-pressed="(?:true|false)"[^>]*>(?:<svg.*?</svg>)?${label}</button>`))?.[0] ?? "";

describe("NewCaseStudyPage", () => {
  it("guards on create case and opens the new-case dialog: client only, over Materiale (material first)", async () => {
    const html = await render();
    expect(requireSurface).toHaveBeenCalledWith("create case");
    expect(get).not.toHaveBeenCalled();
    expect(html).toMatch(/<h1 class="[^"]*">Nuova case history<\/h1>/);
    expect(html).toMatch(/<li data-step="1" aria-current="step"[^>]*>.*Materiale/);
    expect(html).not.toMatch(/<a [^>]*href="\/case-studies\/new\?caseId/);
    expect(html).toMatch(/<dialog [^>]*>.*Cliente.*<\/dialog>/);
    expect(html).toMatch(/<button type="submit"[^>]*>Avanti<\/button>/);
    // No title, year, business line or texts: Dettagli asks for them later.
    expect(html).not.toContain("Titolo della case history");
    expect(html).not.toContain('name="year"');
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain("<textarea");
    expect(getDetailsForm).not.toHaveBeenCalled();
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("<nav");
  });

  it("a new case offers every client in a search box, as given (sorted by name), with a placeholder", async () => {
    const html = await render();
    expect(listClients).toHaveBeenCalledOnce();
    expect(combobox(html)).toMatch(/placeholder="Cerca o scegli un cliente"/);
    expect(combobox(html)).toMatch(/aria-expanded="false"/);
    const list = html.match(/<ul [^>]*role="listbox"[^>]*>.*?<\/ul>/)?.[0] ?? "";
    expect([...list.matchAll(/<li [^>]*role="option"[^>]*>([^<]*)<\/li>/g)].map((m) => m[1])).toEqual(["Lumen Srl (LUM)", "Città di Torino (CIT)"]);
    expect(html).not.toContain("<select");
  });

  it("a new case with no clients shows the note instead of the select", async () => {
    listClients.mockResolvedValue(ok([]));
    const html = await render();
    expect(html.replace(/<[^>]+>/g, "")).toContain("Non c’è ancora nessun cliente. Aggiungilo dalla pagina Clienti.");
    expect(html).not.toContain('role="combobox"');
    expect(html).toMatch(/<a [^>]*href="\/clients"[^>]*>pagina Clienti<\/a>/);
  });

  /** The client search box's text. */
  const selected = (html: string) => combobox(html).match(/ value="([^"]*)"/)?.[1];

  it("a client page's Nuova case history (?clientId=) opens the dialog with that client preselected", async () => {
    const html = await render({ clientId: clients[1].id });
    expect(selected(html)).toBe("Città di Torino (CIT)");
  });

  it.each([
    ["unknown", "cccccccc-0000-4000-8000-00000000ffff"],
    ["malformed", "LUM"],
    ["repeated", [clients[0].id, clients[1].id]],
  ])("a new case ignores a %s ?clientId= without an error", async (_label, clientId) => {
    const html = await render({ clientId });
    expect(selected(html)).toBe("");
    expect(html).toContain('role="combobox"');
  });

  it("throws into the error boundary when the clients can't be listed", async () => {
    listClients.mockResolvedValue(err({ code: "CLIENT_LOOKUP_FAILED", message: "down" }));
    await expect(render()).rejects.toThrow("CLIENT_LOOKUP_FAILED");
  });

  it("goes to the landing for a role that may not list clients", async () => {
    requireSurface.mockResolvedValue({ ...shell, actor: { ...shell.actor, role: "account_sales_social" }, landing: "/library" });
    await expect(render()).rejects.toThrow("REDIRECT /library");
    expect(listClients).not.toHaveBeenCalled();
  });

  it("does not list clients when reopening a case on Materiale", async () => {
    await render({ caseId: ID, step: "1" });
    expect(listClients).not.toHaveBeenCalled();
  });

  it("shows the larger-screen message below lg and hides the form there", async () => {
    const html = await render({ caseId: ID, step: "2" });
    expect(html).toMatch(/<p class="[^"]*\blg:hidden\b[^"]*">Questa pagina dà il meglio su uno schermo più grande\.<\/p>/);
    expect(html).toMatch(/<div class="hidden lg:block">.*<form/);
    // The title shows at every width.
    expect(html.match(/<h1 class="([^"]*)">/)?.[1]).not.toMatch(/\bhidden\b/);
  });

  it.each([1, 2, 3] as const)("offers Elimina bozza bottom left in the footer of an existing draft on step %i (owner, 2026-10-22)", async (step) => {
    hasMaterial.mockResolvedValue(ok(true));
    const html = await render({ caseId: ID, step: String(step) });
    expect(html).toMatch(/<div data-wizard-footer="" class="[^"]*"><div class="shrink-0"><button type="button"[^>]*>Elimina bozza<\/button>/);
    expect(html.match(/<header [^>]*>.*?<\/header>/)?.[0] ?? "").not.toContain("Elimina bozza");
  });

  it("offers no Elimina bozza before the case exists", async () => {
    expect(await render()).not.toContain("Elimina bozza");
  });

  it("renders nothing without a usable actor", async () => {
    requireSurface.mockResolvedValue(null);
    expect(await NewCaseStudyPage({ searchParams: Promise.resolve({ caseId: ID }) })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  describe("opening step (first incomplete): Materiale, then Dettagli, then Genera", () => {
    it.each([
      ["without material", ok(false)],
      ["when the material check fails", err({ code: "MATERIAL_LOOKUP_FAILED", message: "down" })],
    ] as const)("a draft %s opens Materiale, even without a business line", async (_label, result) => {
      hasMaterial.mockResolvedValue(result);
      await expect(render({ caseId: ID })).rejects.toThrow(stepUrl(1));
      get.mockResolvedValue(ok(legacy));
      await expect(render({ caseId: ID })).rejects.toThrow(stepUrl(1));
      expect(listAssets).not.toHaveBeenCalled();
    });

    it("a draft with a file and no business line (a new case) opens Dettagli", async () => {
      get.mockResolvedValue(ok(legacy));
      hasMaterial.mockResolvedValue(ok(true));
      await expect(render({ caseId: ID })).rejects.toThrow(stepUrl(2));
    });

    it("a draft with a business line and a file opens Genera", async () => {
      hasMaterial.mockResolvedValue(ok(true));
      await expect(render({ caseId: ID })).rejects.toThrow(stepUrl(3));
      expect(hasMaterial).toHaveBeenCalledExactlyOnceWith(ID);
    });

    it.each([["4"], [["2", "2"]]] as const)("treats any other step value (%j) like no step", async (step) => {
      hasMaterial.mockResolvedValue(ok(true));
      await expect(render({ caseId: ID, step: step as string | string[] })).rejects.toThrow(stepUrl(3));
      get.mockResolvedValue(ok(legacy));
      await expect(render({ caseId: ID, step: step as string | string[] })).rejects.toThrow(stepUrl(2));
    });
  });

  describe("step 2 Dettagli", () => {
    it("shows the case in the top bar and the saved details prefilled; the client is a search box over every client", async () => {
      getDetailsForm.mockResolvedValue(
        ok({
          context: "Lumen voleva un'identità unica.",
          solution: "",
          results: [{ label: "Candidature ricevute", value: "+180%" }],
          testimonialQuote: "Un lavoro chiaro.",
          testimonialAuthor: "Anna Rossi",
        }),
      );
      const html = await render({ caseId: ID, step: "2" });
      expect(get).toHaveBeenCalledExactlyOnceWith(ID);
      expect(getDetailsForm).toHaveBeenCalledExactlyOnceWith({ caseId: ID });
      expect(html).toMatch(/<h1 class="[^"]*">Rebrand Lumen 2026<\/h1>/);
      expect(html).toMatch(/<span class="[^"]*font-mono[^"]*"><span class="sr-only">ID <\/span>LUM-2026-01<\/span>/);
      expect(html).not.toContain(`>${ID}<`);
      expect(html).toContain(">Bozza</span>");
      expect(html).toMatch(/<li data-step="2" aria-current="step"/);
      expect(html).toMatch(/<input [^>]*name="name"[^>]*value="Rebrand Lumen 2026"/);
      expect(combobox(html)).toMatch(/value="Lumen Srl \(LUM\)"/);
      expect(combobox(html)).not.toContain("readonly");
      expect(listClients).toHaveBeenCalledOnce();
      expect(pill(html, "Branding")).toContain('aria-pressed="true"');
      expect(pill(html, "Video")).toContain('aria-pressed="false"');
      // Risultati and Testimonial come back as saved (Story 2.21); the old free-text Risultati is gone.
      expect(html).not.toMatch(/<textarea [^>]*name="results"/);
      expect(html).toMatch(/<input [^>]*name="results\.0\.label"[^>]*value="Candidature ricevute"/);
      expect(html).toMatch(/<input [^>]*name="results\.0\.value"[^>]*value="\+180%"/);
      expect(html).toMatch(/<textarea [^>]*name="testimonialQuote"[^>]*>Un lavoro chiaro\.<\/textarea>/);
      expect(html).toMatch(/<input [^>]*name="testimonialAuthor"[^>]*value="Anna Rossi"/);
      expect(html).toMatch(/<textarea [^>]*name="context"[^>]*>Lumen voleva un&#x27;identità unica\.<\/textarea>/);
      expect(html).not.toContain("PO-SECRET-42");
      expect(listAssets).not.toHaveBeenCalled();
    });

    it("links Materiale but not Genera without a file", async () => {
      const html = await render({ caseId: ID, step: "2" });
      expect(html).toMatch(linkTo(1));
      expect(html).toMatch(plain(3));
    });

    it("links Materiale and Genera with a file", async () => {
      hasMaterial.mockResolvedValue(ok(true));
      const html = await render({ caseId: ID, step: "2" });
      expect(html).toMatch(linkTo(1));
      expect(html).toMatch(linkTo(3));
    });

    it("a draft without a business line opens with no pill picked, an inactive Avanti with its reason, and Genera not a link", async () => {
      get.mockResolvedValue(ok(legacy));
      hasMaterial.mockResolvedValue(ok(true));
      const html = await render({ caseId: ID, step: "2" });
      expect(html).toMatch(/<input [^>]*name="name"[^>]*value="Rebrand Lumen 2026"/);
      expect(html).not.toContain('aria-pressed="true"');
      const reason = html.match(/<span id="([^"]+)">Per andare avanti manca: Servizi\.<\/span>/)?.[1];
      expect(reason).toBeDefined();
      expect(html).toMatch(new RegExp(`<button type="submit" aria-disabled="true" aria-describedby="${reason}"[^>]*>Avanti</button>`));
      expect(html).toMatch(linkTo(1));
      expect(html).toMatch(plain(3));
    });

    it("throws into the error boundary when the details cannot be loaded", async () => {
      getDetailsForm.mockResolvedValue(err({ code: "DETAILS_LOOKUP_FAILED", message: "down" }));
      await expect(render({ caseId: ID, step: "2" })).rejects.toThrow(/DETAILS_LOOKUP_FAILED/);
    });
  });

  describe("step 1 Materiale", () => {
    it("shows the empty Material step: drop zone, chips and hint, inactive Avanti with its reason, no list", async () => {
      const html = await render({ caseId: ID, step: "1" });
      expect(listAssets).toHaveBeenCalledExactlyOnceWith({ caseId: ID });
      expect(html).toMatch(/<li data-step="1" aria-current="step"/);
      expect(html).toContain("Porta qui il materiale del progetto");
      expect(html).toMatch(/role="button"[^>]*aria-label="Trascina qui i file o sfoglia"/);
      expect(html).toContain("Fino a 20 file, massimo 50 MB l’uno.");
      for (const chip of ["PDF", "DOCX", "TXT / MD", "PNG / JPG / WEBP", "MP4 / MOV"]) expect(html).toContain(`>${chip}</li>`);
      expect(html).toMatch(/<input type="file" multiple="" accept="image\/png,application\/pdf,\.png,\.pdf"/);
      const reason = html.match(/<span id="([^"]+)">Aggiungi almeno un file per andare avanti\.<\/span>/)?.[1];
      expect(reason).toBeDefined();
      expect(html).toMatch(new RegExp(`<button type="button" aria-disabled="true" aria-describedby="${reason}"[^>]*>Avanti</button>`));
      expect(html).not.toContain(">Materiale</h3>");
      expect(html).not.toContain("<img");
      // Dettagli is always a link; Genera needs a file.
      expect(html).toMatch(linkTo(2));
      expect(html).toMatch(plain(3));
    });

    it("lists the files from the server, with an active Avanti to step 2 Dettagli and Genera a link", async () => {
      listAssets.mockResolvedValue(
        ok([
          asset,
          { ...asset, id: "bbbbbbbb-0000-4000-8000-000000000002", kind: "document", contentType: "application/pdf", originalFileName: "brief.pdf", thumbnailUrl: null, isFavourite: false },
        ]),
      );
      hasMaterial.mockResolvedValue(ok(true));
      const html = await render({ caseId: ID, step: "1" });
      expect(html).toContain(">Materiale</h3>");
      expect(html).toContain("2 / 20 file");
      expect(html.indexOf("lumen-keyvisual-final.png")).toBeLessThan(html.indexOf("brief.pdf"));
      expect(html).toContain('<img src="https://bucket.s3/thumb?sig=1" alt=""');
      expect(html).toContain("4,2 MB");
      expect(html).toMatch(new RegExp(`<a [^>]*href="/case-studies/new\\?caseId=${ID}&amp;step=2"[^>]*>Avanti</a>`));
      expect(html).toMatch(linkTo(3));
    });

    it("throws into the error boundary when the files cannot be listed", async () => {
      listAssets.mockResolvedValue(err({ code: "ASSET_LOOKUP_FAILED", message: "down" }));
      await expect(render({ caseId: ID, step: "1" })).rejects.toThrow(/ASSET_LOOKUP_FAILED/);
    });

    it("opens without a business line too (a case fresh from the dialog)", async () => {
      get.mockResolvedValue(ok(legacy));
      const html = await render({ caseId: ID, step: "1" });
      expect(html).toMatch(/<li data-step="1" aria-current="step"/);
      expect(listAssets).toHaveBeenCalledOnce();
    });
  });

  describe("step 3 Genera", () => {
    it("opens the placeholder with a file: inactive Avanti tied to its reason", async () => {
      hasMaterial.mockResolvedValue(ok(true));
      const html = await render({ caseId: ID, step: "3" });
      expect(html).toMatch(/<li data-step="3" aria-current="step"/);
      expect(html).toContain('<p id="wizard-step-note" class="mt-1.5 font-body text-sm text-foreground-muted">La generazione arriva nella prossima versione. Ci stiamo lavorando.</p>');
      expect(html).toMatch(/<button type="button" aria-disabled="true" aria-describedby="wizard-step-note"[^>]*>Avanti<\/button>/);
      expect(getDetailsForm).not.toHaveBeenCalled();
      expect(listAssets).not.toHaveBeenCalled();
    });

    it.each([
      ["without material", ok(false)],
      ["when the material check fails", err({ code: "MATERIAL_LOOKUP_FAILED", message: "down" })],
    ] as const)("redirects %s to Materiale", async (_label, result) => {
      hasMaterial.mockResolvedValue(result);
      await expect(render({ caseId: ID, step: "3" })).rejects.toThrow(stepUrl(1));
    });

    it("redirects a draft without a business line to Dettagli even with a file", async () => {
      get.mockResolvedValue(ok(legacy));
      hasMaterial.mockResolvedValue(ok(true));
      await expect(render({ caseId: ID, step: "3" })).rejects.toThrow(stepUrl(2));
    });
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
