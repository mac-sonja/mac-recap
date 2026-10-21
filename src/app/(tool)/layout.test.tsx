import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor, Role } from "@/modules/access";
import { err, ok, type Result } from "@/shared/result";

const getActor = vi.fn<() => Promise<Result<Actor>>>();

const list = vi.fn();
const listClientSummaries = vi.fn();

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/modules/case-study", () => ({ list: () => list(), listClientSummaries: () => listClientSummaries() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/case-studies",
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/modules/access", async () => {
  const actual = await vi.importActual<typeof import("@/modules/access")>("@/modules/access");
  return { ...actual, getActor: () => getActor() };
});

const { default: ToolLayout } = await import("./layout");
const { default: Root } = await import("@/app/page");
const { default: CaseStudiesPage } = await import("./case-studies/page");

const NO_ACTOR = "Non riusciamo a riconoscere il tuo profilo.";

const actor = (role: Role): Actor => ({
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev@example.it",
  displayName: "Dev",
  role,
});

const renderLayout = async () => renderToStaticMarkup(await ToolLayout({ children: <p>content</p> }));

beforeEach(() => {
  getActor.mockReset();
  list.mockReset().mockResolvedValue(ok([{ status: "in_review" }, { status: "in_review" }, { status: "draft" }]));
  listClientSummaries.mockReset().mockResolvedValue(ok([{}, {}, {}]));
});

describe("ToolLayout", () => {
  it("shows the nav items and the role label for owner/designer", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    const html = await renderLayout();
    expect(html).toContain("<nav");
    expect(html).toContain("Nuova case");
    expect(html).toContain('href="/home"');
    expect(html).toContain('href="/case-studies"');
    expect(html).toContain('href="/clients"');
    expect(html).toContain("Owner/designer");
    expect(html).toContain("content");
  });

  it.each([
    ["account_sales_social", "Account/sales/social"],
    ["admin", "Amministratore"],
  ] as const)("shows neither nav item for %s", async (role, label) => {
    getActor.mockResolvedValue(ok(actor(role)));
    const html = await renderLayout();
    expect(html).not.toContain("Nuova case");
    expect(html).not.toContain('href="/case-studies"');
    expect(html).not.toContain('href="/clients"');
    expect(html).toContain(label);
  });

  it("shows the cases to review after Case and the client count after Clienti", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    const html = await renderLayout();
    expect(html).toContain("2 da rivedere");
    expect(html).toMatch(/>3<\/span>/);
  });

  it("keeps the shell when the counts can't be read", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    list.mockResolvedValue(err({ code: "CASE_STUDY_READ_FAILED", message: "m" }));
    listClientSummaries.mockResolvedValue(err({ code: "CLIENT_READ_FAILED", message: "m" }));
    const html = await renderLayout();
    expect(html).toContain("<nav");
    expect(html).not.toContain("da rivedere");
  });

  it("renders only the no-actor message on UNAUTHENTICATED", async () => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "m" }));
    const html = await renderLayout();
    expect(html).toContain(NO_ACTOR);
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("content");
  });
});

describe("Root page", () => {
  it("redirects owner/designer to the Home", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    await expect(Root()).rejects.toThrow("REDIRECT /home");
  });

  it("renders the no-actor message on UNAUTHENTICATED", async () => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "m" }));
    expect(renderToStaticMarkup(await Root())).toContain(NO_ACTOR);
  });
});

describe("CaseStudiesPage", () => {
  it("redirects account/sales/social to /library", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    await expect(CaseStudiesPage()).rejects.toThrow("REDIRECT /library");
  });
});
