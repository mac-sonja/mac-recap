import { describe, expect, it as test } from "vitest";
import { fill, it, t } from "./it";

describe("Italian dictionary", () => {
  test("resolves dot-path keys", () => {
    expect(t("shell.nav.caseStudies")).toBe("Case study");
    expect(t("status.in_review")).toBe("Da approvare");
  });

  test("throws on a path that is not a string", () => {
    // @ts-expect-error -- not a leaf key
    expect(() => t("shell.nav")).toThrow(/Missing dictionary entry/);
  });

  test("uses no exclamation marks", () => {
    expect(JSON.stringify(it)).not.toContain("!");
  });
});

describe("fill", () => {
  test("inserts params into a dictionary template", () => {
    expect(fill(t("caseStudies.noResults"), { query: "Città" })).toBe("Nessun risultato per 'Città'.");
  });

  test("inserts values verbatim, including replacement patterns and braces", () => {
    expect(fill("a {query} b", { query: "$& $1 {query}" })).toBe("a $& $1 {query} b");
    expect(fill("{n} di 3", { n: 2 })).toBe("2 di 3");
  });

  test("leaves placeholders without a param untouched", () => {
    expect(fill("{query} {other}", { query: "x" })).toBe("x {other}");
  });
});

describe("case studies table copy", () => {
  test("has the approved strings", () => {
    expect(Object.values(it.caseStudies.table.columns)).toEqual(["ID", "Nome", "Cliente", "Anno", "Stato", "Aggiornato", "Link"]);
    expect(t("caseStudies.search.label")).toBe("Cerca nome, cliente o ID");
    expect(t("caseStudies.search.placeholder")).toBe("Cerca nome, cliente o ID");
    expect(t("caseStudies.clearSearch")).toBe("Cancella ricerca e filtri");
    expect(t("caseStudies.empty")).toBe("Ancora nessun case study. Inizia dal materiale di un progetto chiuso.");
    expect(t("caseStudies.narrowScreen")).toBe("Questa pagina richiede uno schermo più grande.");
    expect(t("caseStudies.table.caption")).toBe("Elenco dei case study");
    expect(t("caseStudies.loading")).toBe("Caricamento…");
  });
});
