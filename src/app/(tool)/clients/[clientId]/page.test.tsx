import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { Actor, Role } from "@/modules/access";
import type { CaseStudy, ClientDetail, ListScope } from "@/modules/case-study";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const getClient = vi.fn<(id: unknown) => Promise<Result<ClientDetail>>>();
const list = vi.fn<(scope: ListScope) => Promise<Result<CaseStudy[]>>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", () => ({
  getClient: (id: unknown) => getClient(id),
  list: (scope: ListScope) => list(scope),
  CLIENT_INDUSTRIES: ["interior_design", "energia", "risorse_umane", "lusso"],
}));

const { default: ClientPage } = await import("./page");
const { default: Loading } = await import("./loading");

const shell = (role: Role, landing = "/case-studies"): ShellActor => ({
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role } satisfies Actor,
  landing,
});

const LUMEN: ClientDetail = {
  id: "cccccccc-0000-4000-8000-000000000001",
  name: "Lumen Srl",
  code: "LUM",
  industries: [],
  description: null,
  logoId: null,
  brief: { context: "Contesto segreto", solution: "Soluzione segreta", results: "Risultati segreti" },
  logoUrl: null,
};
const LOGO_URL = "https://project.supabase.co/storage/v1/object/sign/material/clients/x/logos/y.png?token=g";

const caseStudy = (over: Partial<CaseStudy> = {}): CaseStudy => ({
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  code: "LUM-2026-01",
  number: 1,
  name: "Rebrand",
  client: { id: LUMEN.id, name: LUMEN.name, code: LUMEN.code },
  year: 2026,
  locale: "it",
  status: "draft",
  projectOrderRef: null,
  headRevisionId: null,
  approvedRevisionId: null,
  headVersion: 0,
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-01T10:00:00+00:00",
  updatedAt: "2026-10-13T07:05:00+00:00",
  deletedAt: null,
  ...over,
});

const renderPage = async (clientId: string = LUMEN.id) =>
  renderToStaticMarkup(await ClientPage({ params: Promise.resolve({ clientId }) }));

beforeEach(() => {
  requireSurface.mockReset();
  getClient.mockReset();
  list.mockReset();
  requireSurface.mockResolvedValue(shell("owner_designer"));
  getClient.mockResolvedValue(ok(LUMEN));
  list.mockResolvedValue(ok([caseStudy()]));
});

const NEW_HREF = `/case-studies/new?clientId=${LUMEN.id}`;

describe("ClientPage", () => {
  it("shows the name, the code, Modifica cliente, Nuova case history and the client's cases only", async () => {
    const html = await renderPage();
    expect(requireSurface).toHaveBeenCalledWith("list clients");
    expect(getClient).toHaveBeenCalledWith(LUMEN.id);
    expect(list).toHaveBeenCalledExactlyOnceWith({ clientId: LUMEN.id });
    expect(html).toMatch(/<h1[^>]*>Lumen Srl<\/h1>/);
    expect(html).toMatch(/font-mono[^>]*>.*LUM<\/p>/);
    const edit = html.match(/<a [^>]*>(?:(?!<\/a>).)*Modifica cliente<\/a>/)?.[0] ?? "";
    expect(edit).toContain(`href="/clients/new?clientId=${LUMEN.id}&amp;step=1"`);
    expect(edit).toContain("hidden");
    expect(edit).toContain("lg:inline-flex");
    expect(html).toContain(`href="${NEW_HREF}"`);
    expect(html).toContain("LUM-2026-01");
    expect(html).toContain("Rebrand");
  });

  it("shows nothing for an existing client with no info: no logo, no placeholders", async () => {
    const html = await renderPage();
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Settore");
    expect(html).not.toContain("bg-logo-tile");
  });

  it("shows the logo on a white tile, the industries as pills and the description above the cases, never the brief", async () => {
    getClient.mockResolvedValue(
      ok({
        ...LUMEN,
        industries: ["energia", "lusso"],
        description: "Brand di moda\ndal 1990.",
        logoId: "eeeeeeee-0000-4000-8000-000000000001",
        logoUrl: LOGO_URL,
      }),
    );
    const html = await renderPage();
    expect(html).toMatch(/<div class="[^"]*bg-logo-tile[^"]*"><img src="[^"]+" alt="Logo Lumen Srl"/);
    expect(html).toContain(`src="${LOGO_URL.replace(/&/g, "&amp;")}"`);
    expect(html).toMatch(/<ul aria-label="Settore"[^>]*><li class="[^"]*rounded-full[^"]*">Energia<\/li><li [^>]*>Lusso<\/li><\/ul>/);
    expect(html).not.toContain("Interior design");
    expect(html).not.toMatch(/segret[oai]/);
    expect(html).toContain("Brand di moda\ndal 1990.");
    expect(html.indexOf("Brand di moda")).toBeLessThan(html.indexOf("client-cases-heading"));
  });

  it("renders without the logo when it could not be signed", async () => {
    getClient.mockResolvedValue(ok({ ...LUMEN, logoId: "eeeeeeee-0000-4000-8000-000000000001", logoUrl: null }));
    const html = await renderPage();
    expect(html).not.toContain("<img");
    expect(html).toMatch(/<h1[^>]*>Lumen Srl<\/h1>/);
  });

  it("shows the no-cases line with Nuova case history preselecting the client", async () => {
    list.mockResolvedValue(ok([]));
    const html = await renderPage();
    expect(html).toContain("Nessuna case history per questo cliente.");
    expect(html.split(`href="${NEW_HREF}"`)).toHaveLength(3);
  });

  it.each([
    ["unknown", "cccccccc-0000-4000-8000-00000000ffff"],
    ["malformed", "LUM"],
  ])("goes back to /clients for an %s id, listing nothing", async (_label, clientId) => {
    getClient.mockResolvedValue(err({ code: "CLIENT_NOT_FOUND", message: "m" }));
    await expect(renderPage(clientId)).rejects.toThrow("REDIRECT /clients");
    expect(getClient).toHaveBeenCalledWith(clientId);
    expect(list).not.toHaveBeenCalled();
  });

  it.each([
    ["account_sales_social", "/library"],
    ["admin", "/users"],
  ] as const)("redirects %s to its landing without reading the client", async (role, landing) => {
    requireSurface.mockResolvedValue(shell(role, landing));
    await expect(renderPage()).rejects.toThrow(`REDIRECT ${landing}`);
    expect(getClient).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("throws into the error boundary when the client lookup fails", async () => {
    getClient.mockResolvedValue(err({ code: "CLIENT_LOOKUP_FAILED", message: "down" }));
    await expect(renderPage()).rejects.toThrow(/CLIENT_LOOKUP_FAILED/);
  });

  it("throws into the error boundary when the cases can't be listed", async () => {
    list.mockResolvedValue(err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "down" }));
    await expect(renderPage()).rejects.toThrow(/CASE_STUDY_LOOKUP_FAILED/);
  });

  it("renders nothing without a usable actor", async () => {
    requireSurface.mockResolvedValue(null);
    expect(await ClientPage({ params: Promise.resolve({ clientId: LUMEN.id }) })).toBeNull();
    expect(getClient).not.toHaveBeenCalled();
  });
});

describe("Loading", () => {
  it("shows skeleton rows hidden from screen readers and announces loading", () => {
    const html = renderToStaticMarkup(<Loading />);
    expect(html.match(/data-skeleton-row/g)).toHaveLength(4);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<p role="status" class="sr-only">Caricamento…</p>');
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).not.toMatch(/(^|[\s"])animate-pulse/);
  });
});
