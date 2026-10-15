import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { Actor, Role } from "@/modules/access";
import type { CaseStudy, ListScope } from "@/modules/case-study";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const list = vi.fn<(scope: ListScope) => Promise<Result<CaseStudy[]>>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", () => ({ list: (scope: ListScope) => list(scope) }));

const { default: CaseStudiesPage } = await import("./page");
const { default: Loading } = await import("./loading");

const shell = (role: Role, landing = "/case-studies"): ShellActor => ({
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role } satisfies Actor,
  landing,
});

const caseStudy = (over: Partial<CaseStudy>): CaseStudy => ({
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  name: "Rebrand",
  client: "Acme",
  year: 2026,
  locale: "it",
  status: "draft",
  projectOrderRef: null,
  headRevisionId: null,
  approvedRevisionId: null,
  headVersion: 0,
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-01T10:00:00+00:00",
  updatedAt: "2026-10-13T07:05:00.123456+00:00",
  deletedAt: null,
  ...over,
});

const renderPage = async () => renderToStaticMarkup(await CaseStudiesPage());

beforeEach(() => {
  requireSurface.mockReset();
  list.mockReset();
});

describe("CaseStudiesPage", () => {
  it("lists every status for owner/designer and shows Updated in Europe/Rome", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(ok([caseStudy({})]));
    const html = await renderPage();
    expect(requireSurface).toHaveBeenCalledWith("list cases");
    expect(list).toHaveBeenCalledExactlyOnceWith({});
    expect(html).toContain("<h1");
    expect(html).toContain("Elenco delle case history");
    expect(html).toContain("Rebrand");
    expect(html).toContain("13/10/2026, 09:05");
  });

  it("queries approved cases only for account/sales/social", async () => {
    requireSurface.mockResolvedValue(shell("account_sales_social", "/library"));
    list.mockResolvedValue(ok([caseStudy({ status: "approved" })]));
    await renderPage();
    expect(list).toHaveBeenCalledExactlyOnceWith({ status: "approved" });
  });

  it("queries nothing for a role the policy grants no list scope", async () => {
    requireSurface.mockResolvedValue(shell("admin", "/users"));
    await expect(CaseStudiesPage()).rejects.toThrow("REDIRECT /users");
    expect(list).not.toHaveBeenCalled();
  });

  it("renders nothing and queries nothing without a usable actor", async () => {
    requireSurface.mockResolvedValue(null);
    expect(await CaseStudiesPage()).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it("shows the empty state with Nuova case history for owner/designer", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(ok([]));
    const html = await renderPage();
    expect(html).toContain("Ancora nessuna case history.");
    expect(html).toContain('href="/case-studies/new"');
  });

  it("fails into the error boundary when the list fails: no partial table", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "down" }));
    await expect(CaseStudiesPage()).rejects.toThrow(/CASE_STUDY_LOOKUP_FAILED/);
  });
});

describe("Loading", () => {
  it("shows skeleton rows hidden from screen readers and announces loading", () => {
    const html = renderToStaticMarkup(<Loading />);
    expect(html.match(/data-skeleton-row/g)).toHaveLength(6);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<p role="status" class="sr-only">Caricamento…</p>');
    // Pulses only without reduced motion.
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).not.toMatch(/(^|[\s"])animate-pulse/);
  });
});
