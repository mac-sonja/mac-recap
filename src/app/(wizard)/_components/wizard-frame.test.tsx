import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WizardFooter, WizardFrame } from "./wizard-frame";

const ID = "aaaaaaaa-0000-4000-8000-000000000001";

describe("WizardFrame", () => {
  it("has a top bar with a named back arrow to Case studies, and no sidebar", () => {
    const html = renderToStaticMarkup(
      <WizardFrame caseStudy={null} current={0}>
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
      <WizardFrame caseStudy={null} current={0}>
        <p>step</p>
      </WizardFrame>,
    );
    expect(html).toContain('<div class="flex h-dvh flex-col');
    expect(html).toContain('<header class="flex h-15 shrink-0');
    expect(html).toContain('<main class="flex flex-1 overflow-auto');
    expect(html).toContain('<div class="m-auto w-full max-w-[820px]">');
  });

  it("shows the case name, its ID in mono and its status badge", () => {
    const html = renderToStaticMarkup(
      <WizardFrame caseStudy={{ id: ID, name: "Rebrand Lumen 2026", status: "draft" }} current={1}>
        <p>step</p>
      </WizardFrame>,
    );
    expect(html).toContain(`<span class="shrink-0 font-mono text-xs text-foreground-muted"><span class="sr-only">ID </span>${ID}</span>`);
    expect(html).toMatch(/<span data-status="draft" class="[^"]*\bml-auto\b[^"]*">Bozza<\/span>/);
    expect(html).toMatch(/<h1 [^>]*>Rebrand Lumen 2026<\/h1>/);
    expect(html).toContain('<p class="mb-2 font-label text-xs text-foreground-muted">Nuova case history</p>');
  });

  it("forwards the case id and reachable to the stepper links", () => {
    const frame = (reachable: boolean) =>
      renderToStaticMarkup(
        <WizardFrame caseStudy={{ id: ID, name: "Rebrand Lumen 2026", status: "draft" }} current={1} reachable={reachable}>
          <p>step</p>
        </WizardFrame>,
      );
    expect(frame(true)).toContain(`href="/case-studies/new?caseId=${ID}&amp;step=2"`);
    expect(frame(false)).not.toContain("step=2");
  });

  it("shows the step content only from lg and the larger-screen message below it", () => {
    const html = renderToStaticMarkup(
      <WizardFrame caseStudy={null} current={0}>
        <p>step</p>
      </WizardFrame>,
    );
    expect(html).toContain('lg:hidden">Questa pagina richiede uno schermo più grande.</p>');
    expect(html).toMatch(/<div class="hidden lg:block"><div class="mb-10"><ol aria-label="Passaggi".*<p>step<\/p><\/div>/);
  });
});

describe("WizardFooter", () => {
  it("puts the dots in the centre under a divider and the action on the right", () => {
    const html = renderToStaticMarkup(<WizardFooter current={1} action={<button type="button">go</button>} />);
    expect(html).toContain('class="mt-8 grid grid-cols-[1fr_auto_1fr] items-center border-t pt-5"');
    expect(html).toContain('<div aria-hidden="true" class="flex justify-center gap-1.5">');
    expect(html).toContain('<div class="justify-self-end"><button type="button">go</button></div>');
    expect(html.match(/data-active=""/g)).toHaveLength(1);
    expect(html).toMatch(/data-dot="1" data-active=""/);
  });
});
