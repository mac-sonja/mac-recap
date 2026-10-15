import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { Actor, Role } from "@/modules/access";
import type { ClientSummary } from "@/modules/case-study";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const listClientSummaries = vi.fn<() => Promise<Result<ClientSummary[]>>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", () => ({ listClientSummaries: () => listClientSummaries(), CLIENT_NAME_MAX: 120 }));
vi.mock("@/app/(tool)/clients/actions", () => ({ createClient: vi.fn(), renameClient: vi.fn() }));

const { default: ClientsPage } = await import("./page");
const { default: Loading } = await import("./loading");

const shell = (role: Role, landing = "/case-studies"): ShellActor => ({
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role } satisfies Actor,
  landing,
});

const LUMEN: ClientSummary = { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM", caseCount: 2 };
const ACME: ClientSummary = { id: "cccccccc-0000-4000-8000-000000000002", name: "Acme", code: "ACM", caseCount: 0 };

const renderPage = async () => renderToStaticMarkup(await ClientsPage());

beforeEach(() => {
  requireSurface.mockReset();
  listClientSummaries.mockReset();
});

describe("ClientsPage", () => {
  it("guards on list clients and shows Codice (mono), Nome and the case count; the uuid only in hrefs", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(ok([ACME, LUMEN]));
    const html = await renderPage();
    expect(requireSurface).toHaveBeenCalledWith("list clients");
    expect(html).toMatch(/<h1[^>]*>Clienti<\/h1>/);
    expect(html).toContain("Elenco dei clienti");
    expect(html).toMatch(/<td class="[^"]*font-mono[^"]*">LUM<\/td>/);
    expect(html).toContain(`href="/clients/${LUMEN.id}"`);
    expect(html).toMatch(/<td class="[^"]*tabular-nums[^"]*">2<\/td>/);
    expect(html).not.toMatch(new RegExp(`>${LUMEN.id}<`));
  });

  it("offers Aggiungi cliente, hidden below 1024 px", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(ok([LUMEN]));
    const button = (await renderPage()).match(/<button [^>]*>(?:(?!<\/button>).)*Aggiungi cliente<\/button>/)?.[0] ?? "";
    expect(button).toContain("hidden lg:inline-flex");
  });

  it("has no delete control", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(ok([LUMEN]));
    expect(await renderPage()).not.toMatch(/elimina|rimuovi|cancella cliente/i);
  });

  it("shows the empty state with Aggiungi cliente", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    listClientSummaries.mockResolvedValue(ok([]));
    const html = await renderPage();
    expect(html).toContain("Nessun cliente. Aggiungi il primo.");
    expect(html).toContain("Nessun cliente.</span>");
    expect(html).toContain("Aggiungi cliente");
    expect(html).not.toContain("<table");
  });

  it.each([
    ["account_sales_social", "/library"],
    ["admin", "/users"],
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
  it("shows skeleton rows hidden from screen readers and announces loading", () => {
    const html = renderToStaticMarkup(<Loading />);
    expect(html.match(/data-skeleton-row/g)).toHaveLength(6);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('<p role="status" class="sr-only">Caricamento…</p>');
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).not.toMatch(/(^|[\s"])animate-pulse/);
  });
});
