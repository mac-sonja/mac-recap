import { describe, expect, it as test } from "vitest";
import { fill, it, t } from "./it";

describe("Italian dictionary", () => {
  test("resolves dot-path keys", () => {
    expect(t("shell.nav.caseStudies")).toBe("Case history");
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
    expect(t("caseStudies.search.label")).toBe("Cerca nome, cliente o codice");
    expect(t("caseStudies.search.placeholder")).toBe("Cerca nome, cliente o codice");
    expect(t("caseStudies.clearSearch")).toBe("Cancella ricerca e filtri");
    expect(t("caseStudies.empty")).toBe("Ancora nessuna case history. Inizia dal materiale di un progetto chiuso.");
    expect(t("caseStudies.narrowScreen")).toBe("Questa pagina richiede uno schermo più grande.");
    expect(t("caseStudies.table.caption")).toBe("Elenco delle case history");
    expect(t("caseStudies.loading")).toBe("Caricamento…");
  });
});

describe("clients copy", () => {
  test("has the approved strings", () => {
    expect(t("shell.nav.clients")).toBe("Clienti");
    expect(t("clients.heading")).toBe("Clienti");
    expect(Object.values(it.clients.table.columns)).toEqual(["Codice", "Nome", "Case history"]);
    expect(t("clients.add")).toBe("Aggiungi cliente");
    expect(t("clients.edit")).toBe("Modifica cliente");
    expect(t("clients.empty")).toBe("Nessun cliente. Aggiungi il primo.");
    expect(t("clients.errors.nameTaken")).toBe("Esiste già un cliente con questo nome.");
    expect(fill(t("clients.dialog.editDescription"), { code: "LUM" })).toBe(
      "Il codice LUM non cambia. Le modifiche si vedono in tutte le sue case history.",
    );
    expect(t("clients.dialog.sectorLabel")).toBe("Settore");
    expect(t("clients.dialog.descriptionLabel")).toBe("Descrizione");
    expect(t("clients.dialog.logoRemove")).toBe("Rimuovi");
    expect(t("clients.detail.noCases")).toBe("Nessuna case history per questo cliente.");
  });
});

describe("wizard copy", () => {
  test("has the approved strings", () => {
    expect(t("wizard.eyebrow")).toBe("Nuova case history");
    expect(t("wizard.back")).toBe("Torna alle case history");
    expect(Object.values(it.wizard.steps)).toEqual(["Materiale", "Dettagli", "Genera"]);
    expect(Object.values(it.wizard.fields)).toEqual(["Nome della case history", "Cliente", "Anno", "Lingua del testo"]);
    expect(it.wizard.locales).toEqual({ it: "Italiano", en: "English" });
    expect(t("wizard.next")).toBe("Avanti");
    expect(t("wizard.errors.name")).toBe("Inserisci il nome della case history.");
    expect(t("wizard.errors.client")).toBe("Scegli il cliente.");
    expect(fill(t("wizard.clientOption"), { name: "Lumen Srl", code: "LUM" })).toBe("Lumen Srl (LUM)");
    expect(fill(t("wizard.noClients"), { link: t("wizard.noClientsLink") })).toBe("Nessun cliente. Aggiungilo nella pagina Clienti.");
    expect(t("wizard.clientPlaceholder")).toBe("Scegli un cliente");
    expect(t("wizard.errors.clientNotFound")).toMatch(/^Questo cliente non è più disponibile\. Ricarica la pagina/);
    expect(fill(t("wizard.errors.year"), { min: 1900, max: 2100 })).toBe("Inserisci un anno tra 1900 e 2100.");
    expect(t("wizard.errors.generic")).toMatch(/^Non è stato possibile creare la case history\./);
    expect(t("wizard.generatePlaceholder")).toBe("La generazione non è ancora disponibile in questa versione.");
    expect(t("wizard.stepper.goTo")).toBe("vai a");
    expect(t("wizard.loadFailed")).toBe("Non è stato possibile aprire la case history. Riprova tra poco.");
  });

  test("names each missing required field", () => {
    expect(t("wizard.errors.name")).toContain("nome");
    expect(t("wizard.errors.client")).toContain("cliente");
  });
});

describe("material step copy", () => {
  const m = it.wizard.material;

  test("has the mockup strings", () => {
    expect(t("wizard.material.heading")).toBe("Aggiungi il materiale del progetto");
    expect(t("wizard.material.drop.lead")).toBe("Trascina qui i file o");
    expect(t("wizard.material.drop.browse")).toBe("sfoglia");
    expect(fill(t("wizard.material.drop.hint"), { max: 20, size: 50 })).toBe("Fino a 20 file, 50 MB ciascuno.");
    expect(Object.values(m.drop.types)).toEqual(["PDF", "DOCX", "TXT / MD", "PNG / JPG / WEBP", "MP4 / MOV"]);
    expect(t("wizard.material.list.label")).toBe("Materiale");
    expect(fill(t("wizard.material.list.count"), { n: 4, max: 20 })).toBe("4 / 20 file");
    expect(t("wizard.material.list.favourite")).toBe("Preferito");
    expect(fill(t("wizard.material.list.remove"), { name: "a.pdf" })).toBe("Rimuovi a.pdf");
    expect(t("wizard.material.nextReason")).toBe("Aggiungi almeno un file per continuare.");
  });

  test("has the rejection and failure lines", () => {
    expect(fill(t("wizard.material.errors.tooLarge"), { size: 50 })).toBe("Oltre 50 MB. Non caricato.");
    expect(t("wizard.material.errors.type")).toBe(
      "Questo tipo di file non è supportato. Usa immagini, video, testi o PDF.",
    );
    expect(fill(t("wizard.material.errors.limit"), { max: 20 })).toBe("Limite di 20 file raggiunto. Non caricato.");
    expect(t("wizard.material.errors.failed")).toBe("Caricamento non riuscito.");
    expect(t("wizard.material.errors.storage")).not.toBe("");
    expect(t("wizard.material.errors.rejected")).not.toBe("");
  });
});

describe("wizard details copy", () => {
  test("has the approved strings", () => {
    expect(t("wizard.details.heading")).toBe("Racconta il progetto");
    expect(it.wizard.details.labels).toEqual({ context: "Contesto", solution: "Soluzione", results: "Risultati" });
    expect(it.wizard.details.placeholders).toEqual({
      context: "Di cosa aveva bisogno il cliente, e perché?",
      solution: "Cosa avete fatto, e come?",
      results: "Cosa è cambiato? Indica i numeri dove li hai.",
    });
    expect(fill(t("wizard.details.counter"), { n: 2 })).toBe("2 di 3 compilati");
    expect(t("wizard.details.errors.saveFailed")).toBe("Non salvato. Riprova modificando il testo.");
    expect(fill(t("wizard.details.errors.tooLong"), { max: 5000 })).toBe("Massimo 5000 caratteri.");
  });
});
