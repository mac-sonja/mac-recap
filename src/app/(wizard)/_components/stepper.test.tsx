import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StepDots, Stepper } from "./stepper";

const segments = (html: string) => [...html.matchAll(/<li data-step="(\d)"( aria-current="step")? class="([^"]*)">(.*?)<\/li>/g)];

describe("Stepper", () => {
  it("lists Materiale, Dettagli, Genera with no step active at step 0", () => {
    const html = renderToStaticMarkup(<Stepper current={0} />);
    expect(html).toContain('<ol aria-label="Passaggi"');
    const items = segments(html);
    expect(items.map((m) => m[4].replace(/<[^>]+>[^<]*<\/[^>]+>/g, ""))).toEqual(["Materiale", "Dettagli", "Genera"]);
    expect(items.every((m) => m[2] === undefined)).toBe(true);
    expect(items.every((m) => !m[3].includes("bg-surface-selected"))).toBe(true);
  });

  it("marks the current step selected and earlier steps done with a check", () => {
    const html = renderToStaticMarkup(<Stepper current={2} />);
    const [first, second, third] = segments(html);
    expect(first[2]).toBeUndefined();
    expect(first[3]).toContain("text-foreground");
    expect(first[4]).toContain("<svg");
    expect(first[4]).toContain('<span class="sr-only">, completato</span>');
    expect(second[2]).toBe(' aria-current="step"');
    expect(second[3]).toContain("bg-surface-selected");
    expect(second[4]).toContain('<span aria-hidden="true" class="font-mono text-xs">2</span>');
    expect(third[3]).toContain("text-foreground-muted");
    expect(third[3]).not.toMatch(/\btext-foreground\b(?!-)/);
  });
});

describe("StepDots", () => {
  it("widens only the current dot and none at step 0", () => {
    expect(renderToStaticMarkup(<StepDots current={0} />)).not.toContain("data-active");
    const html = renderToStaticMarkup(<StepDots current={3} />);
    expect(html.match(/data-active/g)).toHaveLength(1);
    expect(html).toMatch(/data-dot="3" data-active="" class="[^"]*\bw-5\b/);
  });
});
