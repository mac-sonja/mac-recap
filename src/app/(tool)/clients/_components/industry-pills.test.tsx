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

  it("uses the larger pill when editable (Story 2.18): 40px tall, 14px text, about 8px apart; the read-only list stays small", () => {
    const html = renderToStaticMarkup(<IndustryPills options={OPTIONS} selected={[]} onToggle={() => undefined} />);
    const classes = html.match(/<button [^>]*class="([^"]*)"/)?.[1].split(" ") ?? [];
    expect(classes).toEqual(expect.arrayContaining(["min-h-10", "px-4", "py-2", "text-sm"]));
    expect(classes).not.toContain("text-xs");
    expect(html).toMatch(/^<div role="group" class="flex flex-wrap gap-2"/);
    const readOnly = renderToStaticMarkup(<IndustryPills options={OPTIONS} selected={["lusso"]} label="Settore" />);
    // The read-only list on a client's page keeps the smaller pill.
    expect(readOnly).toContain('<ul aria-label="Settore" class="flex flex-wrap gap-1.5"><li class="inline-flex items-center rounded-full border border-border-strong px-2.5 py-1 font-label text-xs text-foreground">Lusso</li>');
  });

  it("read-only, lists only the selected industries in list order", () => {
    const html = renderToStaticMarkup(<IndustryPills options={OPTIONS} selected={["lusso", "energia"]} label="Settore" />);
    expect(html).not.toContain("<button");
    expect([...html.matchAll(/<li [^>]*>([^<]*)<\/li>/g)].map((m) => m[1])).toEqual(["Energia", "Lusso"]);
    expect(html).toContain('aria-label="Settore"');
  });
});
