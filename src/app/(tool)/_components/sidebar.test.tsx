import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/case-studies" }));

const { Sidebar } = await import("./sidebar");

const render = (show: { showNewCaseStudy: boolean; showCaseStudies: boolean }) =>
  renderToStaticMarkup(<Sidebar {...show} displayName="Dev Owner" roleLabel="Owner/designer" />);

describe("Sidebar", () => {
  it("shows the new-case-study action, Case studies and the user menu", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    expect(html).toContain('aria-label="Navigazione principale"');
    expect(html).toContain("Nuovo case study");
    expect(html.match(/<a [^>]*aria-current="page"[^>]*>/)?.[0]).toContain('href="/case-studies"');
    expect(html).toContain("Menu utente");
    expect(html).toContain("Dev Owner");
    expect(html).toContain("Owner/designer");
  });

  it("has no To review, Templates, Users or sign-out entries", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    expect(html).not.toMatch(/Da rivedere|Template|Utenti|Esci|\/users|\/templates|\/review/i);
  });

  it("keeps labels for screen readers when collapsed to icons below 1280 px", () => {
    const html = render({ showNewCaseStudy: true, showCaseStudies: true });
    expect(html.match(/sr-only xl:not-sr-only/g)?.length).toBe(3);
  });

  it("omits items the policy denies instead of disabling them", () => {
    const html = render({ showNewCaseStudy: false, showCaseStudies: false });
    expect(html).not.toContain("Nuovo case study");
    expect(html).not.toContain('href="/case-studies"');
    expect(html).not.toContain("disabled");
  });
});
