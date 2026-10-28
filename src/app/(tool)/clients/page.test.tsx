import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { Actor, Role } from "@/modules/access";
import type { ClientSector, ClientSummary } from "@/modules/case-study";
import { fill, it as dict } from "@/shared/i18n/it";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const listClientSummaries = vi.fn<() => Promise<Result<ClientSummary[]>>>();
const list = vi.fn<() => Promise<Result<{ status: string; client: { id: string } }[]>>>();
const listClientSectors = vi.fn<() => Promise<Result<ClientSector[]>>>();
const SECTORS: ClientSector[] = [
  { key: "lusso", label: "Lusso" },
  { key: "nautica", label: "Nautica" },
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", () => ({
  listClientSummaries: () => listClientSummaries(),
  list: () => list(),
  listClientSectors: () => listClientSectors(),
}));

vi.mock("./_lib/client-limits", () => ({ clientLimits: () => ({}), clientMaterialLimits: () => ({}) }));
// The panel is a browser component (tested on its own): here only whether the page renders it.
vi.mock("./_components/client-panel", () => ({
  ClientPanel: ({ client, sectors }: { client: unknown; sectors: ClientSector[] }) => (
    <div data-panel={client === null ? "new" : "edit"} data-sectors={sectors.map((sector) => sector.label).join(",")} />
  ),
}));

const { default: ClientsPage } = await import("./page");
const { default: Loading } = await import("./loading");

const shell = (role: Role, landing = "/case-studies"): ShellActor => ({
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role } satisfies Actor,
  landing,
});

