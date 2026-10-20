import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { Actor, Role } from "@/modules/access";
import type { CaseStudy, ClientBrief, ClientDetail, ListedClientAsset, ListScope } from "@/modules/case-study";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const getClient = vi.fn<(id: unknown) => Promise<Result<ClientDetail>>>();
const listClientMaterial = vi.fn<(input: unknown) => Promise<Result<ListedClientAsset[]>>>();
const listCases = vi.fn<(scope: ListScope) => Promise<Result<CaseStudy[]>>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", () => ({
  getClient: (id: unknown) => getClient(id),
  listClientMaterial: (input: unknown) => listClientMaterial(input),
  list: (scope: ListScope) => listCases(scope),
  // A stand-in for the module's rule (its own tests cover the rule itself).
  isClientComplete: (client: ClientDetail, brief: ClientBrief) =>
    client.industries.length > 0 && client.description !== null && client.logoId !== null && Object.values(brief).every((t) => t.trim() !== ""),
  CLIENT_INDUSTRIES: ["interior_design", "energia", "risorse_umane", "lusso"],
  CLIENT_NAME_MAX: 120,
  CLIENT_DESCRIPTION_MAX: 400,
  CLIENT_BRIEF_MAX: 5000,
  LOGO_CONTENT_TYPES: ["image/png", "image/jpeg", "image/webp"],
  LOGO_MAX_BYTES: 5 * 1024 * 1024,
  LOGO_MIN_SHORT_SIDE_PX: 400,
  CLIENT_MATERIAL_MAX_FILES: 3,
  CLIENT_MATERIAL_MAX_BYTES: 50 * 1024 * 1024,
  CLIENT_MATERIAL_CONTENT_TYPES: ["image/jpeg", "image/png", "application/pdf"],
  CLIENT_MATERIAL_MIN_IMAGES: 2,
  CLIENT_IMAGE_MIN_SHORT_SIDE_PX: 1600,
  CLIENT_IMAGE_MAX_SIDE_PX: 8000,
}));
vi.mock("@/app/(tool)/clients/actions", () => ({
  createClient: vi.fn(),
  updateClient: vi.fn(),
  saveClientBriefField: vi.fn(),
  requestClientLogoUpload: vi.fn(),
  confirmClientLogoUpload: vi.fn(),
  requestClientMaterialUpload: vi.fn(),
  confirmClientMaterialUpload: vi.fn(),
  listClientMaterial: vi.fn(),
  removeClientMaterial: vi.fn(),
  deleteClient: vi.fn(),
}));
vi.mock("@/app/(tool)/case-studies/actions", () => ({
  presignAssetUpload: vi.fn(),
  confirmAssetUpload: vi.fn(),
  listAssets: vi.fn(),
  removeAsset: vi.fn(),
  setAssetFavourite: vi.fn(),
}));

const { default: NewClientPage } = await import("./page");

const ID = "cccccccc-0000-4000-8000-000000000001";
const shell = (role: Role, landing = "/case-studies"): ShellActor => ({
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role } satisfies Actor,
  landing,
});
const BRIEF: ClientBrief = { context: "C", solution: "S", results: "R" };
const COMPLETE: ClientDetail = {
  id: ID,
  name: "Lumen Srl",
  code: "LUM",
  industries: ["lusso"],
  description: "Brand.",
  logoId: "eeeeeeee-0000-4000-8000-000000000001",
  logoUrl: null,
  brief: BRIEF,
};
const asset = (position: number, over: Partial<ListedClientAsset> = {}): ListedClientAsset => ({
  id: `ffffffff-0000-4000-8000-00000000000${position}`,
  clientId: ID,
  position,
  fileName: `foto-${position}.jpg`,
  kind: "image",
  contentType: "image/jpeg",
  sizeBytes: 2048,
  width: 2400,
  height: 1600,
  createdAt: "2026-10-19T10:00:00+00:00",
  thumbnailUrl: `https://storage.test/sign/${position}.jpg?token=t`,
  ...over,
});
const LEGACY: ClientDetail = { ...COMPLETE, industries: [], logoId: null, brief: { context: "", solution: "", results: "" } };

const renderPage = async (params: { clientId?: string | string[]; step?: string }) =>
  renderToStaticMarkup((await NewClientPage({ searchParams: Promise.resolve(params) }))!);

/** The top bar's back arrow. */
const backLink = (html: string) => {
  const tag = html.match(/<header[^>]*><a ([^>]*)>/)?.[1] ?? "";
  return { href: tag.match(/href="([^"]*)"/)?.[1], label: tag.match(/aria-label="([^"]*)"/)?.[1] };
};

