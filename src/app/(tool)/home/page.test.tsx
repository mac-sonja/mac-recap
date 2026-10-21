import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { Actor, Role } from "@/modules/access";
import type { CaseActivity, CaseStudy, ListScope } from "@/modules/case-study";
import { err, ok, type Result } from "@/shared/result";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const list = vi.fn<(scope: ListScope) => Promise<Result<CaseStudy[]>>>();
const listActivity = vi.fn<(scope: ListScope) => Promise<Result<CaseActivity[]>>>();

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", () => ({
  list: (scope: ListScope) => list(scope),
  listActivity: (scope: ListScope) => listActivity(scope),
}));

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
  businessLines: ["branding"],
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
  listActivity.mockReset();
  listActivity.mockResolvedValue(ok([]));
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
    expect(html.match(/href="\/case-studies\/new\?caseId=/g)).toHaveLength(1); // in A metà strada
  });

  const event = (over: Partial<CaseActivity>): CaseActivity => ({
    id: `eeeeeeee-0000-4000-8000-00000000000${++n}`,
    type: "case_created",
    at: "2026-10-13T07:05:00+00:00",
    data: {},
    actorName: "Giulia Riva",
    case: { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Showroom in tasca", code: "LUM-2026-01", status: "draft" },
    ...over,
  });

  it("reads the event log in the list scope and shows who did what, with an icon and the time", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(ok([caseStudy({})]));
    listActivity.mockResolvedValue(
      ok([
        event({ type: "transition", data: { event: "approve" }, actorName: "Paolo Greco", case: { id: "aaaaaaaa-0000-4000-8000-000000000009", name: "Mattoni", code: "LUM-2026-09", status: "approved" } }),
        event({ type: "asset_uploaded" }),
        event({ type: "asset_uploaded" }),
        event({ type: "case_created" }),
      ]),
    );
    const html = await renderPage();
    expect(listActivity).toHaveBeenCalledWith({});
    const activity = html.match(/<ul tabindex="0" aria-labelledby="home-activity" class="([^"]*)">(.*?)<\/ul>/);
    expect(activity?.[1]).toContain("overflow-y-auto");
    const text = [...(activity?.[2] ?? "").matchAll(/<li [^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<time[^>]*>.*?<\/time>/, "").replace(/<[^>]+>/g, ""));
    expect(text).toEqual([
      "Paolo Greco ha approvato Mattoni.",
      "Giulia Riva ha caricato 2 file in Showroom in tasca.",
      "Giulia Riva ha creato Showroom in tasca.",
    ]);
    expect(html).toContain('<strong class="font-semibold text-foreground-strong">Mattoni</strong>');
    // A draft's line opens its wizard; an approved case has no page yet.
    expect(activity?.[2].match(/href="\/case-studies\/new\?caseId=aaaaaaaa-0000-4000-8000-000000000001"/g)).toHaveLength(2);
    expect(activity?.[2].match(/<svg/g)).toHaveLength(3);
  });

  it("keeps the Dashboard when the log can't be read: Attività says so", async () => {
    requireSurface.mockResolvedValue(shell("owner_designer"));
    list.mockResolvedValue(ok([caseStudy({})]));
    listActivity.mockResolvedValue(err({ code: "CASE_ACTIVITY_LOOKUP_FAILED", message: "down" }));
    const html = await renderPage();
    expect(html).toContain("Non siamo riusciti a caricare le attività. Ricarica la pagina per riprovare.");
    expect(html).toContain("A metà strada");
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
