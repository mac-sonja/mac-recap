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
    expect(fill(t("caseStudies.noResults"), { query: "Città" })).toBe("Nessuna case history per “Città”.");
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
    expect(Object.values(it.caseStudies.table.columns)).toEqual(["ID", "Case history", "Cliente", "Anno", "Stato", "Servizi", "Aggiornata", "Link", "Azioni"]);
    expect(fill(t("caseStudies.delete.title"), { name: "Rebrand" })).toBe("Eliminare Rebrand?");
    expect(t("caseStudies.delete.confirm")).toBe("Elimina");
    expect(t("caseStudies.delete.barButton")).toBe("Elimina bozza");
    expect(t("caseStudies.delete.word")).toBe("elimina");
    expect(t("caseStudies.search.label")).toBe("Cerca progetto o cliente");
    expect(t("caseStudies.search.placeholder")).toBe("Cerca progetto o cliente…");
    expect(t("caseStudies.filter.all")).toBe("Tutti");
    expect(Object.values(it.caseStudies.filter.statuses)).toEqual(["Bozza", "In elaborazione", "Da approvare", "Approvato"]);
    expect(fill(t("caseStudies.noResultsStatus"), { status: "Da approvare" })).toBe("Nessuna case history in “Da approvare”.");
    expect(fill(t("caseStudies.noResultsQueryStatus"), { query: "lum", status: "Da approvare" })).toBe("Nessuna case history per “lum” in “Da approvare”.");
    expect(t("caseStudies.clearSearch")).toBe("Azzera i filtri");
    expect(t("caseStudies.empty")).toBe(
      "Qui raccoglierai le storie dei vostri progetti. Parti dal materiale di un lavoro appena chiuso.",
    );
    expect(t("caseStudies.emptyAction")).toBe("Crea la prima");
    expect(t("caseStudies.narrowScreen")).toBe("Questa pagina dà il meglio su uno schermo più grande.");
    expect(t("caseStudies.table.caption")).toBe("Elenco delle case history");
    expect(t("caseStudies.loading")).toBe("Un attimo…");
  });
});

describe("clients copy", () => {
  test("has the approved strings", () => {
    expect(t("shell.nav.clients")).toBe("Clienti");
    expect(t("clients.heading")).toBe("Clienti");
    expect(Object.values(it.clients.table.columns)).toEqual(["ID", "Cliente", "Case history"]);
    expect(t("clients.add")).toBe("Aggiungi cliente");
    expect(t("clients.edit")).toBe("Modifica");
    expect(t("clients.empty")).toBe("Ancora nessun cliente. Aggiungi il primo e partiamo.");
    expect(t("clients.errors.nameTaken")).toBe("C’è già un cliente con questo nome.");
    expect(t("clients.detail.industries")).toBe("Settore");
    expect(t("clients.detail.noCases")).toBe("Nessuna case history per questo cliente, per ora.");
  });
});

