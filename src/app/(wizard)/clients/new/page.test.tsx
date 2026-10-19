import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { Actor, Role } from "@/modules/access";
import type { ClientBrief, ClientDetail } from "@/modules/case-study";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const getClient = vi.fn<(id: unknown) => Promise<Result<ClientDetail>>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", () => ({
  getClient: (id: unknown) => getClient(id),
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
}));
vi.mock("@/app/(tool)/clients/actions", () => ({
  createClient: vi.fn(),
  updateClient: vi.fn(),
  saveClientBriefField: vi.fn(),
  requestClientLogoUpload: vi.fn(),
  confirmClientLogoUpload: vi.fn(),
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

  it("shows step 2 as a placeholder with an inactive Crea introduzione and the note as its reason", async () => {
    const html = await renderPage({ clientId: ID, step: "2" });
    expect(segments(html)).toEqual([
      { step: 1, current: false, href: `/clients/new?clientId=${ID}&step=1`, text: "vai a Dettagli, completato" },
      { step: 2, current: true, href: null, text: "2Materiale" },
    ]);
    const button = html.match(/<button [^>]*>Crea introduzione<\/button>/)?.[0] ?? "";
    expect(button).toContain('aria-disabled="true"');
    expect(button).toContain('aria-describedby="client-wizard-step-note"');
    expect(html).toMatch(/<p id="client-wizard-step-note"[^>]*>Il caricamento del materiale del cliente arriva con il prossimo aggiornamento\.<\/p>/);
    expect(html).not.toContain("I dati del cliente");
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

  it("throws into the error boundary when the lookup fails", async () => {
    getClient.mockResolvedValue(err({ code: "CLIENT_LOOKUP_FAILED", message: "down" }));
    await expect(renderPage({ clientId: ID })).rejects.toThrow(/CLIENT_LOOKUP_FAILED/);
  });

  it("renders nothing without a usable actor", async () => {
    requireSurface.mockResolvedValue(null);
    expect(await NewClientPage({ searchParams: Promise.resolve({}) })).toBeNull();
  });
});
