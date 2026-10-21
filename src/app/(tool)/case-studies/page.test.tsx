import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { Actor, Role } from "@/modules/access";
import type { CaseStudy, ListScope } from "@/modules/case-study";
import { it as dict } from "@/shared/i18n/it";
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
  code: "LUM-2026-01",
  number: 1,
  name: "Rebrand",
  client: { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM" },
  year: 2026,
  locale: "it",
  businessLines: ["branding"],
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
afterEach(() => {
  vi.useRealTimers();
});

describe("CaseStudiesPage", () => {
  it("lists every status for owner/designer and shows Updated in Europe/Rome", async () => {
    // Same year as the case, so the date omits it.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T12:00:00+00:00"));
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(ok([caseStudy({})]));
    const html = await renderPage();
    expect(requireSurface).toHaveBeenCalledWith("list cases");
    expect(list).toHaveBeenCalledExactlyOnceWith({});
    expect(html).toMatch(new RegExp(`<h1[^>]*>${dict.caseStudies.heading}</h1>`));
    expect(html).toContain(dict.caseStudies.lead);
    expect(html).toContain(dict.caseStudies.table.caption);
    expect(html).toContain("Rebrand");
    // 07:05 UTC is 09:05 in Rome (CEST).
    expect(html).toContain("13 ott, 09:05</time>");
    // The ID column shows the code and the Client column the client's name; the uuid is only a key.
    expect(html).toMatch(/<td class="[^"]*font-mono[^"]*">LUM-2026-01<\/td>/);
    expect(html).toMatch(/<td class="[^"]*">Lumen Srl<\/td>/);
    expect(html).not.toMatch(/<td[^>]*>aaaaaaaa-0000-4000-8000-000000000001<\/td>/);
  });

  it("starts the search from ?q= (the sidebar search)", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(ok([caseStudy({})]));
    const html = renderToStaticMarkup(await CaseStudiesPage({ searchParams: Promise.resolve({ q: "lumen" }) }));
    expect(html).toMatch(/<input[^>]*type="search"[^>]*value="lumen"/);
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

  it("shows the empty state with its create call to action for owner/designer", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(ok([]));
    const html = await renderPage();
    expect(html).toContain(dict.caseStudies.empty);
    expect(html).toMatch(new RegExp(`<a [^>]*href="/case-studies/new"[^>]*>${dict.caseStudies.emptyAction}</a>`));
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
    expect(html).toContain(`<p role="status" class="sr-only">${dict.caseStudies.loading}</p>`);
    // Pulses only without reduced motion.
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).not.toMatch(/(^|[\s"])animate-pulse/);
  });
});