describe("client panel copy", () => {
  test("has the approved strings", () => {
    expect(t("clientPanel.addTitle")).toBe("Nuovo cliente");
    expect(t("clientPanel.editTitle")).toBe("Modifica cliente");
    expect(t("clientPanel.addNote")).toBe("Il codice si genera da solo e non cambia mai.");
    expect(fill(t("clientPanel.editNote"), { code: "LUM" })).toBe(
      "Il codice LUM resta lo stesso. Quello che cambi qui si aggiorna in tutte le sue case history.",
    );
    expect(Object.values(it.clientPanel.sections)).toEqual(["Dettagli", "Logo e immagini"]);
    expect(Object.values(it.clientPanel.details.labels)).toEqual([
      "Nome",
      "Settore",
      "Descrizione",
      "Logo",
      "Immagini",
      "Contesto",
      "Soluzione",
    ]);
    expect(t("clientPanel.details.results.title")).toBe("Risultati");
    expect(t("clientPanel.details.results.hint")).toBe("Fino a 3 numeri. Facoltativo.");
    expect(it.clientPanel.details.results.placeholders).toEqual([
      { label: "Candidature ricevute", value: "+180%" },
      { label: "Visualizzazioni video", value: "2,4M" },
      { label: "Follower su LinkedIn", value: "+35%" },
    ]);
    expect(t("clientPanel.details.results.halfRow")).toBe("Scrivi sia cosa misuri sia il numero.");
    expect(t("clientPanel.details.testimonial.title")).toBe("Testimonial");
    expect(t("clientPanel.details.testimonial.hint")).toBe("Facoltativo.");
    expect(t("clientPanel.details.testimonial.quotePlaceholder")).toBe("Una frase del cliente, tra virgolette nel suo stile");
    expect(t("clientPanel.details.testimonial.authorPlaceholder")).toBe("Nome Cognome, ruolo");
    expect(t("clientPanel.details.testimonial.missingQuote")).toBe("Manca la frase.");
    expect(t("clientPanel.details.sector.placeholder")).toBe("Per esempio: Nautica");
    expect(t("clientPanel.details.sector.add")).toBe("Aggiungi");
    expect(t("clientPanel.details.sector.addFailed")).toBe("Non siamo riusciti ad aggiungerlo. Riprova.");
    expect(JSON.stringify(it)).not.toContain("Puoi sceglierne più di uno.");
    expect(t("clientPanel.details.namePlaceholder")).toBe("Ragione sociale o nome del brand");
    expect(t("clientPanel.details.descriptionHint")).toBe("Da qui l’AI scrive la bozza dell’intro.");
    expect(t("clientPanel.details.logoReplaceHint")).toBe("Se lo sostituisci, il vecchio logo viene eliminato.");
    expect(Object.values(it.clientPanel.details.placeholders).every((line) => line.length > 0 && !line.includes("\n"))).toBe(true);
    expect(fill(t("clientPanel.images.counter"), { n: 2, max: 3 })).toBe("2 di 3");
    expect(fill(t("clientPanel.images.hint"), { min: 2, max: 3, px: 1600, types: "PNG, JPEG o WebP" })).toBe(
      "Da 2 a 3, almeno 1600 px sul lato corto. PNG, JPEG o WebP.",
    );
    expect(fill(t("clientPanel.images.errors.limit"), { max: 3 })).toBe("Al massimo 3 file.");
    expect(fill(t("clientPanel.images.errors.pixels"), { min: 1600, max: 8000 })).toContain("1600 px sul lato corto");
    expect(t("clientPanel.layout")).toBe("Modifica layout");
    expect(t("clientPanel.layoutReason")).toBe("Arriva con il configuratore");
    expect(fill(t("clientPanel.details.nextReason"), { fields: "Settore, Logo" })).toBe("Per andare avanti manca: Settore, Logo.");
  });
});

describe("wizard copy", () => {
  test("has the approved strings", () => {
    expect(t("wizard.eyebrow")).toBe("Nuova case history");
    expect(t("wizard.back")).toBe("Torna alle case history");
    expect(Object.values(it.wizard.steps)).toEqual(["Dettagli", "Materiale", "Genera"]);
    expect(Object.values(it.wizard.fields)).toEqual(["Titolo della case history", "Cliente", "Anno", "Servizi"]);
    expect(t("wizard.errors.businessLine")).toBe("Scegli un servizio.");
    expect(t("wizard.unsavedConfirm")).toBe("Quello che hai scritto non è ancora salvato. Vuoi uscire lo stesso?");
    expect(fill(t("wizard.nextReason"), { fields: "Titolo della case history, Servizi" })).toBe("Per andare avanti manca: Titolo della case history, Servizi.");
    expect("locales" in it.wizard).toBe(false);
    expect("locale" in it.wizard.errors).toBe(false);
    expect(t("wizard.requiredMark")).toBe("*");
    expect(fill(t("wizard.tabTitle"), { title: "Rebranding Lumen", app: "MAC Recap" })).toBe("Rebranding Lumen · MAC Recap");
    expect(fill(t("wizard.noClientMatch"), { link: t("wizard.noClientsLink") })).toBe("Nessun cliente con questo nome. Aggiungilo dalla pagina Clienti.");
    expect(t("wizard.next")).toBe("Avanti");
    expect(t("wizard.errors.name")).toBe("Dai un titolo alla case history.");
    expect(t("wizard.errors.client")).toBe("Scegli per quale cliente è.");
    expect(fill(t("wizard.clientOption"), { name: "Lumen Srl", code: "LUM" })).toBe("Lumen Srl (LUM)");
    expect(fill(t("wizard.noClients"), { link: t("wizard.noClientsLink") })).toBe("Non c’è ancora nessun cliente. Aggiungilo dalla pagina Clienti.");
    expect(t("wizard.clientPlaceholder")).toBe("Cerca o scegli un cliente");
    expect(t("wizard.errors.clientNotFound")).toMatch(/^Questo cliente non c’è più\. Ricarica la pagina/);
    expect(fill(t("wizard.errors.year"), { min: 1900, max: 2100 })).toBe("Scrivi un anno tra il 1900 e il 2100.");
    expect(t("wizard.errors.generic")).toMatch(/^Non siamo riusciti a creare la case history\./);
    expect(t("wizard.generatePlaceholder")).toBe("La generazione arriva nella prossima versione. Ci stiamo lavorando.");
    expect(t("wizard.stepper.goTo")).toBe("vai a");
    expect(t("wizard.loadFailed")).toBe("Non riusciamo ad aprire questa case history. Riprova tra qualche istante.");
  });

  test("names each missing required field", () => {
    expect(t("wizard.errors.name")).toContain("titolo");
    expect(t("wizard.errors.client")).toContain("cliente");
  });
});

