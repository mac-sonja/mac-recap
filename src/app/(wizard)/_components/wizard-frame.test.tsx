import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WizardFooter, WizardFrame } from "./wizard-frame";

const ID = "aaaaaaaa-0000-4000-8000-000000000001";

describe("WizardFrame", () => {
  it("has a top bar with a named back arrow to Case studies, and no sidebar", () => {
    const html = renderToStaticMarkup(
      <WizardFrame caseStudy={null} current={1}>
        <p>step</p>
      </WizardFrame>,
    );
    expect(html).toMatch(/<a [^>]*href="\/case-studies"[^>]*aria-label="Torna alle case history"|<a [^>]*aria-label="Torna alle case history"[^>]*href="\/case-studies"/);
    expect(html).toMatch(/<svg [^>]*aria-hidden="true"/);
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("<nav");
    // No case yet: no ID, no badge; eyebrow and title both read Nuova case history.
    expect(html).not.toContain("data-status");
    expect(html.match(/Nuova case history/g)).toHaveLength(2);
  });

  it("centres a 680px column from the top and lets it scroll under the fixed top bar", () => {
    const html = renderToStaticMarkup(
      <WizardFrame caseStudy={null} current={1}>
        <p>step</p>
      </WizardFrame>,
    );
    expect(html).toContain('<div class="flex h-dvh flex-col');
    expect(html).toContain('<header class="flex h-15 shrink-0');
    // `relative`: sr-only regions stay inside the scroll area instead of stretching the page.
    expect(html).toContain('<main class="relative flex flex-1 overflow-auto');
    // Scroll padding keeps a focused field clear of the sticky footer; no bottom padding
    // from 1024 px, so the footer sits flush on the viewport's bottom edge (owner, 2026-10-20).
    const main = html.match(/<main class="([^"]*)"/)?.[1].split(" ") ?? [];
    expect(main).toEqual(expect.arrayContaining(["scroll-pb-28", "pt-12", "lg:pb-0"]));
    expect(main).not.toContain("py-10");
    expect(html).toContain('<div class="mx-auto w-full max-w-[680px]">');
  });

  it("shows the case name, its code (not the uuid) in mono and its status badge", () => {
    const html = renderToStaticMarkup(
      <WizardFrame caseStudy={{ id: ID, code: "LUM-2026-01", name: "Rebrand Lumen 2026", status: "draft" }} current={1}>
        <p>step</p>
      </WizardFrame>,
    );
    expect(html).toContain(`<span class="shrink-0 font-mono text-xs text-foreground-muted"><span class="sr-only">ID </span>LUM-2026-01</span>`);
    expect(html).not.toContain(`>${ID}<`);
    // The badge sits right after the code (owner, 2026-10-21).
    expect(html).toMatch(/LUM-2026-01<\/span><span data-status="draft" class="[^"]*">Bozza<\/span>/);
    expect(html).toMatch(/<h1 [^>]*>Rebrand Lumen 2026<\/h1>/);
    expect(html).toMatch(/<p class="[^"]*\buppercase\b[^"]*">Nuova case history<\/p>/);
  });

  it("names the client after the eyebrow when the case has one", () => {
    const html = renderToStaticMarkup(
      <WizardFrame caseStudy={{ id: ID, code: "ORT-2026-02", name: "Nome progetto", status: "draft", clientName: "Ortica Bike" }} current={1}>
        <p>step</p>
      </WizardFrame>,
    );
    expect(html).toMatch(/<p class="[^"]*\buppercase\b[^"]*">Nuova case history · Ortica Bike<\/p>/);
  });

  it("forwards the case id and reachable to the stepper links", () => {
    const frame = (reachable: boolean) =>
      renderToStaticMarkup(
        <WizardFrame caseStudy={{ id: ID, code: "LUM-2026-01", name: "Rebrand Lumen 2026", status: "draft" }} current={1} reachable={reachable}>
          <p>step</p>
        </WizardFrame>,
      );
    expect(frame(true)).toContain(`href="/case-studies/new?caseId=${ID}&amp;step=2"`);
    expect(frame(false)).not.toContain("step=2");
  });

  it("forwards a per-step reachable to the stepper", () => {
    const html = renderToStaticMarkup(
      <WizardFrame
        caseStudy={{ id: ID, code: "LUM-2026-01", name: "Rebrand Lumen 2026", status: "draft" }}
        current={1}
        reachable={(step) => step === 2}
      >
        <p>step</p>
      </WizardFrame>,
    );
    expect(html).toContain(`href="/case-studies/new?caseId=${ID}&amp;step=2"`);
    expect(html).not.toContain("step=3");
  });

  it("shows the step content only from lg and the larger-screen message below it", () => {
    const html = renderToStaticMarkup(
      <WizardFrame caseStudy={null} current={1}>
        <p>step</p>
      </WizardFrame>,
    );
    expect(html).toContain('lg:hidden">Questa pagina dà il meglio su uno schermo più grande.</p>');
    expect(html).toMatch(/<div class="hidden lg:block"><div class="mb-10"><ol aria-label="Passaggi".*<p>step<\/p><\/div>/);
  });
});