const LUMEN: ClientSummary = { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM", caseCount: 2, complete: true, logoUrl: null };
const ACME: ClientSummary = { id: "cccccccc-0000-4000-8000-000000000002", name: "Acme", code: "ACM", caseCount: 0, complete: false, logoUrl: null };

const renderPage = async () => renderToStaticMarkup(await ClientsPage());

beforeEach(() => {
  requireSurface.mockReset();
  listClientSummaries.mockReset();
  list.mockReset();
  list.mockResolvedValue(ok([]));
  listClientSectors.mockReset();
  listClientSectors.mockResolvedValue(ok(SECTORS));
});

describe("ClientsPage", () => {
  it("guards on list clients and shows a card per client with name, code (mono) and the case count; the uuid only in hrefs", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(ok([ACME, LUMEN]));
    const html = await renderPage();
    expect(requireSurface).toHaveBeenCalledWith("list clients");
    expect(html).toMatch(new RegExp(`<h1[^>]*>${dict.clients.heading}</h1>`));
    expect(html).toContain(dict.clients.lead);
    expect(html).toContain(`<ul aria-label="${dict.clients.table.caption}"`);
    expect(html.match(/<li data-client-id=/g)).toHaveLength(2);
    expect(html).toMatch(/<span class="[^"]*font-mono[^"]*"><span class="sr-only">Codice <\/span>LUM<\/span>/);
    expect(html).toContain(`href="/clients/${LUMEN.id}"`);
    expect(html).toMatch(new RegExp(`<span class="[^"]*tabular-nums[^"]*">${fill(dict.clients.caseCount, { n: 2 })}</span>`));
    expect(html).not.toMatch(new RegExp(`>${LUMEN.id}<`));
  });

  it("offers Scarica (the client pack) only on cards with an approved case", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(ok([ACME, LUMEN]));
    list.mockResolvedValue(
      ok([
        { status: "approved", client: { id: LUMEN.id } },
        { status: "draft", client: { id: LUMEN.id } },
        { status: "draft", client: { id: ACME.id } },
      ]),
    );
    const html = await renderPage();
    expect(html.match(/aria-label="Scarica il pack di [^"]+"/g)).toEqual([`aria-label="${fill(dict.download.packLabel, { name: LUMEN.name })}"`]);
  });

  it("carries each client's signed logo URL to its card; a client without one keeps the monogram", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    const url = "https://storage.example/clients/lumen/logo.svg?token=a&amp=b";
    listClientSummaries.mockResolvedValue(ok([ACME, { ...LUMEN, logoUrl: url }]));
    const html = await renderPage();
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain(`<img src="https://storage.example/clients/lumen/logo.svg?token=a&amp;amp=b" alt=""`);
    expect(html).toMatch(/aria-hidden="true"[^>]*>A<\/span>/);
  });

  it("offers Aggiungi cliente as a link to the add panel, hidden below 1024 px", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(ok([LUMEN]));
    const link = (await renderPage()).match(/<a [^>]*>(?:(?!<\/a>).)*Aggiungi cliente<\/a>/)?.[0] ?? "";
    expect(link).toContain('href="/clients?nuovo=1"');
    expect(link).toContain("hidden lg:inline-flex");
  });

  it("opens the add panel over the list with ?nuovo=1, with manage clients", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(ok([LUMEN]));
    expect(await renderPage()).not.toContain("data-panel");
    expect(listClientSectors).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(await ClientsPage({ searchParams: Promise.resolve({ nuovo: "1" }) }));
    // The shared sector list, read when the panel opens (an added sector included).
    expect(html).toContain('<div data-panel="new" data-sectors="Lusso,Nautica"></div>');
    expect(html).toContain(LUMEN.name);
  });

  it("throws into the error boundary when the sectors for the add panel can't be read", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(ok([LUMEN]));
    listClientSectors.mockResolvedValue(err({ code: "CLIENT_LOOKUP_FAILED", message: "down" }));
    await expect(ClientsPage({ searchParams: Promise.resolve({ nuovo: "1" }) })).rejects.toThrow(/CLIENT_LOOKUP_FAILED/);
  });

  it("links every client's name to its page, finished or not", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(ok([ACME, LUMEN]));
    const html = await renderPage();
    expect(html).not.toContain("?modifica=1");
    expect(html).toContain(`href="/clients/${ACME.id}"`);
    expect(html).toContain(`href="/clients/${LUMEN.id}"`);
  });

  it("has no delete control on the list page (delete lives in the edit panel)", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(ok([LUMEN]));
    expect(await renderPage()).not.toMatch(/elimina|rimuovi|cancella cliente/i);
  });

  it("shows the empty state with Aggiungi cliente", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(ok([]));
    const html = await renderPage();
    expect(html).toContain(dict.clients.empty);
    expect(html).toContain(`${dict.clients.emptyReadOnly}</span>`);
    expect(html).toContain(dict.clients.add);
    expect(html).not.toContain(`aria-label="${dict.clients.table.caption}"`);
  });

  it.each([
    ["account_sales_social", "/library"],
  ] as const)("redirects %s to its landing and lists nothing", async (role, landing) => {
    requireSurface.mockResolvedValue(shell(role, landing));
    await expect(ClientsPage()).rejects.toThrow(`REDIRECT ${landing}`);
    expect(listClientSummaries).not.toHaveBeenCalled();
  });

  it("renders nothing and lists nothing without a usable actor", async () => {
    requireSurface.mockResolvedValue(null);
    expect(await ClientsPage()).toBeNull();
    expect(listClientSummaries).not.toHaveBeenCalled();
  });

  it("fails into the error boundary when the list fails", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(err({ code: "CLIENT_LOOKUP_FAILED", message: "down" }));
    await expect(ClientsPage()).rejects.toThrow(/CLIENT_LOOKUP_FAILED/);
  });
});

describe("Loading", () => {
  it("shows skeleton cards hidden from screen readers and announces loading", () => {
    const html = renderToStaticMarkup(<Loading />);
    expect(html.match(/data-skeleton-row/g)).toHaveLength(8);
    expect(html).toContain('<div aria-hidden="true" class="flex flex-col gap-5">');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(`<p role="status" class="sr-only">${dict.clients.loading}</p>`);
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).not.toMatch(/(^|[\s"])animate-pulse/);
  });
});
