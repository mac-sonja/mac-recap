import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IndustryPills } from "./industry-pills";

const OPTIONS = ["interior_design", "energia", "risorse_umane", "lusso"] as const;

describe("IndustryPills", () => {
  it("is a labelled group of toggle buttons with the favourite toggle's pressed style", () => {
    const html = renderToStaticMarkup(
      <IndustryPills options={OPTIONS} selected={["lusso"]} onToggle={() => undefined} labelledBy="label" describedBy="hint" />,
    );
    expect(html).toMatch(/^<div role="group" aria-labelledby="label" aria-describedby="hint"/);
    const buttons = [...html.matchAll(/<button type="button" aria-pressed="(true|false)" class="([^"]*)">([^<]*)<\/button>/g)];
    expect(buttons.map((m) => [m[3], m[1]])).toEqual([
      ["Interior design", "false"],
      ["Energia", "false"],
      ["Risorse umane", "false"],
      ["Lusso", "true"],
    ]);
    expect(buttons[0][2]).toContain("rounded-full");
    expect(buttons[0][2]).toContain("aria-pressed:bg-accent/10");
  });

  it("read-only, lists only the selected industries in list order", () => {
    const html = renderToStaticMarkup(<IndustryPills options={OPTIONS} selected={["lusso", "energia"]} label="Settore" />);
    expect(html).not.toContain("<button");
    expect([...html.matchAll(/<li [^>]*>([^<]*)<\/li>/g)].map((m) => m[1])).toEqual(["Energia", "Lusso"]);
    expect(html).toContain('aria-label="Settore"');
  });
});