describe("WizardFrame actions", () => {
  it("puts the actions at the top bar's right end, hidden below 1024px, and nothing without them", () => {
    const html = renderToStaticMarkup(
      <WizardFrame caseStudy={null} current={1} actions={<button type="button">act</button>}>
        x
      </WizardFrame>,
    );
    expect(html).toMatch(/<header [^>]*>.*<div class="ml-auto hidden shrink-0 items-center gap-2 lg:flex"><button type="button">act<\/button><\/div><\/header>/);
    expect(renderToStaticMarkup(<WizardFrame caseStudy={null} current={1}>x</WizardFrame>)).not.toContain("ml-auto");
  });
});

describe("WizardFooter", () => {
  it("puts an optional note on the left and the action on the right under a divider, no step dots", () => {
    const html = renderToStaticMarkup(<WizardFooter start="note" action={<button type="button">go</button>} />);
    expect(html).toMatch(/<div data-wizard-footer="" class="[^"]*\bflex items-center justify-between\b[^"]*\bborder-t\b[^"]*"/);
    expect(html).toContain('<div class="shrink-0"><button type="button">go</button></div>');
    expect(html).toContain(">note</div>");
    expect(html).not.toContain("data-dot");
  });

  it("stays at the bottom of the scrolling column with a solid background and a top border (Story 2.18)", () => {
    const html = renderToStaticMarkup(<WizardFooter action={<button type="button">go</button>} />);
    const classes = html.match(/<div data-wizard-footer="" class="([^"]*)"/)?.[1].split(" ") ?? [];
    expect(classes).toEqual(expect.arrayContaining(["sticky", "bottom-0", "z-10", "bg-surface", "border-t", "pt-4", "pb-6"]));
    // Solid, not frosted: cards scrolling under it must not show through (owner, 2026-10-21).
    expect(classes.some((c) => c.startsWith("backdrop-") || c.startsWith("bg-surface/"))).toBe(false);
    expect(classes).not.toContain("fixed");
    // Flush on the viewport's bottom edge: no filler shadow below it (owner, 2026-10-20).
    expect(classes.some((c) => c.startsWith("shadow"))).toBe(false);
    // Note, then action: the DOM order (and so the focus order) is unchanged.
    expect(html).toMatch(/^<div data-wizard-footer=""[^>]*><div class="font-label[^"]*"><\/div><div class="shrink-0"><button/);
  });

  it("sits inside the wizard column, so it lines up with it and is hidden below 1024px with the content", () => {
    const html = renderToStaticMarkup(
      <WizardFrame caseStudy={null} current={1}>
        <WizardFooter action={<button type="button">go</button>} />
      </WizardFrame>,
    );
    expect(html).toMatch(/<div class="mx-auto w-full max-w-\[680px\]">.*<div class="hidden lg:block">.*<div data-wizard-footer=""/);
  });
});
