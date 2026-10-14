import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { CaseStudy } from "@/modules/case-study";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const get = vi.fn<(id: unknown) => Promise<Result<CaseStudy>>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", () => ({ get: (id: unknown) => get(id), YEAR_MIN: 1900, YEAR_MAX: 2100 }));
vi.mock("@/shared/i18n/format", () => ({ currentYear: () => 2031 }));
vi.mock("@/app/(tool)/case-studies/actions", () => ({ createCaseStudy: vi.fn() }));

const { default: NewCaseStudyPage } = await import("./page");

const ID = "aaaaaaaa-0000-4000-8000-000000000001";

const shell: ShellActor = {
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role: "owner_designer" },
  landing: "/case-studies",
};

const draft: CaseStudy = {
  id: ID,
  name: "Rebrand Lumen 2026",
  client: "Lumen",
  year: 2026,
  locale: "it",
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

const render = async (params: { caseId?: string | string[] } = {}) =>
  renderToStaticMarkup(await NewCaseStudyPage({ searchParams: Promise.resolve(params) }));

beforeEach(() => {
  requireSurface.mockReset();
  get.mockReset();
  requireSurface.mockResolvedValue(shell);
});

describe("NewCaseStudyPage", () => {
  it("guards on create case and shows step 0: eyebrow and title Nuovo case study, no step active", async () => {
    const html = await render();
    expect(requireSurface).toHaveBeenCalledWith("create case");
    expect(get).not.toHaveBeenCalled();
    expect(html).toMatch(/<h1 class="[^"]*">Nuovo case study<\/h1>/);
    expect(html).not.toContain('aria-current="step"');
    expect(html).toContain("Nome del case study");
    const year = html.match(/<input [^>]*name="year"[^>]*>/)?.[0] ?? "";
    expect(year).toContain('min="1900"');
    expect(year).toContain('max="2100"');
    expect(year).toContain('value="2031"');
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("<nav");
  });

  it("shows the larger-screen message below lg and hides the form there", async () => {
    const html = await render();
    expect(html).toMatch(/<p class="[^"]*\blg:hidden\b[^"]*">Questa pagina richiede uno schermo più grande\.<\/p>/);
    expect(html).toMatch(/<div class="hidden lg:block">.*<form/);
    // The title shows at every width.
    expect(html.match(/<h1 class="([^"]*)">/)?.[1]).not.toMatch(/\bhidden\b/);
  });

  it("renders nothing without a usable actor", async () => {
    requireSurface.mockResolvedValue(null);
    expect(await NewCaseStudyPage({ searchParams: Promise.resolve({ caseId: ID }) })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("reopens a case: top bar and title show it, ID in mono, Bozza badge, step 1 active", async () => {
    get.mockResolvedValue(ok(draft));
    const html = await render({ caseId: ID });
    expect(get).toHaveBeenCalledExactlyOnceWith(ID);
    expect(html).toMatch(/<h1 class="[^"]*">Rebrand Lumen 2026<\/h1>/);
    expect(html).toMatch(new RegExp(`<span class="[^"]*font-mono[^"]*"><span class="sr-only">ID </span>${ID}</span>`));
    expect(html).toContain('data-status="draft"');
    expect(html).toContain(">Bozza</span>");
    expect(html).toMatch(/<li data-step="1" aria-current="step"/);
    expect(html).toContain("Il caricamento del materiale non è ancora disponibile");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("PO-SECRET-42");
  });

  it("gives the inactive step 1 Avanti its reason: the placeholder line", async () => {
    get.mockResolvedValue(ok(draft));
    const html = await render({ caseId: ID });
    const note = html.match(/<p id="([^"]+)"[^>]*>Il caricamento del materiale/)?.[1];
    expect(note).toBeDefined();
    expect(html).toMatch(new RegExp(`<button type="button" aria-disabled="true" aria-describedby="${note}"[^>]*>Avanti</button>`));
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