describe("business line copy", () => {
  test("has the owner's labels in display order", () => {
    expect(Object.keys(it.businessLines)).toEqual(["branding", "social_media", "video", "web_design", "advertising", "eventi", "sviluppo"]);
    expect(Object.values(it.businessLines)).toEqual(["Branding", "Social media", "Video", "Web design", "Advertising", "Eventi", "Sviluppo"]);
  });
});

describe("material step copy", () => {
  const m = it.wizard.material;

  test("has the mockup strings", () => {
    expect(t("wizard.material.heading")).toBe("Porta qui il materiale del progetto");
    expect(t("wizard.material.drop.lead")).toBe("Trascina qui i file o");
    expect(t("wizard.material.drop.browse")).toBe("sfoglia");
    expect(fill(t("wizard.material.drop.hint"), { max: 20, size: 50 })).toBe("Fino a 20 file, massimo 50 MB l’uno.");
    expect(Object.values(m.drop.types)).toEqual(["PDF", "DOCX", "TXT / MD", "PNG / JPG / WEBP", "MP4 / MOV"]);
    expect(t("wizard.material.list.label")).toBe("Materiale");
    expect(fill(t("wizard.material.list.count"), { n: 4, max: 20 })).toBe("4 / 20 file");
    expect(t("wizard.material.list.favourite")).toBe("Preferito");
    expect(fill(t("wizard.material.list.remove"), { name: "a.pdf" })).toBe("Rimuovi a.pdf");
    expect(t("wizard.material.nextReason")).toBe("Aggiungi almeno un file per andare avanti.");
  });

  test("has the rejection and failure lines", () => {
    expect(fill(t("wizard.material.errors.tooLarge"), { size: 50 })).toBe("Supera i 50 MB, non l’abbiamo caricato.");
    expect(t("wizard.material.errors.type")).toBe(
      "Questo formato non lo leggiamo. Usa immagini, video, testi o PDF.",
    );
    expect(fill(t("wizard.material.errors.limit"), { max: 20 })).toBe("Hai raggiunto i 20 file. Questo non è stato caricato.");
    expect(t("wizard.material.errors.failed")).toBe("Caricamento non riuscito.");
    expect(t("wizard.material.errors.storage")).not.toBe("");
    expect(t("wizard.material.errors.rejected")).not.toBe("");
  });
});

describe("wizard details copy", () => {
  test("has the approved strings", () => {
    expect(t("wizard.details.heading")).toBe("Raccontaci il progetto");
    expect(it.wizard.details.labels).toEqual({ context: "Contesto", solution: "Soluzione", results: "Risultati" });
    expect(it.wizard.details.placeholders).toEqual({
      context: "Da dove siete partiti? Cosa serviva al cliente, e perché?",
      solution: "Cosa avete fatto, e con quale idea?",
      results: "Cosa è cambiato dopo? I numeri, se li hai, fanno la differenza.",
    });
    expect(fill(t("wizard.details.counter"), { n: 2, total: 2 })).toBe("2 di 2 compilati");
    expect(t("wizard.details.errors.saveFailed")).toBe("Non salvato. Modifica il testo per riprovare.");
    expect(fill(t("wizard.details.errors.tooLong"), { max: 5000 })).toBe("Al massimo 5000 caratteri.");
  });
});

describe("voice", () => {
  /** Every call to action people press: short, and no two the same on the shell. */
  const actions = [
    it.shell.nav.newCaseStudy,
    it.caseStudies.emptyAction,
    it.caseStudies.add,
    it.clients.add,
    it.clients.edit,
    it.clients.detail.newCase,
    it.home.start.action,
    it.home.seeAll,
    it.wizard.next,
    it.clientPanel.add,
    it.clientPanel.save,
    it.clientPanel.layout,
    it.clientPanel.delete.button,
    it.caseStudies.delete.barButton,
  ];

  test("calls to action are at most three words", () => {
    // owner wording, 2026-10-21: the client page's button keeps its four words.
    const allowedLonger = new Set<string>([it.clients.detail.newCase]);
    for (const label of actions) {
      if (allowedLonger.has(label)) continue;
      expect(label.split(/\s+/).length, label).toBeLessThanOrEqual(3);
    }
  });

  test("calls to action never repeat", () => {
    expect(new Set(actions).size).toBe(actions.length);
  });

  test("the Home greets by name", () => {
    expect(fill(t("home.greeting"), { name: "Sonja" })).toBe("Ciao, Sonja");
  });

  test("names the appearance choices", () => {
    expect([it.shell.theme.system, it.shell.theme.light, it.shell.theme.dark]).toEqual(["Automatico", "Chiaro", "Scuro"]);
  });
});