/** The stepper segments' labels, links and current marker. */
const segments = (html: string) =>
  [...html.matchAll(/<li data-step="(\d)"( aria-current="step")?[^>]*>(.*?)<\/li>/g)].map((m) => ({
    step: Number(m[1]),
    current: m[2] !== undefined,
    href: m[3].match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&") ?? null,
    text: m[3].replace(/<[^>]+>/g, ""),
  }));

beforeEach(() => {
  requireSurface.mockReset();
  getClient.mockReset();
  listClientMaterial.mockReset();
  listClientMaterial.mockResolvedValue(ok([]));
  listCases.mockReset();
  listCases.mockResolvedValue(ok([{ id: "a" }, { id: "b" }] as unknown as CaseStudy[]));
  requireSurface.mockResolvedValue(shell("owner_designer"));
  getClient.mockResolvedValue(ok(COMPLETE));
});

describe("NewClientPage", () => {
  it("adds a client at step 1: eyebrow Nuovo cliente, back to /clients, stepper Dettagli and Materiale only", async () => {
    const html = await renderPage({});
    expect(requireSurface).toHaveBeenCalledWith("manage clients");
    expect(getClient).not.toHaveBeenCalled();
    expect(backLink(html)).toEqual({ href: "/clients", label: "Torna ai clienti" });
    expect(html).toContain('<p class="mb-2 font-label text-xs text-foreground-muted">Nuovo cliente</p>');
    expect(html).toMatch(/<h1 [^>]*>Nuovo cliente<\/h1>/);
    expect(html).not.toContain("data-status");
    expect(segments(html)).toEqual([
      { step: 1, current: true, href: null, text: "1Dettagli" },
      { step: 2, current: false, href: null, text: "2Materiale" },
    ]);
    expect(html).not.toContain("Introduzione");
    expect(html).toContain("I dati del cliente");
    expect(html).toContain('lg:hidden">Questa pagina richiede uno schermo più grande.</p>');
  });

  it("edits a client at step 1 with its name and code in the top bar, the code note, and back to its page", async () => {
    const html = await renderPage({ clientId: ID, step: "1" });
    expect(getClient).toHaveBeenCalledWith(ID);
    expect(backLink(html)).toEqual({ href: `/clients/${ID}`, label: "Torna al cliente" });
    expect(html).toContain('<span class="sr-only">Codice </span>LUM</span>');
    expect(html).toMatch(/<h1 [^>]*>Lumen Srl<\/h1>/);
    expect(html).toContain("Il codice LUM non cambia. Le modifiche si vedono in tutte le sue case history.");
    expect(html).toContain('value="Lumen Srl"');
    // A finished client may jump to Materiale from the stepper.
    expect(segments(html)[1]).toMatchObject({ href: `/clients/new?clientId=${ID}&step=2` });
  });

  it("shows step 2 Materiale with the copy above the drop zone and an inactive Crea introduzione with its reason", async () => {
    const html = await renderPage({ clientId: ID, step: "2" });
    expect(segments(html)).toEqual([
      { step: 1, current: false, href: `/clients/new?clientId=${ID}&step=1`, text: "vai a Dettagli, completato" },
      { step: 2, current: true, href: null, text: "2Materiale" },
    ]);
    expect(html).toContain("Carica fino a 3 file, almeno 2 immagini. Le immagini servono per le pagine di introduzione.");
    expect(html).toContain("Fino a 3 file, 50 MB ciascuno.");
    const button = html.match(/<button [^>]*>Crea introduzione<\/button>/)?.[0] ?? "";
    expect(button).toContain('aria-disabled="true"');
    const reasonId = button.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(html).toContain(`<span id="${reasonId}">Carica almeno 2 immagini.</span>`);
    expect(html).not.toContain("I dati del cliente");
    expect(html).not.toContain("Preferito");
  });

  it("lists the client's files in position order with thumbnails, and links Crea introduzione to the client page with 2 images", async () => {
    listClientMaterial.mockResolvedValue(
      ok([
        asset(1),
        asset(2, { thumbnailUrl: null }),
        asset(3, { fileName: "brief.pdf", kind: "document", contentType: "application/pdf", width: null, height: null, thumbnailUrl: null }),
      ]),
    );
    const html = await renderPage({ clientId: ID, step: "2" });
    expect(listClientMaterial).toHaveBeenCalledWith({ clientId: ID });
    const names = [...html.matchAll(/<div id="[^"]*" class="truncate[^"]*">([^<]*)<\/div>/g)].map((m) => m[1]);
    expect(names).toEqual(["foto-1.jpg", "foto-2.jpg", "brief.pdf"]);
    expect(html).toContain('src="https://storage.test/sign/1.jpg?token=t"');
    expect(html).toContain("3 / 3 file");
    expect(html).toMatch(new RegExp(`<a [^>]*href="/clients/${ID}"[^>]*>Crea introduzione</a>`));
    expect(html).not.toContain("Carica almeno 2 immagini.");
  });

  it("keeps Crea introduzione inactive with one image and a PDF", async () => {
    listClientMaterial.mockResolvedValue(
      ok([asset(1), asset(2, { fileName: "brief.pdf", kind: "document", contentType: "application/pdf", width: null, height: null, thumbnailUrl: null })]),
    );
    const html = await renderPage({ clientId: ID, step: "2" });
    expect(html).toMatch(/<button [^>]*aria-disabled="true"[^>]*>Crea introduzione<\/button>/);
    expect(html).toContain("Carica almeno 2 immagini.");
  });

  it("sends an unfinished client asking for step 2 back to step 1, and links no Materiale", async () => {
    getClient.mockResolvedValue(ok(LEGACY));
    await expect(renderPage({ clientId: ID, step: "2" })).rejects.toThrow(`REDIRECT /clients/new?clientId=${ID}&step=1`);
    const html = await renderPage({ clientId: ID });
    expect(segments(html)[1].href).toBeNull();
  });

  it.each([
    ["unknown", "cccccccc-0000-4000-8000-00000000ffff"],
    ["repeated", [ID, ID]],
  ])("goes back to /clients for an %s id", async (_label, clientId) => {
    getClient.mockResolvedValue(err({ code: "CLIENT_NOT_FOUND", message: "m" }));
    await expect(renderPage({ clientId })).rejects.toThrow("REDIRECT /clients");
    if (Array.isArray(clientId)) expect(getClient).toHaveBeenCalledWith(null);
  });

  it("reads the files only on step 2, and throws into the error boundary when that read fails", async () => {
    await renderPage({ clientId: ID, step: "1" });
    expect(listClientMaterial).not.toHaveBeenCalled();
    listClientMaterial.mockResolvedValue(err({ code: "CLIENT_LOOKUP_FAILED", message: "down" }));
    await expect(renderPage({ clientId: ID, step: "2" })).rejects.toThrow(/CLIENT_LOOKUP_FAILED/);
  });

  it("throws into the error boundary when the lookup fails", async () => {
    getClient.mockResolvedValue(err({ code: "CLIENT_LOOKUP_FAILED", message: "down" }));
    await expect(renderPage({ clientId: ID })).rejects.toThrow(/CLIENT_LOOKUP_FAILED/);
  });

  it("shows Elimina cliente in danger style below step 1 of an existing client only, inside the wide-screen area", async () => {
    const html = await renderPage({ clientId: ID, step: "1" });
    expect(listCases).toHaveBeenCalledExactlyOnceWith({ clientId: ID });
    expect(html).toMatch(/<button [^>]*class="[^"]*bg-danger[^"]*"[^>]*>Elimina cliente<\/button>/);
    expect(html).toContain("Verranno eliminate anche le sue 2 case history");
    // Below the form, within the frame's `hidden lg:block` area.
    expect(html.indexOf("Elimina cliente")).toBeGreaterThan(html.indexOf("I dati del cliente"));
    expect(html.indexOf("Elimina cliente")).toBeGreaterThan(html.indexOf('class="hidden lg:block"'));
  });

  it("has no Elimina cliente when adding a client or on step 2", async () => {
    expect(await renderPage({})).not.toContain("Elimina cliente");
    expect(await renderPage({ clientId: ID, step: "2" })).not.toContain("Elimina cliente");
    expect(listCases).not.toHaveBeenCalled();
  });

  it("throws into the error boundary when the case count fails", async () => {
    listCases.mockResolvedValue(err({ code: "CASE_LOOKUP_FAILED", message: "down" }));
    await expect(renderPage({ clientId: ID })).rejects.toThrow(/CASE_LOOKUP_FAILED/);
  });

  it("renders nothing without a usable actor", async () => {
    requireSurface.mockResolvedValue(null);
    expect(await NewClientPage({ searchParams: Promise.resolve({}) })).toBeNull();
  });
});
