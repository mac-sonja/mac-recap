import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WizardError from "./error";

describe("WizardError", () => {
  it("shows the Italian load-failed message and a link back to Case studies", () => {
    const html = renderToStaticMarkup(<WizardError />);
    expect(html).toContain('<p role="alert" class="max-w-prose font-body text-base text-foreground">Non è stato possibile aprire il case study. Riprova tra poco.</p>');
    expect(html).toMatch(/<a class="[^"]*" href="\/case-studies">Torna ai case study<\/a>/);
  });
});
