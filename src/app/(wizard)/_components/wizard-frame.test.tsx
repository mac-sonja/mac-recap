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

  it("centres an 820px column both ways and lets it scroll under the fixed top bar", () => {
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
    expect(main).toEqual(expect.arrayContaining(["scroll-pb-28", "pt-10", "lg:pb-0"]));
    expect(main).not.toContain("py-10");
    expect(html).toContain('<div class="m-auto w-full max-w-[820px]">');
  });

  it("shows the case name, its code (not the uuid) in mono and its status badge", () => {
    const html = renderToStaticMarkup(
      <WizardFrame caseStudy={{ id: ID, code: "LUM-2026-01", name: "Rebrand Lumen 2026", status: "draft" }} current={1}>
        <p>step</p>
      </WizardFrame>,
    );
    expect(html).toContain(`<span class="shrink-0 font-mono text-xs text-foreground-muted"><span class="sr-only">ID </span>LUM-2026-01</span>`);
    expect(html).not.toContain(`>${ID}<`);
    expect(html).toMatch(/<span data-status="draft" class="[^"]*\bml-auto\b[^"]*">Bozza<\/span>/);
    expect(html).toMatch(/<h1 [^>]*>Rebrand Lumen 2026<\/h1>/);
    expect(html).toContain('<p class="mb-2 font-label text-[13px] font-medium text-foreground-muted">Nuova case history</p>');
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

describe("WizardFooter", () => {
  it("puts the dots in the centre under a divider and the action on the right", () => {
    const html = renderToStaticMarkup(<WizardFooter current={1} action={<button type="button">go</button>} />);
    expect(html).toMatch(/<div data-wizard-footer="" class="[^"]*\bgrid grid-cols-\[1fr_auto_1fr\] items-center border-t\b[^"]*"/);
    expect(html).toContain('<div aria-hidden="true" class="flex justify-center gap-1.5">');
    expect(html).toContain('<div class="justify-self-end"><button type="button">go</button></div>');
    expect(html.match(/data-active=""/g)).toHaveLength(1);
    expect(html).toMatch(/data-dot="1" data-active=""/);
  });

  it("stays at the bottom of the scrolling column with a translucent background and a top border (Story 2.18)", () => {
    const html = renderToStaticMarkup(<WizardFooter current={2} action={<button type="button">go</button>} />);
    const classes = html.match(/<div data-wizard-footer="" class="([^"]*)"/)?.[1].split(" ") ?? [];
    expect(classes).toEqual(expect.arrayContaining(["sticky", "bottom-0", "z-10", "bg-surface/85", "backdrop-blur-xl", "border-t", "pt-5", "pb-6"]));
    expect(classes).not.toContain("fixed");
    // Flush on the viewport's bottom edge: no filler shadow below it (owner, 2026-10-20).
    expect(classes.some((c) => c.startsWith("shadow"))).toBe(false);
    // Start, dots, action: the DOM order (and so the focus order) is unchanged.
    expect(html).toMatch(/^<div data-wizard-footer=""[^>]*><div class="font-label[^"]*"><\/div><div aria-hidden="true"[^>]*>.*<\/div><div class="justify-self-end"><button/);
  });

  it("sits inside the wizard column, so it lines up with it and is hidden below 1024px with the content", () => {
    const html = renderToStaticMarkup(
      <WizardFrame caseStudy={null} current={1}>
        <WizardFooter current={1} action={<button type="button">go</button>} />
      </WizardFrame>,
    );
    expect(html).toMatch(/<div class="m-auto w-full max-w-\[820px\]">.*<div class="hidden lg:block">.*<div data-wizard-footer=""/);
  });
});
