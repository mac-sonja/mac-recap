import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/case-studies" }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current, useRouter: () => ({ push }) }));

const { Sidebar } = await import("./sidebar");

const render = (show: {
  showNewCaseStudy: boolean;
  showCaseStudies: boolean;
  showClients?: boolean;
  showLibrary?: boolean;
  showOrganization?: boolean;
  toReviewCount?: number;
  theme?: "system" | "light" | "dark";
}) =>
  renderToStaticMarkup(<Sidebar showClients={false} {...show} displayName="Dev Owner" roleLabel="Owner/designer" />);

afterEach(() => {
  pathname.current = "/case-studies";
});

describe("Sidebar", () => {
  it("shows the new-case action, Home, Case, the appearance switch and the profile", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    expect(html).toContain('aria-label="Navigazione principale"');
    expect(html).toContain("Nuova case history");
    expect(html).toContain('href="/home"');
    expect(html.match(/<a [^>]*aria-current="page"[^>]*>/)?.[0]).toContain('href="/case-studies"');
    expect(html).toContain('role="radiogroup" aria-label="Aspetto"');
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

  it("puts the search above Nuova case history, only with the case list", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    const search = html.indexOf('role="search"');
    expect(search).toBeGreaterThan(-1);
    expect(search).toBeLessThan(html.indexOf("Nuova case history"));
    expect(html).toContain('placeholder="Cerca…"');
    expect(render({ showNewCaseStudy: false, showCaseStudies: false })).not.toContain('role="search"');
  });

  it("has no Templates or Organizzazione entries, and offers Esci (Story 6.1)", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    expect(html).not.toMatch(/Template|Organizzazione|\/organization|\/templates|\/review/i);
    expect(html).toContain('aria-label="Esci"');
  });

  it("shows Organizzazione only when asked (admin), right under Clienti", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true, showClients: true, showOrganization: true });
    expect(html).toContain("Organizzazione");
    expect(html.indexOf('href="/organization"')).toBeGreaterThan(html.indexOf('href="/clients"'));
  });

  it("shows Libreria only when asked (account/sales/social)", () => {
    expect(render({ showNewCaseStudy: false, showCaseStudies: false, showLibrary: true })).toContain('href="/library"');
    expect(render({ showNewCaseStudy: true, showCaseStudies: true })).not.toContain('href="/library"');
  });

  it("shows the cases to review after Case only when there are some", () => {
    expect(render({ showNewCaseStudy: true, showCaseStudies: true, toReviewCount: 2 })).toContain("2 da approvare");
    expect(render({ showNewCaseStudy: true, showCaseStudies: true, toReviewCount: 0 })).not.toContain("da approvare");
  });

  it("shows no number after Clienti (owner, 2026-10-28)", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true, showClients: true, toReviewCount: 2 });
    const clients = html.match(/<a [^>]*href="\/clients"[^>]*>.*?<\/a>/)?.[0] ?? "";
    expect(clients).toContain("Clienti");
    expect(clients).not.toMatch(/tabular-nums|\d/);
    expect(html).toContain("2 da approvare");
  });

  it("marks Home active on /home", () => {
    pathname.current = "/home";
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    expect(html.match(/<a [^>]*aria-current="page"[^>]*>/)?.[0]).toContain('href="/home"');
  });

  it("checks the theme from the cookie", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true, theme: "dark" });
    expect(html).toMatch(/aria-checked="true"[^>]*aria-label="Scuro"/);
  });

  it("keeps labels for screen readers when collapsed to icons below 1280 px", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    expect(html.match(/sr-only xl:not-sr-only/g)?.length).toBe(3);
  });

  it("puts Clienti right after Case when allowed", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true, showClients: true });
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);
    // The first link is the collapsed search (a magnifier to the case list).
    expect(hrefs).toEqual(["/case-studies", "/case-studies/new", "/home", "/case-studies", "/clients"]);
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
    expect(html).not.toContain("Nuova case");
    expect(html).not.toContain('href="/case-studies"');
    expect(html).not.toContain('href="/home"');
    expect(html).not.toContain('href="/clients"');
    expect(html).not.toMatch(/ disabled=""|aria-disabled="true"/);
  });
});
