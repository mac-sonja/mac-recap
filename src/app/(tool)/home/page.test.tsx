import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { Actor, Role } from "@/modules/access";
import type { CaseStudy, ListScope } from "@/modules/case-study";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const list = vi.fn<(scope: ListScope) => Promise<Result<CaseStudy[]>>>();

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", () => ({ list: (scope: ListScope) => list(scope) }));

const { default: HomePage } = await import("./page");

const shell = (role: Role, displayName = "Sonja Castillo"): ShellActor => ({
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName, role } satisfies Actor,
  landing: "/home",
});

let n = 0;
const caseStudy = (over: Partial<CaseStudy>): CaseStudy => ({
  id: `aaaaaaaa-0000-4000-8000-00000000000${++n}`,
  code: `LUM-2026-0${n}`,
  number: n,
  name: `Case ${n}`,
  client: { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM" },
  year: 2026,
  locale: "it",
  businessLine: "branding",
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

const renderPage = async () => renderToStaticMarkup(await HomePage());

beforeEach(() => {
  n = 0;
  requireSurface.mockReset();
  list.mockReset();
});

describe("HomePage", () => {
  it("guards on list cases and greets by first name", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(ok([]));
    const html = await renderPage();
    expect(requireSurface).toHaveBeenCalledWith("list cases");
    expect(html).toContain("Ciao, Sonja");
  });

  it("counts cases to approve, being written and open drafts", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(
      ok([
        caseStudy({ status: "in_review" }),
        caseStudy({ status: "in_review" }),
        caseStudy({ status: "draft" }),
        caseStudy({ status: "approved" }),
        caseStudy({ status: "generating" }),
      ]),
    );
    const html = await renderPage();
    const stats = [...html.matchAll(/<li [^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span><span[^>]*>(\d+)<\/span><\/li>/g)].map((m) => [m[1], m[2]]);
    expect(stats).toEqual([
      ["Da approvare", "2"],
      ["In elaborazione", "1"],
      ["Bozze aperte", "1"],
    ]);
  });

  it("links drafts back to the wizard and leaves other cases unlinked", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    const draft = caseStudy({ status: "draft" });
    list.mockResolvedValue(ok([draft, caseStudy({ status: "in_review" })]));
    const html = await renderPage();
    expect(html).toContain(`href="/case-studies/new?caseId=${draft.id}"`);
    expect(html.match(/href="\/case-studies\/new\?caseId=/g)).toHaveLength(2); // in A metà strada and in Attività
  });

  it("tells each case's latest change in Attività, the name in bold", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(ok([caseStudy({ status: "in_review", name: "Showroom in tasca" }), caseStudy({ status: "approved", name: "Mattoni" })]));
    const html = await renderPage();
    expect(html).toContain("Attività");
    expect(html).toContain('La bozza di <strong class="font-semibold text-foreground-strong">Showroom in tasca</strong> è pronta da rivedere.');
    expect(html).toContain('<strong class="font-semibold text-foreground-strong">Mattoni</strong> è stata approvata.');
  });

  it("shows friendly empty lines with no cases", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(ok([]));
    const html = await renderPage();
    expect(html).toContain("Niente da approvare. Goditi il momento.");
    expect(html).toContain("Nessuna bozza in sospeso.");
    expect(html).not.toContain("Vedi tutte");
  });

  it("offers the start card only to who can create a case", async () => {
    list.mockResolvedValue(ok([]));
    requireSurface.mockResolvedValue(shell("owner_designer"));
    expect(await renderPage()).toContain("Inizia ora");
    requireSurface.mockResolvedValue(shell("admin"));
    await expect(renderPage()).rejects.toThrow("REDIRECT /home");
  });

  it("throws into the error boundary when the list fails", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(err({ code: "CASE_STUDY_READ_FAILED", message: "m" }));
    await expect(renderPage()).rejects.toThrow(/could not be listed/);
  });

  it("renders nothing without an actor", async () => {
    requireSurface.mockResolvedValue(null);
    expect(await HomePage()).toBeNull();
  });
});
