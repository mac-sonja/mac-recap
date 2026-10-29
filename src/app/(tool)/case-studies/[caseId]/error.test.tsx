import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CaseViewError from "./error";

describe("CaseViewError", () => {
  it("shows the Italian load-failed message and a link back to Case studies, without its own <main>", () => {
    const html = renderToStaticMarkup(<CaseViewError />);
    expect(html).toContain('<p role="alert" class="max-w-prose font-body text-base text-foreground">Non riusciamo ad aprire questa case history. Riprova tra qualche istante.</p>');
    expect(html).toMatch(/<a class="[^"]*" href="\/case-studies">Torna alle case history<\/a>/);
    expect(html).not.toContain("<main");
    expect(html).not.toContain("h-dvh");
  });
});
