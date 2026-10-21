import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Stepper } from "./stepper";

const segments = (html: string) => [...html.matchAll(/<li data-step="(\d)"( aria-current="step")? class="([^"]*)">(.*?)<\/li>/g)];
const ID = "aaaaaaaa-0000-4000-8000-000000000001";
const href = (step: number) => `/case-studies/new?caseId=${ID}&amp;step=${step}`;
const isLink = (segment: RegExpMatchArray) => segment[4].startsWith("<a ");

describe("Stepper", () => {
  it("lists Materiale, Dettagli, Genera (material first); on a new case step 1 is current and nothing is a link", () => {
    const html = renderToStaticMarkup(<Stepper current={1} />);
    expect(html).toContain('<ol aria-label="Passaggi"');
    const items = segments(html);
    // Labels only: no step numbers (owner, 2026-10-21).
    expect(items.map((m) => m[4].replace(/<[^>]+>/g, ""))).toEqual([
      "Materiale",
      "Dettagli",
      "Genera",
    ]);
    expect(items.some(isLink)).toBe(false);
    expect(items[0][2]).toBe(' aria-current="step"');
    expect(items[0][3]).toContain("bg-surface-raised");
    expect(items[0][3]).toContain("shadow-control");
  });

  it("marks the current step selected and earlier steps done with a check", () => {
    const html = renderToStaticMarkup(<Stepper current={2} />);
    const [first, second, third] = segments(html);
    expect(first[2]).toBeUndefined();
    expect(first[3]).toContain("text-foreground");
    expect(first[4]).toContain("<svg");
    expect(first[4]).toContain('<span class="sr-only">, completato</span>');
    expect(second[2]).toBe(' aria-current="step"');
    expect(second[3]).toContain("bg-surface-raised");
    expect(second[3]).toContain("shadow-control");
    expect(second[4].replace(/<[^>]+>/g, "")).toBe("Dettagli");
    expect(third[3]).toContain("text-foreground-muted");
    expect(third[3]).not.toMatch(/\btext-foreground\b(?!-)/);
    // No case: nothing is a link.
    expect([first, second, third].some(isLink)).toBe(false);
  });

  it("on step 2 with files links Materiale and Genera, named with the step and its state; the current step is not a link", () => {
    const [first, second, third] = segments(renderToStaticMarkup(<Stepper current={2} caseId={ID} reachable />));
    expect(first[4]).toMatch(new RegExp(`^<a [^>]*href="${href(1).replace(/[?]/g, "\\?")}"`));
    expect(first[4]).toContain('<span class="sr-only">vai a </span>Materiale<span class="sr-only">, completato</span>');
    expect(isLink(second)).toBe(false);
    expect(second[2]).toBe(' aria-current="step"');
    expect(third[4]).toMatch(new RegExp(`^<a [^>]*href="${href(3).replace(/[?]/g, "\\?")}"`));
    expect(third[4]).toContain('<span class="sr-only">vai a </span>Genera');
  });

  it("on step 1 with nothing reachable leaves Dettagli and Genera as plain segments", () => {
    const items = segments(renderToStaticMarkup(<Stepper current={1} caseId={ID} reachable={false} />));
    expect(items.some(isLink)).toBe(false);
    expect(items[0][2]).toBe(' aria-current="step"');
  });

  it("asks a per-step reachable for each later step: Dettagli yes, Genera no", () => {
    const asked: number[] = [];
    const reachable = (step: 1 | 2 | 3) => {
      asked.push(step);
      return step === 2;
    };
    const [first, second, third] = segments(renderToStaticMarkup(<Stepper current={1} caseId={ID} reachable={reachable} />));
    expect(isLink(first)).toBe(false);
    expect(second[4]).toContain(`href="${href(2)}"`);
    expect(isLink(third)).toBe(false);
    expect(asked).toContain(2);
    expect(asked).toContain(3);
  });

  it("keeps done steps and Materiale links even when nothing later is reachable", () => {
    const [first, second] = segments(renderToStaticMarkup(<Stepper current={3} caseId={ID} reachable={false} />));
    expect(first[4]).toContain(`href="${href(1)}"`);
    expect(second[4]).toContain(`href="${href(2)}"`);
  });

  it("links Materiale from Dettagli when nothing else is reachable", () => {
    const [first, , third] = segments(renderToStaticMarkup(<Stepper current={2} caseId={ID} reachable={() => false} />));
    expect(first[4]).toContain(`href="${href(1)}"`);
    expect(isLink(third)).toBe(false);
  });
});
