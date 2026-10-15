import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/case-studies" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const { Sidebar } = await import("./sidebar");

const render = (show: { showNewCaseStudy: boolean; showCaseStudies: boolean; showClients?: boolean }) =>
  renderToStaticMarkup(<Sidebar showClients={false} {...show} displayName="Dev Owner" roleLabel="Owner/designer" />);

afterEach(() => {
  pathname.current = "/case-studies";
});

describe("Sidebar", () => {
  it("shows the new-case-study action, Case studies and the user menu", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    expect(html).toContain('aria-label="Navigazione principale"');
    expect(html).toContain("Nuova case history");
    expect(html.match(/<a [^>]*aria-current="page"[^>]*>/)?.[0]).toContain('href="/case-studies"');
    expect(html).toContain("Account");
    expect(html).toContain("Dev Owner");
    expect(html).toContain("Owner/designer");
  });

  it("shows the MAC wordmark in currentColor, named after the app", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    const svg = html.match(/<svg [^>]*>/)?.[0] ?? "";
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="MAC Recap"');
    expect(svg).toContain('fill="currentColor"');
    expect(html).not.toContain(">MAC Recap<");
  });

  it("marks the active entry with surface-selected and readable text", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    const active = html.match(/<a [^>]*aria-current="page"[^>]*>/)?.[0] ?? "";
    expect(active).toContain("bg-surface-selected");
    expect(active).toContain("text-foreground");
  });

  it("has no To review, Templates, Users or sign-out entries", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    expect(html).not.toMatch(/Da rivedere|Template|Utenti|Esci|\/users|\/templates|\/review/i);
  });

  it("keeps labels for screen readers when collapsed to icons below 1280 px", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    expect(html.match(/sr-only xl:not-sr-only/g)?.length).toBe(3);
  });

  it("puts Clienti right after Case history when allowed", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true, showClients: true });
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/case-studies/new", "/case-studies", "/clients"]);
    expect(html).toContain("Clienti");
    expect(html.match(/sr-only xl:not-sr-only/g)?.length).toBe(4);
  });

  it.each(["/clients", "/clients/cccccccc-0000-4000-8000-000000000001"])("marks Clienti active on %s", (path) => {
    pathname.current = path;
    const html = render({ showNewCaseStudy: true, showCaseStudies: true, showClients: true });
    const active = [...html.matchAll(/<a [^>]*aria-current="page"[^>]*>/g)].map((m) => m[0]);
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('href="/clients"');
  });

  it("does not mark Clienti active on a lookalike path", () => {
    pathname.current = "/clientsx";
    const html = render({ showNewCaseStudy: true, showCaseStudies: true, showClients: true });
    expect(html).not.toContain('aria-current="page"');
  });

  it("omits items the policy denies instead of disabling them", () => {
    const html = render({ showNewCaseStudy: false, showCaseStudies: false });
    expect(html).not.toContain("Nuova case history");
    expect(html).not.toContain('href="/case-studies"');
    expect(html).not.toContain('href="/clients"');
    expect(html).not.toContain("disabled");
  });
});
