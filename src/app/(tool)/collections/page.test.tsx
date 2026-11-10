import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/result";

const mocks = vi.hoisted(() => ({ requireSurface: vi.fn(), listCollections: vi.fn(), listClientSectors: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: mocks.requireSurface }));
vi.mock("./actions", () => ({ renameCollection: vi.fn(), deleteCollection: vi.fn() }));
vi.mock("@/modules/collection", () => ({ listCollections: mocks.listCollections }));
vi.mock("@/modules/case-study", async () => {
  const actual = await vi.importActual<typeof import("@/modules/case-study")>("@/modules/case-study");
  return { BUSINESS_LINES: actual.BUSINESS_LINES, listClientSectors: mocks.listClientSectors };
});

const { default: CollectionsPage } = await import("./page");

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireSurface.mockResolvedValue({ actor: { id: "u", email: "e", displayName: "G", role: "admin" }, landing: "/home" });
  mocks.listClientSectors.mockResolvedValue(ok([{ key: "moda", label: "Moda" }]));
});

const render = async () => renderToStaticMarkup(await CollectionsPage());

describe("CollectionsPage (Story 5.10a)", () => {
  it("lists the collections for every role, admin included, with their tags in display order", async () => {
    mocks.listCollections.mockResolvedValue(
      ok([
        {
          id: "c1",
          name: "Pitch moda",
          version: 2,
          tags: { businessLines: ["video", "branding"], industries: ["moda"] },
          caseCount: 3,
          createdBy: { id: "u", name: "Giulia" },
          createdAt: "2026-11-10T10:00:00Z",
          updatedAt: "2026-11-10T10:00:00Z",
        },
      ]),
    );
    const html = await render();
    expect(mocks.requireSurface).toHaveBeenCalledWith("manage collections");
    expect(html).toMatch(/<h1[^>]*>Raccolte<\/h1>/);
    expect(html).toContain('href="/collections/c1"');
    expect(html.indexOf(">Branding<")).toBeLessThan(html.indexOf(">Video<"));
    expect(html).toContain("3 case");
    expect(html).toContain("Giulia");
  });

  it("invites to the library when there is none", async () => {
    mocks.listCollections.mockResolvedValue(ok([]));
    const html = await render();
    expect(html).toContain('href="/library"');
    expect(html).not.toContain("<table");
  });

  it("throws into the error boundary when the list fails", async () => {
    mocks.listCollections.mockResolvedValue(err({ code: "COLLECTION_LOOKUP_FAILED", message: "m" }));
    await expect(CollectionsPage()).rejects.toThrow("COLLECTION_LOOKUP_FAILED");
  });
});
