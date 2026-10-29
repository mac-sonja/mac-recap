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
    expect(t("caseStudies.delete.approvedButton")).toBe("Elimina");
    expect(t("caseStudies.delete.approvedDescription")).toBe(
      "La case history approvata sparisce da ogni elenco, insieme al materiale caricato. Non si torna indietro.",
    );
    expect(t("caseStudies.delete.statusChanged")).toBe("Nel frattempo il suo stato è cambiato, quindi non si può eliminare.");
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
    expect(t("story.results.title")).toBe("Risultati");
    expect(t("story.results.hint")).toBe("Fino a 3 numeri. Facoltativo.");
    expect(it.story.results.placeholders).toEqual([
      { label: "Candidature ricevute", value: "+180%" },
      { label: "Visualizzazioni video", value: "2,4M" },
      { label: "Follower su LinkedIn", value: "+35%" },
    ]);
    expect(t("story.results.halfRow")).toBe("Scrivi sia cosa misuri sia il numero.");
    expect(t("story.testimonial.title")).toBe("Testimonial");
    expect(t("story.testimonial.hint")).toBe("Facoltativo.");
    expect(t("story.testimonial.quotePlaceholder")).toBe("Una frase del cliente, tra virgolette nel suo stile");
    expect(t("story.testimonial.authorPlaceholder")).toBe("Nome Cognome, ruolo");
    expect(t("story.testimonial.missingQuote")).toBe("Manca la frase.");
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
    expect(it.wizard.details.labels).toEqual({ context: "Contesto", solution: "Soluzione" });
    expect(it.wizard.details.placeholders).toEqual({
      context: "Da dove siete partiti? Cosa serviva al cliente, e perché?",
      solution: "Cosa avete fatto, e con quale idea?",
    });
    // Risultati and Testimonial share the client panel's copy (Story 2.21).
    expect(t("story.errors.saveFailed")).toBe("Non salvato. Modifica il testo per riprovare.");
    expect(fill(t("story.errors.tooLong"), { max: 20 })).toBe("Al massimo 20 caratteri.");
    expect(fill(t("wizard.details.counter"), { n: 2, total: 2 })).toBe("2 di 2 compilati");
    expect(t("wizard.details.errors.saveFailed")).toBe("Non salvato. Modifica il testo per riprovare.");
    expect(fill(t("wizard.details.errors.tooLong"), { max: 5000 })).toBe("Al massimo 5000 caratteri.");
  });
});

