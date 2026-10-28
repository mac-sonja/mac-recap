import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UserMenu } from "./user-menu";

describe("UserMenu", () => {
  it("shows the initial, the name and the role", () => {
    const html = renderToStaticMarkup(<UserMenu displayName="sonja Castillo" roleLabel="Owner/designer" />);
    expect(html).toContain(">S</span>");
    expect(html).toContain("sonja Castillo");
    expect(html).toContain("Owner/designer");
  });

  it("keeps name and role for screen readers when the sidebar is collapsed", () => {
    const html = renderToStaticMarkup(<UserMenu displayName="Sonja" roleLabel="Owner/designer" />);
    expect(html).toContain("sr-only");
    expect(html).toContain("xl:not-sr-only");
  });

  it("offers Esci, which submits the sign-out action", () => {
    const html = renderToStaticMarkup(<UserMenu displayName="Sonja" roleLabel="Owner/designer" />);
    expect(html).toContain('aria-label="Esci"');
    expect(html).toContain('type="submit"');
  });
});