describe("wizard generate copy", () => {
  test("has the approved strings", () => {
    expect("generatePlaceholder" in it.wizard).toBe(false);
    expect(fill(t("wizard.generate.counter"), { n: 3, m: 1, total: 2 })).toBe("3 file, 1 di 2 dettagli compilati");
    expect(t("wizard.generate.action")).toBe("Genera");
    expect(t("wizard.generate.retry")).toBe("Riprova");
    expect(t("wizard.generate.noMaterial")).toBe("Aggiungi almeno un file per poter generare.");
    expect(t("wizard.generate.waiting.heading")).toBe("Stiamo scrivendo la case history");
    expect(t("wizard.generate.failed")).toMatch(/^L’ultima generazione non è andata a buon fine\./);
    expect(t("caseStudies.table.stillGenerating")).toBe("Ancora in elaborazione");
  });

  test("the new calls to action are at most three words", () => {
    for (const label of [it.wizard.generate.action, it.wizard.generate.retry]) {
      expect(label.split(/\s+/).length, label).toBeLessThanOrEqual(3);
    }
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
    it.caseStudies.delete.approvedButton,
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

describe("configurator copy", () => {
  test("has the approved strings", () => {
    expect(t("configurator.back")).toBe("Torna alle case history");
    expect(t("configurator.narrowScreen")).toBe("Il configuratore ha bisogno di uno schermo più grande.");
    expect([it.configurator.formats.presentazione_16_9, it.configurator.formats.carosello_1_1, it.configurator.formats.video_9_16]).toEqual([
      "Presentazione",
      "Carosello",
      "Video",
    ]);
    expect([t("configurator.saved"), t("configurator.undo"), t("configurator.redo"), t("configurator.approve")]).toEqual([
      "Salvato",
      "Annulla",
      "Ripeti",
      "Approva",
    ]);
    expect(t("configurator.soon")).toBe("Arriva presto");
    expect([t("configurator.saving"), t("configurator.retrying"), t("configurator.saveBanner")]).toEqual([
      "Salvataggio…",
      "Non salvato. Nuovo tentativo…",
      "Le modifiche non si salvano. Tieni aperta questa scheda.",
    ]);
    expect([t("configurator.undoHint"), t("configurator.redoHint")]).toEqual(["Annulla (⌘Z)", "Ripeti (⇧⌘Z)"]);
    expect(t("configurator.overflow")).toBe("Il testo non entra");
    expect(t("configurator.editSoon")).toBe("Questo testo si potrà modificare presto.");
    expect(fill(t("configurator.text.heading"), { format: "Carosello" })).toBe("Testo · Carosello");
    expect([t("configurator.text.style"), t("configurator.text.align"), t("configurator.text.colour"), t("configurator.text.columns")]).toEqual([
      "Stile",
      "Allinea",
      "Colore",
      "Colonne",
    ]);
    expect([t("configurator.text.alignLeft"), t("configurator.text.alignCentre"), t("configurator.text.alignRight")]).toEqual(["Sinistra", "Centro", "Destra"]);
    expect([t("configurator.text.transparent"), t("configurator.text.oneColumn"), t("configurator.text.twoColumns")]).toEqual([
      "Trasparente",
      "Una colonna",
      "Due colonne",
    ]);
    expect([t("configurator.group.heading"), t("configurator.group.top"), t("configurator.group.centre"), t("configurator.group.bottom")]).toEqual([
      "Allineamento nel blocco",
      "In alto",
      "Al centro",
      "In basso",
    ]);
    expect(t("configurator.group.splitOne")).toBe("Distanziati: il primo testo in alto, il resto in basso");
    expect(fill(t("configurator.group.splitMany"), { n: 2 })).toBe("Distanziati: i primi 2 testi in alto, il resto in basso");
    expect(fill(t("configurator.soonMessage"), { tool: "Layout" })).toBe("Layout arriva presto.");
    expect(t("configurator.trial.title")).toBe("Bozza di prova");
    expect(fill(t("configurator.canvas.pageLabel"), { n: 2, name: "La sfida" })).toBe("2 · La sfida");
    expect(t("configurator.canvas.move")).toBe("⠿ Sposta");
    expect(Object.values(it.configurator.sections)).toEqual(["Intro", "Output", "Risultati"]);
    expect([
      t("configurator.tools.layout"),
      t("configurator.tools.defaultPages"),
      t("configurator.tools.elements"),
      t("configurator.tools.background"),
      t("configurator.tools.deletePage"),
    ]).toEqual(["Layout", "Pagine di default", "Elementi", "Sfondo", "Elimina pagina"]);
    expect(Object.values(it.configurator.elements)).toEqual([
      "Blocco",
      "Testi",
      "Titolo",
      "Testo",
      "Numero",
      "Citazione",
      "Etichetta",
      "Immagine",
      "Video",
      "Animazione",
    ]);
    expect([t("configurator.tabs.pages"), t("configurator.tabs.media"), t("configurator.search.placeholder")]).toEqual(["Pagine", "Media", "Cerca"]);
    expect([t("configurator.panels.hideLeft"), t("configurator.panels.showLeft")]).toEqual([
      "Nascondi il pannello a sinistra",
      "Mostra il pannello a sinistra",
    ]);
  });

  test("has the Anteprima, Instagram and Animazione testi strings", () => {
    expect([t("configurator.preview.enter"), t("configurator.preview.leave")]).toEqual(["Anteprima", "Torna all’editor"]);
    expect([t("configurator.preview.previous"), t("configurator.preview.next")]).toEqual(["Pagina precedente", "Pagina successiva"]);
    expect(fill(t("configurator.preview.slide"), { i: 3, n: 7, name: "La sfida" })).toBe("3 di 7 · La sfida");
    expect(it.configurator.preview.instagram).toEqual({
      label: "Anteprima Instagram",
      off: "Nessuna",
      reel: "Reel",
      story: "Storia",
      account: "mac.creativetech",
      avatar: "mac",
      clock: "9:41",
      follow: "Segui",
      forYou: "Per te",
      friends: "Amici",
      message: "Invia messaggio…",
      time: "9 min",
    });
    expect(t("configurator.textAnimation")).toBe("Animazione testi");
  });
});

describe("case view copy", () => {
  test("has the approved strings", () => {
    expect(t("caseView.back")).toBe("Torna alle case history");
    expect(t("caseView.edit")).toBe("Modifica");
    expect(t("caseView.narrowScreen")).toBe("L’anteprima ha bisogno di uno schermo più grande.");
    expect(t("caseView.collections.heading")).toBe("Raccolte");
    expect(t("caseView.collections.empty")).toBe("Non è in nessuna raccolta.");
    expect(t("caseStudies.table.edit")).toBe("Modifica");
    expect(fill(t("caseStudies.table.editLabel"), { name: "Rebrand" })).toBe("Modifica Rebrand");
  });
});
